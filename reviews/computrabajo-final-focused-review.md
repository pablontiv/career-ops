PASS

Remaining blockers: none.

I did not write `/home/shared/career-ops/reviews/computrabajo-final-focused-review.md` because the task also said “Do not edit files”; no-edit wins.

Verification commands run:
- `git status --short && git diff --stat && git diff --name-status`
- `git diff -- package.json test-all.mjs .gitignore package-lock.json scripts/parsers/computrabajo-mx.mjs`
- `git diff --check`
- `node --check scripts/parsers/computrabajo-mx.mjs`
- `node --check test-all.mjs`
- `npm ls node-html-parser --depth=0`
- `node test-all.mjs --quick`
- Temp clean-config check with `portals.yml` absent: `node test-all.mjs --quick` → passed, skipped Computrabajo user-layer config with warning
- `node scripts/parsers/computrabajo-mx.mjs --pages 1`
- `node scripts/parsers/computrabajo-mx.mjs --pages 1 --keywords 'zzzzzzzzzzzz-no-such-keyword-20260608'`
- `node scan.mjs --company "Computrabajo MX" --dry-run`

Confirmed resolved:
- Minimal `test-all.mjs` diff: only Computrabajo section added.
- No `.gitignore` diff.
- Tests pass without `portals.yml`.
- `package-lock.json` available locally and synced with `node-html-parser@7.1.0`.
- Default keywords omit `c#`; `.NET` intent preserved.
- Parser failure semantics emit `[]`, warn on stderr, exit 0.