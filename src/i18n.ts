import { en } from "./locales/en.js";
import { ko } from "./locales/ko.js";

export type Lang = "en" | "ko";
export type MessageKey = keyof typeof en;
export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, ko };

/** Pick the screen language: --lang > OLLAMA_RERANK_BRIDGE_LANG > LC_ALL > LC_MESSAGES > LANG; otherwise English. */
export function resolveLang(flag: string | undefined, env: Record<string, string | undefined>): Lang {
  const candidates = [flag, env["OLLAMA_RERANK_BRIDGE_LANG"], env["LC_ALL"], env["LC_MESSAGES"], env["LANG"]];
  for (const c of candidates) {
    if (c === undefined || c.trim() === "") continue;
    return c.trim().toLowerCase().startsWith("ko") ? "ko" : "en";
  }
  return "en";
}

export function isLangValue(v: string): boolean {
  return v === "en" || v === "ko";
}

/** Look up a message and fill `{name}` placeholders. */
export function t(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = MESSAGES[lang][key];
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Terminal column width: Hangul and other wide characters count as 2. */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xff00 && c <= 0xff60) ? 2 : 1;
  }
  return w;
}

/** Render rows as an aligned plain-text table. */
export function renderTable(header: string[], rows: string[][]): string {
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map((r) => displayWidth(r[c] ?? ""))));
  const fmt = (r: string[]): string =>
    r.map((cell, c) => cell + " ".repeat((widths[c] ?? 0) - displayWidth(cell))).join("  ").trimEnd();
  return [fmt(header), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(fmt)].join("\n");
}
