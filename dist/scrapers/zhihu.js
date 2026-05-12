import { BaseScraper } from './base.js';
import { logger } from '../utils/logger.js';
import puppeteer from 'puppeteer';
/**
 * 知乎热榜爬虫
 * 使用 Puppeteer 抓取
 */
export class ZhihuScraper extends BaseScraper {
    source = 'zhihu';
    baseUrl = 'https://www.zhihu.com/hot';
    browser = null;
    async scrape() {
        try {
            logger.info('Starting Zhihu Hot scrape...');
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await this.browser.newPage();
            await page.setUserAgent(this.getRandomUserAgent());
            // 访问知乎热榜
            await page.goto(this.baseUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000,
            });
            logger.debug('Zhihu Hot page loaded');
            // 解析热榜内容
            const hotItems = await this.parseHotItems(page);
            await this.browser.close();
            this.browser = null;
            // 转换为标准格式
            const items = hotItems.map((item) => this.convertToContentItem(item));
            // 验证和去重
            const validItems = items.filter((item) => this.validateItem(item));
            const dedupedItems = this.deduplicateByUrl(validItems);
            logger.info(`Zhihu Hot scrape completed: ${dedupedItems.length} items collected`);
            return dedupedItems;
        }
        catch (error) {
            logger.error('Zhihu Hot scrape failed:', error);
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            // 不抛出错误，返回空数组
            return [];
        }
    }
    /**
     * 解析知乎热榜
     */
    async parseHotItems(page) {
        try {
            // 等待内容加载
            await page.waitForSelector('.HotList-list', { timeout: 10000 });
            return page.evaluate(() => {
                const items = [];
                const sections = document.querySelectorAll('.HotList-list section');
                sections.forEach((section) => {
                    try {
                        // 标题和链接
                        const titleElement = section.querySelector('.HotItem-title a');
                        if (!titleElement)
                            return;
                        const title = titleElement.textContent?.trim() || '';
                        const href = titleElement.getAttribute('href') || '';
                        const url = href.startsWith('http') ? href : `https://www.zhihu.com${href}`;
                        // 摘要
                        const excerptElement = section.querySelector('.HotItem-excerpt');
                        const excerpt = excerptElement ? excerptElement.textContent?.trim() || '' : '';
                        // 热度
                        const heatElement = section.querySelector('.HotItem-metrics');
                        const heat = heatElement ? heatElement.textContent?.trim() || '' : '';
                        if (title && url) {
                            items.push({
                                title,
                                url,
                                excerpt,
                                heat,
                            });
                        }
                    }
                    catch (error) {
                        console.error('Error parsing Zhihu item:', error);
                    }
                });
                return items;
            });
        }
        catch (error) {
            logger.error('Failed to parse Zhihu hot items:', error);
            return [];
        }
    }
    /**
     * 转换为标准格式
     */
    convertToContentItem(item) {
        const content = item.excerpt || item.title;
        return {
            source: 'zhihu',
            title: item.title,
            content: this.cleanContent(content),
            url: item.url,
            publishedAt: new Date(), // 知乎热榜没有时间戳
            metrics: {
                // 热度值通常是 "XXX 万热度" 格式
                points: this.parseHeat(item.heat),
            },
            collectedAt: new Date(),
        };
    }
    /**
     * 解析热度值
     */
    parseHeat(heat) {
        if (!heat)
            return undefined;
        const match = heat.match(/([\d.]+)\s*万/);
        if (match) {
            return Math.floor(parseFloat(match[1]) * 10000);
        }
        const numMatch = heat.match(/[\d,]+/);
        if (numMatch) {
            return parseInt(numMatch[0].replace(/,/g, ''), 10);
        }
        return undefined;
    }
}
//# sourceMappingURL=zhihu.js.map