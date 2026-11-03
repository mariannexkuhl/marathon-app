# Findings report — marathon-app-tooling-testing

Run: `20261102T033125Z` · See [run-info.md](run-info.md) and [cbom.cdx.json](cbom.cdx.json).

## Repository inventory inspected

- [app.js](../../app.js) — full file read (164 lines)
- [index.html](../../index.html) — full file read
- [styles.css](../../styles.css) — full file read
- [brief.md](../../brief.md) — full file read (non-code project context)
- `.DS_Store` — binary macOS metadata artifact; not source, not inspected as evidence
- No `package.json`, lockfile, `node_modules/`, build configuration, CI configuration, or infrastructure/deployment-configuration files are present in the repository.
- No `docs/` or `.claude/` directories exist (scope-guard exclusions did not apply — nothing matched them).
- No `quantum-audit-runs/` output directory existed prior to this run.

## Findings

### Public-key operations — found

| # | Operation | Location | Evidence |
|---|---|---|---|
| 1 | RSA-OAEP key-pair generation | [app.js](../../app.js#L145-L154) | `crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, false, ["encrypt","decrypt"])`; `bom-ref`: `crypto:algorithm:rsa-oaep` (keygen function), `crypto:key:rsa-public`, `crypto:key:rsa-private` |
| 2 | RSA-OAEP encryption | [app.js](../../app.js#L57) | `crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKeyPair.publicKey, messageBytes)`; `bom-ref`: `crypto:algorithm:rsa-oaep` (encrypt function) |
| 3 | RSA-OAEP decryption | [app.js](../../app.js#L63) | `crypto.subtle.decrypt({ name: "RSA-OAEP" }, rsaKeyPair.privateKey, encryptedBuffer)`; `bom-ref`: `crypto:algorithm:rsa-oaep` (decrypt function) |

The key pair is held in the module-scope variable `rsaKeyPair` ([app.js](../../app.js#L16)), generated once via `initializeKeys()` ([app.js](../../app.js#L137-L161)) and awaited through `keyReady` ([app.js](../../app.js#L19), [app.js](../../app.js#L42-L43)) before first use. The private key is generated with `extractable: false`. No export, serialization, persistence (`localStorage`/`sessionStorage`/`IndexedDB`/cookies/file write), or network transmission of either key is present anywhere in the inspected source.

### Symmetric operations — no evidence on inspected surfaces

No symmetric cipher calls (AES, ChaCha20, etc.) were found anywhere in [app.js](../../app.js), which was read in full; no other source files exist in the repository.

### Key and credential flow — found

- Declaration: `rsaKeyPair` module-level variable, [app.js](../../app.js#L16).
- Generation → use: generated in `initializeKeys()` ([app.js](../../app.js#L137-L161)); public key used for `encrypt` ([app.js](../../app.js#L57)); private key used for `decrypt` ([app.js](../../app.js#L63)).
- Lifetime/storage: in-memory only (module/page scope), regenerated on each page load; no persistence or transmission.
- No credentials, tokens, API keys, passwords, or other secrets appear in any inspected file.

### Other cryptographic functions — found (scoped) / no evidence (standalone)

- SHA-256 appears only as the OAEP mask-generation (MGF1) hash parameter of the `generateKey` call ([app.js](../../app.js#L150)); `bom-ref`: `crypto:algorithm:sha-256`. It is not invoked as a standalone `crypto.subtle.digest` call anywhere in the repository.
- No HMAC, KMAC, PBKDF2/HKDF, password hashing, signing (`sign`/`verify`), or other MAC/KDF constructions are present.

### Random number generation — reference gap / delegated

- No direct call to `crypto.getRandomValues` or any other explicit RNG API appears in the source. Randomness for `generateKey` is delegated entirely to the browser's internal `SubtleCrypto` implementation; this is opaque and not locally inspectable. No RNG component was created in the CBOM for this reason (see classifier reference: random number generation is a known reference gap).

### Protocols and services — out of scope

No network calls (`fetch`, `XMLHttpRequest`, `WebSocket`), TLS-relevant configuration, or external service integration exist anywhere in the application. [brief.md](../../brief.md#L5) states explicitly: "No backend, account system, or third-party dependencies." [app.js](../../app.js#L137-L140) only checks for the availability of `globalThis.crypto.subtle` (secure-context requirement), which is not a network protocol.

### Implementation and dependency surfaces

- **Application dependencies — no evidence on inspected surfaces.** No `package.json` or lockfile exists; there is nothing to enumerate for direct/transitive crypto-relevant npm dependency edges.
- **Runtime crypto implementation — found.** The only crypto-relevant implementation surface is the browser-native `SubtleCrypto` API (`lib:web-crypto-api` in the CBOM), reached directly at [app.js](../../app.js#L57), [app.js](../../app.js#L63), and [app.js](../../app.js#L145). Its internal implementation is host-browser-provided, not an npm dependency with a resolvable version; it was not inspected further (delegated, no local or exact-version public source to trace, and no bounded public-source lookup was needed since the behavior is already evidenced directly at the call site).

### Non-executable corroborating references (not independent evidence of behavior)

- [index.html](../../index.html#L5) meta description references "quantum-vulnerable RSA-OAEP".
- [index.html](../../index.html#L89-L92) displays an integrity note and an `RSA-OAEP` algorithm tag.
- [brief.md](../../brief.md#L1-L6) confirms RSA-OAEP, 2048-bit modulus, SHA-256 OAEP hash, 190-byte plaintext limit, in-memory-only key/message lifetime, and the absence of any backend.
- [styles.css](../../styles.css#L300-L318) `.algorithm-tag`/`.cipher-label`/`.cipher-value` are purely presentational; no cryptographic behavior.

## IaC control evidence

| Profile | Source | Subject | Field | Safe value/status | Rule ID | Catalogue version |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

No rows: the bundled `terraform-hcl-scanner` (tool `gen-e2-iac-crypto-scanner` v0.4.0; parsers `python-hcl2` 8.1.4, `PyYAML` 6.0.2, stdlib `json`; rule catalogue `2026-10-29.1`) was invoked against the repository root and returned `no_files_detected` for all 17 supported profiles (terraform-hcl, opentofu-hcl, terraform-json, azure-arm, bicep, ecs-task-definition, dockerfile, docker-compose, github-actions, gitlab-ci, azure-pipelines, cloudformation, aws-sam, serverless-framework, kubernetes, kustomize, helm-template): zero `resources`, zero `asset_candidates`, zero `controls`, zero `errors`, zero `unsupported_surfaces`. Combined with the full repository listing (4 source files plus `.DS_Store`), there is no infrastructure/deployment-configuration surface to assess in this repository. `no_files_detected` means no file matched a given profile's patterns; it is not proof that no other, unsupported IaC format exists, but no additional files of any kind exist in this repository.

### IaC asset disposition

No scanner `asset_candidate` records were returned (zero candidates across all profiles), so there is nothing to disposition in this run.

## Category reconciliation

| Category | Status | Evidence / reason |
|---|---|---|
| Public-key operations | **found** | RSA-OAEP keygen/encrypt/decrypt via Web Crypto API — [app.js](../../app.js#L57), [app.js](../../app.js#L63), [app.js](../../app.js#L145-L154) |
| Symmetric operations | **no evidence on inspected surfaces** | No symmetric cipher calls in [app.js](../../app.js), fully read; no other source files exist |
| Key and credential flow | **found** | In-memory-only RSA key-pair lifecycle traced end-to-end; no credentials/secrets present anywhere |
| Other cryptographic functions | **found** (SHA-256, scoped to OAEP hash parameter) | [app.js](../../app.js#L150); no standalone digest/HMAC/KDF/signing calls found |
| Protocols and services | **out of scope** | No network/TLS/protocol code exists in this client-only, backend-less demo; confirmed by [brief.md](../../brief.md#L5) |
| Implementation and dependency surfaces | **no evidence on inspected surfaces** (package dependencies) / **found** (runtime: Web Crypto API) | No manifest/lockfile exists; sole crypto-relevant surface is the delegated, opaque `SubtleCrypto` implementation |
| Infrastructure/deployment configuration | **no evidence on inspected surfaces** (scanned) | All 17 scanner profiles ran to completion with `no_files_detected`; no IaC/CI/container/deployment files exist in the repository |

## Unresolved questions

- Whether to model the browser-native `SubtleCrypto` RSA-OAEP implementation as a delegated/unknown-provenance cryptographic asset beyond a library reference: resolved for this CBOM by modelling it as a `library` component (`lib:web-crypto-api`) rather than as a cryptographic-asset component, since its internal algorithm implementation is host-provided and not a versioned, locally or publicly inspectable package.

## Coverage gaps and limitations

- **TLS negotiation**: not applicable/not assessed — no network code or TLS configuration exists in this repository; no TLS negotiation details, cipher suites, or certificate chains are asserted.
- **Secret values**: none found; none recorded. No standalone secret-presence scan was requested or run (it is a separate, explicitly opt-in method not part of this pass).
- **Dependency internals**: no manifest/lockfile exists, so no dependency internals were inspected. The only "dependency" present (the browser's native Web Crypto API) is opaque and was not — and cannot be — inspected as local or versioned package source.
- **Excluded/uninspected surfaces**: `docs/`, `.claude/`, and `quantum-audit-runs/` do not exist in this repository, so nothing was excluded under those rules. No hidden directories, nested source folders, manifests, or lockfiles exist beyond the 4 files enumerated above.
- **Runtime/TLS observation and secret-presence tools**: neither was authorised or invoked for this run; they are standalone opt-in methods outside the standard discovery pass.
- **Inventory completeness**: this is a static, single-pass source read of a very small repository; it is not a claim of exploitability, urgency, compliance status, or runtime/deployed behavior.
