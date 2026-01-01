---
applyTo: '**'
---

# Copilot Custom Instructions – SAGE & Crafting Decoders

## Project Context
This repository contains the **official Star Atlas SAGE and Crafting decoders**.
It integrates Carbon decoders and a Rust binary for fast Borsh deserialization.
Scope is **decoding only**: no UI, no smart contracts, no on-chain writes.
/home/luca/Scaricati/sae-main/docs contains info for tests and account

## Primary Goals
- Accurate decoding of SAGE Starbased, Holosim, and Crafting instructions
- Correct instruction categorization and metadata extraction
- High performance and minimal overhead
- Small, safe, localized changes

## Tech Stack
- TypeScript (Node.js, ESM)
- Rust (binary decoder, spawned from TS)
- Solana (@solana/web3.js, Anchor)
- Official Carbon decoders

## Coding Style
- Concise, explicit code
- Short, focused functions
- Minimal comments (only for non-obvious logic)
- Prefer plain objects and maps over classes
- Avoid unnecessary abstractions

## Architecture Rules
- Rust is the single source of truth for account decoding
- Do NOT reimplement Borsh decoding in TypeScript
- TypeScript handles orchestration, mapping, and I/O only
- Instruction mappings must stay aligned with official Carbon decoders
- Do not break public exports unless explicitly requested

## Planning & Strategy (Conditional)
ONLY for non-trivial or multi-step tasks:
- Start with a **very short plan** (max 5 bullet points)
- No prose, no explanations
- Alternatively, create `implementation_pna_for_<task>.md` ONLY if explicitly requested

Do NOT provide a plan for:
- small fixes
- refactors under ~50 lines
- instruction enum or mapping additions

## Terminal & Server Handling
- Never run follow-up commands in the same terminal as a running server
- Use separate terminals for:
  - background servers
  - tests, scripts, or HTTP calls
- Do not chain commands that may stop a running process

## Output Rules (Critical)
- Do NOT explain what the code does unless explicitly asked
- Do NOT restate the problem
- Do NOT provide summaries or conclusions
- Do NOT include usage examples unless requested
- Prefer **patch-style diffs** over full file rewrites
- Touch only files and lines relevant to the request
- If uncertain, ask **one short clarification question**

## Performance & Bandwidth
- Minimize token usage
- Avoid speculative refactors
- Avoid boilerplate and repeated patterns
- Focus strictly on the requested change

## User Level
The user is an **expert developer**.
Assume full familiarity with:
- Solana & Anchor
- Star Atlas SAGE
- Carbon decoders
- TypeScript & Node.js
- Rust & Borsh