# Tasks — Computrabajo MX local parser

**Change:** `computrabajo-mx-local-parser`
**Design source:** `docs/superpowers/specs/2026-06-08-computrabajo-parser-design.md`
**Phase:** tasks → apply

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 170–230 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (well under budget) |

---

```
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low
```

---

## Task List

### Task 1 — Confirm Computrabajo MX search URL pattern

- [x] **Discrete discovery task** — before writing parser code, confirm the remote-filtered search URL pattern that Computrabajo MX currently uses (CONFIRMED 2026-06-08: SSR HTTP 200, 20 `article.box_offer` cards/page; remote URL `/trabajo-de-{kw}-en-teletrabajo`, pagination `?p=N`)
- Verify that `https://mx.computrabajo.com/empleos?qs=.net&q=&loc=Teletrabajo` (or equivalent) returns server-rendered HTML with `article.box_offer` cards
- Verify that pagination uses `?p=N` or documented query param
- Document the confirmed URL template in a comment at the top of the parser script
- **If the URL pattern has changed** since the spec was written, adjust keyword→URL mapping accordingly (no scope expansion — just align with reality)
- **Stop rule:** if Computrabajo now requires JavaScript rendering for search pages, halt and escalate; the design assumes SSR HTML

### Task 2 — Add `node-html-parser` dependency

- [x] Add `node-html-parser` to `package.json` dependencies (`^7.1.0`)
- [x] Run `npm install` to update `package-lock.json` (resolved 7.1.0)
- **Estimated lines:** 2 changed (`package.json` + lockfile)
- **Stop rule:** do not add any other dependencies

### Task 3 — Create `scripts/parsers/computrabajo-mx.mjs`

- [x] Create `scripts/parsers/computrabajo-mx.mjs` as a single ESM file
- Implementation must follow the design spec:
  - Parse CLI args: `--pages N` (default 2) and optional `--keywords a,b,c`; default keywords map to Computrabajo remote search URLs for `.net`, `backend`, `full-stack`, `devops` (post-review: `c#` omitted because `c-sharp`/encoded path probes were not reliable/useful enough; `.net` preserves the approved .NET intent)
  - For each `(searchUrl, page)`: `fetch` with realistic browser `User-Agent` and `Accept-Language: es-MX`; parse HTML with `node-html-parser`; select `article.box_offer` cards
  - Per card: extract **title + url** from `h2 a.js-o-link[href^="/ofertas-de-trabajo/"]`, **company** from `a[offer-grid-article-company-url]` (optional), **location** from the card's location node
  - Resolve relative URLs against `https://mx.computrabajo.com`
  - Decode HTML entities
  - Dedup by `data-id` (or normalized URL) across all pages/keywords
  - Add a small inter-page delay (~300ms) between fetches
  - On network/non-200/parse/import failure: print `[]` to stdout, warn on stderr, exit 0; on zero cards, treat page > 1 as pagination exhaustion, continue past sparse first-page keywords, and print `[]` only when all attempted keywords produce no parseable jobs
  - Lazy-`import()` `node-html-parser` inside try/catch so a missing dependency degrades gracefully
- **Estimated lines:** ~130–170
- **Stop rule:** do not add Playwright, do not add per-URL liveness checks, do not filter by relevance inside the parser

### Task 4 — Add Computrabajo MX entry to `portals.yml`

- [x] Add a `tracked_companies` entry per the design spec:
  ```yaml
  - name: Computrabajo MX
    careers_url: https://mx.computrabajo.com
    scan_method: local_parser
    parser:
      command: node
      script: scripts/parsers/computrabajo-mx.mjs
      args: ["--pages", "2"]
      timeout_ms: 20000
    enabled: true
  ```
- [x] Add `"Teletrabajo"` to `location_filter.allow` (alongside existing `"Remoto"`)
- **Estimated lines:** ~12
- **Stop rule:** do not modify any other tracked_companies entries; do not change `title_filter`

### Task 5 — Add test checks in `test-all.mjs`

