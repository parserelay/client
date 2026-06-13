import type { ScanAccepted, ScanEnvelope } from "@parserelay/core";
import { describe, expect, it, vi } from "vitest";
import { ParseRelayClient, ParseRelayError } from "./index";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

const envelope: ScanEnvelope = {
  scan_id: "scn_1",
  status: "ok",
  fields: { merchant: "Blue Bottle", total: 18.5 },
  confidence: { merchant: 0.98, total: 0.91 },
  needs_review: [],
  raw_text: "…",
  meta: {
    engine: "ocr+rescue",
    model: "claude-haiku-4-5",
    ocr_backend: "paddle",
    latency_ms: 12,
    tokens: { input: 1180, output: 95, credits: 2 },
    scan_credits: 1,
    total_credits: 3,
  },
};

describe("ParseRelayClient", () => {
  it("throws when apiKey is missing", () => {
    expect(() => new ParseRelayClient({ apiKey: "" })).toThrow(/apiKey is required/);
  });

  it("throws when no fetch is available (no global, none passed)", () => {
    vi.stubGlobal("fetch", undefined);
    try {
      expect(() => new ParseRelayClient({ apiKey: "k" })).toThrow(/no fetch available/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sync path resolves to the full envelope and sends the right request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, envelope));
    const client = new ParseRelayClient({ apiKey: "secret", fetch: fetchMock });

    const res = await client.scan({ image: "data:image/png;base64,AAA" });

    expect(res).toEqual(envelope);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.parserelay.app/v1/scan");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer secret");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toMatchObject({ image: "data:image/png;base64,AAA" });
  });

  it("relay path resolves to { scan_id, status: 'accepted' }", async () => {
    const accepted: ScanAccepted = { scan_id: "scn_async", status: "accepted" };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(202, accepted));
    const client = new ParseRelayClient({ apiKey: "k", fetch: fetchMock });

    const res = await client.scan({
      image: "https://x/y.jpg",
      relay: { url: "https://hook.example/scan", idempotency_key: "idem_1" },
    });

    expect(res).toEqual(accepted);
  });

  it("balance() GETs /v1/credits and returns the credits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, { credits: 4216.5 }));
    const client = new ParseRelayClient({ apiKey: "secret", fetch: fetchMock });

    const res = await client.balance();

    expect(res).toEqual({ credits: 4216.5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.parserelay.app/v1/credits");
    expect(init.method).toBe("GET");
    expect(init.headers.authorization).toBe("Bearer secret");
  });

  it("non-2xx throws ParseRelayError with status + parsed body", async () => {
    const body = { error: { code: "rate_limited", message: "slow down" } };
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(429, body));
    const client = new ParseRelayClient({ apiKey: "k", fetch: fetchMock });

    const err = await client.scan({ image: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(ParseRelayError);
    expect(err.status).toBe(429);
    expect(err.body).toEqual(body);
    // parses the documented { error: { code, message } } shape
    expect(err.code).toBe("rate_limited");
    expect(err.message).toBe("slow down");
  });

  it("honours a custom baseUrl and trims a trailing slash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, envelope));
    const client = new ParseRelayClient({
      apiKey: "k",
      baseUrl: "https://eu.parserelay.app/",
      fetch: fetchMock,
    });

    await client.scan({ image: "x" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://eu.parserelay.app/v1/scan");
  });
});
