# Proposal — Computrabajo MX local parser

**Status:** Approved (design phase complete)
**Design source:** [docs/superpowers/specs/2026-06-08-computrabajo-parser-design.md](../../../docs/superpowers/specs/2026-06-08-computrabajo-parser-design.md)

## Summary

Add a local parser (`scripts/parsers/computrabajo-mx.mjs`) that fetches Computrabajo MX search results, parses the server-rendered HTML, and emits a JSON jobs array to stdout — following the `local-parser` provider contract already in `providers/local-parser.mjs`. This gives `scan.mjs` zero-token access to Computrabajo's live Mexican job listings, which WebSearch cannot reach reliably (stale Google caches).

## Scope

- Single new parser script (ESM, Node.js)
- One new dependency: `node-html-parser`
- One new `tracked_companies` entry in `portals.yml`
- One `location_filter.allow` addition: `"Teletrabajo"`
- Test checks in `test-all.mjs`

Out of scope: OCC parser, Playwright rendering, per-URL liveness verification.