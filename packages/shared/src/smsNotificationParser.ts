export type SupportedChannel =
  | "gcash"
  | "maya"
  | "bpi"
  | "bdo"
  | "unionbank"
  | "shopeepay"
  | "grabpay"
  | "generic";

export type SmsTransactionType = "expense" | "income" | "transfer";

export interface ParsedSmsTransaction {
  channel: SupportedChannel;
  type: SmsTransactionType;
  amountMinor: number; // in Philippine centavos (e.g. 500.00 -> 50000)
  currency: "PHP";
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm:ss or HH:mm
  payeeOrMerchant: string;
  referenceNumber?: string;
  rawText: string;
  suggestedCategory: string;
  confidence: "high" | "medium" | "low";
}

const MONTH_NAMES: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeTime(
  hourStr?: string,
  minuteStr?: string,
  secondStr?: string,
  ampm?: string,
): string | undefined {
  if (!hourStr || !minuteStr) return undefined;
  let hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = secondStr !== undefined ? Number(secondStr) : undefined;

  if (Number.isNaN(hour) || Number.isNaN(minute) || (second !== undefined && Number.isNaN(second))) {
    return undefined;
  }

  if (ampm) {
    const isPm = ampm.toUpperCase() === "PM";
    if (isPm && hour < 12) {
      hour += 12;
    } else if (!isPm && hour === 12) {
      hour = 0;
    }
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  const paddedH = String(hour).padStart(2, "0");
  const paddedM = String(minute).padStart(2, "0");

  if (second !== undefined && second >= 0 && second <= 59) {
    return `${paddedH}:${paddedM}:${String(second).padStart(2, "0")}`;
  }

  return `${paddedH}:${paddedM}`;
}

function parseDateTimeFromText(
  text: string,
  referenceDate?: string,
  preferDayFirst = false,
): { date: string; time?: string } {
  // Pattern 1: ISO YYYY-MM-DD [HH:mm[:ss] [AM/PM]]
  const isoPattern = /\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?[ \t]*(AM|PM)?)?\b/i;
  const isoMatch = isoPattern.exec(text);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const time = isoMatch[4] ? normalizeTime(isoMatch[4], isoMatch[5], isoMatch[6], isoMatch[7]) : undefined;
    return { date: formatIsoDate(y, m, d), time };
  }

  // Pattern 2: DD Mon YYYY or DD-Mon-YYYY (e.g. 25 Aug 2026 12:00PM)
  const textMonthPattern = /\b(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?[ \t]*(AM|PM)?)?\b/i;
  const textMonthMatch = textMonthPattern.exec(text);
  if (textMonthMatch) {
    const d = Number(textMonthMatch[1]);
    const monKey = (textMonthMatch[2] ?? "").slice(0, 3).toLowerCase();
    const m = MONTH_NAMES[monKey] ? Number(MONTH_NAMES[monKey]) : 0;
    const y = Number(textMonthMatch[3]);
    if (m > 0 && d >= 1 && d <= 31) {
      const time = textMonthMatch[4]
        ? normalizeTime(textMonthMatch[4], textMonthMatch[5], textMonthMatch[6], textMonthMatch[7])
        : undefined;
      return { date: formatIsoDate(y, m, d), time };
    }
  }

  // Pattern 3: Mon DD, YYYY (e.g. Aug 25, 2026 12:00PM)
  const monDayYearPattern = /\b([A-Za-z]{3,9})[ \t]+(\d{1,2}),?[ \t]+(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?[ \t]*(AM|PM)?)?\b/i;
  const monDayYearMatch = monDayYearPattern.exec(text);
  if (monDayYearMatch) {
    const monKey = (monDayYearMatch[1] ?? "").slice(0, 3).toLowerCase();
    const m = MONTH_NAMES[monKey] ? Number(MONTH_NAMES[monKey]) : 0;
    const d = Number(monDayYearMatch[2]);
    const y = Number(monDayYearMatch[3]);
    if (m > 0 && d >= 1 && d <= 31) {
      const time = monDayYearMatch[4]
        ? normalizeTime(monDayYearMatch[4], monDayYearMatch[5], monDayYearMatch[6], monDayYearMatch[7])
        : undefined;
      return { date: formatIsoDate(y, m, d), time };
    }
  }

  // Pattern 4: MM/DD/YYYY or DD/MM/YYYY [HH:mm[:ss] [AM/PM]]
  const slashPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?[ \t]*(AM|PM)?)?\b/i;
  const slashMatch = slashPattern.exec(text);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);
    const time = slashMatch[4] ? normalizeTime(slashMatch[4], slashMatch[5], slashMatch[6], slashMatch[7]) : undefined;

    let m: number;
    let d: number;
    if (first > 12) {
      // Must be DD/MM/YYYY
      d = first;
      m = second;
    } else if (second > 12) {
      // Must be MM/DD/YYYY
      m = first;
      d = second;
    } else if (preferDayFirst) {
      d = first;
      m = second;
    } else {
      // Default to MM/DD/YYYY in the Philippines
      m = first;
      d = second;
    }

    return { date: formatIsoDate(y, m, d), time };
  }

  // Default fallback date
  let fallbackDate = new Date().toISOString().slice(0, 10);
  if (referenceDate) {
    const cleanRef = referenceDate.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanRef)) {
      fallbackDate = cleanRef;
    }
  }

  // Standalone time extraction if date wasn't inline
  const standaloneTimePattern = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?[ \t]*(AM|PM)?\b/i;
  const standaloneTimeMatch = standaloneTimePattern.exec(text);
  const time = standaloneTimeMatch
    ? normalizeTime(
        standaloneTimeMatch[1],
        standaloneTimeMatch[2],
        standaloneTimeMatch[3],
        standaloneTimeMatch[4],
      )
    : undefined;

  return { date: fallbackDate, time };
}

