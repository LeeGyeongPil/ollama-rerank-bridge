import assert from "node:assert/strict";
import { test } from "node:test";
import { BridgeError } from "../src/errors.js";
import { startFakeOllama } from "../src/mock/fake-ollama.js";
import { OllamaClient, type GenerateResult } from "../src/ollama.js";
import { Scorer } from "../src/scorer.js";
import { DOCS, testConfig } from "./helpers.js";

const MODEL = "qwen3-reranker:0.6b";

test("respects concurrency", async () => {
  const fake = await startFakeOllama({ delayMs: 40 });
  try {
    const scorer = new Scorer(testConfig({ ollamaUrl: fake.url, concurrency: 2 }));
    const docs = Array.from({ length: 8 }, (_, i) => `The capital of China is city number ${i}.`);
    const out = await scorer.rerank({ model: MODEL, query: "capital of China", documents: docs });
    assert.equal(out.scores.length, 8);
    assert.equal(fake.stats.calls, 8);
    assert.equal(fake.stats.maxActive, 2); // never above --concurrency, and the limit is actually used
  } finally {
    await fake.close();
  }
});

test("times out", async () => {
  const fake = await startFakeOllama({ scenario: "slow", delayMs: 1500 });
  try {
    const scorer = new Scorer(testConfig({ ollamaUrl: fake.url, timeoutMs: 300 }));
    await assert.rejects(
      scorer.rerank({ model: MODEL, query: "q", documents: DOCS }),
      (e: unknown) => e instanceof BridgeError && e.status === 504 && /timed out/.test(e.message),
    );
  } finally {
    await fake.close();
  }
});

test("truncates", async () => {
  class Recording extends OllamaClient {
    prompts: string[] = [];
    override async generateLogprobs(_model: string, prompt: string): Promise<GenerateResult> {
      this.prompts.push(prompt);
      return { topLogprobs: [{ token: "yes", logprob: -0.1 }, { token: "no", logprob: -2.5 }], promptTokens: 1 };
    }
    override async show() {
      return { capabilities: ["completion"], family: "qwen3" };
    }
  }
  const client = new Recording("http://127.0.0.1:1");
  const scorer = new Scorer(testConfig({ maxChars: 10 }), client);
  const out = await scorer.rerank({ model: MODEL, query: "q", documents: ["0123456789ABCDEFGH", "short"] });
  assert.equal(out.truncated, 1);
  assert.ok(client.prompts[0]!.includes("<Document>: 0123456789<|im_end|>"));
  assert.ok(client.prompts[1]!.includes("<Document>: short<|im_end|>"));
  // a smaller per-request limit (Cohere v2 max_tokens_per_doc) wins over the larger configured one
  client.prompts.length = 0;
  const scorer2 = new Scorer(testConfig({ maxChars: 1000 }), client);
  await scorer2.rerank({ model: MODEL, query: "q", documents: ["0123456789"], maxChars: 4 });
  assert.ok(client.prompts[0]!.includes("<Document>: 0123<|im_end|>"));
});

test("falls back to embedding", async () => {
  const fake = await startFakeOllama({ scenario: "old-ollama" });
  try {
    const scorer = new Scorer(testConfig({ ollamaUrl: fake.url, fallbackEmbed: "mock-embed" }));
    const out = await scorer.rerank({ model: MODEL, query: "capital of China", documents: DOCS });
    assert.equal(out.scoring, "embedding");
    assert.match(out.fallback ?? "", /0\.12\.11/);
    assert.equal(out.scores.length, 3);
  } finally {
    await fake.close();
  }
});

test("errors without fallback", async () => {
  const fake = await startFakeOllama({ scenario: "old-ollama" });
  try {
    const scorer = new Scorer(testConfig({ ollamaUrl: fake.url }));
    await assert.rejects(
      scorer.rerank({ model: MODEL, query: "q", documents: DOCS }),
      (e: unknown) => e instanceof BridgeError && e.status === 502 && /needs Ollama >= 0\.12\.11/.test(e.message),
    );
  } finally {
    await fake.close();
  }
});

test("unreachable Ollama gives 502 with a fix", async () => {
  const scorer = new Scorer(testConfig({ ollamaUrl: "http://127.0.0.1:9" }));
  await assert.rejects(
    scorer.rerank({ model: MODEL, query: "q", documents: DOCS }),
    (e: unknown) => e instanceof BridgeError && e.status === 502 && /ollama serve/.test(e.message),
  );
});

test("forced scoring mode overrides capabilities", async () => {
  const fake = await startFakeOllama();
  try {
    const scorer = new Scorer(testConfig({ ollamaUrl: fake.url, scoring: "embedding" }));
    const out = await scorer.rerank({ model: "mock-embed", query: "capital of China", documents: DOCS });
    assert.equal(out.scoring, "embedding");
  } finally {
    await fake.close();
  }
});

test("the first failure cancels the remaining Ollama calls", async () => {
  class Failing extends OllamaClient {
    started = 0;
    override async show(): Promise<{ capabilities: string[]; family: string }> {
      return { capabilities: ["completion"], family: "qwen3" };
    }
    override async generateLogprobs(_m: string, _p: string, signal?: AbortSignal): Promise<GenerateResult> {
      if (signal?.aborted) throw new Error("aborted before start");
      this.started += 1;
      throw new Error("boom");
    }
  }
  const client = new Failing("http://127.0.0.1:9");
  const scorer = new Scorer(testConfig({ concurrency: 1 }), client);
  const docs = Array.from({ length: 6 }, (_, i) => `doc ${i}`);
  await assert.rejects(scorer.rerank({ model: MODEL, query: "q", documents: docs }), /boom/);
  await new Promise((r) => setTimeout(r, 20));
  // At most the pair the limiter had already released; pairs 3..6 saw the abort and never reached Ollama.
  assert.ok(client.started <= 2, `started ${client.started}`);
});

test("a caller abort signal stops the work", async () => {
  const fake = await startFakeOllama({ delayMs: 60 });
  try {
    const scorer = new Scorer(testConfig({ ollamaUrl: fake.url, concurrency: 1 }));
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    const docs = Array.from({ length: 20 }, (_, i) => `doc ${i}`);
    await assert.rejects(scorer.rerank({ model: MODEL, query: "q", documents: docs, abort: ac.signal }));
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(fake.stats.calls < 10, `expected few calls, got ${fake.stats.calls}`);
  } finally {
    await fake.close();
  }
});
