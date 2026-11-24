import type { ScorerConfig } from "./config.js";
import { MOCK_EMBED_MODEL, MOCK_RERANK_MODEL, startFakeOllama, type FakeOllama, type MockScenario } from "./mock/fake-ollama.js";
import { Scorer } from "./scorer.js";
import { closeServer, createBridgeServer, listen } from "./server.js";

export interface ServeOptions {
  config: ScorerConfig;
  host: string;
  port: number;
  apiKey?: string;
  defaultModel?: string;
  mock?: { scenario: MockScenario; delayMs?: number };
}

export interface RunningBridge {
  url: string;
  port: number;
  ollamaUrl: string;
  fake?: FakeOllama;
  scorer: Scorer;
  close(): Promise<void>;
}

/** Start the bridge (and the fake Ollama in mock mode). Always release both with close(). */
export async function startBridge(o: ServeOptions): Promise<RunningBridge> {
  let fake: FakeOllama | undefined;
  const config = { ...o.config };
  if (o.mock) {
    fake = await startFakeOllama({ scenario: o.mock.scenario, ...(o.mock.delayMs !== undefined ? { delayMs: o.mock.delayMs } : {}) });
    config.ollamaUrl = fake.url;
  }
  const scorer = new Scorer(config);
  const defaultModel = o.defaultModel ?? (o.mock ? MOCK_RERANK_MODEL : undefined);
  const server = createBridgeServer({
    scorer,
    host: o.host,
    port: o.port,
    ...(o.apiKey ? { apiKey: o.apiKey } : {}),
    ...(defaultModel ? { defaultModel } : {}),
  });
  let port: number;
  try {
    port = await listen(server, o.host, o.port);
  } catch (err) {
    await fake?.close();
    throw err;
  }
  return {
    url: `http://${o.host}:${port}`,
    port,
    ollamaUrl: config.ollamaUrl,
    ...(fake ? { fake } : {}),
    scorer,
    close: async () => {
      await closeServer(server);
      await fake?.close();
    },
  };
}

export { MOCK_EMBED_MODEL, MOCK_RERANK_MODEL };
