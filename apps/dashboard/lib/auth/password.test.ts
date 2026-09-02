import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("produces a different hash each time for the same password", async () => {
    const a = await hashPassword("hunter2hunter2");
    const b = await hashPassword("hunter2hunter2");

    expect(a).not.toBe(b);
  });

  it("produces a string carrying the scrypt parameters", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(stored.split("$")).toHaveLength(6);
  });
});

describe("verifyPassword", () => {
  it("accepts the password that produced the hash", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(await verifyPassword("hunter2hunter2", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(await verifyPassword("hunter2hunter3", stored)).toBe(false);
  });

  it("rejects an empty password against a real hash", async () => {
    const stored = await hashPassword("hunter2hunter2");

    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("returns false instead of throwing for a malformed stored value", async () => {
    expect(await verifyPassword("hunter2hunter2", "not-a-hash")).toBe(false);
    expect(await verifyPassword("hunter2hunter2", "")).toBe(false);
    expect(await verifyPassword("hunter2hunter2", "scrypt$16384$8$1$only-five-parts")).toBe(false);
    expect(await verifyPassword("hunter2hunter2", "bcrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });

  it("returns false when the stored parameters are not numbers", async () => {
    expect(await verifyPassword("hunter2hunter2", "scrypt$abc$8$1$c2FsdA==$aGFzaA==")).toBe(false);
  });
});
