import assert from "node:assert/strict";
import { test } from "node:test";
import { MESSAGES, displayWidth, renderTable, resolveLang, t } from "../src/i18n.js";

test("same keys", () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.ko).sort());
  // placeholders must match between languages
  for (const key of Object.keys(MESSAGES.en) as Array<keyof typeof MESSAGES.en>) {
    const ph = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    assert.deepEqual(ph(MESSAGES.ko[key]), ph(MESSAGES.en[key]), `placeholders differ for ${key}`);
    assert.ok(MESSAGES.ko[key].length > 0);
  }
});

test("precedence", () => {
  assert.equal(resolveLang("ko", { OLLAMA_RERANK_BRIDGE_LANG: "en", LANG: "en_US.UTF-8" }), "ko");
  assert.equal(resolveLang("en", { OLLAMA_RERANK_BRIDGE_LANG: "ko" }), "en");
  assert.equal(resolveLang(undefined, { OLLAMA_RERANK_BRIDGE_LANG: "ko", LC_ALL: "en_US" }), "ko");
  assert.equal(resolveLang(undefined, { LC_ALL: "ko_KR.UTF-8", LC_MESSAGES: "en_US", LANG: "en_US" }), "ko");
  assert.equal(resolveLang(undefined, { LC_MESSAGES: "ko_KR.UTF-8", LANG: "en_US" }), "ko");
  assert.equal(resolveLang(undefined, { LANG: "ko_KR.UTF-8" }), "ko");
  assert.equal(resolveLang(undefined, { LC_ALL: "", LANG: "ko_KR.UTF-8" }), "ko"); // empty values are skipped
});

test("falls back to english", () => {
  assert.equal(resolveLang(undefined, {}), "en");
  assert.equal(resolveLang(undefined, { LANG: "fr_FR.UTF-8" }), "en");
  assert.equal(resolveLang("de", {}), "en");
});

test("t fills placeholders and table aligns wide characters", () => {
  assert.equal(t("en", "doctor.d.version", { version: "1.2.3", min: "0.12.11" }), "version 1.2.3 (needs >= 0.12.11)");
  assert.notEqual(t("ko", "eval.col.method"), t("en", "eval.col.method"));
  assert.equal(displayWidth("방법"), 4);
  const table = renderTable(["방법", "x"], [["abcd", "1"]]).split("\n");
  assert.equal(displayWidth(table[0]!.split("  ")[0]!), displayWidth("abcd"));
});
