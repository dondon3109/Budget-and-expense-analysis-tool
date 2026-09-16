import type { AssistantCompliancePosture, AssistantComplianceTopic } from "@zoption/shared";

export interface ComplianceDecision {
  posture: AssistantCompliancePosture;
  topics: AssistantComplianceTopic[];
  deterministicResponse?: string;
  disclaimer?: string;
}

export function isTagalogComplianceMessage(message: string): boolean {
  return /\b(?:mga|ang|ng|sa|ko|akin|aking|ako|mo|inyo|kanila|ano|magkano|alin|saan|bakit|paano|kumusta|gastos|nagastos|nagasta|kinita|kita|sweldo|sahod|pera|bangko|utang|badyet|buwan|taon|araw|kahapon|ngayon|kanina|subukan|ipakita|pakita|hanapin|meron|mayroon|walang|kabuuan|dapat|mamuhunan|pamumuhunan|buwis|pagbubuwis|seguro|pensyon|pagreretiro|abogado)\b/i.test(
    message,
  );
}

const TOPIC_PATTERNS: Array<[AssistantComplianceTopic, RegExp]> = [
  [
    "investment",
    /\b(?:stocks?|shares?|bonds?|funds?|etfs?|index funds?|mutual funds?|securities|portfolio|asset allocation|invest(?:ment|ing)?|crypto(?:currency)?|bitcoin|mamuhunan|pamumuhunan|mag-invest)\b/i,
  ],
  [
    "tax",
    /\b(?:tax(?:es|ation)?|deduction|filing status|tax return|withholding|vat|buwis|pagbubuwis)\b/i,
  ],
  [
    "retirement",
    /\b(?:retire(?:ment)?|pension|401\s*\(?k\)?|ira|roth|provident fund|retirement account|pagreretiro|pensyon)\b/i,
  ],
  [
    "insurance",
    /\b(?:insurance|whole life|term life|health plan|coverage amount|premium|policy|seguro)\b/i,
  ],
  [
    "estate_legal",
    /\b(?:will|trust|estate plan|probate|power of attorney|legal structure|contract|legal advice|attorney|lawyer|huling habilin|testamento|abogado|payong legal)\b/i,
  ],
];

const PERSONALIZED_DECISION_PATTERN =
  /\b(?:what|which|how much|how)\s+should\s+i\b|\bshould\s+i\b|\b(?:recommend|pick|choose|select|buy|sell|file)\b|\b(?:best|right)\s+(?:for me|option|choice|fund|stock|policy|coverage|allocation|strategy)\b|\b(?:dapat\s+ba(?:\s+akong|\s+ko)|(?:ano|alin|magkano|paano)\s+(?:ang\s+)?dapat\s+ko(?:ng)?|paano\s+ko\s+dapat|magrekomenda|irekomenda|piliin|bumili|ibenta|pinakamainam(?:\s+para\s+sa\s+akin)?|pinakamahusay(?:\s+para\s+sa\s+akin)?)\b/i;

const PERSONAL_CONTEXT_PATTERN =
  /\b(?:for me|my situation|my family|my income|my age|my taxes|my portfolio|para sa akin|sitwasyon ko|pamilya ko|kita ko|edad ko|buwis ko)\b/i;

const DISCLAIMER =
  "Educational information only. For a decision tailored to your situation, consider speaking with an appropriately qualified professional.";

const DISCLAIMER_TAGALOG =
  "Pang-edukasyong impormasyon lamang. Para sa desisyong angkop sa iyong sitwasyon, kumonsulta sa isang lisensyado o kwalipikadong propesyonal.";

