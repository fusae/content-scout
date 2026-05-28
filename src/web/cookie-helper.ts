import { mkdirSync } from 'fs';
import { resolve } from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../utils/logger.js';
import { localBrowserLaunchOptions } from '../utils/browser-launcher.js';

export type CookiePlatform = 'douyin' | 'xiaohongshu' | 'zhihu' | 'weibo';

type BrowserCookie = Awaited<ReturnType<Page['cookies']>>[number];

interface PlatformLoginConfig {
  label: string;
  url: string;
  cookieUrls: string[];
  loggedInSelectors: string[];
}

interface LoginOptions {
  userId: string;
  timeoutMs?: number;
}

const PLATFORM_CONFIGS: Record<CookiePlatform, PlatformLoginConfig> = {
  douyin: {
    label: '抖音',
    url: 'https://www.douyin.com/',
    cookieUrls: [
      'https://www.douyin.com/',
      'https://douyin.com/',
      'https://sso.douyin.com/',
      'https://login.douyin.com/',
    ],
    loggedInSelectors: [
      '[data-e2e="user-avatar"]',
      '[data-e2e="homepage-avatar"]',
      'a[href*="/user/"] img',
    ],
  },
  xiaohongshu: {
    label: '小红书',
    url: 'https://www.xiaohongshu.com/search_result?keyword=AI&source=web_search_result_notes',
    cookieUrls: [
      'https://www.xiaohongshu.com/',
      'https://edith.xiaohongshu.com/',
    ],
    loggedInSelectors: [
      'section.note-item',
      'a[href*="/explore/"]',
      'a[href*="/user/profile/"]',
    ],
  },
  zhihu: {
    label: '知乎',
    url: 'https://www.zhihu.com/signin',
    cookieUrls: [
      'https://www.zhihu.com/',
      'https://www.zhihu.com/signin',
    ],
    loggedInSelectors: [
      '.AppHeader-profile',
      'button.AppHeader-profileEntry',
      'a[href*="/people/"]',
    ],
  },
  weibo: {
    label: '微博',
    url: 'https://s.weibo.com/weibo?q=AI%E5%B7%A5%E5%85%B7',
    cookieUrls: [
      'https://weibo.com/',
      'https://s.weibo.com/',
      'https://passport.weibo.com/',
      'https://login.sina.com.cn/',
    ],
    loggedInSelectors: [
      '[action-type="feed_list_item"]',
      '.card-wrap',
      'a[href*="/u/"]',
      'a[href*="/profile"]',
    ],
  },
};

export function isCookiePlatform(value: string): value is CookiePlatform {
  return value === 'douyin' || value === 'xiaohongshu' || value === 'zhihu' || value === 'weibo';
}

export class CookieHelper {
  private browsers = new Set<Browser>();

  async launchLoginWindow(platform: CookiePlatform, options: LoginOptions): Promise<string> {
    const platformConfig = PLATFORM_CONFIGS[platform];
    const userDataDir = this.getUserDataDir(options.userId, platform);
    mkdirSync(userDataDir, { recursive: true });

    const browser = await puppeteer.launch(localBrowserLaunchOptions(userDataDir));
    this.browsers.add(browser);

    try {
      const page = await browser.newPage();
      await page.goto(platformConfig.url, { waitUntil: 'domcontentloaded' });

      const currentCookies = await this.collectCookies(page, platform);
      if (await this.hasLoginState(page, platform, currentCookies)) {
        logger.info(`${platformConfig.label} existing login state found for user ${options.userId}`);
        return this.toCookieString(currentCookies);
      }

      logger.info(`Opened ${platformConfig.label} login window for user ${options.userId}`);
      const cookies = await this.waitForLogin(page, browser, platform, options.timeoutMs);
      logger.info(`${platformConfig.label} login completed for user ${options.userId}`);
      return this.toCookieString(cookies);
    } finally {
      this.browsers.delete(browser);
      await browser.close().catch(() => undefined);
    }
  }

