import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { Settings } from '../src/shared/settings';

export const EXTENSION_PATH = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));
export const TEST_PAGE = 'http://127.0.0.1:4173/';

/** Extensions only load in Playwright's bundled Chromium, through a persistent context. */
export async function launchWithExtension(): Promise<{ context: BrowserContext; sw: Worker; extensionId: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(sw.url()).host;
  await waitForRegistration(sw, 2);
  // Close the welcome tab opened on install.
  for (const page of context.pages()) if (page.url().includes('options.html')) await page.close();
  return { context, sw, extensionId };
}

export async function waitForRegistration(sw: Worker, count: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const n = await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length);
    if (n === count) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`content scripts not registered (wanted ${count})`);
}

export async function setSettings(sw: Worker, patch: Partial<Settings>): Promise<void> {
  await sw.evaluate(async (p) => {
    const key = 'sukoon:settings';
    const current = (await chrome.storage.local.get(key))[key] ?? {};
    await chrome.storage.local.set({ [key]: { ...current, ...p } });
  }, patch);
}

export async function tabIdOf(sw: Worker, url: string): Promise<number> {
  return sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u + '*' });
    return tab!.id!;
  }, url);
}

export const test = base.extend<{ context: BrowserContext; sw: Worker; extensionId: string; page: Page }>({
  context: async ({}, use) => {
    const { context } = await launchWithExtension();
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    await use(context.serviceWorkers()[0]!);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

export const expect = test.expect;
