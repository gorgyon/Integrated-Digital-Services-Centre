import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

const mk = () =>
  createRouter({ routeTree, context: { queryClient: new QueryClient() } });

describe("M05 authentication routing", () => {
  it("serves public customer and staff sign-in pages", () => {
    const router = mk();
    expect(router.matchRoutes("/auth").at(-1)?.routeId).toBe("/auth");
    expect(router.matchRoutes("/staff/sign-in").at(-1)?.routeId).toBe(
      "/staff/sign-in",
    );
  });

  it("places account and staff areas behind the authenticated gate", () => {
    const router = mk();
    for (const path of ["/account", "/staff"]) {
      const ids = router.matchRoutes(path).map((m) => m.routeId);
      expect(ids).toContain("/_authenticated");
    }
  });

  it("nests the staff area under the staff role gate", () => {
    const router = mk();
    const ids = router.matchRoutes("/staff").map((m) => m.routeId);
    expect(ids.some((id) => id.startsWith("/_authenticated/staff"))).toBe(true);
  });
});

describe("M05 frontend credential safety", () => {
  it("exposes no privileged credentials in frontend source", () => {
    const roots = ["src/routes", "src/components", "src/lib"];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(p);
      }
    };
    for (const root of roots) walk(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/SERVICE_ROLE|sb_secret_|service_role_key/);
    }
  });
});
