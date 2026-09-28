import type { Debt, FinancialGoal } from "@zoption/shared";
import { describe, expect, it, vi } from "vitest";

import type { DebtRepository } from "../src/db/debts";
import type { FinancialGoalRepository } from "../src/db/goals";
import {
  AUTHORIZATION,
  TENANT_ID,
  createSubscriptionStore,
  createCalendarEventStore,
  createAppWithFakes,
  privateHeaders,
} from "./helpers/app-fakes";

describe("API foundation", () => {
  it("lists, creates, and updates subscriptions for the resolved tenant", async () => {
    const subscriptions = createSubscriptionStore();
    const app = createAppWithFakes({ subscriptions });

    const listResponse = await app.request("/api/app/subscriptions?month=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(200);
    expect(subscriptions.list).toHaveBeenCalledWith(undefined, TENANT_ID, "2026-07-01");

    const createResponse = await app.request("/api/app/subscriptions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "Music streaming",
        amountMinor: 199_00,
        billingCycle: "monthly",
        nextBillingDate: "2026-07-25",
        categoryId: "food",
        accountId: "account-bank",
      }),
    });
    expect(createResponse.status).toBe(201);
    expect(subscriptions.create).toHaveBeenCalledWith(undefined, TENANT_ID, {
      name: "Music streaming",
      amountMinor: 199_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-07-25",
      categoryId: "food",
      accountId: "account-bank",
    });

    const statusResponse = await app.request("/api/app/subscriptions/subscription-1/status", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "canceled" }),
    });
    expect(statusResponse.status).toBe(200);
    expect(subscriptions.setStatus).toHaveBeenCalledWith(undefined, TENANT_ID, "subscription-1", {
      status: "canceled",
    });

    const updateResponse = await app.request("/api/app/subscriptions/subscription-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "Music streaming Plus",
        amountMinor: 249_00,
        billingCycle: "monthly",
        nextBillingDate: "2026-07-25",
        categoryId: "food",
        accountId: "account-bank",
      }),
    });
    expect(updateResponse.status).toBe(200);
    expect(subscriptions.update).toHaveBeenCalledWith(undefined, TENANT_ID, "subscription-1", {
      name: "Music streaming Plus",
      amountMinor: 249_00,
      billingCycle: "monthly",
      nextBillingDate: "2026-07-25",
      categoryId: "food",
      accountId: "account-bank",
    });

    const deleteResponse = await app.request("/api/app/subscriptions/subscription-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(subscriptions.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "subscription-1");
  });

  it("rejects invalid subscription months and fields before repository access", async () => {
    const subscriptions = createSubscriptionStore();
    const app = createAppWithFakes({ subscriptions });

    const listResponse = await app.request("/api/app/subscriptions?month=2026-07-02", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(400);
    expect(subscriptions.list).not.toHaveBeenCalled();

    const createResponse = await app.request("/api/app/subscriptions", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: "Invalid",
        amountMinor: 0,
        billingCycle: "weekly",
        nextBillingDate: "2026-02-30",
        categoryId: "food",
      }),
    });
    expect(createResponse.status).toBe(400);
    expect(subscriptions.create).not.toHaveBeenCalled();
  });

  it("lists, creates, updates, and deletes events for the resolved tenant", async () => {
    const events = createCalendarEventStore();
    const app = createAppWithFakes({ events });

    const listResponse = await app.request("/api/app/events?month=2026-07-01", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(200);
    expect(events.list).toHaveBeenCalledWith(undefined, TENANT_ID, { month: "2026-07-01" });

    const input = {
      title: "Dentist",
      date: "2026-07-22",
      startTime: "09:30",
      endTime: "10:15",
      notes: "Bring insurance card",
    };
    const createResponse = await app.request("/api/app/events", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
    });
    expect(createResponse.status).toBe(201);
    expect(events.create).toHaveBeenCalledWith(undefined, TENANT_ID, input);

    const updateResponse = await app.request("/api/app/events/event-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ title: "Dental appointment" }),
    });
    expect(updateResponse.status).toBe(200);
    expect(events.update).toHaveBeenCalledWith(undefined, TENANT_ID, "event-1", {
      title: "Dental appointment",
    });

    const deleteResponse = await app.request("/api/app/events/event-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(events.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "event-1");
  });

  it("rejects invalid event months and fields before repository access", async () => {
    const events = createCalendarEventStore();
    const app = createAppWithFakes({ events });

    const listResponse = await app.request("/api/app/events?month=2026-07-02", {
      headers: AUTHORIZATION,
    });
    expect(listResponse.status).toBe(400);
    expect(events.list).not.toHaveBeenCalled();

    const createResponse = await app.request("/api/app/events", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        title: "Invalid event",
        date: "2026-07-22",
        endTime: "10:00",
      }),
    });
    expect(createResponse.status).toBe(400);
    expect(events.create).not.toHaveBeenCalled();

    const updateResponse = await app.request("/api/app/events/event-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    expect(updateResponse.status).toBe(400);
    expect(events.update).not.toHaveBeenCalled();
  });

  it("supports tenant-scoped financial goal CRUD", async () => {
    const goal: FinancialGoal = {
      id: "goal-1",
      name: "Emergency fund",
      targetAmountMinor: 120_000_00,
      currentAmountMinor: 30_000_00,
      targetDate: "2027-08-01",
      status: "active",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const goals = {
      list: vi.fn(async () => [goal]),
      create: vi.fn(async () => goal),
      update: vi.fn(async () => ({ ...goal, status: "paused" as const })),
      remove: vi.fn(async () => undefined),
    } satisfies FinancialGoalRepository;
    const app = createAppWithFakes({ goals });

    const listResponse = await app.request("/api/app/goals", { headers: AUTHORIZATION });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ items: [goal] });
    expect(goals.list).toHaveBeenCalledWith(undefined, TENANT_ID);

    const createInput = {
      name: goal.name,
      targetAmountMinor: goal.targetAmountMinor,
      currentAmountMinor: goal.currentAmountMinor,
      targetDate: goal.targetDate,
      status: goal.status,
    };
    const createResponse = await app.request("/api/app/goals", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(createInput),
    });
    expect(createResponse.status).toBe(201);
    expect(goals.create).toHaveBeenCalledWith(undefined, TENANT_ID, createInput);

    const updateResponse = await app.request("/api/app/goals/goal-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "paused" }),
    });
    expect(updateResponse.status).toBe(200);
    expect(goals.update).toHaveBeenCalledWith(undefined, TENANT_ID, "goal-1", {
      status: "paused",
    });

    const deleteResponse = await app.request("/api/app/goals/goal-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(goals.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "goal-1");
  });

  it("supports tenant-scoped debt CRUD and rejects invalid inputs", async () => {
    const debt: Debt = {
      id: "debt-1",
      name: "Main card",
      type: "credit_card",
      balanceMinor: 45_000_00,
      aprBasisPoints: 1800,
      minimumPaymentMinor: 2_500_00,
      balanceAsOf: "2026-08-01",
      status: "active",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const debts = {
      list: vi.fn(async () => [debt]),
      create: vi.fn(async () => debt),
      update: vi.fn(async () => ({ ...debt, status: "paid" as const })),
      remove: vi.fn(async () => undefined),
    } satisfies DebtRepository;
    const app = createAppWithFakes({ debts });

    const listResponse = await app.request("/api/app/debts", { headers: AUTHORIZATION });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ items: [debt] });

    const invalidResponse = await app.request("/api/app/debts", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: "Incomplete debt" }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(debts.create).not.toHaveBeenCalled();

    const createInput = {
      name: debt.name,
      type: debt.type,
      balanceMinor: debt.balanceMinor,
      aprBasisPoints: debt.aprBasisPoints,
      minimumPaymentMinor: debt.minimumPaymentMinor,
      balanceAsOf: debt.balanceAsOf,
      status: debt.status,
    };
    const createResponse = await app.request("/api/app/debts", {
      method: "POST",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(createInput),
    });
    expect(createResponse.status).toBe(201);
    expect(debts.create).toHaveBeenCalledWith(undefined, TENANT_ID, createInput);

    const updateResponse = await app.request("/api/app/debts/debt-1", {
      method: "PATCH",
      headers: privateHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "paid", balanceMinor: 0 }),
    });
    expect(updateResponse.status).toBe(200);
    expect(debts.update).toHaveBeenCalledWith(undefined, TENANT_ID, "debt-1", {
      status: "paid",
      balanceMinor: 0,
    });

    const deleteResponse = await app.request("/api/app/debts/debt-1", {
      method: "DELETE",
      headers: AUTHORIZATION,
    });
    expect(deleteResponse.status).toBe(204);
    expect(debts.remove).toHaveBeenCalledWith(undefined, TENANT_ID, "debt-1");
  });
});
