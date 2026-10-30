---
description: "Checklist de diseño: coherencia visual de botones y acciones en la feature 002"
---

# Design Checklist: Onboarding — coherencia visual de acciones

**Purpose**: validar que los requisitos de `contracts/ui-screens.md` (y, por delegación, de `packages/ui`)
especifican con claridad qué variante de acción usar en cada caso, antes de que una pantalla nueva repita la
confusión observada en `ConnectSubscription` (botones *ghost* poco visibles, enlace «Abrir la página de Claude»
junto a un botón en la misma fila).
**Created**: 2026-10-29
**Feature**: [spec.md](../spec.md), [contracts/ui-screens.md](../contracts/ui-screens.md)

**Note**: generada por `/speckit-checklist` a partir de lo observado en `ConnectSubscription`.
**Review Ownership**: checklist de propiedad del revisor. Marcar `[x]` solo cuando el revisor considera que el
criterio de calidad del requisito está satisfecho.
**Marker Semantics**: `[x]` no significa que la implementación esté terminada, solo que el requisito está bien
escrito.

## Jerarquía de acciones

- [ ] CHK001 ¿Especifica el contrato, para cada acción de cada pantalla, qué variante de botón le corresponde
  (principal, secundaria, *ghost*, enlace), en vez de dejarlo a elección de quien implemente?
  [Completeness, Spec §Estructura común]
- [ ] CHK002 `contracts/ui-screens.md` nombra «enlace secundario» para «Lo haré más tarde» y «botón secundario»
  para «Volver»: ¿define el contrato el criterio general que distingue cuándo una acción secundaria es un enlace
  y cuándo es un botón, o son dos casos sueltos sin regla? [Clarity, Ambiguity, Spec §Estructura común]
- [ ] CHK003 ¿Existe un requisito explícito que prohíba mezclar, en una misma fila de acciones, un enlace y un
  botón que hacen cosas del mismo tipo (por ejemplo, dos acciones secundarias)? [Gap]
- [ ] CHK004 ¿Define el contrato qué variante usa una acción que repite o reemplaza a otra en el mismo paso (p.
  ej. «Pedir un enlace nuevo» dentro de un paso de conexión), para que no quede como una tercera variante sin
  nombrar? [Gap, Spec §Pantallas del asistente]

## Acciones externas frente a navegación interna

- [ ] CHK005 ¿Especifica el contrato una variante propia (o una regla) para las acciones que abren una pestaña
  nueva fuera de la app (p. ej. «Abrir la página de Claude»), distinta de la navegación dentro del asistente?
  [Gap]
- [ ] CHK006 ¿Es medible la diferencia entre «acción que navega dentro de la app» y «acción que sale de la app»
  tal como está escrita, o depende de la intuición de quien lo construye? [Measurability]

## Contraste y visibilidad

- [ ] CHK007 ¿Hace referencia el contrato a un requisito de contraste mínimo de las acciones *ghost* en los dos
  temas (claro y oscuro), más allá del axe genérico de SC-010? [Coverage, Gap]
- [ ] CHK008 ¿Es «discreto» o «secundario», tal como se usa en `contracts/ui-screens.md` (p. ej. en
  `UpdateNotice`), un término cuantificado con una propiedad visual concreta, o queda abierto a interpretación?
  [Ambiguity, Spec §Estructura común]

## Consistencia entre pantallas

- [ ] CHK009 ¿Usan los mismos nombres de acción (p. ej. «Volver», «Lo haré más tarde») la misma variante en todas
  las pantallas donde aparecen (asistente y Ajustes), según el contrato? [Consistency, Spec §Rutas]
- [ ] CHK010 ¿Especifica el contrato si una pantalla fuera del asistente (p. ej. `ChangeAi` en Ajustes) hereda las
  mismas reglas de jerarquía de acciones que su equivalente dentro del asistente, o puede variar? [Consistency,
  Gap]

## Trazabilidad con el sistema de diseño

- [ ] CHK011 ¿Remite el contrato a los tokens o componentes concretos de `packages/ui` para cada variante
  mencionada, o solo dice «usa el design system» sin más detalle verificable? [Traceability, Spec §Estructura
  común]
- [ ] CHK012 Si una pantalla necesita una variante que `packages/ui` no ofrece todavía, ¿dice el contrato qué
  hacer (pedirla al sistema de diseño, aproximarla con una existente) en vez de dejarlo sin resolver? [Gap,
  Exception Flow]

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied
- Leave items unchecked when they still require clarification, correction, or reviewer evaluation
- `/speckit-implement` reads checklist checkbox state as a gate and must not modify markers
- `checklists/requirements.md` has a separate built-in lifecycle maintained by `/speckit-specify` and
  `/speckit-clarify`
- CHK002 señala una discrepancia ya observada entre el contrato (enlace/botón secundario) y el código actual
  (`Button variant="ghost"` para ambos en `ConnectSubscription`/`LoginCodeForm`); conviene resolverla al revisar
  este checklist, no solo documentarla
