import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createWechatSignature, verifyWechatSignature } from "./signature";

describe("wechat signature", () => {
  test("creates sorted sha1 input", () => {
    expect(createWechatSignature("token", "123", "abc")).toBe("123abctoken");
  });

  test("verifies valid signature", () => {
    const timestamp = "123";
    const nonce = "abc";
    const signature = createHash("sha1")
      .update(createWechatSignature("token", timestamp, nonce))
      .digest("hex");

    expect(
      verifyWechatSignature("token", { signature, timestamp, nonce })
    ).toBe(true);
  });
});
