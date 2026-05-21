// WS client to electrobun-devtools server running inside the user's app.
// Handles handshake, version-lock check, request/response correlation.
// v0.2.4: token removed — server binds 127.0.0.1 only, single-user dev box.

const PROTOCOL_VERSION = "0.2";
const PLUGIN_VERSION = "0.2.0";

export class DevtoolsError extends Error {
  constructor(message: string, public kind?: "version-mismatch" | "in-prod" | "transport") {
    super(message);
    this.name = "DevtoolsError";
  }
}

type ServerMessage =
  | { kind: "hello"; pkg: string; pkgVersion: string; protocolVersion: string }
  | { kind: "auth-ok" }
  | { kind: "auth-error"; reason: string; message: string }
  | { kind: "tool-result"; id: string; ok: boolean; data?: unknown; error?: string };

export class DevtoolsClient {
  private ws: WebSocket | null = null;
  private authed = false;
  private pending = new Map<string, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private connecting: Promise<void> | null = null;
  private nextId = 1;

  constructor(private port: number, private host = "127.0.0.1") {}

  private versionsMatch(a: string, b: string): boolean {
    const [am, an] = a.split(".");
    const [bm, bn] = b.split(".");
    return am === bm && an === bn;
  }

  async connect(): Promise<void> {
    if (this.authed) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.host}:${this.port}`);
      this.ws = ws;

      let helloHandled = false;

      ws.addEventListener("message", (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        if (!helloHandled && msg.kind === "hello") {
          helloHandled = true;
          if (!this.versionsMatch(msg.protocolVersion, PROTOCOL_VERSION)) {
            ws.close();
            reject(
              new DevtoolsError(
                `electrobun-devtools protocol ${msg.protocolVersion} != plugin ${PROTOCOL_VERSION}. Upgrade electrobun-devtools (or the plugin).`,
                "version-mismatch",
              ),
            );
            return;
          }
          ws.send(
            JSON.stringify({
              kind: "auth",
              protocolVersion: PROTOCOL_VERSION,
            }),
          );
          return;
        }

        if (msg.kind === "auth-ok") {
          this.authed = true;
          resolve();
          return;
        }

        if (msg.kind === "auth-error") {
          reject(new DevtoolsError(msg.message, msg.reason as "version-mismatch" | "in-prod"));
          ws.close();
          return;
        }

        if (msg.kind === "tool-result") {
          const pending = this.pending.get(msg.id);
          if (!pending) return;
          this.pending.delete(msg.id);
          if (msg.ok) pending.resolve(msg.data);
          else pending.reject(new DevtoolsError(msg.error ?? "tool call failed"));
        }
      });

      ws.addEventListener("error", () => {
        reject(
          new DevtoolsError(
            `Could not reach electrobun-devtools at ws://${this.host}:${this.port}. ` +
              "Is your app running in dev mode and has it called `devtools.start({ port })`?",
            "transport",
          ),
        );
      });

      ws.addEventListener("close", () => {
        this.ws = null;
        this.authed = false;
        this.connecting = null;
        for (const { reject } of this.pending.values()) {
          reject(new DevtoolsError("devtools connection closed", "transport"));
        }
        this.pending.clear();
      });
    });

    return this.connecting;
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    await this.connect();
    if (!this.ws || !this.authed) {
      throw new DevtoolsError("not connected to electrobun-devtools", "transport");
    }
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ kind: "tool-call", id, name, args }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new DevtoolsError(`tool '${name}' timed out`, "transport"));
        }
      }, 15_000);
    });
  }

  close(): void {
    this.ws?.close();
  }
}

const clients = new Map<number, DevtoolsClient>();

export function getDevtoolsClient(port: number): DevtoolsClient {
  let c = clients.get(port);
  if (!c) {
    c = new DevtoolsClient(port);
    clients.set(port, c);
  }
  return c;
}

void PLUGIN_VERSION;
