// Money entry safeguards (TA feedback, 21 Oct): amounts are shown grouped and
// in words while they are typed, and the forms warn about figures that look
// like a slipped zero before anything is saved. Warnings never block; the
// person confirms they checked. Hard rules stay in each form's validation.

import { formatRwf } from "./format";

/** "12,500,000" or "12500000" to a number. NaN when empty or not a whole number. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[,\s]/g, "");
  return /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

/** Keeps the digits and groups them: "12500000" becomes "12,500,000". */
export function groupDigits(text: string): string {
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];

function under1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  else if (rest) parts.push(ONES[rest]!);
  return parts.join(" ");
}

/** 12500000 becomes "Twelve million, five hundred thousand". Empty for amounts it cannot read. */
export function amountInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e15 || !Number.isInteger(n)) return "";
  if (n === 0) return "Zero";
  const groups: string[] = [];
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(`${under1000(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
  }
  const text = groups.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** True when one figure is about 10, 100 or 1,000 times the other: the usual sign of an added or missing zero. */
export function looksLikeZeroSlip(value: number, reference: number): boolean {
  if (!(value > 0 && reference > 0)) return false;
  const ratio = Math.log10(Math.max(value, reference) / Math.min(value, reference));
  return ratio >= 0.9 && Math.abs(ratio - Math.round(ratio)) < 0.1;
}

const pct = (x: number) => `${+(x * 100).toFixed(x < 0.001 ? 4 : 2)}%`;

/** Figures on a policy that are allowed but unusual, in plain words. */
export function policyAmountWarnings(
  v: { sumInsured: number; premium: number; netPremium: number; amountPaid: number; commissionRate: number; start: string; renewal: string },
  before?: { sumInsured?: number; premium?: number; netPremium?: number; amountPaid?: number },
): string[] {
  const w: string[] = [];
  const rate = v.premium / v.sumInsured;
  if (rate < 0.0001) {
    w.push(`The premium is only ${pct(rate)} of the sum insured. Check for a missing zero in the premium or an extra one in the sum insured.`);
  } else if (rate > 0.1) {
    w.push(`The premium is ${pct(rate)} of the sum insured, which is unusually high. Check both figures.`);
  }
  if (v.netPremium < v.premium * 0.6) {
    w.push(`The net premium is only ${pct(v.netPremium / v.premium)} of the total premium. Taxes and levies are usually a much smaller part.`);
  }
  if (v.amountPaid > v.premium) w.push(`The amount paid (${formatRwf(v.amountPaid)}) is more than the total premium.`);
  if (v.commissionRate > 30) w.push(`A commission rate of ${v.commissionRate}% is unusually high.`);

  const months = monthsBetween(v.start, v.renewal);
  if (months < 11 || months > 13) w.push(`The cover runs about ${months} months. Most policies run 12 months; check the dates.`);

  if (before) {
    const labels = { sumInsured: "sum insured", premium: "total premium", netPremium: "net premium", amountPaid: "amount paid" } as const;
    for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
      const old = before[key];
      if (old !== undefined && looksLikeZeroSlip(v[key], old)) {
        const times = Math.round(Math.max(v[key], old) / Math.min(v[key], old));
        w.push(
          `The ${labels[key]} changed from ${formatRwf(old)} to ${formatRwf(v[key])}, about ${times} times ${v[key] > old ? "more" : "less"}. Check the zeros.`,
        );
      }
    }
  }
  return w;
}

/** Figures on a new claim that are allowed but unusual. */
export function claimAmountWarnings(amount: number, policy?: { id: string; sumInsured?: number }): string[] {
  const w: string[] = [];
  if (amount < 50_000) w.push(`The estimated loss is only ${formatRwf(amount)}. Check for missing zeros.`);
  if (policy?.sumInsured && amount > policy.sumInsured) {
    w.push(
      `The estimated loss is more than the sum insured on ${policy.id} (${formatRwf(policy.sumInsured)}). Check the amount. If it is right, the client may be under-insured.`,
    );
  }
  return w;
}

/** A settlement offer compared with the claimed amount. */
export function settlementWarnings(offer: number, claimed: number): string[] {
  const w: string[] = [];
  if (offer > claimed) w.push(`The offer is more than the estimated loss (${formatRwf(claimed)}).`);
  else if (looksLikeZeroSlip(offer, claimed)) w.push(`The offer is about a tenth or less of the estimated loss (${formatRwf(claimed)}). Check the zeros.`);
  return w;
}

function monthsBetween(start: string, end: string): number {
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);
  return Math.round(((y2! - y1!) * 12 + (m2! - m1!) + (d2! - d1!) / 30) * 10) / 10;
}
