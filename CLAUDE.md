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
  constitution 2.0.0): **complete, branch `002-onboarding`, pending PR to `main`** (revised 2026-10-29). spec, plan, research,
  data-model, contracts, quickstart and tasks (164 tasks: 5 withdrawn, 4 new, including T164 — visual review
  against `checklists/design.md`) done; three `/speckit-analyze` passes with all findings fixed (0 critical/high).
  The free-Gemini code already written (adapter, registry, DB check, UI) was removed in this revision. All 159
  active tasks done (164 numbered, 5 withdrawn). Validation in
  `specs/002-onboarding/checklists/validation.md`: T157's pass found and fixed three real installer/launcher bugs
  (`APP_HOME` path at `migrate`, `open`/`serve` silently no-op'ing through the `current` symlink, step 8 hanging
  forever once `open` actually blocks), confirmed with a real Docker install. T158 (real-provider manual tests) done
  2026-10-31, with four bugs found and fixed. T159 (novice audit) done
  2026-10-31 by the `usuario-novato` agent: round 2 passed (0 graves, 3 medios, left open as improvements), report in
  `specs/002-onboarding/novice-audit.md`.
  Creator's approval at each phase.
- Provider subscriptions beyond Claude are a later feature, not part of 002. First one planned: Gemini
  (Google AI Pro, with its CLI).
- Commands (Node 24, `fnm exec --using=24 --`): `pnpm dev` (server + web), `pnpm lint`, `pnpm typecheck`,
  `pnpm test`, `pnpm test:installer`, `pnpm test:e2e`, `pnpm format`; catalog with
  `pnpm --filter @ytcreator/catalog dev`.
- Planned order after 001: onboarding (install + AI choice) → channel and niche → idea bank → script and outline →
  publishing package → subtitles.
