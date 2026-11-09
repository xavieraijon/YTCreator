# Implementation Plan: Guion y escaleta

**Branch**: `005-script-and-outline` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-script-and-outline/spec.md`

## Summary

La 005 convierte una idea de la cola en un guion aprobado: hechos con fuentes, escaleta y guion, con revisión gratis,
historial completo y Shorts. Reutiliza `ai-run.ts`, los límites de gasto, `background_job` con SSE, el proveedor falso y el
patrón de la 004. Tiene seis piezas:

- **Dominio** (`packages/core/src/script`), con funciones puras: esquemas, estado, etiquetas de hechos (R8), detección de
  afirmaciones (R9), duración (R11), revisión (R14), comparación por bloques (R15) y exportación (R17).
- **Puerto de IA**: la capacidad `webResearch` (R3), con dos pasos en la API de Anthropic (R4) y dos herramientas
  permitidas en Claude Code (R5).
- **Conocimiento**: `script/craft.json`, `script/review.json`, `script/sources.json`, `writing/spoken.md` y `pricing.json` v2
  (R6, R13), y siete prompts (`contracts/ai-uses.md`).
- **Servidor**: migración `0006_script.sql`, repos `scripts` y `script-versions`, servicios `scripts` y `link-check` (R7) y
  las rutas de [http-api](./contracts/http-api.md).
- **Web**: `/canal/guiones`, `/canal/guiones/:id` y `/canal/guiones/voz`, y la entrada desde la cola.
- **Pruebas**: batería de contrato ampliada, e2e con axe y auditoría de novato.

El riesgo principal es que un guion parezca más cierto de lo que es. Se mitiga así: la etiqueta la calcula el dominio, no
la IA; todo lo que no tiene respaldo se marca; y aprobar con pendientes se pregunta y se registra. El segundo riesgo es
que la búsqueda real no se ha probado: está aislada en los adaptadores y queda pendiente de P1.

## Technical Context

**Language/Version**: TypeScript `strict` sobre Node 24 LTS.

**Primary Dependencies**: las actuales. Ningún paquete ni binario nuevo; `@anthropic-ai/sdk` 1.3.0 ya declara
`web_search_20260209` y `web_fetch_20260209`.

**Storage**: la misma SQLite. Migración aditiva `0006_script.sql`, sin rehacer ninguna tabla (R12, R16).

**Testing**:

- Vitest: esquemas, estado, etiquetas, detección con casos grabados, duración, cinco reglas de revisión, comparación,
  exportación, rutas con SQLite en memoria y migración sobre una base de la 004 con datos.
- `link-check` con servidor falso, incluidas las direcciones privadas y las redirecciones hacia ellas.
- Batería de contrato de IA con los siete usos y la capacidad web.
- Playwright + axe en claro y oscuro, a 375 y 1280 px, con IA falsa y con teclado.
- Auditoría de novato.

**Target Platform**: las de la 002 a la 004.

**Project Type**: app web local (servidor Node + SPA de React) en el monorepo pnpm.

**Performance Goals**: revisión de un guion de 30 min en < 1 s (SC-006); investigación en ≤ 5 min (SC-011, sin medir hasta
P1); lista de guiones en < 1 s con 200 guiones.

**Constraints**: coste a la vista antes de cada llamada; ninguna fuente inventada; nada se pierde; ninguna dirección privada
alcanzable desde la comprobación de enlaces; WCAG 2.2 AA, teclado, 375 px y zoom al 200 %.

**Scale/Scope**: 1 creador, N canales; 3 pantallas, unas 20 rutas, 7 usos de IA, 1 migración, 3 paquetes de conocimiento.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md` (v2.1.0). Marcar cada puerta como ✅ cumple, ➖ no aplica o ❌ viola (si viola,
justificar en «Complexity Tracking»).

