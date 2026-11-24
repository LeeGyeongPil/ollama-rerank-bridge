import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { buildResponse, parseRequest } from "./formats.js";
import { BridgeError } from "./errors.js";
import type { Scorer } from "./scorer.js";

export interface ServerOptions {
  scorer: Scorer;
  host: string;
  port: number;
  apiKey?: string;
  /** Model used when a request (e.g. TEI) has no "model". */
  defaultModel?: string;
}

const RERANK_PATHS = new Set(["/v1/rerank", "/rerank", "/v2/rerank"]);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function sendError(res: ServerResponse, status: number, message: string, type: string): void {
  send(res, status, { error: { message, type } });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new BridgeError(413, `request body larger than ${MAX_BODY_BYTES} bytes`, "invalid_request_error");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createBridgeServer(opts: ServerOptions): Server {
  const { scorer } = opts;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { status: "ok" });
      return;
    }
    if (opts.apiKey && req.headers["authorization"] !== `Bearer ${opts.apiKey}`) {
      sendError(res, 401, "missing or wrong Bearer key; send Authorization: Bearer <key>", "authentication_error");
      return;
    }
    if (!RERANK_PATHS.has(path)) {
      sendError(res, 404, `unknown path ${path}; use POST /v1/rerank, /v2/rerank or /rerank`, "not_found");
      return;
    }
    if (req.method !== "POST") {
      sendError(res, 405, "use POST", "invalid_request_error");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch (err) {
      if (err instanceof BridgeError) throw err;
      throw new BridgeError(400, "request body is not valid JSON", "invalid_request_error");
    }
    const rr = parseRequest(path, parsed);
    const model = rr.model ?? opts.defaultModel;
    if (!model) throw new BridgeError(400, '"model" is required (or start the server with --model)', "invalid_request_error");
    if (rr.documents.length > scorer.config.maxDocs) {
      throw new BridgeError(413, `too many documents (${rr.documents.length}); the limit is ${scorer.config.maxDocs} (--max-docs)`, "invalid_request_error");
    }
    // Stop the Ollama calls when the client hangs up before the answer is sent.
    const abort = new AbortController();
    res.once("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    const out = await scorer.rerank({
      abort: abort.signal,
      model,
      query: rr.query,
      documents: rr.documents,
      ...(rr.maxChars !== undefined ? { maxChars: rr.maxChars } : {}),
    });
    const meta = {
      scoring: out.scoring,
      ...(out.fallback ? { fallback: out.fallback } : {}),
      warnings: out.warnings,
      truncated: out.truncated,
    };
    send(res, 200, buildResponse(rr, model, out.scores, out.tokens, meta, `rerank-${randomUUID()}`));
  };

  return createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof BridgeError) sendError(res, err.status, err.message, err.type);
      else sendError(res, 500, "internal error", "internal_error");
    });
  });
}

/** Start listening; resolves with the bound port (use port 0 for a free port). */
export function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}
