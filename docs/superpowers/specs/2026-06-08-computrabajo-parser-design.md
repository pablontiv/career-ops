# Spec — Computrabajo MX local parser

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation
**Component:** `scripts/parsers/computrabajo-mx.mjs`

## Context

career-ops discovers jobs through three tiers: local parsers (Nivel 0) > ATS APIs (Nivel 2) > WebSearch (Nivel 3). For a Mexico-based, remote-only, mid-level .NET coasting search, the bulk of the local Mexican job supply lives on **OCC** and **Computrabajo**, neither of which exposes a public ATS API. WebSearch over these boards returns stale Google-cached posts (confirmed: GetOnBrd returned 100% dead listings).

Probing showed **Computrabajo is server-rendered** (20 `<article>` job cards per search page in the raw HTML), so a lightweight fetch+parse local parser captures live listings with no Playwright and no Google cache. OCC is a SPA (jobs load via internal XHR) and is handled separately as a follow-up.

This spec covers **only the Computrabajo parser**.

## Goal

A standalone CLI script that fetches Computrabajo MX search results and prints job listings as JSON to stdout, conforming to the `local-parser` provider contract in `providers/local-parser.mjs`, so `scan.mjs` ingests live Computrabajo jobs zero-token.

## Requirements

1. **Contract compliance** — print a JSON array (or `{jobs:[...]}`) of objects with at least `title` and `url`; `location` recommended. Resolve relative URLs. Stay under the 20s timeout and 2 MB stdout cap enforced by `local-parser.mjs`.
2. **Remote-only** — query Computrabajo's remote-filtered searches and emit the card's location. Computrabajo labels remote roles **"Teletrabajo"**, so `location_filter.allow` in `portals.yml` MUST gain `"Teletrabajo"` (and `"Remoto"` already present) or remote jobs get dropped downstream.
3. **No relevance filtering in the parser** — extract all cards; `scan.mjs`'s `title_filter` drops non-.NET noise (e.g. "Ejecutivo Call Center") downstream. Keeps the parser dumb and stable.
4. **Resilience** — any failure (network, non-200, markup change, zero cards) prints `[]` and warns on stderr. The script MUST NOT crash; `scan.mjs` logs the local-parser error and continues with other sources.
5. **Configurable** — search keywords and pages-per-search overridable via `parser.args`, with sensible defaults.

## Architecture

Single file, `scripts/parsers/computrabajo-mx.mjs`, node ESM. Dependency: **`node-html-parser`** (added to `package.json`).

### Flow
1. Parse args: `--pages N` (default 2), optional `--keywords a,b,c`. Default keywords map to Computrabajo remote search URLs for: `.net`, `c#`, `backend`, `full-stack`, `devops`.
2. For each `(searchUrl, page)`:
   - `fetch` with a realistic browser `User-Agent` and `Accept-Language: es-MX`.
   - Parse HTML with `node-html-parser`.
   - Select `article.box_offer`. Per card extract:
     - **title + url**: `h2 a.js-o-link` → text + `href` (resolve against `https://mx.computrabajo.com`).
     - **company**: `a[offer-grid-article-company-url]` text (optional).
     - **location**: the card's location node text (e.g. "Teletrabajo").
   - Decode HTML entities (`&#xED;` etc.).
3. Dedup by job `data-id` (or normalized URL) across all pages/keywords.
4. `console.log(JSON.stringify(jobs))`.

### Card selectors (verified 2026-06-08)
- Card: `article.box_offer` (has `data-id`, `id`).
- Title/link: `h2 a.js-o-link[href^="/ofertas-de-trabajo/"]`.
- Company: `a[offer-grid-article-company-url]`.

### portals.yml entry
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
Plus: add `"Teletrabajo"` to `location_filter.allow`.

## Dependency caveat

`node-html-parser` goes in `package.json`. `update-system.mjs apply` may overwrite `package.json` (system layer) and drop the dep. If that happens, the import fails — caught by requirement 4, so Computrabajo is skipped (not a crash) and `scan.mjs` continues. Mitigation documented in the script header: re-run `npm install` after a system update. (The script may also lazy-`import()` the lib inside the try/catch so a missing dep degrades gracefully.)

## Anti-bot considerations

Computrabajo returned HTTP 200 to a fetch with a browser UA. Risks: rate-limiting / Cloudflare challenge on repeated automated hits. Mitigations: realistic UA + `es-MX` headers, modest pagination (default 2 pages), small delay between page fetches. If challenged, the script emits `[]` per requirement 4.

## Out of scope (separate follow-ups)
- **OCC parser** — SPA; needs internal XHR API capture or Playwright render.
- **Per-URL liveness verification** — Computrabajo search lists current openings, so it is inherently fresher than Google cache; deep liveness is deferred.

## Verification
1. **First implementation step:** confirm Computrabajo's remote-filtered search URL pattern empirically (do not assume) before wiring keywords.
2. **Standalone:** `node scripts/parsers/computrabajo-mx.mjs --pages 1` prints a JSON array with ≥1 `{title,url,location}`; URLs absolute; remote cards carry "Teletrabajo"/"Remoto".
3. **End-to-end:** `node scan.mjs` ingests Computrabajo, and `.NET`/backend remote roles reach `data/pipeline.md` after `title_filter` + `location_filter`.
4. **Failure modes:** simulate a bad URL / offline → script prints `[]`, exit 0, `scan.mjs` continues.
