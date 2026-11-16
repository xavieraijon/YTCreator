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

### T032, 2026-11-16

- El creador aprobó lanzar el flujo. El PR #10 llevó a `main` solo el fichero del flujo, porque GitHub solo deja lanzar a mano lo que ya está en `main`.
- La ejecución 43848831389 terminó bien: compiló en Apple Silicon y en Intel, `otool` no encontró librerías de fuera del sistema y `--help` arrancó.
- Se publicó `whisper-cpp-b5454`.
- En este Mac:
  - se descargaron los dos programas y `shasum -c SHA256SUMS` dio OK en ambos;
  - `whisper-cli-darwin-arm64 --help` aceptó `-ojf`, `-pp`, `--prompt`, `--vad` y `-vm`.
- `versions.json` fija `darwin-arm64` y `darwin-x64`, con `archive: binary`.
- `lint`, `typecheck`, `test` (2771) y `test:installer` (29) pasan.
- Sigue sin probarse el reconocimiento real con el modelo, que queda para T076.
- Cierra P4 y el hallazgo abierto de que en Mac el fallo decía «Comprueba tu conexión».

## US2: revisar, corregir y aprobar (T042–T050), Puerta A del 2026-11-16

### 1. Resumen

El creador ya puede repasar los subtítulos: oír cada trozo, editar el texto y los tiempos (`m:ss,d`), partir, juntar, dar por revisado, cambiar una palabra en todos (con el número antes), pedir la revisión de la IA por tandas de 200 (coste antes; acepta cada cambio), volver a cualquier versión y aprobarlos. Todo con el teclado.

Los revisores encontraron tres graves en la revisión por tandas: el presupuesto se miraba tanda a tanda, las estimaciones caducaban en vídeos largos, y la regla del 30 % rechazaba arreglos de subtítulos cortos. Están corregidos con test, igual que los medios confirmados (decisiones 34 a 43).

**Resultado: pasada, condicionada a P4 (aspecto e interacción de «Revisar») y P5 (tandas ya pagadas si falla una tardía).** La IA real no está probada (T076).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|-----------|--------|-----------|-------|
| AS1, FR-008 | Cumplido | Cada subtítulo es un botón: Intro edita, Espacio oye su trozo, las flechas pasan al siguiente o al anterior (decisión 38). Partir, juntar y dar por revisado parten de lo escrito. `edit.test.ts` y e2e de US2 | 2026-11-16 |
| AS2, FR-010 | Cumplido | Un solape o un subtítulo fuera de límites se guarda con su marca calculada (`solapado`, decisión 42). `edit.test.ts`, `subtitles-edit.test.ts` | 2026-11-16 |
| AS3, FR-009 | Cumplido | «Se cambiará N subtítulos» antes; una sola versión nueva; la corrección queda en `replacements`. Test de rutas y e2e | 2026-11-16 |
| AS4, FR-012 | Cumplido | «Volver a esta» crea `recuperada` y el historial conserva todas. Test de rutas y e2e | 2026-11-16 |
| AS5, FR-013 | Cumplido | El editor y el historial avisan antes con subtítulos aprobados. Editar o recuperar los devuelve a borrador; guardar sin cambios no (decisión 37). Test de rutas y e2e | 2026-11-16 |
| AS6, FR-011 | Cumplido con la IA falsa | Coste antes en el botón; propuesta con el texto de antes y su motivo; nada se acepta sin marcarlo; versión `ia` con los tiempos intactos y `cambio_ia`. Salida estricta: id, distancia, palabra nueva, cifra, líneas y longitud. `review.test.ts`, test de rutas y e2e | 2026-11-16 |
| AS7, FR-010 | Cumplido | «Para revisar (N)» y «Todos». E2E | 2026-11-16 |
| Principio III con varias tandas | Cumplido | La revisión entera es una operación: los límites se comprueban con la suma, antes de pagar (decisión 35). Test | 2026-11-16 |
| Revisión con la IA real | No ejecutado | Necesita T076 y el permiso del creador | — |

### 3. Cómo se comprobó

