/**
 * Optional smoke test against a real Ollama (not part of `npm test`).
 *   OLLAMA_RERANK_BRIDGE_REAL_MODEL=qwen3-reranker:0.6b npm run test:real
 * Uses OLLAMA_HOST (default 127.0.0.1:11434). Real models can be slow; there is no short timeout.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOllamaHost } from "../../src/config.js";
import { renderDoctor, runDoctor } from "../../src/doctor.js";
import { loadEvalFile, runEval } from "../../src/eval.js";
import { OllamaClient } from "../../src/ollama.js";

const model = process.env["OLLAMA_RERANK_BRIDGE_REAL_MODEL"];
if (!model) {
  console.log("skipped (no real model): set OLLAMA_RERANK_BRIDGE_REAL_MODEL to a reranker model name in your Ollama");
  process.exit(0);
}
const url = normalizeOllamaHost(process.env["OLLAMA_HOST"]);
const client = new OllamaClient(url);
const report = await runDoctor({ client, model, concurrency: 2, timeoutMs: 30 * 60_000 });
console.log(renderDoctor(report, "en", { url, model, mock: false }));
if (report.exitCode !== 0) process.exit(report.exitCode);

const data = loadEvalFile(join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "examples", "sample-eval.json"));
const ev = await runEval({ client, model, data, k: 3, concurrency: 2 });
console.log(JSON.stringify(ev.methods));
const get = (n: string) => ev.methods.find((m) => m.name === n)!.ndcg;
if (!(get("bridge") > get("original"))) {
  console.error("bridge nDCG did not beat the original order on the bundled data");
  process.exit(1);
}
console.log("real mode OK");
