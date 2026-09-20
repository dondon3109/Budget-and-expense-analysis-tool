import { describe, expect, it } from "vitest";
import {
  detectSensitive,
  normalizeText,
  redactBugReport,
  redactText,
  type RedactionOutcome,
  type RedactionStatus,
} from "../src/redaction";

describe("normalizeText", () => {
  it("folds NFKC fullwidth digits to standard ASCII digits", () => {
    expect(normalizeText("１２３")).toBe("123");
    expect(normalizeText("Account １２３４５６７８９０")).toContain("1234567890");
  });

  it("folds Cyrillic lookalike characters to Latin equivalents", () => {
    // Cyrillic small letters: а (\u0430), е (\u0435), о (\u043e), р (\u0440), с (\u0441)
    const cyrillicLookalike = "M\u0430ri\u0430";
    expect(normalizeText(cyrillicLookalike).toLowerCase()).toBe("maria");
  });

  it("removes zero-width characters (\\u200b, \\u200c, \\u200d, \\ufeff)", () => {
    const withZeroWidth = "0917\u200b123\u200c45\u200d67\ufeff";
    expect(normalizeText(withZeroWidth)).toBe("09171234567");
  });

  it("collapses whitespace inside digit runs", () => {
    expect(normalizeText("1 2 3 4 5 6 7 8 9 0")).toBe("1234567890");
    expect(normalizeText("Account 1 2 3 4   5 6 7 8   9 0 1 2   3 4 5 6 balance")).toContain(
      "1234567890123456",
    );
  });

  it("joins values split across multiple lines", () => {
    const splitAcrossLines = "1234 5678\n9012 3456";
    const normalized = normalizeText(splitAcrossLines);
    expect(normalized).not.toContain("\n");
    expect(normalized).toContain("1234567890123456");
  });

  it("expands spelled-out numbers to numeric form", () => {
    const normalized = normalizeText("fifty thousand");
    expect(normalized).toContain("50000");
  });
});

