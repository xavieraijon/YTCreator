# YTCreator

Self-hosted AI YouTube producer: it guides the creator from the idea to the package ready to publish.
Spec-Driven Development with GitHub Spec Kit (`/speckit-*`).

- **What can't be negotiated:** `.specify/memory/constitution.md`. It takes precedence over everything else.
- **Features:** `specs/NNN-name/` (spec → plan → tasks). One branch per feature.
- **Reference project (concepts only, not code):** `/Users/vueling/CanalYT`.
- Reply in Spanish. Code in English; specs and the interface in Spanish.
- Git identity of this repo: `Xavi Aijon <xavi.aijon@gmail.com>` (local).

## Status

- 001 `design-system-foundation`: **complete and merged into `main`** (PR #1, 2026-10-27). 105/105 tasks,
  aesthetic approved by the creator on 2026-10-27 (T104). Tokens in `packages/tokens`, components in
  `packages/ui`, catalog in `apps/catalog`. Validation in
  `specs/001-design-system-foundation/checklists/validation.md`. Branch deleted (local and remote).
- 002 `onboarding` (install + AI choice: Claude Code subscription or Anthropic API; **no free option in v1**,
  constitution 2.0.0): **design complete, branch `002-onboarding`** (revised 2026-10-29). spec, plan, research,
  data-model, contracts, quickstart and tasks (163 tasks: 5 withdrawn, 3 new) done; three `/speckit-analyze` passes
  with all findings fixed (0 critical/high). The free-Gemini code already written (adapter, registry, DB check,
  UI) was removed in this revision. 73/163 tasks done (US1 complete, AI port foundation). **To resume:
  `/speckit-implement`**, starting with the spikes S1–S5 in `research.md` (S6 withdrawn). Creator's approval at
  each phase.
- Provider subscriptions beyond Claude are a later feature, not part of 002. First one planned: Gemini
  (Google AI Pro, with its CLI).
- Commands (Node 24, `fnm exec --using=24 --`): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`,
  `pnpm format`; catalog with `pnpm --filter @ytcreator/catalog dev`.
- Planned order after 001: onboarding (install + AI choice) → channel and niche → idea bank → script and outline →
  publishing package → subtitles.