- `pnpm lint` y `pnpm typecheck`: 0.
- `pnpm test`: 218 ficheros, 2835 pasan y 4 se saltan.
- `pnpm test:e2e`: catálogo con 97 pasan y 2 se saltan; web con 56 pasan.
- Tras el último cambio (el aviso del historial): los tests de la web (301) y `subtitles.spec.ts` (US1 y US2) se repitieron y pasan, y lint y typecheck dan 0.
- Flujo con los falsos: el e2e de US2 hace subtítulos con `con-errores` y recorre, solo con el teclado, oír, editar, Escape, partir, juntar, «Cambiar en todos», la revisión de la IA (`ok`, aceptando uno y dejando los demás), volver a la versión 1, aprobar con el aviso de lo que queda por revisar, recargar y el aviso de vuelta a borrador.

### 4. Controles

- **Pasados:**
  - lint, typecheck, test y test:e2e;
  - glosario y fuga de secretos;
  - axe en claro y oscuro a 375 y 1280 px con movimiento reducido, en seis estados de «Revisar» (lista, edición, diálogo de «Cambiar en todos», propuesta de la IA, historial, aprobados);
  - teclado con Tab, foco visible y el foco que vuelve al subtítulo;
  - los cinco fallos tipados de la IA, más `limite_de_gasto`, `respuesta_invalida` (`reescribe`, `id_inventado`, `cifra_inventada`) y el bloqueo por la suma de tandas: ninguno toca los subtítulos ni deja propuesta.
- **No aplica:** `test:installer`, porque el instalador no cambia y la migración 0009 solo añade una columna (migración probada).
- **No ejecutado:** la revisión con Claude real (T076).

### 5. Hallazgos

**Confirmados y corregidos:**
- Las tandas se comprobaban contra los límites una a una. Ahora la suma de las reservas se compara al estimar y otra vez antes de pagar (test).
- Las estimaciones de las tandas tardías caducaban en vídeos largos. Ahora cada tanda posterior pide la suya al empezar (test).
- El 30 % rechazaba «si» → «Sí.». Ahora los cambios que solo tocan mayúsculas, tildes o signos siempre valen (test).
- Una cifra del guion podía sustituir a la dicha. Ahora se rechaza (test).
- Las palabras del glosario se rechazaban. Ahora se admiten (test).
- Un texto de más de 300 caracteres pasaba la salida y luego no se podía guardar. Ahora se rechaza (test).
- Un reconocimiento podía pisar una revisión en marcha. Ahora da 409 `en_curso` (test).
- Partir, juntar y dar por revisado tiraban lo escrito en el editor. Ahora parten de ello.
- Guardar sin cambios creaba una versión y desaprobaba. Ya no (test).
- La corrección número 201 dejaba la versión hecha y daba un 500. Ahora se valida antes y da 400 (test).
- Las casillas salían marcadas. Ahora no, y cada una dice de qué subtítulo es.
- Había dos acciones principales a la vez. Ahora una.
- La marca de la IA citaba lo oído en vez del texto anterior. Ahora no lo cita si hay las dos marcas.
- El aviso de vuelta a borrador no salía al cambiar. Ahora sale en el editor y en el historial.
- El error del coste salía sobre toda la pantalla. Ahora sale dentro de «Revisar con la IA».
- El fallo de una descarga había perdido su botón «Descargar». Recuperado.
- El aviso de otra pestaña prometía algo que no cumplía. Texto corregido.
- `<audio>` con `<track>` vacío. Ahora el audio se crea en código.
- Textos compuestos en el componente, el 100 repetido a mano y una regla CSS muerta. Corregidos.
- Referencias a FR equivocadas. Corregidas.
- El contrato `ai-uses.md` y `data-model.md` estaban desfasados. Actualizados.
- La conexión del e2e se marcaba antes de hacerse. Corregido.

**Descartados:**
- El texto de `contenido_filtrado` («prueba a decirlo de otra forma») es el común de los fallos de la IA. En la revisión no hay indicaciones, pero el texto no engaña. Se deja para la pasada de diseño.

**Abiertos (menores):**
- La versión `ia` enlaza solo el consumo de la primera tanda. Todas quedan en `ai_usage` (decisión 35).
- Oír un trozo con `preload="none"` no está probado en Safari.

