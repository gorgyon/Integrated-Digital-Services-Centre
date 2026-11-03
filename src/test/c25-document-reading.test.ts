// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { suggestEntries, validateReadingInput } from '@/modules/career/reading-rules';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
const asUser = async (n: number) => db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false);`);
async function begin(file = id(201)) {
  const result = await db.query<{ claim: { started: boolean; token: string } }>('SELECT public.begin_document_reading($1) AS claim', [file]);
  const claim = result.rows[0]?.claim;
  if (!claim) throw new Error('Missing claim');
  return claim;
}
const suggestions = suggestEntries([{ page: 1, ocr: false, text: 'Skills\nExcel\nEmployment history\nClerk at Acme' }]);
async function finish(token: string) {
  await db.query('SELECT public.finish_document_reading($1,$2,$3,$4::jsonb,$5)', [id(201), token, 'Skills\nExcel', JSON.stringify(suggestions), 'pdf_text']);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;`);
  for (const file of ['0000_m03_shared_schema','0001_m04_security_boundaries','0002_m04_explicit_grant_hardening','0003_m04_immutable_security_audit','0007_c2_career_profile','0010_c25_private_document_reading','0011_c2_c25_profile_draft_integration']) {
    await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, 'utf8'));
  }
  await db.exec(`INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');
    INSERT INTO public.user_roles(user_id,role) VALUES('${id(1)}','customer'),('${id(2)}','customer');
    INSERT INTO public.customer_profiles(id,user_id,full_name,phone,is_guest) VALUES('${id(101)}','${id(1)}','Applicant A','0710000001',false),('${id(102)}','${id(2)}','Applicant B','0710000002',false);
    INSERT INTO public.files(id,customer_id,category,purpose,storage_path,original_name,mime_type,size_bytes) VALUES
    ('${id(201)}','${id(101)}','career','career_document','a/x.pdf','x.pdf','application/pdf',1000),
    ('${id(202)}','${id(102)}','career','career_document','b/y.pdf','y.pdf','application/pdf',1000);`);
}, 60000);
afterAll(async () => db?.close());
beforeEach(async () => db.exec('RESET ROLE; BEGIN'));
afterEach(async () => db.exec('ROLLBACK'));
describe('C2.5 private reading and review', () => {
  it('keeps unreviewed extraction separate and accepted entries as source-linked drafts until explicit C2 confirmation', async () => {
    await asUser(1); const claim = await begin(); await finish(claim.token);
    expect((await db.query('SELECT * FROM public.career_profile_entries')).rows).toHaveLength(0);
    await db.query('SELECT public.review_document_suggestion($1,0,true,$2::jsonb)', [id(201), JSON.stringify({ name: 'Excel' })]);
    const draft = (await db.query('SELECT confirmed_data,draft_data,draft_file_id FROM public.career_profile_entries')).rows[0];
    expect(draft).toEqual({ confirmed_data: null, draft_data: { name: 'Excel' }, draft_file_id: id(201) });
    await db.query('SELECT public.confirm_career_profile()');
    expect((await db.query('SELECT confirmed_data,confirmed_file_id FROM public.career_profile_entries')).rows[0]).toEqual({ confirmed_data: { name: 'Excel' }, confirmed_file_id: id(201) });
    await db.exec('RESET ROLE');
    const audit = (await db.query<{ details: unknown }>("SELECT details FROM public.security_audit WHERE resource_type='career_document_readings'")).rows;
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain('Excel');
  });
  it('keeps the source page through edit and confirmation, and never duplicates an accepted entry', async () => {
    await asUser(1);
    await db.query(`SELECT public.save_career_draft(NULL,'skill','{"name":"excel"}'::jsonb,NULL)`);
    const claim = await begin(); await finish(claim.token);
    await db.query('SELECT public.review_document_suggestion($1,0,true,$2::jsonb)', [id(201), '{"name":"Excel"}']);
    expect((await db.query("SELECT * FROM public.career_profile_entries WHERE kind='skill'")).rows).toHaveLength(1);
    await db.query('SELECT public.review_document_suggestion($1,1,true,$2::jsonb)', [id(201), '{"role":"Clerk at Acme"}']);
    const e = (await db.query<{ id: string; draft_source_page: number }>("SELECT id,draft_source_page FROM public.career_profile_entries WHERE kind='experience'")).rows[0]!;
    expect(e.draft_source_page).toBe(1);
    await db.query(`SELECT public.save_career_draft($1,'experience','{"role":"Senior clerk"}'::jsonb,$2)`, [e.id, id(201)]);
    await db.query('SELECT public.confirm_career_profile()');
    expect((await db.query("SELECT confirmed_data,confirmed_source_page FROM public.career_profile_entries WHERE kind='experience'")).rows[0]).toEqual({ confirmed_data: { role: 'Senior clerk' }, confirmed_source_page: 1 });
  });
  it('rejects each unwanted suggestion without creating profile entries', async () => {
    await asUser(1); const claim = await begin(); await finish(claim.token);
    await db.query('SELECT public.review_document_suggestion($1,0,false,$2::jsonb)', [id(201), '{}']);
    expect((await db.query('SELECT * FROM public.career_profile_entries')).rows).toHaveLength(0);
  });
  it('requires every suggestion to be reviewed before completing', async () => {
    await asUser(1); const claim = await begin(); await finish(claim.token);
    await expect(db.query('SELECT public.complete_document_review($1)', [id(201)])).rejects.toThrow(/Review every/);
  });
  it('completes review after acceptance/rejection including employment history without confirmation', async () => {
    await asUser(1); const claim = await begin(); await finish(claim.token);
    await db.query('SELECT public.review_document_suggestion($1,0,false,$2::jsonb)', [id(201), '{}']);
    await db.query('SELECT public.review_document_suggestion($1,1,true,$2::jsonb)', [id(201), JSON.stringify({ role: 'Clerk at Acme' })]);
    await db.query('SELECT public.complete_document_review($1)', [id(201)]);
    expect((await db.query('SELECT status FROM public.career_document_readings')).rows[0]).toEqual({ status: 'completed' });
    expect((await db.query('SELECT kind,confirmed_data FROM public.career_profile_entries')).rows[0]).toEqual({ kind: 'experience', confirmed_data: null });
  });
  it('does not repeat processing or accepted suggestions', async () => {
    await asUser(1); const claim = await begin(); expect((await begin()).started).toBe(false); await finish(claim.token);
    expect((await begin()).started).toBe(false);
    await db.query('SELECT public.review_document_suggestion($1,0,true,$2::jsonb)', [id(201), '{"name":"Excel"}']);
    await expect(db.query('SELECT public.review_document_suggestion($1,0,true,$2::jsonb)', [id(201), '{"name":"Excel"}'])).rejects.toThrow(/Already reviewed/);
  });
  it('refuses another applicant document and reading', async () => {
    await asUser(1); const claim = await begin(); await finish(claim.token); await asUser(2);
    expect((await db.query('SELECT * FROM public.career_document_readings')).rows).toHaveLength(0);
    await expect(begin()).rejects.toThrow(/Access denied/);
  });
  it('refuses another applicant review through direct RPC', async () => {
    await asUser(1); const claim = await begin(); await finish(claim.token); await asUser(2);
    await expect(db.query('SELECT public.review_document_suggestion($1,0,true,$2::jsonb)', [id(201), '{"name":"Excel"}'])).rejects.toThrow(/Access denied/);
  });
  it('refuses direct table writes', async () => {
    await asUser(1);
    await expect(db.query('INSERT INTO public.career_document_readings(file_id,customer_id) VALUES($1,$2)', [id(201), id(101)])).rejects.toThrow(/permission denied/);
  });
  it('refuses stale or forged run tokens', async () => {
    await asUser(1); await begin();
    await expect(finish(id(999))).rejects.toThrow(/Access denied/);
  });
  it('enforces 10 MB and supported types before reading', () => {
    expect(() => validateReadingInput(10485760, 'application/pdf')).not.toThrow();
    expect(() => validateReadingInput(10485761, 'application/pdf')).toThrow('oversized');
    expect(() => validateReadingInput(100, 'text/plain')).toThrow('unsupported');
  });
  it('preserves source wording and never invents missing years or issuers', () => {
    const result = suggestEntries([{ page: 2, text: 'Diploma in IT\nSkills\nExcel', ocr: true }]);
    expect(result[0]).toMatchObject({ source: 'Diploma in IT', page: 2, uncertain: true, status: 'pending', data: { title: 'Diploma in IT' } });
    expect(result[0]?.data['year']).toBeUndefined(); expect(result[0]?.data['issuer']).toBeUndefined();
  });
  it('preserves grades and explicitly stated completion years', () => {
    const result = suggestEntries([{ page: 1, text: 'Academic results\nMathematics 78% 2024', ocr: false }]);
    expect(result[0]?.data).toEqual({ subject: 'Mathematics', grade: '78%', year: '2024' });
  });
});