- [x] Add a check block in `test-all.mjs` under the scan/general section that verifies:
  1. `scripts/parsers/computrabajo-mx.mjs` exists
  2. The script is syntactically valid (can be `import`ed or `--check`'d without runtime error)
  3. If user-layer `portals.yml` exists, it contains a `Computrabajo MX` entry with `scan_method: local_parser`
  4. If user-layer `portals.yml` exists, its `location_filter.allow` includes `"Teletrabajo"`
  5. If user-layer `portals.yml` exists, the entry has `parser.command` = `node` and `parser.script` = `scripts/parsers/computrabajo-mx.mjs`; if absent, warn/skip so clean CI does not depend on ignored user data
- Follow the existing `test-all.mjs` pattern (check functions using `fileExists`, `readFile`, string includes)
- **Estimated lines:** ~20–30
- **Stop rule:** do not add integration tests that require network access to Computrabajo

### Task 6 — Verify standalone parser output

- [x] Run `node scripts/parsers/computrabajo-mx.mjs --pages 1` and confirm: (26 jobs, all absolute URLs, 18/26 remote-labeled, exit 0)
  - Prints a JSON array to stdout
  - Each entry has `title`, `url` (absolute), and `location`
  - At least some remote cards carry `"Teletrabajo"` or `"Remoto"` in location
  - Exit code is 0
- [x] Simulate failure: run with an invalid keyword or unreachable URL override (or temporarily break the fetch) and confirm: (zero-cards + network-failure both emit `[]`, stderr warning, exit 0)
  - Prints `[]` to stdout
  - Warns on stderr
  - Exit code is 0
- **This is a manual verification step**, not a code change
- **Stop rule:** if the parser crashes on failure or hangs, fix before proceeding

### Task 7 — Verify end-to-end with `scan.mjs`

- [x] Run `node scan.mjs --company "Computrabajo MX" --dry-run` and confirm: (1 local parser; 38 found, 31 title-filtered, 0 location-filtered, 5 new remote .NET/backend offers)
  - The Computrabajo entry is recognized
  - `local-parser` provider is selected for it
  - Dry-run output shows the entry as a scan target
- [x] Run `node scan.mjs --company "Computrabajo MX"` (live, non-dry) and confirm: (APPROVED + RUN 2026-06-08: 37 found, 30 title-filtered, 0 location-filtered, 2 duplicates, 5 new offers; wrote `data/pipeline.md` and `data/scan-history.tsv`)
  - Jobs from Computrabajo appear in `data/pipeline.md` after the scan
  - `.NET`/backend remote roles pass through `title_filter` + `location_filter`
  - Non-.NET roles are filtered out by `title_filter` (the parser emits all cards; scan.mjs handles filtering)
- [x] Run the full test suite: `node test-all.mjs` — all checks pass including the new ones from Task 5 (157 passed, 0 failed, 7 pre-existing warnings unrelated to this change)
- **Stop rule:** if `scan.mjs` does not ingest local-parser output, the contract integration is broken and must be debugged before proceeding

---

## Summary of artifacts to create/modify

| File | Action | Est. lines |
|------|--------|------------|
| `scripts/parsers/computrabajo-mx.mjs` | **Create** | ~130–170 |
| `package.json` | Modify (add dep) | ~2 |
| `package-lock.json` | Regenerate | large, auto-generated |
| `portals.yml` | Modify (add entry +Teletrabajo) | ~12 |
| `test-all.mjs` | Modify (add check block) | ~20–30 |

**Total estimated changed lines (excluding lockfile):** ~170–220

---

## Stop Rules

1. **Do not edit** `package.json` (beyond adding `node-html-parser`), `scan.mjs`, `providers/local-parser.mjs`, or `modes/scan.md` in this change — these are system-layer files that must not change scope
2. **Do not create** OCC parser, Playwright renderers, or liveness checking — out of scope follow-ups per the design spec
3. **Do not modify** existing `tracked_companies` entries or `title_filter` in `portals.yml` — only additive changes
4. **Halt** if Computrabajo search pages are no longer server-rendered (requires design revision)
5. **Halt** if `node-html-parser` has ESM compatibility issues with the project's Node/Bun runtime (flag for design revision)
6. **Single-writer discipline:** no parallel writes to `portals.yml`, `test-all.mjs`, or `package.json` from other tasks

---

## Dependency graph

```
Task 1 (URL confirmation) ──► Task 3 (parser script)
Task 2 (dependency)        ──► Task 3 (parser script)
Task 3 (parser script)     ──► Task 4 (portals.yml entry)
Task 3 (parser script)     ──► Task 5 (test checks)
Task 4 + Task 3            ──► Task 6 (standalone verify)
Task 4 + Task 3 + Task 5   ──► Task 7 (end-to-end verify)
```

Tasks 1 and 2 can run in parallel. Task 3 depends on both. Tasks 4 and 5 can run in parallel once Task 3 is complete. Verification tasks (6, 7) are sequential at the end.