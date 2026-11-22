// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmedProfile, matchOpportunity, type CareerEntryLike, type OpportunityLike } from "@/lib/opportunities/matching";

const entry = (kind: string, data: Record<string, string> | null, draft?: Record<string, string>): CareerEntryLike => ({
  kind, confirmed_data: data, ...(draft ? { draft_data: draft } : {}),
});
const opportunity = (overrides: Partial<OpportunityLike> = {}): OpportunityLike => ({
  title: "Developer", description: null, eligibility_criteria: null, application_requirements: null,
  location_restrictions: null, south_africa_eligibility: "not_stated", ...overrides,
});
const now = new Date("2026-11-22T00:00:00Z");

describe("C4 transparent vacancy matching", () => {
  it("does not assume matric is compulsory", () => {
    const profile = confirmedProfile([entry("skill", { name: "Communication" })]);
    const result = matchOpportunity(opportunity({ eligibility_criteria: "Excellent communication skills required" }), profile, now);
    expect(result.status).toBe("eligible");
    expect(result.mandatory[0]?.met).toBe(true);
  });

  it("treats missing matric information as potential, never as a rejection", () => {
    const result = matchOpportunity(opportunity({ eligibility_criteria: "Matric or National Senior Certificate required" }), confirmedProfile([]), now);
    expect(result.status).toBe("potential");
    expect(result.missing).toContain("Matric or National Senior Certificate required");
  });

  it("does not turn an explicit no-matric waiver into a requirement", () => {
    const profile = confirmedProfile([entry("skill", { name: "Communication" })]);
    const result = matchOpportunity(opportunity({ eligibility_criteria: "No matric required. Excellent communication skills required" }), profile, now);
    expect(result.status).toBe("eligible");
    expect(result.mandatory.some((item) => /matric/i.test(item.text))).toBe(false);
  });

  it("rejects a diploma for a mandatory bachelor's degree", () => {
    const profile = confirmedProfile([entry("education", { level: "National Diploma in Information Technology", institution: "TUT" })]);
    const result = matchOpportunity(opportunity({ eligibility_criteria: "Bachelor's degree required" }), profile, now);
    expect(result.status).toBe("not_eligible");
    expect(result.unmet).toEqual(["Bachelor's degree required"]);
  });

  it("uses confirmed modules to support a qualification specialisation", () => {
    const profile = confirmedProfile([
      entry("education", { level: "Diploma in Information Technology", institution: "TUT" }),
      entry("result", { subject: "Software Development", grade: "72%", qualification: "Diploma in Information Technology" }),
    ]);
    const result = matchOpportunity(opportunity({ eligibility_criteria: "Diploma in Software Development required" }), profile, now);
    expect(result.status).toBe("eligible");
    expect(result.matched.join(" ")).toContain("Software Development");
  });

  it("ignores unconfirmed draft skills", () => {
    const profile = confirmedProfile([entry("skill", null, { name: "Python" })]);
    const result = matchOpportunity(opportunity({ eligibility_criteria: "Python required" }), profile, now);
    expect(result.status).toBe("potential");
    expect(result.matched).toEqual([]);
  });

  it("keeps preferred requirements separate and does not reject when they are missing", () => {
    const profile = confirmedProfile([entry("education", { level: "Bachelor of Computer Science" })]);
    const result = matchOpportunity(opportunity({ description: "Requirements: Bachelor's degree in Computer Science required. Preferred qualifications: Python preferred." }), profile, now);
    expect(result.status).toBe("eligible");
    expect(result.preferred[0]?.met).toBeNull();
  });

  it("uses dated experience and rejects a clearly insufficient mandatory duration", () => {
    const profile = confirmedProfile([entry("experience", { role: "Intern", period: "January 2024 - December 2024" })]);
    const result = matchOpportunity(opportunity({ eligibility_criteria: "At least 3 years experience required" }), profile, now);
    expect(result.status).toBe("not_eligible");
  });

  it("does not double-count overlapping employment periods", () => {
    const profile = confirmedProfile([
      entry("experience", { role: "Assistant", period: "2022 - 2024" }),
      entry("experience", { role: "Tutor", period: "2023 - 2024" }),
    ]);
    const result = matchOpportunity(opportunity({ eligibility_criteria: "4 years work experience required" }), profile, now);
    expect(result.status).toBe("not_eligible");
  });

  it("recognises a licence mismatch but does not reject when licence information is missing", () => {
    const requirement = "Code 10 driver's licence required";
    expect(matchOpportunity(opportunity({ eligibility_criteria: requirement }), confirmedProfile([]), now).status).toBe("potential");
    const profile = confirmedProfile([entry("qualification", { title: "Code 8 driver's licence" })]);
    expect(matchOpportunity(opportunity({ eligibility_criteria: requirement }), profile, now).status).toBe("not_eligible");
  });

  it("does not reject a location-restricted listing when location is missing", () => {
    const result = matchOpportunity(opportunity({ location_restrictions: ["Germany"], south_africa_eligibility: "restricted_elsewhere" }), confirmedProfile([]), now);
    expect(result.status).toBe("potential");
  });

  it("rejects a confirmed South African location for a Germany-only listing", () => {
    const profile = confirmedProfile([entry("personal", { full_name: "Applicant", location: "Polokwane, Limpopo" })]);
    const result = matchOpportunity(opportunity({ location_restrictions: ["Germany"], south_africa_eligibility: "restricted_elsewhere" }), profile, now);
    expect(result.status).toBe("not_eligible");
  });

  it("keeps an opportunity with no clear mandatory requirements as a potential match", () => {
    const result = matchOpportunity(opportunity({ description: "Join our friendly team and help build useful software." }), confirmedProfile([]), now);
    expect(result.status).toBe("potential");
    expect(result.mandatory).toEqual([]);
  });
});

