---
description: "Use when working on Star Atlas SAGE decoding/orchestration tasks in this repository. Enforces minimal diffs, terse output, no build/test without user approval, and readonly usage of external knowledge repositories."
applyTo: "**"
---

# Copilot Instructions: SAGE, Rental, and Decoders

## 0) Default Execution Style
- Minimalism first: prefer the smallest correct diff and the fewest touched files.
- Change only what is required for the request; avoid speculative cleanup/refactors.
- Keep code, comments, and explanations as short as possible.
- Never run `build`, `test`, or other verification commands unless the user explicitly asks for them.
- If verification could help, ask the user first.
- Use as few tokens as practical in every response.

## 1) Project Domain and SSOT
- Domain: Star Atlas SAGE and related rental/crafting decoding and orchestration.
- Runtime scope: backend decoding, transaction orchestration, cache-aware analysis; no speculative UI rewrites.
- Stack: TypeScript (ESM), Rust (borsh-backed decoding), Solana web3.js, Anchor, Carbon decoders, StarAtlasMeta-related references.
- Single source of truth (SSOT): Rust decoding logic and official decoder/account layouts.
- Rule: Do not reimplement Borsh decoding logic in TypeScript if Rust/official decoder source already defines it.

## 2) Architecture and Integration Rules
- Keep TS focused on orchestration, I/O boundaries, API shaping, and aggregation.
- Keep binary decoding, discriminator mapping, and layout truth aligned to Rust + official IDL/decoder sources.
- Favor deterministic mapping layers from raw chain data to typed domain objects.
- Preserve public exports and existing module contracts unless explicitly requested.
- For Anchor integration, keep account names and instruction mapping strictly consistent with IDL.

## 3) Safety and Change Boundaries
- Never modify `dist/` artifacts.
- Never hardcode private keys or secrets (tests/mocks excluded when explicitly requested).
- Avoid destructive operations on cache/log/build folders unless explicitly requested.
- No speculative refactors, logic rewrites, or workaround behavior changes without user request.
- Keep edits scoped to the minimal necessary files/lines.

## 4) External Knowledge Repositories (Read-Only)
- Knowledge root: `/home/luca/Scaricati/staratlasRepo/**`.
- Read-only policy: treat every file in this path as reference material.
- Allowed operations: read, search, compare, summarize, extract APIs/contracts/caveats.
- Forbidden operations: create, edit, rename, move, delete within the knowledge root.
- Write boundary: implementation changes must target `/home/luca/sae/**` unless the user explicitly authorizes otherwise.
- Pre-write guard: validate destination path is outside the knowledge root before every write/edit action.

## 5) Coding Conventions
- Prefer short, focused functions and explicit data flow.
- Prefer plain objects/maps where they improve clarity; use classes only when justified by lifecycle/state behavior.
- Keep comments minimal and high-value.
- Use single-line comments only.
- Keep vertical spacing compact and consistent.
- Keep files reasonably sized and maintainable; split by responsibility when complexity grows.

## 6) Decoder Quality Rules
- Keep instruction/account mappings aligned with official Carbon decoders and IDLs.
- Preserve canonical seed derivations and PDA conventions.
- Validate numeric precision boundaries (BN/u64/i64) and signedness assumptions.
- Document non-obvious field assumptions near the mapping layer.
- Prefer explicit type guards/parsers at chain-data boundaries.

## 7) Operational Rules
- Use patch-style, minimal diffs by default.
- Never execute `build`, `test`, or validation commands proactively; ask the user first.
- Keep terminals separated for long-running services vs one-off scripts.
- When restarting the backend is explicitly requested, use the exact command provided by the user/project conventions.
- Do not chain commands that could unintentionally kill unrelated running processes.

## 8) Communication Style
- Assume expert audience (Solana, SAGE, Anchor, Rust, Borsh).
- Be direct, technical, and minimal.
- Prefer terse answers: concrete findings, risks, and exact file-level changes only.
- Avoid long explanations when a short answer is sufficient.