describe("redactText", () => {
  describe("monetary amounts are absent from output", () => {
    it("redacts standard peso symbol amounts (₱1,299.00)", () => {
      const result = redactText("Charged ₱1,299.00 for groceries");
      expect(result.text).not.toContain("₱1,299.00");
      expect(result.text).not.toContain("1,299.00");
      expect(result.text).not.toContain("1299");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts PHP prefix amounts (PHP 1299)", () => {
      const result = redactText("Total is PHP 1299 at counter");
      expect(result.text).not.toContain("PHP 1299");
      expect(result.text).not.toContain("1299");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts trailing pesos notation (1,299 pesos)", () => {
      const result = redactText("Transferred 1,299 pesos to savings");
      expect(result.text).not.toContain("1,299 pesos");
      expect(result.text).not.toContain("1,299");
      expect(result.text).not.toContain("1299");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts shorthand amounts (₱50k)", () => {
      const result = redactText("Credit limit reached ₱50k today");
      expect(result.text).not.toContain("₱50k");
      expect(result.text).not.toContain("50000");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts spelled-out monetary amounts (fifty thousand pesos)", () => {
      const result = redactText("Received fifty thousand pesos bonus");
      expect(result.text).not.toContain("fifty thousand pesos");
      expect(result.text).not.toContain("fifty thousand");
      expect(result.text).not.toContain("50000");
      expect(result.redacted.length).toBeGreaterThan(0);
    });
  });

  describe("card, account, and phone numbers are absent from output", () => {
    it("redacts spaced 16-digit card numbers (1234 5678 9012 3456)", () => {
      const result = redactText("Visa card 1234 5678 9012 3456 used");
      expect(result.text).not.toContain("1234 5678 9012 3456");
      expect(result.text).not.toContain("1234567890123456");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts unspaced 16-digit card numbers (1234567890123456)", () => {
      const result = redactText("Card: 1234567890123456");
      expect(result.text).not.toContain("1234567890123456");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts IBAN-shaped account numbers", () => {
      const result = redactText("Wire transfer to PH641234567890123456789012");
      expect(result.text).not.toContain("PH641234567890123456789012");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts Philippine local mobile numbers (0917 123 4567)", () => {
      const result = redactText("GCash mobile 0917 123 4567 registered");
      expect(result.text).not.toContain("0917 123 4567");
      expect(result.text).not.toContain("09171234567");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts Philippine E.164 mobile numbers (+639171234567)", () => {
      const result = redactText("Contact +639171234567 for verification");
      expect(result.text).not.toContain("+639171234567");
      expect(result.text).not.toContain("639171234567");
      expect(result.redacted.length).toBeGreaterThan(0);
    });
  });

  describe("email addresses are absent from output", () => {
    it("redacts email addresses (juan.delacruz@gmail.com)", () => {
      const result = redactText("Account email juan.delacruz@gmail.com bounced");
      expect(result.text).not.toContain("juan.delacruz@gmail.com");
      expect(result.text).not.toContain("juan.delacruz");
      expect(result.redacted.length).toBeGreaterThan(0);
    });
  });

  describe("name contexts are absent from output", () => {
    it("redacts names in uppercase payment context (GCASH SEND TO MARIA)", () => {
      const result = redactText("Log entry: GCASH SEND TO MARIA failed");
      expect(result.text).not.toContain("MARIA");
      expect(result.text).not.toContain("GCASH SEND TO MARIA");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts names in sentence case transfer context (sent to Juan Dela Cruz)", () => {
      const result = redactText("Payment sent to Juan Dela Cruz on Monday");
      expect(result.text).not.toContain("Juan Dela Cruz");
      expect(result.redacted.length).toBeGreaterThan(0);
    });

    it("redacts names in receive context (received from Pedro)", () => {
      const result = redactText("Funds received from Pedro in savings");
      expect(result.text).not.toContain("Pedro");
      expect(result.redacted.length).toBeGreaterThan(0);
    });
  });

  describe("merchant names are absent from output", () => {
    it("redacts merchant names (SM SUPERMARKET MAKATI)", () => {
      const result = redactText("Purchase at SM SUPERMARKET MAKATI declined");
      expect(result.text).not.toContain("SM SUPERMARKET MAKATI");
      expect(result.redacted.length).toBeGreaterThan(0);
    });
  });
});

describe("failure classes", () => {
  it("failure class (a) missed: uncaptured sensitive values must be absent from output", () => {
    const raw =
      "Sent PHP 1500 to juan.delacruz@gmail.com using 0917 123 4567 at SM SUPERMARKET MAKATI";
    const result = redactText(raw);
    expect(result.text).not.toContain("PHP 1500");
    expect(result.text).not.toContain("1500");
    expect(result.text).not.toContain("juan.delacruz@gmail.com");
    expect(result.text).not.toContain("0917 123 4567");
    expect(result.text).not.toContain("09171234567");
    expect(result.text).not.toContain("SM SUPERMARKET MAKATI");
  });

  it("failure class (b) mangled but meaningful: last four digits of card must NOT remain intact", () => {
    const raw = "Payment card 1234 5678 9012 3456 charged";
    const result = redactText(raw);
    // Last-4 of a card is still identifying — assert the last four digits are gone.
    expect(result.text).not.toContain("3456");
    expect(result.text).not.toMatch(/\b3456\b/);
  });

  it("failure class (b) mangled but meaningful: does not leave partial identifying card chunks", () => {
    const raw = "Card number is 1234567890123456";
    const result = redactText(raw);
    expect(result.text).not.toContain("1234");
    expect(result.text).not.toContain("5678");
    expect(result.text).not.toContain("9012");
    expect(result.text).not.toContain("3456");
  });
});

