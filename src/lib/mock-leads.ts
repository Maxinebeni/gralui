// Sample leads, policy tracks and KYC reviews for demo mode, in the backend's
// exact shapes (LeadView, OnboardingView, KycView). IDs of people, insurers and
// products are their names here; on the backend they are UUIDs. Dates move with
// the calendar, so each sample stays at the same point of the process.

import { addWorkingDays } from "./claims";
import { todayIso } from "./renewals";
import { SUGGESTED_KYC_REQUIREMENTS } from "./onboarding";
import type { KycReview, KycTemplate, Lead, PolicyTrack, Proof, TrackMilestone } from "./types";

const day = (n: number) => addWorkingDays(todayIso(), n);
const at = (n: number, hour = 9) => `${day(n)}T${String(hour).padStart(2, "0")}:00:00Z`;

let docSeq = 0;
function proof(purpose: string, n: number, fileName: string): Proof {
  docSeq += 1;
  return { purpose, documentId: `demo-doc-${docSeq}`, documentVersion: 1, occurredAt: at(n), fileName };
}

function lead(p: Partial<Lead> & Pick<Lead, "id" | "name" | "industry" | "source" | "contactName" | "receivedAt">): Lead {
  return {
    type: "CORPORATE",
    status: "OPEN",
    version: 1,
    confirmed: false,
    assessed: false,
    blockers: [],
    possibleDuplicateLeadIds: [],
    work: [],
    registeredAt: p.receivedAt,
    updatedAt: p.receivedAt,
    responseDueAt: p.receivedAt.replace(/T.*/, "T23:59:00Z"),
    needsDueAt: `${addWorkingDays(p.receivedAt.slice(0, 10), 3)}T17:00:00Z`,
    ...p,
  };
}

/** Milestones up to and including `stage`; earlier ones completed. */
function milestones(stage: number, due: number): TrackMilestone[] {
  const codes: [number, string][] = [
    [3, "KYC"], [4, "SURVEY"], [5, "PROGRAM"], [6, "RFQ"], [7, "COMPARISON"],
    [8, "APPROVAL"], [9, "ACCEPTANCE"], [10, "PLACEMENT"], [11, "WELCOME"],
  ];
  return codes
    .filter(([n]) => n <= stage)
    .map(([n, code]) => ({ code, stage: n, status: n < stage ? "COMPLETED" : "OPEN", dueAt: n < stage ? at(due - (stage - n) * 2) : at(due, 17) }));
}

function track(p: Partial<PolicyTrack> & Pick<PolicyTrack, "id" | "leadId" | "clientId" | "productId" | "stage">, due: number): PolicyTrack {
  return {
    underwritingRole: "GI_UNDERWRITING_MANAGER",
    status: "OPEN",
    version: 1,
    materialRevision: 0,
    milestones: milestones(p.stage, due),
    quotes: [],
    approvalRequests: {},
    evidence: [],
    discrepancies: [],
    blockers: [],
    availableActions: [],
    invitations: [],
    renewalProfile: "STANDARD",
    assignees: {},
    ...p,
  };
}

const terms = (insurerId: string, productId: string, insuredName: string, totalPremium: number, extra: string) => ({
  insurerId,
  productId,
  insuredName,
  effectDate: day(15),
  expiryDate: addWorkingDays(day(15), 260),
  netPremium: Math.round(totalPremium * 0.85),
  totalPremium,
  currency: "RWF",
  commissionRate: 0.15,
  sumsInsured: extra,
  limits: "As per the programme",
  deductibles: "10% of each claim, minimum RWF 500,000",
  exclusions: "Standard market exclusions",
  claimsSupport: "Dedicated claims officer; 15 working days to settle",
});

