import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const baseUrl = (process.env.WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
const outputDirectory = resolve("docs/screenshots");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function capture({ name, path, viewport, heading, fullPage = true }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: heading }).waitFor();
  await page.screenshot({ path: resolve(outputDirectory, name), fullPage });
  await context.close();
  console.log(`✓ ${name}`);
}

try {
  await capture({
    name: "landing-desktop.png",
    path: "/",
    viewport: { width: 1440, height: 1000 },
    heading: "See where your money goes. Decide what comes next.",
  });
  await capture({
    name: "dashboard-desktop.png",
    path: "/demo",
    viewport: { width: 1440, height: 1000 },
    heading: "Your month, at a glance",
  });
  await capture({
    name: "transactions-desktop.png",
    path: "/transactions",
    viewport: { width: 1440, height: 1000 },
    heading: "Transactions",
  });
  await capture({
    name: "dashboard-mobile.png",
    path: "/demo",
    viewport: { width: 390, height: 844 },
    heading: "Your month, at a glance",
  });
  await capture({
    name: "budgets-mobile.png",
    path: "/budgets",
    viewport: { width: 390, height: 844 },
    heading: "Budgets",
  });
} finally {
  await browser.close();
}
