#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DEFAULT_INSTRUCTION, DEFAULTS, normalizeOllamaHost, parseAliases, parsePositiveInt, parseScoring, type ScorerConfig,
} from "./config.js";
import { checkVars, renderDoctor, runDoctor } from "./doctor.js";
import { loadEvalFile, renderEval, runEval } from "./eval.js";
import { UsageError, localize } from "./errors.js";
import { isLangValue, resolveLang, t, type Lang } from "./i18n.js";
import {
  MOCK_EMBED_MODEL, MOCK_RERANK_MODEL, MOCK_SCENARIOS, startFakeOllama, type FakeOllama, type MockScenario,
} from "./mock/fake-ollama.js";
import { OllamaClient } from "./ollama.js";
import { startBridge } from "./serve.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", ".."); // dist/src -> package root

const OPTIONS = {
  lang: { type: "string" },
  ollama: { type: "string" },
  mock: { type: "boolean" },
  "mock-scenario": { type: "string" },
  version: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  model: { type: "string" },
  host: { type: "string" },
  port: { type: "string" },
  alias: { type: "string", multiple: true },
  scoring: { type: "string" },
  "fallback-embed": { type: "string" },
  concurrency: { type: "string" },
  timeout: { type: "string" },
  "max-chars": { type: "string" },
  "max-docs": { type: "string" },
  instruction: { type: "string" },
  "api-key": { type: "string" },
  embed: { type: "string" },
  data: { type: "string" },
  k: { type: "string" },
  json: { type: "boolean" },
} as const;

/** Turn a node parseArgs failure into a message that can be shown in either language. */
function argError(err: unknown): UsageError {
  const code = (err as { code?: string }).code;
  const option = /--[\w-]+/.exec((err as Error).message)?.[0] ?? "";
  if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") return new UsageError("error.unknownOption", { option });
  if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") return new UsageError("error.optionValue", { option });
  return new UsageError("error.badArgs");
}

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

export async function main(argv: string[], env: Record<string, string | undefined>): Promise<number> {
  // Decide the language first so even argument errors are shown in it.
  let lang: Lang = resolveLang(undefined, env);
  const langIdx = argv.findIndex((a) => a === "--lang" || a.startsWith("--lang="));
  if (langIdx >= 0) {
    const a = argv[langIdx]!;
    const val = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[langIdx + 1];
    if (val !== undefined && isLangValue(val)) lang = val as Lang;
  }

  try {
    let parsed;
    try {
      parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    } catch (err) {
      throw argError(err);
    }
    const v = parsed.values;
    if (v.lang !== undefined) {
      if (!isLangValue(v.lang)) throw new UsageError("error.badLang", { value: v.lang });
      lang = v.lang as Lang;
    }
    if (v.version) {
      console.log(packageVersion());
      return 0;
    }
    const cmd = parsed.positionals[0];
    if (v.help || cmd === undefined) {
      console.log(t(lang, "help.main"));
      return 0;
    }
    if (cmd !== "serve" && cmd !== "doctor" && cmd !== "eval") {
      throw new UsageError("error.unknownCommand", { cmd });
    }

    const scenario = (v["mock-scenario"] ?? "healthy") as MockScenario;
    if (!(MOCK_SCENARIOS as string[]).includes(scenario)) {
      throw new UsageError("error.mockScenario", { list: MOCK_SCENARIOS.join(", "), value: scenario });
    }
    const ollamaUrl = normalizeOllamaHost(v.ollama ?? env["OLLAMA_HOST"]);
    const config: ScorerConfig = {
      ollamaUrl,
      concurrency: parsePositiveInt("concurrency", v.concurrency, DEFAULTS.concurrency),
      timeoutMs: parsePositiveInt("timeout", v.timeout, DEFAULTS.timeoutSec) * 1000,
      maxChars: parsePositiveInt("max-chars", v["max-chars"], DEFAULTS.maxChars),
      maxDocs: parsePositiveInt("max-docs", v["max-docs"], DEFAULTS.maxDocs),
      aliases: parseAliases(v.alias),
      scoring: parseScoring(v.scoring),
      instruction: v.instruction ?? DEFAULT_INSTRUCTION,
      ...(v["fallback-embed"] ? { fallbackEmbed: v["fallback-embed"] } : {}),
    };

    if (cmd === "serve") return await runServe(lang, v, config, env, scenario);

    // doctor and eval share the model/Ollama setup.
    const model = v.model ?? (v.mock ? MOCK_RERANK_MODEL : undefined);
    if (!model) throw new UsageError("error.modelRequired");
    let fake: FakeOllama | undefined;
    try {
      if (v.mock) {
        fake = await startFakeOllama({ scenario });
        config.ollamaUrl = fake.url;
      }
      const client = new OllamaClient(config.ollamaUrl);
      const embedModel = v.embed ?? (v.mock && cmd === "eval" ? MOCK_EMBED_MODEL : undefined);

      if (cmd === "doctor") {
        const report = await runDoctor({
          client, model, concurrency: config.concurrency, timeoutMs: config.timeoutMs, instruction: config.instruction,
          ...(v.embed ? { embedModel: v.embed } : {}),
        });
        if (v.json) {
          console.log(JSON.stringify({
            ok: report.exitCode === 0,
            exit_code: report.exitCode,
            version: report.version ?? null,
            checks: report.checks.map((c) => ({
              id: c.id, status: c.status, detail: t("en", c.detail, checkVars(c, "en")), ...(c.fix ? { fix: t("en", c.fix, checkVars(c, "en")) } : {}),
            })),
            ...(report.unreachable ? { error: report.unreachable } : {}),
          }, null, 2));
        } else {
          console.log(renderDoctor(report, lang, { url: config.ollamaUrl, model, mock: Boolean(v.mock) }));
        }
        return report.exitCode;
      }

      const dataPath = v.data ?? join(root, "examples", "sample-eval.json");
      const data = loadEvalFile(dataPath);
      const k = parsePositiveInt("k", v.k, 3);
      const report = await runEval({
        client, model, data, k, concurrency: config.concurrency, instruction: config.instruction,
        ...(embedModel ? { embedModel } : {}),
      });
      console.log(v.json ? JSON.stringify(report, null, 2) : renderEval(report, lang, Boolean(v.mock)));
      return 0;
    } finally {
      await fake?.close();
    }
  } catch (err) {
    console.error(t(lang, "error.generic", { message: localize(err, lang) }));
    if (err instanceof Error && err.name === "OllamaError") return 3;
    return 1;
  }
}

