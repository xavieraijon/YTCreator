# Validación: 003 canal y nicho

## Revisión retroactiva de las fases 2 a 5 (2026-11-04)

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
