# Adding A Content Source

This project uses explicit source scrapers. Each source owns its own fetching, parsing, cleanup, and normalization.

## Runtime Flow

1. `src/config.ts` reads `ENABLED_SOURCES`.
2. `src/aggregator/index.ts` maps each source id to a scraper.
3. Each scraper extends `BaseScraper` and returns `ContentItem[]`.
4. The aggregator deduplicates and writes items into `content_pool`.
5. The filter, generator, and Feishu push layers consume normalized database records.

## Source Contract

Every scraper must return items shaped like this:

```ts
{
  source: 'source-id',
  title: 'Readable title',
  content: 'Useful summary or body text',
  url: 'https://example.com/item',
  author: 'optional author',
  publishedAt: new Date(),
  metrics: {},
  collectedAt: new Date(),
}
```

Required fields: `source`, `title`, `content`, `url`, `publishedAt`, `collectedAt`.

## Implementation Steps

1. Create `src/scrapers/<source-id>.ts`.
2. Extend `BaseScraper`.
3. Set:

```ts
protected source = '<source-id>';
protected baseUrl = 'https://example.com';
```

4. Implement `scrape(): Promise<ContentItem[]>`.
5. Use `fetchWithRetry()` for HTTP requests.
6. Use `cleanContent()`, `stripHtml()`, and `validateItem()`.
7. Deduplicate inside the scraper with `deduplicateByUrl()` if one request can return duplicates.
8. Export the scraper from `src/scrapers/index.ts`.
9. Register it in `src/aggregator/index.ts`:

```ts
['source-id', () => new SourceIdScraper(this.rateLimiter)]
```

10. Add the source id to the `ContentItem.source` union in `src/types/content.ts`.
11. Add the source id to `.env.example` and README examples.

## Verification

Run:

```bash
npm run build
```

Then test only the new source with a temporary database:

```bash
DB_PATH=/tmp/x-content-scout-source-test.db \
ENABLED_SOURCES=source-id \
npx tsx src/workflow.ts
```

Expected result:

- The new scraper appears in logs.
- It collects at least one item, unless the target site has no fresh content.
- No item fails `validateItem()`.
- The workflow does not crash if the source times out or returns no items.

## Agent Prompt Template

Use this prompt with a coding agent:

```text
Add a new content source to this repo for <site name>. Follow AGENTS.md and docs/adding-content-source.md exactly. Use source id <source-id>. Implement the scraper, register it, update config docs, and verify with npm run build plus a single-source run.
```

## Rules

- Do not hardcode private cookies, tokens, or account-specific values.
- If a site needs auth, read credentials from environment variables.
- If the site has an RSS/API endpoint, prefer that over browser scraping.
- If browser scraping is unavoidable, keep it isolated inside that scraper.
- Do not make unrelated changes to ranking, generation, Feishu cards, or profile logic.
