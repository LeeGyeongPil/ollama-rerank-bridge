import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt, scoreFromTopLogprobs } from "../src/scoring/logprobs.js";

const lp = (token: string, p: number) => ({ token, logprob: Math.log(p) });

test("sums case and space variants", () => {
  // "Yes" + " yes" + "YES" count as yes; "No" + " no" as no; "Not" and "<think>" are ignored.
  const r = scoreFromTopLogprobs([
    lp("Yes", 0.4), lp(" yes", 0.2), lp("YES", 0.1), lp("No", 0.1), lp(" no", 0.1), lp("Not", 0.05), lp("<think>", 0.05),
  ]);
  assert.ok(Math.abs(r.score - 0.7 / 0.9) < 1e-9);
  assert.equal(r.floorUsed, 0);
  assert.equal(r.neutral, false);
  assert.deepEqual(r.variants.sort(), [" no", " yes", "No", "Yes", "YES"].sort());
  // The naive reader sees neither exact lowercase token.
  assert.equal(r.naive, 0.5);
  assert.equal(r.naiveBlind, true);
});

test("uses floor when yes missing", () => {
  const r = scoreFromTopLogprobs([lp("No", 0.9), lp("Not", 0.05), lp("I", 0.01)]);
  // yes is replaced by the lowest candidate probability (0.01)
  assert.ok(Math.abs(r.score - 0.01 / 0.91) < 1e-9);
  assert.equal(r.floorUsed, 1);
  assert.equal(r.neutral, false);
});

test("neutral when no yes/no", () => {
  const r = scoreFromTopLogprobs([lp("<think>", 0.9), lp("Not", 0.05)]);
  assert.equal(r.score, 0.5);
  assert.equal(r.neutral, true);
  assert.deepEqual(r.variants, []);
});

test("prompt matches model card", () => {
  const expected =
    '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n' +
    "<|im_start|>user\n<Instruct>: Given a web search query, retrieve relevant passages that answer the query\n<Query>: Q?\n<Document>: D.<|im_end|>\n" +
    "<|im_start|>assistant\n<think>\n\n</think>\n\n";
  assert.equal(buildPrompt("Q?", "D."), expected);
  assert.ok(buildPrompt("Q?", "D.", "Custom instruction").includes("<Instruct>: Custom instruction\n"));
});
