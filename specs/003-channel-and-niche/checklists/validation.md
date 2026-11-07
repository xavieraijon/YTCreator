# Validación: 003 canal y nicho

## Pendientes P2, P4, P5, P8, P9 y P19: Puerta A (2026-11-06): PASADA

### Resumen

Quedan cerrados los seis pendientes, con las recomendaciones que aceptó el creador (entradas 153 a 158). P9 deja de dar
verde con una lectura de YouTube que no se pudo leer; P8 muestra y deja cambiar el tipo de contenido del dinero; P4 avisa
solo al elegir otro nicho. P2, P5 y P19 son solo documentación. Queda abierto P36, que es nuevo y no bloquea.

### Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| P9 / US3 AS4: «sin comprobar» nunca es verde, también con salida ilegible | Cumplido | `ytdlp.contract.test.ts` (no JSON, sin `entries`, entradas ilegibles), `data-api.contract.test.ts`, `name-check.test.ts` | 2026-11-06 |
| P8 / US2 AS2: el tipo de contenido del dinero se ve y se cambia | Cumplido (en el recorrido) | `concepts.test.tsx`, `profile.test.ts`; perfil solo lo muestra (P36) | 2026-11-06 |
| P4 / FR-025: aviso al elegir otro nicho, no al volver | Cumplido | `journey.test.ts`, `concepts.test.ts` (dos tests), `channel-base.test.ts`, `niche-change.test.tsx`, e2e `channel-niche.spec.ts` | 2026-11-06 |
| P2 / US2 AS3: original y última edición | Cumplido (aclarado en la spec) | `spec.md` US2 AS3 y huecos | 2026-11-06 |
| P5: `spawn` en vez de `execFile` | Cumplido (tarea corregida) | `tasks.md` | 2026-11-06 |
| P19: referencias con fallos parciales | Cumplido (sin cambios, opción a) | entrada 158 | 2026-11-06 |

### Cómo se comprobó

`fnm exec --using=24 -- pnpm lint` → 0; `typecheck` → 0; `test` → 123 ficheros, 1464 pasados y 2 omitidos;
`test:e2e` → 97 y 35 pasados. Las cuatro órdenes se ejecutaron una tras otra tras la última corrección. En una primera
vuelta, el e2e falló por el entorno: se editaba durante la ejecución y fallaron el catálogo (tiempo agotado) y algunas
conexiones. Además, un contrato de IA que no se tocó superó su tiempo por 232 ms. Las dos cosas quedaron en verde al
repetir.

### Controles obligatorios

- **Pasados:**
  - lint, typecheck, test y e2e;
  - glosario y `secrets-leak` (dentro de `test` y `test:e2e`);
  - axe en claro y oscuro (`a11y.spec.ts`) y el diálogo de cambio de nicho auditado en `channel-niche.spec.ts`.
- **No ejecutados:**
  - `test:installer`: el instalador no cambia;
  - fallos de IA: no se tocó el adaptador de IA;
  - YouTube real: no se ejecutó, y el caso de salida ilegible solo se probó con el yt-dlp falso.

### Hallazgos de revisión

Cuatro revisores, sin hallazgos graves. Confirmados y corregidos:

- **P9 incompleto (medio, lógica y fidelidad):**
  - un JSON sin `entries`, o con entradas que no se pueden leer, daba `sin_datos`;
  - en la Data API, vídeos encontrados que no se pueden leer daban lo mismo;
  - ahora los tres casos dan `no_disponible`, con tests.
- **Texto de `no_disponible` (medio, seguridad y regresión):** mandaba a «prepararlo» con el lector instalado. Ahora dice
  «No hemos podido usar el lector de YouTube. Desde Ajustes puedes prepararlo o actualizarlo.»
- **`conceptNiche` con tope de 200 (medio, lógica):** la etiqueta de un nicho no tiene tope, así que una muy larga podía
  dejar el recorrido sin poder abrirse. Se quita el tope.
- **Riesgo mal clasificado (medio, fidelidad):** las entradas 155 y 156 pasan a Alto y la 158 a Medio.
- **P8 sin reflejo en la spec (medio, fidelidad):** se añade a US2 AS2.
- **Volver al nicho del concepto tras confirmar (menor, tres revisores):** ahora conserva el concepto. Test y entrada
  155.
- **Edición a mano de la tanda de nichos (menor):** ahora se comprueba con el nicho de antes de editar. Test.
- **`categoryOf` (menor):** con un perfil antiguo que no valida o una categoría desconocida devuelve `null`, en vez de
  un 500.
- **Texto de la categoría (menor):** ahora dice que la clasificó la IA y que se puede cambiar.
- **Selector inútil con «para niños» (menor):** se oculta.
- **Documentación (menores):**
  - `tasks.md` (T027 y T091b);
  - `data-model.md` (`conceptNeedsReview` y `conceptNiche`);
  - `http-api.md` (`PATCH` puede cambiar la revisión);
  - motivo de la entrada 157 (`maxBuffer`);
  - formato de los textos.

Descartado: «tests del recorrido de antes, sin `conceptNiche`» (menor). La rama existe y está comentada, pero
reproducirla exige escribir en la base de datos a mano. Se cubren el regenerar, el volver y la edición. Abiertos:
ninguno.

### Desviaciones

- Desaparece `confirm` de `POST /api/journeys/:id/step` (contrato actualizado).
- `data` ya no admite los campos que lleva el servidor.
- Aprobar un concepto puede cambiar la `revision` del recorrido.

### Decisiones

- Del creador: entradas 153 a 158.
- Pendiente nueva: P36, cambiar la categoría desde el perfil. Supone un cambio de formato del perfil y del `.json`, y la
  recomendación es b. No bloquea.

### Impacto en la constitución

- **Principio V:** el dinero dice con qué se calcula.
- **Principio II:** la categoría es una propuesta de la IA y se puede cambiar.
- **Principio I:** los textos son claros y el diálogo sale en el momento justo.
- **Principio IV:** sin cambios.
- **Principio VIII:** spec, contratos y tareas al día.

### Cómo revertir y qué queda

- Revertir: un `git revert` del commit; no hay migraciones.
- Queda: P36 y la pasada de interfaz con modo Design.

## Pendientes P1, P3, P6 y P17: Puerta A (2026-11-06): PASADA

**Resultado: pasada tras dos vueltas de revisión.** Los cuatro revisores hicieron la primera vuelta, y los de lógica y
coste, la segunda. Ningún hallazgo grave. El choque con el principio IV lo decidió el creador (entrada 152). Los
controles pasan en su última ejecución. No se llamó a ninguna IA ni a YouTube reales.

### 1. Resumen

- **P17:** el gasto de una petición no pasa del límite por operación. El reintento de una salida inválida se reserva:
  nada empieza si no caben dos llamadas. El botón dice lo más que puede costar.
- **P3:** volver a una tanda anterior ya no pierde la nueva; «Volver a la tanda más nueva» la recupera. **P6:** el
  YouTube falso sale de la build publicada, y `release.yml` lo vigila.
- **P1:** no hay fuente para el 5–50 %. El supuesto se dice «sin fuente» en pantalla y en el `.md`.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| P17: mirar el presupuesto antes de cada reintento y decir el máximo | Cumplido | `ai-run.ts` (`CALLS_RESERVED`, `mayAskAgain`, `maxCents`); `ai-run.test.ts`, bloque P17; `channel-base.test.ts` (estimación con `proposalId`) | 2026-11-06 |
| Principio IV: una salida inválida se reintenta una vez | Cumplido | Los adaptadores no cambian; batería de contrato C11 sin tocar | 2026-11-06 |
| P3: conservar las tandas al volver | Cumplido | `proposals.ts` (`newer`, `goForward`, `regenerate` con guarda); `/forward`; `BatchNav`; tests de repo, HTTP, `batch-nav.test.tsx` y e2e de nichos | 2026-11-06 |
| P6: fuera de producción y vigilado | Cumplido | Build de producción: 0 coincidencias del YouTube falso (10 antes) y 0 de la IA falsa; paso «No fake YouTube» | 2026-11-06 |
| P1: fuente (a) | No cumplido | Sin fuente: vidIQ da visitas absolutas, no una parte de la mediana (entrada 151) | 2026-11-06 |
| P1: marcarlo como supuesto (b) | Cumplido | `Concepts.tsx` (`moneyViewsAssumption`), `export.ts`; `existing.test.tsx`, `export.test.ts` | 2026-11-06 |

### 3. Cómo se comprobó

- `pnpm lint`: salida 0. `pnpm typecheck`: salida 0.
- `pnpm test`: salida 0; 123 ficheros, 1458 pruebas pasadas y 2 omitidas.
- `pnpm test:e2e`: salida 0; catálogo 97 pasadas, web 35 pasadas.
- `vite build --mode production` del servidor y `grep` de los dos pasos de `release.yml` sobre `server.mjs`: 0 y 0. La
  misma comprobación sobre la build de `main` daba 10 en el paso nuevo.

### 4. Controles obligatorios

- **Pasados:** lint, typecheck, test, test:e2e; glosario y `secrets-leak` (dentro de test y e2e); axe en claro y oscuro
  a 375 y 1280 px con `prefers-reduced-motion` (`audit` del e2e de nichos, que pasa por los botones de tanda); tipos de
  fallo de IA (tests de la 002 y de `ai-run`, sin cambios en su trato).
- **No ejecutados:** `test:installer`, porque el instalador no cambia. Teclado: no hay prueba nueva; `BatchNav` usa
  `Button` del design system.
- **Un fallo intermedio:** tras la vuelta 1, el e2e «límite de 1 céntimo» falló porque las preguntas, de 1 céntimo,
  necesitan ahora 2 (reserva). El test pasa a 2 céntimos, como el quickstart §4 (entrada 152).

### 5. Hallazgos de revisión

**Vuelta 1 (cuatro revisores), confirmados y corregidos:**

- El reintento sin presupuesto chocaba con el principio IV y con C11. El creador eligió reservarlo (entrada 152).
- `maxCents` se podía superar. Ahora es `max(2 × c, min(4 × c, límite por operación))`.
- La estimación de «Proponer otra» no contaba la propuesta que se rehace. Ahora la ruta lee `proposalId` y la web lo
  envía.
- Contratos sin actualizar: `http-api.md`, `cost.md` y `ai-uses.md`.
- Una tanda dejada al pedir otra desde una más antigua quedaba inalcanzable. `newer` sigue ahora el orden en que se
  pidieron.
- `/forward` no comprobaba si era legible. Corregido.
- En nichos y conceptos se podía cambiar de tanda mientras la IA proponía o se elegía, y en conceptos se perdía una
  edición. Corregido.
- El error de `BatchNav` no se borraba al reintentar. Corregido.
- El aviso de P1 salía en canales que ya existían. El `.md` no lo decía.
- Comentario huérfano en `Positioning.tsx`, paréntesis roto en la spec y `CLAUDE.md` desactualizado.

**Vuelta 2 (lógica y coste), confirmados y corregidos:**

- Un canal empezado «como nuevo» perdía el aviso de P1. Ahora se decide con `profile.context`, no con el origen.
- La guarda del padre descartado se hacía antes de la IA. Ahora también se hace dentro de la transacción de
  `regenerate`, con `409` si se dejó entre medias.
- «Como mucho» sin sitio para las indicaciones. Ahora se calcula con 500 caracteres de margen.
- «Otra opinión» se estimaba sin la opinión anterior. Corregido.
- En nombres, los botones de tanda no se apagaban al elegir ni se ocultaban con un nombre propio a medio escribir.
  Corregido.
- Una estimación vieja podía quedarse en pantalla. Ahora solo cuenta la última respuesta.

**Descartados:**

- «"Más nueva" no siempre es la que se acaba de dejar» (lógica, vuelta 2): es la siguiente en el orden en que se
  pidieron, y así se llega a todas. Está escrito en la entrada 150 y en `http-api.md`.

