// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/opportunities/adapters";
import { isActive, normalise } from "@/lib/opportunities/normalise";

const feed = `<rss><channel>
<item><guid>a1</guid><title>Graduate Internship</title><link>https://www.example.gov.za/x?utm_source=f#top</link><category>Internship</category></item>
<item><title>No link here</title></item></channel></rss>`;

describe("C3 normalising collected items", () => {
  it("keeps only stated fields and never invents missing details", () => {
    const [a, b] = parseFeed(feed).map((r) => normalise(r, null));
    expect(a).toMatchObject({ title: "Graduate Internship", category: "internship", source_url: "https://example.gov.za/x", closes_at: null, provider_name: null, location: null });
    expect(b).toBeNull();
  });
  it("same title, organisation and closing date produce the same duplicate key", () => {
    const x = normalise({ title: "Bursary 2027", provider: "Dept A", closesAt: "2027-01-31", link: "https://a.example/1" }, "bursary")!;
    const y = normalise({ title: "bursary  2027", provider: "DEPT A", closesAt: "2027-01-31", link: "https://b.example/9" }, "bursary")!;
    expect(x.dedupe_key).toBe(y.dedupe_key);
  });
  it("listings past their closing date are not active", () => {
    const today = new Date("2026-11-03");
    expect(isActive({ closes_at: "2026-11-02" }, today)).toBe(false);
    expect(isActive({ closes_at: "2026-11-03" }, today)).toBe(true);
  });
});

describe("C3 database rules", () => {
  let db: PGlite;
  const uid = "00000000-0000-4000-8000-000000000001";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;`);
    for (const f of ["0000_m03_shared_schema", "0001_m04_security_boundaries", "0002_m04_explicit_grant_hardening", "0003_m04_immutable_security_audit", "0008_c3_opportunities"]) {
      await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
    }
    await db.exec(`INSERT INTO public.opportunities(title,source_url,dedupe_key,content_hash,closes_at) VALUES
      ('Open','https://a.example/1','k1','h','2999-01-01'),('Closed','https://a.example/2','k2','h','2000-01-01');`);
  }, 60000);
  afterAll(async () => { await db?.close(); });

  it("a source cannot be enabled without recorded permission", async () => {
    await expect(db.exec(`INSERT INTO public.opportunity_sources(name,kind,endpoint_url,enabled) VALUES('X','rss','https://x.example/feed',true)`))
      .rejects.toThrow(/permission/);
  });
  it("signed-in users see only active listings and cannot create listings", async () => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid}',false);`);
    const rows = (await db.query<{ title: string }>(`SELECT title FROM public.opportunities`)).rows;
    expect(rows.map((r) => r.title)).toEqual(["Open"]);
    await expect(db.exec(`INSERT INTO public.opportunities(title,source_url,dedupe_key,content_hash) VALUES('Manual','https://m.example','k3','h')`))
      .rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});
