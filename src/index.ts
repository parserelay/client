import type { ScanEnvelope, ScanRequest, ScanResponse } from "@parserelay/core";

export interface ParseRelayClientOptions {
  /** API key. Sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string;
  /** Override the base URL. Defaults to the hosted API. */
  baseUrl?: string;
  /** Optional custom fetch (for testing / non-browser runtimes). */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.parserelay.app";

export class ParseRelayError extends Error {
  /** Machine-readable error code from the body, if present. */
  readonly code?: string;

  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
    code?: string,
  ) {
    super(message);
    this.name = "ParseRelayError";
    this.code = code;
  }

  /** Build from an HTTP error response, parsing the `{ error: { code, message } }` body. */
  static fromResponse(status: number, body: unknown): ParseRelayError {
    const err = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
    const code = typeof err?.code === "string" ? err.code : undefined;
    const message =
      typeof err?.message === "string" ? err.message : `scan failed with status ${status}`;
    return new ParseRelayError(message, status, body, code);
  }
}

/**
 * Thin client over `POST /v1/scan`.
 *
 * - Without `relay`: resolves to the full `ScanEnvelope` (sync).
 * - With `relay`: resolves to `{ scan_id, status: "accepted" }` (async); the
 *   envelope is later POSTed to your webhook.
 *
 * Use `isEnvelope()` from `@parserelay/core` to narrow the result.
 */
export class ParseRelayClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ParseRelayClientOptions) {
    if (!opts.apiKey) throw new Error("ParseRelayClient: apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const baseFetch = opts.fetch ?? globalThis.fetch;
    if (!baseFetch) {
      throw new Error("ParseRelayClient: no fetch available; pass one via options.fetch");
    }
    // Native fetch must keep its `window` binding: a stored bare reference throws
    // "Illegal invocation" when later called as a method. Bind the global one;
    // a caller-supplied fetch is used as-is.
    this.fetchImpl = opts.fetch ?? baseFetch.bind(globalThis);
  }

  /** fetch → text → JSON parse → throw ParseRelayError on non-2xx → typed body.
   *  The bearer auth header is always attached; callers add content-type/body. */
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      // init.headers last on purpose: callers may override auth (e.g. a future
      // unauthenticated endpoint passing no Authorization).
      headers: { authorization: `Bearer ${this.apiKey}`, ...init.headers },
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }

    if (!res.ok) {
      throw ParseRelayError.fromResponse(res.status, body);
    }

    return body as T;
  }

  /** Run a scan. Generic over your field schema for a typed `fields` result. */
  async scan<Fields = Record<string, unknown>>(
    request: ScanRequest,
  ): Promise<ScanResponse<Fields>> {
    return this.request<ScanResponse<Fields>>("/v1/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  /**
   * The remaining prepaid credit balance for the account this API key belongs to
   * (`GET /v1/credits`). Useful for showing "credits left" in a consumer app.
   */
  async balance(): Promise<{ credits: number }> {
    return this.request<{ credits: number }>("/v1/credits", { method: "GET" });
  }
}

/** Convenience: narrow a response to the full envelope (re-exported for ergonomics). */
export { isEnvelope } from "@parserelay/core";
export type {
  ScanRequest,
  ScanResponse,
  ScanEnvelope,
} from "@parserelay/core";

export type { ScanEnvelope as Envelope };
