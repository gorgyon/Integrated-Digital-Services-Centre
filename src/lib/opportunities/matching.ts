/** Transparent, deterministic vacancy matching. No AI and no inferred credentials. */

export type MatchStatus = "eligible" | "potential" | "not_eligible";
export type ClosingFilter = "all" | "7" | "30" | "90";
export interface MatchFilters {
  category: string;
  location: string;
  closing: ClosingFilter;
  status: MatchStatus | "all";
  savedOnly: boolean;
  page: number;
}

const CATEGORIES = ["all", "job", "bursary", "scholarship", "internship", "learnership", "apprenticeship", "grant", "other"];
const STATUSES = ["all", "eligible", "potential", "not_eligible"];

export function cleanMatchFilters(input: object): MatchFilters {
  const values = input as Record<string, unknown>;
  const category = typeof values["category"] === "string" && CATEGORIES.includes(values["category"]) ? values["category"] : "all";
  const status = typeof values["status"] === "string" && STATUSES.includes(values["status"]) ? values["status"] as MatchStatus | "all" : "all";
  const closingValue = String(values["closing"] ?? "all");
  const closing: ClosingFilter = closingValue === "7" || closingValue === "30" || closingValue === "90" ? closingValue : "all";
  const page = Math.max(1, Math.min(10000, Math.floor(Number(values["page"])) || 1));
  return { category, status, closing, page, location: clean(values["location"]).slice(0, 100), savedOnly: values["savedOnly"] === true || values["savedOnly"] === "true" };
}

export interface CareerEntryLike {
  kind: string;
  confirmed_data: unknown;
}

export interface OpportunityLike {
  title: string;
  description: string | null;
  eligibility_criteria: string | null;
  application_requirements: string | null;
  location_restrictions: string[] | null;
  south_africa_eligibility: string;
}

export interface RequirementResult {
  text: string;
  met: boolean | null;
  matched: string[];
  reason: string;
}

export interface OpportunityMatch {
  status: MatchStatus;
  mandatory: RequirementResult[];
  preferred: RequirementResult[];
  matched: string[];
  missing: string[];
  unmet: string[];
  explanation: string;
}

type Data = Record<string, string>;
type Entry = { kind: string; data: Data; text: string; label: string };
type Requirement = { text: string; preferred: boolean };

interface Profile {
  all: Entry[];
  education: Entry[];
  results: Entry[];
  skills: Entry[];
  experience: Entry[];
  personal: Entry[];
  location: string;
  evidenceText: string;
  licenceText: string;
}

const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const normal = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const unique = <T,>(items: T[]) => [...new Set(items)];

function asData(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]).filter(([, item]) => item));
}

function labelFor(kind: string, data: Data): string {
  const first = kind === "education" ? data["level"] : kind === "qualification" ? data["title"]
    : kind === "result" ? data["subject"] : kind === "skill" ? data["name"]
      : kind === "experience" ? data["role"] : data["full_name"] || data["headline"];
  const second = kind === "education" ? data["institution"] : kind === "qualification" ? data["issuer"]
    : kind === "result" ? data["grade"] : kind === "experience" ? data["employer"] : "";
  return [first, second].filter(Boolean).join(" — ") || "Confirmed profile detail";
}

/** Only confirmed column data enters matching. Drafts, files and identity documents are not read. */
export function confirmedProfile(entries: CareerEntryLike[]): Profile {
  const all = entries.filter((entry) => entry.confirmed_data && typeof entry.confirmed_data === "object").map((entry) => {
    const data = asData(entry.confirmed_data);
    return { kind: entry.kind, data, text: normal(Object.values(data).join(" ")), label: labelFor(entry.kind, data) };
  });
  const byKind = (...kinds: string[]) => all.filter((entry) => kinds.includes(entry.kind));
  const education = byKind("education", "qualification");
  const results = byKind("result");
  const skills = byKind("skill");
  const experience = byKind("experience");
  const personal = byKind("personal");
  const evidence = [...education, ...results, ...skills, ...experience];
  return {
    all, education, results, skills, experience, personal,
    location: personal.map((entry) => entry.data["location"] || "").find(Boolean) || "",
    evidenceText: normal(evidence.map((entry) => Object.values(entry.data).join(" ")).join(" ")),
    licenceText: normal([...education, ...skills].map((entry) => Object.values(entry.data).join(" ")).join(" ")),
  };
}

