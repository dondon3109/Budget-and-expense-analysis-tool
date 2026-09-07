export interface CategoryCandidate {
  id: string;
  name: string;
  kind?: string;
  archived?: boolean;
  locked?: boolean;
  pending?: boolean;
}

export interface MatchCategoryOptions {
  kind?: string;
  contextText?: string | null;
}

export const SEMANTIC_CATEGORY_GROUPS: ReadonlyArray<readonly string[]> = [
  // Food & dining
  [
    "food",
    "dining",
    "food and dining",
    "dining and food",
    "groceries",
    "grocery",
    "supermarket",
    "restaurant",
    "restaurants",
    "cafe",
    "coffee",
    "meal",
    "meals",
    "lunch",
    "dinner",
    "breakfast",
    "snacks",
    "snack",
    "fast food",
    "takeout",
    "food delivery",
    "grab food",
    "foodpanda",
  ],
  // Transport
  [
    "transport",
    "transportation",
    "travel",
    "commute",
    "fare",
    "fares",
    "gas",
    "fuel",
    "gasoline",
    "petrol",
    "diesel",
    "parking",
    "toll",
    "tolls",
    "taxi",
    "cab",
    "grab",
    "uber",
    "angkas",
    "joyride",
    "train",
    "mrt",
    "lrt",
    "bus",
    "jeep",
    "jeepney",
    "flight",
    "flights",
    "airline",
  ],
  // Utilities & Bills
  [
    "utilities",
    "utility",
    "bills",
    "bill",
    "electric",
    "electricity",
    "meralco",
    "water",
    "maynilad",
    "manila water",
    "internet",
    "wifi",
    "broadband",
    "fiber",
    "phone",
    "mobile",
    "load",
    "prepaid",
    "postpaid",
    "telecom",
    "pldt",
    "globe",
    "smart",
    "power",
    "cable",
  ],
  // Housing / Rent
  [
    "housing",
    "rent",
    "rental",
    "mortgage",
    "home",
    "apartment",
    "condo",
    "condominium",
    "hoa",
    "association dues",
    "lease",
  ],
  // Leisure & Shopping / Entertainment
  [
    "leisure",
    "shopping",
    "gifts",
    "gift",
    "entertainment",
    "recreation",
    "hobby",
    "hobbies",
    "fun",
    "movies",
    "cinema",
    "netflix",
    "spotify",
    "games",
    "gaming",
    "steam",
    "playstation",
    "personal care",
    "salon",
    "barber",
    "clothes",
    "clothing",
    "apparel",
    "shoes",
  ],
  // Healthcare / Medical
  [
    "healthcare",
    "health",
    "medical",
    "medicine",
    "pharmacy",
    "drugstore",
    "mercury drug",
    "doctor",
    "hospital",
    "clinic",
    "dental",
    "dentist",
    "optical",
    "checkup",
    "vitamins",
  ],
  // Salary / Income
  [
    "salary",
    "income",
    "wages",
    "wage",
    "paycheck",
    "earnings",
    "payroll",
    "freelance",
    "side hustle",
    "bonus",
    "commission",
    "stipend",
    "allowance",
    "dividend",
    "interest",
  ],
  // Savings & Investments / Transfer
  [
    "savings transfer",
    "savings",
    "saving",
    "transfer",
    "deposit",
    "investment",
    "investments",
    "crypto",
    "stocks",
    "emergency fund",
  ],
  // Education
  ["education", "school", "tuition", "course", "courses", "class", "training", "books", "supplies"],
  // Fitness
  ["fitness", "gym", "workout", "sports", "sport", "yoga", "active"],
  // Pets
  ["pet", "pets", "dog", "cat", "vet", "veterinary"],
  // Insurance
  ["insurance", "life insurance", "health insurance", "car insurance"],
];

const STOP_WORDS = new Set(["and", "the", "for", "with", "from", "into", "onto", "under"]);