function parseAmountMinor(amountStr?: string): number | null {
  if (!amountStr) return null;
  const clean = amountStr.replace(/,/g, "").trim();
  const num = Number(clean);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

function extractReferenceNumber(text: string): string | undefined {
  // Linear, non-overlapping patterns: bounded whitespace ([ \t]), bounded separators,
  // each alternative uses disjoint character classes to avoid catastrophic backtracking.
  // Separator is either colon/hash branch or whitespace branch, not overlapping "*"+.
  const refPatterns: RegExp[] = [
    // ref, reference, Ref., Ref No., Reference No, etc.
    /ref(?:erence)?(?:\.|\b)(?:[ \t]+(?:no\.?|#|id))?(?:[ \t]*:[ \t]*|[ \t]*#[ \t]*|[ \t]+)([A-Za-z0-9_-]{1,64})/i,
    /trans(?:action)?[ \t]+id(?:[ \t]*:[ \t]*|[ \t]*#[ \t]*|[ \t]+)([A-Za-z0-9_-]{1,64})/i,
    /\brn(?:[ \t]*:[ \t]*|[ \t]*#[ \t]*|[ \t]+)([A-Za-z0-9_-]{1,64})/i,
  ];
  for (const p of refPatterns) {
    const m = p.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function cleanPayee(payee?: string): string {
  if (!payee) return "";
  let cleaned = payee
    .replace(/^Merchant[ \t]+/i, "")
    .replace(/^to[ \t]+/i, "")
    .replace(/^from[ \t]+/i, "")
    .replace(/^at[ \t]+/i, "")
    .trim();

  // Strip trailing sentence connectors if any slipped in
  cleaned = cleaned.replace(/[ \t]+(?:on|using|with|via)[ \t]+.*$/i, "").trim();
  cleaned = cleaned.replace(/[.,;:]+$/, "").trim();

  return cleaned;
}

// --- Linear payee extraction helpers (avoid ReDoS: no nested overlapping quantifiers, no (.+?) with optional trailing groups) ---

/** Bounded amount capture: up to 15 chars of digits/commas with optional .xx */
const BOUNDED_AMOUNT = "[\\d,]{1,15}(?:\\.\\d{2})?";

function extractAmountAfterPrefix(
  text: string,
  prefixPattern: RegExp,
): { amount: string; endIndex: number } | null {
  const m = prefixPattern.exec(text);
  if (!m || !m[1] || m.index === undefined) return null;
  return { amount: m[1], endIndex: m.index + m[0].length };
}

// --- Linear keyword/terminator matching (no regular expressions: immune to ReDoS by construction) ---

function isSpaceTab(ch: string): boolean {
  return ch === " " || ch === "\t";
}

function isAsciiDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/**
 * Match `[ \t]+ word1 ([ \t]+ word2)*` against lower-cased text at a whitespace
 * gap starting at `gapStart`. Returns the end index or -1. Callers lower-case the
 * text first (all keywords are ASCII).
 */
function matchWordsAt(
  lower: string,
  gapStart: number,
  words: string[],
  trailingSpace: boolean,
  trailingDigit: boolean,
): number {
  let i = gapStart;
  while (i < lower.length && isSpaceTab(lower[i]!)) i++;
  for (let w = 0; w < words.length; w++) {
    const word = words[w]!;
    if (!lower.startsWith(word, i)) return -1;
    i += word.length;
    if (w < words.length - 1) {
      if (i >= lower.length || !isSpaceTab(lower[i]!)) return -1;
      while (i < lower.length && isSpaceTab(lower[i]!)) i++;
    }
  }
  if (trailingSpace) {
    if (i >= lower.length || !isSpaceTab(lower[i]!)) return -1;
    while (i < lower.length && isSpaceTab(lower[i]!)) i++;
  }
  if (trailingDigit && (i >= lower.length || !isAsciiDigit(lower[i]!))) return -1;
  return i;
}

/** Leftmost match of any word alternative; mirrors RegExp leftmost search order. */
function scanGapWords(
  lower: string,
  from: number,
  alts: string[][],
  trailingSpace: boolean,
  trailingDigit: boolean,
): { index: number; end: number } | null {
  for (let i = from; i < lower.length; i++) {
    if (!isSpaceTab(lower[i]!)) continue;
    for (const words of alts) {
      const end = matchWordsAt(lower, i, words, trailingSpace, trailingDigit);
      if (end !== -1) return { index: i, end };
    }
  }
  return null;
}

/** Leftmost `.` followed by optional spaces/tabs and `word` (e.g. `.Ref`, `. Ref`). */
function scanDotWord(lower: string, from: number, word: string): number {
  for (let i = from; i < lower.length; i++) {
    if (lower[i] !== ".") continue;
    let j = i + 1;
    while (j < lower.length && isSpaceTab(lower[j]!)) j++;
    if (lower.startsWith(word, j)) return i;
  }
  return -1;
}

/** Leftmost `[ \t]+RN[ \t]*:` (reference-number marker). */
function scanRnColon(lower: string, from: number): number {
  for (let i = from; i < lower.length; i++) {
    if (!isSpaceTab(lower[i]!)) continue;
    let j = i;
    while (j < lower.length && isSpaceTab(lower[j]!)) j++;
    if (!lower.startsWith("rn", j)) continue;
    j += 2;
    while (j < lower.length && isSpaceTab(lower[j]!)) j++;
    if (lower[j] === ":") return i;
  }
  return -1;
}

type PayeeTerminator =
  | { type: "gapWords"; alts: string[][]; trailingSpace?: boolean; trailingDigit?: boolean }
  | { type: "dotWord"; word: string }
  | { type: "dot" }
  | { type: "rnColon" };

function scanTerminator(lower: string, from: number, term: PayeeTerminator): number {
  switch (term.type) {
    case "gapWords":
      return (
        scanGapWords(lower, from, term.alts, term.trailingSpace === true, term.trailingDigit === true)
          ?.index ?? -1
      );
    case "dotWord":
      return scanDotWord(lower, from, term.word);
    case "dot":
      return lower.indexOf(".", from);
    case "rnColon":
      return scanRnColon(lower, from);
  }
}

function extractPayeeBetween(
  text: string,
  fromIndex: number,
  keywordAlts: string[][],
  terminators: PayeeTerminator[],
): string | null {
  const lower = text.slice(fromIndex).toLowerCase();
  const km = scanGapWords(lower, 0, keywordAlts, true, false);
  if (!km) return null;
  const payeeStart = fromIndex + km.end;
  let payeeEnd = text.length;
  const remLower = text.slice(payeeStart).toLowerCase();
  for (const term of terminators) {
    const idx = scanTerminator(remLower, 0, term);
    if (idx !== -1) {
      const cand = payeeStart + idx;
      if (cand < payeeEnd) payeeEnd = cand;
    }
  }
  // Deterministic bounded slice: limit to 120 chars to prevent unbounded matching
  const raw = text.slice(payeeStart, Math.min(payeeEnd, payeeStart + 120)).trim();
  // Trim trailing period if any slipped
  return raw ? raw.replace(/\.$/, "").trim() : null;
}

function inferChannel(rawText: string): SupportedChannel {
  if (/gcash/i.test(rawText)) return "gcash";
  if (/maya/i.test(rawText)) return "maya";
  if (/bpi/i.test(rawText)) return "bpi";
  if (/bdo/i.test(rawText)) return "bdo";
  if (/unionbank/i.test(rawText)) return "unionbank";
  if (/shopeepay/i.test(rawText)) return "shopeepay";
  if (/grabpay/i.test(rawText)) return "grabpay";
  return "generic";
}

export function suggestCategory(
  payeeOrMerchant: string,
  type: SmsTransactionType,
  rawText = "",
): string {
  const haystack = `${payeeOrMerchant} ${rawText}`.toLowerCase();

  // 1. Food & Dining
  if (
    /(?:jollibee|mcdo|mcdonald|grabfood|foodpanda|food[ \t]*panda|restaurant|mang[ \t]*inasal|chowking|kfc|starbucks|tokyo[ \t]*tokyo|bonchon|shakey|pizza[ \t]*hut|burger[ \t]*king|kenny[ \t]*rogers|wendy|tim[ \t]*hortons|coffee[ \t]*bean|dunkin|army[ \t]*navy|pepper[ \t]*lunch|subway|din[ \t]*tai[ \t]*fung|samgyup|cafe|bistro|bakery|barbecue|bbq|boba|milktea|milk[ \t]*tea|coffee)/i.test(
      haystack,
    )
  ) {
    return "Food & Dining";
  }

  // 2. Groceries
  if (
    /(?:sm[ \t]*supermarket|sm[ \t]*hypermarket|puregold|robinson|mercury[ \t]*drug|waltermart|landmark|savemore|allday|all[ \t]*day|southstar[ \t]*drug|watsons|dali[ \t]*everyday|marketplace|s&r|landers|supermarket|grocery|pharmacy)/i.test(
      haystack,
    )
  ) {
    return "Groceries";
  }

  // 3. Entertainment & Subscriptions
  if (
    /(?:netflix|spotify|apple|google|disney|youtube|prime[ \t]*video|hbo|steam|playstation|nintendo|crunchyroll|patreon|deezer|itunes)/i.test(
      haystack,
    )
  ) {
    return "Entertainment & Subscriptions";
  }

  // 4. Transportation
  if (
    /(?:grabcar|grab[ \t]*car|grab[ \t]*philippines|angkas|joyride|joy[ \t]*ride|move[ \t]*it|shell|petron|caltex|seaoil|total|cleanfuel|unioil|mrt|lrt|beep|easytrip|autosweep|cebu[ \t]*pacific|philippine[ \t]*airlines|airasia|transport|taxi|gasoline|gas[ \t]*station)/i.test(
      haystack,
    )
  ) {
    return "Transportation";
  }

  // 5. Shopping
  if (
    /(?:shopee|lazada|zalora|sm[ \t]*store|sm[ \t]*dept|uniqlo|shein|tiktok[ \t]*shop|zara|h&m|decathlon|nike|adidas|ikea|mall|boutique|retail)/i.test(
      haystack,
    )
  ) {
    return "Shopping";
  }

  // 6. Utilities
  if (
    /(?:meralco|maynilad|manila[ \t]*water|globe|smart(?:[ \t]*telecom|[ \t]*postpaid|[ \t]*prepaid)?|pldt|converge|dito|cignal|primewater|sky[ \t]*cable|electric|water[ \t]*district|telecom|utility|utilities)/i.test(
      haystack,
    )
  ) {
    return "Utilities";
  }

  // 7. Transfers / Cash In
  if (
    type === "transfer" ||
    type === "income" ||
    /(?:gcash|maya|paymaya|bpi|bdo|unionbank|metrobank|landbank|rcbc|security[ \t]*bank|cimb|seabank|gotyme|tonik|bank[ \t]*transfer|instapay|pesonet|cash[ \t]*in|cash-in|send[ \t]*money|express[ \t]*send|padala|transfer)/i.test(
      haystack,
    )
  ) {
    return "Transfers / Cash In";
  }

  return "General";
}

export function parseSmsNotification(
  text: string,
  referenceDate?: string,
): ParsedSmsTransaction | null {
  if (!text || typeof text !== "string") return null;

  const rawText = text.trim();
  if (!rawText) return null;

  const refNumber = extractReferenceNumber(rawText);

  // Shared terminators: linear, non-overlapping, bounded
  const gcashTerminators: PayeeTerminator[] = [
    { type: "gapWords", alts: [["on"]], trailingSpace: true, trailingDigit: true },
    { type: "dotWord", word: "ref" },
  ];
  const mayaTerminators: PayeeTerminator[] = [
    { type: "gapWords", alts: [["using", "maya"], ["via", "maya"]] },
    { type: "gapWords", alts: [["on"]], trailingSpace: true, trailingDigit: true },
    { type: "dotWord", word: "ref" },
  ];

  // 1. GCash patterns - linear tokenization (no overlapping \s* vs \s+ and no (.+?) catastrophic)
  if (/gcash/i.test(rawText)) {
    // Pattern A: "You have paid PHP 250.00 of GCash to JOLLIBEE on 08/25/2026 14:30. Ref. No. 123456789"
    if (/You have paid/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You have paid[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], gcashTerminators);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "gcash",
              type: "expense",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "expense", rawText),
              confidence: "high",
            };
          }
        }
      }
    }

    // Pattern B: "You have sent PHP 500.00 of GCash to JUAN DELA CRUZ 09171234567 on 08/25/2026 10:15. Ref. No. 987654321"
    if (/You have sent/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You have sent[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], gcashTerminators);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "gcash",
              type: "transfer",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "transfer", rawText),
              confidence: "high",
            };
          }
        }
      }
    }

    // Pattern C: "You have received PHP 1,000.00 of GCash from MARIA CLARA 09181234567 on 08/25/2026 11:20. Ref. No. 456789123"
    if (/You have received/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You have received[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["from"]], gcashTerminators);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "gcash",
              type: "income",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "income", rawText),
              confidence: "high",
            };
          }
        }
      }
    }
  }

  // Pattern D: "Payment of PHP 1,500.00 to NETFLIX was successful. Ref No. 789123456" - linear
  if (/Payment of/i.test(rawText) && /was successful/i.test(rawText)) {
    const amt = extractAmountAfterPrefix(
      rawText,
      new RegExp(`Payment of[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
    );
    if (amt) {
      const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], [
        { type: "gapWords", alts: [["was", "successful"]] },
      ]);
      if (payeeRaw !== null) {
        const amountMinor = parseAmountMinor(amt.amount);
        if (amountMinor !== null) {
          const dt = parseDateTimeFromText(rawText, referenceDate);
          const payee = cleanPayee(payeeRaw);
          const channel: SupportedChannel =
            /gcash/i.test(rawText) || !/maya|bpi|bdo|unionbank|shopeepay|grabpay/i.test(rawText)
              ? "gcash"
              : "generic";
          return {
            channel,
            type: "expense",
            amountMinor,
            currency: "PHP",
            date: dt.date,
            time: dt.time,
            payeeOrMerchant: payee,
            referenceNumber: refNumber,
            rawText,
            suggestedCategory: suggestCategory(payee, "expense", rawText),
            confidence: "high",
          };
        }
      }
    }
  }

  // 2. Maya patterns
  if (/maya/i.test(rawText)) {
    if (/You paid/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You paid[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], mayaTerminators);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "maya",
              type: "expense",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "expense", rawText),
              confidence: "high",
            };
          }
        }
      }
    }

    if (/You sent/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You sent[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], mayaTerminators);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "maya",
              type: "transfer",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "transfer", rawText),
              confidence: "high",
            };
          }
        }
      }
    }

    if (/You received/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You received[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["from"]], mayaTerminators);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "maya",
              type: "income",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "income", rawText),
              confidence: "high",
            };
          }
        }
      }
    }
  }

  // 3. BPI patterns
  if (/bpi/i.test(rawText)) {
    // Transfer: "Your BPI Online transfer of PHP 3,000.00 to GCASH was successful on 08/25/2026. Ref: BPI-1122"
    if (/transfer[ \t]+of/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`BPI[ \\t]+(?:Online[ \\t]+)?transfer[ \\t]+of[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], [
          { type: "gapWords", alts: [["was", "successful"]] },
        ]);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "bpi",
              type: "transfer",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "transfer", rawText),
              confidence: "high",
            };
          }
        }
      }
    }

    if (/You paid/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You paid[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["at"], ["to"]], [
          { type: "gapWords", alts: [["with", "your", "bpi"]] },
          { type: "gapWords", alts: [["on"]], trailingSpace: true, trailingDigit: true },
          { type: "dotWord", word: "ref" },
        ]);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "bpi",
              type: "expense",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "expense", rawText),
              confidence: "high",
            };
          }
        }
      }
    }
  }

  // 4. BDO pattern
  if (/bdo/i.test(rawText)) {
    if (/You purchased/i.test(rawText)) {
      const amt = extractAmountAfterPrefix(
        rawText,
        new RegExp(`You purchased[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
      );
      if (amt) {
        const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["at"], ["to"]], [
          { type: "gapWords", alts: [["on"]], trailingSpace: true, trailingDigit: true },
          { type: "gapWords", alts: [["using"]], trailingSpace: true },
          { type: "dotWord", word: "ref" },
        ]);
        if (payeeRaw !== null) {
          const amountMinor = parseAmountMinor(amt.amount);
          if (amountMinor !== null) {
            const dt = parseDateTimeFromText(rawText, referenceDate);
            const payee = cleanPayee(payeeRaw);
            return {
              channel: "bdo",
              type: "expense",
              amountMinor,
              currency: "PHP",
              date: dt.date,
              time: dt.time,
              payeeOrMerchant: payee,
              referenceNumber: refNumber,
              rawText,
              suggestedCategory: suggestCategory(payee, "expense", rawText),
              confidence: "high",
            };
          }
        }
      }
    }
  }

  // 5. UnionBank pattern
  if (/unionbank/i.test(rawText)) {
    const amt = extractAmountAfterPrefix(
      rawText,
      new RegExp(`(?:PHP|\\u20B1)[ \\t]*(${BOUNDED_AMOUNT})[ \\t]+debited[ \\t]+from`, "i"),
    );
    if (amt) {
      const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["for", "payment", "to"]], [
        { type: "gapWords", alts: [["on"]], trailingSpace: true, trailingDigit: true },
        { type: "dotWord", word: "ref" },
      ]);
      if (payeeRaw !== null) {
        const amountMinor = parseAmountMinor(amt.amount);
        if (amountMinor !== null) {
          const dt = parseDateTimeFromText(rawText, referenceDate);
          const payee = cleanPayee(payeeRaw);
          return {
            channel: "unionbank",
            type: "expense",
            amountMinor,
            currency: "PHP",
            date: dt.date,
            time: dt.time,
            payeeOrMerchant: payee,
            referenceNumber: refNumber,
            rawText,
            suggestedCategory: suggestCategory(payee, "expense", rawText),
            confidence: "high",
          };
        }
      }
    }
  }

  // 6. ShopeePay pattern
  if (/shopeepay/i.test(rawText)) {
    const amt = extractAmountAfterPrefix(
      rawText,
      new RegExp(`Paid[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
    );
    if (amt) {
      const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], [{ type: "dotWord", word: "ref" }]);
      if (payeeRaw !== null) {
        const amountMinor = parseAmountMinor(amt.amount);
        if (amountMinor !== null) {
          const dt = parseDateTimeFromText(rawText, referenceDate);
          const payee = cleanPayee(payeeRaw);
          return {
            channel: "shopeepay",
            type: "expense",
            amountMinor,
            currency: "PHP",
            date: dt.date,
            time: dt.time,
            payeeOrMerchant: payee,
            referenceNumber: refNumber,
            rawText,
            suggestedCategory: suggestCategory(payee, "expense", rawText),
            confidence: "high",
          };
        }
      }
    }
  }

  // 7. GrabPay pattern
  if (/grabpay/i.test(rawText)) {
    const amt = extractAmountAfterPrefix(
      rawText,
      new RegExp(`Payment of[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
    );
    if (amt && /completed/i.test(rawText)) {
      const payeeRaw = extractPayeeBetween(rawText, amt.endIndex, [["to"]], [
        { type: "gapWords", alts: [["completed"]] },
      ]);
      if (payeeRaw !== null) {
        const amountMinor = parseAmountMinor(amt.amount);
        if (amountMinor !== null) {
          const dt = parseDateTimeFromText(rawText, referenceDate, true);
          const payee = cleanPayee(payeeRaw);
          return {
            channel: "grabpay",
            type: "expense",
            amountMinor,
            currency: "PHP",
            date: dt.date,
            time: dt.time,
            payeeOrMerchant: payee,
            referenceNumber: refNumber,
            rawText,
            suggestedCategory: suggestCategory(payee, "expense", rawText),
            confidence: "high",
          };
        }
      }
    }
  }

  // 8. Generic fallbacks - linear bounded tokenization
  // Shared generic terminators include period and RN to avoid swallowing reference
  const genericTerminators: PayeeTerminator[] = [
    { type: "gapWords", alts: [["on"]], trailingSpace: true, trailingDigit: true },
    { type: "dotWord", word: "ref" },
    { type: "dotWord", word: "rn" },
    { type: "rnColon" },
    { type: "dot" },
  ];
  const genericExpenseTerminators: PayeeTerminator[] = genericTerminators;
  const genericTransferTerminators: PayeeTerminator[] = genericTerminators;
  const genericIncomeTerminators: PayeeTerminator[] = genericTerminators;
  // Paid / Payment: 'Paid PHP X to Y', 'Payment of PHP X to Y'
  {
    const amt = extractAmountAfterPrefix(
      rawText,
      new RegExp(`(?:Paid|Payment of)[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
    );
    if (amt) {
      const payeeRaw = extractPayeeBetween(
        rawText,
        amt.endIndex,
        [["to"], ["at"]],
        genericExpenseTerminators,
      );
      if (payeeRaw !== null) {
        const amountMinor = parseAmountMinor(amt.amount);
        if (amountMinor !== null) {
          const dt = parseDateTimeFromText(rawText, referenceDate);
          const payee = cleanPayee(payeeRaw);
          const channel = inferChannel(rawText);
          return {
            channel,
            type: "expense",
            amountMinor,
            currency: "PHP",
            date: dt.date,
            time: dt.time,
            payeeOrMerchant: payee,
            referenceNumber: refNumber,
            rawText,
            suggestedCategory: suggestCategory(payee, "expense", rawText),
            confidence: channel === "generic" ? "medium" : "high",
          };
        }
      }
    }
  }

  // Transferred / Sent: 'Transferred PHP X to Y', 'Sent PHP X to Y', 'Transfer of PHP X to Y'
  {
    const amt = extractAmountAfterPrefix(
      rawText,
      new RegExp(`(?:Transferred|Sent|Transfer of)[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
    );
    if (amt) {
      const payeeRaw = extractPayeeBetween(
        rawText,
        amt.endIndex,
        [["to"]],
        genericTransferTerminators,
      );
      // optional payee
      let payee: string;
      if (payeeRaw === null) {
        payee = "Transfer";
      } else {
        payee = cleanPayee(payeeRaw);
        if (!payee) payee = "Transfer";
      }
      // Only return if we actually matched transfer prefix; but allow fallback even if payee optional
      // Validate we didn't already handle GCash/Maya specific above; still generic fallback is valid
      const amountMinor = parseAmountMinor(amt.amount);
      if (amountMinor !== null) {
        // Check that text actually contains transfer keyword to avoid false positives from earlier generic paid
        if (/(?:Transferred|Sent|Transfer of)/i.test(rawText)) {
          const dt = parseDateTimeFromText(rawText, referenceDate);
          const channel = inferChannel(rawText);
          return {
            channel,
            type: "transfer",
            amountMinor,
            currency: "PHP",
            date: dt.date,
            time: dt.time,
            payeeOrMerchant: payee,
            referenceNumber: refNumber,
            rawText,
            suggestedCategory: suggestCategory(payee, "transfer", rawText),
            confidence: channel === "generic" ? "medium" : "high",
          };
        }
      }
    }
  }

  // Received / Credited: 'Received PHP X from Y', 'PHP X credited from Y', 'Received PHP X'
  {
    const amt = extractAmountAfterPrefix(
      rawText,
      new RegExp(`(?:Received|credited with)[ \\t]+(?:(?:PHP|\\u20B1)[ \\t]*)?(${BOUNDED_AMOUNT})`, "i"),
    );
    if (amt) {
      const payeeRaw = extractPayeeBetween(
        rawText,
        amt.endIndex,
        [["from"]],
        genericIncomeTerminators,
      );
      let payee: string;
      if (payeeRaw === null) {
        payee = "Sender";
      } else {
        payee = cleanPayee(payeeRaw);
        if (!payee) payee = "Sender";
      }
      const amountMinor = parseAmountMinor(amt.amount);
      if (amountMinor !== null) {
        if (/(?:Received|credited with)/i.test(rawText)) {
          const dt = parseDateTimeFromText(rawText, referenceDate);
          const channel = inferChannel(rawText);
          return {
            channel,
            type: "income",
            amountMinor,
            currency: "PHP",
            date: dt.date,
            time: dt.time,
            payeeOrMerchant: payee,
            referenceNumber: refNumber,
            rawText,
            suggestedCategory: suggestCategory(payee, "income", rawText),
            confidence: channel === "generic" ? "medium" : "high",
          };
        }
      }
    }
  }

  // Fallback broad amount extractor - bounded linear
  {
    const broadMatch = new RegExp(`(?:PHP|\\u20B1)[ \\t]*(${BOUNDED_AMOUNT})`, "i").exec(rawText);
    if (broadMatch?.[1]) {
      const amountMinor = parseAmountMinor(broadMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const isIncome = /received|credited|deposit|cash[ \t]*in/i.test(rawText);
        const isTransfer = /transfer|sent/i.test(rawText);
        const type: SmsTransactionType = isIncome ? "income" : isTransfer ? "transfer" : "expense";

        const channel = inferChannel(rawText);
        const payee = "Unknown Merchant";

        return {
          channel,
          type,
          amountMinor,
          currency: "PHP",
          date: dt.date,
          time: dt.time,
          payeeOrMerchant: payee,
          referenceNumber: refNumber,
          rawText,
          suggestedCategory: suggestCategory(payee, type, rawText),
          confidence: "low",
        };
      }
    }
  }

  return null;
}