**Abiertos:**

- Que lo gastado no pase del límite depende de que la estimación de cada llamada sea una cota (caracteres / 3,5). Sin
  IA real no se puede medir; está dicho en `cost.md`.

### 6. Desviaciones respecto a la spec

- **De más:** «Volver a la tanda más nueva» y `newerId`, que P3 pedía y la spec no nombraba. El aviso de máximo en el
  botón.
- **De menos:** ninguna.

### 7. Decisiones

- **Del creador (alto):** 148, 149, 150 y 151 (aceptó las recomendaciones de P17, P6, P3 y P1) y 152 (reservar el
  reintento).
- **Del agente:** ninguna fuera de esas entradas.
- **Pendientes del creador que afecten:** ninguno. Siguen abiertos P2, P4, P5, P8, P9 y P19, de antes y sin relación.

### 8. Impacto en la constitución

- **III (gasto):** el importe confirmado dice el máximo, y lo gastado se para en el límite por operación.
- **IV (salidas validadas):** el reintento se mantiene siempre; se reserva en el presupuesto.
- **II y V (dato y supuesto):** el supuesto de visitas se dice «sin fuente»; ninguna tanda pagada se pierde.
- **I (novato):** textos en el catálogo, sin jerga (glosario); un botón principal por pantalla, porque los de tanda no
  son principales.

### 9. Cómo revertir y qué queda

- **Revertir:** `git revert` del commit de la rama `003-pendientes`. No hay migraciones; `newerId` es opcional y
  `maxCents` solo lo lee la web.
- **Queda:** buscar fuente para el 5–50 % (P1a), si aparece algún estudio. Comprobar con la IA real que el gasto de una
  petición con repeticiones no pasa del límite.

## Polish: Puerta A, T122 a T127 (2026-11-06): PASADA

**Resultado: pasada tras dos vueltas de revisión.** Los cuatro revisores hicieron la primera vuelta y los de lógica y
fidelidad la segunda: ningún hallazgo grave en ninguna. Los medios están corregidos o los decidió el creador. Los controles
pasan en su última ejecución. YouTube real se probó solo con yt-dlp; la IA real no se probó (entrada 141).

### 1. Resumen

Polish revisa los textos (glosario y «por qué importa» en cada paso), añade los casos difíciles que faltaban en e2e, pasa
el quickstart §1–§5, prueba YouTube real con yt-dlp y hace la auditoría de novato, que pasa en la ronda 3. De esas
pruebas salen cambios visibles: el panel del nombre en «Tu canal», las horas siempre del creador con lo que pide el
ritmo marcado como estimación, `/c/` y `/user/` aceptados, una sola frase sobre «un canal por ahora» y los avisos bajo la
cabecera.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| T122: glosario y escritura humana | Cumplido | `apps/web/test/glossary.test.ts` con todos los textos nuevos | 2026-11-06 |
| T122b / FR-004: cada paso dice por qué importa | Cumplido | `apps/web/test/channel/why.test.tsx` | 2026-11-06 |
| T125: casos difíciles de §4 | Cumplido, y además salir sin guardar | `channel-hard-cases.spec.ts` | 2026-11-06 |
| T125b: YouTube real | Cumplido con yt-dlp; 68 y 81 sin comprobar (entradas 134 y 141) | Sección «T125b» de arriba | 2026-11-06 |
| T126: quickstart §1–§5 | Cumplido | Sección «Polish: quickstart» de arriba | 2026-11-06 |
| T127: auditoría de novato | Pasa en la ronda 3 (0 graves, 3 medios, corregidos después) | `../novice-audit.md` | 2026-11-06 |
| FR-019: enlace, @, vídeo, `/c/` y `/user/` | Cumplido desde la entrada 144 (antes desviación, entrada 88) | `handle.test.ts`, batería Y9b, `existing.test.ts`, `youtube.test.ts`, real con yt-dlp | 2026-11-06 |
| FR-026: `.md` y `.json` con lo mismo y sus fuentes | Cumplido; el ritmo y su estimación van en el `.md`, el `.json` no cambia (entradas 142 y 145) | `export.test.ts` | 2026-11-06 |
| FR-028: un solo canal | Cumplido, y ahora se dice en pantalla (entrada 137) | `novice-003.test.tsx`, `profile.test.tsx` | 2026-11-06 |
| Principio V: sin cifras sin marcar | Cumplido: horas por vídeo como «estimación nuestra» (P7, entrada 142) | `novice-003.test.tsx`, `export.test.ts` | 2026-11-06 |

### 3. Cómo se comprobó

Con Node 24, cada comando por separado y leyendo su propio código de salida. Última ejecución, tras la vuelta 2:

| Comando | Resultado |
|---|---|
| `pnpm format` | Hecho; `fake-yt-dlp` solo con el cambio de esta fase (`/c/` y `/user/`) |
| `pnpm lint` | Código 0 |
| `pnpm typecheck` | Código 0 |
| `pnpm test`, con `node_modules/.vitest-cache` borrada | Código 0: 1441 correctas, 2 omitidas (las reales), 122 ficheros |
| `pnpm test:e2e` | Código 0: web 35 correctas (incluye salir sin guardar); catálogo 97 correctas y 2 omitidas |
| `pnpm test:installer` | Código 0: 29 correctas |
| `pnpm test:real-youtube` | 8 de 8 (sección «T125b»); tras la entrada 144 se volvió a ejecutar solo la de `/c/` y `/user/`, que pasa con el `resolve` de la app |

**Antes de quedar en verde fallaron:** el e2e de axe por la animación de cierre del aviso con «reducir movimiento» (fallo
de la 001, corregido, entrada 143); varios e2e por el texto repetido de la región viva de los avisos (`.first()`); el test
de glosario por «llama» en un texto nuevo; y un test de servidor cuyo doble de `resolve` no podía fallar.

### 4. Controles obligatorios

**Pasados**

- `lint`, `typecheck`, `test`, `test:e2e` y `test:installer` (apartado 3).
- Glosario y «por qué importa» (T122 y T122b).
- Fuga de secretos: `secrets-leak.spec.ts`. Esta fase no añade ningún `Secret.reveal()`; la clave sigue solo en la
  cabecera (`data-api.contract.test.ts`).
- Axe en claro y oscuro a 375 y 1280 px, teclado y `prefers-reduced-motion`: `a11y.spec.ts` y `channel-niche.spec.ts`,
  con el panel del nombre y los avisos; `toast-provider.test.tsx` para la salida sin animación.
- Fallos de IA: sin cambios en esta fase; los cinco tipos siguen cubiertos por las pruebas de la 002 y de US1 a US5.
- «Cómo se demuestra»: el quickstart §1–§5 (sección de arriba) y la auditoría de novato.

**Fallidos en la última ejecución:** ninguno.

**No ejecutados**

- IA real: el creador aprobó solo YouTube real (entrada 141).
- Data API real (`forUsername` para `/user/`): T125b no usó clave; solo con la Data API falsa.
- Entradas 68 y 81 con YouTube real: no hay un canal real estable con esas condiciones.
- Los pasos de «¿Dónde veo mi @?» no se han contrastado con YouTube real con fecha.
- La pregunta de salir sin guardar no la vio la auditoría de novato: su navegador no enseña los diálogos del sistema. La
  cubre el e2e nuevo.

### 5. Hallazgos de revisión

**Vuelta 1 (fidelidad, lógica, seguridad y coste, regresión).** Corregidos:

- «Aprobar» seguía apagado tras «Proponer otra»: el campo se vacía con cada propuesta (`key`).
- La flecha atrás no preguntaba con cambios sin guardar: un solo `popstate` que vuelve a la página si se rechaza; e2e.
- El `.md` no decía lo que pide el ritmo ni avisaba si no cabía (FR-026).
- El panel del nombre no se recuperaba de un fallo; Esc lo cerraba mientras guardaba.
- Los avisos suponían una cabecera de una fila: ahora se mide.
- Varios botones principales con el panel abierto (como la entrada 130).
- Contratos sin actualizar (`ui-screens.md`, `http-api.md`, `youtube-data.md`) y comentario viejo en `services/profile.ts`.
- Riesgo de la entrada 140, texto de `spec.md` sobre T125b y la fila de P35.

Llevados al creador (riesgo alto): el cambio del aviso en el design system (entrada 143), P7 (entrada 142), `/c/` y
`/user/` (entrada 144) y el formato del documento (entrada 145).

**Vuelta 2 (lógica y fidelidad).** Corregidos:

- `/c/` con la fuente «con mi clave» daba «El lector no está listo»: ahora pasa al lector.
- El `.json` cambiaba de formato sin decisión: vuelve a ser el perfil guardado, y el ritmo va solo en el `.md`.
- «Cancelar» del panel no deshacía «Proponer otros»; Esc actuaba desde otro panel o mientras la IA proponía; «Reintentar»
  podía cambiar el nombre dos veces.
- La ayuda de «¿Qué cambiarías?» en «Reescribir con la IA» nombraba un botón que no está; el texto pendiente decía
  «aprobar» junto a «Seguir»; el aviso de descarga afirmaba la carpeta.
- El contrato prometía la pregunta de salir en todos los editores: se acota a «Editar» de «Tu canal».
- Riesgo de las entradas 138 a 140 y 139 frente a 143: el creador las confirma (entrada 147).

**Descartados, con motivo:**

- `chooseName` en `Start.tsx`: es el camino de FR-018b para un recorrido terminado sin perfil, anterior a esta fase; no
  es el del perfil (entrada 136).

**Abiertos (menores, para la pasada de interfaz con modo Design):**

- La protección de «¿Qué cambiarías?» no llega a elegir desde una tarjeta (nicho, idea o nombre).
- Los otros editores («Cambiar algo», el enfoque, «Editar antes de guardar») no preguntan al salir.
- Editar la idea ya elegida hasta que el ritmo no cabe solo muestra el aviso, sin pregunta.
- Los menores abiertos de la auditoría de novato (`../novice-audit.md`).

### 6. Desviaciones respecto a la spec

- De menos: ninguna. FR-019 deja de ser desviación (entrada 144).
- De más, todas decididas por el creador: el panel del nombre en «Tu canal» (136), lo que pide el ritmo como estimación
  (142), la pregunta antes de un ritmo que no cabe, la de salir sin guardar y «Aprobar» apagado con texto (147), la
  frase de un solo canal (137) y `offsetTop` en los avisos (143).

### 7. Decisiones

- Del agente (medio): 135, 146.
- Del creador (alto), en esta fase: 133, 136, 137, 141, 142, 143, 144, 145 y 147. Pendientes del creador que afecten a
  esta fase: ninguno. Siguen abiertos P1, P3, P6 y P17, de fases anteriores.

### 8. Impacto en la constitución

- **I (sencillez para el novato):** auditoría pasada; un botón principal por pantalla también con el panel abierto.
- **II y V (dato, estimación y opinión separados; sin cifras sin fuente):** horas por vídeo marcadas como estimación; el
  `.json` no mezcla estimaciones con el perfil guardado.
- **III (gasto con aviso):** sin llamadas nuevas a la IA; «Cancelar» del panel descarta la tanda pedida, que ya se avisó
  antes de pedirla.
- **VI (accesibilidad):** el aviso ya no se anima al cerrarse con «reducir movimiento».
- **IX y XI:** auditoría de novato y Puerta A con informe.

### 9. Cómo revertir y qué queda pendiente

- Revertir: el commit de Polish es uno; `git revert` lo deshace entero. El cambio de la 001 (`offsetTop`) es opcional en
  `ToastProvider`: sin él, los avisos vuelven a la esquina de arriba.
- Pendiente: la pasada de interfaz con modo Design (menores abiertos) y P1, P3, P6 y P17.

