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
- 003 `channel-and-niche` (branch `003-channel-and-niche`): **in progress**. Phases 1–7 done; US1–US5 closed with
  Puerta A passed (US5 on 2026-11-06 after three review rounds, P27–P34 answered by the creator). Remaining: Polish,
  T122–T128 (glossary pass, «why» test, hard-case e2e, real YouTube/AI tests T125b with the creator's approval,
  quickstart run, novice audit, Puerta A of Polish). Reports in `specs/003-channel-and-niche/checklists/validation.md`.
- Provider subscriptions beyond Claude are a later feature, not part of 002. First one planned: Gemini
  (Google AI Pro, with its CLI).
- Commands (Node 24, `fnm exec --using=24 --`): `pnpm dev` (server + web), `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm test:installer`, `pnpm test:e2e`, `pnpm format`; catalog with
  `pnpm --filter @ytcreator/catalog dev`.
- Planned order after 001: onboarding (install + AI choice) → channel and niche → idea bank → script and outline →
  publishing package → subtitles.