describe("C4 saved opportunity ownership", () => {
  let db: PGlite;
  const uid = "00000000-0000-4000-8000-000000000041";
  const otherUid = "00000000-0000-4000-8000-000000000042";
  const customer = "00000000-0000-4000-8000-000000000043";
  const active = "00000000-0000-4000-8000-000000000044";
  const expired = "00000000-0000-4000-8000-000000000045";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;`);
    for (const file of ["0000_m03_shared_schema", "0001_m04_security_boundaries", "0002_m04_explicit_grant_hardening", "0003_m04_immutable_security_audit", "0008_c3_opportunities", "0009_c3_source_attribution_and_cache", "0018_c4_saved_opportunities"]) {
      await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
    }
    await db.exec(`INSERT INTO public.customer_profiles(id,user_id,full_name,phone,is_guest) VALUES ('${customer}','${uid}','Test Applicant','0720000000',false);
      INSERT INTO public.opportunities(id,title,source_url,dedupe_key,content_hash,closes_at) VALUES
      ('${active}','Open','https://a.example/open','open','h','2999-01-01'),('${expired}','Expired','https://a.example/expired','expired','h','2000-01-01');`);
  }, 60000);
  afterAll(async () => { await db?.close(); });

  it("allows only the owner to save and read, refuses expired vacancies and audits changes", async () => {
    await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid}',false);
      INSERT INTO public.saved_opportunities(customer_id,opportunity_id) VALUES ('${customer}','${active}');`);
    expect((await db.query(`SELECT opportunity_id FROM public.saved_opportunities`)).rows).toHaveLength(1);
    await expect(db.exec(`INSERT INTO public.saved_opportunities(customer_id,opportunity_id) VALUES ('${customer}','${expired}')`)).rejects.toThrow(/row-level security/);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${otherUid}',false);`);
    expect((await db.query(`SELECT opportunity_id FROM public.saved_opportunities`)).rows).toHaveLength(0);
    await expect(db.exec(`INSERT INTO public.saved_opportunities(customer_id,opportunity_id) VALUES ('${customer}','${active}')`)).rejects.toThrow(/row-level security/);
    await db.exec("RESET ROLE");
    expect((await db.query(`SELECT action FROM public.security_audit WHERE resource_type='saved_opportunities'`)).rows).toHaveLength(1);
  });
});
