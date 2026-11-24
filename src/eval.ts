import { readFileSync } from "node:fs";
import { DEFAULT_INSTRUCTION } from "./config.js";
import { UsageError } from "./errors.js";
import { t, renderTable, type Lang, type MessageKey } from "./i18n.js";
import { mean, mrr, ndcgAtK, rankByScore } from "./metrics.js";
import type { OllamaClient } from "./ollama.js";
import { createLimiter } from "./queue.js";
import { scoreByEmbedding } from "./scoring/embedding.js";
import { scorePair } from "./scoring/logprobs.js";

export interface EvalQuery {
  query: string;
  docs: Array<{ text: string; rel: number }>;
}

export interface MethodResult {
  name: "original" | "embedding" | "naive" | "bridge";
  ndcg: number;
  mrr: number;
  ms: number;
}

export interface EvalReport {
  model: string;
  embedModel?: string;
  k: number;
  queries: number;
  docs: number;
  methods: MethodResult[];
}

/** Read and validate an eval file: [{ query, docs: [{ text, rel }] }]. */
export function parseEvalData(raw: unknown, source = "eval data"): EvalQuery[] {
  const fail = (key: MessageKey, vars: Record<string, string | number> = {}): never => {
    throw new UsageError(key, { source, ...vars });
  };
  if (!Array.isArray(raw) || raw.length === 0) return fail("error.evalNotArray");
  return raw.map((q: unknown, i: number): EvalQuery => {
    const rec = q as { query?: unknown; docs?: unknown };
    if (typeof rec?.query !== "string" || rec.query === "") return fail("error.evalQuery", { i });
    if (!Array.isArray(rec.docs) || rec.docs.length === 0) return fail("error.evalDocs", { i });
    const docs = rec.docs.map((d: unknown, j: number) => {
      const dd = d as { text?: unknown; rel?: unknown };
      if (typeof dd?.text !== "string" || typeof dd.rel !== "number" || !Number.isFinite(dd.rel) || dd.rel < 0) {
        return fail("error.evalDoc", { i, j });
      }
      return { text: dd.text, rel: dd.rel };
    });
    if (!docs.some((d) => d.rel > 0)) return fail("error.evalNoRel", { i });
    return { query: rec.query, docs };
  });
}

export function loadEvalFile(path: string): EvalQuery[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new UsageError("error.evalRead", { path });
  }
  try {
    return parseEvalData(JSON.parse(text), path);
  } catch (err) {
    if (err instanceof UsageError) throw err;
    throw new UsageError("error.evalJson", { path });
  }
}

export interface EvalOptions {
  client: OllamaClient;
  model: string;
  embedModel?: string;
  data: EvalQuery[];
  k: number;
  concurrency: number;
  instruction?: string;
}

export async function runEval(o: EvalOptions): Promise<EvalReport> {
  const instruction = o.instruction ?? DEFAULT_INSTRUCTION;
  const limiter = createLimiter(o.concurrency);
  const signal = AbortSignal.timeout(30 * 60_000);
  const ndcgs: Record<string, number[]> = { original: [], embedding: [], naive: [], bridge: [] };
  const mrrs: Record<string, number[]> = { original: [], embedding: [], naive: [], bridge: [] };
  let lpMs = 0;
  let embMs = 0;

  const record = (name: string, rels: number[]): void => {
    ndcgs[name]!.push(ndcgAtK(rels, o.k));
    mrrs[name]!.push(mrr(rels));
  };

  for (const q of o.data) {
    const rels = q.docs.map((d) => d.rel);
    const inOrder = (scores: number[]): number[] => rankByScore(scores).map((i) => rels[i]!);
    record("original", rels);

    const t0 = performance.now();
    const results = await Promise.all(q.docs.map((d) => limiter.run(() => scorePair(o.client, o.model, q.query, d.text, instruction, signal))));
    lpMs += performance.now() - t0;
    record("bridge", inOrder(results.map((r) => r.score)));
    record("naive", inOrder(results.map((r) => r.naive)));

    if (o.embedModel) {
      const t1 = performance.now();
      const s = await scoreByEmbedding(o.client, o.embedModel, q.query, q.docs.map((d) => d.text), signal);
      embMs += performance.now() - t1;
      record("embedding", inOrder(s));
    }
  }

  const make = (name: MethodResult["name"], ms: number): MethodResult => ({
    name,
    ndcg: round(mean(ndcgs[name]!)),
    mrr: round(mean(mrrs[name]!)),
    ms: Math.round(ms),
  });
  const methods = [make("original", 0)];
  if (o.embedModel) methods.push(make("embedding", embMs));
  methods.push(make("naive", lpMs), make("bridge", lpMs));
  return {
    model: o.model,
    ...(o.embedModel ? { embedModel: o.embedModel } : {}),
    k: o.k,
    queries: o.data.length,
    docs: o.data.reduce((s, q) => s + q.docs.length, 0),
    methods,
  };
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

export function renderEval(report: EvalReport, lang: Lang, mock: boolean): string {
  const lines: string[] = [];
  lines.push(t(lang, "eval.title", { model: report.model, k: report.k, queries: report.queries, docs: report.docs }));
  if (mock) lines.push(t(lang, "banner.mock"));
  lines.push("");
  const label: Record<MethodResult["name"], string> = {
    original: t(lang, "eval.m.original"),
    embedding: t(lang, "eval.m.embedding"),
    naive: t(lang, "eval.m.naive"),
    bridge: t(lang, "eval.m.bridge"),
  };
  const rows = report.methods.map((m) => [label[m.name], m.ndcg.toFixed(3), m.mrr.toFixed(3), String(m.ms)]);
  lines.push(renderTable([t(lang, "eval.col.method"), `nDCG@${report.k}`, "MRR", t(lang, "eval.col.ms")], rows));
  lines.push("");
  lines.push(t(lang, "eval.note.same"));
  lines.push(t(lang, mock ? "eval.note.mock" : "eval.note.real"));
  return lines.join("\n");
}
