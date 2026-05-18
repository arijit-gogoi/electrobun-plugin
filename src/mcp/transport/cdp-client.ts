// Chrome DevTools Protocol client.
// Connects to localhost:<cdpPort> exposed by CEF when the user enables
// `chromiumFlags["remote-debugging-port"] = "9222"` in electrobun.config.ts.
//
// V21: requires bundleCEF: true + remote-debugging-port set.
// System webview support deferred (see specs/roadmap.md).

export type CDPTarget = {
  id: string;
  type: string; // "page" | "iframe" | "worker" | "shared_worker" | "browser" | "other"
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  description?: string;
  devtoolsFrontendUrl?: string;
  parentId?: string;
};

export type CDPCommand = {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
};

export type CDPResponse =
  | { id: number; result: Record<string, unknown>; sessionId?: string }
  | { id: number; error: { code: number; message: string; data?: unknown }; sessionId?: string };

export type CDPEvent = {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
};

export class CDPError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = "CDPError";
  }
}

// Connect once at startup and reuse. Each CDP target gets its own WebSocket
// (CDP uses target-scoped connections by default).
//
// We use the "flat" session model: one root browser-level WebSocket, then
// attachToTarget + sessionId for per-page commands.
export class CDPClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>();
  private eventListeners = new Map<string, Set<(e: CDPEvent) => void>>();
  private browserUrl: string;

  constructor(private port: number, private host = "localhost") {
    this.browserUrl = `ws://${host}:${port}/devtools/browser`;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    // First, discover the browser-level WebSocket via the HTTP /json/version endpoint.
    const versionRes = await fetch(`http://${this.host}:${this.port}/json/version`);
    if (!versionRes.ok) {
      throw new CDPError(
        `Could not reach CDP at http://${this.host}:${this.port}. Is your electrobun app running in dev mode with chromiumFlags['remote-debugging-port'] set?`,
      );
    }
    const version = (await versionRes.json()) as { webSocketDebuggerUrl: string };

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(version.webSocketDebuggerUrl);
      this.ws = ws;
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", (e) => reject(new CDPError(`CDP WebSocket error: ${e}`)));
      ws.addEventListener("close", () => {
        this.ws = null;
        for (const { reject } of this.pending.values()) {
          reject(new CDPError("CDP connection closed"));
        }
        this.pending.clear();
      });
      ws.addEventListener("message", (msg) => this.handleMessage(msg.data as string));
    });
  }

  private handleMessage(raw: string): void {
    let msg: CDPResponse | CDPEvent;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Response (has id)
    if ("id" in msg && typeof msg.id === "number") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if ("error" in msg) {
        pending.reject(new CDPError(msg.error.message, msg.error.code));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Event (no id, has method)
    if ("method" in msg) {
      const listeners = this.eventListeners.get(msg.method);
      if (listeners) {
        for (const l of listeners) {
          try {
            l(msg);
          } catch {
            // swallow listener errors
          }
        }
      }
    }
  }

  async send<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    const id = this.nextId++;
    const cmd: CDPCommand = { id, method };
    if (params) cmd.params = params;
    if (sessionId) cmd.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(cmd));
      // 10s timeout per command
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new CDPError(`CDP timeout: ${method}`));
        }
      }, 10_000);
    });
  }

  on(method: string, listener: (e: CDPEvent) => void): () => void {
    let set = this.eventListeners.get(method);
    if (!set) {
      set = new Set();
      this.eventListeners.set(method, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  async listTargets(): Promise<CDPTarget[]> {
    const res = await fetch(`http://${this.host}:${this.port}/json/list`);
    if (!res.ok) throw new CDPError("Could not list CDP targets");
    return (await res.json()) as CDPTarget[];
  }

  async attachToTarget(targetId: string): Promise<string> {
    const { sessionId } = await this.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true },
    );
    return sessionId;
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Cache one client per port. Lazy init.
const clients = new Map<number, CDPClient>();

export function getCDPClient(port: number): CDPClient {
  let c = clients.get(port);
  if (!c) {
    c = new CDPClient(port);
    clients.set(port, c);
  }
  return c;
}

// Cache attached sessions per (port, targetId).
const sessions = new Map<string, string>();

export async function ensureSession(client: CDPClient, port: number, targetId: string): Promise<string> {
  const key = `${port}:${targetId}`;
  const existing = sessions.get(key);
  if (existing) return existing;
  const sessionId = await client.attachToTarget(targetId);
  sessions.set(key, sessionId);
  return sessionId;
}