export const DEMO_LEADS: Lead[] = [
  lead({
    id: "LD-2026-011",
    name: "Akagera Agro Processors Ltd",
    industry: "Agriculture",
    source: "Referral from an existing client",
    sourceReference: "Kigali Steel Industries",
    contactName: "Diane Uwera",
    email: "diane.uwera@akagera-agro.rw",
    phone: "+250 788 410 220",
    receivedAt: at(0, 8),
  }),
  lead({
    id: "LD-2026-010",
    name: "Ubuzima Health Cooperative",
    industry: "Health",
    source: "Direct approach",
    contactName: "Claudine Ingabire",
    email: "finance@ubuzima.org.rw",
    phone: "+250 788 302 991",
    receivedAt: at(-2),
    ownerId: "Marie Claire Uwimana",
    confirmed: true,
    respondedAt: at(-2, 14),
    responseEvidence: proof("LEAD_RESPONSE", -2, "Pre-meeting request.pdf"),
  }),
  lead({
    id: "LD-2026-009",
    name: "Kivu Lakeside Hotels Ltd",
    industry: "Hospitality & Tourism",
    source: "Website enquiry",
    contactName: "Patrick Mugabo",
    email: "p.mugabo@kivulakeside.rw",
    phone: "+250 788 550 104",
    receivedAt: at(-6),
    ownerId: "Isabelle Mukamana",
    confirmed: true,
    respondedAt: at(-6, 13),
    responseEvidence: proof("LEAD_RESPONSE", -6, "Response email.pdf"),
    assessed: true,
    assessment: {
      meetingAt: at(-4, 10),
      needs: "Property all risks for 2 hotels and public liability; 140 staff on group medical later",
      assets: "Two hotels on the Lake Kivu shore, Rubavu; 64 rooms; conference centre",
      employeeCount: 140,
      existingCover: "Property with another broker, expires next month",
      evidence: [proof("PRE_MEETING_REQUEST", -5, "Pre-meeting request.pdf"), proof("MEETING_SUMMARY", -4, "Meeting summary.pdf"), proof("MEETING_CONFIRMATION", -3, "Client confirmation.pdf")],
    },
    clientId: "CLT-P009",
    clientName: "Kivu Lakeside Hotels Ltd",
  }),
  lead({
    id: "LD-2026-008",
    name: "Nyarugenge Logistics Ltd",
    industry: "Transport & Logistics",
    source: "Referral from a partner or insurer",
    contactName: "Samuel Kayitare",
    email: "s.kayitare@nyarugenge-logistics.rw",
    phone: "+250 788 220 455",
    receivedAt: at(-14),
    ownerId: "Jean-Paul Habimana",
    confirmed: true,
    respondedAt: at(-14, 15),
    assessed: true,
    assessment: { meetingAt: at(-12), needs: "Motor fleet (42 trucks) and goods in transit", assets: "42 trucks, Gikondo depot", employeeCount: 160, existingCover: "None", evidence: [] },
    clientId: "CLT-P008",
    clientName: "Nyarugenge Logistics Ltd",
  }),
  lead({
    id: "LD-2026-007",
    name: "Umurage Microfinance Ltd",
    industry: "Banking & Finance",
    source: "Tender invitation",
    contactName: "Grace Uwase",
    email: "g.uwase@umurage.rw",
    receivedAt: at(-16),
    ownerId: "Isabelle Mukamana",
    confirmed: true,
    respondedAt: at(-16, 12),
    assessed: true,
    assessment: { meetingAt: at(-14), needs: "Bankers blanket bond and cash in transit", assets: "11 branches", employeeCount: 95, existingCover: "Expiring bond with another insurer", evidence: [] },
    clientId: "CLT-P007",
    clientName: "Umurage Microfinance Ltd",
  }),
  lead({
    id: "LD-2026-006",
    name: "Inzira Construction Ltd",
    industry: "Construction & Real Estate",
    source: "Referral from an existing client",
    contactName: "Eric Ndayisaba",
    email: "e.ndayisaba@inzira.rw",
    receivedAt: at(-19),
    ownerId: "Eric Niyonzima",
    confirmed: true,
    respondedAt: at(-19, 11),
    assessed: true,
    assessment: { meetingAt: at(-17), needs: "Contractors all risks for the Nyabugogo project", assets: "RWF 1.2bn contract works", existingCover: "None", evidence: [] },
    clientId: "CLT-P006",
    clientName: "Inzira Construction Ltd",
  }),
  lead({
    id: "LD-2026-005",
    name: "Aline Mukeshimana",
    type: "INDIVIDUAL",
    industry: "Private individual",
    source: "Referral from an existing client",
    contactName: "Aline Mukeshimana",
    phone: "+250 788 601 333",
    receivedAt: at(-9),
    ownerId: "Marie Claire Uwimana",
    confirmed: true,
    respondedAt: at(-9, 10),
    assessed: true,
    assessment: { meetingAt: at(-8), needs: "Home and contents, and her two cars", assets: "House in Kicukiro, 2 cars", existingCover: "Motor third party only", evidence: [] },
    clientId: "CLT-P005",
    clientName: "Aline Mukeshimana",
  }),
  lead({
    id: "LD-2026-004",
    name: "Rwanda Coffee Exporters Ltd",
    industry: "Agriculture",
    source: "Marketing campaign",
    contactName: "Jean Bosco Nkurunziza",
    receivedAt: at(-30),
    ownerId: "Eric Niyonzima",
    confirmed: true,
    respondedAt: at(-30, 10),
    assessed: true,
    assessment: { meetingAt: at(-28), needs: "Marine cargo for exports", assets: "Warehouse in Kigali Special Economic Zone", existingCover: "None", evidence: [] },
    clientId: "CLT-P004",
    clientName: "Rwanda Coffee Exporters Ltd",
    status: "CONVERTED",
    convertedAt: at(-6),
  }),
  lead({
    id: "LD-2026-003",
    name: "Bugesera Poultry Farm",
    industry: "Agriculture",
    source: "Website enquiry",
    contactName: "Olivier Habineza",
    receivedAt: at(-22),
    ownerId: "Jean-Paul Habimana",
    confirmed: true,
    respondedAt: at(-22, 9),
    status: "CLOSED_LOST",
  }),
];

