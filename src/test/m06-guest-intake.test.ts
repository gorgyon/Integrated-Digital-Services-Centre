// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actors = { customer: 1, admin: 3, front_desk: 4, designer: 5, print_operator: 6, career_support: 7, finance: 8, employer: 9 };
let db: PGlite;
async function asUser(n: number) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false);`);
}
const create = (name: string, phone: string, email: string | null, reviewed: string[] = []) =>
  db.query<{ id: string }>(
    `SELECT public.create_guest_customer($1,$2,$3,$4::uuid[]) AS id`,
    [name, phone, email, `{${reviewed.join(",")}}`],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;`);
  for (const f of ["0000_m03_shared_schema", "0001_m04_security_boundaries", "0002_m04_explicit_grant_hardening", "0003_m04_immutable_security_audit", "0005_m06_guest_intake"]) {
    await db.exec(readFileSync(`drizzle/migrations/${f}.sql`, "utf8"));
  }
  await db.exec(`INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,10) n;`);
  for (const [role, n] of Object.entries(actors)) {
    await db.exec(`INSERT INTO public.user_roles(user_id,role) VALUES('${id(n)}','${role}');`);
  }
  await db.exec(`INSERT INTO public.customer_profiles(id,user_id,full_name,phone,email,is_guest) VALUES
    ('${id(101)}','${id(1)}','Existing Person','071 234 5678','existing@example.test',false);`);
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("RESET ROLE; BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); });

describe("M06 guest customer intake", () => {
  it("front desk creates a guest with name and phone only (email blank)", async () => {
    await asUser(4);
    const newId = (await create("Walk In", "082 000 1111", null)).rows[0]!.id;
    const row = (await db.query(`SELECT user_id,is_guest,email,created_by FROM public.customer_profiles WHERE id='${newId}'`)).rows[0];
    expect(row).toEqual({ user_id: null, is_guest: true, email: null, created_by: id(4) });
  });
  for (const [role, n] of Object.entries(actors).filter(([r]) => r !== "front_desk")) {
    it(`${role} cannot create guest records`, async () => {
      await asUser(n);
      await expect(create("Walk In", "082 000 1111", null)).rejects.toThrow(/not authorised/);
    });
  }
  it("anonymous callers cannot create guest records", async () => {
    await db.exec("SET ROLE anon");
    await expect(create("Walk In", "082 000 1111", null)).rejects.toThrow(/permission denied/);
  });
  it("rejects missing name or invalid phone", async () => {
    await asUser(4);
    await expect(create(" ", "082 000 1111", null)).rejects.toThrow(/invalid full name/);
    await db.exec("ROLLBACK; BEGIN"); await asUser(4);
    await expect(create("Walk In", "12", null)).rejects.toThrow(/invalid phone/);
  });
  it("matching phone (different formatting) or email requires review", async () => {
    await asUser(4);
    const dupes = (await db.query(`SELECT id,matched_on FROM public.find_possible_duplicate_customers('0712345678','')`)).rows;
    expect(dupes).toEqual([{ id: id(101), matched_on: "phone" }]);
    await expect(create("Someone Else", "+27 71-234-5678".replace("+27 ", "0"), null)).rejects.toThrow(/duplicate review required/);
    await db.exec("ROLLBACK; BEGIN"); await asUser(4);
    await expect(create("Someone Else", "083 999 9999", "EXISTING@example.test")).rejects.toThrow(/duplicate review required/);
  });
  it("after review creates a separate record, never merges or overwrites, and is audited", async () => {
    await asUser(4);
    const newId = (await create("Someone Else", "0712345678", null, [id(101)])).rows[0]!.id;
    expect(newId).not.toBe(id(101));
    await db.exec("RESET ROLE");
    const existing = (await db.query(`SELECT full_name,phone,email,user_id,is_guest FROM public.customer_profiles WHERE id='${id(101)}'`)).rows[0];
    expect(existing).toEqual({ full_name: "Existing Person", phone: "071 234 5678", email: "existing@example.test", user_id: id(1), is_guest: false });
    const audit = (await db.query(`SELECT action FROM public.security_audit WHERE resource_id='${newId}' ORDER BY action`)).rows;
    expect(audit).toEqual([{ action: "guest_created_after_duplicate_review" }, { action: "insert" }]);
  });
  it("other staff cannot use duplicate search to view customer details", async () => {
    await asUser(5);
    await expect(db.query(`SELECT * FROM public.find_possible_duplicate_customers('0712345678','')`)).rejects.toThrow(/not authorised/);
  });
  it("guest creation cannot link an account or alter roles", async () => {
    await asUser(4);
    await create("Walk In", "082 000 1111", null);
    await db.exec("RESET ROLE");
    expect((await db.query(`SELECT count(*)::int AS c FROM public.customer_profiles WHERE is_guest AND user_id IS NOT NULL`)).rows).toEqual([{ c: 0 }]);
    expect((await db.query(`SELECT count(*)::int AS c FROM public.user_roles`)).rows).toEqual([{ c: 8 }]);
  });
});
