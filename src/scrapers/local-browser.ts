import { existsSync } from 'fs';
import { resolve } from 'path';
import puppeteer, { Browser } from 'puppeteer';

type LocalBrowserPlatform = 'douyin' | 'xiaohongshu' | 'zhihu' | 'weibo';

export function getLocalBrowserProfileDir(
  platform: LocalBrowserPlatform,
  userId = process.env.USER_ID || 'local'
): string {
  const root = process.env.LOCAL_LOGIN_PROFILE_DIR || './data/browser-profiles';
  return resolve(root, safeFileName(userId), platform);
}

export function hasLocalBrowserProfile(
  platform: LocalBrowserPlatform,
  userId?: string
): boolean {
  return existsSync(getLocalBrowserProfileDir(platform, userId));
}

export async function launchLocalBrowser(
  platform: LocalBrowserPlatform,
  userId?: string
): Promise<Browser> {
  return puppeteer.launch({
    headless: process.env.LOCAL_SCRAPER_HEADLESS === 'true',
    userDataDir: getLocalBrowserProfileDir(platform, userId),
    defaultViewport: { width: 1280, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'local';
}
