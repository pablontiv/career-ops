# Design — Computrabajo MX local parser

**Status:** Approved (from spec)
**Design source:** [docs/superpowers/specs/2026-06-08-computrabajo-parser-design.md](../../../docs/superpowers/specs/2026-06-08-computrabajo-parser-design.md)

This design document is a wrapper referencing the approved design spec above. No new product scope is introduced beyond what that spec defines.

## Key design decisions (from spec)

1. **Single-file parser** — `scripts/parsers/computrabajo-mx.mjs`, plain ESM, no framework.
2. **`node-html-parser`** for HTML parsing — lighter than jsdom, no browser needed.
3. **Contract compliance** — JSON array of `{title, url, location, company?}` to stdout; fits `providers/local-parser.mjs` expectations.
4. **Graceful degradation** — any failure prints `[]` to stdout and warns on stderr; `scan.mjs` logs and continues with other sources.
5. **Lazy import** for `node-html-parser` inside try/catch so a missing dependency (after system update) degrades gracefully instead of crashing.
6. **No relevance filtering** in the parser — `scan.mjs`'s `title_filter` and `location_filter` handle downstream filtering.
7. **Anti-bot mitigations** — realistic User-Agent, `Accept-Language: es-MX`, modest pagination (default 2 pages), inter-page delay.

## Integration points

- `providers/local-parser.mjs` — invokes the script via `execFileAsync` and normalizes output.
- `portals.yml` — new `tracked_companies` entry with `scan_method: local_parser` and `parser` config.
- `scan.mjs` — already routes local-parser entries; no code changes needed.
- `test-all.mjs` — new check block for Computrabajo parser existence and contract.