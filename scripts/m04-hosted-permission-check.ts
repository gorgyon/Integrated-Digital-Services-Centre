const URL_ = process.env.SUPABASE_URL!; const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.ANON!;
const results: [string, boolean, string][] = [];
const svcH = { apikey: SR, "Content-Type": "application/json", Prefer: "return=representation" };
async function svc(method: string, path: string, body?: any) {
  const r = await fetch(`${URL_}${path}`, { method, headers: svcH, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t}`); return t ? JSON.parse(t) : null;
}
let pending: string | null = null;
async function as(tok: string | null, method: string, path: string, body?: any) {
  if (pending && pending !== current) await become(pending); pending = null;
  const h: any = { apikey: ANON, "Content-Type": "application/json", Prefer: "return=representation" };
  if (tok) h.Authorization = `Bearer ${tok}`;
  const r = await fetch(`${URL_}/rest/v1${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t) } catch {}
  return { s: r.status, j };
}
const rows = (x: any) => Array.isArray(x.j) ? x.j.length : -1;
const denied = (x: any) => x.s >= 400;
function check(name: string, ok: boolean, info: any) { results.push([name, ok, JSON.stringify(info).slice(0, 120)]); }
const run = Date.now(); const fs = await import("fs");
const tok = (f: string) => JSON.parse(fs.readFileSync(`/tmp/hosted/s_${f}.json`, "utf8"));
const U: Record<string, { id: string, tok: string }> = {};
for (const n of ["custA","custB","actor"]) { const j = tok(n); U[n] = { id: j.user_id ?? j.session.user.id, tok: j.session.access_token }; }
const STAFF = ["admin","front_desk","designer","print_operator","career_support","finance","employer"];
for (const n of STAFF) U[n] = U.actor;
U.target = U.custB;
let current = "";
async function become(role: string) {
  await svc("DELETE", `/rest/v1/user_roles?user_id=eq.${U.actor.id}`);
  await svc("POST", "/rest/v1/user_roles", { user_id: U.actor.id, role }); current = role;
}
try {
  await svc("POST", "/rest/v1/user_roles", [{ user_id: U.custA.id, role: "customer" }, { user_id: U.custB.id, role: "customer" }]);
  const [pA, pB] = await svc("POST", "/rest/v1/customer_profiles", [
    { user_id: U.custA.id, full_name: "Test A", phone: "000", is_guest: false },
    { user_id: U.custB.id, full_name: "Test B", phone: "001", is_guest: false }]);
  const [fP, fC] = await svc("POST", "/rest/v1/files", [
    { customer_id: pA.id, category: "personal", purpose: "job_application", storage_path: `test/${run}/a1`, original_name: "id.pdf" },
    { customer_id: pA.id, category: "career", purpose: "cv_review", storage_path: `test/${run}/a2`, original_name: "cv.pdf" }]);
  await svc("POST", "/rest/v1/staff_customer_access", [
    { staff_id: U.actor.id, customer_id: pA.id, role: "designer", granted_by: U.actor.id },
    { staff_id: U.actor.id, customer_id: pA.id, role: "career_support", granted_by: U.actor.id }]);
  await svc("POST", "/rest/v1/orders", [
    { order_number: `T-${run}-A`, customer_id: pA.id, service_type: "printing" },
    { order_number: `T-${run}-B`, customer_id: pB.id, service_type: "printing" }]);
  await svc("POST", "/rest/v1/employment_applications", [{ customer_id: pA.id, job_title: "Clerk" }]);
  const T = (n: string) => { pending = STAFF.includes(n) ? n : null; return U[n].tok; };
  // Anonymous direct API
  for (const t of ["customer_profiles","orders","employment_applications","files","user_roles","security_audit","staff_customer_access","file_access_grants"]) {
    const r = await as(null, "GET", `/${t}?select=*`); check(`Anonymous cannot read ${t}`, denied(r) || rows(r) === 0, r.s);
  }
  let r = await as(null, "POST", "/rpc/read_authorised_file", { _file: fP.id, _purpose: "job_application" }); check("Anonymous cannot open a file", denied(r), r.s);
  r = await as(null, "POST", "/customer_profiles", { full_name: "x", phone: "1" }); check("Anonymous cannot create a profile", denied(r), r.s);
  // Customer isolation
  r = await as(T("custA"), "GET", "/customer_profiles?select=id"); check("Customer A sees only own profile", rows(r) === 1 && r.j[0].id === pA.id, r.j);
  r = await as(T("custA"), "GET", `/customer_profiles?id=eq.${pB.id}`); check("Customer A cannot fetch B's profile by known ID", rows(r) === 0, r.j);
  r = await as(T("custA"), "GET", "/orders?select=order_number"); check("Customer A sees only own orders", rows(r) === 1 && r.j[0].order_number.endsWith("-A"), r.j);
  r = await as(T("custB"), "GET", "/employment_applications?select=id"); check("Customer B cannot see A's applications", rows(r) === 0, r.j);
  r = await as(T("custA"), "PATCH", `/customer_profiles?id=eq.${pB.id}`, { phone: "999" }); check("Customer A cannot edit B's profile", rows(r) === 0 || denied(r), r.s);
  r = await as(T("custA"), "DELETE", `/customer_profiles?id=eq.${pB.id}`); check("Customer A cannot delete B's profile", denied(r) || rows(r) === 0, r.s);
  r = await as(T("custA"), "DELETE", `/customer_profiles?id=eq.${pA.id}`); check("Customer A cannot delete own profile directly", denied(r) || rows(r) === 0, r.s);
  r = await as(T("custA"), "DELETE", `/orders?id=not.is.null`); check("Customer cannot delete orders", denied(r) || rows(r) === 0, r.s);
  r = await as(T("custA"), "PATCH", `/customer_profiles?id=eq.${pA.id}`, { phone: "555" }); check("Customer A can correct own phone", rows(r) === 1, r.s);
  r = await as(T("custA"), "PATCH", `/customer_profiles?id=eq.${pA.id}`, { user_id: U.custB.id }); check("Customer cannot reassign profile owner", denied(r), r.s);
  r = await as(T("custA"), "PATCH", `/customer_profiles?id=eq.${pA.id}`, { consent_to_store: true }); check("Customer cannot alter protected consent field directly", denied(r), r.s);
  r = await as(T("custA"), "GET", "/files?select=*"); check("Customer cannot list file table directly", denied(r), r.s);
  r = await as(T("custB"), "POST", "/rpc/read_authorised_file", { _file: fP.id, _purpose: "job_application" }); check("Customer B cannot open A's file", denied(r), r.s);
  r = await as(T("custA"), "POST", "/rpc/read_authorised_file", { _file: fP.id, _purpose: "job_application" }); check("Customer A opens own file (correct purpose)", r.s === 200 && rows(r) === 1, r.s);
  r = await as(T("custA"), "POST", "/rpc/read_authorised_file", { _file: fP.id, _purpose: "marketing" }); check("Wrong purpose is refused", denied(r), r.s);
  // Role escalation
  for (const n of ["custA","front_desk","designer","finance","employer"]) {
    r = await as(T(n), "POST", "/user_roles", { user_id: U[n].id, role: "admin" }); check(`${n} cannot insert own admin role`, denied(r), r.s);
    r = await as(T(n), "POST", "/rpc/admin_set_staff_role", { _user: U[n].id, _role: "finance" }); check(`${n} cannot call role-change function`, denied(r), r.s);
  }
  r = await as(T("custA"), "PATCH", `/user_roles?user_id=eq.${U.custA.id}`, { role: "admin" }); check("Customer cannot change own role row", denied(r) || rows(r) === 0, r.s);
  r = await as(T("admin"), "POST", "/rpc/admin_set_staff_role", { _user: U.admin.id, _role: "finance" }); check("Admin cannot change own roles", denied(r), r.s);
  r = await as(T("admin"), "POST", "/rpc/admin_set_staff_role", { _user: U.target.id, _role: "admin" }); check("Admin cannot promote others to admin", denied(r), r.s);
  r = await as(T("admin"), "POST", "/rpc/admin_set_staff_role", { _user: U.target.id, _role: "designer" }); check("Admin can assign a staff role (legitimate)", r.s < 300, r.j);
  r = await as(T("admin"), "POST", "/rpc/admin_set_staff_role", { _user: U.target.id, _role: "designer", _remove: true }); check("Admin can remove a staff role (legitimate)", r.s < 300, r.s);
  // Staff scope
  r = await as(T("front_desk"), "GET", "/customer_profiles?select=id"); check("Front desk sees customer profiles", rows(r) >= 2, rows(r));
  r = await as(T("front_desk"), "POST", "/customer_profiles", { full_name: "Walk-in", phone: "0123", is_guest: true, created_by: U.front_desk.id }); check("Front desk can create a guest record", r.s === 201, r.s);
  const guestId = r.j?.[0]?.id;
  r = await as(T("front_desk"), "POST", "/customer_profiles", { full_name: "Forge", phone: "1", is_guest: true, created_by: U.front_desk.id, user_id: U.custB.id }); check("Front desk cannot forge a guest linked to an account", denied(r), r.s);
  r = await as(T("front_desk"), "DELETE", `/customer_profiles?id=eq.${pA.id}`); check("Front desk cannot delete profiles", denied(r) || rows(r) === 0, r.s);
  r = await as(T("front_desk"), "GET", "/employment_applications?select=id"); check("Front desk cannot see applications", rows(r) === 0, rows(r));
  r = await as(T("front_desk"), "POST", "/rpc/read_authorised_file", { _file: fP.id, _purpose: "job_application" }); check("Front desk cannot open file without customer approval", denied(r), r.s);
  r = await as(T("designer"), "GET", "/orders?select=order_number"); check("Designer sees only assigned customer's orders", rows(r) === 1 && r.j[0].order_number.endsWith("-A"), r.j);
  r = await as(T("designer"), "GET", "/employment_applications?select=id"); check("Designer cannot see applications", rows(r) === 0, rows(r));
  r = await as(T("designer"), "GET", "/customer_profiles?select=id"); check("Designer cannot browse profiles", rows(r) === 0, rows(r));
  r = await as(T("print_operator"), "GET", "/orders?select=id"); check("Unassigned print operator sees no orders", rows(r) === 0, rows(r));
  r = await as(T("career_support"), "GET", "/employment_applications?select=id"); check("Career support sees assigned customer's applications", rows(r) === 1, rows(r));
  r = await as(T("career_support"), "GET", "/orders?select=id"); check("Career support cannot see orders", rows(r) === 0, rows(r));
  r = await as(T("finance"), "GET", "/orders?select=id"); check("Finance sees orders", rows(r) >= 2, rows(r));
  r = await as(T("finance"), "GET", "/employment_applications?select=id"); check("Finance cannot see applications", rows(r) === 0, rows(r));
  r = await as(T("finance"), "GET", "/customer_profiles?select=id"); check("Finance cannot browse profiles", rows(r) === 0, rows(r));
  r = await as(T("finance"), "DELETE", `/orders?id=not.is.null`); check("Finance cannot delete orders", denied(r) || rows(r) === 0, r.s);
  r = await as(T("print_operator"), "PATCH", `/orders?id=not.is.null`, { status: "cancelled" }); check("Print operator cannot change orders directly", denied(r) || rows(r) === 0, r.s);
  r = await as(T("admin"), "GET", "/security_audit?select=id"); check("Admin can read the audit log", rows(r) > 0, rows(r));
  r = await as(T("front_desk"), "GET", "/security_audit?select=id"); check("Staff cannot read the audit log", rows(r) === 0, rows(r));
  r = await as(T("admin"), "DELETE", "/security_audit?id=not.is.null"); check("Admin cannot delete audit records", denied(r) || rows(r) === 0, r.s);
  // Employer consent
  r = await as(T("employer"), "POST", "/rpc/read_authorised_file", { _file: fC.id, _purpose: "cv_review" }); check("Employer cannot open CV without consent", denied(r), r.s);
  r = await as(T("employer"), "POST", "/rpc/approve_file_access", { _file: fC.id, _recipient: U.employer.id, _purpose: "cv_review", _expires: new Date(Date.now()+864e5).toISOString() }); check("Employer cannot approve own access", denied(r), r.s);
  r = await as(T("custA"), "POST", "/rpc/approve_file_access", { _file: fC.id, _recipient: U.employer.id, _purpose: "cv_review", _expires: new Date(Date.now()+864e5).toISOString() }); check("Customer approves employer access", r.s === 200, r.s);
  const grant = r.j;
  r = await as(T("employer"), "POST", "/rpc/read_authorised_file", { _file: fC.id, _purpose: "cv_review" }); check("Employer opens CV after consent", r.s === 200 && rows(r) === 1, r.s);
  r = await as(T("employer"), "POST", "/rpc/read_authorised_file", { _file: fP.id, _purpose: "job_application" }); check("Employer cannot open a different file", denied(r), r.s);
  r = await as(T("custA"), "POST", "/rpc/revoke_file_access", { _grant: grant }); check("Customer withdraws access", r.s < 300, r.s);
  r = await as(T("employer"), "POST", "/rpc/read_authorised_file", { _file: fC.id, _purpose: "cv_review" }); check("Employer blocked after withdrawal", denied(r), r.s);
  r = await as(T("admin"), "GET", `/security_audit?select=action&resource_id=eq.${fC.id}`); const acts = (r.j||[]).map((x:any)=>x.action);
  check("Consent, read and withdrawal are audited", ["file_access_approved","file_read","file_access_revoked"].every(a=>acts.includes(a)), acts);
  // Trusted server cannot erase audit
  const d = await fetch(`${URL_}/rest/v1/security_audit?id=not.is.null`, { method: "DELETE", headers: svcH }); check("Even trusted server key cannot erase audit", d.status >= 400, d.status);
  if (guestId) await svc("DELETE", `/rest/v1/customer_profiles?id=eq.${guestId}`);
} catch (e) { console.error("ERROR", e); }
finally {
  const ids = [U.custA.id, U.custB.id, U.actor.id]; const inList = `(${ids.join(",")})`;
  try {
    const profs = await svc("GET", `/rest/v1/customer_profiles?select=id&user_id=in.${inList}`);
    const pl = `(${profs.map((p: any) => p.id).join(",")})`;
    if (profs.length) {
      await svc("DELETE", `/rest/v1/file_access_grants?approved_by=in.${inList}`);
      for (const t of ["orders","employment_applications","files","staff_customer_access"]) await svc("DELETE", `/rest/v1/${t}?customer_id=in.${pl}`);
      await svc("DELETE", `/rest/v1/customer_profiles?id=in.${pl}`);
    }
    await svc("DELETE", `/rest/v1/user_roles?user_id=in.${inList}`);
    console.log("cleanup ok");
  } catch (e) { console.error("CLEANUP ERROR", e); }
}
const pass = results.filter(r => r[1]).length;
for (const [n, ok, i] of results) console.log(ok ? "PASS" : "FAIL", n, ok ? "" : i);
console.log(`${pass}/${results.length} passed`);