## Polish: quickstart §1–§5 y YouTube real (T126 y T125b, 2026-11-06)

**Resultado: el quickstart pasa de §1 a §5 con los proveedores falsos, y YouTube real pasa con yt-dlp.** La IA real no se
ha probado: el creador aprobó solo YouTube real, con yt-dlp, sin clave, sin cupo y sin dinero (respuesta a T125b).

### §1. Comprobaciones automáticas

| Control | Resultado |
| --- | --- |
| `pnpm lint` | 0 errores |
| `pnpm typecheck` | 0 errores |
| `pnpm test` | 122 ficheros, 1441 tests, 2 saltados (los reales, fuera de CI) |
| `pnpm test:installer` | 29 tests |
| `pnpm test:e2e` | catálogo 97 y 2 saltados; web 35 (incluye `channel-hard-cases.spec.ts`, nuevo) |

El test de glosario pasa, y también el nuevo `apps/web/test/channel/why.test.tsx` (T122b): cada paso de los dos
recorridos explica por qué importa en una o dos frases cortas, sin términos prohibidos.

### §2 y §3. Recorridos de punta a punta

- **Canal nuevo:** `channel-niche.spec.ts` y `a11y.spec.ts` (este, solo con teclado) van de los intereses al perfil. En
  el camino: el importe antes de cada botón de IA, los nichos medidos con «Dato de YouTube · fecha», las ideas con sus
  rangos y fuentes, los nombres con semáforo, la descarga `.md` y `.json` y Ajustes › Consumo.
- **Canal existente:** `channel-existing.spec.ts` lleva `@cocinacorta30` del enlace al perfil. Comprueba lo que funciona
  citando vídeos y la propuesta de enfoque con la misma forma que el perfil de un canal nuevo.
- La auditoría de novato (T127) recorrió los dos a mano: ver `../novice-audit.md`.

### §4. Casos difíciles

| Caso | Dónde se comprueba |
| --- | --- |
| Nicho sin datos | `channel-niche.spec.ts` (nicho «sin datos» del YouTube falso) |
| YouTube bloquea | `channel-niche.spec.ts` (nicho «bloqueado»: «Volver a intentarlo», el resto se mide) |
| Sin lector | `channel-hard-cases.spec.ts`: nicho «sin lector» (entrada 135), aviso con «Ir a Ajustes» y «Actualizar el lector» |
| Nombre en rojo | `channel-niche.spec.ts` y `a11y.spec.ts` (@ ocupada: rojo con razón y pregunta antes de quedárselo) |
| Nombre aplazado | `channel-niche.spec.ts` y `a11y.spec.ts` («Decidir más tarde» y después «Elegir el nombre» desde «Tu canal») |
| Menos de 5 vídeos | `channel-existing.spec.ts` (`@cocinatres`, «Seguir como canal nuevo» con nombre y @) |
| Cerrar a mitad | `channel-niche.spec.ts` («Seguir donde lo dejaste» con lo ya medido) |
| Límite de gasto | `channel-hard-cases.spec.ts` (1 céntimo por operación: preguntas sí, nichos no, «Ver mis límites») |
| Cifra inventada | `channel-hard-cases.spec.ts` (escenario `cifra_inventada`: frase quitada y aviso) |
| Versiones | `channel-hard-cases.spec.ts` (dos ediciones, volver a la 1, se guarda como la 4 y la 2 y la 3 siguen) |

### §5. Seguridad de la clave de YouTube

`secrets-leak.spec.ts` guarda una clave de prueba y la busca en la base de datos, los logs, la carpeta de datos, los
ficheros del repositorio y las respuestas HTTP: no aparece, ni entera ni sin sus 4 últimos caracteres. Solo se ve su pista de 4 caracteres.

### T125b. YouTube real con yt-dlp

`pnpm test:real-youtube` (`packages/youtube/test/youtube.real.test.ts`), yt-dlp 2026.08.19, sin clave, con los mismos
límites de la app (3 procesos y 4 comprobaciones de @ a la vez). 8 de 8 en verde.

| Comprobación | Resultado |
| --- | --- |
| SC-004: 10 @ ocupadas conocidas | 0,6 s; las 10 salen `ocupado`. Antes falló: desde la UE la página de una @ redirige al aviso de cookies (corregido con `SOCS=CAI`, entrada 133, P35) |
| SC-003: medir 5 nichos | 37,8 s (límite 120 s); los 5 con cifras: un «con reservas» y cuatro «conviene» |
| SC-005: leer @veritasium | 4,5 s (límite 60 s); 200 vídeos, 94 Shorts, la imagen en `yt3.googleusercontent.com` |
| Entrada 57: @MrBeast | 5,9 s; 200 vídeos, 100 Shorts y vídeos largos |
| Entrada 88: direcciones `/user/` y `/c/` | Las dos llevan a un id `UC…` que yt-dlp lee. El creador decidió aceptarlas (entrada 144); se volvió a ejecutar solo esta comprobación con el `resolve` de la app y `/user/Vsauce` y `/c/veritasium` llevan a su canal |
| Entrada 84: @ con ñ | `@niños` se resuelve a un id `UC…` |

No se comprueban las entradas 68 y 81 porque no hay un canal real estable con esas condiciones (entrada 134).

## US5: Puerta A de la fase 7 completa, T111 a T121f y T124 (2026-11-06): PASADA

**Resultado: pasada tras tres vueltas de revisión.** El creador respondió P27 a P34 y todo está implementado. Los hallazgos
graves y medios de las tres vueltas están corregidos o descartados con motivo. Los controles pasan en su última ejecución.
Nada se ha comprobado con YouTube real ni con IA real (T125b). Sustituye a la Puerta A bloqueada del 2026-11-05, que se
deja debajo como historia.

### 1. Resumen

«Mi canal» enseña el perfil con sus cifras y fechas, y se puede:

- editar los textos, las respuestas y los supuestos del dinero;
- reescribir una parte con la IA (la promesa, los temas o el público), con el precio antes, una propuesta que se guarda
  en la base de datos y el sí del creador;
- volver a medir el nicho o, en un canal que ya existía, volver a leerlo, sin IA;
- cambiar el nombre en el paso de nombres;
- volver a una versión anterior;
- descargarlo en `.md` y `.json`.

Ajustes tiene «YouTube» y «Consumo».

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| US5 AS1: página con nicho, concepto, nombre y @, datos con fecha | Cumplido; la lectura del perfil se busca por su id (entrada 128) | `profile.test.tsx`, `positioning.test.ts`, `channel-niche.spec.ts` | 2026-11-06 |
| US5 AS2: editar o regenerar una parte; versión nueva por cambio | Cumplido: textos, respuestas y supuestos (P30, entradas 117, 121, 123 y 124); «Reescribir con la IA» (P28, entradas 115, 119, 126, 129 y 130) | `profile.test.ts`, `profile.test.tsx`, `uses.test.ts`, `channel-niche.spec.ts` | 2026-11-06 |
| US5 AS3: descargar `.md` y `.json` con lo mismo y sus fuentes | Cumplido; el JSON añade `version` y `sections` (P31) | `export.test.ts`, `profile.test.ts`, `channel-niche.spec.ts` | 2026-11-06 |
| US5 AS4: aviso de más de 90 días con «Volver a medir» | Cumplido: «Volver a medir» (P27, entradas 114 y 120) y «Volver a leer tu canal» (P32, entradas 125 y 128); las referencias guardan su fecha (entrada 132) | `profile.test.ts`, `positioning.test.ts`, `channel-reading.test.ts`, `profile.test.tsx` | 2026-11-06 |
| Volver a una versión anterior, también como versión nueva | Cumplido; conserva el nombre actual (entrada 103) y el dinero, con la categoría de su concepto (entrada 132) | `profile.test.ts` | 2026-11-06 |
| Cambiar el nombre elegido desde el perfil | Cumplido en el paso de nombres (P29, entradas 116, 122 y 131) | `profile.test.ts`, `names.test.ts`, `channel-niche.spec.ts` | 2026-11-06 |
| FR-029: el coste antes de cada llamada | Cumplido; la estimación va ligada al recorrido del canal | `ai-run.test.ts`, `profile.test.ts` | 2026-11-06 |
| FR-030, FR-033, P15, lector, consumo | Cumplido (sin cambios desde la vuelta del 2026-11-05) | Los de la Puerta A anterior | 2026-11-06 |

### 3. Cómo se comprobó

Con Node 24, cada comando por separado y leyendo su propio código de salida. Última ejecución, tras las correcciones de la
tercera vuelta:

| Comando | Resultado |
|---|---|
| `pnpm lint` | Código 0 |
| `pnpm typecheck` | Código 0 |
| `pnpm test`, con `node_modules/.vitest-cache` borrada | Código 0: 1382 correctas, 2 omitidas, 119 ficheros |
| `pnpm test:e2e` | Código 0: web 30 correctas; catálogo 97 correctas |
| `pnpm test:installer` | Código 0: 29 correctas |

**Antes de quedar en verde fallaron:**

- **Unitarias de la segunda vuelta:**
  - lista de usos sin `perfil_parte`;
  - migraciones esperadas `[1,2,3]`;
  - caché de vitest con la migración vieja («no such table»);
  - pruebas de `409` que competían con el trabajo falso. Pasan a sembrar un trabajo en marcha.
- **Unitarias de la tercera vuelta:** dos casos de límites de vídeos que ya no existen (entrada 124).

### 4. Controles obligatorios

**Pasados**

- `lint`, `typecheck`, `test`, `test:e2e` y `test:installer` (apartado 3).
- Glosario: `apps/web/test/glossary.test.ts` con los textos nuevos del panel y del editor.
- Fuga de secretos: `secrets-leak.spec.ts`. Esta historia no añade ningún `Secret.reveal()` (revisor de seguridad).
- Axe y teclado: perfil, editor, historial y el panel de reescribir (`channel-niche.spec.ts`, `a11y.spec.ts`).
- Fallos de IA: las cinco causas y `respuesta_invalida` de `perfil_parte` en `profile.test.ts`. Una propuesta pagada no
  se pierde con un `409` (entrada 126).
- Gasto: el precio en el botón y el presupuesto comprobado antes. «Volver a medir» y «Volver a leer» no apuntan nada en
  `ai_usage`.
- Prompt: `perfil_parte@1` registrado en `lock.json`; la batería de contrato lo recorre por `CHANNEL_OUTPUTS`.
- «Cómo se demuestra»: T111 a T114, T121c a T121f y T124. En `channel-niche.spec.ts`, el recorrido entero:
  1. descargar;
  2. editar con el aviso infantil;
  3. reescribir los temas;
  4. cambiar el nombre;
  5. restaurar;
  6. Ajustes.

**Fallidos en la última ejecución:** ninguno.

**No ejecutados**

- YouTube real e IA real: necesitan la aprobación del creador (T125b).
- La auditoría de novato: es la puerta final de la feature.

### 5. Hallazgos de revisión

**Primera vuelta (2026-11-05):** corregida antes de la Puerta A bloqueada; el detalle está en su apartado 5, más abajo.

**Segunda vuelta (2026-11-06), con P27 a P31 implementados.** Corregidos:

- **Grave:** al cambiar el nombre después de reescribir con la IA se perdía lo hecho tras el recorrido. `finish` comparaba
  con la última versión `ia` y ahora compara con la del recorrido.
- **Avisos:**
  - los avisos que salen de las palabras y los de la IA se perdían al editar o al volver a medir (entrada 121);
  - el dinero se multiplicaba con un ritmo sin límites (entrada 124).
- **Volver a medir:**
  - el trabajo decía «guardado» sin versión; ahora falla;
  - dos medidas a la vez; ahora `409`;
  - la acción del error no seguía su causa.
- **Edición:**
  - los supuestos del dinero no se podían corregir (entrada 123);
  - la promesa de la IA se buscaba mal.
