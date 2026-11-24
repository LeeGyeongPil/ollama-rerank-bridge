import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDoctor, runDoctor } from "../src/doctor.js";
import { startFakeOllama, type MockScenario } from "../src/mock/fake-ollama.js";
import { OllamaClient } from "../src/ollama.js";

async function run(scenario: MockScenario, model = "qwen3-reranker:0.6b", timeoutMs = 60_000) {
  const fake = await startFakeOllama({ scenario, delayMs: 0 });
  try {
    const report = await runDoctor({ client: new OllamaClient(fake.url), model, concurrency: 2, timeoutMs });
    return { report, text: renderDoctor(report, "en", { url: fake.url, model, mock: true }) };
  } finally {
    await fake.close();
  }
}

test("healthy", async () => {
  const { report, text } = await run("healthy");
  assert.equal(report.exitCode, 0);
  assert.equal(report.checks.length, 6);
  assert.ok(report.checks.every((c) => c.status === "PASS"));
  assert.equal((text.match(/PASS/g) ?? []).length, 6);
});

test("old ollama", async () => {
  const { report, text } = await run("old-ollama");
  assert.equal(report.exitCode, 2);
  assert.equal(report.checks.find((c) => c.id === 3)?.status, "FAIL");
  assert.match(text, /needs Ollama >= 0\.12\.11/);
  assert.match(text, /fix \[/);
});

test("no yes/no tokens", async () => {
  const { report } = await run("no-yesno");
  assert.equal(report.exitCode, 2);
  assert.equal(report.checks.find((c) => c.id === 5)?.status, "FAIL");
});

test("unreachable", async () => {
  const report = await runDoctor({ client: new OllamaClient("http://127.0.0.1:9"), model: "m", concurrency: 2, timeoutMs: 5000 });
  assert.equal(report.exitCode, 3);
  assert.match(report.unreachable ?? "", /cannot reach Ollama/);
});

test("missing model fails check 2 and skips the rest", async () => {
  const { report } = await run("healthy", "ghost-model");
  assert.equal(report.exitCode, 2);
  assert.equal(report.checks.find((c) => c.id === 2)?.status, "FAIL");
  assert.ok(report.checks.filter((c) => c.id > 2).every((c) => c.status === "SKIP"));
});

test("embedding model uses cosine and skips logprobs checks", async () => {
  const { report } = await run("healthy", "mock-embed");
  assert.equal(report.exitCode, 0);
  assert.equal(report.checks.find((c) => c.id === 3)?.status, "SKIP");
  assert.equal(report.checks.find((c) => c.id === 4)?.status, "PASS");
});