function redirectForTopic(topic: AssistantComplianceTopic, isTagalog = false): string {
  if (isTagalog) {
    switch (topic) {
      case "investment":
        return "Maaari kong ipaliwanag ang mga pangkalahatang salik sa pamumuhunan, ngunit hindi ako maaaring magrekomenda ng partikular na pamumuhunan, pondo, seguridad, o alokasyon para sa iyo. Isaalang-alang ang panganib, time horizon, bayarin, dibersipikasyon, at likiditi. Para sa rekomendasyong angkop sa iyong sitwasyon, kumonsulta sa isang lisensyadong tagapayo sa pananalapi.";
      case "tax":
        return "Maaari kong ipaliwanag ang mga pangkalahatang konsepto sa buwis, ngunit hindi ko masasabi kung paano ka dapat maghain o pumili ng diskarte sa buwis para sa iyong sitwasyon. Ang pagpili ay nakasalalay sa kasalukuyang lokal na batas at personal na kalagayan, kaya mainam na kumonsulta sa isang kwalipikadong propesyonal sa buwis.";
      case "retirement":
        return "Maaari kong ipaliwanag kung paano karaniwang gumagana ang mga retirement account at salik sa kontribusyon, ngunit hindi ako maaaring pumili ng personal na kontribusyon o alokasyon para sa iyo. Para sa rekomendasyong angkop sa iyong mga layunin, kumonsulta sa isang lisensyadong tagapayo sa pananalapi o kwalipikadong propesyonal sa buwis.";
      case "insurance":
        return "Maaari kong ipaliwanag ang pagkakaiba ng mga karaniwang uri ng seguro, ngunit hindi ako maaaring pumili ng polisya, produkto, o halaga ng coverage para sa iyo. Ang isang lisensyadong propesyonal sa seguro ay maaaring suriin ang iyong mga pangangailangan at gastusin.";
      case "estate_legal":
        return "Maaari kong ipaliwanag ang konsepto sa pangkalahatan, ngunit hindi ako maaaring gumawa ng legal na dokumento o magbigay ng payong legal para sa iyong sitwasyon. Kumonsulta sa isang kwalipikadong abogado o propesyonal sa batas.";
    }
  }
  switch (topic) {
    case "investment":
      return "I can explain general investment factors, but I can't recommend a specific investment, fund, security, or allocation for you. In general, consider risk, time horizon, fees, diversification, liquidity, and access to the money. For a recommendation tailored to you, consider speaking with a licensed financial professional.";
    case "tax":
      return "I can explain general tax concepts, but I can't tell you how to file or choose a tax strategy for your specific situation. Filing choices depend on current local rules and personal facts, so consider asking a qualified tax professional to review them.";
    case "retirement":
      return "I can explain how retirement accounts and contribution factors work generally, but I can't choose a personalized contribution or allocation for you. For a recommendation tailored to your goals and local rules, consider speaking with a licensed financial or qualified tax professional.";
    case "insurance":
      return "I can explain how common insurance types differ, but I can't select a policy, product, or coverage amount for you. A licensed insurance professional can review your needs, exclusions, and costs.";
    case "estate_legal":
      return "I can explain the concept generally, but I can't draft situation-specific legal documents or provide legal advice for your situation. Consider speaking with a qualified legal professional.";
  }
}

export function classifyCompliance(message: string): ComplianceDecision {
  const isTagalog = isTagalogComplianceMessage(message);
  const topics = TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(message)).map(
    ([topic]) => topic,
  );
  if (topics.length === 0) {
    return { posture: "budgeting_allowed", topics: [] };
  }

  const asksForPersonalizedDecision =
    PERSONALIZED_DECISION_PATTERN.test(message) || PERSONAL_CONTEXT_PATTERN.test(message);
  if (asksForPersonalizedDecision) {
    return {
      posture: "personalized_recommendation_redirect",
      topics,
      deterministicResponse: redirectForTopic(topics[0]!, isTagalog),
      disclaimer: isTagalog ? DISCLAIMER_TAGALOG : DISCLAIMER,
    };
  }

  return {
    posture: "restricted_topic_education",
    topics,
    disclaimer: isTagalog ? DISCLAIMER_TAGALOG : DISCLAIMER,
  };
}