- **Gasto:** la estimación servía para otro recorrido.
- **Panel:**
  - tenía un botón principal de más y faltaba «Editar antes de guardar» (entrada 130);
  - se podía guardar mientras se medía.
- **Nombre:** cambiarlo en un canal que vino de YouTube (entrada 122, ahora Medio).
- **Documentos** sin enmendar.

Tres huecos de riesgo alto que se llevaron al creador:

- **P32:** volver a leer el canal (entrada 125).
- **P33:** la propuesta guardada en la base de datos (entrada 126).
- **P34:** el origen de la versión (entrada 127).

**Tercera vuelta (2026-11-06), sobre todo lo anterior.** Seguridad sin graves ni medios. Corregidos (entradas 124, 128,
129, 131 y 132):

- **Fidelidad 1 (grave):** las referencias copiadas al volver a medir salían con la fecha de hoy. Ahora conservan la suya
  (FR-008).
- **Fidelidad 3 / lógica M1:** el dinero tomaba la categoría de otro concepto. Ahora sigue la versión hasta su concepto.
- **Lógica M2 / seguridad 1:** una versión recuperada perdía su lectura y su aviso de antigüedad. Hay una ruta nueva,
  `GET …/profile/reading`.
- **Lógica M3:** volver a leer con «sin vídeos» guardaba una lectura vacía. Ahora es un fallo.
- **Seguridad 1:** si fallaba la versión, la lectura nueva se guardaba igual. Ahora se deshace.
- **Fidelidad 5:** el límite de vídeos (0 a 60, sin decimales) era inventado. Se quita, y solo se comprueba lo que cambia.
- **Regresión 1 / fidelidad 4 / lógica m3:** «Decidir más tarde» borraba el nombre elegido. Además, terminar sin cambios
  guardaba una versión repetida.
- **Lógica m1 / regresión 2:** un nicho podía acabar con la medida de otro.
- **Fidelidad 2 / lógica m5:** una promesa de la IA recuperada salía como «Escrita por ti».
- **Lógica m2 / regresión 3:** al volver a la pantalla no se sabía que había una medida en marcha.
- **Regresión 4:** cancelar el editor escondía la propuesta.
- **Regresión 5:** el aviso «ya no está» se quedaba puesto.
- **Regresión 6:** se podía pedir a la IA mientras se medía.
- **Lógica m4:** sustituir la propuesta no era atómico.
- **Fidelidad 6:** riesgo de la entrada 129, ahora Medio.
- **Fidelidad 7 / regresión 7 y 8:** textos del editor y del conflicto, y documentos.

**Descartados, con motivo:**

- Que «Terminar» perdiera el nombre elegido al volver a nombres: no pasa, se queda con el elegido.
- Seguridad, notas sobre código anterior (el reintento de cifras sin estimación, P17; la estimación de
  `/journeys/:id/proposals` sin recorrido): no son de esta historia y ya constan.

**Abiertos (menores):**

- Al reabrir el recorrido para cambiar el nombre, «Mi canal» enseña «Seguir donde lo dejaste» en vez del perfil, y en
  nombres se puede volver a pasos anteriores (entrada 131). Se sale con «Terminar» o «Decidir más tarde».
- Lo guardado desde «Editar antes de guardar» queda como del creador, aunque no se toque (entrada 119).
- El esquema de `perfil_parte` pide las tres partes, y las cifras se comprueban también en las dos que se copian. Una
  copia mala acaba en `respuesta_invalida`, cobrada.
- La estimación no cuenta las instrucciones (hasta 500 caracteres) ni la parte.
- Si falla el descarte tras guardar desde el editor, la propuesta vuelve como «desactualizada».
- Dos pestañas pidiendo a la vez pagan dos propuestas, y la primera se sustituye.
- Si la versión de «Volver a medir» no se puede hacer, la medida nueva queda guardada sin uso. El perfil sigue con la suya.
- Un aviso que vino de una palabra quitada sigue (entrada 121).

### 6. Desviaciones respecto a la spec

- De menos: ninguna de la historia. Editar «cualquier parte» se limita a textos, respuestas y supuestos (P30); las cifras
  no se editan a mano (principio V).
- De más:
  - `GET /api/settings/knowledge` (entrada 97);
  - `version` y `sections` en el JSON (P31);
  - «Volver a leer tu canal» (P32);
  - la tabla `profile_regeneration` (P33);
  - `GET …/profile/reading` (entrada 128).

### 7. Decisiones

- **Del agente:** entradas 93 a 124 y 128 a 132 de `decisions.md`.
  - Medio, a destacar:
    - 116, 117, 120 y 121 a 124;
    - 129, reclasificada;
    - 130 a 132.
  - La 93 pasó a alto (P30).
- **Del creador (alto), resueltas:**
  - P27 «Medir aquí»;
  - P28 «Añadir la tarea»;
  - P29 «Paso de nombres»;
  - P30 «Textos y respuestas»;
  - P31 «Mantenerlos»;
  - P32 «Volver a leer»;
  - P33 «En la base de datos»;
  - P34 «Dejarlo así».
- **Pendientes de antes,** sin relación con esta historia: P6, P9 y P17.

### 8. Impacto en la constitución

- **I:** sin jerga (glosario). Lo básico va sin «Modo experto».
- **II:** la propuesta de la IA se marca como tal y solo se guarda con el sí del creador. «Escrita por ti» reconoce las
  promesas de la IA en cualquier versión `ia`.
- **III:**
  - el precio va en el botón y el presupuesto se comprueba antes;
  - cada estimación se usa una vez y va ligada al recorrido;
  - «Volver a medir» y «Volver a leer» no cuestan dinero, solo cuota, y no se repiten a la vez.
- **V:**
  - las cifras no se editan a mano y llevan su fecha también en el documento;
  - el dinero sale del conocimiento con la categoría del concepto;
  - las referencias copiadas conservan la fecha en que se leyeron.
- **VII:** sin `reveal()` nuevos; la clave sigue solo en la cabecera.
- **IX:** axe y teclado en las pantallas nuevas.
- **X:** contratos, modelo de datos, plan y decisiones al día.
- **XI:** tres vueltas de revisión. Los huecos de riesgo alto se llevaron al creador.

### 9. Cómo revertir y qué queda pendiente

- **Revertir:** los dos commits de la fase 7 son independientes del resto.
  - La migración `0004_profile_regeneration.sql` solo añade una tabla. Si se revierte el código, la tabla sobra sin
    efecto.
  - Para quitarla del todo hace falta una migración nueva con `DROP TABLE profile_regeneration`. Nunca se edita la 0004.
- **Pendiente:**
  - las pruebas reales (T125b, con la aprobación del creador);
  - la auditoría de novato de la feature;
  - los menores abiertos del apartado 5.

## US5: Puerta A de la fase 7, T111 a T121 y T124 (2026-11-05): BLOQUEADA (sustituida por la de arriba)

**Resultado: bloqueada por decisiones de riesgo alto del creador (P27 a P31), no por fallos.** Los controles pasan en su
última ejecución y los hallazgos graves de la primera vuelta están corregidos. Las correcciones aún no las ha visto
ningún revisor: las respaldan las pruebas, y se revisarán en la segunda vuelta, cuando el creador responda. Nada se ha
comprobado con YouTube real ni con IA real.

### 1. Resumen

«Mi canal» enseña el perfil con sus cifras y fechas, se edita (textos), guarda una versión por cambio, vuelve a una
anterior y se descarga como documento (`.md`) o como datos (`.json`). Ajustes tiene ahora «YouTube» (fuente, lector,
clave en «Modo experto» con solo su pista, cupo) y «Consumo» (gasto de hoy y del mes, y conocimiento viejo).
Faltan tres piezas de la spec que esperan al creador: «Volver a medir» (P27), regenerar con IA (P28) y cambiar el nombre (P29).

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| US5 AS1: página con nicho, concepto, nombre y @, datos con fecha | Cumplido | `profile.test.tsx`, `channel-niche.spec.ts` | 2026-11-05 |
| US5 AS2: editar o regenerar una parte; versión nueva por cambio | **Parcial:** se editan los textos (P30); regenerar con IA no tiene tarea (P28) | `profile.test.ts`, `profile.test.tsx`, `a11y.spec.ts` | 2026-11-05 |
| US5 AS3: descargar `.md` y `.json` con lo mismo y sus fuentes | Cumplido; el JSON añade `version` y `sections` (P31) y lleva los matices de la pantalla (entrada 109) | `export.test.ts`, `profile.test.ts`, `channel-niche.spec.ts` | 2026-11-05 |
| US5 AS4: aviso de más de 90 días con «Volver a medir» | **Parcial:** el aviso está; el botón espera a P27 (entrada 102) | `profile.test.tsx` | 2026-11-05 |
| Volver a una versión anterior, también como versión nueva | Cumplido; conserva el nombre actual (entrada 103) | `profile.test.ts` | 2026-11-05 |
| FR-030: cupo de la clave con aviso al pasar del 80 % | Cumplido, aviso fuera de «Modo experto» (entrada 112) | `youtube-settings.test.ts`, `youtube.test.tsx` | 2026-11-05 |
| FR-033: la clave solo por su pista; lo básico sin ella | Cumplido (entradas 99, 100, 105, 106) | `secrets-leak.spec.ts`, `youtube-settings.test.ts`, `data-api-key.test.ts` | 2026-11-05 |
| P15 a): una clave rechazada se marca y deja de probarse | Cumplido, ligada a la pista de la clave (entrada 107) | `youtube-settings.test.ts`, `youtube.test.ts` | 2026-11-05 |
| «Actualizar el lector»: versión fijada y SHA256 | Cumplido (entrada 98) | `reader-update.test.ts` | 2026-11-05 |
| Consumo y conocimiento de más de 180 días en Ajustes | Cumplido (entradas 97 y 108) | `usage.test.ts`, `youtube.test.tsx` | 2026-11-05 |
| Cambiar el nombre elegido desde el perfil | **No cumplido:** la ruta existe y no hay pantalla (P29, entrada 95) | `profile.test.ts` (ruta) | 2026-11-05 |

Los cinco campos de la historia en `spec.md` están cubiertos; sus huecos abiertos son P27 a P31.

### 3. Cómo se comprobó

Con Node 24, cada comando por separado y leyendo su propio código de salida. Última ejecución:

| Comando | Resultado |
|---|---|
| `pnpm lint` | Código 0 |
| `pnpm typecheck` | Código 0 |
| `pnpm test`, con `node_modules/.vitest-cache` borrada | Código 0: 1329 correctas, 2 omitidas, 119 ficheros |
| `pnpm test:e2e` | Código 0: web 30 correctas; catálogo 97 correctas |
| `pnpm test:installer` | Código 0: 29 correctas |

**Antes de quedar en verde fallaron:**

- **Glosario:** el marcador `{handle}` de `channelEs.profile.handle`; pasa a `{arroba}`.
- **E2E, primera ejecución, 3 fallos reales:** el perfil ya no tenía un título con el nombre del canal (US4 y teclado);
  ahora el nombre es el título de su apartado. `secrets-leak` buscaba «Modo experto» como botón y es un `summary`; además
  el apartado se plegaba al guardar la clave, porque la vista se montaba de nuevo. Corregidos los tres.
- **Unitarias tras las correcciones:** un caso de `forbidden` que ya no cuenta (entrada 107) y el escaneo de textos de la
  exportación, que leía mal los comentarios. Corregidos.

### 4. Controles obligatorios

**Pasados**

- `lint`, `typecheck`, `test`, `test:e2e` y `test:installer` (apartado 3).
- Glosario: `apps/web/test/glossary.test.ts`, que ahora también revisa los textos del documento descargado.
- Fuga de secretos: `secrets-leak.spec.ts` (T124) con la clave de YouTube (base de datos, logs, carpeta, Git, DOM y
  respuestas) y `youtube-settings.test.ts`.
