# Implementation Plan: Banco de ideas con detección de temas quemados

**Branch**: `004-idea-bank` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-idea-bank/spec.md`

## Summary

La 004 da a cada canal con perfil aprobado un **banco de ideas de vídeo**. La IA propone tandas de ideas ajustadas al
perfil, el creador escribe las suyas y cada una se puede **medir en YouTube** para saber si tiene hueco o ya está
quemada. Reutiliza casi todo lo de la 003: el puerto `YouTubeData`, el presupuesto y la estimación, `ai-run.ts`,
`claims.ts`, `background_job` con SSE, y `Semaphore` y `DataSource`. Tiene cinco piezas:

- **Dominio** (`packages/core/src/ideas`), con funciones puras y probadas sin red:
  - qué es un vídeo casi igual (R1);
  - las cifras de una medida, el semáforo y la oportunidad en inglés (R3, R5);
  - el orden y la cola (R10);
  - el filtro de ideas repetidas (R9).
- **Umbrales** en `packages/knowledge/market/thresholds.json` (versión 5, bloque `ideas`), marcados como supuesto sin
  fuente (R4).
- **Usos de IA nuevos:** `ideas`, `otro_enfoque` y `busquedas_idea`, con su prompt `v1`, su esquema Zod y su perfil
  por proveedor. El reintento de salida inválida queda reservado (R7).
- **Servidor:** la migración `0005_idea_bank.sql`; los repos `ideas` e `idea-batches`; el servicio `idea-measure`
  (trabajo `medir_ideas`); y las rutas de [http-api](./contracts/http-api.md).
- **Web:** la pantalla `/canal/ideas` con la tanda propuesta, la medida, la cola, los filtros, lo archivado y las
  descargas, y la entrada desde la pantalla del canal. Todo con `@ytcreator/ui` y sin componentes nuevos (R14).

El riesgo principal es que un semáforo con umbrales sin fuente parezca más cierto de lo que es. Se mitiga así:

- el sello de supuesto en cada semáforo;
- las cifras y los vídeos parecidos siempre a la vista;
- una lectura fallida nunca se pinta como verde ni como frío (entrada 153 de la 003).

## Technical Context

**Language/Version**: TypeScript `strict` sobre Node 24 LTS, como la 003.

**Primary Dependencies**: las de la 003. Ningún paquete npm nuevo ni ningún binario externo nuevo (R10: sin librería
de arrastrar y soltar).

**Storage**: la misma SQLite. La migración aditiva `0005_idea_bank.sql` crea `idea_batch`, `idea` e `idea_measure`,
y rehace `background_job` sin perder datos para admitir `medir_ideas` y `channel_id` (R12).

**Testing**:

- Vitest:
  - semáforo con los ocho `reason` y los bordes de cada umbral;
  - casi iguales;
  - oportunidad;
  - repetidas;
  - orden y cola;
  - esquemas de los tres usos;
  - rutas con SQLite en memoria;
  - migración sobre una base de la 003 con datos.
- Batería de contrato de IA ampliada con los tres usos y el proveedor falso.
- Medida con el yt-dlp falso: casos grabados de hueco, competido, quemado, frío, fallo y oportunidad.
- Playwright + axe del recorrido del banco en claro y oscuro, a 375 y 1280 px, con IA y YouTube falsos, y con teclado.
- Auditoría de novato del banco.

**Target Platform**: las de la 002 y la 003.

**Project Type**: app web local (servidor Node + SPA de React) en el monorepo pnpm.

**Performance Goals**:

- una idea medida en ≤ 2 min (SC-003): tres búsquedas a la vez con el límite de 3 procesos yt-dlp y 45 s por llamada;
- la lista del banco abre en < 1 s con 200 ideas.

**Constraints**:

- ninguna cifra sale de la IA;
- el coste se ve antes de cada llamada de IA y se respetan los límites (principio III);
- medir no cuesta dinero, y con la Data API se dicen antes las unidades (FR-007c);
- nada se borra (FR-013);
- WCAG 2.2 AA, teclado, 375 px y zoom al 200 %.

**Scale/Scope**:

- 1 creador y N canales, cada uno con su banco;
- hasta unos cientos de ideas por canal;
- 1 pantalla nueva, unas 14 rutas, 3 usos de IA, 1 migración y 1 tipo de trabajo nuevo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md` (v2.1.0). Marcar cada puerta como ✅ cumple, ➖ no aplica o ❌ viola (si viola,
justificar en «Complexity Tracking»).

