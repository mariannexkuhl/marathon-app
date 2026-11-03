# Findings report — marathon-app-tooling-testing (post-migration pass)

Run: `20261102T035200Z` · See [run-info.md](run-info.md) and [cbom.cdx.json](cbom.cdx.json). Prior run: [`20261102T033125Z`](../20261102T033125Z/findings-report.md) (pre-migration RSA-OAEP snapshot — not re-used as evidence here).

## Repository inventory inspected

- [app.js](../../app.js) — full file read; now an ES module (`import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";`)
- [index.html](../../index.html) — full file read; script tag now loads `app.bundle.js`
- [styles.css](../../styles.css) — full file read; no crypto-relevant content
- [brief.md](../../brief.md) — full file read; **stale** (see "Documentation/evidence discrepancy" below)
- [package.json](../../package.json), [package-lock.json](../../package-lock.json) — full read for dependency graph
- `app.bundle.js` — esbuild build artifact; spot-checked to confirm it matches `app.js`'s source (same three ML-KEM call sites present); not independently authored code, not modelled as a separate source of truth
- `node_modules/@noble/post-quantum/ml-kem.js`, `node_modules/@noble/hashes/`, `node_modules/@noble/curves/` — installed local source inspected to confirm exact parameter set and reachability (no web lookup needed; local source matches the locked version exactly)
- `.DS_Store` — binary macOS metadata artifact; not source, not inspected
- `quantum-audit-runs/` (including the prior run) — **excluded entirely** from source evidence and inventory per instruction; not read as part of this pass
- No `docs/` or `.claude/` directories exist in this repository

## Findings

### Public-key / KEM operations — found

