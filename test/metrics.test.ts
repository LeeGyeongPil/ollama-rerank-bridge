import assert from "node:assert/strict";
import { test } from "node:test";
import { mrr, ndcgAtK, rankByScore } from "../src/metrics.js";

test("ndcg hand values", () => {
  assert.ok(Math.abs(ndcgAtK([0, 0, 1, 0], 3) - 0.5) < 1e-12); // 1/log2(4) over ideal 1
  assert.equal(ndcgAtK([1, 0, 0], 3), 1);
  assert.equal(ndcgAtK([0, 0, 0], 3), 0);
  // graded: [1, 2] -> (1 + 2/log2(3)) / (2 + 1/log2(3))
  const expected = (1 + 2 / Math.log2(3)) / (2 + 1 / Math.log2(3));
  assert.ok(Math.abs(ndcgAtK([1, 2], 2) - expected) < 1e-12);
  assert.ok(Math.abs(ndcgAtK([0, 0, 0, 1], 3) - 0) < 1e-12); // outside the cut-off
});

test("mrr hand values", () => {
  assert.equal(mrr([0, 1]), 0.5);
  assert.equal(mrr([1, 0]), 1);
  assert.equal(mrr([0, 0, 0, 2]), 0.25);
  assert.equal(mrr([0, 0]), 0);
});

test("rankByScore keeps order on ties", () => {
  assert.deepEqual(rankByScore([0.5, 0.9, 0.5]), [1, 0, 2]);
});
