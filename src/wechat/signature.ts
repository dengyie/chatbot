import { createHash } from "node:crypto";

export type WechatSignatureParams = {
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
};

export function createWechatSignature(
  token: string,
  timestamp: string,
  nonce: string
): string {
  return [token, timestamp, nonce].sort().join("");
}

export function verifyWechatSignature(
  token: string,
  params: WechatSignatureParams
): boolean {
  const { signature, timestamp, nonce } = params;

  if (!signature || !timestamp || !nonce) {
    return false;
  }

  const expected = createHash("sha1")
    .update(createWechatSignature(token, timestamp, nonce))
    .digest("hex");

  return expected === signature;
}