- Axe en claro y oscuro a 1280 y 375 px y al 200 %, con `prefers-reduced-motion`: perfil, editor, historial,
  Ajustes → YouTube y Consumo (`channel-niche.spec.ts`). T123.
- Teclado: editar, guardar, abrir el historial, restaurar, llegar a «Descargar como documento» y guardar una clave en
  «Modo experto» (`a11y.spec.ts`).
- Fallos de IA: esta historia no llama a la IA; «costs nothing» lo comprueba en `profile.test.ts`.
- «Cómo se demuestra»: T111 a T114, T124 y el recorrido descargar → editar → restaurar → Ajustes de `channel-niche.spec.ts`.

**Fallidos en la última ejecución:** ninguno.

**No ejecutados**

- YouTube real e IA real: necesitan la aprobación del creador (T125b). La comprobación real de una clave cuesta 1 unidad.
- La auditoría de novato: es la puerta final de la feature.

### 5. Hallazgos de revisión

Primera vuelta con los cuatro revisores sobre el diff. Corregidos (sin segunda revisión todavía):

- **Lógica G1 / fidelidad 2 / regresión 1:** elegir el nombre después de volver atrás perdía el concepto o nicho nuevo
  (entrada 104).
- **Lógica G2 / fidelidad 3 / regresión 2:** restaurar dejaba dos nombres y «Elegir el nombre» sin salida (entrada 103).
- **Lógica M1 / fidelidad 1:** el `409` no se veía y el segundo guardado pisaba la otra ventana (entrada 110).
- **Lógica M2 / fidelidad 6:** «Siempre con mi clave» sin clave dejaba sin YouTube (entrada 105).
- **Fidelidad 4 / regresión 3:** «Ir a Ajustes» llevaba a la pestaña IA (entrada 113).
- **Fidelidad 5 / regresión 4:** la exportación perdía matices de las cifras y tenía textos distintos de la pantalla, fuera
  del glosario (entrada 109).
- **Seguridad 1 / lógica 2 / regresión 5:** con el cupo agotado no se podía cambiar de clave, y el error hablaba del
  lector (entrada 106).
- **Seguridad 3, 4 y 7 / lógica 1, 3 y 4:** `forbidden`, la respuesta tardía de otra clave y un cuerpo de error mal formado
  (entrada 107).
- **Menores:** leer el binario entero para saber la versión (`existsSync`), el fichero de versión escrito tras sustituir el
  binario (ahora los dos se escriben aparte y se renombran), 600 s de descarga como el instalador, el campo de fecha mal
  señalado en `/api/usage`, claves de React repetidas, la promesa propia marcada como de la IA (entrada 111), el aviso del
  cupo dentro de «Modo experto» (entrada 112), los 180 días escritos en el texto, el aviso del editor con aspecto de nota,
  y contratos y modelo de datos sin enmendar (`http-api.md`, `data-model.md`).

**Descartados, con motivo:**

- Seguridad 5 (el release no busca el YouTube falso): ya es P6, abierto desde la revisión retroactiva; las ramas falsas
  dependen de `__YTC_ALLOW_FAKE_AI__`, `false` en producción.
- Seguridad 6 (un `reveal()` en el falso): está en la carpeta ya permitida, no amplía la regla (entrada 100), y el falso
  no entra en producción.
- Fidelidad 9 (fecha de revisión inventada si falta la fuente): no es alcanzable, `knowledgeSources` siempre las incluye.
- Fidelidad 14 («Lector de YouTube listo» sin descargar): con la versión fijada ya puesta, el lector está listo de verdad.

**Abiertos (menores):** el `PATCH .../name` no mira el resultado de la comprobación (se decide con P29); el 160 de la
promesa y los 90 días copiados en la web y en textos; el separador « · » del historial escrito en el JSX; las cifras de
`thresholds.json` repetidas en el texto de la exportación; `settings.module.css` sin `@layer`, como ya estaba.

### 6. Desviaciones respecto a la spec

- De menos: «Volver a medir» (P27), regenerar con IA (P28), cambiar el nombre (P29) y editar «cualquier parte» (P30).
- De más: `GET /api/settings/knowledge` (entrada 97), `version` y `sections` en el JSON (P31), la marca de clave
  rechazada en ajustes (entrada 99) y el `400` de la fuente sin clave (entrada 105).

### 7. Decisiones

- Del agente: entradas 93 a 113 de `decisions.md`. La 93 se reclasifica a alto (P30).
- Pendientes del creador (alto): P27 «Volver a medir», P28 regenerar con IA, P29 cambiar el nombre, P30 qué se edita,
  P31 formato del JSON.

### 8. Impacto en la constitución

- I: sin jerga en pantalla (glosario, también del documento); la clave vive en «Modo experto» y lo básico va sin ella.
- II: se distingue lo escrito por el creador («Escrita por ti») de la opinión de la IA; nada se publica fuera.
- III: nada de esta historia gasta; comprobar una clave cuesta 1 unidad de YouTube, que se dice antes de guardar.
- V: las cifras no se editan a mano y llevan su fecha también en el documento (P30 decide hasta dónde).
- VII: la clave solo por su pista, en ningún log, base de datos, URL ni Git.
- IX: axe y teclado en las pantallas nuevas.

### 9. Cómo revertir y qué queda pendiente

- Revertir: el commit de la fase 7 es independiente; no hay migraciones. El ajuste `youtube.api_key_rejected` sobra sin
  efecto si se revierte.
- Pendiente: respuestas a P27 a P31; con ellas, implementar lo que toque, segunda vuelta de revisión y cerrar T121b.

## US4: Puerta A de la fase 6, T101 a T110b (2026-11-05): PASADA

**Resultado: pasada, en 3 vueltas.** Controles sin fallos en su última ejecución, sin hallazgos graves abiertos y sin
pendientes de riesgo alto que bloqueen la fase. Lo corregido tras la tercera vuelta no lo ha visto ningún revisor
(apartado 3), y nada se ha comprobado con YouTube real ni con IA real.

### 1. Resumen

Un canal que ya existe va del enlace al mismo perfil que uno nuevo: Enlace → Confirmar → Lectura → Ritmo → Posicionamiento.
Las decisiones de riesgo alto las tomó el creador (P20 a P26 y las entradas 88 a 90). Sigue probado solo con proveedores
falsos: T125b tiene la lista de lo que falta comprobar de verdad, y SC-005 está sin medir.

### 2. Requisitos

| Requisito | Estado | Evidencia | Fecha |
|---|---|---|---|
| FR-012b: preguntar horas y forma de aparecer antes del enfoque | Cumplido, con la excepción de la entrada 89 | `positioning.test.ts` («the answers of the creator», «the answers change…»), `channel-existing.spec.ts` | 2026-11-05 |
| FR-014b: el público mueve los euros | Cumplido | `positioning.test.ts` («the answers change…») | 2026-11-05 |
| FR-019: URL de canal, @ o URL de vídeo, y confirmar | **Parcial:** las URL `/c/` y `/user/` no se reconocen (entrada 88, decidido por el creador) | `existing.test.ts`, `handle.test.ts`, `channel-existing.spec.ts` | 2026-11-05 |
| FR-020: hasta 200 vídeos recientes, cifras como dato y con fecha | **Parcial:** sin fechas, los dos formatos se reparten el sitio (entrada 87, decidido por el creador) | `channel-reading.test.ts`, `ytdlp.contract.test.ts` | 2026-11-05 |
| FR-020b: formatos aparte, mejores y peores por veces lo normal, 30 días | Cumplido | `channel-reading.test.ts` | 2026-11-05 |
| FR-021: perfil actual y posicionamiento, citando vídeos | Cumplido; la entrada 78 lo amplía a todo cambio propuesto | `positioning.test.ts`, `claims.test.ts`, `existing.test.tsx` | 2026-11-05 |
| FR-021b: mismo perfil que un canal nuevo, con su contexto | Cumplido; el contexto pierde las citas (entrada 83), que siguen en la lectura | `positioning.test.ts`, `channel-existing.spec.ts` | 2026-11-05 |
| FR-022: menos de 5 vídeos, recorrido nuevo con nombre y @ | Cumplido, también con ñ (entrada 84) | `existing.test.ts`, `channel-reading.test.ts`, `channel-existing.spec.ts` | 2026-11-05 |
| FR-008: fuente y fecha en cada cifra | Cumplido: la visita típica lleva sello de YouTube y las visitas al mes son estimación | `existing.test.tsx` | 2026-11-05 |
| SC-002: ninguna cifra solo de la IA | Cumplido en las formas que reconoce el validador; otras no se detectan (entrada 77) | `claims.test.ts` | 2026-11-05 |
| SC-005: resumen en menos de 1 minuto | **Sin comprobar:** necesita YouTube real (T125b) | No ejecutado | — |

Los cinco campos de la historia en `spec.md` están cubiertos, y sus «Huecos abiertos» se han actualizado.

### 3. Cómo se comprobó

Con Node 24, cada comando por separado y leyendo su propio código de salida. Última ejecución:

| Comando | Resultado |
|---|---|
| `pnpm lint` | Código 0 |
| `pnpm typecheck` | Código 0 |
| `pnpm test`, con `node_modules/.vitest-cache` borrada | Código 0: 1251 correctas, 2 omitidas, 111 ficheros |
| `pnpm --filter @ytcreator/web test:e2e` | Código 0: 29 correctas |
| `pnpm --filter @ytcreator/catalog test:e2e` | Código 0: 97 correctas, 2 omitidas |
| `pnpm test:installer` | Código 0: 29 correctas |

**Antes de quedar en verde fallaron:**

- **Catálogo, axe en Chromium:** agotó sus 2 minutos en dos ejecuciones con la máquina muy cargada por otras sesiones
  (carga de 28 a 80). Solo, pasó en 1,5 minutos.
- **Catálogo, `theme.spec.ts` «10 cargas sin destello» en WebKit:** falló una vez y pasó al repetirlo. Lee el fondo en
  `DOMContentLoaded` y recibió `rgba(0, 0, 0, 0)`. Esta rama no toca el catálogo, `packages/ui` ni `packages/tokens`, pero
  no se ha averiguado más: es una prueba intermitente con carga, no un fallo descartado de otra forma.
- **Web, `channel-existing.spec.ts`:** falló de verdad tras separar la visita típica de la estimación, porque el
  localizador pasó a encontrar dos textos. Se corrigió la prueba, que ahora comprueba los dos.

**Lo que ningún revisor ha visto:** las correcciones de la tercera vuelta, porque es el máximo de la Puerta A. Son el
apartado «Vuelta 3» de abajo y solo las respaldan las pruebas. `test:installer` se ejecutó antes de los últimos cambios,
que solo tocaron pruebas.

### 4. Controles obligatorios

**Pasados**

- `lint`, `typecheck`, `test`, `test:e2e` y `test:installer` (apartado 3).
- Glosario: `apps/web/test/glossary.test.ts` y los de catálogo y `packages/ui`, dentro de `pnpm test`.
- Fuga de secretos: `apps/web/e2e/secrets-leak.spec.ts`, dentro del e2e de la web.
- Axe en claro y oscuro a 1280 y 375 px y al 200 %, con `prefers-reduced-motion`, en cada pantalla de US4
  (`channel-existing.spec.ts`, con `audit.ts`). T123.
- Teclado: «an existing channel from its link to the profile with the keyboard alone» (`a11y.spec.ts`).
- Fallos de IA: `sin_sesion`, `cupo_agotado`, `tiempo_agotado`, `contenido_filtrado` y `no_disponible`, en la lectura y en
  el posicionamiento (`positioning.test.ts`). Es la respuesta del servidor; en pantalla se apoya en el componente común.
