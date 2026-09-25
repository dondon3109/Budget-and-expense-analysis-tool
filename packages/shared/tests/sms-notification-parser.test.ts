import { describe, expect, it } from "vitest";

import {
  parseSmsNotification,
  suggestCategory,
  type ParsedSmsTransaction,
} from "../src/smsNotificationParser";

describe("smsNotificationParser", () => {
  describe("GCash format parsing", () => {
    it("parses GCash paid notification", () => {
      const text =
        "You have paid PHP 250.00 of GCash to JOLLIBEE on 08/25/2026 14:30. Ref. No. 123456789";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "gcash",
        type: "expense",
        amountMinor: 25000,
        currency: "PHP",
        date: "2026-08-25",
        time: "14:30",
        payeeOrMerchant: "JOLLIBEE",
        referenceNumber: "123456789",
        rawText: text,
        suggestedCategory: "Food & Dining",
        confidence: "high",
      });
    });

    it("parses GCash send money notification", () => {
      const text =
        "You have sent PHP 500.00 of GCash to JUAN DELA CRUZ 09171234567 on 08/25/2026 10:15. Ref. No. 987654321";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "gcash",
        type: "transfer",
        amountMinor: 50000,
        currency: "PHP",
        date: "2026-08-25",
        time: "10:15",
        payeeOrMerchant: "JUAN DELA CRUZ 09171234567",
        referenceNumber: "987654321",
        rawText: text,
        suggestedCategory: "Transfers / Cash In",
        confidence: "high",
      });
    });

    it("parses GCash received money notification", () => {
      const text =
        "You have received PHP 1,000.00 of GCash from MARIA CLARA 09181234567 on 08/25/2026 11:20. Ref. No. 456789123";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "gcash",
        type: "income",
        amountMinor: 100000,
        currency: "PHP",
        date: "2026-08-25",
        time: "11:20",
        payeeOrMerchant: "MARIA CLARA 09181234567",
        referenceNumber: "456789123",
        rawText: text,
        suggestedCategory: "Transfers / Cash In",
        confidence: "high",
      });
    });

    it("parses GCash payment successful notification", () => {
      const text = "Payment of PHP 1,500.00 to NETFLIX was successful. Ref No. 789123456";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "gcash",
        type: "expense",
        amountMinor: 150000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "NETFLIX",
        referenceNumber: "789123456",
        rawText: text,
        suggestedCategory: "Entertainment & Subscriptions",
        confidence: "high",
      });
    });
  });

  describe("Maya format parsing", () => {
    it("parses Maya paid notification with 12hr time", () => {
      const text =
        "You paid PHP 350.00 to Grab Philippines using Maya on 25 Aug 2026 12:00PM. Ref: MAYA-998877";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "maya",
        type: "expense",
        amountMinor: 35000,
        currency: "PHP",
        date: "2026-08-25",
        time: "12:00",
        payeeOrMerchant: "Grab Philippines",
        referenceNumber: "MAYA-998877",
        rawText: text,
        suggestedCategory: "Transportation",
        confidence: "high",
      });
    });

    it("parses Maya sent money notification", () => {
      const text = "You sent PHP 1,200.00 to 09171234567 via Maya. Ref No: 1122334455";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "maya",
        type: "transfer",
        amountMinor: 120000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "09171234567",
        referenceNumber: "1122334455",
        rawText: text,
        suggestedCategory: "Transfers / Cash In",
        confidence: "high",
      });
    });

    it("parses Maya received money notification", () => {
      const text = "You received PHP 5,000.00 from PEDRO PENDUKO via Maya. Ref: 5544332211";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "maya",
        type: "income",
        amountMinor: 500000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "PEDRO PENDUKO",
        referenceNumber: "5544332211",
        rawText: text,
        suggestedCategory: "Transfers / Cash In",
        confidence: "high",
      });
    });
  });

  describe("BPI format parsing", () => {
    it("parses BPI debit card payment", () => {
      const text =
        "You paid PHP 2,450.00 at MERCURY DRUG with your BPI Debit card ending in 1234 on 08/25/2026. Ref: BPI-9988";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "bpi",
        type: "expense",
        amountMinor: 245000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "MERCURY DRUG",
        referenceNumber: "BPI-9988",
        accountSuffix: "*1234",
        rawText: text,
        suggestedCategory: "Groceries",
        confidence: "high",
      });
    });

    it("parses BPI Online transfer", () => {
      const text =
        "Your BPI Online transfer of PHP 3,000.00 to GCASH was successful on 08/25/2026. Ref: BPI-1122";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "bpi",
        type: "transfer",
        amountMinor: 300000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "GCASH",
        referenceNumber: "BPI-1122",
        rawText: text,
        suggestedCategory: "Transfers / Cash In",
        confidence: "high",
      });
    });
  });

  describe("BDO format parsing", () => {
    it("parses BDO card purchase", () => {
      const text =
        "BDO: You purchased PHP 1,890.50 at SM SUPERMARKET on 08/25/2026 using card ending in 5678. Ref: BDO7788";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "bdo",
        type: "expense",
        amountMinor: 189050,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "SM SUPERMARKET",
        referenceNumber: "BDO7788",
        accountSuffix: "*5678",
        rawText: text,
        suggestedCategory: "Groceries",
        confidence: "high",
      });
    });
  });

  describe("UnionBank format parsing", () => {
    it("parses UnionBank debited transaction", () => {
      const text =
        "UnionBank: PHP 750.00 debited from acct ending in 4321 for payment to SHOPEE on 2026-08-25. Ref: UB-4455";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "unionbank",
        type: "expense",
        amountMinor: 75000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "SHOPEE",
        referenceNumber: "UB-4455",
        rawText: text,
        suggestedCategory: "Shopping",
        confidence: "high",
      });
    });
  });

  describe("ShopeePay format parsing", () => {
    it("parses ShopeePay merchant payment", () => {
      const text = "ShopeePay: Paid PHP 420.00 to Merchant FoodPanda. Ref: SP12345678";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "shopeepay",
        type: "expense",
        amountMinor: 42000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "FoodPanda",
        referenceNumber: "SP12345678",
        rawText: text,
        suggestedCategory: "Food & Dining",
        confidence: "high",
      });
    });
  });

  describe("GrabPay format parsing", () => {
    it("parses GrabPay payment with DD/MM/YYYY date", () => {
      const text =
        "GrabPay: Payment of PHP 180.00 to GrabCar completed on 25/08/2026. Trans ID: GP-8899";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "grabpay",
        type: "expense",
        amountMinor: 18000,
        currency: "PHP",
        date: "2026-08-25",
        time: undefined,
        payeeOrMerchant: "GrabCar",
        referenceNumber: "GP-8899",
        rawText: text,
        suggestedCategory: "Transportation",
        confidence: "high",
      });
    });
  });

  describe("Generic fallback regex", () => {
    it("parses generic payment", () => {
      const text = "Paid PHP 500.00 to Meralco. Ref: 12345";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).not.toBeNull();
      expect(result?.channel).toBe("generic");
      expect(result?.type).toBe("expense");
      expect(result?.amountMinor).toBe(50000);
      expect(result?.payeeOrMerchant).toBe("Meralco");
      expect(result?.suggestedCategory).toBe("Utilities");
      expect(result?.referenceNumber).toBe("12345");
    });

    it("parses generic transfer", () => {
      const text = "Transferred PHP 1,000.00 to Pedro on 2026-08-25. Ref: TR-99";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result?.channel).toBe("generic");
      expect(result?.type).toBe("transfer");
      expect(result?.amountMinor).toBe(100000);
      expect(result?.payeeOrMerchant).toBe("Pedro");
      expect(result?.suggestedCategory).toBe("Transfers / Cash In");
      expect(result?.date).toBe("2026-08-25");
    });

    it("parses generic received income", () => {
      const text = "Received PHP 2,500.00 from Juan. RN: 8888";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).not.toBeNull();
      expect(result?.channel).toBe("generic");
      expect(result?.type).toBe("income");
      expect(result?.amountMinor).toBe(250000);
      expect(result?.payeeOrMerchant).toBe("Juan");
      expect(result?.suggestedCategory).toBe("Transfers / Cash In");
    });
  });

  describe("Category suggestions", () => {
    it("categorizes correctly across categories", () => {
      expect(suggestCategory("Jollibee", "expense")).toBe("Food & Dining");
      expect(suggestCategory("SM Supermarket", "expense")).toBe("Groceries");
      expect(suggestCategory("Netflix", "expense")).toBe("Entertainment & Subscriptions");
      expect(suggestCategory("GrabCar", "expense")).toBe("Transportation");
      expect(suggestCategory("Shopee", "expense")).toBe("Shopping");
      expect(suggestCategory("Meralco", "expense")).toBe("Utilities");
      expect(suggestCategory("Juan", "transfer")).toBe("Transfers / Cash In");
      expect(suggestCategory("Unknown Co", "expense")).toBe("General");
    });
  });

  describe("Yearless dates and extended currency/card formats", () => {
    it("parses yearless slash dates (MM/DD) and infers reference year", () => {
      const text = "You paid PHP 320.00 at JOLLIBEE on 09/02 12:45pm. Ref: 123456";
      const result = parseSmsNotification(text, "2026-08-01");
      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-09-02");
      expect(result?.time).toBe("12:45");
      expect(result?.amountMinor).toBe(32000);
      expect(result?.payeeOrMerchant).toBe("JOLLIBEE");
    });

    it("parses 2-digit year dates (MM/DD/YY)", () => {
      const text = "You paid PHP 150.00 at 7-Eleven on 08/25/26 14:00. Ref: 998877";
      const result = parseSmsNotification(text);
      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-08-25");
      expect(result?.time).toBe("14:00");
    });

    it("parses yearless text dates (DD Mon)", () => {
      const text = "You paid PHP 450.00 at Starbucks on 25 Aug 10:30AM. Ref: SB123";
      const result = parseSmsNotification(text, "2026-01-01");
      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-08-25");
      expect(result?.time).toBe("10:30");
    });

    it("parses card charged in USD with account suffix and merchant", () => {
      const text = "Your card ending in 4321 was charged $42.50 at Target on 2026-09-02.";
      const result = parseSmsNotification(text);
      expect(result).not.toBeNull();
      expect(result?.amountMinor).toBe(4250);
      expect(result?.currency).toBe("USD");
      expect(result?.type).toBe("expense");
      expect(result?.payeeOrMerchant).toBe("Target");
      expect(result?.accountSuffix).toBe("*4321");
      expect(result?.date).toBe("2026-09-02");
      expect(result?.suggestedCategory).toBe("Shopping");
    });

    it("parses salary credited in USD with account ending", () => {
      const text = "Salary credited $3,500.00 to account ending 9876 on 2026-09-01.";
      const result = parseSmsNotification(text);
      expect(result).not.toBeNull();
      expect(result?.amountMinor).toBe(350000);
      expect(result?.currency).toBe("USD");
      expect(result?.type).toBe("income");
      expect(result?.payeeOrMerchant).toBe("Salary");
      expect(result?.accountSuffix).toBe("*9876");
      expect(result?.date).toBe("2026-09-01");
      expect(result?.suggestedCategory).toBe("Salary");
    });

    it("parses transfer in USD", () => {
      const text = "Transfer of $150.00 sent to John Doe on 2026-09-02.";
      const result = parseSmsNotification(text);
      expect(result).not.toBeNull();
      expect(result?.amountMinor).toBe(15000);
      expect(result?.currency).toBe("USD");
      expect(result?.type).toBe("transfer");
      expect(result?.payeeOrMerchant).toBe("John Doe");
      expect(result?.date).toBe("2026-09-02");
    });
  });

  describe("Bare peso amounts and dashed dates", () => {
    it("parses a real GCash alert with a P amount and MM-DD-YY timestamp", () => {
      const text =
        "You have paid P64.33 GCash to PAYPAL *GIT on 07-17-26 12:26:58 AM. Your new balance is P17.78. Ref. No. 5000056111527";
      const result = parseSmsNotification(text);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        channel: "gcash",
        type: "expense",
        amountMinor: 6433,
        currency: "PHP",
        date: "2026-07-17",
        time: "00:26:58",
        payeeOrMerchant: "PAYPAL *GIT",
        referenceNumber: "5000056111527",
        rawText: text,
        suggestedCategory: "General",
        confidence: "high",
      });
    });

    it("does not read a dashed mobile number as a date", () => {
      const text = "You sent P500.00 to 0917-123-4567 via Maya. Ref No: 1122334455";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-08-25");
      expect(result?.time).toBeUndefined();
      expect(result?.amountMinor).toBe(50000);
      expect(result?.payeeOrMerchant).toBe("0917-123-4567");
    });
  });

  describe("Direction and payee for unrecognised phrasing", () => {
    it("reads a GCash withdrawal as a transfer to cash", () => {
      const text =
        "You have successfully withdrawn P1,216.00 from your GCash wallet with applicable fees on 07-15-26 03:49:00 PM Your new balance is P82.11. Ref. No 5042913534199";
      const result = parseSmsNotification(text);

      expect(result).toMatchObject({
        channel: "gcash",
        type: "transfer",
        amountMinor: 121600,
        date: "2026-07-15",
        time: "15:49:00",
        payeeOrMerchant: "Cash withdrawal",
        referenceNumber: "5042913534199",
        suggestedCategory: "Transfers / Cash In",
        confidence: "medium",
      });
    });

    it("accepts GCash's 'successfully' phrasing on payments", () => {
      const text =
        "You have successfully paid P350.00 GCash to MERALCO on 07-15-26 03:49:00 PM. Ref. No. 5042913534100";
      const result = parseSmsNotification(text);

      expect(result).toMatchObject({
        type: "expense",
        payeeOrMerchant: "MERALCO",
        suggestedCategory: "Utilities",
        confidence: "high",
      });
    });

    it("reads a cash in as income", () => {
      const text = "Cash In of P500.00 to your GCash account is successful. Ref. No. 1234567";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({ type: "income", payeeOrMerchant: "Cash in" });
    });

    it("takes the merchant after 'to' when the verb is not a known pattern", () => {
      const text =
        "P1,250.00 has been debited from your account for bills payment to PLDT. Ref 555";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({
        type: "expense",
        amountMinor: 125000,
        payeeOrMerchant: "PLDT",
        suggestedCategory: "Utilities",
      });
    });

    it("does not read 'at <time>' as the merchant", () => {
      const text = "P500.00 was deducted from your account on 08/25/26 at 10:30 AM. Ref 123";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({ type: "expense", payeeOrMerchant: "Unknown Merchant" });
    });

    it("does not take a payee from a footer sentence", () => {
      const text = "P200.00 was deducted from your account. Reply to this message for help.";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result?.payeeOrMerchant).toBe("Unknown Merchant");
    });

    it("reads a biller's payment confirmation as an expense", () => {
      const text = "We have received your payment of P1,500.00 for MERALCO. Ref 777";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result?.type).toBe("expense");
    });

    it.each([
      "P500.00 was charged to your card at SHOP X. If you have not received an OTP, call 8888.",
      "P1,250.00 was debited from your deposit account. Ref 9",
      "P640.00 was spent at SHOP X. Cash out anytime!",
      "P640.00 was spent at SHOP X. See our refund policy.",
    ])("keeps an expense when a footer or account name has other keywords: %s", (text) => {
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result?.type).toBe("expense");
    });

    it.each([
      "Payment received: P1,500.00 for your MERALCO bill.",
      "We have received payment of P1,500.00 for MERALCO.",
      "Your bill payment of P1,500.00 has been received.",
    ])("reads a biller confirmation as an expense: %s", (text) => {
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result?.type).toBe("expense");
    });

    it("keeps a payment the user received as income", () => {
      const text = "You received a payment of P800.00 from JUAN. Ref 5";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({ type: "income", payeeOrMerchant: "JUAN" });
    });

    it("finds the merchant after 'at' when 'to' names the user's card", () => {
      const text = "P300.00 was charged to your card at STARBUCKS. Ref 1";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({ type: "expense", payeeOrMerchant: "STARBUCKS" });
    });

    it("ignores 'send' in an OTP footer", () => {
      const text = "P300.00 was charged to your card. Never send your OTP to anyone.";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result?.type).toBe("expense");
    });

    it.each(["Cash out of P1,000.00 is successful.", "You cashed out P1,000.00 today."])(
      "reads %s as a transfer",
      (text) => {
        const result = parseSmsNotification(text, "2026-08-25");

        expect(result).toMatchObject({ type: "transfer", payeeOrMerchant: "Cash withdrawal" });
      },
    );

    it("takes an income payee from 'from X'", () => {
      const text = "Deposit of P2,000.00 from ACME CORP on 08/25/26. Ref 42";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({ type: "income", payeeOrMerchant: "ACME CORP" });
    });

    it("takes an expense payee from 'at X'", () => {
      const text = "A purchase of P780.00 was made at STARBUCKS BGC. Ref 9";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({
        type: "expense",
        payeeOrMerchant: "STARBUCKS BGC",
        suggestedCategory: "Food & Dining",
      });
    });

    it("does not name the user's own account as a transfer payee", () => {
      const text = "Transfer of funds P5,000.00 to your savings account is complete.";
      const result = parseSmsNotification(text, "2026-08-25");

      expect(result).toMatchObject({ type: "transfer", payeeOrMerchant: "Transfer" });
    });

    it("keeps wallet names out of an expense's category", () => {
      expect(suggestCategory("PAYPAL *GIT", "expense", "You have paid P64.33 GCash")).toBe(
        "General",
      );
    });
  });

  describe("Edge cases", () => {
    it("returns null on empty or non-string input", () => {
      expect(parseSmsNotification("")).toBeNull();
      expect(parseSmsNotification("   ")).toBeNull();
      expect(parseSmsNotification(null as any)).toBeNull();
      expect(parseSmsNotification(undefined as any)).toBeNull();
    });

    it("returns null on completely irrelevant text", () => {
      expect(parseSmsNotification("Hello, your verification code is 123456.")).toBeNull();
    });
  });
});
