import { describe, expect, it } from "vitest";
import { passwordStrength, validateRecoveryPassword } from "@/lib/password-recovery";
import { friendlyError } from "@/routes/auth";

describe("Password recovery validation", () => {
  it("requires at least eight characters", () => {
    expect(validateRecoveryPassword("Aa1!xxx", "Aa1!xxx")).not.toBeNull();
    expect(validateRecoveryPassword("Aa1!xxxx", "Aa1!xxxx")).toBeNull();
  });
  it("requires matching confirmation", () => {
    expect(validateRecoveryPassword("NewPassword123!", "OtherPassword123!")).not.toBeNull();
    expect(validateRecoveryPassword("NewPassword123!", "NewPassword123!")).toBeNull();
  });
  it.each([
    ["uppercase", "password1!"],
    ["lowercase", "PASSWORD1!"],
    ["number", "Password!"],
    ["special character", "Password1"],
    ["non-whitespace special character", "Password1 "],
  ])("requires a %s", (_rule, password) => {
    expect(validateRecoveryPassword(password, password)).not.toBeNull();
    expect(validateRecoveryPassword("Password1!", "Password1!")).toBeNull();
  });
  it("reports four progressive strength levels", () => {
    expect(passwordStrength("a").label).toBe("Weak");
    expect(passwordStrength("Ab1").label).toBe("Fair");
    expect(passwordStrength("Ab1!").label).toBe("Good");
    expect(passwordStrength("Ab1!xxxx").label).toBe("Strong");
  });
});