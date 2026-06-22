#!/usr/bin/env node

/**
 * computrabajo-mx.mjs — Computrabajo MX local parser (Nivel 0, zero-token).
 *
 * Fetches Computrabajo MX server-rendered search-result pages and prints a JSON
 * array of job objects to stdout, conforming to the `local-parser` provider
 * contract in providers/local-parser.mjs:
 *
 *   [{ "title": "...", "url": "https://mx.computrabajo.com/...", "location": "...", "company": "..." }]
 *
 * Contract / design source:
 *   docs/superpowers/specs/2026-06-08-computrabajo-parser-design.md
 *   openspec/changes/computrabajo-mx-local-parser/specs/scan/spec.md
 *
 * Confirmed empirically 2026-06-08:
 *   - Remote-filtered search URL: https://mx.computrabajo.com/trabajo-de-{kw}-en-teletrabajo
 *     (HTTP 200, server-rendered, 20 `article.box_offer` cards per page).
 *   - Pagination: ?p=N
 *   - A leading "." in a keyword (".net") triggers a 301 to the dotless slug; we
 *     normalize keywords to the dotless slug form up front.
 *   - The previous proposed default "c#" slug was not reliable enough as a
 *     Computrabajo path search; the default set keeps the approved .NET/backend
 *     intent via "net", "backend", "full-stack", "devops".
 *   - Per card the geographic location ("Mérida, Yucatán") and the work modality
 *     ("Remoto" / "Teletrabajo", marked by an `i_home` icon) live in SEPARATE
 *     nodes. We emit BOTH so scan.mjs `location_filter` can retain remote jobs
 *     (it matches `allow` as a substring; "Mérida, Yucatán" alone would be
 *     rejected). `portals.yml` must allow "Teletrabajo" (and "Remoto").
 *
 * Resilience (design requirement 4): failures (network, non-200, missing
 * dependency, markup change, parse error) print `[]` to stdout, warn on stderr,
 * and exit 0 so scan.mjs logs and continues with other sources. Zero cards on
 * a later page are normal pagination exhaustion; zero cards on one keyword's
 * first page warn and continue so one sparse query does not erase useful jobs.
 * If all attempted keywords produce no parseable jobs, stdout is `[]`.
 *
 * Dependency caveat: `node-html-parser` is in package.json. `update-system.mjs
 * apply` may overwrite package.json (system layer) and drop the dep; the import
 * is lazy + guarded, so a missing dependency degrades to `[]` rather than a
 * crash. Mitigation: re-run `npm install` after a system update.
 *
 * Usage:
 *   node scripts/parsers/computrabajo-mx.mjs [--pages N] [--keywords a,b,c]
 */

const BASE_URL = "https://mx.computrabajo.com";
const DEFAULT_PAGES = 2;
const DEFAULT_KEYWORDS = [".net", "backend", "full-stack", "devops"];
const INTER_FETCH_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Minimal HTML entity decoder for numeric + the few named entities Computrabajo emits. */
function decodeEntities(input) {
	if (!input) return "";
	return String(input)
		.replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
			safeFromCodePoint(parseInt(h, 16)),
		)
		.replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function safeFromCodePoint(code) {
	if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
	try {
		return String.fromCodePoint(code);
	} catch {
		return "";
	}
}

function clean(text) {
	return decodeEntities(text || "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Parse CLI args: --pages N, --keywords a,b,c. Unknown args are ignored. */
function parseArgs(argv) {
	let pages = DEFAULT_PAGES;
	let keywords = DEFAULT_KEYWORDS;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--pages") {
			const n = parseInt(argv[++i], 10);
			if (Number.isFinite(n) && n > 0) pages = Math.min(n, 10);
		} else if (arg === "--keywords") {
			const raw = argv[++i] || "";
			const parsed = raw
				.split(",")
				.map((k) => k.trim())
				.filter(Boolean);
			if (parsed.length > 0) keywords = parsed;
		}
	}
	return { pages, keywords };
}

/**
 * Convert a human keyword into Computrabajo's remote-filtered search URL slug.
 * Computrabajo uses path slugs like /trabajo-de-net-en-teletrabajo. A leading
 * "." (".net") would 301-redirect to the dotless form, so we strip it.
 */
function keywordToSearchUrl(keyword) {
	const slug = String(keyword)
		.toLowerCase()
		.trim()
		.replace(/[.]/g, "") // ".net" -> "net" (avoids a 301)
		.replace(/#/g, "-sharp") // "c#"   -> "c-sharp"
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) return null;
	return `${BASE_URL}/trabajo-de-${slug}-en-teletrabajo`;
}

