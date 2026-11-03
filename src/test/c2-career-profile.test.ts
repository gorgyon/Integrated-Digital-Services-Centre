// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
async function asUser(n: number) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false);`);
}
const save = (entry: string | null, data: object, file: string | null = null) =>
  db.query<{ id: string }>(`SELECT public.save_career_draft($1,'skill',$2::jsonb,$3) AS id`, [entry, JSON.stringify(data), file]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;`);
  for (const f of ["0000_m03_shared_schema", "0001_m04_security_boundaries", "0002_m04_explicit_grant_hardening", "0003_m04_immutable_security_audit", "0006_c1_career_documents", "0007_c2_career_profile", "0010_c25_private_document_reading", "0011_c2_c25_profile_draft_integration"]) {
    await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
  }
  await db.exec(`INSERT INTO auth.users(id) VALUES('${id(1)}'),('${id(2)}');
    INSERT INTO public.user_roles(user_id,role) VALUES('${id(1)}','customer'),('${id(2)}','customer');
    INSERT INTO public.customer_profiles(id,user_id,full_name,phone,is_guest) VALUES
      ('${id(101)}','${id(1)}','Customer A','0710000001',false),('${id(102)}','${id(2)}','Customer B','0710000002',false);
    INSERT INTO public.files(id,customer_id,category,purpose,storage_path,original_name) VALUES
      ('${id(201)}','${id(101)}','career','career_document','a/x.pdf','x.pdf'),
      ('${id(202)}','${id(102)}','career','career_document','b/y.pdf','y.pdf');`);
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("RESET ROLE; BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); });

describe("C2 career profile", () => {
  it("refuses a duplicate manual entry in the same section", async () => {
    await asUser(1);
    await save(null, { name: "Excel" });
    await expect(save(null, { name: "excel" })).rejects.toThrow(/already/);
  });
  it("new entries stay drafts until confirmed, and confirmation is audited", async () => {
    await asUser(1);
    const e = (await save(null, { name: "Excel" }, id(201))).rows[0]!.id;
    let row = (await db.query<any>(`SELECT confirmed_data,draft_data FROM public.career_profile_entries WHERE id='${e}'`)).rows[0];
    expect(row).toEqual({ confirmed_data: null, draft_data: { name: "Excel" } });
    await db.query(`SELECT public.confirm_career_profile()`);
    row = (await db.query<any>(`SELECT confirmed_data,draft_data,confirmed_file_id FROM public.career_profile_entries WHERE id='${e}'`)).rows[0];
    expect(row).toEqual({ confirmed_data: { name: "Excel" }, draft_data: null, confirmed_file_id: id(201) });
    await db.exec("RESET ROLE");
    const audit = (await db.query(`SELECT 1 FROM public.security_audit WHERE action='career_profile_confirmed' AND actor_id='${id(1)}'`)).rows;
    expect(audit).toHaveLength(1);
  });
  it("editing a confirmed entry leaves confirmed data unchanged until confirmation", async () => {
    await asUser(1);
    const e = (await save(null, { name: "Excel" })).rows[0]!.id;
    await db.query(`SELECT public.confirm_career_profile()`);
    await save(e, { name: "Advanced Excel" });
    const row = (await db.query<any>(`SELECT confirmed_data,draft_data FROM public.career_profile_entries WHERE id='${e}'`)).rows[0];
    expect(row).toEqual({ confirmed_data: { name: "Excel" }, draft_data: { name: "Advanced Excel" } });
  });
  it("customers cannot read, edit or link another customer's entries or documents", async () => {
    await asUser(1);
    const e = (await save(null, { name: "Excel" })).rows[0]!.id;
    await expect(save(null, { name: "x" }, id(202))).rejects.toThrow(/Access denied/);
    await db.exec("ROLLBACK; BEGIN");
    await asUser(1);
    const e2 = (await save(null, { name: "Excel" })).rows[0]!.id;
    await asUser(2);
    expect((await db.query(`SELECT 1 FROM public.career_profile_entries WHERE id='${e2}'`)).rows).toHaveLength(0);
    await expect(save(e2, { name: "hacked" })).rejects.toThrow(/Access denied/);
    expect(e).toBeTruthy();
  });
  it("direct table writes are refused", async () => {
    await asUser(1);
    await expect(db.query(`INSERT INTO public.career_profile_entries(customer_id,kind,confirmed_data) VALUES('${id(101)}','skill','{}')`)).rejects.toThrow(/permission denied/);
  });
});
