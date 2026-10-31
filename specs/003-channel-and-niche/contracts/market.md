# Contrato: medidas de mercado

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R6

Cálculo puro en `packages/core/src/market/`: recibe lo que devuelve el puerto [`YouTubeData`](./youtube-data.md) y
`thresholds.json`, y devuelve una `MarketMeasure` ([data-model](../data-model.md#market_measure)). No llama a la IA:
las cifras salen de aquí y la IA solo las comenta (principio II).

## Reglas generales

- Entrada: 1–3 búsquedas por nicho (las propone la IA con el nicho, el creador las ve), `ytsearch40` cada una,
  resultados unidos sin vídeos repetidos.
- Si quedan menos de 10 vídeos con visitas, la medida es `fallida` con `sin_datos`: no se muestra ninguna cifra ni
  veredicto (FR-009).
- Las suscripciones de cada canal se piden aparte con `getChannel` (como mucho 20 canales distintos por nicho).
- Todos los umbrales vienen de `packages/knowledge/market/thresholds.json` y su `version` se guarda en la medida.

## Indicadores

| Indicador | Cálculo | Niveles (umbrales por defecto) |
|---|---|---|
| Demanda | Mediana de visitas de la muestra | `alta` ≥ 50.000; `media` ≥ 5.000; si no, `baja` |
| Puerta de entrada | Canales < 200.000 suscriptores con algún vídeo de la muestra cuyas visitas ≥ suscriptores | `abierta` ≥ 3; `entreabierta` ≥ 1; `cerrada` 0 |
| Concentración | Parte de las visitas de la muestra que se llevan los 3 canales con más visitas | `alta` ≥ 0,70; `media` ≥ 0,40; si no, `baja` |
| Saturación | Vídeos de la muestra publicados en los últimos 90 días y su parte del total | Se muestra la cifra; sin nivel |
| Contexto | Canales < 10.000 suscriptores en la muestra; canales de menos de 24 meses con algún vídeo ≥ 10.000 visitas | Se muestran como cifras |

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
por visitas del mejor vídeo. El creador puede quitar o añadir (pegando una @, que se resuelve con el puerto).

## Pruebas

Tabla de casos con muestras sintéticas que cubren cada nivel, cada rama del veredicto, suscriptores ocultos, menos de
10 vídeos y empates en el top 3.