function normalizeText(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[&]/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokens(normalizedText: string): string[] {
  if (!normalizedText) return [];
  return normalizedText.split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function sharesStem(tokenA: string, tokenB: string): boolean {
  if (tokenA === tokenB) return true;
  const minLen = Math.min(tokenA.length, tokenB.length);
  if (minLen < 5) return false;
  let prefixLen = 0;
  while (prefixLen < minLen && tokenA[prefixLen] === tokenB[prefixLen]) {
    prefixLen++;
  }
  return prefixLen >= 5 && (prefixLen >= tokenA.length - 2 || prefixLen >= tokenB.length - 2);
}

function findGroupIndices(normalizedText: string, tokens: string[]): Set<number> {
  const indices = new Set<number>();
  if (!normalizedText) return indices;

  for (let i = 0; i < SEMANTIC_CATEGORY_GROUPS.length; i++) {
    const group = SEMANTIC_CATEGORY_GROUPS[i]!;
    for (const alias of group) {
      const normAlias = normalizeText(alias);
      if (normalizedText === normAlias) {
        indices.add(i);
        break;
      }
      if (normAlias.includes(" ")) {
        if (` ${normalizedText} `.includes(` ${normAlias} `)) {
          indices.add(i);
          break;
        }
      } else if (tokens.includes(normAlias)) {
        indices.add(i);
        break;
      } else if (normAlias.length >= 4 && normalizedText.includes(normAlias)) {
        indices.add(i);
        break;
      }
    }
  }
  return indices;
}

function scoreCategory(
  categoryName: string,
  candidateName?: string | null,
  contextText?: string | null,
): number {
  const trimmedCandidate = candidateName?.trim();
  const trimmedCatName = categoryName.trim();

  // 1. Verbatim exact match (case-insensitive)
  if (trimmedCandidate && trimmedCatName.toLowerCase() === trimmedCandidate.toLowerCase()) {
    return 100;
  }

  const normCat = normalizeText(trimmedCatName);
  const catTokens = getTokens(normCat);

  if (trimmedCandidate) {
    const normCandidate = normalizeText(trimmedCandidate);
    const candidateTokens = getTokens(normCandidate);

    // 2. Normalized exact match (e.g. "Food & dining" vs "Food and dining")
    if (normCat === normCandidate && normCat.length > 0) {
      return 90;
    }

    // 3. Token subset / inclusion
    if (candidateTokens.length > 0 && catTokens.length > 0) {
      const candidateInCat = candidateTokens.every((t) => catTokens.includes(t));
      if (candidateInCat) return 85;

      const catInCandidate = catTokens.every((t) => candidateTokens.includes(t));
      if (catInCandidate) return 80;

      const anyTokenMatch = candidateTokens.some((t) => catTokens.includes(t));
      if (anyTokenMatch) return 75;
    }

    // 4. Stem / prefix match
    if (
      candidateTokens.some((candToken) =>
        catTokens.some((catToken) => sharesStem(candToken, catToken)),
      )
    ) {
      return 70;
    }

    // 5. Semantic alias group match
    const catGroups = findGroupIndices(normCat, catTokens);
    const candidateGroups = findGroupIndices(normCandidate, candidateTokens);
    for (const groupIdx of candidateGroups) {
      if (catGroups.has(groupIdx)) {
        return 60;
      }
    }
  }

  // 6. Context text fallback (e.g. transcript or transaction description)
  if (contextText?.trim()) {
    const normContext = normalizeText(contextText);
    const contextTokens = getTokens(normContext);

    if (normCat.length > 0 && ` ${normContext} `.includes(` ${normCat} `)) {
      return 50;
    }

    if (catTokens.length > 0 && catTokens.every((t) => contextTokens.includes(t))) {
      return 48;
    }

    if (catTokens.some((t) => contextTokens.includes(t))) {
      return 45;
    }

    const catGroups = findGroupIndices(normCat, catTokens);
    const contextGroups = findGroupIndices(normContext, contextTokens);
    for (const groupIdx of contextGroups) {
      if (catGroups.has(groupIdx)) {
        return 40;
      }
    }
  }

  return 0;
}

/**
 * Matches a category candidate name or context text against user categories.
 * Uses exact match, token subset, stem matching, and semantic alias groups.
 */
export function matchCategory<T extends CategoryCandidate>(
  categories: readonly T[],
  candidateName?: string | null,
  options?: MatchCategoryOptions | string | null,
): T | undefined {
  if (!categories || categories.length === 0) return undefined;

  const targetKind = typeof options === "object" && options !== null ? options.kind : undefined;
  const contextText =
    typeof options === "string"
      ? options
      : typeof options === "object" && options !== null
        ? options.contextText
        : undefined;

  const eligibleCategories = categories.filter((category) => {
    if (category.archived) return false;
    if (category.locked) return false;
    if (category.pending) return false;
    if (targetKind && category.kind && category.kind !== targetKind) return false;
    return true;
  });

  if (eligibleCategories.length === 0) return undefined;

  let bestCategory: T | undefined;
  let bestScore = 0;

  for (const category of eligibleCategories) {
    const score = scoreCategory(category.name, candidateName, contextText);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestScore > 0 ? bestCategory : undefined;
}