### 6. Desviaciones

- Cada subtítulo es un botón. Partir y juntar están en la edición, no en un menú (decisión 38, P4).
- Casillas en vez de «Aceptar» y «Rechazar» por cambio (decisión 39, P4).
- Reglas de la salida afinadas, con el contrato actualizado (decisión 41).
- «Cambiar en todos» distingue mayúsculas (decisión 42).

### 7. Decisiones

- **Del agente:** 34 a 43.
- **Del creador, pendientes:**
  - P1 a P3, que siguen;
  - P4: el aspecto y la interacción de «Revisar»;
  - P5: qué pasa con las tandas ya pagadas si falla una tardía.

### 8. Constitución

- **I:** una acción principal, avisos en llano y cada error con su botón.
- **II:** la IA propone, el creador marca cada cambio, y la marca y el texto de antes quedan a la vista.
- **III:** coste antes. Los límites se comprueban con la revisión entera y se vuelven a comprobar antes de pagar.
- **IV:** el uso nuevo pasa por el puerto, con salida estricta y escenarios del falso.
- **V:** ninguna cifra cambia.
- **VI:** axe, teclado y movimiento reducido.
- **XI:** este informe.

### 9. Cómo revertir

- Revertir el commit de US2.
- La migración 0009 solo añade `ai_proposal`. Revertir el código no la deshace: en una base ya migrada, la columna se queda sin usar.
- Pendiente: P4 y P5, T076 (IA y motor reales) y US3 en adelante.

## US3: los minutos reales de los capítulos (T052–T060), Puerta A del 2026-11-16

### 1. Resumen

Con los subtítulos hechos, el creador ve cada capítulo de su publicación con su minuto ahora, dónde suena en el audio y la diferencia. Marca los que quiere cambiar, quita o escribe a mano los que no aparecen y los lleva al paquete de la 006 como una versión nueva de los capítulos («minuto real»), con el aviso de vuelta a borrador.

Los revisores encontraron dos graves: no se podía quitar un capítulo cortado en el montaje (AS3), y el e2e de la 006 seguía esperando el texto sustituido. Están corregidos, igual que los medios confirmados (decisiones 44 a 51).

**Resultado: pasada.** Sin pendientes nuevos del creador. Siguen P1 a P5. La IA no interviene en esta historia y el audio real no está probado (T076).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|-----------|--------|-----------|-------|
| AS1, FR-014 | Cumplido | Cada capítulo con su minuto ahora (estimado, escrito o real), el del audio y la diferencia. `subtitles-chapters.test.ts` (a 2 s o menos del inicio del bloque) y e2e | 2026-11-16 |
| AS2, FR-015 | Cumplido | Un capítulo escrito a mano sale sin marcar y se queda como estaba salvo que se acepte. Test de rutas | 2026-11-16 |
| AS3, FR-014 | Cumplido | «No aparece en el audio», sin minuto propuesto: se puede quitar (sus bloques pasan al anterior) o escribir a mano (decisión 51). `align.test.ts` y test de rutas | 2026-11-16 |
| AS4, FR-016 | Cumplido | Versión nueva de `capitulos` con origen `edicion` y `fromAudio`; aviso antes con los textos o el paquete aprobados; vuelta a borrador; la descripción lleva el minuto real. Test de rutas y e2e (pone uno, vuelve a borrador y se aprueba otra vez) | 2026-11-16 |
| AS5 | Cumplido | Un capítulo que queda corto junto a un minuto real se guarda y la revisión de la 006 lo avisa (`capitulo_corto`), y la 006 lo sigue dejando editar. `chapters.test.ts` y test de rutas | 2026-11-16 |
| Caso límite: bloques en otro orden | Cumplido | `blockStarts` los encuentra donde están, y la lista dice cuál suena fuera de orden sin marcarlo (decisiones 44 y 51) | 2026-11-16 |
| SC-005 | Cumplido en casos fijos | A 2 s o menos en las pruebas de dominio y de rutas, y en la medida de una hora (decisión 44). Con audio real: no ejecutado | 2026-11-16 |
| Versiones guardadas antes de la 007 | Cumplido | `fromAudio` es opcional y se leen igual (`chapters.test.ts`) | 2026-11-16 |

