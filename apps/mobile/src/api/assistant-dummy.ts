import * as Crypto from "expo-crypto";
import {
  CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  type AssistantMemory,
  type AssistantMemoryPreferences,
  type AssistantMessageInput,
  type AssistantPreferenceUpdate,
  type AssistantPreferences,
  type AssistantSpeechVoice,
  type AssistantThread,
  type AssistantThreadPage,
  type AssistantVoicePreferences,
  type AssistantVoiceTranscription,
  type ReceiptDraft,
  type ReceiptPreferences,
  type TransactionVoiceDraft,
} from "@zoption/shared";

import { isDevelopmentAppVariant } from "@/config/app-variant";
import type {
  AssistantWireMessage,
  AssistantWireMessagePage,
  AssistantWireTurnResult,
} from "./assistant";

export const CURRENT_CONSENT_VERSION = 5;

export function isDummyAssistantToken(accessToken: string): boolean {
  if (process.env.EXPO_PUBLIC_DEV_USE_REAL_API === "true") {
    return false;
  }
  return isDevelopmentAppVariant() && accessToken === "dummy-dev-access-token";
}

function generateUuid(): string {
  try {
    if (typeof Crypto !== "undefined" && typeof Crypto.randomUUID === "function") {
      const id = Crypto.randomUUID();
      if (typeof id === "string" && id.length > 0) return id;
    }
  } catch {
    // Fall back if native module is uninitialized
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    const id = crypto.randomUUID();
    if (typeof id === "string" && id.length > 0) return id;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 1. In-memory dummy state for development mode
let dummyPreferences: AssistantPreferences = {
  consentedAt: "2026-08-01T00:00:00.000Z",
  consentVersion: CURRENT_CONSENT_VERSION,
  retentionDays: 90,
  assistantName: "Nova",
  userPreferredName: "Don",
  responseDetail: "concise",
  coachingStyle: "direct",
};

let dummyVoicePreferences: AssistantVoicePreferences = {
  enabled: true,
  speechAvailable: true,
  reviewRequired: false,
  consentedAt: "2026-08-01T00:00:00.000Z",
  consentVersion: CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  transcriptionModel: "@cf/openai/whisper-large-v3-turbo",
  ttsModel: "s2.1-pro-free",
};

let dummyMemoryPreferences: AssistantMemoryPreferences = {
  debtStrategy: "avalanche",
  responseDetail: "concise",
  coachingStyle: "direct",
};

let dummyMemories: AssistantMemory[] = [
  {
    id: "mem-emergency-fund",
    kind: "fact",
    key: "emergency_fund_target",
    value: "Maintaining 6 months of living expenses in BPI Savings.",
    source: "user_stated",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
  },
  {
    id: "mem-debt-avalanche",
    kind: "preference",
    key: "debt_strategy_priority",
    value: "Prefers the avalanche method to eliminate highest interest rates first.",
    source: "user_stated",
    createdAt: "2026-08-16T09:30:00.000Z",
    updatedAt: "2026-08-16T09:30:00.000Z",
  },
  {
    id: "mem-groceries-target",
    kind: "summary",
    key: "groceries_spending_focus",
    value: "Watching monthly grocery spending closely against the ₱15,000 budget.",
    source: "model_assisted",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
  },
];

let dummyThreads: AssistantThread[] = [
  {
    id: "00000000-0000-4000-8000-100000000001",
    title: "August Budget Review",
    kind: "text",
    lastMessageAt: "2026-08-28T09:15:00.000Z",
    createdAt: "2026-08-28T09:10:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-100000000002",
    title: "Debt Payoff Strategy",
    kind: "voice",
    lastMessageAt: "2026-08-27T16:45:00.000Z",
    createdAt: "2026-08-27T16:40:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-100000000003",
    title: "Liquid Reserves & Cash",
    kind: "text",
    lastMessageAt: "2026-08-24T11:20:00.000Z",
    createdAt: "2026-08-24T11:15:00.000Z",
  },
];

let dummyMessages: Record<string, AssistantWireMessage[]> = {
  "00000000-0000-4000-8000-100000000001": [
    {
      id: "00000000-0000-4000-8000-200000000001",
      threadId: "00000000-0000-4000-8000-100000000001",
      role: "user",
      content: "How is my grocery spending looking this month?",
      status: "completed",
      createdAt: "2026-08-28T09:10:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-200000000002",
      threadId: "00000000-0000-4000-8000-100000000001",
      role: "assistant",
      content:
        "You have spent **₱12,450** out of your **₱15,000** grocery budget for August (**83%** utilized).\n\n• **Remaining:** ₱2,550\n• **Status:** On track for the remainder of the month.\n\nGreat job maintaining your allocation!",
      status: "completed",
      createdAt: "2026-08-28T09:15:00.000Z",
    },
  ],
  "00000000-0000-4000-8000-100000000002": [
    {
      id: "00000000-0000-4000-8000-200000000003",
      threadId: "00000000-0000-4000-8000-100000000002",
      role: "user",
      content: "What is the best way to handle my credit card balance?",
      status: "completed",
      createdAt: "2026-08-27T16:40:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-200000000004",
      threadId: "00000000-0000-4000-8000-100000000002",
      role: "assistant",
      content:
        "Your Citibank Card balance is currently **₱12,500.00**.\n\nUnder your active **debt avalanche** strategy, directing surplus cash to this balance while making minimum payments on any lower-interest accounts will minimize your total interest cost.",
      status: "completed",
      createdAt: "2026-08-27T16:45:00.000Z",
    },
  ],
  "00000000-0000-4000-8000-100000000003": [
    {
      id: "00000000-0000-4000-8000-200000000005",
      threadId: "00000000-0000-4000-8000-100000000003",
      role: "user",
      content: "What is my total cash balance right now?",
      status: "completed",
      createdAt: "2026-08-24T11:15:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-200000000006",
      threadId: "00000000-0000-4000-8000-100000000003",
      role: "assistant",
      content:
        "Here are your liquid account balances:\n\n• **BPI Savings:** ₱125,450.00\n• **GCash Wallet:** ₱8,320.50\n• **BDO Checking:** ₱45,000.00\n\nTotal cash reserves: **₱178,770.50**.",
      status: "completed",
      createdAt: "2026-08-24T11:20:00.000Z",
    },
  ],
};

function generateAssistantResponse(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (
    lower.includes("budget") ||
    lower.includes("grocer") ||
    lower.includes("din") ||
    lower.includes("spend")
  ) {
    return (
      "Here is a summary of your August spending:\n\n" +
      "• **Groceries:** ₱12,450 spent of ₱15,000 budget (83%)\n" +
      "• **Dining & Food:** ₱6,800 spent of ₱8,000 budget (85%)\n" +
      "• **Utilities & Bills:** ₱4,500 spent of ₱6,000 budget (75%)\n\n" +
      "You have **₱3,750** remaining buffer across your active budgets. Overall, your spending pace is steady and controlled."
    );
  }
  if (
    lower.includes("debt") ||
    lower.includes("card") ||
    lower.includes("citi") ||
    lower.includes("loan")
  ) {
    return (
      "Your current debt record shows a **Citibank Card** balance of **₱12,500.00**.\n\n" +
      "With the **debt avalanche** method, prioritizing extra payments to this balance eliminates the highest interest rate first and saves the most on total charges."
    );
  }
  if (
    lower.includes("balance") ||
    lower.includes("cash") ||
    lower.includes("account") ||
    lower.includes("saving") ||
    lower.includes("worth")
  ) {
    return (
      "Here is your liquid balance overview:\n\n" +
      "• **BPI Savings:** ₱125,450.00\n" +
      "• **GCash Wallet:** ₱8,320.50\n" +
      "• **BDO Checking:** ₱45,000.00\n" +
      "• **Citibank Card:** -₱12,500.00\n\n" +
      "**Net Liquid Position:** ₱166,270.50."
    );
  }
  return (
    "I reviewed your development records. Your accounts, categories, and budgets are synced locally. " +
    "Let me know if you would like to inspect a category, check budget pacing, or plan for an upcoming financial goal!"
  );
}

// 2. Preferences API
export async function getDummyAssistantPreferences(): Promise<AssistantPreferences> {
  return { ...dummyPreferences };
}

export async function updateDummyAssistantPreferences(
  update: AssistantPreferenceUpdate,
): Promise<AssistantPreferences> {
  if ("consented" in update && update.consented) {
    dummyPreferences = {
      ...dummyPreferences,
      consentedAt: new Date().toISOString(),
      consentVersion: CURRENT_CONSENT_VERSION,
    };
  } else if ("assistantName" in update && "userPreferredName" in update) {
    dummyPreferences = {
      ...dummyPreferences,
      assistantName: update.assistantName,
      userPreferredName: update.userPreferredName,
    };
  } else if ("responseDetail" in update && "coachingStyle" in update) {
    dummyPreferences = {
      ...dummyPreferences,
      responseDetail: update.responseDetail,
      coachingStyle: update.coachingStyle,
    };
  }
  return { ...dummyPreferences };
}

// 3. Memory API
export async function getDummyAssistantMemoryPreferences(): Promise<AssistantMemoryPreferences> {
  return { ...dummyMemoryPreferences };
}

export async function updateDummyAssistantMemoryPreferences(input: {
  debtStrategy: "avalanche" | "snowball" | null;
}): Promise<AssistantMemoryPreferences> {
  dummyMemoryPreferences = {
    ...dummyMemoryPreferences,
    debtStrategy: input.debtStrategy,
  };
  return { ...dummyMemoryPreferences };
}

export async function getDummyAssistantMemory(): Promise<AssistantMemory[]> {
  return [...dummyMemories];
}

export async function clearDummyAssistantMemory(): Promise<void> {
  dummyMemories = [];
}

// 4. Threads & Messages API
export async function listDummyAssistantThreads(
  query: { cursor?: string; limit?: number } = {},
): Promise<AssistantThreadPage> {
  const limit = query.limit ?? 20;
  const items = dummyThreads.slice(0, limit);
  return {
    items,
    nextCursor: null,
  };
}

export async function listDummyAssistantMessages(
  threadId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<AssistantWireMessagePage> {
  const limit = query.limit ?? 50;
  const allMessages = dummyMessages[threadId] ?? [];
  return {
    items: allMessages.slice(-limit),
    nextCursor: null,
  };
}

export async function createDummyAssistantThreadTurn(
  input: AssistantMessageInput,
): Promise<AssistantWireTurnResult> {
  const threadId = generateUuid();
  const now = new Date().toISOString();
  const title = input.message.length > 40 ? input.message.slice(0, 37) + "…" : input.message;
  const kind = input.kind ?? "text";

  const thread: AssistantThread = {
    id: threadId,
    title,
    kind,
    lastMessageAt: now,
    createdAt: now,
  };

  const userMessage: AssistantWireMessage = {
    id: generateUuid(),
    threadId,
    role: "user",
    content: input.message,
    status: "completed",
    createdAt: now,
  };

  const assistantMessage: AssistantWireMessage = {
    id: generateUuid(),
    threadId,
    role: "assistant",
    content: generateAssistantResponse(input.message),
    status: "completed",
    createdAt: new Date(Date.now() + 100).toISOString(),
  };

  dummyThreads = [thread, ...dummyThreads];
  dummyMessages[threadId] = [userMessage, assistantMessage];

  return { thread, userMessage, assistantMessage };
}

export async function sendDummyAssistantTurn(
  threadId: string,
  input: AssistantMessageInput,
): Promise<AssistantWireTurnResult> {
  const existingThread = dummyThreads.find((t) => t.id === threadId);
  const now = new Date().toISOString();

  const userMessage: AssistantWireMessage = {
    id: generateUuid(),
    threadId,
    role: "user",
    content: input.message,
    status: "completed",
    createdAt: now,
  };

  const assistantMessage: AssistantWireMessage = {
    id: generateUuid(),
    threadId,
    role: "assistant",
    content: generateAssistantResponse(input.message),
    status: "completed",
    createdAt: new Date(Date.now() + 100).toISOString(),
  };

  const currentMessages = dummyMessages[threadId] ?? [];
  dummyMessages[threadId] = [...currentMessages, userMessage, assistantMessage];

  let thread: AssistantThread;
  if (existingThread) {
    thread = { ...existingThread, lastMessageAt: assistantMessage.createdAt };
    dummyThreads = dummyThreads.map((t) => (t.id === threadId ? thread : t));
  } else {
    thread = {
      id: threadId,
      title: input.message.slice(0, 40),
      kind: input.kind ?? "text",
      lastMessageAt: assistantMessage.createdAt,
      createdAt: now,
    };
    dummyThreads = [thread, ...dummyThreads];
  }

  return { thread, userMessage, assistantMessage };
}

export async function deleteDummyAssistantThread(threadId: string): Promise<void> {
  dummyThreads = dummyThreads.filter((t) => t.id !== threadId);
  delete dummyMessages[threadId];
}

export async function deleteAllDummyAssistantThreads(): Promise<void> {
  dummyThreads = [];
  dummyMessages = {};
}

// 5. Voice Preferences & Audio API
export async function getDummyAssistantVoicePreferences(): Promise<AssistantVoicePreferences> {
  return { ...dummyVoicePreferences };
}

export async function grantDummyAssistantVoiceConsent(): Promise<AssistantVoicePreferences> {
  dummyVoicePreferences = {
    ...dummyVoicePreferences,
    consentedAt: new Date().toISOString(),
    consentVersion: CURRENT_ASSISTANT_VOICE_CONSENT_VERSION,
  };
  return { ...dummyVoicePreferences };
}

let dummyVoiceIndex = 0;
const DUMMY_VOICE_PROMPTS = [
  "What is my spending summary for this month?",
  "How much money do I have in my bank accounts?",
  "Review my budget buffer and active spending.",
  "What is my debt payoff strategy?",
];

export async function transcribeDummyVoice(_recording: {
  uri: string;
  mimeType: string;
  fileName: string;
}): Promise<AssistantVoiceTranscription> {
  const text = DUMMY_VOICE_PROMPTS[dummyVoiceIndex % DUMMY_VOICE_PROMPTS.length]!;
  dummyVoiceIndex++;
  return {
    text,
    durationSeconds: 2.5,
    languageCode: "en",
  };
}

// Minimal valid silent MPEG-1 Audio Layer III frame (128 kbps, 44.1 kHz, Stereo)
function createSilentMp3(): Uint8Array {
  const frame = new Uint8Array(418);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x92;
  frame[3] = 0x64;
  return frame;
}

export async function synthesizeDummySpeech(
  _messageId: string,
  _voice: AssistantSpeechVoice,
): Promise<{ bytes: Uint8Array; mimeType: "audio/mpeg" }> {
  return {
    bytes: createSilentMp3(),
    mimeType: "audio/mpeg",
  };
}

export async function previewDummySpeech(
  _voice: AssistantSpeechVoice,
): Promise<{ bytes: Uint8Array; mimeType: "audio/mpeg" }> {
  return {
    bytes: createSilentMp3(),
    mimeType: "audio/mpeg",
  };
}

// 6. Receipt & AI Entry API
export async function getDummyReceiptPreferences(): Promise<ReceiptPreferences> {
  return {
    enabled: true,
    consentedAt: "2026-08-01T00:00:00.000Z",
    consentVersion: 1,
    visionModel: "@cf/meta/llama-3.2-11b-vision-instruct",
  };
}

export async function extractDummyReceipt(): Promise<ReceiptDraft> {
  return {
    merchant: "Metro Supermarket",
    date: new Date().toISOString().slice(0, 10),
    amountMinor: 245000,
    currency: "PHP",
    kind: "expense",
    categoryName: "Groceries",
    rawText:
      "METRO SUPERMARKET\nFresh Produce & Vegetables  950.00\nPantry Staples & Milk      1500.00\nTotal: PHP 2,450.00",
    items: [
      { description: "Fresh Produce & Vegetables", amountMinor: 95000, categoryName: "Groceries" },
      { description: "Pantry Staples & Milk", amountMinor: 150000, categoryName: "Groceries" },
    ],
  };
}

export async function extractDummyVoiceTransaction(): Promise<TransactionVoiceDraft> {
  return {
    transcript: "Spent 250 pesos on lunch at Bistro",
    description: "Lunch at Bistro",
    date: new Date().toISOString().slice(0, 10),
    amountMinor: 25000,
    currency: "PHP",
    kind: "expense",
    categoryName: "Dining & Food",
  };
}
