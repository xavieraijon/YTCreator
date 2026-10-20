# Frontend de YTCreator

La interfaz web del kit: Angular 22 + Angular Material, en castellano. La sirve el backend (FastAPI, `ui/backend/`) en
http://127.0.0.1:8765; los datos los da su API (`/api/…`) y los cambios llegan solos por SSE (`/api/eventos`).
Diseño, pantallas y decisiones: `docs/ui/diseno.md`; auditorías: `docs/auditoria-tecnica.md` y
`docs/ui/auditoria-usuario-profano.md`.

## Arrancar, compilar y comprobar

Siempre con el Node 24 de `ui/.node` (no el del sistema); `ui/arrancar.sh` ya lo pone en el `PATH`.

```bash
ui/arrancar.sh            # compila si hace falta y sirve la app en http://127.0.0.1:8765
ui/arrancar.sh dev        # desarrollo: backend con recarga (8765) + ng serve en http://127.0.0.1:4300
ui/arrancar.sh compilar   # solo compila (dist/frontend/browser, que sirve el backend)
ui/arrancar.sh comprobar  # ruff + pytest + Vitest + compilación: tiene que pasar antes de dar un cambio por bueno
```

En `dev`, `proxy.conf.json` manda `/api` al backend. Tras cambiar el backend hay que reiniciarlo; tras cambiar el
frontend, recargar con Cmd+Shift+R.

## Estructura (`src/app/`)

| Carpeta | Qué hay |
|---|---|
| `core/` | Servicios y tipos compartidos: `modelos.ts` (lo que devuelve la API), `eventos.service.ts` (SSE), `cuotas`, `tareas`, `actividad`, `avisos`, `canales`, `errores.ts` (`mensajeError()`: un error HTTP dicho para el usuario) y `glosario.ts` (cómo se llaman las cosas en pantalla) |
| `compartido/` | Piezas que usan varias pantallas: cabecera de cuotas, panel de Actividad, avisos, diálogos (confirmar, nuevo vídeo), visor y revisión de imágenes, Markdown |
| `paginas/` | Una carpeta por pantalla: `inicio`, `asistente`, `canales`, `canal`, `video`, `tareas`, `ajustes` |
| `paginas/video/` | La página del vídeo: `fase-guiada.ts` (camino de fases y fase del tema/enfoque), `fase-tramos.ts` (resto de fases, por tramos), `panel-claude.ts` (chat), `detalles-fase.ts` («Detalles técnicos» plegados al final de cada paso: guion, voz, imágenes, montaje) y `archivos-video.ts` (menú ⋮ → «Archivos y notas del vídeo») |

## Convenciones

- **Componentes standalone con signals**: estado con `signal`/`computed`, datos con `httpResource` (que se recarga al
  cambiar `EventosService.version()`), `inject()` en vez de constructores con parámetros. Lo que usa la plantilla es
  `protected`; lo interno, `private`.
- **Los archivos del kit mandan**: el frontend no calcula estados por su cuenta; los recibe de la API (p. ej.
  `estado_real` del vídeo, tramos de cada fase) para que Inicio, Asistente, la guía y Claude digan lo mismo.
- **Lenguaje de usuario**: nada de nombres de proveedores, modelos, archivos ni jerga del kit en pantalla (salvo en
  el detalle técnico o en una línea que empiece por «Servicio:»). Lo vigila `ui/backend/tests/test_glosario.py`, que revisa las
  plantillas, los literales de `{{ … }}` y las respuestas reales de la API.
- **Estilos**: tokens `--ay-*` de `src/styles.scss` (claro y oscuro con `light-dark()`), sin `!important` ni
  `::ng-deep`. La maqueta de las fases se adapta con `@container` al espacio que deja el panel de Claude, no al ancho de
  la ventana.
- **Accesibilidad**: foco visible, `aria-label` en los botones de icono, avisos con `aria-live`, texto mínimo de 12 px.
- **TypeScript estricto**: sin `any`; `noUnusedLocals` y `noUnusedParameters` activos (la compilación falla con
  imports o variables sin usar).

## Tests

Vitest (`npx ng test --watch=false`, o dentro de `ui/arrancar.sh comprobar`). Servicios de `core/` y componentes con
lógica, montados con su HTML y un backend de mentira (`HttpTestingController`; `ConfirmarService` falso para decidir si se
acepta): `voz-ai33` (el coste se pide al pulsar y se confirma esa cifra), `fase-tramos`, `modo-revision` y `ajustes`. Las
peticiones que el componente repite solo (al aprobar, al abrir un paso hecho) hay que responderlas en su momento en el test.
La lógica que decide estados se prueba en el backend (`ui/backend/tests/`).