export const DEMO_TRACKS: PolicyTrack[] = [
  track({ id: "TRK-2026-021", leadId: "LD-2026-009", clientId: "CLT-P009", productId: "Property All Risks", stage: 3, ownerId: "Isabelle Mukamana" }, 0),
  track(
    {
      id: "TRK-2026-018",
      leadId: "LD-2026-008",
      clientId: "CLT-P008",
      productId: "Motor Commercial Lines",
      stage: 7,
      ownerId: "Jean-Paul Habimana",
      riskGrade: "MEDIUM",
      surveyFindings: "Depot fenced and guarded; 6 trucks over 12 years old",
      programTerms: "Comprehensive cover for 42 trucks, RWF 2.1bn total value",
      invitations: [
        { insurerId: "SONARWA General Insurance Ltd", sentAt: at(-5), responseDue: day(-2), response: "QUOTED", resolvedAt: at(-3) },
        { insurerId: "PRIME Insurance Ltd", sentAt: at(-5), responseDue: day(-2), response: "QUOTED", resolvedAt: at(-2) },
        { insurerId: "Radiant Insurance Company", sentAt: at(-5), responseDue: day(-2) },
      ],
      quotes: [
        { id: "Q-18-1", version: 1, receivedAt: at(-3), terms: terms("SONARWA General Insurance Ltd", "Motor Commercial Lines", "Nyarugenge Logistics Ltd", 18_600_000, "42 trucks, RWF 2.1bn") },
        { id: "Q-18-2", version: 1, receivedAt: at(-2), terms: terms("PRIME Insurance Ltd", "Motor Commercial Lines", "Nyarugenge Logistics Ltd", 17_900_000, "42 trucks, RWF 2.1bn") },
      ],
    },
    -1,
  ),
  track(
    {
      id: "TRK-2026-019",
      leadId: "LD-2026-008",
      clientId: "CLT-P008",
      productId: "Marine Cargo",
      stage: 5,
      ownerId: "Jean-Paul Habimana",
      riskGrade: "LOW",
      surveyFindings: "Goods carried in the client's own trucks",
    },
    2,
  ),
  track(
    {
      id: "TRK-2026-016",
      leadId: "LD-2026-007",
      clientId: "CLT-P007",
      productId: "Bankers Blanket Bond",
      stage: 8,
      ownerId: "Isabelle Mukamana",
      riskGrade: "MEDIUM",
      programTerms: "Bankers blanket bond RWF 500m and cash in transit RWF 80m per trip",
      invitations: [
        { insurerId: "Sanlam Allianz General Insurance Ltd", sentAt: at(-7), responseDue: day(-4), response: "QUOTED", resolvedAt: at(-5) },
        { insurerId: "Old Mutual Insurance Rwanda PLC", sentAt: at(-7), responseDue: day(-4), response: "QUOTED", resolvedAt: at(-5) },
        { insurerId: "BK General Insurance Company Ltd", sentAt: at(-7), responseDue: day(-4), response: "DECLINED", resolvedAt: at(-4), responseDetail: "Does not write bankers bond" },
      ],
      quotes: [
        { id: "Q-16-1", version: 1, receivedAt: at(-5), terms: terms("Sanlam Allianz General Insurance Ltd", "Bankers Blanket Bond", "Umurage Microfinance Ltd", 31_000_000, "RWF 500m bond, RWF 80m per trip") },
        { id: "Q-16-2", version: 1, receivedAt: at(-5), terms: terms("Old Mutual Insurance Rwanda PLC", "Bankers Blanket Bond", "Umurage Microfinance Ltd", 33_500_000, "RWF 500m bond, RWF 80m per trip") },
      ],
      recommendation: { quoteId: "Q-16-1", quoteVersion: 1, annualCommissionRwf: 4_650_000, basis: "15% of RWF 31m", comparison: "Sanlam is RWF 2.5m cheaper with the same limits", rationale: "Lowest premium; same limits; better claims support", tier: "LARGE" },
      approvalRequests: { RECOMMENDATION: "APR-2026-018" },
    },
    0,
  ),
  track(
    {
      id: "TRK-2026-014",
      leadId: "LD-2026-006",
      clientId: "CLT-P006",
      productId: "Contractors All Risks",
      stage: 10,
      ownerId: "Eric Niyonzima",
      riskGrade: "HIGH",
      programTerms: "Contract works RWF 1.2bn, third party liability RWF 200m",
      quotes: [{ id: "Q-14-1", version: 1, receivedAt: at(-9), terms: terms("Radiant Insurance Company", "Contractors All Risks", "Inzira Construction Ltd", 14_200_000, "Contract works RWF 1.2bn") }],
      recommendation: { quoteId: "Q-14-1", quoteVersion: 1, annualCommissionRwf: 2_130_000, basis: "15% of RWF 14.2m", comparison: "Radiant cheapest of 3", rationale: "Lowest premium with the full limit", tier: "LARGE" },
      evidence: [
        proof("CLIENT_PRESENTATION", -6, "Presentation.pdf"),
        proof("CLIENT_ACCEPTANCE", -5, "Client acceptance.pdf"),
        proof("PLACEMENT", -4, "Placement instruction.pdf"),
        proof("PLACEMENT_CONFIRMATION", -3, "Radiant confirmation.pdf"),
        proof("SCHEDULE", -1, "Policy schedule.pdf"),
        proof("POLICY_TECHNICAL_APPROVAL", 0, "TD check.pdf"),
      ],
      observedSchedule: terms("Radiant Insurance Company", "Contractors All Risks", "Inzira Construction Ltd", 14_200_000, "Contract works RWF 1.2bn"),
    },
    1,
  ),
  track(
    {
      id: "TRK-2026-020",
      leadId: "LD-2026-005",
      clientId: "CLT-P005",
      productId: "Motor Private",
      stage: 4,
      ownerId: "Marie Claire Uwimana",
    },
    3,
  ),
  track(
    {
      id: "TRK-2026-011",
      leadId: "LD-2026-004",
      clientId: "CLT-P004",
      productId: "Marine Cargo",
      stage: 11,
      status: "COMPLETED",
      ownerId: "Eric Niyonzima",
      convertedAt: at(-6),
      policyId: "RAD/MAR/2026/0310",
      milestones: milestones(11, -4).map((m) => ({ ...m, status: "COMPLETED" })),
    },
    -4,
  ),
];

