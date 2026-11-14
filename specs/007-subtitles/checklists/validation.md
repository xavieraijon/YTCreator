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

## US1: subtítulos del vídeo largo (T022–T040), Puerta A del 2026-11-14

### 1. Resumen

El creador ya puede hacer los subtítulos de un guion aprobado. Descarga una vez el programa que escucha el audio, elige el vídeo (el audio se saca en el navegador), ve cuánto tardará y el avance aunque recargue, revisa los subtítulos troceados con las correcciones del guion marcadas y descarga el SRT (VTT y SBV en «Modo experto»).

Los cuatro revisores no encontraron nada grave. Los medios y menores confirmados están corregidos y llevan test (decisiones 28 a 32). Las decisiones de efecto visible 18 y 27 pasan al creador (P1 y P2) y quedan hechas con la opción recomendada.

**Resultado: pasada, condicionada a P1, P2 y P4.** El motor real no está probado. En Mac no funciona hasta que el creador autorice T032 (P4).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|-----------|--------|-----------|-------|
| AS1 | Cumplido | La frase de para qué sirven, qué fichero hace falta y que no sale del equipo está a la vista desde la primera vez (decisión 28). E2E `subtitles.spec.ts` | 2026-11-14 |
| AS2, FR-003 | Cumplido | Duración, «Tardará…» y «no cuesta nada» antes de «Empezar». E2E | 2026-11-14 |
| AS3, FR-004 | Cumplido | El e2e recarga en mitad y ve el avance. Cancelar, fallar y cortar al cerrar no dejan versión (`subtitles-recognize.test.ts`). Cada fallo lleva su botón (decisión 30) | 2026-11-14 |
| AS4, FR-005 | Cumplido | `segment.test.ts`: límites de lectura y ningún solape, también al final del audio. Con P1 pendiente (decisión 18) | 2026-11-14 |
| AS5, FR-006 | Cumplido | `align.test.ts`. El e2e ve «Escrito como en tu guion; se oyó «…»» | 2026-11-14 |
| AS6, FR-007 | Cumplido | `export.test.ts`. El e2e descarga `subtitulos-<slug>.srt` y valida cada bloque | 2026-11-14 |
| FR-001 | Parcial | Largo, cubierto. El Short llega con US4 | 2026-11-14 |
| FR-002 | Parcial | Descarga con su tamaño, SHA256 y continuación (`speech-engine.test.ts`). En Mac falta T032 (P4) | 2026-11-14 |
| SC-001 a SC-004 con motor real | No ejecutado | Necesita T076 (prueba real) y T032 en Mac | — |

### 3. Cómo se comprobó

- `pnpm lint`: 0.
- `pnpm typecheck`: 0.
- `pnpm test`: 214 ficheros, 2771 pasan y 4 se saltan.
- `pnpm test:e2e`: catálogo con 97 pasan y 2 se saltan; web con 55 pasan, entre ellos `subtitles.spec.ts`.
- El glosario y la cobertura de textos, aparte: 22 pasan.
- El fallo de la segunda vuelta (`whisper.test.ts`, tiempo agotado bajo carga) se corrigió y se comprobó tres veces solo y una con la batería entera.
- Flujo real con los falsos (`YTCREATOR_FAKE_SPEECH=con-errores`): el e2e de T040.

### 4. Controles

- **Pasados:**
  - lint, typecheck, test y test:e2e;
  - glosario y fuga de secretos (`secrets-leak.spec.ts`);
  - axe en claro y oscuro a 1280, 375 y 640 px (zoom del 200 %) con movimiento reducido, en cada estado de la pantalla;
  - teclado con Tab y foco visible (`tabTo`).
- **No aplica:** tipos de fallo de IA, porque US1 no usa IA; `test:installer`, porque el instalador no cambia.
- **No ejecutado:**
  - el motor real, porque necesita T076 y en Mac T032;
  - la subida del SRT a YouTube Studio (SC-003), que se hará en la prueba real.

### 5. Hallazgos

**Confirmados y corregidos:**
- `whisper-cli` seguía vivo al cerrar la app. Ahora se para con `stop()` en el cierre (test).
- «Parar» justo al terminar guardaba la versión. Ya no guarda nada (test).
- El audio se movía antes de guardar la versión. Se invirtió el orden.
- Se podía reconocer o subir mientras llegaba otro audio. Ahora responde 409 `en_curso` (test).
- El trabajo cortado salía como «Algo ha fallado». Ahora sale como `interrumpido`, y cada fallo tiene su botón (contrato).
- Los fallos en «Modo experto» no se veían. Ahora se muestran.
- La frase de la primera vez no se veía hasta descargar el programa. Ahora está desde el principio.
- Si no se oía nada, la pantalla no tenía salida. Ahora vuelve a «Elegir» con un aviso.
- Salía «modelo» fuera de «Modo experto». Corregido.
- Las unidades y el estado en minúsculas estaban fuera del catálogo. Ya están dentro.
- Salía «Ver los subtítulos» sin haber subtítulos. Corregido.
- La pista se calculaba en tiempo cuadrático. Ahora es lineal y para al llenarse (test).
- El texto oído podía llevar dobles espacios. Corregido (test).
- Había solapes al final del audio. Corregido (test).
- Se quedaban temporales de subidas cortadas. Ahora se borran.
- Los errores de disco escribían la ruta en el log. Ahora solo el código.
- El falso podía tomarse por el programa real. Ahora tiene la versión `falso`.
- La etiqueta del workflow se pegaba en el shell. Ahora va por `env`.
- El e2e no probaba el teclado de verdad. Ahora usa Tab.
- Al parar, el adaptador ya no espera a que se cierre la tubería de mensajes.

**Abiertos (menores):**
- La descarga interrumpida no se ve tras reiniciar el servidor, porque el trabajo solo se guarda en memoria.
- `missingBytes` no descuenta lo que ya hay en el `.part`.
- La fuente de los límites de lectura no se muestra en «Revisar» (el contrato no la pide).
- En Mac, el fallo dice «Comprueba tu conexión» hasta T032.

### 6. Desviaciones

- Las marcas se muestran como lista y no como etiquetas (decisión 27, P2).
- Cuando no se oye nada, se vuelve a «Elegir» (decisión 29).
- `YTCREATOR_FAKE_SPEECH_STEP_MS` es solo para pruebas (decisión 26).

### 7. Decisiones

- **Del agente:** 25 a 32.
- **Del creador, pendientes:**
  - P1: el retraso de 0,5 s;
  - P2: las marcas como lista;
  - P3: comprobar los hashes descargando;
  - P4: lanzar T032.

### 8. Constitución

- **I:** sin jerga; cada fallo con su botón.
- **II:** marcas de lo corregido con lo oído.
- **III:** sin coste; la descarga se avisa con su tamaño.
- **IV:** reconocimiento por puerto y adaptador.
- **VI:** axe y movimiento reducido.
- **VII:** el audio no sale del equipo; los logs sin texto oído ni rutas.
- **XI:** este informe.

### 9. Cómo revertir

- Revertir el commit de US1.
- La migración 0008 es de Foundational y no cambia.
- Pendiente: T032 (P4), T076 (prueba real) y US2 en adelante.
