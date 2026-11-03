# Run information

- **Model**: Claude Sonnet 5 (GitHub Copilot)
- **Agent version**: `quantum-audit` 0.3.0 (gen-e2-quantum-agent bundle)
- **Repository path**: `/Users/llkuam/Documents/Projects/Quantum/pqc/marathon-app-tooling-testing`
- **Repository slug**: `marathon-app-tooling-testing`
- **Expected commit**: unknown (not provided by the human; repository is not a Git repository — confirmed by a prior `git status` attempt returning "not a git repository")
- **Observed HEAD**: not applicable (no Git repository)
- **Clean-worktree confirmation**: not applicable (no Git repository)
- **Generated output directory**: `quantum-audit-runs/20261102T035200Z/`
- **Run ID**: `20261102T035200Z`
- **Run timestamp (UTC, ISO 8601)**: `2026-11-02T03:52:00Z`

## Relationship to prior run

This is a **separate, explicitly authorised audit pass**, run after the implementation of approved migration tasks recorded in the prior run [`20261102T033125Z`](../20261102T033125Z/run-info.md). That prior run's `cbom.cdx.json`/`classification.md`/`findings-report.md` describe the pre-change (RSA-OAEP) snapshot and have not been modified by this pass. The prior run directory (including its `approvals.json`, `migration-recommendation.md`, and `tasks.json`) was excluded entirely from this pass's source evidence and inventory, per instruction — `quantum-audit-runs/` is never audited as part of the repository itself.

## Scope of this pass

Per explicit human instruction: **audit, CBOM generation, and classification only**. No migration recommendation was requested or produced in this run, and no existing files (source or prior run artefacts) were modified — this pass is read-only against the repository and writes only new files into this new run directory.