### 3. Cómo se comprobó

- `pnpm lint` y `pnpm typecheck`: 0.
- `pnpm test`: 219 ficheros, 2860 pasan y 4 se saltan.
- `test:e2e`:
  - catálogo, 97 pasan y 2 se saltan;
  - web, 57 pasan, entre ellos el nuevo `subtitles-chapters.spec.ts` y `publish.spec.ts` con su texto actualizado.
- Una primera vuelta del catálogo falló en `theme.spec.ts` (WebKit, «10 cargas sin destello»). Repetido 3 veces, falló 1 de 18. Esta historia no toca el catálogo; en la vuelta final pasó.
- Flujo con los falsos: el e2e prepara un guion cuyos bloques son las frases del escenario `capitulos` del reconocedor falso (el tercero suena 40 s tarde) y aprueba su paquete. Comprueba la línea de la 006 sin subtítulos y los hace. Después, desde la 006, «Poner los minutos reales» lleva a la lista. Ahí ve tres marcados y desmarca dos con el teclado. Confirma la vuelta a borrador, ve el minuto real en la 006 y aprueba otra vez.
- Tiempo de `blockStarts`: 2,2 s para una hora (60 bloques de 150 palabras), medido con Node 24 en este Mac (decisión 44).

### 4. Controles

- **Pasados:**
  - lint, typecheck, test y test:e2e;
  - glosario y fuga de secretos (dentro de `pnpm test`);
  - axe en claro y oscuro a 375 y 1280 px con movimiento reducido, en la lista de minutos reales, el diálogo de vuelta a borrador y el paso de textos de la 006 con un minuto real;
  - teclado: las casillas con Tab y Espacio, y el botón y el diálogo con Intro.
- **No aplica:**
  - `test:installer`, porque el instalador no cambia y no hay migración (`fromAudio` va dentro del JSON de `capitulos`);
  - los fallos tipados de la IA, porque esta historia no llama a la IA.
- **No ejecutado:** SC-005 con un vídeo real (T076).

### 5. Hallazgos

**Confirmados y corregidos:**
- No se podía quitar un capítulo que no está en el audio (AS3). Ahora `remove` lo quita y sus bloques pasan al anterior; el primero nunca se quita (test).
- El e2e de la 006 esperaba «Ajústalos cuando tengas el vídeo montado», texto sustituido por la decisión 48. Actualizado; pasa.
- Un capítulo real corto bloqueaba después cualquier edición de los capítulos en la 006. Ahora, junto a un minuto real, solo cuenta el orden. Un minuto escrito a mano cumple el mínimo de la 006 (test).
- Un 409 de otra pestaña culpaba a los subtítulos y dejaba la sección atascada. Ahora se vuelve a leer el paquete antes de poner y tras un 409, y se dice que cambiaron los capítulos.
- El aviso de borrador dependía del estado leído al abrir. Ahora se lee al pulsar, y también cuenta una aprobación guardada.
- Bloques en otro orden: la propuesta no lo decía y el error culpaba al creador. Ahora lo dice, no los marca, y el error dice qué pasa.
- La propuesta se recalculaba (unos 2 s en un vídeo de una hora) y borraba lo marcado en cada edición de un subtítulo. Ahora solo cuando cambia lo oído.
- Tras poner uno, volvían a salir marcados los capítulos movidos con él. Ahora solo se marcan las diferencias de más de 2 s.
- Sin capítulos en el paquete decía «ya están en su minuto». Ahora dice que aún no hay.
- La 006 admitía un `fromAudio` inventado por la API. Ahora solo conserva el que ya estaba guardado con ese minuto (test).
- Un minuto escrito no tenía tope. Ahora no puede pasar del audio (test).
- El separador « · » estaba en el código. Ahora está en el catálogo.
- `ui-screens.md`, R13, T058, T059 y el contrato de la 006 estaban desfasados. Actualizados.
- Los riesgos de las decisiones 44, 45 y 47 subieron a Medio.

