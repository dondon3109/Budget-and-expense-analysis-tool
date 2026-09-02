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
