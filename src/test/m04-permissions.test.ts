// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actors = { customer: 1, other: 2, admin: 3, front_desk: 4, designer: 5, print_operator: 6, career_support: 7, finance: 8, employer: 9, otherEmployer: 10 };
let db: PGlite;
async function asUser(n: number) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false); SELECT set_config('request.jwt.claim.role','authenticated',false);`);
}
async function owner() { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);"); }
const fileRead = (n = 201, purpose = "career_review") => db.query(`SELECT * FROM public.read_authorised_file('${id(n)}','${purpose}')`);
async function approve(recipient: number, file = 201, purpose = "career_review") {
  await asUser(1);
  const result = await db.query<{ id: string }>(`SELECT public.approve_file_access('${id(file)}','${id(recipient)}','${purpose}',now()+interval '1 day') AS id`);
  return result.rows[0]?.id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;`);
  await db.exec(readFileSync("drizzle/migrations/0000_m03_shared_schema.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0001_m04_security_boundaries.sql", "utf8"));
  await db.exec(`INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,10) n;`);
  for (const [role, n] of Object.entries(actors)) {
    await db.exec(`INSERT INTO public.user_roles(user_id,role) VALUES('${id(n)}','${role === "other" ? "customer" : role === "otherEmployer" ? "employer" : role}');`);
  }
  await db.exec(`INSERT INTO public.customer_profiles(id,user_id,full_name,phone,is_guest) VALUES
    ('${id(101)}','${id(1)}','Test A','test-a',false),('${id(102)}','${id(2)}','Test B','test-b',false);
    INSERT INTO public.orders(id,order_number,customer_id,service_type) VALUES
    ('${id(301)}','test-a','${id(101)}','printing'),('${id(302)}','test-b','${id(102)}','printing');
    INSERT INTO public.employment_applications(id,customer_id,job_title) VALUES
    ('${id(401)}','${id(101)}','Test A'),('${id(402)}','${id(102)}','Test B');
    INSERT INTO public.files(id,customer_id,category,purpose,storage_path,original_name) VALUES
    ('${id(201)}','${id(101)}','career','career_review','test/a','a.pdf'),
    ('${id(202)}','${id(102)}','career','career_review','test/b','b.pdf'),
    ('${id(203)}','${id(101)}','approved_artwork','print_production','test/art','art.pdf'),
    ('${id(204)}','${id(101)}','internal','administration','test/internal','internal.pdf');`);
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await owner(); await db.exec("BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); });

describe("M04 actual PostgreSQL permission boundaries", () => {
  for (const table of ["customer_profiles", "orders", "employment_applications"]) {
    it(`customer reads only own ${table}, including known-ID bypass`, async () => {
      await asUser(1);
      expect((await db.query(`SELECT * FROM public.${table}`)).rows).toHaveLength(1);
      expect((await db.query(`SELECT * FROM public.${table} WHERE id='${id(table === "customer_profiles" ? 102 : table === "orders" ? 302 : 402)}'`)).rows).toHaveLength(0);
    });
  }
  it("customer updates own contact but cannot update another customer's contact", async () => {
    await asUser(1);
    expect((await db.query(`UPDATE public.customer_profiles SET phone='allowed' WHERE id='${id(101)}' RETURNING phone`)).rows).toEqual([{ phone: "allowed" }]);
    expect((await db.query(`UPDATE public.customer_profiles SET phone='bypass' WHERE id='${id(102)}' RETURNING id`)).rows).toHaveLength(0);
  });
  it("customer cannot reassign account linkage", async () => {
    await asUser(1);
    await expect(db.exec(`UPDATE public.customer_profiles SET user_id='${id(2)}' WHERE id='${id(101)}'`)).rejects.toThrow(/permission denied/);
  });
  it("customer cannot forge consent timestamps", async () => {
    await asUser(1);
    await expect(db.exec(`UPDATE public.customer_profiles SET consent_recorded_at=now()`)).rejects.toThrow(/permission denied/);
  });
  for (const [role, n] of Object.entries(actors).filter(([r]) => !["customer", "other", "otherEmployer"].includes(r))) {
    it(`${role} has only its permitted profile/order/application scope`, async () => {
      await asUser(n);
      expect((await db.query("SELECT * FROM public.customer_profiles")).rows).toHaveLength(role === "front_desk" ? 2 : 0);
      expect((await db.query("SELECT * FROM public.orders")).rows).toHaveLength(["front_desk", "finance"].includes(role) ? 2 : 0);
      expect((await db.query("SELECT * FROM public.employment_applications")).rows).toHaveLength(0);
    });
  }
  it("assigned designer sees only assigned customer orders", async () => {
    await asUser(3);
    await db.exec(`SELECT public.admin_assign_customer('${id(5)}','${id(101)}','designer')`);
    await asUser(5);
    expect((await db.query("SELECT id FROM public.orders")).rows).toEqual([{ id: id(301) }]);
  });
  it("career assignment grants case access and revocation removes it", async () => {
    await asUser(3);
    await db.exec(`SELECT public.admin_assign_customer('${id(7)}','${id(101)}','career_support')`);
    await asUser(7);
    expect((await db.query("SELECT id FROM public.employment_applications")).rows).toEqual([{ id: id(401) }]);
    await asUser(3);
    await db.exec(`SELECT public.admin_assign_customer('${id(7)}','${id(101)}','career_support',true)`);
    await asUser(7);
    expect((await db.query("SELECT * FROM public.employment_applications")).rows).toHaveLength(0);
  });
  it("direct file table bypass is denied even for administrators", async () => {
    await asUser(3);
    await expect(db.query("SELECT * FROM public.files")).rejects.toThrow(/permission denied/);
  });
  it("owner's file read succeeds and records actor/file/purpose", async () => {
    await asUser(1); expect((await fileRead()).rows).toHaveLength(1);
    await asUser(3);
    expect((await db.query(`SELECT actor_id,purpose FROM public.security_audit WHERE action='file_read' AND resource_id='${id(201)}'`)).rows).toEqual([{actor_id:id(1),purpose:"career_review"}]);
  });
  it("owner cannot read another customer's file", async () => {
    await asUser(1); await expect(fileRead(202)).rejects.toThrow(/Access denied/);
  });
  it("career staff cannot read a sensitive file without customer approval", async () => {
    await asUser(7); await expect(fileRead()).rejects.toThrow(/Access denied/);
  });
  it("employer without approval cannot read customer documents", async () => {
    await asUser(9); await expect(fileRead()).rejects.toThrow(/Access denied/);
  });
  it("access grants cannot be forged through direct inserts", async () => {
    await asUser(9); await expect(db.exec(`INSERT INTO public.file_access_grants(file_id,recipient_id,purpose,approved_by,expires_at) VALUES('${id(201)}','${id(9)}','career_review','${id(1)}',now()+interval '1 day')`)).rejects.toThrow(/permission denied/);
  });
  it("front desk creates guest records without linking an arbitrary account", async () => {
    await asUser(4);
    expect((await db.query(`INSERT INTO public.customer_profiles(full_name,phone,created_by) VALUES('Test guest','test-guest','${id(4)}') RETURNING is_guest`)).rows).toEqual([{is_guest:true}]);
  });
  it("front desk cannot forge a registered customer insert", async () => {
    await asUser(4); await expect(db.exec(`INSERT INTO public.customer_profiles(full_name,phone,user_id,is_guest,created_by) VALUES('Forged','test','${id(10)}',false,'${id(4)}')`)).rejects.toThrow(/row-level security/);
  });
  it("administrator has no blanket sensitive document access", async () => {
    await asUser(3); await expect(fileRead()).rejects.toThrow(/Access denied/);
  });
  it("staff requires a purpose-matched explicit customer grant", async () => {
    await approve(7); await asUser(7);
    expect((await fileRead()).rows).toHaveLength(1);
    await expect(fileRead(201,"printing")).rejects.toThrow(/Access denied/);
  });
  it("print operator cannot read career file even with a grant", async () => {
    await approve(6); await asUser(6); await expect(fileRead()).rejects.toThrow(/Access denied/);
  });
  it("print operator can read authorised approved artwork", async () => {
    await approve(6,203,"print_production"); await asUser(6);
    expect((await fileRead(203,"print_production")).rows).toHaveLength(1);
  });
  it("employer needs customer approval, isolated to the named employer", async () => {
    await approve(9); await asUser(9); expect((await fileRead()).rows).toHaveLength(1);
    await asUser(10); await expect(fileRead()).rejects.toThrow(/Access denied/);
  });
  it("revoking a grant withdraws future employer access", async () => {
    const grant = await approve(9); expect(grant).toBeTruthy();
    await asUser(1); await db.exec(`SELECT public.revoke_file_access('${grant}')`);
    await asUser(9); await expect(fileRead()).rejects.toThrow(/Access denied/);
  });
  it("expired consent does not authorise employer access", async () => {
    const grant = await approve(9); await owner();
    await db.exec(`UPDATE public.file_access_grants SET expires_at=now()-interval '1 day' WHERE id='${grant}'`);
    await asUser(9); await expect(fileRead()).rejects.toThrow(/Access denied/);
  });
  it("employer cannot approve sharing on the customer's behalf", async () => {
    await asUser(9);
    await expect(db.exec(`SELECT public.approve_file_access('${id(201)}','${id(10)}','career_review',now()+interval '1 day')`)).rejects.toThrow(/Access denied/);
  });
  it("customer cannot expose internal business documents", async () => {
    await asUser(1); await expect(fileRead(204,"administration")).rejects.toThrow(/Access denied/);
  });
  it("non-admin cannot assign roles", async () => {
    await asUser(4); await expect(db.exec(`SELECT public.admin_set_staff_role('${id(2)}','finance')`)).rejects.toThrow(/Access denied/);
  });
  it("direct role mutation bypass is denied", async () => {
    await asUser(3); await expect(db.exec(`INSERT INTO public.user_roles(user_id,role) VALUES('${id(2)}','admin')`)).rejects.toThrow(/permission denied/);
  });
  it("admin cannot change own roles or promote another admin", async () => {
    await asUser(3); await expect(db.exec(`SELECT public.admin_set_staff_role('${id(3)}','finance')`)).rejects.toThrow(/Access denied/);
  });
  it("admin cannot promote another admin", async () => {
    await asUser(3); await expect(db.exec(`SELECT public.admin_set_staff_role('${id(2)}','admin')`)).rejects.toThrow(/Access denied/);
  });
  it("authorised role change succeeds and is audited", async () => {
    await asUser(3); await db.exec(`SELECT public.admin_set_staff_role('${id(2)}','finance')`);
    expect((await db.query(`SELECT details FROM public.security_audit WHERE resource_type='user_roles' AND actor_id='${id(3)}'`)).rows).toEqual([{details:{user_id:id(2),role:"finance"}}]);
  });
  it("audit records cannot be forged or altered", async () => {
    await asUser(3); await expect(db.exec("UPDATE public.security_audit SET action='forged'" )).rejects.toThrow(/permission denied/);
  });
  it("ordinary staff cannot read the audit trail", async () => {
    await asUser(4); expect((await db.query("SELECT * FROM public.security_audit")).rows).toHaveLength(0);
  });
  it("finance cannot mark orders paid ahead of approved payment functionality", async () => {
    await asUser(8); await expect(db.exec("UPDATE public.orders SET payment_status='paid',payment_method='cash'" )).rejects.toThrow(/permission denied/);
  });
  it("anonymous callers cannot invoke the document read function", async () => {
    await db.exec("SET ROLE anon"); await expect(fileRead()).rejects.toThrow(/permission denied/);
  });
  it("role helper cannot probe another user's permissions", async () => {
    await asUser(1); expect((await db.query(`SELECT public.has_role('${id(3)}','admin') AS allowed`)).rows).toEqual([{allowed:false}]);
  });
});