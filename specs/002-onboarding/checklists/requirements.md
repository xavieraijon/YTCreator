# Specification Quality Checklist: Onboarding — instalación y elección de la IA

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Iteración 1: quedan 3 marcadores [NEEDS CLARIFICATION] (FR-001 sistemas soportados, FR-008 servidor dentro o
  fuera, FR-018 opción gratuita), pendientes de la decisión del creador.
- Iteración 2 (2026-10-28): resueltos los 3 marcadores (macOS y Linux; servidor fuera; Gemini gratis). Se añade el
  patrón de as-video-studio: suscripción por defecto, inicio de sesión desde la app, varias cuentas en orden con paso
  a la siguiente si se agota el cupo y salud por cuenta (FR-008, FR-014–FR-016c, US4, SC-011, SC-012). Se quita la
  historia del servidor.
- Iteración 3 (2026-10-28): resuelto el último marcador (FR-015 / US2). En la v1 solo entra la suscripción de Claude,
  con varias cuentas, y el diseño queda abierto a otras. La checklist queda completa.
- Claude Code, Anthropic y los nombres de los fallos tipados aparecen porque los fija la constitución (principio IV);
  son decisiones de producto, no de implementación.
- Iteración 4 (2026-10-29): el creador retira la opción gratuita (Gemini). Constitución 2.0.0. Se añaden FR-001b y
  US1-8 (aviso en README e instalador), se reescriben FR-018, US2-7 y SC-005 (aviso en la bienvenida). Las
  suscripciones de otros proveedores (primero Gemini) quedan para una feature posterior.
