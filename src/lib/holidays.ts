// Rwanda's public holidays (Presidential Order on official holidays). Used by
// the calendar when the backend's business calendar (/api/v1/workflow/calendar)
// has no holidays loaded yet. Eid dates follow the moon and are confirmed by
// the government shortly before; the ones below are the expected dates.

export type Holiday = { date: string; label: string; expected?: boolean };

export const RWANDA_HOLIDAYS: Holiday[] = [
  // 2026
  { date: "2026-01-01", label: "New Year's Day" },
  { date: "2026-01-02", label: "Day after New Year's Day" },
  { date: "2026-02-01", label: "National Heroes' Day" },
  { date: "2026-03-20", label: "Eid al-Fitr", expected: true },
  { date: "2026-04-03", label: "Good Friday" },
  { date: "2026-04-06", label: "Easter Monday" },
  { date: "2026-04-07", label: "Genocide against the Tutsi Memorial Day" },
  { date: "2026-05-01", label: "Labour Day" },
  { date: "2026-05-27", label: "Eid al-Adha", expected: true },
  { date: "2026-07-01", label: "Independence Day" },
  { date: "2026-07-04", label: "Liberation Day" },
  { date: "2026-08-07", label: "Umuganura (Harvest Day)" },
  { date: "2026-08-15", label: "Assumption Day" },
  { date: "2026-12-25", label: "Christmas Day" },
  { date: "2026-12-26", label: "Boxing Day" },
  // 2027
  { date: "2027-01-01", label: "New Year's Day" },
  { date: "2027-01-02", label: "Day after New Year's Day" },
  { date: "2027-02-01", label: "National Heroes' Day" },
  { date: "2027-03-10", label: "Eid al-Fitr", expected: true },
  { date: "2027-03-26", label: "Good Friday" },
  { date: "2027-03-29", label: "Easter Monday" },
  { date: "2027-04-07", label: "Genocide against the Tutsi Memorial Day" },
  { date: "2027-05-01", label: "Labour Day" },
  { date: "2027-05-17", label: "Eid al-Adha", expected: true },
  { date: "2027-07-01", label: "Independence Day" },
  { date: "2027-07-04", label: "Liberation Day" },
  { date: "2027-08-06", label: "Umuganura (Harvest Day)" },
  { date: "2027-08-15", label: "Assumption Day" },
  { date: "2027-12-25", label: "Christmas Day" },
  { date: "2027-12-26", label: "Boxing Day" },
];
