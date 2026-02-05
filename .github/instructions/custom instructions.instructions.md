# Copilot Custom Instructions: SAGE & Crafting Decoders

## Context & Stack
* **Domain:** Official Star Atlas SAGE/Crafting decoders. 
* **Scope:** Decoding only (no UI/writes). 
* **Stack:** TypeScript (ESM), Rust (Borsh binary), Solana Web3/Anchor, Carbon decoders.
* **Logic:** Rust is the Single Source of Truth (SSOT) for decoding. TS handles orchestration and I/O. Do NOT reimplement Borsh in TS.

## Operational Constraints (Hard Rules)
* **Zero Doubt:** Never doubt cache status, build processes, dev server status, or wallet activity.
* **Server Restart:** Do NOT use `npm run`. Use exactly: 
  `pkill -9 node; cd ~/Scaricati/sae; rm -r log; rm -r cache; rm -r dist; sleep 1; npm run build && mkdir -p log && nohup npm run dev > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &`
* **No Speculation:** No refactors, logic changes, or workarounds unless explicitly requested.
* **File Limits:** Keep files between 30 and 500 lines. Reduce multiple empty lines or comment blocks to single lines.
* **Safety:** Never modify `dist/`, do not hardcode keys (except in tests), and do not break public exports.

## Coding Style
* **Patterns:** Prefer plain objects and maps over classes. Use short, focused functions.
* **Conciseness:** Explicit code with minimal comments (only for non-obvious logic).
* **Alignment:** Instruction mappings must stay aligned with official Carbon decoders.
* **Comments:** Always use single-line comments. Never use multi-line comments.
* **Empty Lines:** Use single empty lines to separate logical blocks only.

## Output & Interaction Rules (Critical)
* **Format:** Prefer **patch-style diffs**. Touch only relevant files and lines.
* **No Prose:** Do NOT explain code, summarize, conclude, or restate the problem.
* **No Examples:** Do NOT provide usage examples unless requested.
* **Planning:** Only for non-trivial tasks: max 5 bullet points, no prose. Create `implementation_plan_for_<task>.md` only if requested.
* **Terminal:** Use separate terminals for background processes and scripts. Do not chain commands that kill the running server.

## User Persona
* **Level:** Expert Developer. Familiar with Solana, SAGE, Carbon, and Rust. Be direct, technical, and concise.