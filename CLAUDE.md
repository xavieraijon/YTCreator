# YTCreator

Self-hosted AI YouTube producer: it guides the creator from the idea to the package ready to publish.
Spec-Driven Development with GitHub Spec Kit (`/speckit-*`).

- **What can't be negotiated:** `.specify/memory/constitution.md`. It takes precedence over everything else.
- **Features:** `specs/NNN-name/` (spec → plan → tasks). One branch per feature.
- **Reference project (concepts only, not code):** `/Users/vueling/CanalYT`.
- Reply in Spanish. Code in English; specs and the interface in Spanish.
- Git identity of this repo: `Xavi Aijon <xavi.aijon@gmail.com>` (local).

## Status

- 001 `design-system-foundation`: **complete** (105/105 tasks), aesthetic approved by the creator on 2026-10-27
  (T104). Tokens in `packages/tokens`, components in `packages/ui`, catalog in `apps/catalog`. Validation in
  `specs/001-design-system-foundation/checklists/validation.md`. Branch `001-design-system-foundation`, to be
  merged into `main`.
- **Next feature: 002 onboarding** (install + AI choice: Claude Code CLI, Anthropic API, one free option). Start
  with `/speckit-specify`, with the creator's approval at each phase.
- Commands (Node 24, `fnm exec --using=24 --`): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`,
  `pnpm format`; catalog with `pnpm --filter @ytcreator/catalog dev`.
- Planned order after 001: onboarding (install + AI choice) → channel and niche → idea bank → script and outline →
  publishing package → subtitles.
