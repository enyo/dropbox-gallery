import { describe, it, expect } from "vitest";
import { signPayload, verifyPayload } from "./crypto";

const SECRET = "test-secret-0123456789";

describe("signPayload / verifyPayload", () => {
  it("round-trips a payload", () => {
    const payload = { id: "/test/festival", n: 42, ok: true };
    const token = signPayload(payload, SECRET);
    expect(verifyPayload(token, SECRET)).toEqual(payload);
  });

  it("rejects a tampered payload body", () => {
    const token = signPayload({ id: "a" }, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ id: "b" })).toString("base64url") + "." + sig;
    expect(forged).not.toEqual(body + "." + sig);
    expect(verifyPayload(forged, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signPayload({ id: "a" }, SECRET);
    expect(verifyPayload(token, "other-secret")).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyPayload("", SECRET)).toBeNull();
    expect(verifyPayload("no-dot", SECRET)).toBeNull();
    expect(verifyPayload(".sig", SECRET)).toBeNull();
  });
});
