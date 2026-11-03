# Classification — marathon-app-tooling-testing

Run: `20261102T033125Z` · Source: [cbom.cdx.json](cbom.cdx.json) · Findings: [findings-report.md](findings-report.md)

Labels follow the bundled `references/05-quantum-safe-and-unsafe-algorithms.md`; numeric levels follow `references/06-nist-security-level-mapping.md` (rule version `1.0`, a draft project methodology pending owner approval). `metadata.component` (`app:marathon-app-tooling-testing`) is application context only; it also appears in `components`, so it is covered in the table below rather than excluded.

## Classified crypto-asset table

| bom-ref | Asset | Label | NIST security level | Level status and source | Observed operation and evidence | Possible target standards and rationale | Reference section | Compatibility checks and still unknown |
|---|---|---|---|---|---|---|---|---|
| `app:marathon-app-tooling-testing` | Application root | `not-classified` | — | — | Application component, not itself a cryptographic algorithm or material. | — | — | — |
| `crypto:algorithm:rsa-oaep` | RSA-OAEP (PKE, keygen/encrypt/decrypt) | `quantum-vulnerable` | 0 | `project-mapped`; "NIST Security-Level Mapping reference" row "RSA, finite-field DH/DSA, elliptic-curve DH/signature families" | Key generation [app.js](../../app.js#L145-L154), encryption [app.js](../../app.js#L57), decryption [app.js](../../app.js#L63); 2048-bit modulus, SHA-256 OAEP hash | ML-KEM (FIPS 203) as a compatible key-establishment/encryption-operation replacement option | "Quantum-vulnerable public-key algorithms" | `Quantum-unsafe`. RSA is its own vulnerable family regardless of the exact scheme named. Protocol/platform/library/interoperability compatibility with ML-KEM for this exact use (encrypting a short UTF-8 message client-side with Web Crypto) is not checked. |
| `crypto:algorithm:sha-256` | SHA-256 (OAEP MGF1 hash parameter) | `quantum-resistant-at-appropriate-strength` | — | Omitted — the mapping's level-2 entry requires an evidenced *collision-resistance* use; this SHA-256 is evidenced only as the OAEP mask-generation (MGF1) hash parameter, not a standalone digest/collision-resistance operation, so the specific mapping rule does not clearly apply | [app.js](../../app.js#L150), `hash: "SHA-256"` inside `generateKey` | No target (symmetric/hash primitives have no PQC replacement target per this project) | "Hash function classifications"; "Symmetric encryption and hash algorithms: assess parameters and use" | `Quantum-safe at appropriate strength`. SHA-256 is an identified, named 256-bit-output SHA-2 variant, so the family classification applies even though it is not called as a standalone digest. No further unknowns identified. |
| `crypto:key:rsa-public` | RSA-OAEP public key (2048-bit) | `quantum-vulnerable` | — (not assigned to keys) | — | Generated [app.js](../../app.js#L145-L154); used in `encrypt` [app.js](../../app.js#L57) | ML-KEM (FIPS 203) public key, as a compatible replacement option for the key this protects | "Public and private key asset classifications" | `Quantum-unsafe`. Algorithm is evidenced (RSA-OAEP), so status follows directly; not inferred from public/private role. |
| `crypto:key:rsa-private` | RSA-OAEP private key (2048-bit, non-extractable) | `quantum-vulnerable` | — (not assigned to keys) | — | Generated [app.js](../../app.js#L145-L154) with `extractable: false`; used in `decrypt` [app.js](../../app.js#L63) | ML-KEM (FIPS 203) private key, as a compatible replacement option for the key this protects | "Public and private key asset classifications" | `Quantum-unsafe`. Algorithm is evidenced (RSA-OAEP); non-extractability and in-memory-only lifetime do not change the classification. |
| `crypto:material:rsa-oaep-ciphertext` | RSA-OAEP ciphertext | `not-classified` | — (not assigned to material) | — | Produced [app.js](../../app.js#L58), displayed [app.js](../../app.js#L59) and [app.js](../../app.js#L104), retained in the on-page message list for the session | Not applicable — ciphertext is protected data, not an algorithm; no target standard applies to the material itself | — | Ciphertext confidentiality depends entirely on the protecting algorithm (`crypto:algorithm:rsa-oaep`), which is separately classified `quantum-vulnerable` above. |

## Library inventory

| bom-ref | Library | Presence and dependency context | Evidenced algorithm or operation, if any | Limitations |
|---|---|---|---|---|
| `lib:web-crypto-api` | Web Crypto API (`SubtleCrypto`) | Browser-native global, called directly by application code; not an npm/package dependency and has no manifest/lockfile entry | `crypto.subtle.generateKey` [app.js](../../app.js#L145), `crypto.subtle.encrypt` [app.js](../../app.js#L57), `crypto.subtle.decrypt` [app.js](../../app.js#L63) — all RSA-OAEP | Implementation is host-browser-provided and not locally inspectable or versioned as a package; its internal RSA-OAEP implementation, randomness source, and any additional algorithms it supports beyond what this application invokes are not assessed. Library presence/capability does not by itself establish every operation it could perform — only the three calls above are evidenced as invoked. |

## Summary of `unknown` / `reference-gap` / `likely-quantum-vulnerable-unconfirmed` assets

None of the five non-library CBOM components received `unknown`, `reference-gap`, or `likely-quantum-vulnerable-unconfirmed` labels in this run — the repository's cryptographic surface is small and fully evidenced:

- `crypto:algorithm:rsa-oaep`, `crypto:key:rsa-public`, `crypto:key:rsa-private` → `quantum-vulnerable` (RSA family, evidenced algorithm and operations).
- `crypto:algorithm:sha-256` → `quantum-resistant-at-appropriate-strength` (identified 256-bit SHA-2 variant).
- `crypto:material:rsa-oaep-ciphertext` → `not-classified` (protected material, not an algorithm).

Limitations worth tracking even though they did not produce an `unknown`/`reference-gap` label:

- **Random number generation** is a known reference gap: `generateKey`'s internal randomness is delegated to the browser and was not modelled as a separate RNG component (no application-level RNG call exists to trace).
- **SHA-256's numeric NIST security level was omitted**, not because the hash is unidentified, but because the specific evidenced use (OAEP MGF1 parameter) does not clearly match the mapping reference's "collision-resistance use" condition required for the level-2 entry; treat this as a conservative omission, not a quantum-safety concern about the label itself.

## Compatibility note (all candidate target standards)

Candidate target standards listed above (ML-KEM, FIPS 203) are compatible options only, not a selected migration. Protocol, platform, library, certificate, and interoperability compatibility for replacing this application's RSA-OAEP encrypt/decrypt flow with ML-KEM-based key establishment (which would require pairing with a symmetric AEAD cipher, since ML-KEM is a KEM, not a direct PKE drop-in replacement for encrypting arbitrary short messages) have not been checked and are explicitly out of scope for this classification step. See [migration-recommendation.md](migration-recommendation.md) for a reviewable design candidate.
