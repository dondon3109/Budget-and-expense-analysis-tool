import {
  assistantAccountBalancesToolSchema,
  assistantBudgetStatusToolSchema,
  assistantBudgetVsActualToolSchema,
  assistantCategoryToolSchema,
  assistantDebtPayoffToolSchema,
  assistantPeriodSummaryToolSchema,
  assistantRecurringChargesToolSchema,
  assistantSavingsGoalToolSchema,
  assistantSpendingAnomaliesToolSchema,
  assistantSpendingByCategoryToolSchema,
  assistantTransactionToolSchema,
} from "@zoption/shared";
import type { z } from "zod";

import type { FinancialReadContext, FinancialReader } from "./financial-reader";
import type { AssistantToolDefinition } from "./provider";

const MAX_TOOL_RESULT_CHARACTERS = 24_000;

const DATE_RANGE_PROPERTIES = {
  from: { type: "string", description: "Trusted ISO start date YYYY-MM-DD" },
  to: { type: "string", description: "Trusted ISO end date YYYY-MM-DD" },
};

export const assistantToolDefinitions: AssistantToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_account_balances",
      description:
        "Get balances calculated from recorded transactions. Optionally select one account by name.",
      parameters: {
        type: "object",
        properties: { accountName: { type: "string", description: "Optional exact account name" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_period_summary",
      description:
        "Get authoritative income, expenses, net, savings rate, monthly averages, and bounded trends for the trusted date range.",
      parameters: {
        type: "object",
        properties: {
          ...DATE_RANGE_PROPERTIES,
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
      name: "get_spending_by_category",
      description:
        "Get deterministic expense totals by category for the trusted date range, optionally for one named category.",
      parameters: {
        type: "object",
        properties: {
          ...DATE_RANGE_PROPERTIES,
          categoryName: { type: "string", description: "Optional exact category name" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_budget_vs_actual",
      description:
        "Compare monthly category budgets with actual recorded spending for the trusted date range.",
      parameters: {
        type: "object",
        properties: DATE_RANGE_PROPERTIES,
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_recurring_charges",
      description:
        "Detect recurring expense patterns and backend-calculated price changes in the trailing 12 months.",
      parameters: {
        type: "object",
        properties: { through: { type: "string", description: "Trusted current ISO date" } },
        required: ["through"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_spending_anomalies",
      description:
        "Detect unusual expenses and category spikes relative to six prior comparable periods.",
      parameters: {
        type: "object",
        properties: DATE_RANGE_PROPERTIES,
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_debt_payoff",
      description:
        "Calculate a deterministic avalanche or snowball payoff projection using saved debts or exact hypothetical debt values.",
      parameters: {
        type: "object",
        properties: {
          strategy: { type: "string", enum: ["avalanche", "snowball"] },
          extraPayment: { type: "string", description: "Optional exact PHP decimal amount" },
          debtNames: { type: "array", items: { type: "string" }, maxItems: 20 },
          debts: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                balance: { type: "string", description: "Exact PHP decimal amount" },
                aprPercent: { type: "number", minimum: 0, maximum: 100 },
                minimumPayment: { type: "string", description: "Exact PHP decimal amount" },
              },
              required: ["name", "balance", "aprPercent", "minimumPayment"],
              additionalProperties: false,
            },
          },
          startDate: { type: "string", description: "Trusted current ISO date" },
        },
        required: ["strategy", "startDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_savings_goal",
      description:
        "Calculate deterministic target-date savings contributions using a saved goal or exact hypothetical values.",
      parameters: {
        type: "object",
        properties: {
          goalName: { type: "string" },
          targetAmount: { type: "string", description: "Exact PHP decimal amount" },
          targetDate: { type: "string", description: "ISO target date" },
          currentSaved: { type: "string", description: "Exact PHP decimal amount" },
          currentDate: { type: "string", description: "Trusted current ISO date" },
        },
        required: ["currentDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_transactions",
      description:
        "List a bounded page of transaction details. Never use these rows to calculate totals.",
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
      description: "List active category names and kinds.",
      parameters: {
        type: "object",
        properties: { kind: { type: "string", enum: ["income", "expense", "transfer"] } },
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

export interface AssistantToolExecution {
  name: string;
  arguments: unknown;
  result: unknown;
  content: string;
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

export async function executeAssistantToolDetailed(
  reader: FinancialReader,
  context: FinancialReadContext,
  name: string,
  rawArguments: string,
  validateArguments?: (name: string, args: unknown) => string | null,
): Promise<AssistantToolExecution> {
  try {
    let args: unknown;
    let result: unknown;
    const validate = (parsed: unknown) => {
      const errorCode = validateArguments?.(name, parsed);
      if (errorCode) throw new AssistantToolError(errorCode);
    };
    switch (name) {
      case "get_account_balances": {
        const parsed = parseWithSchema(assistantAccountBalancesToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.getAccountBalances(context, parsed);
        break;
      }
      case "get_period_summary": {
        const parsed = parseWithSchema(assistantPeriodSummaryToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.getPeriodSummary(context, parsed);
        break;
      }
      case "get_spending_by_category": {
        const parsed = parseWithSchema(assistantSpendingByCategoryToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.getSpendingByCategory(context, parsed);
        break;
      }
      case "get_budget_vs_actual": {
        const parsed = parseWithSchema(assistantBudgetVsActualToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.getBudgetVsActual(context, parsed);
        break;
      }
      case "get_budget_status": {
        const parsed = parseWithSchema(assistantBudgetStatusToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.getBudgetStatus(context, parsed.month);
        break;
      }
      case "detect_recurring_charges": {
        const parsed = parseWithSchema(assistantRecurringChargesToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.detectRecurringCharges(context, parsed.through);
        break;
      }
      case "detect_spending_anomalies": {
        const parsed = parseWithSchema(assistantSpendingAnomaliesToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.detectSpendingAnomalies(context, parsed);
        break;
      }
      case "calculate_debt_payoff": {
        const parsed = parseWithSchema(assistantDebtPayoffToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.calculateDebtPayoff(context, parsed);
        break;
      }
      case "calculate_savings_goal": {
        const parsed = parseWithSchema(assistantSavingsGoalToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.calculateSavingsGoal(context, parsed);
        break;
      }
      case "list_transactions": {
        const parsed = parseWithSchema(assistantTransactionToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.listTransactions(context, parsed);
        break;
      }
      case "list_categories": {
        const parsed = parseWithSchema(assistantCategoryToolSchema, rawArguments);
        args = parsed;
        validate(parsed);
        result = await reader.listCategories(context, parsed.kind);
        break;
      }
      default:
        throw new AssistantToolError("This tool is not available.");
    }
    return { name, arguments: args, result, content: compactResult(result) };
  } catch (error) {
    if (error instanceof AssistantToolError) throw error;
    throw new AssistantToolError("The financial lookup could not be completed.");
  }
}

export async function executeAssistantTool(
  reader: FinancialReader,
  context: FinancialReadContext,
  name: string,
  rawArguments: string,
): Promise<string> {
  return (await executeAssistantToolDetailed(reader, context, name, rawArguments)).content;
}