function pageUrl(searchUrl, page) {
	return page > 1 ? `${searchUrl}?p=${page}` : searchUrl;
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent": USER_AGENT,
				"Accept-Language": "es-MX,es;q=0.9",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			signal: controller.signal,
		});
		if (!res.ok) {
			process.stderr.write(`[computrabajo-mx] HTTP ${res.status} for ${url}\n`);
			return null;
		}
		return await res.text();
	} catch (err) {
		process.stderr.write(
			`[computrabajo-mx] fetch failed for ${url}: ${err?.message || err}\n`,
		);
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/** Extract the modality node text (Remoto / Teletrabajo), marked by an i_home icon. */
function extractModality(card) {
	const spans = card.querySelectorAll("span");
	for (const span of spans) {
		if (span.querySelector(".i_home")) {
			const text = clean(span.text);
			if (text) return text;
		}
	}
	return "";
}

/**
 * Extract the geographic location span. Computrabajo renders several `span.mr10`
 * nodes per card: a company rating (`span.fx_none.mr10`, e.g. "4.3"), the real
 * location (plain `span.mr10`, e.g. "Benito Juárez, Ciudad de México DF"), and
 * salary/modality wrappers (`span.dIB.mr10`). We skip ratings, salary, and
 * modality wrappers and return the first real location.
 */
function extractGeoLocation(card) {
	const spans = card.querySelectorAll("span.mr10");
	for (const span of spans) {
		const classes = (span.classNames || "").split(/\s+/);
		if (classes.includes("dIB") || classes.includes("fx_none")) continue; // salary/modality/rating
		const text = clean(span.text);
		if (!text || text.startsWith("$")) continue;
		if (/^\d+([.,]\d+)?$/.test(text)) continue; // bare rating number
		return text;
	}
	return "";
}

function extractCard(card) {
	const link = card.querySelector("h2 a.js-o-link");
	if (!link) return null;

	const title = clean(link.text);
	let href = link.getAttribute("href") || "";
	href = href.split("#")[0].trim();
	if (!title || !href) return null;

	let url;
	try {
		url = new URL(href, BASE_URL).href;
	} catch {
		return null;
	}

	const companyEl = card.querySelector("a[offer-grid-article-company-url]");
	const company = companyEl ? clean(companyEl.text) : "";

	const geo = extractGeoLocation(card);
	const modality = extractModality(card);
	const location = [geo, modality].filter(Boolean).join(" · ");

	const id = card.getAttribute("data-id") || url;

	return { id, title, url, company, location };
}

async function main() {
	const { pages, keywords } = parseArgs(process.argv.slice(2));

	// Lazy + guarded import so a missing dependency degrades to [] (see header).
	let parse;
	try {
		({ parse } = await import("node-html-parser"));
	} catch (err) {
		process.stderr.write(
			`[computrabajo-mx] node-html-parser unavailable (${err?.message || err}); ` +
				"run `npm install`. Emitting [].\n",
		);
		process.stdout.write("[]");
		return;
	}

	const seen = new Set();
	const jobs = [];
	let firstFetch = true;

	for (const keyword of keywords) {
		const searchUrl = keywordToSearchUrl(keyword);
		if (!searchUrl) continue;

		for (let page = 1; page <= pages; page++) {
			if (!firstFetch) await delay(INTER_FETCH_DELAY_MS);
			firstFetch = false;

			const url = pageUrl(searchUrl, page);
			const html = await fetchHtml(url);
			if (!html) {
				process.stderr.write(
					"[computrabajo-mx] failed requested page; emitting [].\n",
				);
				process.stdout.write("[]");
				return;
			}

			let root;
			try {
				root = parse(html);
			} catch (err) {
				process.stderr.write(
					`[computrabajo-mx] parse error for ${url}: ${err?.message || err}\n`,
				);
				process.stdout.write("[]");
				return;
			}

			const cards = root.querySelectorAll("article.box_offer");
			if (cards.length === 0) {
				if (page > 1) {
					process.stderr.write(
						`[computrabajo-mx] no cards on ${url}; treating as pagination end.\n`,
					);
					break;
				}
				process.stderr.write(
					`[computrabajo-mx] zero cards parsed for keyword "${keyword}" at ${url}; continuing.\n`,
				);
				break;
			}

			for (const card of cards) {
				let job;
				try {
					job = extractCard(card);
				} catch {
					job = null;
				}
				if (!job) continue;
				const key = job.id || job.url;
				if (seen.has(key)) continue;
				seen.add(key);
				jobs.push({
					title: job.title,
					url: job.url,
					company: job.company,
					location: job.location,
				});
			}
		}
	}

	if (jobs.length === 0) {
		process.stderr.write("[computrabajo-mx] no cards parsed; emitting [].\n");
	}
	process.stdout.write(JSON.stringify(jobs));
}

main().catch((err) => {
	process.stderr.write(
		`[computrabajo-mx] unexpected error: ${err?.message || err}\n`,
	);
	process.stdout.write("[]");
});
