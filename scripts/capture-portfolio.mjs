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
    name: "landing-mobile.png",
    path: "/",
    viewport: { width: 390, height: 844 },
    heading: "See where your money goes. Decide what comes next.",
  });
  await capture({
    name: "login-desktop.png",
    path: "/login",
    viewport: { width: 1440, height: 1000 },
    heading: "Sign in to Clarity",
  });
  await capture({
    name: "signup-mobile.png",
    path: "/signup",
    viewport: { width: 390, height: 844 },
    heading: "Create your Clarity account",
  });
} finally {
  await browser.close();
}
