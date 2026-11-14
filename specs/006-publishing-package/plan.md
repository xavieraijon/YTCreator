# Implementation Plan: Paquete de publicación

**Branch**: `006-publishing-package` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-publishing-package/spec.md`

## Summary

La 006 convierte un guion aprobado en un paquete de publicación: títulos, ideas de miniatura (o la portada de un Short),
descripción, capítulos, etiquetas, comentario fijado y una lista guiada de YouTube Studio, listo para copiar a mano.
Reutiliza todo lo de la 005: versiones completas, estado calculado, `ai-run.ts`, límites de gasto, `background_job` con
SSE, proveedor falso y el patrón de pantallas por pasos. Tiene seis piezas:

- **Dominio** (`packages/core/src/publish`), con funciones puras: esquemas, estado (R2), minutos de capítulos (R3),
  fuentes desde los hechos (R4), descripción montada (R5), lista guiada (R12), revisión (R13) y exportación (R15).
- **Puerto de IA**: sin cambios. Cinco usos nuevos (`contracts/ai-uses.md`).
- **Conocimiento**: `publish/youtube.json`, `publish/craft.json` y `publish/studio.json` (R11), y cinco prompts.
- **Servidor**: migración `0007_publish_package.sql`, repos `packages` y `package-versions`, servicio `packages` y las
  rutas de [http-api](./contracts/http-api.md).
- **Web**: `/canal/publicaciones`, `/canal/publicaciones/:id` y `/canal/publicaciones/ajustes`, y la entrada desde el
  guion aprobado y la cola.
- **Pruebas**: batería de contrato con los usos nuevos, e2e con axe y auditoría de novato.

El riesgo principal es que el paquete diga cosas que no son: enlaces inventados, minutos imposibles o títulos que
prometen de más. Se mitiga quitándole a la IA lo que se puede calcular: los minutos y las fuentes los pone el dominio, una
salida con direcciones web no valida, y cada título debe señalar el bloque del guion que cumple su promesa.

## Technical Context

**Language/Version**: TypeScript `strict` sobre Node 24 LTS.

**Primary Dependencies**: las actuales. Ningún paquete ni binario nuevo; copiar usa la API del portapapeles del navegador.

**Storage**: la misma SQLite. Migración aditiva `0007_publish_package.sql`, sin rehacer ninguna tabla.

**Testing**:

- Vitest: esquemas, estado, capítulos, fuentes, montaje, lista guiada, cada regla de revisión, exportación, rutas con
  SQLite en memoria y migración sobre una base de la 005 con datos.
- Batería de contrato de IA con los cinco usos y los rechazos (direcciones web, bloques que no existen).
- Playwright + axe en claro y oscuro, a 375 y 1280 px, con IA falsa y con teclado, incluida la copia y su alternativa.
- Auditoría de novato.

**Target Platform**: las de la 002 a la 005.

**Project Type**: app web local (servidor Node + SPA de React) en el monorepo pnpm.

**Performance Goals**: revisión de un paquete en < 1 s (SC-007); lista de paquetes en < 1 s con 200 paquetes.

**Constraints**: coste a la vista antes de cada llamada; ningún enlace que no esté en la lista de hechos; ninguna llamada
a YouTube; nada sale de la app sin una acción del creador; nada se pierde; WCAG 2.2 AA, teclado, 375 px y zoom al 200 %.

**Scale/Scope**: 1 creador, N canales; 3 pantallas, unas 15 rutas, 5 usos de IA, 1 migración, 3 paquetes de conocimiento.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Ver `.specify/memory/constitution.md` (v2.1.0). Marcar cada puerta como ✅ cumple, ➖ no aplica o ❌ viola (si viola,
justificar en «Complexity Tracking»).

| # | Puerta | Estado | Nota |
|---|--------|--------|------|
| I | Una acción principal por pantalla, sin jerga (test de glosario), lo avanzado plegado tras «Modo experto», errores para personas | ✅ | Cada paso tiene una acción principal según el estado y dice por qué importa ([ui-screens](./contracts/ui-screens.md)). Sin «brief» ni «handle»; «etiquetas» y «capítulos» se explican la primera vez |
| II | Todo lo generado se puede aprobar, editar y regenerar, con versiones; nada externo sin una acción explícita; dato ≠ opinión | ✅ | Versiones completas por pieza (R1). Minutos marcados como estimación; lo medido en la 004 como dato con fecha; motivos como «Opinión de la IA». Copiar y descargar son acciones del creador; no se sube nada (R20) |
| III | Coste estimado en euros antes de gastar, dentro de los límites de gasto, con un camino sin coste | ✅ | Los cinco usos piden `estimateId`. Editar, revisar, copiar, aprobar, recuperar y descargar no gastan. Sin llamadas a YouTube ni cuota (R7) |
| IV | La IA solo a través del puerto `AiProvider`; prompts versionados que valen para cualquier modelo; salida validada con Zod; errores tipados; uso explícito | ✅ | Sin capacidades nuevas. Cinco usos con prompt, esquema y perfil; las salidas se rechazan con enlaces o bloques inexistentes |
| V | Conocimiento en paquetes versionados con fuente y fecha; datos de mercado reales y citados; reglas de escritura humana | ✅ | Límites de YouTube con fuente oficial y fecha; el corte en móvil y la categoría sugerida, marcados como supuesto (R11). `writing/human.md` en todos los usos |
| VI | Solo tokens (ningún valor suelto), `@layer` + CSS Modules, temas claro y oscuro, WCAG 2.2 AA, 375 px, componente documentado | ✅ | Sin componentes nuevos (R19). Si hiciera falta uno, se para y se pregunta |
| VII | Datos en local y exportables, secretos protegidos, autenticación en VPS, sin telemetría por defecto | ✅ | Todo en SQLite y descargable en `.md` y `.json` (R15). Sin secretos nuevos. La copia falla con elegancia en un VPS sin HTTPS (R14) |
| VIII | Dentro del alcance de la v1; lo que surja va al backlog | ✅ | Títulos, miniatura (solo texto), descripción, capítulos y etiquetas están en el alcance; el comentario y la lista guiada los decidió el creador (decisión 2). Sin imágenes ni subida. TikTok, Reels, listas y pantalla final, al backlog |
| IX | Tests unitarios, de contrato de los adaptadores con IA falsa, e2e + axe y auditoría de novato prevista | ✅ | Ver «Testing» |
| X | La opción más simple; cada dependencia nueva justificada | ✅ | Sin dependencias. Estado calculado (R2), una tabla de versiones (R1), trabajos existentes (R18), copia con la API del navegador |
| XI | Autonomía demostrada: cinco campos por historia, Puerta A, controles no ejecutados declarados, huecos a `decisions.md` | ✅ | Cinco historias con sus cinco campos. La prueba con IA real queda declarada como no ejecutada ([quickstart](./quickstart.md)). Cada fase cierra con `/puerta-a` |

**Re-evaluación tras la Fase 1:** sin cambios. El diseño no amplía el puerto ni abre llamadas de red nuevas. Lo único que
sale del navegador es lo que el creador copia o descarga.

## Project Structure

### Documentation (this feature)

```text
specs/006-publishing-package/
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
├── publish/
│   ├── model.ts          # esquemas de las piezas
│   ├── outputs.ts        # salidas de los cinco usos
│   ├── status.ts         # estado y avisos (R2, R16)
│   ├── chapters.ts       # minutos y propuesta de capítulos (R3)
│   ├── description.ts    # fuentes y montaje (R4, R5)
│   ├── studio.ts         # lista guiada (R12)
│   ├── review.ts         # revisión (R13)
│   ├── compare.ts        # comparar versiones de una pieza
│   └── export.ts         # Markdown, JSON e indicaciones de miniatura (R15)
├── ai/uses.ts            # cinco usos nuevos
└── api/publish.ts        # + campos aditivos en api/ideas.ts y api/scripts.ts

packages/knowledge/
├── publish/{youtube,craft,studio}.json
└── prompts/{titulos,miniaturas,descripcion,parte_paquete,paquete_short}/v1.md

packages/ai/src/          # perfiles de los usos y escenarios del proveedor falso

apps/server/src/
├── db/migrations/0007_publish_package.sql
├── db/repos/{packages,package-versions}.ts
├── services/packages.ts
└── http/routes/packages.ts

apps/web/src/
├── screens/channel/publish/  # lista, paquete, pasos, historial y ajustes
├── strings/publish.es.ts
└── api/client.ts             # + packagesApi

apps/web/e2e/publish.spec.ts
```

**Structure Decision**: el monorepo de siempre. El dominio nuevo va en una carpeta propia de `core`, como `script`, y el
servidor y la web siguen el patrón de la 005.

## Complexity Tracking

Sin violaciones que justificar.
