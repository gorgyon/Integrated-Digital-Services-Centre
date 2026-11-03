import { describe, expect, it } from "vitest";
import { validateRecoveryPassword } from "@/lib/password-recovery";

describe("Password recovery validation", () => {
  it("requires at least eight characters", () => {
    expect(validateRecoveryPassword("1234567", "1234567")).not.toBeNull();
    expect(validateRecoveryPassword("12345678", "12345678")).toBeNull();
  });
  it("requires matching confirmation", () => {
    expect(validateRecoveryPassword("NewPassword123", "OtherPassword123")).not.toBeNull();
    expect(validateRecoveryPassword("NewPassword123", "NewPassword123")).toBeNull();
  });
});