| # | Operation | Location | Evidence |
|---|---|---|---|
| 1 | ML-KEM-768 key-pair generation | [app.js](../../app.js#L177) | `kemKeyPair = ml_kem768.keygen();`; `bom-ref`: `crypto:algorithm:ml-kem-768` (keygen), `crypto:key:ml-kem-768-public`, `crypto:key:ml-kem-768-private` |
| 2 | ML-KEM-768 encapsulation | [app.js](../../app.js#L60) | `const { cipherText: kemCipherText, sharedSecret } = ml_kem768.encapsulate(kemKeyPair.publicKey);` |
| 3 | ML-KEM-768 decapsulation | [app.js](../../app.js#L70) | `const recoveredSharedSecret = ml_kem768.decapsulate(kemCipherText, kemKeyPair.secretKey);` |

Parameter set confirmed as **ML-KEM-768** (not merely "ML-KEM" generically) by inspecting the installed local source at `node_modules/@noble/post-quantum/ml-kem.js`: `export const ml_kem768 = (() => mk(PARAMS[768]))();` with `PARAMS[768] = { K: 3, ETA1: 2, ETA2: 2, du: 10, dv: 4, RBGstrength: 192 }`, matching FIPS 203 Table 2's `k=3` row. The same file's doc comments cite FIPS 203 Table 3 sizes for this parameter set: public key 1184 bytes, secret key 2400 bytes, ciphertext 1088 bytes, shared secret 32 bytes — used for the CBOM's `size` (bits) fields.

Key flow: `kemKeyPair` is a module-scope variable ([app.js](../../app.js#L19)), generated once via `initializeKeys()` and awaited through `keyReady` before first use — same lifecycle pattern as the prior run's RSA key pair. No export, persistence, or network transmission of either key half is present anywhere in the inspected source.

### Symmetric operations — found

| # | Operation | Location | Evidence |
|---|---|---|---|
| 1 | HKDF-SHA-256 key derivation | [app.js](../../app.js#L154-L163) | `deriveAesKey()`: `crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"])` ([app.js](../../app.js#L155)) then `crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO }, ...)` ([app.js](../../app.js#L156-L157)) |
| 2 | AES-256-GCM encryption | [app.js](../../app.js#L63) | `crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, messageBytes)` |
| 3 | AES-256-GCM decryption | [app.js](../../app.js#L72) | `crypto.subtle.decrypt({ name: "AES-GCM", iv }, recoveredAesKey, aeadCipherText)` |

Both HKDF and AES-GCM are invoked via the browser-native Web Crypto API (`crypto.subtle`), **not** via `@noble/ciphers` — that package is present in the dependency tree (see below) but not imported anywhere in `app.js`'s module graph. The derived AES key is generated `extractable: false` and is never exported.

### Key and credential flow — found

- `kemKeyPair`: in-memory ML-KEM key pair, [app.js](../../app.js#L19), [app.js](../../app.js#L177); public half used for encapsulation ([app.js](../../app.js#L60)), private ("secretKey") half used for decapsulation ([app.js](../../app.js#L70)).
- Shared secret → AES key: `sharedSecret`/`recoveredSharedSecret` from encapsulate/decapsulate are each passed to `deriveAesKey()` ([app.js](../../app.js#L154-L163)), which HKDF-derives a non-extractable 256-bit AES-GCM key, context-bound with `info: HKDF_INFO` where `HKDF_INFO = encoder.encode("marathon-ml-kem-aes-gcm-v1")` ([app.js](../../app.js#L18)). Salt is an explicit empty `Uint8Array(0)` ([app.js](../../app.js#L157)) — a non-secret configuration choice, not a credential.
- Ciphertext/IV envelope: KEM ciphertext, 12-byte random IV, and AEAD ciphertext are concatenated and hex-encoded for on-page display only ([app.js](../../app.js#L62-L64)); rendered into DOM nodes, never transmitted off-page.
- No credentials, tokens, API keys, passwords, environment variables, or `.env`/config files exist anywhere in this repository.

### Other cryptographic functions

- `crypto.getRandomValues` — CSPRNG for the AES-GCM IV: [app.js](../../app.js#L62). **Found.**
- No HMAC, signing/verification, or password-hashing calls appear at the application level. Constant-time comparison/zeroization calls exist only **inside** the `@noble/post-quantum` library implementation itself (FIPS-203 implicit-rejection/wipe logic in `ml-kem.js`), not something the application calls directly — noted as library-internal context, not an application-level finding. **No evidence on inspected surfaces** for app-level HMAC/signing/password-hashing.

### Protocols and services — out of scope

No network/TLS/protocol code, OAuth/OIDC, or GitHub App signing exists anywhere in this repository (unchanged from the prior run). The application remains browser-only, backend-free.

### Implementation and dependency surfaces — found

`package.json` / `package-lock.json` dependency graph (all versions exact-pinned):

| Package | Version | Role | Reached by `app.js`'s import graph? |
|---|---|---|---|
| `@noble/post-quantum` | 0.7.1 | Production, direct | Yes — `app.js` imports `@noble/post-quantum/ml-kem.js` directly |
| `@noble/hashes` | 2.4.0 | Production, transitive | Yes — `ml-kem.js` imports `sha3.js` and `utils.js` from it directly |
| `@noble/curves` | 2.4.0 | Production, transitive | Yes, narrowly — `ml-kem.js` → `_crystals.js` → `@noble/curves/abstract/fft.js` for NTT polynomial arithmetic only |
| `@noble/ciphers` | 2.4.0 | Production, transitive | **No** — declared as a dependency of `@noble/post-quantum`'s own `package.json`, but only imported by that package's `falcon.js`/`hybrid.js`, neither of which `app.js` imports. Present-only. |
| `esbuild` | 0.28.2 (+ platform binaries) | Dev, direct | No — build-time bundler only, not imported by application runtime code |

### Documentation/evidence discrepancy — unresolved, flagged

[brief.md](../../brief.md) still describes the application as using **RSA-OAEP** (2048-bit key, SHA-256 OAEP hash, 190-byte limit). This directly contradicts the current code evidence (ML-KEM-768 + HKDF-SHA-256 + AES-256-GCM, 1000-byte limit) confirmed in `app.js`, `app.bundle.js`, and `index.html`. No RSA/OAEP API call exists anywhere in the current source — this is **stale documentation**, not evidence of a second, parallel RSA code path. No RSA component has been modelled in this run's CBOM. Whether to update `brief.md` is a documentation decision outside this audit's scope; flagged here so the discrepancy is not mistaken for a finding of continued RSA use.

## IaC control evidence

| Profile | Source | Subject | Field | Safe value/status | Rule ID | Catalogue version |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

No rows: the bundled `terraform-hcl-scanner` (tool `gen-e2-iac-crypto-scanner` v0.4.0; catalogue `2026-10-29.1`) returned `no_files_detected` for all 16 supported profiles. No IaC/CI/container/deployment-configuration files exist in this repository (confirmed independently by workspace file search).

### IaC asset disposition

No scanner `asset_candidate` records were returned; nothing to disposition in this run.

## Category reconciliation

| Category | Status | Evidence / reason |
|---|---|---|
| Public-key / KEM operations | **found** | ML-KEM-768 keygen/encapsulate/decapsulate — [app.js](../../app.js#L60), [app.js](../../app.js#L70), [app.js](../../app.js#L177); parameter set confirmed against local installed library source |
| Symmetric operations | **found** | HKDF-SHA-256 key derivation and AES-256-GCM encrypt/decrypt via Web Crypto — [app.js](../../app.js#L63), [app.js](../../app.js#L72), [app.js](../../app.js#L154-L163) |
| Key and credential flow | **found** | In-memory KEM keypair + shared-secret→AES-key derivation flow traced end-to-end; no external credentials present |
| Other cryptographic functions | **found** (CSPRNG only) | [app.js](../../app.js#L62) (`crypto.getRandomValues`); no app-level HMAC/signing/password-hashing found |
| Protocols and services | **out of scope** | No network/TLS/protocol code exists in this client-only, backend-less demo |
| Implementation and dependency surfaces | **found** | `package.json`/`package-lock.json` dependency graph fully reconciled, including one present-but-unreached transitive dependency (`@noble/ciphers`) |
| Infrastructure/deployment configuration | **no evidence on inspected surfaces** (scanned) | All 16 scanner profiles ran to completion with `no_files_detected` |

## Unresolved questions

- Whether [brief.md](../../brief.md)'s stale RSA-OAEP description should be updated is a documentation/process decision outside this audit's scope (see "Documentation/evidence discrepancy" above).
- How to represent `@noble/ciphers` (locked as a dependency of `@noble/post-quantum` but not reached by this application's call path) is addressed in [classification.md](classification.md)'s library inventory: listed with its presence-only/not-reached status, not omitted.

## Coverage gaps and limitations

- **TLS negotiation**: not applicable — no network code or TLS configuration exists in this repository.
- **Secret values**: none found; none recorded. No standalone secret-presence scan was requested or run this pass.
- **Dependency internals**: `@noble/hashes` and `@noble/curves` were confirmed reached via their import graph and manifest entries but not inspected line-by-line beyond what was needed to establish reachability and the parameter set; `@noble/ciphers`'s internals were not inspected at all, since it is not reached.
- **Runtime behaviour**: no browser runtime/console observation was performed in this pass (static source analysis only); whether the application actually runs without error in a real browser was not re-verified here (that validation was separately performed, outside this audit pass, as part of the prior implementation step).
- **Excluded surfaces**: `quantum-audit-runs/` (including the prior run and its approvals/recommendation) was excluded entirely from source evidence per instruction.
- **Inventory completeness**: this is a static, single-pass source read; it is not a claim of exploitability, urgency, compliance status, or deployed/runtime behaviour.
