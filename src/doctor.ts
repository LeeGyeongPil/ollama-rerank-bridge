import { DEFAULT_INSTRUCTION } from "./config.js";
import { LogprobsUnsupportedError, OllamaError, localize } from "./errors.js";
import { MIN_LOGPROBS_VERSION, versionAtLeast, type OllamaClient } from "./ollama.js";
import { scoreByEmbedding } from "./scoring/embedding.js";
import { scorePair, type PairResult } from "./scoring/logprobs.js";
import { t, type Lang, type MessageKey, renderTable } from "./i18n.js";

export type CheckStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

export interface Check {
  id: number;
  status: CheckStatus;
  /** Message key for the details and its variables. */
  detail: MessageKey;
  vars: Record<string, string | number>;
  /** The failure behind the details; its text is filled into `vars.error` in the screen language. */
  cause?: Error;
  /** Message key telling how to fix a FAIL/WARN. */
  fix?: MessageKey;
}

export interface DoctorOptions {
  client: OllamaClient;
  model: string;
  embedModel?: string;
  concurrency: number;
  timeoutMs: number;
  instruction?: string;
}

export interface DoctorReport {
  /** 0 ok, 2 a check failed, 3 Ollama unreachable. */
  exitCode: 0 | 2 | 3;
  unreachable?: string;
  /** The error behind `unreachable`, so the screen can show it in its own language. */
  unreachableCause?: Error;
  version?: string;
  nativeRerank?: boolean;
  checks: Check[];
}

// Obvious relevant / irrelevant pairs: one English, one Korean.
const PAIRS = [
  { query: "What is the capital of China?", good: "The capital of China is Beijing.", bad: "Bananas are rich in potassium and grow in warm climates." },
  { query: "대한민국의 수도는 어디인가요?", good: "대한민국의 수도는 서울이다.", bad: "바나나는 열대 지방에서 자라는 과일이다." },
];

const now = (): number => performance.now();