export const DEMO_KYC_TEMPLATES: KycTemplate[] = [
  { code: "CORPORATE_STANDARD", version: 1, clientType: "CORPORATE", requirements: SUGGESTED_KYC_REQUIREMENTS.CORPORATE },
  { code: "INDIVIDUAL_STANDARD", version: 1, clientType: "INDIVIDUAL", requirements: SUGGESTED_KYC_REQUIREMENTS.INDIVIDUAL },
];

function review(id: string, clientId: string, clientName: string, status: KycReview["status"], received: number, extra: Partial<KycReview> = {}): KycReview {
  const template = clientId === "CLT-P005" ? DEMO_KYC_TEMPLATES[1]! : DEMO_KYC_TEMPLATES[0]!;
  const items: KycReview["items"] = template.requirements.map((r, i) => (i < received ? { ...r, documentId: `kyc-${id}-${i}`, documentVersion: 1 } : { ...r }));
  return {
    id,
    clientId,
    clientName,
    version: 1,
    status,
    templateCode: template.code,
    templateVersion: template.version,
    items,
    blockers: [],
    evidence: items.filter((i) => i.documentId).map((i) => ({ purpose: i.code, documentId: i.documentId!, documentVersion: 1, occurredAt: at(-3), receivedAt: at(-3), fileName: `${i.label}.pdf` })),
    ...extra,
  };
}

export const DEMO_KYC_REVIEWS: KycReview[] = [
  // Midterm demo: only the AML questionnaire is missing (docs/midterm-demo-leads.md).
  review("KYC-2026-009", "CLT-P009", "Kivu Lakeside Hotels Ltd", "DRAFT", 5),
  review("KYC-2026-008", "CLT-P008", "Nyarugenge Logistics Ltd", "APPROVED", 6, { screeningResult: "CLEAR", decidedBy: "Risk & Compliance Manager", decidedAt: at(-9), completeDocumentsAt: at(-11) }),
  review("KYC-2026-007", "CLT-P007", "Umurage Microfinance Ltd", "APPROVED", 6, { screeningResult: "CLEAR", decidedBy: "Risk & Compliance Manager", decidedAt: at(-11) }),
  review("KYC-2026-006", "CLT-P006", "Inzira Construction Ltd", "APPROVED", 6, { screeningResult: "CLEAR", decidedBy: "Risk & Compliance Manager", decidedAt: at(-14) }),
  review("KYC-2026-005", "CLT-P005", "Aline Mukeshimana", "APPROVED", 3, { screeningResult: "CLEAR", decidedBy: "Risk & Compliance Manager", decidedAt: at(-6) }),
  review("KYC-2026-004", "CLT-P004", "Rwanda Coffee Exporters Ltd", "APPROVED", 6, { screeningResult: "CLEAR", decidedBy: "Risk & Compliance Manager", decidedAt: at(-25) }),
];
