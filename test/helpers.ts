import { DEFAULT_INSTRUCTION, type ScorerConfig } from "../src/config.js";

export function testConfig(over: Partial<ScorerConfig> = {}): ScorerConfig {
  return {
    ollamaUrl: "http://127.0.0.1:1",
    concurrency: 2,
    timeoutMs: 20_000,
    maxChars: 4000,
    maxDocs: 200,
    aliases: {},
    scoring: "auto",
    instruction: DEFAULT_INSTRUCTION,
    ...over,
  };
}

export async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

export const DOCS = [
  "Pandas live in the mountains of China.",
  "The capital of China is Beijing.",
  "Bananas grow in warm climates.",
];