| # | Puerta | Estado | Nota |
|---|--------|--------|------|
| I | Una acción principal por pantalla, sin jerga (test de glosario), lo avanzado plegado tras «Modo experto», errores para personas | ✅ | Cada paso tiene una acción principal según el estado y dice por qué importa ([ui-screens](./contracts/ui-screens.md)). «Escaleta» se explica la primera vez. Las palabras por minuto, en «Más opciones» |
| II | Todo lo generado se puede aprobar, editar y regenerar, con versiones; nada externo sin una acción explícita; dato ≠ opinión | ✅ | Versiones completas (R1). Hechos con etiqueta y marcas frente a «Opinión de la IA». La investigación solo a petición. El guion solo cambia con una propuesta si el creador la acepta |
| III | Coste estimado en euros antes de gastar, dentro de los límites de gasto, con un camino sin coste | ✅ | Los siete usos piden `estimateId`, con las búsquedas incluidas (R6). Editar, revisar, aprobar y descargar no gastan. La investigación es opcional |
| IV | La IA solo a través del puerto `AiProvider`; prompts versionados que valen para cualquier modelo; salida validada con Zod; errores tipados; uso explícito | ✅ | Capacidad declarada `webResearch` (R3). El dominio no sabe cómo busca cada adaptador. Siete usos con prompt, esquema y perfil |
| V | Conocimiento en paquetes versionados con fuente y fecha; datos de mercado reales y citados; reglas de escritura humana | ✅ | Paquetes de R13, con supuestos marcados. `writing/spoken.md` en los usos de texto hablado. La IA no inventa fuentes (R7, R8) |
| VI | Solo tokens (ningún valor suelto), `@layer` + CSS Modules, temas claro y oscuro, WCAG 2.2 AA, 375 px, componente documentado | ✅ | Sin componentes nuevos (R19). Si hiciera falta uno, se para y se pregunta |
| VII | Datos en local y exportables, secretos protegidos, autenticación en VPS, sin telemetría por defecto | ✅ | Todo en SQLite y descargable en `.md` y `.json` (R17). No hay secretos nuevos. Solo la idea y los apuntes salen a la búsqueda (R20). Los enlaces no van a los logs |
| VIII | Dentro del alcance de la v1; lo que surja va al backlog | ✅ | El guion y la escaleta, de vídeo largo y Short, están en el alcance. La voz, las imágenes y el montaje siguen fuera; «qué se ve» es solo texto |
| IX | Tests unitarios, de contrato de los adaptadores con IA falsa, e2e + axe y auditoría de novato prevista | ✅ | Ver «Testing» |
| X | La opción más simple; cada dependencia nueva justificada | ✅ | Sin dependencias. Estado calculado (R2), una tabla de versiones (R1), trabajos existentes (R12) |
| XI | Autonomía demostrada: cinco campos por historia, Puerta A, controles no ejecutados declarados, huecos a `decisions.md` | ✅ | Siete historias con sus cinco campos. La prueba real queda declarada como no ejecutada (P1). Cada fase cierra con `/puerta-a` |

**Re-evaluación tras la Fase 1:** sin cambios. El diseño amplía un puerto existente con una capacidad declarada, que es lo
que prevé el principio IV. La comprobación de enlaces es una llamada de red nueva hacia direcciones que dicta la IA: su
protección está en R7 y tiene tests propios.

## Project Structure

### Documentation (this feature)

```text
specs/005-script-and-outline/
├── spec.md
├── plan.md              # este fichero
├── research.md          # R1–R20
├── data-model.md
├── quickstart.md
├── decisions.md
├── contracts/
│   ├── http-api.md
│   ├── ai-uses.md
│   └── ui-screens.md
├── checklists/
│   ├── requirements.md
│   └── validation.md    # informes de la Puerta A
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/core/src/
├── script/
│   ├── model.ts          # esquemas de hechos, escaleta y guion
│   ├── outputs.ts        # salidas de los siete usos
│   ├── status.ts         # estado y avisos (R2)
│   ├── facts.ts          # etiqueta de un hecho (R8)
│   ├── claims.ts         # detección y marcas (R9)
│   ├── duration.ts       # duración y salida esperada (R11)
│   ├── review.ts         # revisión (R14)
│   ├── compare.ts        # comparación por bloques (R15)
│   └── export.ts         # Markdown y JSON (R17)
├── ai/{capabilities,port,uses}.ts   # capacidad web y usos
├── spending/estimate.ts  # coste de las búsquedas
└── api/scripts.ts

packages/knowledge/
├── script/{craft,review,sources}.json
├── writing/spoken.md
├── market/pricing.json   # v2
└── prompts/{investigacion,escaleta,guion,guion_short,bloque_guion,comprobar_guion,enfoques_short}/v1.md

packages/ai/src/          # capacidad web en los adaptadores, perfiles y proveedor falso

apps/server/src/
├── db/migrations/0006_script.sql
├── db/repos/{scripts,script-versions}.ts
├── services/{scripts,link-check}.ts
└── http/routes/scripts.ts

apps/web/src/
├── screens/channel/scripts/  # lista, guion, pasos, historial y voz
├── strings/script.es.ts
└── api/client.ts             # + scriptsApi

apps/web/e2e/scripts.spec.ts
```

**Structure Decision**: el monorepo de siempre. El dominio nuevo va en una carpeta propia de `core`, como `ideas`, y el
servidor y la web siguen el patrón de la 004.

## Complexity Tracking

Sin violaciones que justificar.
