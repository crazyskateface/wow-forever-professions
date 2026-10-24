import {
  productEventSchema,
  type ProductEvent,
} from "@forever-professions/contracts";

type ProductEventFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function recordProductEvent(
  event: ProductEvent,
  send: ProductEventFetch = fetch,
): Promise<void> {
  const boundedEvent = productEventSchema.parse(event);
  try {
    await send("/api/product-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(boundedEvent),
      credentials: "omit",
      keepalive: true,
      referrerPolicy: "no-referrer",
    });
  } catch {
    // Analytics must never interrupt planning, shopping, or checklist progress.
  }
}
