import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("s3cret");
    expect(await verifyPassword("S3cret", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("uses a random salt, so equal passwords hash differently", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("produces the self-describing format", async () => {
    const stored = await hashPassword("x");
    expect(stored).toMatch(/^pbkdf2\$sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it("returns false for malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$sha256$0$aa$bb")).toBe(false);
  });

  it("verification honors the embedded iteration count", async () => {
    // Tampering the stored iteration count changes the derived key, so it fails.
    const parts = (await hashPassword("tune-me")).split("$");
    parts[2] = "1000";
    expect(await verifyPassword("tune-me", parts.join("$"))).toBe(false);
  });
});