- «Cómo se demuestra»: T101 a T104 y el recorrido del «Independent Test» con el canal falso de 30 vídeos
  (`channel-existing.spec.ts`).

**Fallidos en la última ejecución:** ninguno.

**No ejecutados**

- YouTube real e IA real: necesitan la aprobación del creador. La lista está en T125b.
- La auditoría de novato: es la puerta final de la feature, no de esta fase.

### 5. Hallazgos de revisión

Cuatro revisores en cada vuelta, con contexto limpio. Cada hallazgo se contrastó con el código.

**Vuelta 1, corregidos**

- Grave: con yt-dlp, un canal sin vídeos largos no pasaba de la búsqueda (entrada 68).
- El perfil actual se aprobaba sin que nadie lo pidiera (entrada 62).
- El validador daba por buena cualquier cifra de «veces lo normal» (entrada 58).
- También: vídeos sin fecha, reparto de Shorts, doble lectura del mismo canal, respuesta tardía de la IA, región, @ con otras
  letras y fecha de la lectura.

**Vuelta 2, corregidos**

- Grave: una cifra inventada de «X veces lo normal» llegaba a la pantalla, porque se avisaba del recorte sin quitarla
  (entrada 77).
- Se aprobaban unos euros y una región y se guardaban otros (entrada 75).
- «Volver a leer» daba lo mismo durante una hora (entrada 76).
- Un cambio podía afirmar qué funciona sin citar vídeos (entrada 78).
- El servidor no exigía el perfil aprobado ni las respuestas (entrada 79).
- Menores: ritmo inflado con pocos días, imagen fuera de la política, `keptName` sin límites, canal sin título, 404 en
  `/videos`, contrato contradictorio, código sin uso.

**Vuelta 3, sin graves; corregidos**

- Un canal sin título acababa en un recorrido sin salida: ahora toma su @ como nombre y un recorrido existente no vuelve a
  elegir nombre (entrada 81).
- Un enfoque guardado que ya no valida tumbaba toda la vista (entrada 92).
- El sello de YouTube estaba sobre una estimación: ahora está sobre la visita típica (entrada 82).
- El prompt no decía que todo cambio cita un vídeo (entrada 78).
- «Ir a Ajustes» quitaba el reintento y lleva a una pantalla aún sin YouTube: ahora salen los dos (entrada 91).
- El validador marcaba «normalmente» o «media hora» y leía «1.000 veces» como 1; ahora reconoce números en letra hasta diez.
- Contratos y T125b al día.

**Descartados, con su justificación**

- La entrada 70 como riesgo alto: tirar una respuesta ya pagada no añade gasto, solo evita mezclar dos canales, y el gasto
  consta. Se queda en medio.
- `keptName` no escribible por `POST /step`: basta con limitarlo, porque solo se enseña.
- Una imagen con puerto explícito pasa `safeThumbnail` y la política la bloquea: se vería rota, sin riesgo.

**Elevados al creador:** las entradas 56, 57, 60, 64, 69, 75 y «Volver a la anterior», con riesgo mal clasificado. Ver el
apartado 7.

**Abiertos**

- Menor: una edición desde una pestaña vieja puede deshacer una respuesta, porque `PATCH /proposals/:id` no pide `revision`.
  Es el riesgo que el creador ya aceptó para la región (entradas 32 y 41), ampliado a la forma de aparecer (75).
- Menor: el texto del perfil actual se escribe en español en el servidor (entrada 83).
- Menor: el validador no reconoce todas las formas de decir una cifra, y una de visitas o euros puede coincidir por
  casualidad con un número de la lectura (diseño R8).
- Menor: «Volver a leer» no salta los 10 minutos de pausa del lector de fechas (entrada 76); el texto dice «dentro de un rato».
- Menor, de antes: la estimación no cuenta `previous` ni las indicaciones (relacionado con P17).
- Sin comprobar con YouTube real: los de T125b.

### 6. Desviaciones respecto a la spec

**De menos**

- FR-019: sin las URL `/c/` y `/user/` (entrada 88).
- FR-020: «los 200 más recientes» solo donde hay fechas (entrada 87).

**De más**

- Paso Ritmo en el recorrido existente, ya en la spec (P20).
- `POST /journeys/:id/as-new` (entrada 60).
- «Volver a leer» (entrada 71).
- Un cambio propuesto siempre cita un vídeo, más de lo que pide FR-021 (entrada 78).
- FR-012b admite un enfoque escrito para otras respuestas, con aviso (entrada 89).

### 7. Decisiones

**Del creador, riesgo alto, todas decididas:**

- 72 a 74: preguntas de ritmo, euros de un canal existente y canal con pocos vídeos.
- 84 a 87: @ con ñ, paso del nombre, imagen del canal y cifras de la lectura.
- 88 a 90: URL antiguas, aprobar con aviso y mantener «Volver a la anterior».

**Del agente, riesgo medio, a revisar:** 54, 55, 58, 59, 62, 63, 67, 68, 70, 71, 75 a 83, 91 y 92. Las que más se notan:

- 76 y 91: qué ofrecen «Volver a leer» e «Ir a Ajustes».
- 78: la IA no puede proponer un cambio sin citar vídeos.
- 80: el ritmo se calcula sobre una semana como mínimo.
- 82: los textos nuevos.

**Excepción a destacar (entradas 56 y 86):** la política de seguridad se abre a `*.ggpht.com` y `*.googleusercontent.com`, y
el navegador pide la imagen a Google. El creador lo aprobó.

**Pendientes del creador:** siguen abiertos P1 a P9, P17 y P19, como pedía el encargo. Ninguno pausa esta fase, pero US4
hereda P1, P3 (entrada 90), P6, P7 (aviso de ritmo) y P17.

### 8. Impacto en la constitución

Sin cambios de principios ni de versión.

- **I (novato):** todo fallo ofrece reintentar, y los textos pasan el glosario.
- **II (control):** cada propuesta se aprueba a propósito y lo que se ve es lo que se guarda.
- **III (gasto):** el servidor no pide ni estima un enfoque sin perfil aprobado y respuestas. P17 sigue abierto.
- **V (cifras):** las cifras salen de la lectura y el dominio, con el validador como red.
- **VI (accesibilidad):** axe, teclado y movimiento reducido.
- **VIII (alcance):** sin subidas, sin dependencias nuevas y sin tocar el design system.
- **XI (autonomía):** este informe.

### 9. Cómo revertir y qué queda

**Revertir:** `git revert` del commit de esta fase. No hay migración nueva; `0002_channel.sql` cambia en su propio fichero
porque aún no está publicado. Una base de desarrollo anterior conserva la restricción antigua de la @: con una @ con ñ, leer
el canal daría un error hasta crearla de nuevo.

**Queda**

- T125b con aprobación del creador, con la lista ampliada de lo de US4.
- US5, con Ajustes de YouTube (T120).
- Las pruebas intermitentes del catálogo con carga podrían endurecerse aparte.

## Puerta A de las correcciones, segundo intento, T129 a T134e (2026-11-05): PASADA

**Resultado: pasada, con 4 vueltas en vez de 3.** Tras la tercera quedó bloqueada por P18, y el creador aprobó esa decisión
y una vuelta más. Controles sin fallos, sin hallazgos graves abiertos y sin pendientes de riesgo alto que afecten a esta
fase.

### 1. Resumen

P13 a P16 y P18 están decididas por el creador, y P16 y P18 implementadas. Lo corregido sigue probado solo con proveedores
falsos, salvo una lectura real de 3 canales grandes. Tras la cuarta revisión hubo un último retoque que ningún revisor ha
visto (apartado 3).

### 2. Requisitos

| Hallazgo o tarea | Estado | Cómo se comprueba | Fecha |
|---|---|---|---|
| P13: confirmar las entradas 26, 31, 32 y 34 | Hecho. La 31 consta como excepción en FR-012b | `decisions.md`, `spec.md` | 2026-11-05 |
| P14: recorte de ingresos con confianza baja | Hecho. La etiqueta dice que es una estimación | `concepts.test.tsx`, `glossary.test.ts` | 2026-11-05 |
| P15: una clave rechazada avisa y deja de probarse | **Sin hacer:** va en T117 y T120, cuando se pueda guardar la clave | `tasks.md` | 2026-11-05 |
| P16, T134c: sin veredicto con menos de la mitad de cifras conocidas; solo el aviso, sin cifras | Hecho | `measures.test.ts` | 2026-11-05 |
| P18, T134e: lo que el recorte quita se dice en pantalla | Hecho en preguntas, opinión, nichos, conceptos y nombres | `trimmed.test.tsx`, `proposal.test.tsx`, `claims.test.ts`, `ai-run.test.ts` | 2026-11-05 |
| FR-014: los euros con sus supuestos | Hecho: la IA no puede omitirlos, y sin ellos el concepto se quita. El creador sí puede borrarlos al editar | `uses.test.ts`, `ai-run.test.ts`, `http/concepts.test.ts` | 2026-11-05 |
| T134d: fallos de canal, caída por tiempo agotado, textos y glosario | Hecho | `niche-research.test.ts`, `youtube.test.ts`, `glossary.test.ts` | 2026-11-05 |

Los demás requisitos de T129 a T134b siguen como dice la sección del primer intento, más abajo.

### 3. Cómo se comprobó

- **Revisores:** los cuatro, de solo lectura, en 4 vueltas. La primera, sobre el diff entero; las demás, solo sobre lo
  cambiado. Cada hallazgo corregido se contrastó leyendo el código.
- **Sin revisar:** tras la cuarta vuelta se tocaron el esquema de lo que da la IA frente a lo que edita el creador
  (`conceptsEditedOutput`), la causa del fallo en las referencias y sus pruebas. Hay pruebas y controles, pero ningún revisor
  los ha visto.
- **Prueba real, con aprobación del creador:** yt-dlp 2026.08.19, con los argumentos de la app y sin clave ni gasto, da
  `channel_follower_count` al leer `/channel/UC…/videos` en YouTube (46,6 M), Google for Developers (2,68 M) y Fireship
  (4,33 M). Son canales grandes: los pequeños siguen sin probar, y de eso depende P16.
- **Flujo real:** el recorrido, con la IA y el YouTube falsos, y una medida con los adaptadores reales y un yt-dlp falso.
  Los avisos nuevos se han comprobado renderizando las pantallas en pruebas, no a mano en el navegador, y la auditoría de axe
  no llega a un estado con recorte.

### 4. Controles

Leyendo el código de salida real de cada comando. `lint`, `typecheck` y `test` corrieron sobre el código definitivo;
`test:e2e` y `test:installer`, justo antes de arreglar una prueba del servidor, sin cambios en el código de la app.

| Control | Resultado |
|---|---|
| `pnpm lint` | Pasa (salida 0) |
| `pnpm typecheck` | Pasa (salida 0) |
| `pnpm test`, con la caché borrada | Pasa: 1124 correctas, 2 omitidas, 107 ficheros. Incluye el glosario, ahora también sobre las fuentes del conocimiento, y los fallos de IA de la batería |
| `pnpm test:e2e` | Pasa: 97 del catálogo y 26 de la web, incluido `secrets-leak`. Falló una vez antes, ver abajo |
| `pnpm test:installer` | Pasa: 29 de 29 |
| axe en las pantallas del recorrido | Pasa, en claro y oscuro, a 1280, 375 y 640 × 400 |
| Teclado | Pasa el recorrido entero |
| `prefers-reduced-motion` | Pasa, pero solo detecta bucles y animaciones de más de 2 s: las más cortas ya han terminado al mirar |

**Fallo intermitente sin explicar:** `theme.spec.ts:79`, en WebKit, una vez en 5 tandas, al comparar el color de fondo de las
10 cargas. Pasó 3 de 3 en solitario. Esta fase no toca el catálogo, la UI ni los tokens. La causa no está averiguada.

