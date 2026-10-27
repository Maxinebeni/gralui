/** Local synthetic acceptance only. Credentials are supplied through environment variables. */
import { randomInt, randomUUID } from "node:crypto";

const base = process.env.ONBOARDING_TEST_BASE_URL ?? "http://localhost:8080";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Acceptance checks require a local synthetic-data backend.");
const adminEmail = process.env.ONBOARDING_TEST_ADMIN_EMAIL;
const adminPassword = process.env.ONBOARDING_TEST_ADMIN_PASSWORD;
const staffPassword = process.env.ONBOARDING_TEST_STAFF_PASSWORD;
if (!adminEmail || !adminPassword || !staffPassword) throw new Error("Set ONBOARDING_TEST_ADMIN_EMAIL, ONBOARDING_TEST_ADMIN_PASSWORD, and ONBOARDING_TEST_STAFF_PASSWORD.");

class Session {
  cookies = new Map();
  async request(path, method = "GET", body, expected = null) {
    const headers = {};
    if (method !== "GET") {
      const csrf = await this.request("/api/v1/auth/csrf");
      headers[csrf.headerName ?? "X-CSRF-TOKEN"] = csrf.token;
    }
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const isFile = body instanceof FormData;
    if (body && !isFile) headers["Content-Type"] = "application/json";
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: isFile ? body : JSON.stringify(body) } : {}) });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0]; const index = pair.indexOf("=");
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text(); let result;
    try { result = text ? JSON.parse(text) : undefined; } catch { result = undefined; }
    if (expected === null ? !response.ok : response.status !== expected) throw new Error(`${method} ${path}: expected ${expected ?? "2xx"}, received ${response.status} (${result?.code ?? "no problem code"}${result?.fields ? `; fields: ${result.fields.join(", ")}` : ""})`);
    return result;
  }
  async login(email, password) { await this.request("/api/v1/auth/login", "POST", { email, password }); this.me = await this.request("/api/v1/me"); return this; }
}
const command = (resource, reason) => ({ commandId: randomUUID(), expectedVersion: resource.version, ...(reason ? { reason } : {}) });
const list = (r) => Array.isArray(r) ? r : r.items;
const pass = (message) => console.log(`PASS ${message}`);
const now = () => new Date().toISOString();
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const runId = `${Date.now()}-${randomInt(1000, 9999)}`;
const title = `FRONTEND QA ${runId}`;

function pdf() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>", "<< /Length 0 >>\nstream\n\nendstream"];
  let document = "%PDF-1.4\n%Synthetic onboarding test evidence\n"; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(document)); document += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(document);
  document += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([document], { type: "application/pdf" });
}
async function evidence(actor, type, id, purpose, classification = "CORRESPONDENCE", occurredAt = now()) {
  const form = new FormData(); form.append("file", pdf(), `SYNTHETIC-${purpose}.pdf`);
  const document = await actor.request(`/api/v1/documents?${new URLSearchParams({ subjectType: type, subjectId: id, purpose, classification })}`, "POST", form, 201);
  return { documentId: document.id, documentVersion: document.version, occurredAt };
}
const post = (actor, resource, suffix, body) => actor.request(`/api/v1/onboarding-cases/${resource.id}/${suffix}`, "POST", body);
const getTrack = (actor, resource) => actor.request(`/api/v1/onboarding-cases/${resource.id}`);