const MANDATORY_HEADING = /minimum requirements?|requirements?|qualifications?|what you(?:'|’)ll need|what we(?:'|’)re looking for|experience and skills|skills and experience|about you/i;
const PREFERRED_HEADING = /preferred(?: qualifications| requirements)?|nice to have|advantageous|desirable|bonus/i;
const OTHER_HEADING = /responsibilities?|duties|key performance areas|what you(?:'|’)ll do|about (?:us|the role|the company)|role description|job description|benefits?|salary|how to apply|application process|about this job/i;

function splitCandidates(text: string): string[] {
  return text.replace(/[•▪]/g, "\n").replace(/\s+[-–]\s+(?=[A-Z0-9])/g, "\n")
    .split(/\n+|(?<=[.!?;])\s+/).map((part) => clean(part.replace(/^[-–*]\s*/, ""))).filter((part) => part.length > 2 && part.length <= 600);
}

function sectionRequirements(text: string): Requirement[] {
  const heading = /(?:minimum requirements?|preferred(?: qualifications| requirements)?|requirements?|qualifications?|what you(?:'|’)ll need|what we(?:'|’)re looking for|experience and skills|skills and experience|about you|nice to have|advantageous|desirable|bonus|responsibilities?|duties|key performance areas|what you(?:'|’)ll do|about (?:us|the role|the company)|role description|job description|benefits?|salary|how to apply|application process|about this job)\s*[:\-–]?/gi;
  const matches = [...text.matchAll(heading)];
  const output: Requirement[] = [];
  matches.forEach((match, index) => {
    const title = match[0];
    const preferred = PREFERRED_HEADING.test(title);
    if (!preferred && !MANDATORY_HEADING.test(title)) return;
    const start = (match.index ?? 0) + title.length;
    const end = matches[index + 1]?.index ?? text.length;
    const body = text.slice(start, end);
    for (const candidate of splitCandidates(body)) output.push({ text: candidate, preferred });
  });
  return output;
}

function extractRequirements(opportunity: OpportunityLike): Requirement[] {
  const explicit = [opportunity.eligibility_criteria, opportunity.application_requirements].filter((value): value is string => !!value);
  const requirements: Requirement[] = explicit.flatMap((text) => splitCandidates(text).map((candidate) => ({
    text: candidate,
    preferred: PREFERRED_HEADING.test(candidate),
  })));
  const description = opportunity.description || "";
  requirements.push(...sectionRequirements(description));
  for (const candidate of splitCandidates(description)) {
    if (/\b(?:must|required|mandatory|essential|minimum of|applicants? should have)\b/i.test(candidate)) {
      requirements.push({ text: candidate, preferred: PREFERRED_HEADING.test(candidate) });
    }
  }
  const seen = new Set<string>();
  return requirements.filter(({ text }) => {
    const key = normal(text);
    if (!key || seen.has(key) || /^(?:see|as per) (?:the )?(?:advert|description)/i.test(text)) return false;
    // An explicit waiver is not turned into a requirement.
    if (/\b(?:no|without) (?:a )?(?:matric|degree|diploma|qualification)\b|\b(?:matric|degree|diploma|qualification) (?:is )?not required\b/i.test(text)) return false;
    seen.add(key);
    return true;
  });
}

const SA = /\b(?:south africa|polokwane|limpopo|gauteng|johannesburg|pretoria|sandton|cape town|durban|kwazulu natal|mpumalanga|bloemfontein|port elizabeth|gqeberha|east london|north west|free state|northern cape|western cape|eastern cape)\b/i;

function locationRequirement(opportunity: OpportunityLike): Requirement | null {
  const restrictions = opportunity.location_restrictions || [];
  if (restrictions.length) return { text: `Location eligibility: ${restrictions.join(", ")}`, preferred: false };
  if (opportunity.south_africa_eligibility === "restricted_elsewhere") {
    return { text: "The source states a location restriction outside South Africa", preferred: false };
  }
  return null;
}

function evaluateLocation(text: string, profile: Profile, restrictions: string[]): RequirementResult {
  const location = clean(profile.location);
  const matched = location ? [`Confirmed location: ${location}`] : [];
  if (!location) return { text, met: null, matched: [], reason: "Your confirmed profile has no location to check against this restriction." };
  const allowed = restrictions.some((country) => normal(location).includes(normal(country)) || (normal(country) === "za" && SA.test(location)));
  const southAfrican = SA.test(location) && !restrictions.some((country) => normal(location).includes(normal(country)) && !/south africa|^za$/i.test(country));
  const met = allowed || (restrictions.some((country) => /south africa|^za$/i.test(country)) && SA.test(location))
    ? true : restrictions.length ? false : southAfrican ? false : null;
  return { text, met, matched: met ? matched : [], reason: met ? "Your confirmed location fits the stated restriction."
    : met === false ? "Your confirmed location does not fit the source's stated country restriction."
      : "The source does not state enough location detail to confirm this requirement." };
}

function requiredYears(text: string): number | null {
  const match = text.match(/(?:at least|minimum(?: of)?|min\.?|minimum of)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/i);
  return match?.[1] ? Number(match[1]) : null;
}

function experienceIntervals(profile: Profile, now: Date): { start: number; end: number }[] {
  const intervals: { start: number; end: number }[] = [];
  for (const entry of profile.experience) {
    const period = entry.data["period"] || "";
    const years = period.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || [];
    if (!years.length) continue;
    const start = Date.UTC(years[0]!, 0, 1);
    const present = /present|current|to date/i.test(period);
    if (years.length < 2 && !present) continue; // one year alone does not establish a duration
    const end = present ? now.getTime() : Date.UTC(years[1]!, 11, 31);
    if (end >= start) intervals.push({ start, end });
  }
  return intervals.sort((a, b) => a.start - b.start);
}

function experienceYears(profile: Profile, now: Date): number | null {
  const intervals = experienceIntervals(profile, now);
  if (!intervals.length) return null;
  const merged: { start: number; end: number }[] = [];
  for (const interval of intervals) {
    const prior = merged.at(-1);
    if (prior && interval.start <= prior.end) prior.end = Math.max(prior.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged.reduce((total, interval) => total + (interval.end - interval.start) / (365.25 * 86400000), 0);
}

function evaluateExperience(text: string, years: number, profile: Profile, now: Date): RequirementResult {
  const actual = experienceYears(profile, now);
  if (actual === null) return { text, met: null, matched: [], reason: "No confirmed employment dates establish whether you meet this experience requirement." };
  const met = actual >= years;
  return { text, met, matched: met ? profile.experience.map((entry) => entry.label) : [], reason: met
    ? `Your confirmed employment dates provide about ${actual.toFixed(1)} years of experience.`
    : `Your confirmed employment dates provide about ${actual.toFixed(1)} years; the source asks for ${years}.` };
}

const RANK = { matric: 1, certificate: 2, diploma: 3, bachelor: 4, honours: 5, master: 6, doctorate: 7 } as const;

function educationRank(text: string): number | null {
  const value = normal(text);
  if (/phd|doctorate|doctoral/.test(value)) return RANK.doctorate;
  if (/masters?|msc|mcom|mba/.test(value)) return RANK.master;
  if (/honours|postgraduate diploma|nqf 8/.test(value)) return RANK.honours;
  if (/bachelor|bachelors|bcom|bsc|beng|btech|undergraduate degree|\bdegree\b|nqf 7/.test(value)) return RANK.bachelor;
  if (/diploma|national diploma|nqf 6/.test(value)) return RANK.diploma;
  if (/matric|grade 12|national senior certificate|\bnsc\b|nqf 4/.test(value)) return RANK.matric;
  if (/higher certificate|\bcertificate\b|nqf 5/.test(value)) return RANK.certificate;
  return null;
}

function requirementRank(text: string): number | null {
  const value = normal(text);
  const ranks: number[] = [];
  if (/matric|grade 12|national senior certificate|\bnsc\b|nqf 4/.test(value)) ranks.push(RANK.matric);
  if (/(?:higher )?certificate|nqf 5/.test(value.replace(/national senior certificate/g, ""))) ranks.push(RANK.certificate);
  if (/diploma|nqf 6/.test(value)) ranks.push(RANK.diploma);
  if (/bachelor|\bdegree\b|bcom|bsc|beng|btech|nqf 7/.test(value)) ranks.push(RANK.bachelor);
  if (/honours|postgraduate|nqf 8/.test(value)) ranks.push(RANK.honours);
  if (/masters?|mba|nqf 9/.test(value)) ranks.push(RANK.master);
  if (/phd|doctorate|doctoral|nqf 10/.test(value)) ranks.push(RANK.doctorate);
  return ranks.length ? Math.min(...ranks) : null;
}

const FIELDS = ["information technology", "software development", "computer science", "information systems", "engineering", "accounting", "finance", "education", "teaching", "nursing", "marketing", "human resources", "business administration", "communications", "agriculture", "environmental science"];

function requiredField(text: string): string | null {
  const value = normal(text);
  return FIELDS.find((field) => value.includes(field)) || null;
}

function evaluateEducation(text: string, rank: number, profile: Profile): RequirementResult {
  const field = requiredField(text);
  const qualifying = profile.education.filter((entry) => {
    const entryRank = educationRank(`${entry.data["level"] || ""} ${entry.data["title"] || ""}`);
    return entryRank !== null && entryRank >= rank;
  });
  if (!qualifying.length) {
    const met = profile.education.length ? false : null;
    return { text, met, matched: [], reason: met === false
      ? "Your confirmed education does not include the stated qualification level."
      : "No confirmed qualification establishes this requirement. Missing information is not treated as a rejection by itself." };
  }
  if (field) {
    const fieldMatch = qualifying.find((entry) => entry.text.includes(field));
    const modules = profile.results.filter((entry) => entry.text.includes(field));
    if (!fieldMatch && !modules.length) return { text, met: null, matched: qualifying.map((entry) => entry.label), reason: `Your qualification level matches, but ${field} is not confirmed as its field or specialisation.` };
    const matched = unique([fieldMatch?.label || qualifying[0]!.label, ...modules.map((entry) => entry.label)]);
    return { text, met: true, matched, reason: `Confirmed qualification and specialisation: ${matched.join("; ")}.` };
  }
  return { text, met: true, matched: qualifying.map((entry) => entry.label), reason: `Confirmed qualification: ${qualifying.map((entry) => entry.label).join("; ")}.` };
}

function evaluateLicence(text: string, profile: Profile): RequirementResult {
  const required = normal(text).match(/\bcode (8|10|14|eb|c1)\b/)?.[1] || null;
  const hasLicence = /driver(?: s|s)? licen|driving licen|\bcode (8|10|14|eb|c1)\b/.test(profile.licenceText);
  const hasCode = required ? new RegExp(`\\bcode ${required}\\b`).test(profile.licenceText) : hasLicence;
  const met = hasCode ? true : hasLicence && required ? false : null;
  const evidence = [...profile.education, ...profile.skills].filter((entry) => /driver|driving|\bcode (8|10|14|eb|c1)\b/.test(entry.text)).map((entry) => entry.label);
  return { text, met, matched: met ? evidence : [], reason: met ? `Confirmed driving credential: ${evidence.join("; ")}.`
    : met === false ? `Your confirmed driving credential does not state Code ${required}.`
      : "No confirmed driving credential establishes this requirement." };
}

const SKILLS: [string, RegExp][] = [
  ["JavaScript", /javascript/i], ["TypeScript", /typescript/i], ["Python", /\bpython\b/i], ["Java", /\bjava\b/i],
  ["PHP", /\bphp\b/i], ["SQL", /\bsql\b/i], ["HTML", /\bhtml\b/i], ["CSS", /\bcss\b/i], ["React", /\breact\b/i],
  ["Node.js", /\bnode(?:\.js|js)\b/i], ["Excel", /\bexcel\b/i], ["Word", /\b(?:ms |microsoft )?word\b/i],
  ["PowerPoint", /powerpoint/i], ["Communication", /communication/i], ["Teamwork", /team ?work/i],
  ["Customer service", /customer (?:service|support)/i], ["Project management", /project management/i],
  ["Data analysis", /data analys/i], ["Accounting", /accounting/i], ["Bookkeeping", /bookkeeping/i],
  ["Sales", /\bsales\b/i], ["Marketing", /marketing/i], ["Software development", /software development/i],
  ["Teaching", /teaching/i], ["Nursing", /nursing/i], ["Welding", /welding/i], ["Plumbing", /plumbing/i],
];

function evaluateSkills(text: string, profile: Profile): RequirementResult | null {
  const terms = SKILLS.filter(([, pattern]) => pattern.test(text));
  if (!terms.length) return null;
  const matches = terms.filter(([, pattern]) => pattern.test(profile.evidenceText));
  const alternative = /\bor\b/i.test(text) && !/\band\b/i.test(text);
  const met = matches.length > 0 && (alternative || matches.length === terms.length) ? true : null;
  const evidence = profile.all.filter((entry) => entry.kind !== "personal" && matches.some(([, pattern]) => pattern.test(entry.text))).map((entry) => entry.label);
  return { text, met, matched: met ? unique(evidence) : [], reason: met
    ? `Confirmed in your education, results, skills or experience: ${matches.map(([name]) => name).join(", ")}.`
    : "This skill or knowledge requirement is not confirmed in your profile; it is not treated as a rejection by itself." };
}

function evaluateGeneric(text: string, profile: Profile): RequirementResult {
  const cue = text.match(/(?:experience (?:with|in)|knowledge of|proficien\w+ (?:with|in)|skills? (?:in|with)|ability to)\s+([^.!?;]+)/i)?.[1];
  const words = normal(cue || "").split(" ").filter((word) => word.length > 2 && !/^(?:and|with|the|for|you|your|their|use|using|ability|strong|good|excellent)$/.test(word));
  if (words.length) {
    const covered = words.filter((word) => profile.evidenceText.includes(word));
    if (covered.length === words.length || (words.length > 2 && covered.length / words.length >= 0.8)) {
      const evidence = profile.all.filter((entry) => entry.kind !== "personal" && covered.some((word) => entry.text.includes(word))).map((entry) => entry.label);
      return { text, met: true, matched: unique(evidence), reason: "Confirmed by related wording in your profile." };
    }
  }
  return { text, met: null, matched: [], reason: "The source wording cannot be confirmed automatically from your profile. Review it before applying." };
}

function evaluate(requirement: Requirement, opportunity: OpportunityLike, profile: Profile, now: Date): RequirementResult {
  const text = requirement.text;
  if (text.startsWith("Location eligibility:") || text.startsWith("The source states a location restriction")) {
    return evaluateLocation(text, profile, opportunity.location_restrictions || []);
  }
  const locationCue = text.match(/(?:must|required to|applicants? must)\s+(?:be\s+)?(?:based|located|resident|reside)\s+in\s+([^.!?;,]+)/i);
  if (locationCue?.[1]) return evaluateLocation(text, profile, [locationCue[1]]);
  const years = requiredYears(text);
  if (years !== null && /experience|work(?:ing)?|employment/i.test(text)) return evaluateExperience(text, years, profile, now);
  if (/driver(?:'s|s)? licen|driving licen|\bcode (?:8|10|14|eb|c1)\b/i.test(text)) return evaluateLicence(text, profile);
  const rank = requirementRank(text);
  if (rank !== null) return evaluateEducation(text, rank, profile);
  return evaluateSkills(text, profile) || evaluateGeneric(text, profile);
}

export function matchOpportunity(opportunity: OpportunityLike, profile: Profile, now = new Date()): OpportunityMatch {
  const location = locationRequirement(opportunity);
  const requirements = [...(location ? [location] : []), ...extractRequirements(opportunity)];
  const mandatory = requirements.filter((item) => !item.preferred).map((item) => evaluate(item, opportunity, profile, now));
  const preferred = requirements.filter((item) => item.preferred).map((item) => evaluate(item, opportunity, profile, now));
  const status: MatchStatus = mandatory.some((item) => item.met === false) ? "not_eligible"
    : mandatory.length > 0 && mandatory.every((item) => item.met === true) ? "eligible" : "potential";
  const explanation = status === "not_eligible" ? "At least one stated mandatory requirement is not met by your confirmed profile."
    : status === "eligible" ? "All mandatory requirements identified in the source are met by your confirmed profile."
      : mandatory.length ? "Some mandatory requirements are unclear or not confirmed. Missing information has not caused a rejection."
        : "The source does not state enough mandatory requirements to confirm eligibility.";
  return {
    status, mandatory, preferred,
    matched: unique([...mandatory, ...preferred].flatMap((item) => item.matched)),
    missing: mandatory.filter((item) => item.met === null).map((item) => item.text),
    unmet: mandatory.filter((item) => item.met === false).map((item) => item.text),
    explanation,
  };
}