**No ejecutado:** YouTube real completo (T125b), IA real, la auditoría de novato, SC-001 y SC-004, y la build de producción.

### 5. Hallazgos

**Corregidos, los más importantes:**

- Un solo canal que fallaba tiraba toda la medida, en contra del contrato.
- Una propuesta recortada podía guardarse inválida e impedir terminar el recorrido, o dar un error 500 (M6).
- Lo que el recorte quitaba desaparecía sin aviso en las preguntas y la opinión.
- La IA podía dar un concepto sin supuestos.
- El tiempo agotado de la Data API no caía a yt-dlp, en contra de la entrada 25.
- La etiqueta bajo los euros atribuía la tabla a AIR, y «RPM» salía en pantalla sin que el glosario lo viera.
- Las referencias podían quedarse con 1 canal para siempre, y decían el primer fallo en vez del más repetido.
- «1 canales» en la puerta de entrada.
- El veredicto no decía que solo habla de los canales mirados.
- La batería de contrato se había relajado.

**Abiertos, medios:**

- Una estimación cubre una llamada y puede haber hasta cuatro, y se puede pasar del límite por operación (P17, antes M15).
- Una lista de referencias con 2 o más puede quedarse sin un canal mejor (P19).
- La entrada 27, de los límites de los feeds, sigue en riesgo medio aunque fidelidad pide subirla: es reversible, está
  declarada y reduce el riesgo frente a no tener límites. Lo que tolera YouTube y el tiempo real se miden en T125b.

**Abiertos, menores:**

- Un concepto que pierde un pilar, o un nicho sus búsquedas, hace fallar toda la respuesta aunque quedaran otros válidos. El
  fallo se ve y se puede reintentar.
- El aviso de recorte es genérico: no dice qué se ha quitado.
- Una cifra escrita por el creador deja de servir de fuente al pedir otra propuesta.
- Una medida con hasta la mitad de canales fallidos no se puede repetir hasta pasados 90 días.
- Un canal con la cifra oculta se guarda 24 h, así que reintentar no cambia nada.
- Tras caer a yt-dlp, cada repetición vuelve a llamar antes a la Data API. Hoy no se alcanza: llega con T117.
- Umbrales escritos en los textos (200.000, 90 días) y límites de los feeds en código, contra `contracts/knowledge.md`.
- Cuándo sube `version` en el conocimiento no está decidido: `shorts.json` y `rpm.json` lo tratan distinto.
- Una propuesta ilegible se muestra vacía sin explicación (entrada 39).
- Sigue valiendo la lista de menores del primer intento, salvo lo corregido arriba.

**Descartados, con motivo:**

- Subir la entrada 49 a riesgo alto: ya no muestra jerga y el glosario lo comprueba.
- La fecha de `thresholds.json` en 2026-11-05: ese día se añadió un umbral, así que es correcta.

### 6. Desviaciones respecto a la spec

- **De menos:** FR-012b, con la excepción aceptada por el creador.
- **De más:** la revalidación tras recortar y la regla de la causa del fallo, ya en los contratos.

### 7. Decisiones

- **Del creador:** entradas 41 a 44, 50 a 53.
- **Del agente, a destacar:** 45 (confirmada en la 50), 46, 48, 49, 54 y 55. Revisa sobre todo los textos de la 49 y la 55.
- **La entrada 53** se apartó de lo que se le había dicho al creador. Lo marcó la revisión y se le preguntó antes de cerrar.
- **Pendientes que no bloquean esta fase:** P1 a P9, P17 y P19. Impiden cerrar la feature.

### 8. Impacto en la constitución

- **I (sin jerga, errores honestos):** mejora: el glosario ve las fuentes del conocimiento y la pantalla ya no da un motivo
  falso.
- **II y V (cifras con fuente):** mejoran: el veredicto no sale con pocos datos y la etiqueta dice que es una estimación. El
  recorte por región sigue sin fuente, aprobado en P14.
- **III (gasto):** el gasto se registra entero, pero se puede pasar del límite por operación (P17).
- **IX (accesibilidad y novato):** falta la auditoría de novato.
- **X (dependencias):** ninguna nueva.
- **XI (autonomía demostrada):** las decisiones de riesgo alto se llevaron al creador antes de cerrar, y la 47 y la 53 se
  reclasificaron tras la revisión.

### 9. Cómo revertir y qué queda

- **Revertir:** deshacer el commit de esta fase. La migración 0003 solo añade una columna que admite nulos.
- **Sin push ni PR:** se hace solo cuando el creador lo pida.
- **Después:** US4. Con aprobación, la prueba real de T125b, que debe incluir canales pequeños.

## Puerta A de las correcciones, primer intento (2026-11-04): BLOQUEADA

Informe de ese momento. Lo que dice de P13, P14, P16 y los abiertos corregidos lo actualiza la sección anterior.

**Resultado: bloqueada, a falta de una decisión del creador.** Los controles pasan, pero tres pendientes de riesgo alto
afectan a esta fase: P13, P14 y P16 (`decisions.md`). T135 sigue sin marcar y no hay commit.

### 1. Resumen

Los seis graves de la revisión retroactiva están corregidos en el código y probados con proveedores falsos. Sigue sin
probarse contra YouTube real, que necesita aprobación. Han hecho falta las 3 vueltas permitidas.
Quedan sin revisar los últimos retoques, que solo cubren las pruebas (apartado 3).

### 2. Requisitos

| Hallazgo o tarea | Estado | Cómo se comprueba |
|---|---|---|
| G1, T129: sin clave, `auto` usa yt-dlp; una clave rechazada también cae a yt-dlp | Hecho. Falta decirlo en pantalla (P15) | `youtube-default-path.test.ts`, `youtube.test.ts` |
| G2, T130: fechas por RSS en las búsquedas de yt-dlp, con límites | Hecho. Volumen real sin medir | `rss.test.ts`, `ytdlp.contract.test.ts`, `youtube-default-path.test.ts` |
| G3, T131: la muestra incluye canales pequeños; los no leídos van aparte | Hecho. Veredicto con pocos canales leídos, en P16 | `measures.test.ts`, `niche-research.test.ts`, `migration-0002.test.ts` |
| G4, T132: las cifras siguen al recorrido al leer y al cerrar el perfil | Hecho. Decisiones en P13 | `http/concepts.test.ts`, `http/names.test.ts`, `channel-input.test.ts` |
| G5, T133: la confianza se muestra y se guarda en el perfil | Hecho. La fuente del recorte por región no existe (P14) | `concepts.test.tsx`, `profile.test.ts` |
| G6, T134: el gasto de una respuesta inválida se registra | Hecho en los tres proveedores. La suma entre intentos solo se prueba en Anthropic | `anthropic.contract.test.ts`, `battery.ts`, `ai-run.test.ts` |
| T123: auditoría y teclado en el recorrido nuevo | Hecho, sin cubrir cada estado de error (entrada 37) | `channel-niche.spec.ts`, `a11y.spec.ts` |

### 3. Cómo se comprobó

- **Revisores:** los cuatro, de solo lectura, en cada una de las 3 vueltas sobre el diff real. Cada hallazgo usado se
  contrastó leyendo el código.
- **Sin revisar:** tras la tercera revisión se tocaron la validación de cifras con `previous`, las reglas de la región,
  el aviso de conceptos antiguos y la entrada de la IA. Tienen pruebas, pero ningún revisor los ha visto, porque ya no
  quedaban vueltas.
- **Flujo real:** recorrido entero con la IA y el YouTube falsos, y una medida con los adaptadores reales, un yt-dlp falso
  y feeds falsos.

### 4. Controles

Todos sobre el código definitivo, leyendo el código de salida real de cada comando.

| Control | Resultado |
|---|---|
| `pnpm lint` | Pasa (salida 0) |
| `pnpm typecheck` | Pasa (salida 0) |
| `pnpm test`, con la caché borrada | Pasa: 1097 correctas, 2 omitidas, 106 ficheros. Incluye el glosario y los fallos de IA de la batería |
| `pnpm test:e2e` | Pasa: 97 del catálogo y 26 de la web. Incluye `secrets-leak` |
| `pnpm test:installer` | Pasa: 29 de 29 |
| axe en todas las pantallas del recorrido | Pasa con todas las reglas, en claro y oscuro, a 1280, 375 y 640 × 400 |
| Teclado | Pasa el recorrido entero, con formularios propios, editor, diálogo y «Terminar» |
| `prefers-reduced-motion` | Solo se emula durante la auditoría; no hay prueba específica de esta fase |

**No ejecutado:**

- YouTube real (T125b): necesita aprobación. Por eso no se sabe si tolera los feeds ni cuánto tarda (SC-003).
- IA real: necesita aprobación. No se sabe si cobra una llamada cortada por tiempo.
- Auditoría de novato sobre estos cambios.
- SC-001 y SC-004.
- La build de producción, para ver si el YouTube falso queda fuera.

### 5. Hallazgos

**Bloquean:**

- Decisiones de riesgo alto ya aplicadas sin confirmar (P13). Es el grave de la tercera revisión de fidelidad.
- Euros sin fuente (P14) y veredicto con pocos canales leídos (P16).

**Corregidos en las 3 vueltas, los más importantes:**

- La región no seguía al recorrido.
- La marca de región puesta a mano se deducía mal.
- La medida guardaba la fuente prevista, no la que respondió.
- La caché de yt-dlp no se usaba tras caer a él.
- Los feeds no tenían límite global y repetían canales.
- Una respuesta HTML contaba como feed leído.
- La IA recibía fechas parciales como completas, y cifras antiguas que le valían de fuente.
- Los perfiles sin confianza dejaban de leerse.
- Sin ningún canal leído salía «cerrada».
- Las referencias perdían a los canales más vistos.

**Abiertos, medios:**

- Recortar cifras puede vaciar un campo: se paga y la respuesta es un error 500, sin propuesta. Viene de antes (M6).
- Una estimación cubre una llamada y puede haber hasta cuatro. Viene de antes (M15).
- Si YouTube bloquea a yt-dlp, las lecturas en cola siguen adelante. Solo los feeds paran.
- Una clave rechazada no avisa (P15).
- El peor caso sigue siendo de 720 peticiones de feeds por recorrido (entrada 27).

**Abiertos, menores:**

- Una pestaña desfasada puede fijar la región anterior.
- Una búsqueda puede heredar el tope de tiempo de otra en un feed compartido.
- El canal con el mejor vídeo puede quedar fuera de la muestra.
- Una propuesta aprobada e ilegible falla al terminar.
- Un solo feed fallido reduce a 1 h la caché de toda la búsqueda.
- La IA ve `entryChannels` sin saber cuántos canales no se miraron.
- Tokens perdidos al rotar de cuenta.
- El contador local de cuota se queda atrás.
- `names` sin tope en la API.
- La estimación ignora `previous` e `instructions`.
- `release.yml` no vigila el YouTube falso (P6).
- `contracts/ai-uses.md` lista `answers` en `recomendacion`, y no se envía.
- La pantalla no muestra `small_channels`.

**Descartados, con motivo:**

- Actualizar el contrato de la 002 por `usage`: no se reescribe lo entregado; la ampliación consta en `contracts/ai-uses.md`.
- Las «30 veces» de `spec.md`: coinciden con la fuente (0,33 frente a 10,22 $). Lo que se aleja es `rpm.json`, y va en P14.
- Dar `unreadChannels` a la IA: se probó y se quitó, porque sin explicación en el prompt respaldaría cifras por error.
- Puerto repetido en `a11y.spec.ts`: no choca, con un solo worker.

**Corrección a la revisión anterior:** decía que las 30 veces estaban exageradas. No lo están respecto a AIR.

### 6. Desviaciones respecto a la spec

- **De menos:** el perfil puede guardar un ritmo y un formato que no encajan con las respuestas, en contra de FR-012b, si
  el creador elige un concepto antiguo tras el aviso (P13).
