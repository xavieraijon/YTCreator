# Contrato: medidas de mercado

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R6

Cálculo puro en `packages/core/src/market/`: recibe lo que devuelve el puerto [`YouTubeData`](./youtube-data.md) y
`thresholds.json`, y devuelve una `MarketMeasure` ([data-model](../data-model.md#market_measure)). No llama a la IA:
las cifras salen de aquí y la IA solo las comenta (principio II).

## Reglas generales

- Entrada: 1–3 búsquedas por nicho (las propone la IA con el nicho, el creador las ve), `ytsearch40` cada una,
  resultados unidos sin vídeos repetidos.
- **Formatos sin mezclar (FR-007b):** un vídeo es Short si `durationSeconds ≤ SHORT_MAX_SECONDS` (180 s) y largo si
  dura más. Todos los indicadores y el veredicto se calculan **solo con los vídeos largos**, porque son el formato
  principal del concepto y las visitas de un Short no son comparables. Los vídeos sin duración no se clasifican y
  quedan fuera. La duración es la única señal en una búsqueda, así que un vídeo largo de menos de 3 minutos cuenta como
  Short: se acepta ese error.
- Si quedan menos de 10 vídeos largos con visitas, la medida es `fallida` con `sin_datos`: no se muestra ninguna cifra
  ni veredicto (FR-009), aunque haya muchos Shorts.
- Las suscripciones de cada canal se piden aparte con `getChannel`: como mucho 20 canales distintos por nicho, los 4 con
  más visitas y el resto repartidos por igual en ese orden, para que entren canales pequeños. Los que quedan fuera, o fallan, cuentan en
  `unread_channels`, aparte de los que ocultan la cifra (`hidden_subscribers`).
- Si se conoce la cifra de menos de la mitad de los canales preguntados (`minKnownChannelsShare`), la medida es `fallida`: no hay
  veredicto. El fallo es `sin_datos`, salvo que los canales que fallaron sean más que los que ocultan la cifra: entonces es
  el fallo más repetido. Quien oculta la cifra no cuenta como conocido, y justo la mitad sí vale.
- La medida guarda la fuente que respondió, que puede no ser la prevista al empezar.
- Todos los umbrales vienen de `packages/knowledge/market/thresholds.json` y su `version` se guarda en la medida.

## Indicadores

| Indicador | Cálculo | Niveles (umbrales por defecto) |
|---|---|---|
| Demanda | Mediana de visitas de la muestra | `alta` ≥ 50.000; `media` ≥ 5.000; si no, `baja` |
| Puerta de entrada | Canales < 200.000 suscriptores, de los leídos, con algún vídeo de la muestra cuyas visitas ≥ suscriptores | `abierta` ≥ 3; `entreabierta` ≥ 1; `cerrada` 0 |
| Concentración | Parte de las visitas de la muestra que se llevan los 3 canales con más visitas | `alta` ≥ 0,70; `media` ≥ 0,40; si no, `baja` |
| Saturación | Vídeos de la muestra publicados en los últimos 90 días y su parte de los que tienen fecha. Sin clave, solo hay fecha de los 15 vídeos más nuevos de cada canal: la pantalla lo dice y la IA no recibe la cifra | Se muestra la cifra; sin nivel |
| Contexto | Canales < 10.000 suscriptores en la muestra | Se guarda la cifra; hoy no se muestra |
| Shorts aparte | Shorts de la búsqueda; mediana de sus visitas si hay al menos `minVideos` | Se muestran como cifras; sin nivel y fuera del veredicto |

Canales con suscriptores ocultos no cuentan en la puerta de entrada y se indica cuántos se dejaron fuera.

## Veredicto

Regla fija y explicable, en este orden:

1. `no_conviene` si demanda `baja` **o** puerta `cerrada`.
2. `conviene` si demanda `alta` o `media`, puerta `abierta` y concentración distinta de `alta`.
3. `con_reservas` en cualquier otro caso.

La pantalla muestra el veredicto con la razón (qué indicador lo decide) usando el componente `Semaphore`: verde
`conviene`, ámbar `con_reservas`, rojo `no_conviene`, con texto e icono, nunca solo color.

## Canales de referencia

Del nicho elegido se proponen de 2 a 4 canales (FR-012): primero los que cuentan para la puerta de entrada, luego
por visitas del mejor vídeo. El creador puede quitar o añadir (pegando una @, que se resuelve con el puerto). Si fallan
canales y quedan menos de 2, no se guarda nada y se dice el fallo más repetido; con 2 o más, se
guardan (P19).

De cada canal de referencia se piden sus `ownChannel.referenceVideos` (30) vídeos más recientes para calcular lo normal
en ese canal (abajo). Si esa petición falla, el canal se queda como referencia con esas cifras a `null`.

## Comparación con lo normal del propio canal

Dice si un vídeo funcionó bien **para ese canal**, que es distinto de la puerta de entrada (visitas frente a
suscriptores). Función pura en `packages/core/src/market/own-baseline.ts`, sobre `VideoInfo[]` de más nuevo a más viejo,
así que no necesita fechas y vale con yt-dlp.

- **Lo normal de un vídeo:** mediana de las visitas de los `ownChannel.baselineVideos` (10) vídeos anteriores **del mismo
  formato**. Con menos de `ownChannel.minBaseline` (3) anteriores con visitas, o con mediana 0, no hay comparación: `null`.
- **Veces lo normal:** visitas del vídeo ÷ esa mediana. Se usa la mediana porque un solo viral desfigura la media.
- **Destacado:** `≥ ownChannel.notableRatio` (3) veces lo normal.
- **Sin corrección por edad:** un vídeo reciente aún no ha acumulado visitas y sale por debajo de lo que acabará
  teniendo. Por eso los vídeos de menos de `ownChannel.youngDays` (30) días nunca cuentan como «peores». Un vídeo sin
  fecha se trata como antiguo, porque el RSS da fecha a los 15 más recientes. No se usa una curva de maduración: no
  tenemos fuente para esos porcentajes (principio V).
- **Fuera del veredicto:** calcularlo en la medida exigiría pedir los vídeos de hasta 20 canales por nicho. Solo se usa
  en los canales de referencia y en la lectura de un canal existente.
- En pantalla se llama «veces lo normal en su canal», nunca «multiplicador» ni «outlier», y se etiqueta como dato de
  YouTube con su fecha, porque se calcula solo con cifras públicas.

## Pruebas

Tabla de casos con muestras sintéticas que cubren cada nivel, cada rama del veredicto, suscriptores ocultos, menos de
10 vídeos largos (también con muchos Shorts), Shorts que no alteran ningún indicador, vídeos sin duración y empates en
el top 3. Para la comparación: menos de 3 anteriores, mediana 0, un viral entre los anteriores, formatos sin mezclar y
vídeos recientes fuera de «peores».

## Ingresos de un concepto

Regla del dominio en `packages/core/src/channel/monetization.ts`, con `monetization` de `thresholds.json`:

- Visitas al mes = vídeos largos por semana × `weeksPerMonth` (4,33) × mediana de visitas del nicho × `viewsShareOfMedian`
  (de 0,05 a 0,5: un canal que empieza consigue una parte de lo típico). Es un supuesto visible, no una medida, y un
  criterio propio de esta feature.
- Euros al mes = visitas × lo que se gana por cada 1.000 visitas (`rpm.json`, según categoría y región) / 1.000.
- Contenido hecho para niños usa la categoría `infantil`.
- Sin medida del nicho o sin vídeos largos no hay cifra: los Shorts pagan demasiado poco para esta cuenta y el aviso
  `solo_shorts` lo explica.

## Contexto de canal joven

No se calcula: el puerto de YouTube no da la fecha de creación del canal. La medida guarda `small_channels`,
`hidden_subscribers` y `unread_channels`.
