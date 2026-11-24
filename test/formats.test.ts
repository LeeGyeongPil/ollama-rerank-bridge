import assert from "node:assert/strict";
import { test } from "node:test";
import { BridgeError } from "../src/errors.js";
import { buildResponse, parseRequest } from "../src/formats.js";

const meta = { scoring: "logprobs" as const };

test("cohere v1", () => {
  const rr = parseRequest("/v1/rerank", { model: "m", query: "q", documents: ["a", "b", "c"], top_n: 2, return_documents: true });
  assert.equal(rr.style, "cohere");
  const res = buildResponse(rr, "m", [0.1, 0.9, 0.5], 10, meta, "id1") as {
    results: Array<{ index: number; relevance_score: number; document?: { text: string } }>;
    meta: { scoring: string };
  };
  assert.deepEqual(res.results.map((r) => r.index), [1, 2]); // descending, cut to top_n, original indexes
  assert.equal(res.results[0]?.document?.text, "b");
  assert.equal(res.meta.scoring, "logprobs");
});

test("jina object docs", () => {
  const rr = parseRequest("/v1/rerank", { model: "m", query: "q", documents: [{ text: "a" }, "b"] });
  assert.deepEqual(rr.documents, ["a", "b"]);
  assert.equal(rr.returnDocuments, false);
  const res = buildResponse(rr, "m", [0.2, 0.3], 1, meta, "i") as { results: Array<{ document?: unknown }> };
  assert.equal(res.results[0]?.document, undefined);
});

test("cohere v2", () => {
  const rr = parseRequest("/v2/rerank", { model: "m", query: "q", documents: ["a"], max_tokens_per_doc: 10, return_documents: true });
  assert.equal(rr.style, "cohere-v2");
  assert.equal(rr.maxChars, 40);
  assert.equal(rr.returnDocuments, false); // v2 never returns documents
});

test("tei", () => {
  const rr = parseRequest("/rerank", { query: "q", texts: ["a", "b"], return_text: true });
  assert.equal(rr.style, "tei");
  const res = buildResponse(rr, "m", [0.1, 0.8], 1, meta, "i") as Array<{ index: number; score: number; text?: string }>;
  assert.deepEqual(res, [{ index: 1, score: 0.8, text: "b" }, { index: 0, score: 0.1, text: "a" }]);
});

test("open-webui shape", () => {
  // Open WebUI sends model, query, documents and top_n, and reads results[].index / relevance_score.
  const rr = parseRequest("/v1/rerank", { model: "qwen3-reranker:0.6b", query: "q", documents: ["x", "y"], top_n: 5 });
  const res = buildResponse(rr, rr.model!, [0.3, 0.3], 1, meta, "i") as { results: Array<{ index: number; relevance_score: number }> };
  assert.equal(res.results.length, 2);
  assert.deepEqual(res.results.map((r) => r.index), [0, 1]); // ties keep input order
  assert.equal(typeof res.results[0]?.relevance_score, "number");
});

test("rejects bad body", () => {
  const bad: unknown[] = [
    null, [], { query: "", documents: ["a"] }, { query: "q" }, { query: "q", documents: [] },
    { query: "q", documents: [1] }, { query: "q", documents: ["a"], top_n: 0 }, { query: "q", documents: ["a"], model: 5 },
    { query: "q", documents: ["a"], return_documents: "yes" },
  ];
  for (const b of bad) {
    assert.throws(() => parseRequest("/v1/rerank", b), (e: unknown) => e instanceof BridgeError && e.status === 400);
  }
});