  private async waitForLogin(
    page: Page,
    browser: Browser,
    platform: CookiePlatform,
    timeoutMs = 5 * 60 * 1000
  ): Promise<BrowserCookie[]> {
    const startedAt = Date.now();
    let checkCount = 0;

    while (Date.now() - startedAt < timeoutMs) {
      if (!browser.isConnected()) {
        throw new Error('Browser was closed by user');
      }

      const cookies = await this.collectCookies(page, platform);
      checkCount += 1;

      if (checkCount % 10 === 0) {
        const names = cookies.map((cookie) => `${cookie.name}(${cookie.value.length})`).join(', ');
        logger.info(`[${platform} login check ${checkCount}] cookies: ${names}`);
      }

      if (await this.hasLoginState(page, platform, cookies)) {
        return cookies;
      }

      await this.sleep(2000);
    }

    const cookies = await this.collectCookies(page, platform);
    const names = cookies.map((cookie) => `${cookie.name}(${cookie.value.length})`).join(', ');
    logger.error(`${platform} login timeout. Final cookies: ${names}`);
    throw new Error('Login timeout: user did not complete login within 5 minutes');
  }

  private async collectCookies(page: Page, platform: CookiePlatform): Promise<BrowserCookie[]> {
    const allCookies = await Promise.all(
      PLATFORM_CONFIGS[platform].cookieUrls.map((url) => page.cookies(url).catch(() => []))
    );
    const byKey = new Map<string, BrowserCookie>();

    for (const cookie of allCookies.flat()) {
      byKey.set(`${cookie.domain}:${cookie.path}:${cookie.name}`, cookie);
    }

    return Array.from(byKey.values());
  }

  private async hasLoginState(
    page: Page,
    platform: CookiePlatform,
    cookies: BrowserCookie[]
  ): Promise<boolean> {
    if (platform === 'weibo' && /passport\.weibo\.com|\/login\.php/.test(page.url())) {
      return false;
    }

    if (platform === 'xiaohongshu') {
      return this.hasRequiredCookies(cookies, platform) && this.hasLoggedInSelector(page, platform);
    }

    if (this.hasRequiredCookies(cookies, platform)) {
      if (platform === 'douyin' || platform === 'zhihu') {
        return true;
      }

      return this.hasLoggedInSelector(page, platform);
    }

    return this.hasLoggedInSelector(page, platform);
  }

  private async hasLoggedInSelector(page: Page, platform: CookiePlatform): Promise<boolean> {
    if (platform === 'xiaohongshu') {
      const text = await page.evaluate(() => document.body.innerText || '').catch(() => '');
      if (/登录后查看搜索结果|手机号登录|扫码|获取验证码/.test(text)) {
        return false;
      }
    }

    for (const selector of PLATFORM_CONFIGS[platform].loggedInSelectors) {
      if (await page.$(selector).catch(() => null)) {
        return true;
      }
    }

    return false;
  }

  private hasRequiredCookies(cookies: BrowserCookie[], platform: CookiePlatform): boolean {
    const hasCookie = (names: string[]): boolean =>
      cookies.some((cookie) => names.includes(cookie.name) && cookie.value.length > 10);

    switch (platform) {
      case 'douyin':
        return hasCookie(['sessionid', 'sessionid_ss', 'sid_guard']) ||
          hasCookie(['passport_auth_status', 'passport_auth_status_ss']) ||
          (hasCookie(['uid_tt', 'uid_tt_ss']) && hasCookie(['sid_tt']));
      case 'xiaohongshu':
        return hasCookie(['web_session']);
      case 'zhihu':
        return hasCookie(['z_c0']);
      case 'weibo':
        return hasCookie(['SUB']);
    }
  }

  private toCookieString(cookies: BrowserCookie[]): string {
    const byName = new Map<string, string>();
    for (const cookie of cookies) {
      if (cookie.value) {
        byName.set(cookie.name, cookie.value);
      }
    }

    return Array.from(byName.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private getUserDataDir(userId: string, platform: CookiePlatform): string {
    const root = process.env.LOCAL_LOGIN_PROFILE_DIR || './data/browser-profiles';
    return resolve(root, this.safeFileName(userId), platform);
  }

  private safeFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_') || 'local';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
  }

  async close(): Promise<void> {
    await Promise.all(
      Array.from(this.browsers).map((browser) => browser.close().catch(() => undefined))
    );
    this.browsers.clear();
  }
}
