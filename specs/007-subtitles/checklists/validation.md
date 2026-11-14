# Validación de la 007: subtítulos

## Setup y Foundational (T001–T020), Puerta A del 2026-11-14

### 1. Resumen

La base de los subtítulos está lista. Incluye:

- el modelo (subtítulos, palabras oídas, correcciones) y sus estados;
- la migración 0008, que reconstruye `background_job` con `reconocer_voz`, `descargar_motor` y `en_cola`, y crea las pistas
  y sus versiones;
- los repos, con versiones inmutables;
- el conocimiento `subtitles/`, con las fuentes de Netflix y YouTube abiertas antes de citarlas;
- el puerto de reconocimiento, con su batería de contrato y el falso, que queda fuera del paquete publicado;
- la ruta base y, en la web, el cliente, la ruta y el esqueleto de la pantalla.

Los cuatro revisores no encontraron nada grave. Los medios y menores confirmados están corregidos y llevan test. La pantalla
todavía no tiene recorrido propio: su e2e y axe llegan con US1.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T001–T005 paquete `speech`, proyecto de Vitest, textos, mediabunny 1.66.0 fijado | Cumplido | `packages/speech/`, `vitest.config.ts`, `apps/web/package.json` | 2026-11-14 |
| T006–T007 modelo | Cumplido | `packages/core/test/subtitles/model.test.ts` | 2026-11-14 |
| T008–T009 estados | Cumplido | `packages/core/test/subtitles/status.test.ts`; en el servidor, solo el reconocimiento da «en marcha» (`subtitles-base.test.ts`) | 2026-11-14 |
| T010–T011 migración 0008 conservando todas las filas | Cumplido | `apps/server/test/db/migration-0008.test.ts` (7 casos: filas de cada tipo y estado, claves foráneas válidas y activas, tipos y estado nuevos, `reconocer_voz` con canal, pista única por guion, versiones únicas); el ejecutor con la marca de claves, en `migrate.test.ts` (2 casos, también la vuelta atrás) | 2026-11-14 |
| T012–T013 repos | Cumplido | `apps/server/test/db/repos/subtitles.test.ts` (13 casos), con `cueCount` que no se cae con una fila rota | 2026-11-14 |
| T014 conocimiento con fuentes abiertas | Cumplido | Abiertas en esta sesión: la guía de Netflix para el español (42 caracteres, 17 por segundo, 2 líneas), los requisitos generales de Netflix (5/6 s y 7 s) y sus pautas de tiempos (2 fotogramas), y la ayuda de YouTube «Archivos de subtítulos y subtítulos opcionales compatibles» (SRT, VTT, SBV). El Short, el umbral y la velocidad, como supuestos. `packages/knowledge/test/subtitles.test.ts` (8 casos) | 2026-11-14 |
| T015 puerto y fallos | Cumplido | `packages/core/src/speech/`, igual que el contrato | 2026-11-14 |
| T016 batería, falso y paso «No fake speech» | Cumplido | `packages/speech/test/fake.contract.test.ts` (reglas 1 a 6 y 9 casos más); el build de producción no lleva ninguna marca del falso (grep con 0 coincidencias) | 2026-11-14 |
| T017 contratos HTTP | Cumplido | `packages/core/src/api/subtitles.ts`, `packages/core/test/subtitles/api.test.ts`; seis códigos de error nuevos con su texto | 2026-11-14 |
| T018–T019 ruta base | Cumplido | `apps/server/test/http/subtitles-base.test.ts` (9 casos) | 2026-11-14 |
| T020 web base | Parcial | Compila; ruta con test; cobertura de estados; el recorrido y axe llegan con US1 | 2026-11-14 |

### 3. Cómo se comprobó

Tras las correcciones: `fnm exec --using=24 -- pnpm lint` (código 0), `typecheck` (código 0) y `test` (código 0, 204
ficheros, 2661 pasados y 4 omitidos). Build de producción del servidor: ninguna de las marcas del paso «No fake speech»
aparece en `dist/server.mjs`. El flujo real de la fase (leer los subtítulos de un guion aprobado con la IA falsa, sin
pista y con versiones) es el de `subtitles-base.test.ts`.

### 4. Controles

- Pasados: lint, typecheck, test, glosario (con `subtitlesEs` y ahora también las fuentes de `subtitles/`), los tipos de
  fallo de IA (42 casos, sin cambios en esta fase).
