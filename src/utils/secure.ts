import crypto from "node:crypto";

const CALLBACK_TTL_MS = 5 * 60 * 1000;

export interface SignedPayload<T> {
  payload: T;
  issuedAt: number;
  signature: string;
}

const secret = crypto.randomBytes(32);

function sign(data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function encodeCallbackPayload<T>(payload: T): string {
  const issuedAt = Date.now();
  const body = JSON.stringify({ payload, issuedAt });
  const signature = sign(body);
  return Buffer.from(JSON.stringify({ payload, issuedAt, signature }), "utf-8").toString("base64url");
}

export function decodeCallbackPayload<T>(raw: string): T {
  const decoded = Buffer.from(raw, "base64url").toString("utf-8");
  const parsed = JSON.parse(decoded) as SignedPayload<T>;
  const expected = sign(JSON.stringify({ payload: parsed.payload, issuedAt: parsed.issuedAt }));
  if (expected !== parsed.signature) {
    throw new Error("Invalid callback signature");
  }

  if (Date.now() - parsed.issuedAt > CALLBACK_TTL_MS) {
    throw new Error("Callback payload expired");
  }

  return parsed.payload;
}