export async function runDoctor(o: DoctorOptions): Promise<DoctorReport> {
  const checks: Check[] = [];
  const instruction = o.instruction ?? DEFAULT_INSTRUCTION;
  const signal = (): AbortSignal => AbortSignal.timeout(Math.max(o.timeoutMs, 120_000));
  const skipFrom = (from: number): void => {
    for (let id = from; id <= 6; id++) checks.push({ id, status: "SKIP", detail: "doctor.skipped", vars: {} });
  };

  // 1. Ollama reachable and new enough.
  let version = "";
  try {
    version = await o.client.version(signal());
  } catch (err) {
    return unreachableReport(err, checks);
  }
  const nativeRerank = await o.client.hasNativeRerank(signal());
  const versionOk = versionAtLeast(version, MIN_LOGPROBS_VERSION);
  checks.push({
    id: 1,
    status: versionOk ? "PASS" : "FAIL",
    detail: "doctor.d.version",
    vars: { version, min: MIN_LOGPROBS_VERSION },
    ...(versionOk ? {} : { fix: "doctor.fix.version" as MessageKey }),
  });

  // 2. Model exists and which scoring method will be used.
  let method: "logprobs" | "embedding" = "logprobs";
  try {
    const info = await o.client.show(o.model, signal());
    method = info.capabilities.includes("embedding") && !info.capabilities.includes("completion") ? "embedding" : "logprobs";
    if (o.embedModel) await o.client.show(o.embedModel, signal());
    checks.push({
      id: 2,
      status: "PASS",
      detail: method === "embedding" ? "doctor.d.modelEmbedding" : "doctor.d.modelLogprobs",
      vars: { family: info.family || "?", caps: info.capabilities.join(",") || "-" },
    });
  } catch (err) {
    if (err instanceof OllamaError && err.kind === "unreachable") return unreachableReport(err, checks);
    checks.push({ id: 2, status: "FAIL", detail: "doctor.d.modelMissing", vars: { model: o.model }, fix: "doctor.fix.model" });
    skipFrom(3);
    return finish(checks, version, nativeRerank);
  }

  // Run the four timed pair calls (or one embedding call) once and reuse them for checks 3-6.
  const results: Array<{ pair: number; good: boolean; r: PairResult; ms: number }> = [];
  const goodBad: Array<[number, number]> = [];
  let callMs = 0;
  let logprobsError: Error | undefined;

  if (method === "logprobs") {
    try {
      for (let i = 0; i < PAIRS.length; i++) {
        const p = PAIRS[i]!;
        for (const good of [true, false]) {
          const t0 = now();
          const r = await scorePair(o.client, o.model, p.query, good ? p.good : p.bad, instruction, signal());
          results.push({ pair: i, good, r, ms: now() - t0 });
        }
      }
    } catch (err) {
      if (err instanceof OllamaError && err.kind === "unreachable") return unreachableReport(err, checks);
      logprobsError = err as Error;
    }
  }

  // 3. logprobs field present.
  if (method === "embedding") {
    checks.push({ id: 3, status: "SKIP", detail: "doctor.d.notNeededEmbedding", vars: {} });
  } else if (logprobsError instanceof LogprobsUnsupportedError) {
    checks.push({ id: 3, status: "FAIL", detail: "doctor.d.noLogprobs", vars: {}, fix: "doctor.fix.version" });
    for (const id of [4, 5, 6]) checks.push({ id, status: "SKIP", detail: "doctor.skipped", vars: {} });
    return finish(checks, version, nativeRerank);
  } else if (logprobsError) {
    checks.push({ id: 3, status: "FAIL", detail: "doctor.d.generateFailed", vars: {}, cause: logprobsError, fix: "doctor.fix.generate" });
    for (const id of [4, 5, 6]) checks.push({ id, status: "SKIP", detail: "doctor.skipped", vars: {} });
    return finish(checks, version, nativeRerank);
  } else {
    checks.push({ id: 3, status: "PASS", detail: "doctor.d.logprobsOk", vars: { first: results[0]?.r.firstToken ?? "" } });
  }

  // 4. Direction: the relevant document must outscore the irrelevant one in both languages.
  let scoreText = "";
  let directionOk = true;
  if (method === "logprobs") {
    for (let i = 0; i < PAIRS.length; i++) {
      const g = results.find((x) => x.pair === i && x.good)!.r.score;
      const b = results.find((x) => x.pair === i && !x.good)!.r.score;
      goodBad.push([g, b]);
    }
  } else {
    try {
      for (const p of PAIRS) {
        const t0 = now();
        const s = await scoreByEmbedding(o.client, o.embedModel ?? o.model, p.query, [p.good, p.bad], signal());
        callMs = Math.max(callMs, now() - t0);
        goodBad.push([s[0] ?? 0, s[1] ?? 0]);
      }
    } catch (err) {
      if (err instanceof OllamaError && err.kind === "unreachable") return unreachableReport(err, checks);
      checks.push({ id: 4, status: "FAIL", detail: "doctor.d.generateFailed", vars: {}, cause: err as Error, fix: "doctor.fix.generate" });
      skipFrom(5);
      return finish(checks, version, nativeRerank);
    }
  }
  directionOk = goodBad.every(([g, b]) => g > b);
  scoreText = goodBad.map(([g, b]) => `${g.toFixed(2)} > ${b.toFixed(2)}`).join(" | ");
  checks.push({
    id: 4,
    status: directionOk ? "PASS" : "FAIL",
    detail: "doctor.d.direction",
    vars: { scores: scoreText },
    ...(directionOk ? {} : { fix: "doctor.fix.direction" as MessageKey }),
  });

  // 5. yes/no tokens among the top-20 candidates (logprobs only).
  if (method === "embedding") {
    checks.push({ id: 5, status: "SKIP", detail: "doctor.d.notNeededEmbedding", vars: {} });
  } else {
    const neutral = results.filter((x) => x.r.neutral).length;
    const blind = results.filter((x) => x.r.naiveBlind).length;
    const variants = [...new Set(results.flatMap((x) => x.r.variants))].map((x) => JSON.stringify(x)).join(" ") || "-";
    if (neutral > 0) {
      checks.push({
        id: 5,
        status: "FAIL",
        detail: "doctor.d.noYesNo",
        vars: { n: neutral, total: results.length, first: results.find((x) => x.r.neutral)?.r.firstToken ?? "" },
        fix: "doctor.fix.yesno",
      });
    } else {
      checks.push({ id: 5, status: "PASS", detail: "doctor.d.yesNo", vars: { variants, blind, total: results.length } });
    }
  }

  // 6. Latency and the expected time for 20 documents.
  const perPair = method === "logprobs" ? results.reduce((s, x) => s + x.ms, 0) / Math.max(results.length, 1) : callMs;
  const docs = 20;
  const estMs = method === "logprobs" ? Math.ceil(docs / o.concurrency) * perPair : perPair;
  const slow = estMs > o.timeoutMs;
  checks.push({
    id: 6,
    status: slow ? "WARN" : "PASS",
    detail: "doctor.d.latency",
    vars: { ms: Math.round(perPair), docs, c: o.concurrency, est: (estMs / 1000).toFixed(1), timeout: Math.round(o.timeoutMs / 1000) },
    ...(slow ? { fix: "doctor.fix.slow" as MessageKey } : {}),
  });
  return finish(checks, version, nativeRerank);
}

