// Official lists from GRAL ("List of insurers and products").
// The Add Policy and Edit Policy forms read their dropdowns from here, so new
// records always use GRAL's own names.
//
// Older names found in the production registers (for example SANLAM, UAP or
// "Workmen Compensation") are not listed here on purpose. The data cleaning
// script translates them to these official names during import.

export type OptionGroup = { label: string; options: string[] };

/* ---------------------------------- Insurers --------------------------------- */

export const INSURER_GROUPS: OptionGroup[] = [
  {
    label: "General (Non-Life) Insurance",
    options: [
      "SONARWA General Insurance Ltd",
      "Sanlam Allianz General Insurance Ltd",
      "PRIME Insurance Ltd",
      "MUA Insurance Company Rwanda Ltd",
      "Old Mutual Insurance Rwanda PLC",
      "Radiant Insurance Company",
      "Britam Insurance Company Rwanda Ltd",
      "BK General Insurance Company Ltd",
      "Mayfair Insurance Company Rwanda Ltd",
      "Eden Care Healthcare (Rwanda) Limited",
    ],
  },
  {
    label: "Life Insurance",
    options: [
      "SONARWA Life Assurance Company Ltd",
      "PRIME Life Insurance Ltd",
      "Sanlam Allianz Life Insurance Plc",
    ],
  },
];

/* ---------------------------------- Products --------------------------------- */

export const PRODUCT_GROUPS: OptionGroup[] = [
  {
    label: "Motor Insurance",
    options: [
      "Motor Commercial Lines",
      "Motor Personal Lines",
      "Motor Third Party Liability",
    ],
  },
  {
    label: "Property Insurance",
    options: [
      "Fire & Allied Perils / Natural Forces",
      "Aviation (Aircraft Hull)",
      "Marine (Ships and Inland Waterway Vessels)",
      "Theft & Burglary",
      "All Risks / Industrial All Risks",
    ],
  },
  {
    label: "Miscellaneous",
    options: [
      "Damage to Property",
      "Expropriation & Confiscation of Property",
      "Personal Lines Property",
    ],
  },
  {
    label: "Transit / Transportation Insurance",
    options: [
      "Goods in Transit / Carriers Liability",
      "Marine Cargo",
      "Aviation Cargo",
    ],
  },
  {
    label: "Liability Insurance",
    options: [
      "Professional Indemnity",
      "Public Liability / General Liability / Product Liability",
      "Employers' Liability / Workmen's Compensation (WIBA)",
      "Directors & Officers Liability",
      "Tour Operator Liability",
      "Student Liability",
    ],
  },
  {
    label: "Financial Lines",
    options: [
      "Guarantee / Fidelity Insurance",
      "Credit Insurance",
      "Bankers Blanket Bond",
    ],
  },
  {
    label: "Other Short-Term Products",
    options: [
      "Electronic All Risks",
      "Engineering / Machinery Breakdown",
      "Agricultural Insurance (Crop and Livestock)",
      "Travel Insurance",
      "Personal Accident",
      "Group Personal Accident",
    ],
  },
  {
    label: "Long-Term (Life) Insurance",
    options: [
      "Group Life Assurance",
      "Group Medical / Personal Health Insurance",
      "Pension Fund",
    ],
  },
];

/* --------------------------- Flat lists, for checks --------------------------- */

export const INSURERS: string[] = INSURER_GROUPS.flatMap((g) => g.options);
export const CLASSES_OF_INSURANCE: string[] = PRODUCT_GROUPS.flatMap((g) => g.options);