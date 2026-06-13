# @parserelay/client

Thin REST client for the [ParseRelay](https://parserelay.app) `scan` API.

```ts
import { ParseRelayClient, isEnvelope } from "@parserelay/client";

const client = new ParseRelayClient({ apiKey: process.env.PARSERELAY_KEY! });

const result = await client.scan<{ merchant: string; total: number }>({
  image: "https://…/receipt.jpg",
  schema: ["merchant", "total", "date"],
  doc_type: "receipt",
  engine: "auto",
});

if (isEnvelope(result)) {
  console.log(result.fields.total, result.needs_review);
} else {
  // relay path: { scan_id, status: "accepted" } — envelope arrives at your webhook
  console.log("queued:", result.scan_id);
}
```
