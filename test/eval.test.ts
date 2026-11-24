import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lineColumn, loadEvalFile, parseEvalData, renderEval, runEval } from "../src/eval.js";
import { UsageError } from "../src/errors.js";
import { startFakeOllama } from "../src/mock/fake-ollama.js";
import { OllamaClient } from "../src/ollama.js";

const sample = join(fileURLToPath(import.meta.url), "..", "..", "..", "examples", "sample-eval.json");

test("bundled data: bridge beats original and naive (the lesson)", async () => {
  const fake = await startFakeOllama();
  try {
    const report = await runEval({
      client: new OllamaClient(fake.url), model: "qwen3-reranker:0.6b", embedModel: "mock-embed",
      data: loadEvalFile(sample), k: 3, concurrency: 2,
    });
    const m = Object.fromEntries(report.methods.map((x) => [x.name, x]));
    assert.ok(m["bridge"]!.ndcg > m["original"]!.ndcg);
    assert.ok(m["bridge"]!.ndcg > m["naive"]!.ndcg);
    assert.ok(m["bridge"]!.mrr > m["naive"]!.mrr);
    assert.deepEqual(report.methods.map((x) => x.name), ["original", "embedding", "naive", "bridge"]);
    assert.match(renderEval(report, "en", true), /practice mock/);
  } finally {
    await fake.close();
  }
});

test("data validation gives fixable errors", () => {
  assert.throws(() => parseEvalData([]), UsageError);
  assert.throws(() => parseEvalData([{ query: "q", docs: [{ text: "a", rel: 0 }] }]), /rel > 0/);
  assert.throws(() => parseEvalData([{ query: "q", docs: [{ text: "a" }] }]), /"rel"/);
  assert.throws(() => loadEvalFile("/nonexistent/eval.json"), /--data/);
  assert.equal(parseEvalData([{ query: "q", docs: [{ text: "a", rel: 1 }] }]).length, 1);
});

test("broken or empty eval files say where and show the format", () => {
  const dir = mkdtempSync(join(tmpdir(), "orb-eval-"));
  try {
    const broken = join(dir, "broken.json");
    writeFileSync(broken, '[\n  {"query": "q",}\n]\n');
    // the position comes from our own line/column count, so Node 20 and 22+ give the same text
    assert.throws(() => loadEvalFile(broken), /line 2, column 17\).*examples\/sample-eval\.json/);
    const empty = join(dir, "empty.json");
    writeFileSync(empty, "  \n");
    assert.throws(() => loadEvalFile(empty), /is empty.*"query"/);
    const cut = join(dir, "cut.json");
    writeFileSync(cut, '[{"query": "q"');
    assert.throws(() => loadEvalFile(cut), /line 1, column 15\)/);
    assert.deepEqual(lineColumn("ab\ncd", 4), { line: 2, column: 2 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
