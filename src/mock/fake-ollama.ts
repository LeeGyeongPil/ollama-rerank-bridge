/**
 * Practice mock of Ollama (NOT a real model).
 *
 * It speaks the same HTTP endpoints the bridge uses and reproduces the shape of
 * real Qwen3-Reranker answers observed in a probe: irrelevant documents answer
 * "No" with no lowercase yes/no in the top-20, and many relevant documents answer
 * "Yes" / " yes" with the lowercase "yes" ranked below the lowercase "no".
 * Reading only lowercase tokens therefore misranks documents here, exactly as it can for real.
 * "Relevance" is just word overlap between query and document.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type MockScenario = "healthy" | "old-ollama" | "no-yesno" | "slow";
export const MOCK_SCENARIOS: MockScenario[] = ["healthy", "old-ollama", "no-yesno", "slow"];

export const MOCK_RERANK_MODEL = "qwen3-reranker:0.6b";
export const MOCK_EMBED_MODEL = "mock-embed";

export interface FakeOllamaOptions {
  scenario?: MockScenario;
  /** Delay per generate/embed call in ms (the "slow" scenario defaults to 1500). */
  delayMs?: number;
}

export interface FakeOllama {
  url: string;
  server: Server;
  stats: { calls: number; maxActive: number };
  close(): Promise<void>;
}

const STOP = new Set(
  "a an the of in on at to is are was were be what which who how why do does did for and or with by as it its this that from into than then".split(" "),
);

/** English: lowercase words without stop words. Korean (Hangul): character bigrams. */
export function tokens(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const w of lower.match(/[a-z0-9]+/g) ?? []) if (!STOP.has(w)) out.push(w);
  for (const run of lower.match(/[가-힣]+/g) ?? []) {
    if (run.length === 1) out.push(run);
    for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

export function overlap(query: string, doc: string): number {
  const q = new Set(tokens(query));
  if (q.size === 0) return 0;
  const d = new Set(tokens(doc));
  let hit = 0;
  for (const t of q) if (d.has(t)) hit += 1;
  return hit / q.size;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 256-dim bag of character 3-grams (hashed) - a crude bi-encoder stand-in. */
export function fakeEmbedding(text: string): number[] {
  const v = new Array<number>(256).fill(0);
  const s = ` ${text.toLowerCase()} `;
  for (let i = 0; i + 3 <= s.length; i++) {
    const slot = hash(s.slice(i, i + 3)) % 256;
    v[slot] = (v[slot] ?? 0) + 1;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}

type Cand = { token: string; logprob: number };

const FILLER = ["Not", "I", "The", "Sorry", "Wait", "This", "Does", "N", "None", "Incorrect", "There", "Do", "Based", "Since", "After", "Let", "Okay", "Hmm", "Both", "Many"];

function withFiller(cands: Cand[]): Cand[] {
  const all = [...cands];
  FILLER.forEach((t, i) => all.push({ token: t, logprob: -4.5 - i * 0.35 }));
  return all.sort((a, b) => b.logprob - a.logprob).slice(0, 20);
}

/** Build a top-20 list whose yes/no mass follows `r` (word overlap 0..1). */
export function fakeTopLogprobs(query: string, doc: string, scenario: MockScenario): Cand[] {
  if (scenario === "no-yesno") {
    return withFiller([{ token: "<think>", logprob: -0.05 }, { token: "\n", logprob: -3.5 }]);
  }
  const r = overlap(query, doc);
  const p = Math.min(0.97, 0.02 + 0.95 * r);
  const L = (m: number): number => Math.log(Math.max(m, 1e-12));
  if (r < 0.25) {
    // Irrelevant: capital "No" dominates, no lowercase yes/no at all.
    return withFiller([
      { token: "No", logprob: L((1 - p) * 0.8) },
      { token: " No", logprob: L((1 - p) * 0.1) },
      { token: "NO", logprob: L((1 - p) * 0.1) },
    ]);
  }
  if (hash(doc) % 2 === 0) {
    // Relevant, well-behaved: lowercase "yes".
    return withFiller([
      { token: "yes", logprob: L(p * 0.97) },
      { token: "Yes", logprob: L(p * 0.03) },
      { token: "No", logprob: L((1 - p) * 0.6) },
      { token: "no", logprob: L((1 - p) * 0.4) },
    ]);
  }
  // Relevant, quirky: "Yes" / " yes" lead and lowercase "yes" is outranked by lowercase "no".
  return withFiller([
    { token: "Yes", logprob: L(p * 0.84) },
    { token: " yes", logprob: L(p * 0.15) },
    { token: "yes", logprob: L(p * 0.01) },
    { token: "no", logprob: L(0.012) },
    { token: "No", logprob: L(Math.max(1 - p, 0.01) * 0.5) },
  ]);
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

function between(text: string, start: string, end: string): string {
  const i = text.indexOf(start);
  if (i < 0) return "";
  const from = i + start.length;
  const j = end ? text.indexOf(end, from) : -1;
  return text.slice(from, j < 0 ? undefined : j);
}

export async function startFakeOllama(opts: FakeOllamaOptions = {}, port = 0): Promise<FakeOllama> {
  const scenario = opts.scenario ?? "healthy";
  const delayMs = opts.delayMs ?? (scenario === "slow" ? 1500 : 0);
  const stats = { calls: 0, maxActive: 0 };
  let active = 0;

  const server = createServer((req, res) => {
    const json = (status: number, body: unknown): void => {
      const text = JSON.stringify(body);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(text);
    };
    const path = req.url ?? "/";

    void (async () => {
      if (req.method === "GET" && path === "/api/version") {
        json(200, { version: scenario === "old-ollama" ? "0.12.10" : "0.40.15" });
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(404);
        res.end("404 page not found");
        return;
      }
      const body = await readJson(req);
      const model = String(body["model"] ?? "");
      const isEmbed = model.includes("embed");
      const known = isEmbed || model.includes("rerank");

      if (path === "/api/show") {
        if (!known) return json(404, { error: `model '${model}' not found` });
        return json(200, isEmbed
          ? { capabilities: ["embedding"], details: { family: "bert" } }
          : { capabilities: ["completion", "thinking", "tools"], details: { family: "qwen3" } });
      }
      if (path === "/api/generate" || path === "/api/embed") {
        if (!known) return json(404, { error: `model '${model}' not found` });
        stats.calls += 1;
        active += 1;
        stats.maxActive = Math.max(stats.maxActive, active);
        try {
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
          if (path === "/api/embed") {
            const input = (Array.isArray(body["input"]) ? body["input"] : [body["input"]]) as string[];
            return json(200, { model, embeddings: input.map((t) => fakeEmbedding(String(t))) });
          }
          const prompt = String(body["prompt"] ?? "");
          const query = between(prompt, "<Query>: ", "\n<Document>: ");
          const doc = between(prompt, "<Document>: ", "<|im_end|>");
          const top = fakeTopLogprobs(query, doc, scenario);
          const first = top[0] as Cand;
          const out: Record<string, unknown> = {
            model,
            response: first.token,
            done: true,
            prompt_eval_count: Math.ceil(prompt.length / 4),
            eval_count: 1,
          };
          if (scenario !== "old-ollama") out["logprobs"] = [{ token: first.token, logprob: first.logprob, top_logprobs: top }];
          return json(200, out);
        } finally {
          active -= 1;
        }
      }
      res.writeHead(404);
      res.end("404 page not found");
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const bound = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${bound}`,
    server,
    stats,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
