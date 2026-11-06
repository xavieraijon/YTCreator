# Contrato: estimación, confirmación y consumo

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R12–R13

Ninguna llamada a la IA que cueste dinero sale sin que el creador haya visto antes cuánto costará (principio III).

## Reglas generales

- Cada botón que llama a la IA pide primero `POST /api/journeys/:id/estimate` con el uso y muestra el importe en el
  propio botón: «Proponer nichos · unos 0,04 €». Pulsar el botón **es** la confirmación; la petición de generar lleva
  el `estimateId` recibido.
- Una petición puede acabar en hasta cuatro llamadas (una salida inválida se repite siempre, principio IV; unas
  cifras sin fuente se piden otra vez si hay presupuesto). Si el máximo es mayor que una llamada, el botón lo dice:
  «unos 0,04 €, como mucho 0,16 € si la IA tiene que repetir» (decisión 148).
- Con suscripción de Claude Code el importe es 0 y el botón dice «Incluido en tu suscripción».
- Si la estimación supera algún límite, el botón queda desactivado y la pantalla dice cuál y enlaza a Ajustes →
  Límites. El servidor vuelve a comprobarlo al generar (`limite_de_gasto`), por si cambió algo entre medias.
- Las operaciones de YouTube no cuestan dinero y no muestran importe.

## Estimación

```text
tokens_entrada = count_tokens(prompt + input)      // o caracteres / 3,5 si no se puede contar
tokens_salida  = tope de salida del uso
coste_usd      = (tokens_entrada × precio_entrada + tokens_salida × precio_salida) / 1.000.000
céntimos       = ceil(coste_usd × tipo_de_cambio × 100)
```

Precios y tipo de cambio de `pricing.json` ([knowledge](./knowledge.md)). La estimación caduca a los 10 minutos.

Con «Proponer otra», la estimación cuenta la propuesta que se rehace (`proposalId`). Las indicaciones del creador no se
conocen al estimar: al generar se vuelve a calcular con lo que de verdad se envía y se usa el mayor de los dos.

Respuesta: `{estimateId, use, cents, included: boolean, blockedBy: null | 'por_operacion' | 'diario' | 'mensual',
maxCents, pricingVersion}`. `maxCents` es lo más que puede costar: `max(2 × c, min(4 × c, límite por operación))`, con `c` el coste de
una llamada dejando sitio para unas indicaciones de 500 caracteres; 0 con suscripción. Todo se apoya en la estimación
de cada llamada (caracteres / 3,5 y el tope de salida del uso), que no es exacta.

## Presupuesto (`budget.ts`)

Con los límites de `spending_limits` de la 002. La repetición de una salida inválida (principio IV) está reservada:
nada empieza si no caben dos llamadas (decisión 152).

| Límite | Comprobación |
|---|---|
| `per_operation_cents` | `2 × cents` ≤ límite |
| `daily_cents` | suma de `cost_cents` de `ai_usage` de hoy (hora local) + `2 × cents` ≤ límite |
| `monthly_cents` | lo mismo con el mes en curso |

`cents` es el mayor entre lo estimado y lo que de verdad se envía. Antes de pedir otra vez unas cifras sin fuente se
comprueba lo gastado en la operación + `2 × cents`; si no cabe, no se pide y las cifras se recortan. Así lo gastado
no pasa del límite por operación.

Si no hay límites aceptados (`accepted_at` nulo) se aplica el guard `sin_limites` de la 002.

## Consumo

Tras cada llamada se escribe `ai_usage` con los tokens reales y `cost_cents` calculado con los mismos precios (0 con
suscripción). Ajustes → Consumo lista las llamadas (fecha, uso, importe) y los totales del día y del mes. Si el coste
real supera la estimación en más de un 50 %, se registra un aviso en el log (sin datos del creador) para revisar topes.

## Pruebas

Estimación con precios fijos; redondeo hacia arriba; suscripción a 0; cada límite bloqueando; comprobación repetida
en el servidor.