- **De más:** el aviso de conceptos escritos con otras respuestas, y el mensaje de «datos suficientes».
- **Otro:** una propuesta ilegible se muestra vacía (entrada 39).

### 7. Decisiones

- **Del creador:** P10, P11 y P12, aprobadas con «Sí, corrígelos» (entradas 22 a 24).
- **Del agente, a destacar:** 25, 27, 29, 30, 33, 35, 37, 38, 39 y 40. Revisa sobre todo los textos de la 29.
- **Pendientes de riesgo alto que bloquean:** P13 (26, 31, 32, 34), P14 y P16. **Pendiente que no bloquea hoy:** P15.
- **Siguen abiertos de antes:** P1 a P9.

### 8. Impacto en la constitución

- **II y V (cifras con fuente):** mejoran, pero el recorte por región sigue sin fuente (P14).
- **III (gasto):** el gasto ya se registra entero. Sigue sin avisarse de que puede superar lo estimado (M15).
- **IX (accesibilidad y novato):** auditoría ampliada; falta la auditoría de novato.
- **X (dependencias):** ninguna nueva.
- **XI (autonomía demostrada):** cuatro decisiones se tomaron antes de preguntar. Se han reclasificado y esta Puerta queda
  bloqueada por ello.

### 9. Cómo revertir y qué queda

- **Revertir:** nada está confirmado. Son 60 ficheros sin commit, y la migración 0003 solo añade una columna que admite
  nulos.
- **Para desbloquear:** responder P13, P14 y P16. Si se elige P16 a), hay que implementarlo y repetir los controles.
- **Después:** marcar T135, hacer el commit y, solo con aprobación, la prueba real de T125b. US4 sigue sin empezar.

## Revisión retroactiva de las fases 2 a 5 (2026-11-04)

Informe de ese momento. Lo que dice de hallazgos sin corregir y de T123 sin ejecutar lo actualiza la sección anterior.

### Resumen

Sobre `a1c54a2..11e33f8` (217 ficheros, unas 16.600 líneas sin specs ni lockfile), con `revisor-fidelidad` y
`revisor-seguridad-y-coste`. La arquitectura encaja con el plan, y no hay fugas de secretos ni inyección en yt-dlp. Pero
**el camino real por defecto, sin clave de YouTube, no funciona**, y ninguna prueba podía verlo. Quedan abiertos 6 graves,
16 medios y 15 menores. No se ha corregido ninguno.

### Cómo se comprobó

- Los revisores solo leyeron código; no ejecutaron nada. Corrieron con sus instrucciones sobre un agente sin edición,
  porque los ficheros de revisor no se cargan hasta la sesión siguiente. Ese agente sí tenía Bash, a diferencia de los
  revisores definitivos.
- **Verificación** de cada hallazgo: *ejecutado* (reproducido con una prueba temporal de funciones puras, sin red ni
  gasto, ya borrada), *leído* (comprobado en el código por el implementador) o *sin verificar* (solo lo dice el revisor).
- **No ejecutado:** `revisor-logica`, `revisor-regresion`, YouTube real (riesgo alto, necesita aprobación), axe a 375 y
  1280 px (T123), SC-001, SC-003, SC-004. El contenido de las fuentes externas no se ha contrastado.

### Graves

| # | Dónde | Qué pasa | Por qué importa | Verificación |
|---|-------|----------|-----------------|--------------|
| G1 | `apps/server/src/main.ts:196`, `services/youtube.ts:48` | `hasKey` compara con `undefined`, pero `get` devuelve `null`: siempre es verdadero. Sin clave se elige la Data API, que da `no_disponible`, sin caer a yt-dlp | Una instalación real sin clave no mide ningún nicho. Es el camino gratis y por defecto (FR-030, principio III). Los tests inyectan `hasKey` y el e2e usa el YouTube falso | Leído |
| G2 | `packages/youtube/src/ytdlp/adapter.ts:70`, `parse.ts:12`, `market/measures.ts:116` | Las búsquedas con yt-dlp nunca traen fecha y no se completan con el RSS, como dice `youtube-data.md` | Sin clave, la medida de saturación nunca sale (FR-007, US1 AS2). El YouTube falso sí da fechas, así que el e2e ve una cifra que el creador real no verá | Leído |
| G3 | `market/measures.ts:63`, `:94`; `strings/channel.es.ts:85` | Solo se pregunta a los 20 canales con más visitas, y el resto se presenta como «no enseñan sus suscriptores», con sello de dato | Afirmación falsa marcada como dato (II, V). Los canales pequeños, que son lo que se mide, no se consultan. Con 20 grandes y 10 pequeños: `entryChannels` 0, ocultos 10 | Ejecutado |
| G4 | `routes/channel.ts:296`, `services/concepts.ts:29`, `services/profile.ts:37` | Las cifras de un concepto se calculan al generar o editar. Tras cambiar de nicho, elegir un concepto viejo guarda el nicho B con los euros de A. Cambiar ritmo o región tampoco recalcula | El perfil mezcla datos de dos nichos (V), y lo leerán las fases siguientes | Leído |
| G5 | `market/rpm.json:20`, `knowledge/src/market.ts:235`, `new/Concepts.tsx:64` | `confidence: "baja"` no se lee en ningún sitio, y el rango sale con sello de AIR aunque el factor del castellano no tiene fuente. La spec dice «unas 30 veces menos» para infantil; el fichero da 12-15 | La spec pide decir la confianza (línea 411). Es el otro factor de los euros, junto a P1 | Leído. Páginas de AIR sin contrastar |
| G6 | `services/ai-run.ts:180`, `anthropic/adapter.ts:103` | Una respuesta inválida se paga, pero vuelve sin `usage`: la fila queda con coste 0. Si falla y luego va bien, solo cuenta la segunda | El registro y los límites de gasto no ven ese gasto (III) | Leído |

### Medios

| # | Dónde | Qué pasa | Verificación |
|---|-------|----------|--------------|
| M1 | `new/Concepts.tsx:53` | El supuesto de visitas no se ve; el único sello cercano es el de AIR (P1) | Leído |
| M2 | `services/concepts.ts:38` | Los euros usan la región que dice la IA, no la que eligió el creador. Presencia y horas tampoco se contrastan | Leído |
| M3 | `channel/warnings.ts:38`, `made-for-kids.json:28` | Aviso infantil: «pequeños» y «bebé» no saltan; «Padres con niños» sí, y fuerza el RPM infantil | Ejecutado |
| M4 | `market/inauthentic.json` | Falta el aviso de temas delicados de la spec (línea 242), y «Recopilaciones» no salta | Ejecutado |
| M5 | `ytdlp/adapter.ts:47`, `services/name-check.ts:41` | Salida ilegible de yt-dlp cuenta como `sin_datos`, que da verde con la @ libre (P9) | Leído |
| M6 | `channel/claims.ts:111`, `services/concepts.ts:83` | Recortar una cifra puede vaciar un campo, y entonces puede fallar una petición ya pagada | Vaciado ejecutado; el error, leído en parte |
| M7 | `channel/claims.ts:10` | El validador deja pasar «2 millones de personas», «150 000 visitas», «medio millón de visitas» y «5.000 dólares» (SC-002) | Ejecutado |
| M8 | `services/channel-input.ts:33`, `new/Niches.tsx:298` | La opinión de la IA puede hablar de nichos de otra tanda | Sin verificar |
| M9 | `channel/Proposal.tsx:30`, `new/NicheCard.tsx:139` | Nichos y nombres no se pueden editar (FR-023), y las búsquedas no se ven | Búsquedas leídas; lo demás sin verificar |
| M10 | `new/Niches.tsx:267` | Solo Nichos tiene vuelta a la tanda anterior; en conceptos y nombres se pierde (P3) | Leído |
| M11 | `ytdlp/classify.ts:16`, `new/NicheCard.tsx:150` | Sin conexión dice que el lector no está listo y no ofrece reintentar (US1 AS3) | Clasificación leída; botón sin verificar |
| M12 | `market/ypp.json:29` | Nadie lee el cambio del programa de socios de 2027-02-01, que afecta a un canal que empieza hoy | Leído |
| M13 | `decisions.md` | Entradas 3, 7, 10 y 13 mal clasificadas como riesgo medio. **Corregido:** ahora son altas, con pendiente | Leído |
| M14 | `services/ai-run.ts:162`, `spending/budget.ts:14` | Una estimación «Incluido» puede acabar en llamada de pago si cambia la conexión, y se salta los límites | Leído |
| M15 | `services/ai-run.ts:110`, `routes/channel.ts:223` | El importe confirmado cubre una llamada, y puede haber hasta 4. Al regenerar no cuenta lo anterior | Leído. Importes del revisor sin recalcular |
| M16 | `services/youtube.ts:88` | El aviso de cupo de FR-030 solo llega al log | Leído |
| M17 | `services/ai-run.ts:110` | Nunca usa `count_tokens`, como piden `cost.md` y R12; solo la heurística | Leído |

### Menores

| # | Dónde | Qué pasa | Verificación |
|---|-------|----------|--------------|
| m1 | `data-api/adapter.ts:153` | El contador de cuota se suma después de la llamada y se puede pasar | Leído |
| m2 | `data-api/adapter.ts:148` | El `fetch` con la clave no fija `redirect`; podría seguir una redirección a otro dominio | Leído. Reenvío sin probar |
| m3 | `core/src/api/youtube.ts:22` | `names`, `label` y `queries` sin máximo en el servidor | Leído |
| m4 | `services/ai-run.ts:162` | Dos llamadas simultáneas pueden pasar juntas el límite | Sin verificar |
| m5 | `channel/Proposal.tsx:121`, `new/Questions.tsx:82` | «Volver a intentarlo» gasta sin mostrar importe, y en Preguntas reutiliza una estimación ya consumida | Leído |
| m6 | `youtube/handle.ts:42` | Una URL mal codificada lanza `URIError` | Ejecutado |
| m7 | `secrets/secret.ts:4` | Comentario desactualizado sobre `reveal()` | Leído |
| m8 | `new/NicheCard.tsx:143` | Nicho propio con sello «Opinión de la IA» | Sin verificar |
| m9 | `home/Home.tsx:13` | Inicio no ofrece «Ya tengo un canal» (FR-001); está una pantalla después | Sin verificar |
| m10 | `new/Interests.tsx:12` | Menos de 10 caracteres se bloquea, cuando la spec pide hacer preguntas | Sin verificar |
| m11 | `data-model.md`, `market.md` | Documentos con números distintos para lo mismo, y datos de conocimiento sin uso | Sin verificar |
| m12 | `strings/channel.es.ts:84` | Umbrales escritos en los textos | Leído |
| m13 | `services/niche-research.ts:74` | La medida guarda la hora del cálculo, no la del dato en caché (FR-008) | Sin verificar |
| m14 | `channel/useJourney.ts:41` | La estimación no se renueva tras 10 minutos | Leído |
| m15 | `new/Names.tsx:240` | Un nombre nuevo con la misma @ queda en «Comprobando…» | Sin verificar |

### Revisado sin hallazgos

- **yt-dlp:** `shell: false`, argumentos en lista, `--ignore-config`; sin inyección de opciones.
- **Secretos:** `reveal()` solo en los sitios permitidos; la clave solo en cabecera, nunca en URL, caché ni logs.
- **Escucha:** `127.0.0.1` fijo, y las rutas nuevas pasan por `guard`.
- **IA:** ninguna llamada de pago arranca sola.

Estas conclusiones son de lectura del revisor, sin verificar por separado.

### Cómo revertir y qué queda

Esta revisión no cambia código. Las decisiones del creador están en `decisions.md`, de P1 a P12. La corrección de los
hallazgos no se ha hecho ni tiene tarea todavía.
