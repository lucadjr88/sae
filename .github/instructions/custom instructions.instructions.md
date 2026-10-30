---
description: "Use when working on Star Atlas SAGE decoding/orchestration tasks in this repository. Enforces minimal diffs, terse output, fast searches, no build/test without user approval, and readonly usage of external knowledge repositories."
applyTo: "**"
---

# Copilot Instructions: SAGE, Rental, and Decoders

## 0) Default Execution Style
- Minimalism first: smallest correct diff, fewest touched files, zero speculative refactors.
- Keep code, comments, and explanations terse; use as few tokens as practical.
- Never run `build`, `test`, or verification commands unless explicitly requested; ask first if needed.

## 1) Project Domain and SSOT
- Domain: Star Atlas SAGE, rental/crafting backend decoding, transaction orchestration, cache-aware analysis (no speculative UI rewrites).
- Stack: TypeScript (ESM), Rust (borsh), Solana web3.js, Anchor, Carbon decoders, StarAtlasMeta.
- SSOT: Rust decoding logic and official decoder/account layouts.
- Rule: Never reimplement Borsh decoding in TypeScript if Rust/official decoders already define it.

## 2) Architecture and Integration Rules
- TS scope: orchestration, I/O boundaries, API shaping, aggregation.
- Rust/IDL scope: binary decoding, discriminator mapping, layout truth.
- Favor deterministic mapping from raw chain data to typed domain objects.
- Preserve public exports, module contracts, and strict IDL account/instruction alignment unless requested otherwise.

## 3) Safety and Change Boundaries
- Never modify `dist/` artifacts or hardcode secrets/private keys.
- Never delete/wipe cache, log, or build folders unless explicitly requested.
- Scope edits strictly to the minimal necessary lines.

## 4) External Knowledge Repositories (Read-Only)
- Read-only roots: `/home/luca/Scaricati/staratlasRepo/**`, `/home/luca/sdu-map/**`, `/home/luca/condivisione/**`, `/home/luca/sly/**`.
- Allowed: read, fast search, compare, extract APIs/contracts.
- Forbidden: create, edit, rename, move, or delete anywhere inside read-only roots.
- Write boundary: target `/home/luca/sae/**` only, unless explicitly authorized. Validate destination path before every write.

## 5) Coding Conventions
- Short, focused functions; explicit data flow; compact vertical spacing.
- Prefer plain objects/maps over classes unless lifecycle/state requires it.
- Comments: minimal, high-value, single-line (`//`) only.

## 6) Decoder Quality Rules
- Align instruction/account mappings, PDA seeds, and layouts strictly with official Carbon decoders and IDLs.
- Validate numeric precision boundaries (`BN`/`u64`/`i64`) and signedness.
- Use explicit type guards/parsers at chain-data boundaries; document non-obvious field assumptions near the mapping layer.

## 7) Operational & Search Rules
- Use patch-style, minimal diffs.
- Search performance: NEVER run unfiltered `grep -rn` or `find` across directories.
- Prefer `rg` (ripgrep) or native IDE search tools. If `grep` is unavoidable, always pass `--exclude-dir={node_modules,venv,.venv,target,dist,build,.git,__pycache__}` and `--exclude="*.{db,sqlite,sqlite3,log,bin}"`.
- Keep terminals separated for long-running services vs one-off scripts.
- Use exact user-provided commands for backend restarts; never chain commands that risk killing unrelated processes.

## 8) Communication Style
- Audience: Expert (Solana, SAGE, Anchor, Rust, Borsh).
- Output: Direct, technical, minimal. State concrete findings, risks, and exact file changes only.