# Migration recommendation — marathon-app-tooling-testing

Run: `20261102T033125Z` · Source artefacts: [cbom.cdx.json](cbom.cdx.json), [classification.md](classification.md), [findings-report.md](findings-report.md), [run-info.md](run-info.md)

This document is a reviewable proposal. It does not authorise source edits, dependency changes, key changes, another audit pass, or deployment. No task below has been implemented.

## 1. Decision Summary

- **Finding**: the application's only cryptographic operation is RSA-OAEP (2048-bit modulus, SHA-256 OAEP hash) used to directly encrypt and decrypt a short (≤190-byte) UTF-8 message client-side with the Web Crypto API (`crypto.subtle.generateKey`/`encrypt`/`decrypt` — [app.js](../../app.js#L145-L154), [app.js](../../app.js#L57), [app.js](../../app.js#L63); `bom-ref` `crypto:algorithm:rsa-oaep`). This is classified `quantum-vulnerable` in [classification.md](classification.md).
- **Operation**: direct public-key encryption of application data ("encrypt arbitrary short plaintext, decrypt it back"), not key establishment for a separate symmetric channel and not a signature.
- **Recommendation status**: **no direct target in the approved crosswalk, with a redesign candidate for review.** The approved crosswalk maps ML-KEM (FIPS 203) to key-establishment/shared-secret-setup operations and ML-DSA/SLH-DSA (FIPS 204/205) to signature operations. None of the three final NIST PQC standards performs "encrypt an arbitrary short message directly with a public key", so there is no drop-in replacement for the RSA-OAEP call as currently used.
- **Proposed target**: not selected. A concrete, explicitly **unapproved** redesign candidate is presented in §5 — a hybrid ML-KEM key-establishment + AES-256-GCM content-encryption envelope — for owner and qualified cryptography review. This replaces direct public-key message encryption with the standard pattern used to achieve PQC-safe "encrypt data to a public key" behaviour.
- **Blocking gates**: (a) owner/cryptography-review approval of the redesign candidate and exact construction (task `design-01`); (b) selection and approval of an ML-KEM parameter set and implementation/library, since no ML-KEM implementation is available in this repository or in mainstream `SubtleCrypto` today (task `design-02`); (c) a tooling decision, since this is currently a zero-dependency, build-free static site with no `package.json` (task `design-03`).

## 2. Evidence Boundary