| # | Puerta | Estado | Nota |
|---|--------|--------|------|
| I | Una acción principal por pantalla, sin jerga (test de glosario), lo avanzado plegado tras «Modo experto», errores para personas | ✅ | Hay una acción principal según el estado del banco ([ui-screens](./contracts/ui-screens.md)). Las búsquedas de cada idea van en «Modo experto», y el glosario gana «clon» y «tema amplio». Los fallos de YouTube usan los textos de la 003, y el semáforo es una frase en llano, no un número |
| II | Todo lo generado se puede aprobar, editar y regenerar, con versiones; nada externo sin una acción explícita; dato ≠ opinión | ✅ | Cada candidata se queda o se descarta; las ideas se editan y guardan el original y una `revision` (R11); se puede pedir otra tanda con indicaciones. La medida (dato) va separada del gancho y del `why` (opinión de la IA). Nada se mide solo |
| III | Coste estimado en euros antes de gastar, dentro de los límites de gasto, con un camino sin coste | ✅ | Los tres usos piden `estimateId`, con el presupuesto de la 003 y el reintento reservado. Medir cuesta 0 €, y con la Data API se dicen antes las unidades. Escribir ideas propias, ordenar y medir no necesitan IA |
| IV | La IA solo a través del puerto `AiProvider`; prompts versionados que valen para cualquier modelo; salida validada con Zod; errores tipados; uso explícito | ✅ | Tres usos nuevos en `AI_USES`, con prompt `v1` y su suma en `lock.json`, salida Zod y perfil por proveedor ([ai-uses](./contracts/ai-uses.md)). Usan los fallos tipados de la 002 |
| V | Conocimiento en paquetes versionados con fuente y fecha; datos de mercado reales y citados; reglas de escritura humana | ✅ | Los umbrales están en `thresholds.json` v5 con fuente «supuesto sin estudio» y fecha, y se ven en cada semáforo (R4). Las cifras salen del puerto de YouTube con fuente y fecha, y `writing/human.md` va en los tres prompts |
| VI | Solo tokens (ningún valor suelto), `@layer` + CSS Modules, temas claro y oscuro, WCAG 2.2 AA, 375 px, componente documentado | ✅ | Solo componentes existentes de `@ytcreator/ui` y CSS Modules con tokens. Si hiciera falta un componente nuevo, se para y se pregunta (riesgo alto) |
| VII | Datos en local y exportables, secretos protegidos, autenticación en VPS, sin telemetría por defecto | ✅ | Todo está en la SQLite local y se exporta en `.md` y `.json` (R13). No hay secretos nuevos |
| VIII | Dentro del alcance de la v1; lo que surja va al backlog | ✅ | El banco de ideas con temas quemados está en el alcance v1. El guion (005), la miniatura y los títulos (006) y arrastrar y soltar quedan fuera |
| IX | Tests unitarios, de contrato de los adaptadores con IA falsa, e2e + axe y auditoría de novato prevista | ✅ | Ver «Testing» |
| X | La opción más simple; cada dependencia nueva justificada | ✅ | Sin dependencias nuevas. Las tablas son propias y no se fuerza `proposal` (R8). El orden se guarda enviando la lista entera |
| XI | Autonomía demostrada: cinco campos por historia, Puerta A, controles no ejecutados declarados, huecos a `decisions.md` | ✅ | Las cuatro historias llevan los cinco campos y ningún hueco abierto. Cada fase cierra con `/puerta-a` |

**Re-evaluación tras la Fase 1:** sin cambios. El diseño no añade abstracciones nuevas: el puerto de YouTube y el de IA
son los de antes, el trabajo en segundo plano es el de la 003 con un `kind` más, y las funciones del semáforo son
puras.

## Project Structure

### Documentation (this feature)

```text
specs/004-idea-bank/
├── spec.md
├── plan.md              # este fichero
├── research.md          # R1–R15
├── data-model.md
├── quickstart.md
├── decisions.md
├── contracts/
│   ├── http-api.md
│   ├── ai-uses.md
│   ├── idea-measure.md
│   └── ui-screens.md
├── checklists/
│   ├── requirements.md
│   └── validation.md    # informes de la Puerta A
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/core/src/
├── ideas/
│   ├── model.ts          # estados, formatos, orígenes, IdeaDraft
│   ├── outputs.ts        # esquemas Zod de ideas, otro_enfoque y busquedas_idea
│   ├── similar.ts        # palabras clave y casi iguales (R1)
│   ├── figures.ts        # cifras de una medida (R2)
│   ├── verdict.ts        # semáforo y reason (R3)
│   ├── opportunity.ts    # oportunidad en inglés (R5)
│   ├── repeats.ts        # candidatas repetidas (R9)
│   └── order.ts          # orden y cola (R10)
├── ai/uses.ts            # + ideas, otro_enfoque, busquedas_idea
└── api/ideas.ts          # esquemas de las rutas y vistas

packages/knowledge/
├── market/thresholds.json   # v5, bloque ideas (R4)
└── prompts/{ideas,otro_enfoque,busquedas_idea}/v1.md

packages/ai/                  # perfiles por proveedor y salidas del proveedor falso

apps/server/src/
├── db/migrations/0005_idea_bank.sql
├── db/repos/{ideas,idea-batches,idea-measures}.ts
├── services/{ideas,idea-measure}.ts
└── http/routes/ideas.ts

apps/web/src/
├── screens/channel/ideas/{IdeaBank,IdeaCard,IdeaBatch,IdeaQueue,IdeaEditor,IdeaMeasure}.tsx
├── strings/ideas.es.ts
└── api/client.ts             # + ideasApi

apps/web/e2e/ideas.spec.ts
```

**Structure Decision**: el monorepo de siempre. El dominio nuevo va en una carpeta propia de `core`, como `market` y
`channel`, y el servidor y la web siguen el patrón de la 003.

## Complexity Tracking

Sin violaciones que justificar.