describe("adversarial inputs", () => {
  it("redacts account numbers with spaces inside digit runs", () => {
    const raw = "Account 1 2 3 4   5 6 7 8   9 0 1 2   3 4 5 6 has zero balance";
    const result = redactText(raw);
    expect(result.text).not.toContain("1 2 3 4   5 6 7 8   9 0 1 2   3 4 5 6");
    expect(result.text).not.toContain("1234567890123456");
    expect(result.text).not.toContain("3456");
  });

  it("redacts monetary amounts written in words", () => {
    const raw = "Total cost was fifty thousand pesos for appliances";
    const result = redactText(raw);
    expect(result.text).not.toContain("fifty thousand pesos");
    expect(result.text).not.toContain("fifty thousand");
    expect(result.text).not.toContain("50000");
  });

  it("redacts values containing zero-width characters inside", () => {
    const raw = "Mobile 0917\u200b123\u200c4567 and card 1234\u200d5678\ufeff90123456";
    const result = redactText(raw);
    expect(result.text).not.toContain("09171234567");
    expect(result.text).not.toContain("1234567890123456");
    expect(result.text).not.toContain("3456");
  });

  it("redacts values obscured by unicode lookalikes", () => {
    const raw = "Card １２３４ ５６７８ ９０１２ ３４５６ linked";
    const result = redactText(raw);
    expect(result.text).not.toContain("１２３４ ５６７８ ９０１２ ３４５６");
    expect(result.text).not.toContain("1234567890123456");
    expect(result.text).not.toContain("3456");
  });

  it("redacts sensitive values split across two lines", () => {
    const raw = "Transferred to 1234 5678\n9012 3456 yesterday";
    const result = redactText(raw);
    expect(result.text).not.toContain("1234 5678");
    expect(result.text).not.toContain("9012 3456");
    expect(result.text).not.toContain("1234567890123456");
    expect(result.text).not.toContain("3456");
  });
});