try {
  const admin = await new Session().login(adminEmail, adminPassword);
  const users = [];
  for (let page = 0; ; page++) { const result = await admin.request(`/api/v1/admin/users?page=${page}&size=100`); users.push(...result.items); if (users.length >= result.totalElements) break; }
  const actors = {}; const used = new Set();
  for (const role of ["CRM_MANAGER", "COMMERCIAL_DIRECTOR", "ACCOUNTS_EXECUTIVE", "RISK_COMPLIANCE_MANAGER", "TECHNICAL_DIRECTOR", "GI_UNDERWRITING_MANAGER", "MD"]) {
    const candidate = users.find((u) => u.status === "ACTIVE" && u.profileCategory === "BUSINESS" && u.roles.includes(role) && !used.has(u.id));
    if (!candidate) throw new Error(`No distinct active synthetic account is available for ${role}.`);
    used.add(candidate.id); actors[role] = await new Session().login(candidate.email, staffPassword);
  }
  const { CRM_MANAGER: crm, COMMERCIAL_DIRECTOR: cd, ACCOUNTS_EXECUTIVE: ae, RISK_COMPLIANCE_MANAGER: rc, TECHNICAL_DIRECTOR: td, GI_UNDERWRITING_MANAGER: gi, MD: md } = actors;
  pass("Authenticated distinct staff roles without changing user accounts");

  const termsCatalog = list(await gi.request("/api/v1/policy/catalog/product-terms")).filter((p) => p.active);
  const typesCatalog = list(await gi.request("/api/v1/policy/catalog/insurer-types")).filter((p) => p.active);
  const lines = list(await gi.request("/api/v1/policy/catalog/product-lines")).filter((p) => p.active);
  const term = termsCatalog.find((term) => typesCatalog.some((type) => type.termCodes.includes(term.code)) && lines.some((line) => line.termCode === term.code));
  if (!term) throw new Error("The seeded catalog requires a compatible insurer type, product term and product line.");
  const type = typesCatalog.find((type) => type.termCodes.includes(term.code));
  const line = lines.find((line) => line.termCode === term.code);
  const product = await gi.request("/api/v1/policy/catalog/products", "POST", { code: `QA_${runId}`, name: title, termCode: term.code, productLineCodes: [line.code], notes: "SYNTHETIC acceptance product only", reason: "Isolated synthetic acceptance catalog" }, 201);
  const insurers = [];
  for (let index = 0; index < 3; index++) {
    const insurer = await gi.request("/api/v1/policy/catalog/insurers", "POST", { code: `QA_${runId}_${index}`, name: `${title} insurer ${index + 1}`, typeCode: type.code, reason: "Isolated synthetic acceptance catalog" });
    await gi.request(`/api/v1/policy/catalog/insurers/${insurer.id}/products/${product.id}`, "POST", { reason: "Synthetic acceptance product link" }, 204);
    insurers.push(insurer);
  }
  pass("Created an isolated synthetic product and three insurers; existing catalog entries are unchanged");

  const anchor = Date.now();
  const past = (minutes) => new Date(anchor - minutes * 60000).toISOString();
  let lead = await cd.request("/api/v1/leads", "POST", { commandId: randomUUID(), name: title, type: "CORPORATE", industry: "Synthetic QA", source: "Frontend acceptance test", contactName: "Synthetic Contact", email: `qa-${runId}@example.invalid`, phone: `+2507${randomInt(10000000, 99999999)}`, receivedAt: past(30) });
  lead = await crm.request(`/api/v1/leads/${lead.id}/assignment`, "POST", { command: command(lead, "Synthetic QA assignment"), ownerId: ae.me.id });
  lead = await cd.request(`/api/v1/leads/${lead.id}/confirm-registration`, "POST", command(lead));
  let proof = await evidence(ae, "LEAD", lead.id, "LEAD_RESPONSE", "CORRESPONDENCE", past(25));
  lead = await ae.request(`/api/v1/leads/${lead.id}/record-response`, "POST", { command: command(lead), ...proof });
  const request = await evidence(ae, "LEAD", lead.id, "PRE_MEETING_REQUEST", "CORRESPONDENCE", past(20));
  const summary = await evidence(ae, "LEAD", lead.id, "MEETING_SUMMARY", "CORRESPONDENCE", past(10));
  const confirmation = await evidence(ae, "LEAD", lead.id, "MEETING_CONFIRMATION", "CORRESPONDENCE", past(5));
  lead = await ae.request(`/api/v1/leads/${lead.id}/assessment`, "POST", { command: command(lead), meetingAt: past(15), needs: "Synthetic property and strategic onboarding validation", assets: "Synthetic test assets", existingCover: "None (synthetic test)", employeeCount: 10, request, summary, confirmation });
  const prospect = { registeredName: title, clientType: "CORPORATE", sector: "Synthetic QA", address: "Synthetic Kigali address", contactName: "Synthetic Contact", jobTitle: "Test Director", email: `qa-${runId}@example.invalid`, phone: lead.phone };
  const duplicates = await ae.request("/api/v1/clients/duplicate-check", "POST", { profile: { registeredName: prospect.registeredName, type: prospect.clientType, sector: prospect.sector, physicalAddress: prospect.address }, primaryContact: { name: prospect.contactName, jobTitle: prospect.jobTitle, email: prospect.email, phone: prospect.phone } });
  lead = await ae.request(`/api/v1/leads/${lead.id}/prospect`, "POST", { command: command(lead), ...prospect, reviewFingerprint: duplicates.fingerprint });
  pass("Lead registration, AE assignment, confirmation, response, assessment, duplicate review and prospect creation");
  const client = await crm.request(`/api/v1/clients/${lead.clientId}`);
  await crm.request(`/api/v1/clients/${lead.clientId}/visibility`, "POST", { version: client.version, restricted: true, reason: "Synthetic restricted-client scope validation" });

  const tracks = [];
  for (const tier of ["STANDARD", "LARGE", "STRATEGIC"]) tracks.push({ tier, value: await ae.request(`/api/v1/leads/${lead.id}/onboarding-cases`, "POST", { command: command(lead), productId: product.id, underwritingRole: "GI_UNDERWRITING_MANAGER", property: tier !== "STANDARD" }) });
  const templates = await ae.request("/api/v1/kyc-templates");
  const template = templates.find((t) => t.clientType === "CORPORATE");
  if (!template) throw new Error("A current corporate KYC template is required.");
  const templateCode = `QA_${runId.replaceAll("-", "_")}`;
  await rc.request(`/api/v1/kyc-templates/${templateCode}`, "PUT", { expectedVersion: 0, clientType: "CORPORATE", requirements: template.requirements, reason: "Isolated synthetic checklist" }, 204);
  let kyc = await ae.request("/api/v1/kyc-cases", "POST", { commandId: randomUUID(), clientId: lead.clientId, templateCode });
  for (const requirement of template.requirements.filter((r) => r.required)) {
    proof = await evidence(ae, "KYC", kyc.id, requirement.code, "KYC");
    kyc = await ae.request(`/api/v1/kyc-cases/${kyc.id}/requirements/${requirement.code}`, "PUT", { command: command(kyc), documentId: proof.documentId, documentVersion: proof.documentVersion, receivedAt: proof.occurredAt });
  }
  const missingReviewer = await ae.request(`/api/v1/kyc-cases/${kyc.id}/submit`, "POST", command(kyc), 409);
  if (missingReviewer.code !== "NO_ELIGIBLE_KYC_REVIEWER") throw new Error("Missing-reviewer submission was not rejected as expected.");
  const reviewers = await crm.request("/api/v1/kyc-reviewers?page=0&size=100");
  if (!reviewers.items.some((r) => r.id === rc.me.id)) throw new Error("The selected compliance account is not eligible.");
  kyc = await crm.request(`/api/v1/kyc-cases/${kyc.id}/assignment`, "POST", { ...command(kyc, "Synthetic independent compliance review"), assigneeId: rc.me.id });
  const stale = await crm.request(`/api/v1/kyc-cases/${kyc.id}/assignment`, "POST", { ...command({ version: kyc.version - 1 }, "Synthetic stale-version check"), assigneeId: rc.me.id }, 409);
  if (stale.code !== "STALE_VERSION") throw new Error("Stale assignment was not rejected.");
  kyc = await ae.request(`/api/v1/kyc-cases/${kyc.id}/submit`, "POST", command(kyc));
  proof = await evidence(rc, "KYC", kyc.id, "SCREENING", "KYC");
  kyc = await rc.request(`/api/v1/kyc-cases/${kyc.id}/record-screening`, "POST", { command: command(kyc), result: "CLEAR", notes: "SYNTHETIC TEST ONLY: no real screening represented", documentId: proof.documentId, documentVersion: proof.documentVersion });
  proof = await evidence(rc, "KYC", kyc.id, "KYC_APPROVAL", "APPROVAL_EVIDENCE");
  kyc = await rc.request(`/api/v1/kyc-cases/${kyc.id}/decisions`, "POST", { command: command(kyc), decision: "APPROVE", reason: "SYNTHETIC QA approval only", documentId: proof.documentId, documentVersion: proof.documentVersion });
  const history = await crm.request(`/api/v1/kyc-cases/${kyc.id}/history?page=0&size=50`);
  if (!Array.isArray(history) || !history.some((h) => h.action === "KYC_ASSIGNED")) throw new Error("KYC history did not retain assignment.");
  pass("Shared KYC documents, missing-reviewer block, eligible assignment, stale-version block, screening, decision and array history");

  async function approve(resource, actor) {
    const id = resource.approvalRequests.RECOMMENDATION;
    const h = await actor.request(`/api/v1/approvals/${id}/history?page=0&size=50`);
    const step = h.steps.find((s) => s.number === h.request.currentStep);
    const p = await evidence(actor, "ONBOARDING", resource.id, step.evidencePurpose, "APPROVAL_EVIDENCE");
    await actor.request(`/api/v1/approvals/${id}/decisions`, "POST", { version: h.request.version, decision: "APPROVE", comment: "SYNTHETIC QA approval only", evidence: [{ documentId: p.documentId, version: p.documentVersion }] });
    return getTrack(actor, resource);
  }
  async function eligibleStaff(resource, responsibility, expectedId) {
    const path = `/api/v1/onboarding-cases/${resource.id}/assignees?responsibility=${responsibility}`;
    const first = await crm.request(`${path}&page=0&size=100`);
    const all = [...first.items];
    for (let page = 1; page < first.totalPages; page++) {
      const result = await crm.request(`${path}&page=${page}&size=100`);
      if (result.totalElements !== first.totalElements) throw new Error("Specialist eligibility changed during pagination; repeat acceptance.");
      all.push(...result.items);
    }
    if (all.length !== first.totalElements) throw new Error("Specialist lookup is incomplete.");
    if (!all.some((person) => person.id === expectedId)) throw new Error(`Eligible ${responsibility} specialist is missing from case lookup.`);
    if (all.some((person) => !person.id || !person.fullName)) throw new Error("Specialist lookup returned an invalid choice.");
    const sorted = [...all].sort((a, b) => a.fullName === b.fullName ? (a.id < b.id ? -1 : a.id === b.id ? 0 : 1) : a.fullName < b.fullName ? -1 : 1);
    if (JSON.stringify(sorted) !== JSON.stringify(all)) throw new Error("Specialist choices are not ordered by full name then ID.");
    const paged = [];
    for (let page = 0; page < first.totalElements; page++) {
      const result = await crm.request(`${path}&page=${page}&size=1`);
      if (result.page !== page || result.size !== 1 || result.totalElements !== first.totalElements || result.totalPages !== first.totalElements) throw new Error("Specialist pagination metadata is inconsistent.");
      paged.push(...result.items);
    }
    if (JSON.stringify(paged) !== JSON.stringify(all)) throw new Error("Specialist filtering/order differs between page sizes.");
    await ae.request(`${path}&page=0&size=100`, "GET", undefined, 403);
    return all;
  }
  let trackFailure;
  for (const item of tracks) {
    try {
    let t = item.value;
    await eligibleStaff(t, "TECHNICAL", td.me.id);
    const underwritingChoices = await eligibleStaff(t, "UNDERWRITING", gi.me.id);
    if (underwritingChoices.some((choice) => !users.find((user) => user.id === choice.id)?.roles.includes("GI_UNDERWRITING_MANAGER"))) throw new Error("GI track lookup returned a specialist without the GI underwriting role.");
    pass(`${item.tier}: scoped specialist lookup, required roles, restricted-client eligibility and pagination`);
    t = await post(crm, t, "assignment", { command: command(t, "Synthetic technical assignment"), responsibility: "TECHNICAL", assigneeId: td.me.id });
    t = await post(crm, t, "assignment", { command: command(t, "Synthetic underwriting assignment"), responsibility: "UNDERWRITING", assigneeId: gi.me.id });
    await td.request(`/api/v1/leads/${lead.id}`, "GET", undefined, 404);
    await getTrack(td, t);
    await gi.request(`/api/v1/leads/${lead.id}`, "GET", undefined, 404);
    await getTrack(gi, t);
    await gi.request("/api/v1/tasks?assignedToMe=true&size=100");
    if (gi.me.permissions.includes("TASK_ASSIGN")) await gi.request("/api/v1/tasks?assignedToMe=false&size=100");
    else await gi.request("/api/v1/tasks?assignedToMe=false&size=100", "GET", undefined, 403);
    await crm.request("/api/v1/tasks?assignedToMe=false&size=100");
    pass("Scoped task listing returns personal/team results or an explicit permission rejection instead of a server error");
    t = await post(ae, t, "qualify-kyc", command(t));
    t = await post(crm, t, "deadline", { command: command(t, "Synthetic reasoned deadline adjustment"), milestone: "SURVEY", dueAt: new Date(Date.now() + 5 * 86400000).toISOString() });
    proof = await evidence(td, "ONBOARDING", t.id, "RISK_SURVEY");
    t = await post(td, t, "risk-survey", { evidence: { command: command(t), ...proof }, grade: "LOW", findings: "Synthetic test findings only" });
    proof = await evidence(td, "ONBOARDING", t.id, "PROGRAM", "APPROVAL_EVIDENCE");
    t = await post(td, t, "program", { evidence: { command: command(t), ...proof }, terms: "Synthetic property programme" });
    for (const insurer of insurers) {
      proof = await evidence(gi, "ONBOARDING", t.id, `INSURER_LICENSE_${insurer.id.replaceAll("-", "")}`);
      t = await post(gi, t, "insurer-license", { evidence: { command: command(t), ...proof }, insurerId: insurer.id, validUntil: day(365), source: "SYNTHETIC QA licensing evidence; not an operational observation" });
    }
    pass(`${item.tier}: lowercase insurer-UUID evidence upload and licence qualification`);
    proof = await evidence(gi, "ONBOARDING", t.id, "RFQ");
    t = await post(gi, t, "dispatch-rfq", { evidence: { command: command(t), ...proof }, insurerIds: insurers.map((i) => i.id), responseDue: day(3) });
    const terms = { insurerId: insurers[0].id, productId: product.id, insuredName: title, effectDate: day(30), expiryDate: day(395), netPremium: 100000000, totalPremium: 118000000, currency: "RWF", commissionRate: 0.15, sumsInsured: "Synthetic RWF 1 billion", limits: "Synthetic policy limits", deductibles: "Synthetic deductibles", exclusions: "Synthetic exclusions", claimsSupport: "Synthetic claims support" };
    for (const insurer of insurers.slice(0, 2)) {
      proof = await evidence(gi, "ONBOARDING", t.id, "QUOTE");
      t = await post(gi, t, "quotes", { evidence: { command: command(t), ...proof }, terms: { ...terms, insurerId: insurer.id }, insurerReference: `SYNTHETIC-${runId}` });
    }
    t = await post(gi, t, "insurer-response", { command: command(t), insurerId: insurers[2].id, outcome: "DECLINED", detail: "Synthetic test decline" });
    const quote = t.quotes.find((q) => q.terms.insurerId === terms.insurerId);
    proof = await evidence(gi, "ONBOARDING", t.id, "RECOMMENDATION");
    t = await post(gi, t, "recommend", { evidence: { command: command(t), ...proof }, quoteId: quote.id, quoteVersion: quote.version, annualCommissionRwf: item.tier === "STANDARD" ? 500000 : item.tier === "LARGE" ? 5000000 : 15000000, commissionBasis: "Explicit synthetic tier observation", comparison: "Synthetic comparison of two quotes", rationale: "Synthetic acceptance test" });
    t = await post(gi, t, "request-approval", command(t));
    if (item.tier === "STRATEGIC") {
      t = await approve(t, md);
      proof = await evidence(md, "ONBOARDING", t.id, "BOARD_APPROVAL", "APPROVAL_EVIDENCE");
      t = await post(md, t, "record-board-approval", { command: command(t), ...proof });
    } else { t = await approve(t, td); if (item.tier === "LARGE") t = await approve(t, md); }
    pass(`${item.tier}: internal approval${item.tier === "STRATEGIC" ? " and MD recording of the Board decision" : ""}`);
    proof = await evidence(ae, "ONBOARDING", t.id, "CLIENT_PRESENTATION");
    t = await post(ae, t, "record-presentation", { command: command(t), ...proof });
    proof = await evidence(ae, "ONBOARDING", t.id, "CLIENT_ACCEPTANCE", "CLIENT_ACCEPTANCE");
    t = await post(ae, t, "record-client-acceptance", { command: command(t), ...proof });
    if (item.tier !== "STANDARD") { proof = await evidence(gi, "ONBOARDING", t.id, "PROPERTY_ASSET_LIST"); t = await post(gi, t, "property-assets", { command: command(t), ...proof }); }
    proof = await evidence(gi, "ONBOARDING", t.id, "PLACEMENT"); t = await post(gi, t, "place", { command: command(t), ...proof });
    proof = await evidence(gi, "ONBOARDING", t.id, "PLACEMENT_CONFIRMATION"); t = await post(gi, t, "confirm-placement", { command: command(t), ...proof });
    proof = await evidence(gi, "ONBOARDING", t.id, "SCHEDULE", "POLICY_SCHEDULE"); t = await post(gi, t, "receive-schedule", { evidence: { command: command(t), ...proof }, externalPolicyNumber: `SYNTHETIC-${runId}-${item.tier}`, observed: terms, discrepancies: [] });
    proof = await evidence(td, "ONBOARDING", t.id, "POLICY_TECHNICAL_APPROVAL", "APPROVAL_EVIDENCE"); t = await post(td, t, "technical-verification", { command: command(t), ...proof });
    t = await post(gi, t, "verify", command(t)); t = await post(gi, t, "convert", { command: command(t), amountPaid: 0 });
    if (!t.policyId || !t.policyPeriodId || !t.renewalId || t.stage !== 11 || t.status !== "OPEN") throw new Error("Conversion did not retain the open welcome stage with issued references.");
    const letter = await evidence(ae, "ONBOARDING", t.id, "WELCOME_LETTER");
    const delivery = await evidence(ae, "ONBOARDING", t.id, "POLICY_DELIVERY");
    const fileChecklist = await evidence(ae, "ONBOARDING", t.id, "FILE_CHECKLIST");
    t = await post(ae, t, "complete-welcome", { command: command(t), letter, delivery, fileChecklist });
    if (t.status !== "COMPLETED") throw new Error("Welcome did not complete the track.");
    pass(`${item.tier}: all 11 stages, ${item.tier === "STANDARD" ? "ordinary placement" : "property asset gate"}, exact schedule, conversion, renewal and welcome`);
    } catch (error) { trackFailure = error; console.error(`BLOCKED later-stage acceptance: ${error.message}`); break; }
  }
  await rc.request(`/api/v1/kyc-templates/${templateCode}`, "PUT", { expectedVersion: 1, clientType: "CORPORATE", requirements: template.requirements, reason: "Synthetic checklist invalidation and restart test" }, 204);
  const readiness = await ae.request(`/api/v1/clients/${lead.clientId}/kyc-summary`);
  if (readiness.gateStatus !== "KYC_TEMPLATE_CHANGED") throw new Error("A changed checklist did not invalidate prior approval.");
  const restarted = await ae.request("/api/v1/kyc-cases", "POST", { commandId: randomUUID(), clientId: lead.clientId, templateCode });
  if (restarted.status !== "DRAFT" || restarted.id === kyc.id) throw new Error("A fresh review did not start after checklist invalidation.");
  pass("Empty checklist-update responses, invalidation of old approval, and starting a fresh KYC review");
  if (trackFailure) throw new Error(`Later-stage acceptance remains blocked: ${trackFailure.message}`);
  console.log(`Synthetic acceptance completed. Record prefix: ${title}. Synthetic records are retained for audit; no users were modified.`);
} catch (error) {
  console.error(`FAIL ${error.message}`);
  console.error(`Synthetic record prefix for investigation: ${title}`);
  process.exitCode = 1;
}