- `test:e2e`: 54 de 54, código 0, con el código final (incluye `secrets-leak`). Una primera pasada falló porque un build de producción hecho a la vez borró `dist/web`; se repitió sin tocar `dist`.
- No ejecutados:
  - Axe en claro y oscuro a 375 y 1280 px, teclado y reduced-motion de la pantalla nueva: aún no se llega a ella desde la
    app (la entrada es de US1) y va en el e2e de US1.
  - `test:installer`: esta fase no toca el instalador (`versions.json` cambia en T031 y T032).

### 5. Hallazgos

Corregidos:

- Un trabajo `en_cola` se daba por fallido al seguirlo por eventos (los cuatro revisores). La ruta ya no lo cierra; hay
  test, y el comentario del servicio está al día.
- «En marcha» saltaba también con la revisión de la IA (los cuatro). Ahora solo cuenta el trabajo de reconocimiento, con
  test.
- `sin_audio` no podía dar el 404 que pide el contrato al leer el audio (los cuatro). `ApiError` admite un estado propio;
  hay test y decisión 14.
- Los límites citaban una sola fuente para las seis cifras (fidelidad). Ahora cada cifra lleva la suya, o ninguna si es
  un supuesto; hay test y decisión 17.
- «modelo» en el texto de `sin_modelo` (regresión): pasa a «Falta una parte del programa que escucha el audio» (decisión 13).
- Tres marcas de «No fake speech» nunca coincidían (fidelidad, lógica, regresión). Ahora son frases que sí están en el
  falso.
- El glosario no revisaba las fuentes de `subtitles/` (regresión): incluidas.
- `cueCount` del contrato no salía del repo (seguridad): se calcula del JSON sin validarlo, así que una fila rota no tumba
  la lista.
- El interruptor del falso aceptaba cualquier valor y no dejaba provocar fallos (lógica). Ahora acepta `1`, un escenario o
  `fallo-<código>`, y con cualquier otra cosa el servidor no arranca.
- El cuerpo de la corrección en bloque perdía la regla «distintos» (lógica): añadida; la respuesta es 400, nunca 500.
- Las operaciones del trabajo estaban escritas a mano en tres sitios (lógica). `SUBTITLE_JOB_OPS` vive en core, y un test
  comprueba que los formatos de la API son los del conocimiento.
- Clave rota tras migrar sin decir dónde (lógica): el error nombra las tablas.
- El cambio del ejecutor de migraciones y los factores de velocidad no estaban registrados (fidelidad): decisiones 15 y 16.
- El test de «otro canal» no comprobaba nada (fidelidad): ahora lee un guion de cada canal.

Descartados: ninguno.

Abiertos para su historia:

- El tope de 200 correcciones se comprobará en la ruta de US2, que debe responder 400.
- La vista aún no dice que la velocidad es un supuesto: la estimación se muestra en US1 y se dirá allí (principio II).

### 6. Desviaciones

- `craft.json` da 0,833 s y 0,083 s en lugar de los 0,83 s y 83 ms de la tarea, porque son las cifras exactas de la
  fuente (decisión 10).
- El falso elige su escenario también por la variable de entorno (decisión 9).
- Se cambió el ejecutor de migraciones, cosa que la tarea no preveía (decisión 15).

### 7. Decisiones

- Del agente: 9 a 17. Son de riesgo bajo, salvo la 13 (cambia un texto visible) y la 15 (cambia el ejecutor de
  migraciones), que son de riesgo medio y se destacan aquí.
- Pendientes del creador para esta fase: ninguna.
- T032 (lanzar `whisper-macos.yml` y publicar) necesitará su permiso cuando llegue.

### 8. Constitución

- I: textos sin «motor» ni «modelo».
- II: versiones inmutables; la estimación se dirá como aproximada.
- V: cada cifra con su fuente y fecha, o marcada como supuesto.
- VII: el proceso de voz sin secretos (regla 5 de la batería).
- IX: batería de contrato con un falso determinista que no entra en el paquete publicado.
- XI: este informe.

### 9. Cómo revertir

- `git revert` del commit de esta fase.
- La migración 0008 deja la base en la versión 8. Una versión anterior del servidor la rechaza (R7): para volver atrás en
  una instalación ya migrada hay que restaurar la copia de la base.
- Queda pendiente US1 en adelante.
