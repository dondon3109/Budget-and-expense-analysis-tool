import type { AssistantCompliancePosture, AssistantComplianceTopic } from "@zoption/shared";

export interface ComplianceDecision {
  posture: AssistantCompliancePosture;
  topics: AssistantComplianceTopic[];
  deterministicResponse?: string;
  disclaimer?: string;
}

const TOPIC_PATTERNS: Array<[AssistantComplianceTopic, RegExp]> = [
  [
    "investment",
    /\b(?:stocks?|shares?|bonds?|funds?|etfs?|index funds?|mutual funds?|securities|portfolio|asset allocation|invest(?:ment|ing)?|crypto(?:currency)?|bitcoin)\b/i,
  ],
  ["tax", /\b(?:tax(?:es|ation)?|deduction|filing status|tax return|withholding|vat)\b/i],
  [
    "retirement",
    /\b(?:retire(?:ment)?|pension|401\s*\(?k\)?|ira|roth|provident fund|retirement account)\b/i,
  ],
  [
    "insurance",
    /\b(?:insurance|whole life|term life|health plan|coverage amount|premium|policy)\b/i,
  ],
  [
    "estate_legal",
    /\b(?:will|trust|estate plan|probate|power of attorney|legal structure|contract|legal advice|attorney|lawyer)\b/i,
  ],
];

const PERSONALIZED_DECISION_PATTERN =
  /\b(?:what|which|how much|how)\s+should\s+i\b|\bshould\s+i\b|\b(?:recommend|pick|choose|select|buy|sell|file)\b|\b(?:best|right)\s+(?:for me|option|choice|fund|stock|policy|coverage|allocation|strategy)\b/i;

const PERSONAL_CONTEXT_PATTERN =
  /\b(?:for me|my situation|my family|my income|my age|my taxes|my portfolio)\b/i;

const DISCLAIMER =
  "Educational information only. For a decision tailored to your situation, consider speaking with an appropriately qualified professional.";

function redirectForTopic(topic: AssistantComplianceTopic): string {
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
      deterministicResponse: redirectForTopic(topics[0]!),
      disclaimer: DISCLAIMER,
    };
  }

  return {
    posture: "restricted_topic_education",
    topics,
    disclaimer: DISCLAIMER,
  };
}
