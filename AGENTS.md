# Agent Instructions

## Communication

- Keep changes focused.
- Do not commit secrets, local profiles, logs, databases, or `.env`.
- Prefer existing project patterns over new abstractions.

## Adding A Content Source

When asked to add a website/source, follow `docs/adding-content-source.md`.

Required order:

1. Pick a stable lowercase source id, for example `example-news`.
2. Add `src/scrapers/<source-id>.ts` extending `BaseScraper`.
3. Return normalized `ContentItem[]` from `scrape()`.
4. Export the scraper in `src/scrapers/index.ts`.
5. Register it in `src/aggregator/index.ts`.
6. Add the source id to `src/types/content.ts`.
7. Document the id in `.env.example` and `README.md`.
8. Verify with `npm run build` and a single-source aggregation run.

Do not add a generic crawler that tries to scrape arbitrary pages. Each source should have explicit parsing logic for that site, API, RSS feed, or structured endpoint.
