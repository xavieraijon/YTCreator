# Validación: 003 canal y nicho

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
