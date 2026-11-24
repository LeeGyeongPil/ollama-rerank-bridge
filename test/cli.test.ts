import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeOllamaHost, parseAliases, parsePositiveInt } from "../src/config.js";
import { createLimiter } from "../src/queue.js";

const cli = join(fileURLToPath(import.meta.url), "..", "..", "src", "cli.js");

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { PATH: process.env["PATH"] ?? "", ...env },
    timeout: 60_000,
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test("eval --mock --json has the documented shape and the lesson", () => {
  const r = run(["eval", "--mock", "--json"]);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out) as { methods: Array<{ name: string; ndcg: number; mrr: number; ms: number }> };
  const m = Object.fromEntries(j.methods.map((x) => [x.name, x]));
  assert.ok(m["bridge"]!.ndcg > m["original"]!.ndcg);
  assert.ok(m["bridge"]!.ndcg > m["naive"]!.ndcg);
  for (const x of j.methods) assert.deepEqual(Object.keys(x).sort(), ["mrr", "ms", "name", "ndcg"]);
});

test("--lang switches the screen language", () => {
  const ko = run(["eval", "--mock", "--lang", "ko"], { LANG: "en_US.UTF-8" });
  assert.match(ko.out, /방법/);
  const en = run(["eval", "--mock", "--lang", "en"], { LANG: "ko_KR.UTF-8" });
  assert.match(en.out, /Method/);
  const env = run(["eval", "--mock"], { OLLAMA_RERANK_BRIDGE_LANG: "ko" });
  assert.match(env.out, /방법/);
  assert.match(run(["--help", "--lang", "ko"]).out, /사용법/);
  assert.match(run(["--help", "--lang", "en"]).out, /Usage/);
  assert.match(run(["doctor", "--mock", "--lang", "ko"]).out, /점검/);
});

test("doctor exit codes through the CLI", () => {
  const ok = run(["doctor", "--mock", "--lang", "en", "--model", "qwen3-reranker:0.6b"]);
  assert.equal(ok.code, 0);
  assert.equal((ok.out.match(/PASS/g) ?? []).length, 6);
  assert.equal(run(["doctor", "--mock", "--mock-scenario", "old-ollama"]).code, 2);
  assert.equal(run(["doctor", "--model", "x", "--ollama", "127.0.0.1:9"]).code, 3);
});

test("usage errors exit 1 with a fix", () => {
  const a = run(["frobnicate", "--lang", "en"]);
  assert.equal(a.code, 1);
  assert.match(a.err, /serve, doctor or eval/);
  assert.equal(run(["doctor", "--lang", "en"]).code, 1); // --model required
  assert.match(run(["eval", "--mock", "--data", "/nonexistent.json", "--lang", "en"]).err, /--data/);
  assert.equal(run(["serve", "--bogus"]).code, 1);
  assert.equal(run(["serve", "--mock", "--concurrency", "0"]).code, 1);
  assert.equal(run(["--lang", "xx", "--help"]).code, 1);
  assert.match(run(["--version"]).out, /^\d+\.\d+\.\d+/);
});

test("serve --mock starts, answers curl-style requests and stops on SIGTERM", async () => {
  const child = spawn(process.execPath, [cli, "serve", "--mock", "--port", "0", "--lang", "en"], {
    env: { PATH: process.env["PATH"] ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    let out = "";
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("serve did not start: " + out)), 20_000);
      child.stdout.on("data", (d: Buffer) => {
        out += d.toString();
        const m = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
      child.on("exit", () => reject(new Error("serve exited early: " + out)));
    });
    const res = await fetch(`http://127.0.0.1:${port}/v1/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "capital of China", documents: ["Bananas grow in warm climates.", "The capital of China is Beijing."] }),
    });
    const json = (await res.json()) as { results: Array<{ index: number }> };
    assert.equal(json.results[0]?.index, 1);
    assert.match(out, /practice mock/);
  } finally {
    const exited = new Promise<number | null>((resolve) => child.once("exit", (c) => resolve(c)));
    child.kill("SIGTERM");
    assert.equal(await exited, 0); // clean shutdown releases both servers
  }
});

test("config helpers", () => {
  assert.equal(normalizeOllamaHost(undefined), "http://127.0.0.1:11434");
  assert.equal(normalizeOllamaHost("0.0.0.0:11500"), "http://127.0.0.1:11500");
  assert.equal(normalizeOllamaHost("myhost"), "http://myhost:11434");
  assert.equal(normalizeOllamaHost("https://box:443/"), "https://box:443");
  assert.throws(() => normalizeOllamaHost("host:abc"), /port must be a number/);
  assert.deepEqual(parseAliases(["a=b", "c=d:e"]), { a: "b", c: "d:e" });
  assert.throws(() => parseAliases(["nope"]), /--alias/);
  assert.throws(() => parsePositiveInt("k", "0", 3), /--k/);
});

test("limiter caps parallel tasks", async () => {
  const limiter = createLimiter(3);
  let active = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 10 }, () =>
      limiter.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
      }),
    ),
  );
  assert.equal(peak, 3);
  assert.throws(() => createLimiter(0), RangeError);
});

test("--lang ko prints Korean errors, not English sentences", () => {
  const cases: string[][] = [
    ["doctor", "--lang", "ko", "--ollama", "127.0.0.1:9", "--model", "x"],
    ["eval", "--lang", "ko", "--ollama", "127.0.0.1:9", "--model", "x"],
    ["eval", "--mock", "--mock-scenario", "old-ollama", "--lang", "ko"],
    ["--lang", "ko", "eval", "--mock", "--k", "0"],
    ["--lang", "ko", "serve", "--mock", "--scoring", "nope"],
    ["--lang", "ko", "serve", "--mock", "--alias", "bad"],
    ["--lang", "ko", "serve", "--mock", "--port", "99999"],
    ["--lang", "ko", "doctor", "--model", "x", "--ollama", "host:abc"],
    ["--lang", "ko", "eval", "--mock", "--data", "/nonexistent.json"],
    ["--lang", "ko", "serve", "--bogus"],
    ["--lang", "ko", "serve", "--port"],
  ];
  const english = /cannot reach|must be|returned no|needs Ollama|invalid|unknown option|cannot read|is not valid|needs a valid/;
  for (const args of cases) {
    const r = run(args);
    const text = r.out + r.err;
    assert.notEqual(r.code, 0, args.join(" "));
    assert.match(text, /[가-힣]/, args.join(" "));
    assert.doesNotMatch(text, english, `${args.join(" ")} -> ${text}`);
  }
  // the same failures stay English with --lang en
  assert.match(run(["serve", "--bogus", "--lang", "en"]).err, /unknown option --bogus/);
  assert.match(run(["eval", "--mock", "--k", "0", "--lang", "en"]).err, /--k must be an integer/);
});
