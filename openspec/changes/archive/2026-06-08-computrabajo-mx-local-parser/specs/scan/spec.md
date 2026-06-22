# Scan Specification

## Purpose

Define the expected behavior for adding Computrabajo MX as a zero-token local-parser source in the scan pipeline, limited to live Computrabajo MX search-result ingestion and downstream filtering by existing scan configuration.

## Requirements

### Requirement: Computrabajo Local Parser Contract Compliance

The system MUST provide a Computrabajo MX local parser source that conforms to the existing `local-parser` provider contract by returning a JSON array, or an object with a `jobs` array, where each emitted job includes at least `title` and an absolute `url`, with `location` emitted when available. Parser output MUST remain within the provider timeout and stdout-size constraints.

#### Scenario: Standalone parser returns contract-compatible jobs

- GIVEN Computrabajo MX search results are available
- WHEN the Computrabajo local parser is run with its default arguments
- THEN stdout MUST contain valid JSON accepted by the local-parser provider
- AND each job MUST include a non-empty `title`
- AND each job MUST include an absolute Computrabajo `url`
- AND available card locations MUST be preserved in `location`

#### Scenario: Provider can ingest parser output

- GIVEN the local-parser provider invokes the Computrabajo parser
- WHEN the parser returns either a jobs array or `{ "jobs": [...] }`
- THEN the scan pipeline MUST normalize and process the returned jobs without requiring network-token search fallback for Computrabajo MX

### Requirement: Computrabajo Remote Teletrabajo Handling

The system MUST support Computrabajo MX remote-search results and MUST preserve Computrabajo's remote location label, including `Teletrabajo`, so downstream location filtering can retain remote jobs.

#### Scenario: Remote Computrabajo jobs survive location filtering

- GIVEN a Computrabajo job card has location `Teletrabajo`
- AND `Teletrabajo` is allowed by scan location filtering configuration
- WHEN scan processes the parser output
- THEN the job MUST NOT be rejected solely because the remote label is `Teletrabajo`

#### Scenario: Remote labels are not rewritten away

- GIVEN Computrabajo returns a remote job with `Teletrabajo` or `Remoto` in the card location
- WHEN the parser emits the job
- THEN the emitted `location` MUST retain the remote label needed by downstream filters

### Requirement: Parser Resilience and Graceful Degradation

The Computrabajo parser MUST degrade safely on network errors, non-success responses, missing dependencies, markup changes, parse errors, or all-keyword zero-card results by emitting an empty jobs result and warning on stderr. Zero cards on later pages are normal pagination exhaustion; zero cards on the first page for one keyword SHOULD warn and continue with other configured keywords. Such failures MUST NOT crash the scan pipeline or block other scan sources.

#### Scenario: Computrabajo is unavailable

- GIVEN Computrabajo cannot be reached or returns an unusable response
- WHEN the parser runs
- THEN stdout MUST contain an empty JSON result
- AND stderr SHOULD include a warning suitable for troubleshooting
- AND the parser process MUST exit successfully enough for scan to continue with other sources

#### Scenario: Markup no longer matches expected cards

- GIVEN all configured first-page keyword searches contain no parseable job cards
- WHEN the parser runs
- THEN stdout MUST contain an empty JSON result
- AND scan MUST continue without treating the entire scan as failed

### Requirement: Configurable Search Scope

The Computrabajo parser MUST allow search keywords and pages-per-search to be configured through parser arguments, while providing defaults aligned with the approved Mexico remote mid-level .NET/backend search.

#### Scenario: Default scan uses approved search scope

- GIVEN no custom parser keyword arguments are configured
- WHEN the Computrabajo parser runs
- THEN it MUST search the approved default keyword set for remote Mexico .NET/backend/full-stack/devops roles
- AND it SHOULD use modest pagination by default to limit anti-bot and runtime risk

#### Scenario: Portal configuration overrides parser arguments

- GIVEN the Computrabajo portal entry supplies parser arguments for page count or keywords
- WHEN scan invokes the local parser
- THEN the parser MUST honor those configured arguments instead of requiring code changes

### Requirement: No Relevance Filtering Inside Parser

The Computrabajo parser MUST NOT filter jobs for role relevance, technology stack, seniority, or candidate fit. It MUST emit all parseable search-result cards and leave relevance decisions to existing `scan.mjs` title and location filters.

#### Scenario: Non-.NET cards are emitted by parser but filtered downstream

- GIVEN a Computrabajo search page contains both .NET/backend roles and unrelated roles
- WHEN the parser processes the page
- THEN the parser MUST emit all parseable cards from the page
- AND scan title filtering MAY reject unrelated roles downstream

### Requirement: Computrabajo Portal Integration

The scan configuration MUST include Computrabajo MX as an enabled `local_parser` source with a parser command, script path, arguments, and timeout compatible with the existing local-parser provider. The scan location allow-list MUST include `Teletrabajo` alongside existing remote labels.

#### Scenario: Computrabajo appears as a local parser target

- GIVEN scan configuration is loaded
- WHEN scan enumerates enabled tracked companies or sources
- THEN Computrabajo MX MUST be recognized as a local-parser scan target
- AND its parser configuration MUST point to the Computrabajo MX parser script
- AND its timeout MUST fit the local-parser provider constraints

#### Scenario: Configuration validation covers Computrabajo integration

- GIVEN the repository validation checks are run
- WHEN they inspect scan configuration
- THEN they MUST verify the Computrabajo MX local-parser entry exists
- AND they MUST verify `Teletrabajo` is allowed for location filtering

### Requirement: Verification Coverage

The change MUST be verifiable without adding product scope beyond the Computrabajo MX local parser. Verification MUST cover standalone parser contract behavior, graceful failure behavior, portal configuration, Teletrabajo filtering, and scan ingestion.

#### Scenario: Standalone verification succeeds

- GIVEN the parser is run for a small page count
- WHEN Computrabajo returns available search results
- THEN stdout MUST parse as JSON
- AND emitted jobs MUST include absolute URLs and available locations

#### Scenario: End-to-end scan verification succeeds

- GIVEN Computrabajo MX is configured as a local-parser source
- WHEN scan runs for that source
- THEN scan MUST invoke the local-parser provider
- AND eligible remote backend/.NET jobs MAY reach the pipeline after existing downstream filters
- AND unrelated jobs MAY be rejected by existing downstream relevance filters

#### Scenario: Scope boundaries are preserved

- GIVEN this change is implemented
- WHEN review checks the resulting behavior
- THEN it MUST NOT include an OCC parser
- AND it MUST NOT require Playwright rendering for Computrabajo
- AND it MUST NOT add per-URL liveness verification for Computrabajo listings