function unreachableReport(err: unknown, checks: Check[]): DoctorReport {
  const cause = err instanceof Error ? err : new Error(String(err));
  return { exitCode: 3, unreachable: cause.message, unreachableCause: cause, checks };
}

/** Variables of a check, with the cause (if any) written in `lang`. */
export function checkVars(c: Check, lang: Lang): Record<string, string | number> {
  return c.cause ? { ...c.vars, error: localize(c.cause, lang) } : c.vars;
}

function finish(checks: Check[], version: string, nativeRerank: boolean): DoctorReport {
  return { exitCode: checks.some((c) => c.status === "FAIL") ? 2 : 0, version, nativeRerank, checks };
}

const CHECK_KEYS: MessageKey[] = [
  "doctor.check.1", "doctor.check.2", "doctor.check.3", "doctor.check.4", "doctor.check.5", "doctor.check.6",
];

/** Human-readable report in the chosen language. */
export function renderDoctor(report: DoctorReport, lang: Lang, ctx: { url: string; model: string; mock: boolean }): string {
  const lines: string[] = [];
  lines.push(t(lang, "doctor.title", { url: ctx.url, model: ctx.model }));
  if (ctx.mock) lines.push(t(lang, "banner.mock"));
  lines.push("");
  if (report.exitCode === 3) {
    lines.push(t(lang, "doctor.unreachable", { error: report.unreachableCause ? localize(report.unreachableCause, lang) : (report.unreachable ?? "") }));
    return lines.join("\n");
  }
  const rows = report.checks.map((c) => [String(c.id), t(lang, CHECK_KEYS[c.id - 1]!), c.status, t(lang, c.detail, checkVars(c, lang))]);
  lines.push(renderTable([t(lang, "doctor.col.n"), t(lang, "doctor.col.check"), t(lang, "doctor.col.result"), t(lang, "doctor.col.details")], rows));
  const fixes = report.checks.filter((c) => c.fix && c.status !== "PASS");
  if (fixes.length > 0) {
    lines.push("");
    const shown = new Set<string>();
    for (const c of fixes) {
      const text = t(lang, c.fix!, checkVars(c, lang));
      if (shown.has(text)) continue; // the same advice once is enough
      shown.add(text);
      lines.push(t(lang, "doctor.fixLine", { n: c.id, text }));
    }
  }
  if (report.nativeRerank) {
    lines.push("");
    lines.push(t(lang, "doctor.nativeRerank"));
  }
  lines.push("");
  const failed = report.checks.filter((c) => c.status === "FAIL").length;
  lines.push(failed === 0 ? t(lang, "doctor.summaryOk") : t(lang, "doctor.summaryFail", { n: failed }));
  return lines.join("\n");
}
