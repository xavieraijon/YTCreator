# YTCreator

Self-hosted AI YouTube producer: it guides the creator from the idea to the package ready to publish.
Spec-Driven Development with GitHub Spec Kit (`/speckit-*`).

- **What can't be negotiated:** `.specify/memory/constitution.md`. It takes precedence over everything else.
- **Features:** `specs/NNN-name/` (spec → plan → tasks). One branch per feature.
- **Reference project (concepts only, not code):** `/Users/vueling/CanalYT`.
- Reply in Spanish. Code in English; specs and the interface in Spanish.
- Git identity of this repo: `Xavi Aijon <xavi.aijon@gmail.com>` (local).
- **Autonomía demostrada (constitución, principio XI):** cada fase o historia cierra con `/puerta-a`; informe en
  `checklists/validation.md`.
- **Huecos:** no se rellenan por suposición. Van a `specs/NNN/decisions.md`; el riesgo lo fija `.specify/memory/riesgo.md`.
- **Revisores:** `.claude/agents/revisor-*.md`, solo lectura y contexto limpio. `usuario-novato` sigue como puerta final.

## Status

- 001 `design-system-foundation`: **complete and merged into `main`** (PR #1, 2026-10-27). 105/105 tasks,
  aesthetic approved by the creator on 2026-10-27 (T104). Tokens in `packages/tokens`, components in
  `packages/ui`, catalog in `apps/catalog`. Validation in
  `specs/001-design-system-foundation/checklists/validation.md`. Branch deleted (local and remote).
- 002 `onboarding` (install + AI choice: Claude Code subscription or Anthropic API; **no free option in v1**,
  constitution 2.0.0): **complete and merged into `main`** (PR #2, 2026-10-31). 159 active tasks done (164 numbered,
  5 withdrawn). Validation in `specs/002-onboarding/checklists/validation.md`; T158 real-provider tests and T159
  novice audit (`specs/002-onboarding/novice-audit.md`, round 2 passed) done 2026-10-31. Open minor findings of the
  audit are left for the UI pass with Design mode.
- 003 `channel-and-niche`: **complete and merged into `main`** (PR #3, 2026-11-06). US1–US5 and Polish closed with
  Puerta A passed. Real YouTube tested only through yt-dlp (T125b, entry 141); real AI not tested. Novice audit passed
  in round 3 (`specs/003-channel-and-niche/novice-audit.md`); its open minors go to the UI pass with Design mode. P1,
  P3, P6 and P17 closed and merged on 2026-11-06 (PR #4, entries 148 to 152; P1 has no source, only marked as an
  assumption). P2, P4, P5, P8, P9 and P19 closed and merged on 2026-11-07 (PR #5, entries 153 to 158). Open:
  P36 (change the money category from the profile; not blocking). Reports in `specs/003-channel-and-niche/checklists/validation.md`.
- 004 `idea-bank`: **complete and merged into `main`** (PR #6, 2026-11-09). Novice audit passed in round 2
  (`specs/004-idea-bank/novice-audit.md`); its open mediums (home does not lead to the bank, queue without semaphore) and
  minors go to the UI pass with Design mode. Real AI and real YouTube not tested. No open items in its `decisions.md`; P1 moved to `specs/002-onboarding/decisions.md` (for a task after v1). Report in `specs/004-idea-bank/checklists/validation.md`.
- 005 `script-and-outline`: **complete and merged into `main`** (PR #7, 2026-11-12). US1–US7 and Polish closed with Puerta A; real AI
  tested with Claude Code (T087; the API timed out and became secondary). Novice audit passed in round 5
  (`specs/005-script-and-outline/novice-audit.md`); its open medium (home does not lead to the scripts, from 004) and
  minors go to the UI pass with Design mode. Open for the creator in its `decisions.md`: P2 (digits) and P3 (`WebFetch`).
  The server log hides links as well as keys. Report in `specs/005-script-and-outline/checklists/validation.md`.
  Branch deleted (local and remote).
- 006 `publishing-package`: **in progress** on branch `006-publishing-package`. Spec (3 creator clarifications) and plan
  done on 2026-11-12; tasks.md (74 tasks) too. Foundational, US1, US2 and US3 closed with Puerta A on 2026-11-13; next is
  US4 (Short package). Decisions in `specs/006-publishing-package/decisions.md`.
- Provider subscriptions beyond Claude are a later feature, not part of 002. First one planned: Gemini
  (Google AI Pro, with its CLI).
- Commands (Node 24, `fnm exec --using=24 --`): `pnpm dev` (server + web), `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm test:installer`, `pnpm test:e2e`, `pnpm format`; catalog with
  `pnpm --filter @ytcreator/catalog dev`.
- Planned order after 001: onboarding (install + AI choice) → channel and niche → idea bank → script and outline →
  publishing package → subtitles.