**Descartados:**
- *Un minuto real aceptado se guarda como «escrito por ti» si lo oído cambia entre ver y aceptar.* Pasa solo si se rehace el reconocimiento en otra pestaña. Entonces ese minuto ya no coincide con el audio, y guardarlo como escrito por el creador es lo cierto.
- *Desde la 006 no se puede volver al minuto estimado.* Escribir encima o «Volver a esta» lo hacen, y el campo dice que vacío conserva el minuto real.
- *Pedir de nuevo los capítulos a la IA pierde los minutos reales.* Son capítulos nuevos y la propuesta los vuelve a ofrecer.
- *`compare.ts` no distingue escrito de real con el mismo minuto.* El minuto no cambia.
- *Comprobar la 006 descarga toda la vista de subtítulos.* Una petición local al abrir el paso; menor.
- *Una aprobación de textos con la portada en borrador.* Ahora la cubre el aviso por aprobación guardada.

**Abiertos:** ninguno.

### 6. Desviaciones

- Lista en lugar de tabla, y «Poner los minutos marcados» como secundaria (decisión 49).
- `remove` añadido al cuerpo del contrato para cumplir AS3, y 404 también sin subtítulos (decisiones 47 y 51).
- La 006 deja de rechazar un capítulo corto junto a un minuto real (decisiones 46 y 51).

### 7. Decisiones

- **Del agente:** 44 a 51, todas de riesgo bajo o medio.
- **Del creador:** ninguna nueva. Siguen P1 a P5.

### 8. Constitución

- **I:** una acción principal, avisos en llano (fuera de orden, sin capítulos, cambios de otra pestaña) y la vuelta a borrador dicha antes.
- **II:** nada cambia en el paquete sin marcarlo. Lo escrito a mano no se marca, y el minuto real se distingue del escrito y del estimado.
- **III:** no hay gasto: ni IA ni Data API.
- **V:** ninguna cifra nueva en la interfaz. El mínimo de YouTube sigue saliendo del paquete de conocimiento, y la medida de tiempo está anotada con cómo se hizo.
- **VI:** axe, teclado y movimiento reducido.
- **XI:** este informe.

### 9. Cómo revertir

- Revertir el commit de US3. No hay migración.
- Las versiones de capítulos guardadas con `fromAudio` se siguen leyendo sin el campo (Zod lo ignora), con su minuto como estimación a recalcular.
- Pendiente: T076 (motor real y SC-005 con audio real), US4 en adelante, y P1 a P5.

## US4: subtítulos de un Short (T061–T064), Puerta A del 2026-11-16

### 1. Resumen

Con un guion de Short aprobado, el creador hace, revisa, aprueba y descarga sus subtítulos igual que los de un vídeo largo, con los límites del Short (una línea) y sin capítulos. Si el fichero dura más que el máximo de un Short de la 005, se le avisa antes de «Empezar» y puede seguir o elegir otro.

Los cuatro revisores coincidieron en que la fuente citada para el máximo era una página de ingresos, en un redondeo que hacía contradictorio el aviso y en que el e2e no aprobaba ni descargaba. Todo está corregido (decisión 52).

**Resultado: pasada.** Sin pendientes nuevos del creador. Siguen P1 a P5. La IA no interviene en esta historia y el audio real no está probado (T076).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|-----------|--------|-----------|-------|
| AS1, FR-004 | Cumplido | La pista toma el formato del guion: una línea de 32 caracteres como máximo. Lo prueban `segment.test.ts` («a Short: one line of 32»), `subtitles-short.test.ts` (cada subtítulo dentro de los límites, sin saltos de línea), el e2e (el editor dice «En una sola línea.» y cada bloque del SRT tiene una línea) | 2026-11-16 |
| AS1, sin capítulos | Cumplido | `GET …/chapters` da 404 aunque el Short tenga paquete (test de rutas), y la pantalla no muestra «Minutos reales de los capítulos» (e2e) | 2026-11-16 |
| AS2 | Cumplido | `PUT …/audio` devuelve `overShort` con el máximo de la 005 y su fecha, sin bloquear (test de rutas). La web avisa antes de «Empezar», que sigue activo. Con «Elegir otro fichero» y uno que cabe, el aviso desaparece (e2e) | 2026-11-16 |
| Resultado observable | Cumplido | En el e2e, los subtítulos del Short se aprueban y se descargan como SRT | 2026-11-16 |
| Principio V | Cumplido | El máximo sale de `market.shorts` y se cita igual que en la 005, con su fecha de revisión | 2026-11-16 |

