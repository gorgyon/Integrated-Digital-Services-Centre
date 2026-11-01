import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0000_m03_shared_schema.sql", "utf8");

describe("M03 shared schema migration", () => {
  it("creates the five shared tables", () => {
    for (const table of [
      "user_roles",
      "customer_profiles",
      "files",
      "orders",
      "employment_applications",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("enables row-level security on every table", () => {
    const tables = sql.match(/create table public\.(\w+)/g) ?? [];
    expect(tables.length).toBe(5);
    for (const t of tables) {
      const name = t.replace("create table public.", "");
      expect(sql).toContain(`alter table public.${name} enable row level security`);
    }
  });

  it("grants data access for every table (RLS alone is not enough)", () => {
    for (const table of [
      "user_roles",
      "customer_profiles",
      "files",
      "orders",
      "employment_applications",
    ]) {
      expect(sql.toLowerCase()).toContain(`grant all on public.${table} to service_role`);
    }
  });

  it("keeps business orders and employment applications as separate entities", () => {
    expect(sql).toContain("create table public.orders");
    expect(sql).toContain("create table public.employment_applications");
    // Neither table may reference the other — they share only the customer.
    const ordersBlock = sql.slice(
      sql.indexOf("create table public.orders"),
      sql.indexOf("grant select, insert, update on public.orders"),
    );
    const applicationsBlock = sql.slice(
      sql.indexOf("create table public.employment_applications"),
      sql.indexOf("grant select, insert, update on public.employment_applications"),
    );
    expect(ordersBlock).not.toContain("employment_applications");
    expect(applicationsBlock).not.toContain("orders");
  });

  it("enforces guest minimum details (name + phone, no ID number)", () => {
    expect(sql).toContain("guest_minimum_details");
    expect(sql).toContain("full_name text not null");
    expect(sql).toContain("phone text not null");
    expect(sql).not.toMatch(/id_number|identity_number|national_id/i);
  });

  it("stores roles in a separate table with a security-definer check", () => {
    expect(sql).toContain("create type public.app_role as enum");
    expect(sql).toContain("unique (user_id, role)");
    expect(sql).toContain("security definer");
    expect(sql).toContain("public.has_role");
  });

  it("restricts Cash on Collection to centre-collected orders", () => {
    expect(sql).toContain("cash_on_collection_requires_centre_collection");
    expect(sql).toContain("pending_cash_requires_coc_method");
    expect(sql).toContain("paid_requires_method");
  });

  it("keeps one reusable file record per upload with purpose-based access", () => {
    expect(sql).toContain("create type public.file_category as enum");
    expect(sql).toContain("storage_path text not null unique");
    expect(sql).toContain("purpose text not null");
  });
});
