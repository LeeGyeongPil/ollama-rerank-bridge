import assert from "node:assert/strict";
import { test } from "node:test";
import { startBridge } from "../src/serve.js";
import { DOCS, post, testConfig } from "./helpers.js";

test("reranks via logprobs", async () => {
  const b = await startBridge({ config: testConfig(), host: "127.0.0.1", port: 0, mock: { scenario: "healthy" } });
  try {
    const { status, json } = await post(`${b.url}/v1/rerank`, {
      model: "qwen3-reranker:0.6b", query: "What is the capital of China?", documents: DOCS, return_documents: true,
    });
    assert.equal(status, 200);
    assert.equal(json.meta.scoring, "logprobs");
    assert.equal(json.results[0].index, 1); // the Beijing sentence wins
    assert.equal(json.results[0].document.text, DOCS[1]);
    const scores: number[] = json.results.map((r: { relevance_score: number }) => r.relevance_score);
    assert.deepEqual([...scores].sort((x, y) => y - x), scores);
    assert.ok(json.usage.total_tokens > 0);
  } finally {
    await b.close();
  }
});

test("reranks via embedding", async () => {
  const b = await startBridge({ config: testConfig(), host: "127.0.0.1", port: 0, mock: { scenario: "healthy" } });
  try {
    const { status, json } = await post(`${b.url}/v2/rerank`, {
      model: "mock-embed", query: "What is the capital of China?", documents: DOCS, top_n: 2,
    });
    assert.equal(status, 200);
    assert.equal(json.meta.scoring, "embedding");
    assert.equal(json.results.length, 2);
    assert.equal(json.results[0].index, 1);
  } finally {
    await b.close();
  }
});

test("requires bearer key", async () => {
  const b = await startBridge({ config: testConfig(), host: "127.0.0.1", port: 0, apiKey: "secret", mock: { scenario: "healthy" } });
  try {
    const body = { query: "q", documents: ["a"] };
    assert.equal((await post(`${b.url}/v1/rerank`, body)).status, 401);
    assert.equal((await post(`${b.url}/v1/rerank`, body, { Authorization: "Bearer wrong" })).status, 401);
    assert.equal((await post(`${b.url}/v1/rerank`, body, { Authorization: "Bearer secret" })).status, 200);
  } finally {
    await b.close();
  }
});

test("health", async () => {
  const b = await startBridge({ config: testConfig(), host: "127.0.0.1", port: 0, mock: { scenario: "healthy" } });
  try {
    const res = await fetch(`${b.url}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
    const nf = await post(`${b.url}/nope`, {});
    assert.equal(nf.status, 404);
    const bad = await post(`${b.url}/v1/rerank`, "{not json");
    assert.equal(bad.status, 400);
    const missing = await post(`${b.url}/v1/rerank`, { model: "ghost-model", query: "q", documents: ["a"] });
    assert.equal(missing.status, 404);
    const many = await post(`${b.url}/v1/rerank`, { query: "q", documents: new Array(3).fill("a") });
    assert.equal(many.status, 200);
  } finally {
    await b.close();
  }
});

test("too many documents gives 413 and TEI works", async () => {
  const b = await startBridge({ config: testConfig({ maxDocs: 2 }), host: "127.0.0.1", port: 0, mock: { scenario: "healthy" } });
  try {
    const r = await post(`${b.url}/v1/rerank`, { query: "q", documents: ["a", "b", "c"] });
    assert.equal(r.status, 413);
    const tei = await post(`${b.url}/rerank`, { query: "capital of China", texts: [DOCS[2], DOCS[1]] });
    assert.equal(tei.status, 200);
    assert.equal(tei.json[0].index, 1);
  } finally {
    await b.close();
  }
});

test("aliases map app model names", async () => {
  const b = await startBridge({
    config: testConfig({ aliases: { "rerank-english-v3.0": "qwen3-reranker:0.6b" } }), host: "127.0.0.1", port: 0, mock: { scenario: "healthy" },
  });
  try {
    const r = await post(`${b.url}/v1/rerank`, { model: "rerank-english-v3.0", query: "capital of China", documents: DOCS });
    assert.equal(r.status, 200);
    assert.equal(r.json.model, "rerank-english-v3.0");
  } finally {
    await b.close();
  }
});
