import { describe, expect, it } from "vitest";
// Tooling is JavaScript so it also runs independently without a TS compiler.
// @ts-expect-error Plain JavaScript deployment tooling has no declaration file.
import { checkEnvironment } from "../../scripts/check-environment.mjs";
import { platform } from "@/lib/platform";

describe("M02 operating boundaries", () => {
  it("needs no credentials or connected services", () => {
    expect(checkEnvironment({})).toEqual([]);
  });
  it("rejects browser-visible private credentials", () => {
    expect(checkEnvironment({ VITE_PAYSTACK_SECRET_KEY: "dummy-test-value" })).toHaveLength(1);
    expect(checkEnvironment({ VITE_SUPABASE_SERVICE_ROLE_KEY: "dummy-test-value" })).toHaveLength(1);
  });
  it("rejects credentials embedded in the public application URL", () => {
    expect(checkEnvironment({ VITE_APP_URL: "https://test:dummy@example.test" })).toHaveLength(1);
  });
  it("requires the future public Cloud configuration as a pair", () => {
    expect(checkEnvironment({ VITE_SUPABASE_URL: "https://example.test" })).toHaveLength(1);
  });
  it("keeps the initial platform English only", () => {
    expect(platform.language).toBe("en");
  });
  it("does not enable business functionality in M02", () => {
    expect(platform.businessFeaturesEnabled).toBe(false);
    expect(platform.milestone).toBe("M02");
  });
});