describe("detectSensitive", () => {
  it("REQUIRED NEGATIVE TEST: detects sensitive data directly on raw unredacted input", () => {
    // Pass a RAW, unredacted string with money and a card number DIRECTLY to detectSensitive
    // and assert it returns a non-empty array. A detector that never fires proves nothing.
    const raw = "Transferred ₱1,299.00 using debit card 1234 5678 9012 3456";
    const hits = detectSensitive(raw);
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("returns an empty array for clean text without sensitive information", () => {
    const clean = "The dashboard summary page fails to load after clicking the refresh button";
    const hits = detectSensitive(clean);
    expect(hits).toEqual([]);
  });

  it("detects residue after partial or incomplete redaction", () => {
    const partialResidue = "Payment processed for account ending in 3456 with balance PHP 500";
    const hits = detectSensitive(partialResidue);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("redactBugReport", () => {
  it("returns status 'clean' and non-null text when all four fields are clean", () => {
    const report = {
      title: "Dashboard crashes on refresh",
      actualBehavior: "Screen goes white and app becomes unresponsive",
      expectedBehavior: "Dashboard updates with latest charts",
      stepsToReproduce: "1. Open app 2. Pull down to refresh",
    };
    const outcome: RedactionOutcome = redactBugReport(report);

    expect(outcome.status).toBe("clean");
    expect(outcome.text).not.toBeNull();
    expect(typeof outcome.text).toBe("string");
    expect(outcome.detectorHits).toEqual([]);
  });

  it("fails closed with status 'blocked' and text === null when title contains sensitive data", () => {
    const report = {
      title: "Bug paying ₱1,299.00 to merchant",
      actualBehavior: "Screen froze during confirmation",
      expectedBehavior: "Should show success screen",
      stepsToReproduce: "Click pay button",
    };
    const outcome: RedactionOutcome = redactBugReport(report);

    expect(outcome.status).toBe("blocked");
    expect(outcome.text).toBeNull();
    expect(outcome.detectorHits.length).toBeGreaterThan(0);
  });

  it("fails closed with status 'blocked' and text === null when actualBehavior contains sensitive data", () => {
    const report = {
      title: "Payment transaction error",
      actualBehavior: "Card 1234 5678 9012 3456 was charged twice",
      expectedBehavior: "Should charge only once",
      stepsToReproduce: "Submit payment",
    };
    const outcome: RedactionOutcome = redactBugReport(report);

    expect(outcome.status).toBe("blocked");
    expect(outcome.text).toBeNull();
    expect(outcome.detectorHits.length).toBeGreaterThan(0);
  });

  it("fails closed with status 'blocked' and text === null when expectedBehavior contains sensitive data", () => {
    const report = {
      title: "Transfer confirmation missing",
      actualBehavior: "Blank receipt shown",
      expectedBehavior: "Expected receipt for sent to Juan Dela Cruz",
      stepsToReproduce: "Perform transfer",
    };
    const outcome: RedactionOutcome = redactBugReport(report);

    expect(outcome.status).toBe("blocked");
    expect(outcome.text).toBeNull();
    expect(outcome.detectorHits.length).toBeGreaterThan(0);
  });

  it("fails closed with status 'blocked' and text === null when stepsToReproduce contains sensitive data", () => {
    const report = {
      title: "OTP delivery delay",
      actualBehavior: "No SMS received",
      expectedBehavior: "SMS arrives within 30 seconds",
      stepsToReproduce: "Enter mobile number 0917 123 4567 and request OTP",
    };
    const outcome: RedactionOutcome = redactBugReport(report);

    expect(outcome.status).toBe("blocked");
    expect(outcome.text).toBeNull();
    expect(outcome.detectorHits.length).toBeGreaterThan(0);
  });

  it("asserts status is strictly either 'clean' or 'blocked' with no third state", () => {
    const cleanReport = {
      title: "Settings page typo",
      actualBehavior: "Word misspelled",
      expectedBehavior: "Word spelled correctly",
      stepsToReproduce: "Open settings",
    };
    const dirtyReport = {
      title: "Leak in logs",
      actualBehavior: "Shows juan.delacruz@gmail.com in console",
      expectedBehavior: "Logs should be sanitized",
      stepsToReproduce: "Open console",
    };

    const cleanOutcome = redactBugReport(cleanReport);
    const dirtyOutcome = redactBugReport(dirtyReport);

    const validStatuses: RedactionStatus[] = ["clean", "blocked"];
    expect(validStatuses).toContain(cleanOutcome.status);
    expect(validStatuses).toContain(dirtyOutcome.status);
    expect(cleanOutcome.status === "clean" || cleanOutcome.status === "blocked").toBe(true);
    expect(dirtyOutcome.status === "clean" || dirtyOutcome.status === "blocked").toBe(true);
  });
});

describe("audit defect fixes", () => {
  it("A redactable report comes back clean (core Option B contract)", () => {
    const rawPeso = "₱1,299.00";
    const rawCard = "1234 5678 9012 3456";
    const rawEmail = "juan.delacruz@gmail.com";
    const rawCustomer = "Juan Dela Cruz";

    const report = {
      title: "Transaction confirmation failed",
      actualBehavior: `Paid ${rawPeso} using card ${rawCard} sent to ${rawCustomer} receipt sent to ${rawEmail}`,
      expectedBehavior: "Confirmation receipt appears",
      stepsToReproduce: "Submit payment",
    };

    const outcome = redactBugReport(report);

    expect(outcome.status).toBe("clean");
    expect(outcome.text).not.toBeNull();
    // Assert the specific strings are absent, not just that something was replaced
    expect(outcome.text).not.toContain(rawPeso);
    expect(outcome.text).not.toContain(rawCard);
    expect(outcome.text).not.toContain(rawEmail);
    expect(outcome.text).not.toContain(rawCustomer);
    expect(outcome.detectorHits).toEqual([]);
  });

  it("Redaction actually removed it (card digits, last four, and raw amount are absent)", () => {
    const rawPeso = "₱1,299.00";
    const rawCard = "1234 5678 9012 3456";
    const rawEmail = "juan.delacruz@gmail.com";
    const rawCustomer = "Juan Dela Cruz";

    const report = {
      title: "Transaction confirmation failed",
      actualBehavior: `Paid ${rawPeso} using card ${rawCard} sent to ${rawCustomer} receipt sent to ${rawEmail}`,
      expectedBehavior: "Confirmation receipt appears",
      stepsToReproduce: "Submit payment",
    };

    const outcome = redactBugReport(report);

    expect(outcome.text).not.toBeNull();
    // Must not contain the digits of the card (including its last four)
    expect(outcome.text).not.toContain("1234");
    expect(outcome.text).not.toContain("5678");
    expect(outcome.text).not.toContain("9012");
    expect(outcome.text).not.toContain("3456");
    expect(outcome.text).not.toMatch(/\b3456\b/);
    expect(outcome.text).not.toContain("1234567890123456");
    // Nor the raw amount
    expect(outcome.text).not.toContain("1,299.00");
    expect(outcome.text).not.toContain("1299");
    expect(outcome.text).not.toContain("₱1,299.00");
  });

  it("Order independence: detectSensitive is pure and order-independent across calls", () => {
    const longer = "call 09171234567 now";
    const shorter = "09171234567";

    // Call detectSensitive on a longer string containing a phone number
    const firstCall = detectSensitive(longer);
    expect(firstCall).toContain("phone");

    // Immediately on a shorter one containing a phone number — must report phone
    const secondCall = detectSensitive(shorter);
    expect(secondCall).toContain("phone");

    // Assert the same input yields identical results across repeated calls
    const thirdCall = detectSensitive(shorter);
    expect(thirdCall).toEqual(secondCall);

    const fourthCall = detectSensitive(longer);
    expect(fourthCall).toEqual(firstCall);
  });

  it("Detector still fires on a deliberately-unredacted control", () => {
    const raw = "Payment of PHP 2500 sent to Juan Dela Cruz via 09171234567";
    const hits = detectSensitive(raw);
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits).toContain("money");
    expect(hits).toContain("phone");
  });

  it("Still blocks when redaction genuinely fails (sensitive content survives redaction)", () => {
    // Construct an input where sensitive content survives redaction:
    // e.g. a 4-digit code that is not matched by CARD_REGEX (which matches 13-19 digit cards),
    // but IS detected by detectSensitive(/\b\d{4,}\b/) as "card".
    const report = {
      title: "Authentication error",
      actualBehavior: "Security PIN was 4829 during login",
      expectedBehavior: "Login succeeds",
      stepsToReproduce: "Enter PIN",
    };

    const outcome = redactBugReport(report);

    expect(outcome.status).toBe("blocked");
    expect(outcome.text).toBeNull();
    expect(outcome.detectorHits).toContain("card");
    expect(outcome.detectorHits.length).toBeGreaterThan(0);
  });
});

describe("BUG 1 regression: formatted money and separator-aware digit runs", () => {
  const table = [
    { input: "1,299" },
    { input: "12,999" },
    { input: "999,999" },
    { input: "150,000" },
    { input: "1,299,000" },
    { input: "12,34,567" },
    { input: "1299" },
    { input: "150000" },
  ];

  for (const row of table) {
    it(`verbatim table row: '${row.input}' detector must fire and redacted output must not contain it`, () => {
      const hits = detectSensitive(row.input);
      expect(hits.length).toBeGreaterThan(0);

      const redacted = redactText(row.input);
      expect(redacted.text).not.toContain(row.input);
    });
  }

  it("End to end: a report whose actualBehavior is 'My balance shows 1,299 but it should be 1,500' must not come back status: 'clean' with that text intact", () => {
    const report = {
      title: "Balance display bug",
      actualBehavior: "My balance shows 1,299 but it should be 1,500",
      expectedBehavior: "Show correct balance",
      stepsToReproduce: "View account dashboard",
    };

    const outcome = redactBugReport(report);
    if (outcome.status === "clean") {
      expect(outcome.text).not.toContain("1,299");
      expect(outcome.text).not.toContain("1,500");
    } else {
      expect(outcome.status).toBe("blocked");
      expect(outcome.text).toBeNull();
    }
    if (outcome.text !== null) {
      expect(outcome.text).not.toContain("1,299");
      expect(outcome.text).not.toContain("1,500");
    }
  });

  it("No regression: 2.41.1 must not be treated as 4+ digits by itself in a way that breaks existing clean-report tests", () => {
    expect(detectSensitive("2.41.1")).toEqual([]);
    expect(redactText("2.41.1").text).toBe("2.41.1");
    expect(detectSensitive("1.2.3")).toEqual([]);
    expect(redactText("1.2.3").text).toBe("1.2.3");

    const cleanReport = {
      title: "Clean report with version",
      actualBehavior: "App version 2.41.1 loads settings correctly",
      expectedBehavior: "Settings load",
      stepsToReproduce: "Open settings",
    };
    const outcome = redactBugReport(cleanReport);
    expect(outcome.status).toBe("clean");
    expect(outcome.text).toContain("2.41.1");
    expect(outcome.detectorHits).toEqual([]);
  });

  it("Dates like 2026-09-20 fire in the fail-closed direction and do not crash", () => {
    expect(() => redactText("2026-09-20")).not.toThrow();
    expect(detectSensitive("2026-09-20").length).toBeGreaterThan(0);
  });
});

describe("separator and digit-script bypasses", () => {
  it("redacts a card number written with dots (4111.1111.1111.1111)", () => {
    const raw = "Visa 4111.1111.1111.1111 was declined";
    const redacted = redactText(raw);
    expect(redacted.text).not.toContain("4111.1111.1111.1111");
    expect(redacted.text).not.toContain("4111");
    expect(detectSensitive(raw).length).toBeGreaterThan(0);
  });

  it("redacts an account number written with dots (1234.5678.9012.3456)", () => {
    const raw = "Account 1234.5678.9012.3456 was charged twice";
    expect(redactText(raw).text).not.toContain("1234.5678.9012.3456");
    expect(detectSensitive(raw).length).toBeGreaterThan(0);
  });

  it("does not emit a dotted card number as clean report text", () => {
    const outcome = redactBugReport({
      title: "Card declined",
      actualBehavior: "Visa 4111.1111.1111.1111 was declined twice",
      expectedBehavior: "Charge the card once",
      stepsToReproduce: "Submit the payment form",
    });
    expect(outcome.text ?? "").not.toContain("4111.1111.1111.1111");
    if (outcome.text !== null) {
      expect(outcome.text).toContain("[REDACTED]");
    }
  });

  it("keeps versions and addresses exempt from the dotted-run rule", () => {
    expect(redactText("App version 2.41.1").text).toContain("2.41.1");
    expect(detectSensitive("2.41.1")).toEqual([]);
    expect(redactText("Request to 192.168.1.1 timed out").text).toContain("192.168.1.1");
  });

  it("folds Arabic-Indic digits before detection and redaction", () => {
    expect(normalizeText("١٢٣٤")).toBe("1234");
    const raw = "Card ٤١١١ ١١١١ ١١١١ ١١١١ declined";
    const redacted = redactText(raw);
    expect(redacted.text).not.toContain("٤١١١");
    expect(redacted.text).toContain("[REDACTED]");
    expect(detectSensitive(raw).length).toBeGreaterThan(0);
  });

  it("folds Devanagari digits before detection and redaction", () => {
    expect(normalizeText("१२३४५६७८")).toBe("12345678");
    const raw = "Account १२३४५६७८ debited";
    expect(redactText(raw).text).not.toContain("१२३४५६७८");
    expect(detectSensitive(raw).length).toBeGreaterThan(0);
  });
});
