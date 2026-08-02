import {
  assistantAccountBalancesToolSchema,
  assistantBudgetStatusToolSchema,
  assistantCategoryToolSchema,
  assistantPeriodSummaryToolSchema,
  assistantTransactionToolSchema,
} from "@zoption/shared";
import type { z } from "zod";

import type { FinancialReadContext, FinancialReader } from "./financial-reader";
import type { AssistantToolDefinition } from "./provider";
const MAX_TOOL_RESULT_CHARACTERS = 24_000;

export const assistantToolDefinitions: AssistantToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_account_balances",
      description:
        "Get balances calculated from the user's recorded transactions. Optionally select one account by its name for a balance question.",
      parameters: {
        type: "object",
        properties: {
          accountName: { type: "string", description: "Optional exact account name" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_period_summary",
      description:
        "Get authoritative income, expense, net, category, savings-rate, and monthly trend totals for a date range. Use accountName for named-account spending totals.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO date YYYY-MM-DD" },
          to: { type: "string", description: "ISO date YYYY-MM-DD" },
          accountName: { type: "string", description: "Optional exact account name" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_status",
      description: "Get verified category budget limits and spending for one calendar month.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "First day of month, YYYY-MM-01" },
        },
        required: ["month"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_transactions",
      description:
        "List a bounded page of matching transactions. Do not use this to calculate totals; use get_period_summary for totals.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Optional ISO start date" },
          to: { type: "string", description: "Optional ISO end date" },
          kind: { type: "string", enum: ["income", "expense", "transfer"] },
          categoryName: { type: "string" },
          accountName: { type: "string" },
          search: { type: "string" },
          page: { type: "integer", minimum: 1, maximum: 10, default: 1 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "List the user's active category names and kinds.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["income", "expense", "transfer"] },
        },
        additionalProperties: false,
      },
    },
  },
];

export class AssistantToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantToolError";
  }
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new AssistantToolError("The tool arguments were not valid JSON.");
  }
}

function compactResult(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_TOOL_RESULT_CHARACTERS) {
    throw new AssistantToolError("The tool result was too large. Narrow the request.");
  }
  return serialized;
}

function parseWithSchema<T>(schema: z.ZodType<T>, raw: string): T {
  const parsed = schema.safeParse(parseArguments(raw));
  if (!parsed.success) {
    throw new AssistantToolError("The tool arguments were invalid. Use a narrower valid request.");
  }
  return parsed.data;
}

export async function executeAssistantTool(
  reader: FinancialReader,
  context: FinancialReadContext,
  name: string,
  rawArguments: string,
): Promise<string> {
  try {
    switch (name) {
      case "get_account_balances": {
        const input = parseWithSchema(assistantAccountBalancesToolSchema, rawArguments);
        return compactResult(await reader.getAccountBalances(context, input));
      }
      case "get_period_summary": {
        const input = parseWithSchema(assistantPeriodSummaryToolSchema, rawArguments);
        return compactResult(await reader.getPeriodSummary(context, input));
      }
      case "get_budget_status": {
        const input = parseWithSchema(assistantBudgetStatusToolSchema, rawArguments);
        return compactResult(await reader.getBudgetStatus(context, input.month));
      }
      case "list_transactions": {
        const input = parseWithSchema(assistantTransactionToolSchema, rawArguments);
        return compactResult(await reader.listTransactions(context, input));
      }
      case "list_categories": {
        const input = parseWithSchema(assistantCategoryToolSchema, rawArguments);
        return compactResult(await reader.listCategories(context, input.kind));
      }
      default:
        throw new AssistantToolError("This tool is not available.");
    }
  } catch (error) {
    if (error instanceof AssistantToolError) throw error;
    throw new AssistantToolError(
      error instanceof Error ? error.message : "The tool could not run.",
    );
  }
}
