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
  const isoPattern = /\b(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?\b/;
  const isoMatch = isoPattern.exec(text);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const time = isoMatch[4] ? normalizeTime(isoMatch[4], isoMatch[5], isoMatch[6], isoMatch[7]) : undefined;
    return { date: formatIsoDate(y, m, d), time };
  }

  // Pattern 2: DD Mon YYYY or DD-Mon-YYYY (e.g. 25 Aug 2026 12:00PM)
  const textMonthPattern = /\b(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?\b/i;
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
  const monDayYearPattern = /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?\b/i;
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
  const slashPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?\b/;
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
  const standaloneTimePattern = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\b/;
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
  const refPattern =
    /(?:ref(?:erence)?\.?(?:\s*(?:no\.?|#|id))?[:\s#]+|trans(?:action)?\s*id[:\s]+|rn[:\s]+)\s*([A-Za-z0-9_-]+)/i;
  const match = refPattern.exec(text);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

function cleanPayee(payee?: string): string {
  if (!payee) return "";
  let cleaned = payee
    .replace(/^Merchant\s+/i, "")
    .replace(/^to\s+/i, "")
    .replace(/^from\s+/i, "")
    .replace(/^at\s+/i, "")
    .trim();

  // Strip trailing sentence connectors if any slipped in
  cleaned = cleaned.replace(/\s+(?:on|using|with|via)\s+.*$/i, "").trim();
  cleaned = cleaned.replace(/[.,;:]+$/, "").trim();

  return cleaned;
}

export function suggestCategory(
  payeeOrMerchant: string,
  type: SmsTransactionType,
  rawText = "",
): string {
  const haystack = `${payeeOrMerchant} ${rawText}`.toLowerCase();

  // 1. Food & Dining
  if (
    /(?:jollibee|mcdo|mcdonald|grabfood|foodpanda|food\s*panda|restaurant|mang\s*inasal|chowking|kfc|starbucks|tokyo\s*tokyo|bonchon|shakey|pizza\s*hut|burger\s*king|kenny\s*rogers|wendy|tim\s*hortons|coffee\s*bean|dunkin|army\s*navy|pepper\s*lunch|subway|din\s*tai\s*fung|samgyup|cafe|bistro|bakery|barbecue|bbq|boba|milktea|milk\s*tea|coffee)/i.test(
      haystack,
    )
  ) {
    return "Food & Dining";
  }

  // 2. Groceries
  if (
    /(?:sm\s*supermarket|sm\s*hypermarket|puregold|robinson|mercury\s*drug|waltermart|landmark|savemore|allday|all\s*day|southstar\s*drug|watsons|dali\s*everyday|marketplace|s&r|landers|supermarket|grocery|pharmacy)/i.test(
      haystack,
    )
  ) {
    return "Groceries";
  }

  // 3. Entertainment & Subscriptions
  if (
    /(?:netflix|spotify|apple|google|disney|youtube|prime\s*video|hbo|steam|playstation|nintendo|crunchyroll|patreon|deezer|itunes)/i.test(
      haystack,
    )
  ) {
    return "Entertainment & Subscriptions";
  }

  // 4. Transportation
  if (
    /(?:grabcar|grab\s*car|grab\s*philippines|angkas|joyride|joy\s*ride|move\s*it|shell|petron|caltex|seaoil|total|cleanfuel|unioil|mrt|lrt|beep|easytrip|autosweep|cebu\s*pacific|philippine\s*airlines|airasia|transport|taxi|gasoline|gas\s*station)/i.test(
      haystack,
    )
  ) {
    return "Transportation";
  }

  // 5. Shopping
  if (
    /(?:shopee|lazada|zalora|sm\s*store|sm\s*dept|uniqlo|shein|tiktok\s*shop|zara|h&m|decathlon|nike|adidas|ikea|mall|boutique|retail)/i.test(
      haystack,
    )
  ) {
    return "Shopping";
  }

  // 6. Utilities
  if (
    /(?:meralco|maynilad|manila\s*water|globe|smart(?:\s*telecom|\s*postpaid|\s*prepaid)?|pldt|converge|dito|cignal|primewater|sky\s*cable|electric|water\s*district|telecom|utility|utilities)/i.test(
      haystack,
    )
  ) {
    return "Utilities";
  }

  // 7. Transfers / Cash In
  if (
    type === "transfer" ||
    type === "income" ||
    /(?:gcash|maya|paymaya|bpi|bdo|unionbank|metrobank|landbank|rcbc|security\s*bank|cimb|seabank|gotyme|tonik|bank\s*transfer|instapay|pesonet|cash\s*in|cash-in|send\s*money|express\s*send|padala|transfer)/i.test(
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

  // 1. GCash patterns
  // Pattern A: "You have paid PHP 250.00 of GCash to JOLLIBEE on 08/25/2026 14:30. Ref. No. 123456789"
  const gcashPaidMatch = /You have paid (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s*(?:of GCash)?\s+to\s+(.+?)(?:\s+on\s+([\d/.: -]+(?:AM|PM|am|pm)?))?(?:\.\s*Ref|$)/i.exec(
    rawText,
  );
  if (gcashPaidMatch && /gcash/i.test(rawText)) {
    const amountMinor = parseAmountMinor(gcashPaidMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const payee = cleanPayee(gcashPaidMatch[2]);
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

  // Pattern B: "You have sent PHP 500.00 of GCash to JUAN DELA CRUZ 09171234567 on 08/25/2026 10:15. Ref. No. 987654321"
  const gcashSentMatch = /You have sent (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s*(?:of GCash)?\s+to\s+(.+?)(?:\s+on\s+([\d/.: -]+(?:AM|PM|am|pm)?))?(?:\.\s*Ref|$)/i.exec(
    rawText,
  );
  if (gcashSentMatch && /gcash/i.test(rawText)) {
    const amountMinor = parseAmountMinor(gcashSentMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const payee = cleanPayee(gcashSentMatch[2]);
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

  // Pattern C: "You have received PHP 1,000.00 of GCash from MARIA CLARA 09181234567 on 08/25/2026 11:20. Ref. No. 456789123"
  const gcashReceivedMatch = /You have received (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s*(?:of GCash)?\s+from\s+(.+?)(?:\s+on\s+([\d/.: -]+(?:AM|PM|am|pm)?))?(?:\.\s*Ref|$)/i.exec(
    rawText,
  );
  if (gcashReceivedMatch && /gcash/i.test(rawText)) {
    const amountMinor = parseAmountMinor(gcashReceivedMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const payee = cleanPayee(gcashReceivedMatch[2]);
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

  // Pattern D: "Payment of PHP 1,500.00 to NETFLIX was successful. Ref No. 789123456"
  const paymentSuccessMatch = /Payment of (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+to\s+(.+?)\s+was successful/i.exec(
    rawText,
  );
  if (paymentSuccessMatch) {
    const amountMinor = parseAmountMinor(paymentSuccessMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const payee = cleanPayee(paymentSuccessMatch[2]);
      const channel: SupportedChannel = /gcash/i.test(rawText) || !/maya|bpi|bdo|unionbank|shopeepay|grabpay/i.test(rawText)
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

  // 2. Maya patterns
  // Pattern A: "You paid PHP 350.00 to Grab Philippines using Maya on 25 Aug 2026 12:00PM. Ref: MAYA-998877"
  // Pattern B: "You sent PHP 1,200.00 to 09171234567 via Maya. Ref No: 1122334455"
  // Pattern C: "You received PHP 5,000.00 from PEDRO PENDUKO via Maya. Ref: 5544332211"
  if (/maya/i.test(rawText)) {
    const mayaPaidMatch = /You paid (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+to\s+(.+?)(?:\s+(?:using|via)\s+Maya|\s+on|\.|\s+Ref|$)/i.exec(
      rawText,
    );
    if (mayaPaidMatch) {
      const amountMinor = parseAmountMinor(mayaPaidMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(mayaPaidMatch[2]);
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

    const mayaSentMatch = /You sent (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+to\s+(.+?)(?:\s+(?:using|via)\s+Maya|\s+on|\.|\s+Ref|$)/i.exec(
      rawText,
    );
    if (mayaSentMatch) {
      const amountMinor = parseAmountMinor(mayaSentMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(mayaSentMatch[2]);
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

    const mayaReceivedMatch = /You received (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+from\s+(.+?)(?:\s+(?:using|via)\s+Maya|\s+on|\.|\s+Ref|$)/i.exec(
      rawText,
    );
    if (mayaReceivedMatch) {
      const amountMinor = parseAmountMinor(mayaReceivedMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(mayaReceivedMatch[2]);
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

  // 3. BPI patterns
  // Pattern A: "You paid PHP 2,450.00 at MERCURY DRUG with your BPI Debit card ending in 1234 on 08/25/2026. Ref: BPI-9988"
  // Pattern B: "Your BPI Online transfer of PHP 3,000.00 to GCASH was successful on 08/25/2026. Ref: BPI-1122"
  if (/bpi/i.test(rawText)) {
    const bpiTransferMatch = /(?:Your\s+)?BPI(?:\s+Online)?\s+transfer\s+of\s+(?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+to\s+(.+?)\s+was successful/i.exec(
      rawText,
    );
    if (bpiTransferMatch) {
      const amountMinor = parseAmountMinor(bpiTransferMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(bpiTransferMatch[2]);
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

    const bpiPaidMatch = /You paid (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+(?:at|to)\s+(.+?)(?:\s+with\s+your\s+BPI|\s+on|\.|\s+Ref|$)/i.exec(
      rawText,
    );
    if (bpiPaidMatch) {
      const amountMinor = parseAmountMinor(bpiPaidMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(bpiPaidMatch[2]);
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

  // 4. BDO pattern
  // Pattern: "BDO: You purchased PHP 1,890.50 at SM SUPERMARKET on 08/25/2026 using card ending in 5678. Ref: BDO7788"
  if (/bdo/i.test(rawText)) {
    const bdoPurchasedMatch = /You purchased (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+(?:at|to)\s+(.+?)(?:\s+on|\s+using|\.|\s+Ref|$)/i.exec(
      rawText,
    );
    if (bdoPurchasedMatch) {
      const amountMinor = parseAmountMinor(bdoPurchasedMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(bdoPurchasedMatch[2]);
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

  // 5. UnionBank pattern
  // Pattern: "UnionBank: PHP 750.00 debited from acct ending in 4321 for payment to SHOPEE on 2026-08-25. Ref: UB-4455"
  if (/unionbank/i.test(rawText)) {
    const ubMatch = /(?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+debited\s+from\s+.+?\s+for payment to\s+(.+?)(?:\s+on|\.|\s+Ref|$)/i.exec(
      rawText,
    );
    if (ubMatch) {
      const amountMinor = parseAmountMinor(ubMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(ubMatch[2]);
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

  // 6. ShopeePay pattern
  // Pattern: "ShopeePay: Paid PHP 420.00 to Merchant FoodPanda. Ref: SP12345678"
  if (/shopeepay/i.test(rawText)) {
    const spMatch = /Paid (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+to\s+(.+?)(?:\.|\s+Ref|$)/i.exec(
      rawText,
    );
    if (spMatch) {
      const amountMinor = parseAmountMinor(spMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate);
        const payee = cleanPayee(spMatch[2]);
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

  // 7. GrabPay pattern
  // Pattern: "GrabPay: Payment of PHP 180.00 to GrabCar completed on 25/08/2026. Trans ID: GP-8899"
  if (/grabpay/i.test(rawText)) {
    const grabMatch = /Payment of (?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+to\s+(.+?)\s+completed/i.exec(
      rawText,
    );
    if (grabMatch) {
      const amountMinor = parseAmountMinor(grabMatch[1]);
      if (amountMinor !== null) {
        const dt = parseDateTimeFromText(rawText, referenceDate, true);
        const payee = cleanPayee(grabMatch[2]);
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

  // 8. Generic fallbacks
  // Paid / Payment: 'Paid PHP X to Y', 'Payment of PHP X to Y'
  const genericPaidMatch = /(?:Paid|Payment of)\s+(?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)\s+(?:to|at)\s+(.+?)(?:\s+on|\.|\s+Ref|$)/i.exec(
    rawText,
  );
  if (genericPaidMatch) {
    const amountMinor = parseAmountMinor(genericPaidMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const payee = cleanPayee(genericPaidMatch[2]);
      let channel: SupportedChannel = "generic";
      if (/gcash/i.test(rawText)) channel = "gcash";
      else if (/maya/i.test(rawText)) channel = "maya";
      else if (/bpi/i.test(rawText)) channel = "bpi";
      else if (/bdo/i.test(rawText)) channel = "bdo";
      else if (/unionbank/i.test(rawText)) channel = "unionbank";
      else if (/shopeepay/i.test(rawText)) channel = "shopeepay";
      else if (/grabpay/i.test(rawText)) channel = "grabpay";

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

  // Transferred / Sent: 'Transferred PHP X to Y', 'Sent PHP X to Y', 'Transfer of PHP X to Y'
  const genericTransferMatch = /(?:Transferred|Sent|Transfer of)\s+(?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)(?:\s+to\s+(.+?))?(?:\s+on|\.|\s+Ref|$)/i.exec(
    rawText,
  );
  if (genericTransferMatch) {
    const amountMinor = parseAmountMinor(genericTransferMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const payee = genericTransferMatch[2] ? cleanPayee(genericTransferMatch[2]) : "Transfer";
      let channel: SupportedChannel = "generic";
      if (/gcash/i.test(rawText)) channel = "gcash";
      else if (/maya/i.test(rawText)) channel = "maya";
      else if (/bpi/i.test(rawText)) channel = "bpi";
      else if (/bdo/i.test(rawText)) channel = "bdo";
      else if (/unionbank/i.test(rawText)) channel = "unionbank";
      else if (/shopeepay/i.test(rawText)) channel = "shopeepay";
      else if (/grabpay/i.test(rawText)) channel = "grabpay";

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

  // Received / Credited: 'Received PHP X from Y', 'PHP X credited from Y', 'Received PHP X'
  const genericReceivedMatch = /(?:Received|(?:credited with))\s+(?:PHP|Php|₱)?\s*([\d,]+(?:\.\d{2})?)(?:\s+from\s+(.+?))?(?:\s+on|\.|\s+Ref|$)/i.exec(
    rawText,
  );
  if (genericReceivedMatch) {
    const amountMinor = parseAmountMinor(genericReceivedMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const payee = genericReceivedMatch[2] ? cleanPayee(genericReceivedMatch[2]) : "Sender";
      let channel: SupportedChannel = "generic";
      if (/gcash/i.test(rawText)) channel = "gcash";
      else if (/maya/i.test(rawText)) channel = "maya";
      else if (/bpi/i.test(rawText)) channel = "bpi";
      else if (/bdo/i.test(rawText)) channel = "bdo";
      else if (/unionbank/i.test(rawText)) channel = "unionbank";
      else if (/shopeepay/i.test(rawText)) channel = "shopeepay";
      else if (/grabpay/i.test(rawText)) channel = "grabpay";

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

  // Fallback broad amount extractor
  const broadAmountMatch = /(?:PHP|Php|₱)\s*([\d,]+(?:\.\d{2})?)/i.exec(rawText);
  if (broadAmountMatch) {
    const amountMinor = parseAmountMinor(broadAmountMatch[1]);
    if (amountMinor !== null) {
      const dt = parseDateTimeFromText(rawText, referenceDate);
      const isIncome = /received|credited|deposit|cash in/i.test(rawText);
      const isTransfer = /transfer|sent/i.test(rawText);
      const type: SmsTransactionType = isIncome ? "income" : isTransfer ? "transfer" : "expense";

      let channel: SupportedChannel = "generic";
      if (/gcash/i.test(rawText)) channel = "gcash";
      else if (/maya/i.test(rawText)) channel = "maya";
      else if (/bpi/i.test(rawText)) channel = "bpi";
      else if (/bdo/i.test(rawText)) channel = "bdo";
      else if (/unionbank/i.test(rawText)) channel = "unionbank";
      else if (/shopeepay/i.test(rawText)) channel = "shopeepay";
      else if (/grabpay/i.test(rawText)) channel = "grabpay";

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

  return null;
}