| Asset / concern | Run evidence | Migration relevance |
|---|---|---|
| RSA-OAEP algorithm (`crypto:algorithm:rsa-oaep`) | [app.js](../../app.js#L145-L154) (keygen), [app.js](../../app.js#L57) (encrypt), [app.js](../../app.js#L63) (decrypt); classified `quantum-vulnerable`, NIST level 0 (`project-mapped`) | Primary migration subject — the operation to replace. |
| RSA-OAEP public/private keys (`crypto:key:rsa-public`, `crypto:key:rsa-private`) | Generated at [app.js](../../app.js#L145-L154); private key non-extractable; in-memory only, regenerated per page load | Both classified `quantum-vulnerable`; retired together with the algorithm, no separate key-migration/rotation concern since nothing persists them. |
| SHA-256 (OAEP MGF1 hash) (`crypto:algorithm:sha-256`) | [app.js](../../app.js#L150) | Classified `quantum-resistant-at-appropriate-strength`; not itself a migration target, but the replacement construction will still need a hash/KDF — see §5. |
| RSA-OAEP ciphertext (`crypto:material:rsa-oaep-ciphertext`) | Produced/displayed at [app.js](../../app.js#L58-L59), [app.js](../../app.js#L104) | Confidentiality depends entirely on the algorithm above; not separately actionable. |
| Web Crypto API (`lib:web-crypto-api`) | Direct calls at [app.js](../../app.js#L57), [app.js](../../app.js#L63), [app.js](../../app.js#L145) | Supports AES-256-GCM and HKDF natively (used in the redesign candidate) but, to current platform knowledge, does **not** expose FIPS 203 ML-KEM primitives in mainstream browsers. This is platform knowledge, not repository evidence — verify current browser/engine support before relying on it. |
| No manifest/lockfile/build tooling | [findings-report.md](findings-report.md) — "Implementation and dependency surfaces" | Any PQC library addition requires a new tooling decision (see `design-03`); this is currently a zero-build static site (`index.html` + `app.js` + `styles.css`). |
| No IaC/deployment configuration | [findings-report.md](findings-report.md) — "IaC control evidence" | Nothing to update at the infrastructure/deployment-configuration layer for this change. |

## 3. Migration Risk And Planning Context

- The application has no backend, no persisted keys, and no network transmission of key material or ciphertext ([brief.md](../../brief.md#L5), [findings-report.md](findings-report.md)); it is a client-only educational/demo page. This audit does not assign a risk score, urgency, or harvest-now-decrypt-later applicability — those require approved criteria and context not supplied here.
- Open planning questions the owner should answer, not inferred from evidence: is this demo meant to remain backend-free and dependency-free, or is adding a JS/WASM PQC library and a build step acceptable? Is there a compatibility requirement (must still run as a static page with no bundler), or can a bundler/package manager be introduced?
- No existing tests, CI, or regression suite was found to validate a behavioural change; any implementation would need manual or newly authored validation (see §6).

## 4. Target Assessment

- **ML-KEM (FIPS 203)**: designed for key encapsulation / key establishment, not for directly encrypting arbitrary application data. It cannot be substituted 1:1 for `crypto.subtle.encrypt({name:"RSA-OAEP"}, publicKey, messageBytes)`. It is applicable only as the key-establishment component of a composed envelope (§5).
- **ML-DSA (FIPS 204) / SLH-DSA (FIPS 205)**: signature standards. No signature operation is evidenced in this repository ([classification.md](classification.md) — no `sign`/`verify` calls found), so neither applies here.
- **SP 800-227**: KEM implementation/use guidance, not an algorithm; relevant only to how ML-KEM is used inside the candidate construction in §5, not as a standalone replacement.
- **Conclusion**: there is no direct, standards-approved replacement for "RSA-OAEP encrypt/decrypt of an arbitrary short message" as a single operation. A redesign is required to express the same user-facing behaviour (encrypt a message to a public key; decrypt it with the matching private key) using standard-compliant building blocks.

## 5. Proposed Redesign Candidate — unapproved, for owner and qualified cryptography review

**Candidate architecture**: replace direct RSA-OAEP public-key encryption of the message with a hybrid "KEM + AEAD" envelope:

1. **Key establishment**: generate an ML-KEM key pair (candidate parameter set: ML-KEM-768, NIST security category 3 — chosen here only as a plausible like-for-like candidate against the current 2048-bit RSA modulus; the exact parameter set is a `design-02` decision, not settled by this document).
2. **Encapsulation (replaces `crypto.subtle.encrypt` at [app.js](../../app.js#L57))**: use the ML-KEM public key to encapsulate a shared secret, producing a KEM ciphertext.
3. **Key derivation**: derive a 256-bit content-encryption key from the shared secret using HKDF-SHA-256 (natively available via `crypto.subtle.deriveKey`/`deriveBits` with `"HKDF"` — no new dependency for this step).
4. **Content encryption**: encrypt the UTF-8 message with AES-256-GCM (natively available via `crypto.subtle.encrypt({name:"AES-GCM", iv})` — no new dependency for this step), using a fresh random IV (`crypto.getRandomValues`, currently absent from the codebase and needed here).
5. **Decapsulation/decryption (replaces `crypto.subtle.decrypt` at [app.js](../../app.js#L63))**: the matching ML-KEM private key decapsulates the shared secret, re-derives the same AES key via HKDF, and AES-256-GCM-decrypts the message.
6. **Transport/display format**: the "ciphertext" shown to the user (currently the raw RSA-OAEP output, [app.js](../../app.js#L58-L59)) becomes a structured bundle of {KEM ciphertext, IV, AEAD ciphertext+tag}; the UI copy describing "RSA-OAEP ciphertext" ([index.html](../../index.html#L89-L92)) needs updating to avoid misrepresenting the new construction.

**Behavioural consequences**: message size limits, timing, and the exact byte layout shown in the demo will all change. ML-KEM key/ciphertext sizes are larger than RSA-2048's; the 190-byte plaintext limit tied to RSA-OAEP's padding overhead ([app.js](../../app.js#L13), [app.js](../../app.js#L37-L38)) no longer applies in the same way, since AES-GCM has no comparable plaintext-size ceiling — this limit should be re-derived or removed, which is itself a review decision.

**Component roles**: ML-KEM (confidentiality/key establishment only) + HKDF-SHA-256 (key derivation only) + AES-256-GCM (content confidentiality and integrity only). None of these standards specifies the complete combined construction as a single named standard for this use case; SP 800-227 gives KEM usage guidance but does not itself certify this particular KEM+HKDF+AEAD composition. **This composition is not itself a standardised construction** and requires qualified cryptography review before any implementation, specifically: correct context/label binding in the HKDF step, nonce/IV uniqueness guarantees for AES-GCM, and confirmation that encapsulation output and AEAD ciphertext are not misattributed as "the RSA-OAEP equivalent" in any future audit.

**Source-boundary limitation**: this candidate names ML-KEM, HKDF-SHA-256, and AES-256-GCM as review candidates only, per the classifier's approved crosswalk and the "Symmetric encryption and hash algorithms" reference section; it does not select a specific JS/WASM ML-KEM library, package name, or version — that is an explicit, separate decision (`design-02`) requiring human approval before any dependency is added.

**Assumptions**: (a) Web Crypto's native HKDF and AES-GCM support is usable as-is (needs confirmation in the target browser/runtime); (b) an ML-KEM implementation suitable for a browser context exists and can be vetted (needs confirmation); (c) the project is willing to accept a new external dependency and, likely, a build step, in a currently dependency-free static site (needs an explicit owner decision — `design-03`).

**If no candidate were supportable**: not applicable here — a candidate is described above. The blockers that remain are the three design gates (`design-01`–`design-03`), not an absence of any plausible architecture.

## 6. Actionable Migration Tasks

All tasks are recommendations only; none are approved or implemented.

| ID | File / surface | Action | Dependency / approval gate | Completion evidence |
|---|---|---|---|---|
| `design-01` | N/A (decision) | Owner and qualified cryptography review of the hybrid ML-KEM + HKDF-SHA-256 + AES-256-GCM redesign candidate in §5, including HKDF context binding and GCM nonce handling | None (first gate) | Recorded design approval/rejection |
| `design-02` | N/A (decision) | Select exact ML-KEM parameter set (candidate: ML-KEM-768) and a specific vetted JS/WASM ML-KEM implementation (package name + pinned version) | Depends on `design-01` | Recorded parameter-set and library selection |
| `design-03` | N/A (decision); would create `package.json` (and a lockfile) if approved | Decide whether to introduce a package manager/build step into this currently zero-dependency static site, or vendor a single-file implementation instead | Depends on `design-01`, `design-02` | Recorded tooling decision |
| `install-01` | New `package.json` / lockfile, or a vendored file under the repository root | Add the approved ML-KEM dependency via the project's chosen package manager (exact command depends on `design-03`), or vendor the file | Depends on `design-02`, `design-03` (installation is a separate approval from design/task approval) | Dependency present and resolvable; lockfile updated if applicable |
| `task-01` | [app.js](../../app.js#L145-L154) | Replace `crypto.subtle.generateKey({name:"RSA-OAEP", ...})` with ML-KEM key-pair generation using the approved library/parameter set | Depends on `install-01` | New key-generation code path exercised manually; no RSA-OAEP calls remain at this location |
| `task-02` | [app.js](../../app.js#L57) | Replace the encrypt path: ML-KEM encapsulate → HKDF-SHA-256 derive 256-bit key → AES-256-GCM encrypt with a fresh random IV (`crypto.getRandomValues`) | Depends on `task-01` | Encrypt path produces the new {KEM ciphertext, IV, AEAD ciphertext+tag} bundle; manual round-trip succeeds |
| `task-03` | [app.js](../../app.js#L63) | Replace the decrypt path: ML-KEM decapsulate with the private key → HKDF-SHA-256 re-derive the same key → AES-256-GCM decrypt | Depends on `task-02` | Decrypted message matches the original for a representative set of manual test messages |
| `task-04` | [app.js](../../app.js#L13-L14), [app.js](../../app.js#L37-L38) | Re-derive or remove the 190-byte plaintext limit tied to RSA-OAEP padding overhead, replacing it with limits appropriate to the new AES-GCM-based construction | Depends on `task-02`, `task-03` | Updated limit documented and enforced; UI message updated accordingly |
| `task-05` | [index.html](../../index.html#L5), [index.html](../../index.html#L89-L92) | Update UI copy/labels referring to "RSA-OAEP" to describe the new construction accurately | Depends on `task-02`, `task-03` | Page text matches the implemented algorithm; no stale "RSA-OAEP" claims remain |
| `task-06` | N/A (process) | Run a fresh, separately authorised audit pass to regenerate the CBOM/classification/findings for the changed code | Depends on `task-01`–`task-05`; requires new explicit human authorisation for another audit pass | New run directory with updated `cbom.cdx.json` showing no remaining `quantum-vulnerable` components for this operation |

## 7. Decisions And Evidence Needed

- **Owner/security decision**: is the hybrid ML-KEM + HKDF + AES-GCM composition acceptable, or is a different reviewer-approved construction preferred (`design-01`)?
- **Compatibility decision**: confirm current ML-KEM availability (or lack thereof) in the target browsers' native `SubtleCrypto`, and in any JS/WASM library under consideration, before selecting one (`design-02`).
- **Tooling decision**: whether this project accepts a package manager/build step, or requires a vendored single-file approach, given it is currently build-free (`design-03`).
- **Data-lifecycle decision**: none identified — keys and messages are in-memory only and already regenerated per page load; this property should be preserved in the new design but is not itself in question.
- **Source-boundary decision**: no local or vetted public ML-KEM implementation currently exists in or for this repository; package selection and provenance verification is an explicit, separate step from this recommendation.
- **Operational decision**: whether `task-04`'s plaintext-size change requires updated user-facing documentation beyond `task-05`.

## 8. Human Review Boundary

This document does not approve any source edit, dependency change, key change, another audit pass, or deployment. It is a reviewable proposal only. Implementation of any task above requires separate, explicit, per-task human approval (see the bundled implementation skill), and the design gates (`design-01`–`design-03`) must be approved before their dependent tasks may be treated as ready. A later deployment, if any, requires its own separate approval gate not addressed here.
