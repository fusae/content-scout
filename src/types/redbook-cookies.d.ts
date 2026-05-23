declare module '@lucasygu/redbook/cookies' {
  export interface XhsCookies {
    a1: string;
    web_session: string;
    webId: string;
    [key: string]: string;
  }

  export type CookieSource = 'chrome' | 'safari' | 'firefox';

  export function parseCookieString(cookieString: string): XhsCookies;
  export function extractCookies(source?: CookieSource, chromeProfile?: string): Promise<XhsCookies>;
  export function cookiesToString(cookies: XhsCookies): string;
}
