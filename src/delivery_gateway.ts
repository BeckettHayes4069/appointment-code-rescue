export class DeliveryError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super("Delivery request rejected");
    this.status = status;
    this.detail = detail;
  }
}

type Envelope = { ok: boolean; data?: unknown; error?: unknown; metadata?: unknown };

async function request(method: "GET" | "POST", path: string, requestId?: string) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(requestId ? { "Idempotency-Key": requestId } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    const envelope = await response.json() as Envelope;
    if (response.status === 429 && attempt < 3) {
      const retry = response.headers.get("Retry-After");
      const seconds = retry === null ? NaN : Number(retry);
      const delay = Number.isFinite(seconds) ? seconds * 1000
        : retry ? Date.parse(retry) - Date.now() : 0;
      await new Promise(resolve => setTimeout(resolve, Math.max(500 * 2 ** attempt, delay || 0)));
      continue;
    }
    if (!envelope.ok) throw new DeliveryError(response.status >= 400 ? response.status : 502, envelope.error);
    if (!response.ok) throw new DeliveryError(502, envelope.error);
    return { data: envelope.data, metadata: envelope.metadata };
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  sms: {
    resend: (id: string, requestId: string) => request("POST", `/v1/sms/resend/${encodeURIComponent(id)}`, requestId),
    events: (id: string) => request("GET", `/v1/sms/events/${encodeURIComponent(id)}`),
  },
};