### 3. Cómo se comprobó

- `pnpm lint` y `pnpm typecheck`: 0.
- `pnpm test`: 220 ficheros, 2864 pasan y 4 se saltan.
- `test:e2e`:
  - catálogo, 97 pasan y 2 se saltan;
  - web, 58 pasan, entre ellos el nuevo `subtitles-short.spec.ts` (puerto 4482).
- Flujo con los falsos, en el e2e:
  1. Se escribe un Short con la IA falsa y se descarga el programa falso.
  2. Se elige un WAV de 200 s: sale «Dura 3 min 20 s», el aviso y la fuente.
  3. Con «Elegir otro fichero» se elige `pan.wav`, y el aviso desaparece.
  4. Se pulsa «Empezar», sin sección de capítulos.
  5. Se abre un subtítulo («En una sola línea.»), se aprueba y se descarga el SRT.

### 4. Controles

- **Pasados:**
  - lint, typecheck, test y test:e2e;
  - glosario y fuga de secretos (dentro de `pnpm test`);
  - axe en claro y oscuro a 375 y 1280 px con movimiento reducido, en el aviso y en la revisión del Short;
  - teclado: «Elegir otro fichero», «Empezar», abrir un subtítulo, aprobar y descargar con Tab e Intro;
  - el aviso se anuncia con `role="status"`.
- **No aplica:**
  - `test:installer`: ni el instalador ni la base de datos cambian;
  - fallos tipados de la IA: esta historia no llama a la IA.
- **No ejecutado:** un Short real con el motor real (T076).

### 5. Hallazgos

**Confirmados y corregidos:**
- La fuente del máximo se elegía como `market.shorts.source[0]`, una página sobre el reparto de ingresos, y no coincidía con la de la 005. Ahora se cita como en la 005 («Máximo de un Short, según el paquete de datos de YTCreator») con su fecha.
- Un audio de 180,4 s avisaba «dura 3 min y un Short puede durar hasta 3 min». Ahora se compara en segundos enteros, como se muestra; hay un test con 180,4 y 180,6.
- El aviso no se anunciaba al lector de pantalla. Ahora lleva `role="status"`.
- El e2e no aprobaba, no descargaba, no abría el editor y no usaba «Elegir otro fichero». Ahora hace las cuatro cosas.
- El contrato HTTP no recogía `overShort`, y faltaba la decisión. Actualizados `contracts/http-api.md` y la decisión 52.
- Las rutas de T062 y T063 no coincidían con los ficheros. Decisión 53, y `tasks.md` actualizado.

**Descartados:** ninguno.

**Abiertos:** ninguno.

### 6. Desviaciones

- El aviso lo calcula el servidor, no la web leyendo el guion (decisión 52).
- Las pruebas están en ficheros propios (decisión 53).
- Se añade al texto «Puedes empezar igualmente o elegir otro fichero.», como pide AS2.

### 7. Decisiones

- **Del agente:** 52 (riesgo medio) y 53 (riesgo bajo).
- **Del creador:** ninguna nueva. Siguen P1 a P5.

### 8. Constitución

- **I:** el aviso se da antes de empezar y en llano, con las dos salidas a la vista.
- **II:** no se bloquea; el creador decide.
- **III:** no hay gasto.
- **V:** la cifra sale del paquete de conocimiento, con su fuente y su fecha, igual que en la 005.
- **VI:** axe, teclado, lector de pantalla y movimiento reducido.
- **XI:** este informe.

### 9. Cómo revertir

- Revertir el commit de US4. No hay migración.
- Un cliente antiguo ignora `overShort`.
- Pendiente: T076, las historias siguientes y P1 a P5.