async function runServe(
  lang: Lang,
  v: { host?: string | undefined; port?: string | undefined; model?: string | undefined; "api-key"?: string | undefined; mock?: boolean | undefined },
  config: ScorerConfig,
  env: Record<string, string | undefined>,
  scenario: MockScenario,
): Promise<number> {
  const host = v.host ?? DEFAULTS.host;
  const port = v.port === undefined ? DEFAULTS.port : Number(v.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError("error.badPort", { value: v.port ?? "" });
  const apiKey = v["api-key"] ?? env["OLLAMA_RERANK_BRIDGE_API_KEY"];
  const bridge = await startBridge({
    config, host, port,
    ...(apiKey ? { apiKey } : {}),
    ...(v.model ? { defaultModel: v.model } : {}),
    ...(v.mock ? { mock: { scenario } } : {}),
  });
  if (v.mock) {
    console.log(t(lang, "banner.mock"));
    console.log(t(lang, "serve.mockStarted", { url: bridge.ollamaUrl, rerank: MOCK_RERANK_MODEL, embed: MOCK_EMBED_MODEL }));
  }
  console.log(t(lang, "serve.listening", { host, port: bridge.port, ollama: bridge.ollamaUrl }));
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && !apiKey) console.log(t(lang, "serve.exposed", { host }));
  const model = v.model ?? MOCK_RERANK_MODEL;
  console.log(t(lang, "serve.try"));
  console.log(
    `  curl -s ${bridge.url}/v1/rerank -H 'Content-Type: application/json' -d '` +
      JSON.stringify({
        model, query: "What is the capital of China?", top_n: 2,
        documents: ["Pandas live in the mountains of China.", "The capital of China is Beijing.", "Bananas grow in warm climates."],
      }) + "'",
  );
  console.log(t(lang, "serve.stop"));
  await new Promise<void>((resolve) => {
    const stop = (): void => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await bridge.close();
  return 0;
}

// Run only when started as a program (not when imported by tests).
const entry = process.argv[1] ?? "";
if (entry !== "" && fileURLToPath(import.meta.url) === realpathSync(entry)) {
  main(process.argv.slice(2), process.env).then((code) => process.exit(code));
}
