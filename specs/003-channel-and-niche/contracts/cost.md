# Contrato: estimación, confirmación y consumo

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R12–R13

Ninguna llamada a la IA que cueste dinero sale sin que el creador haya visto antes cuánto costará (principio III).

## Reglas generales

- Cada botón que llama a la IA pide primero `POST /api/journeys/:id/estimate` con el uso y muestra el importe en el
  propio botón: «Proponer nichos · unos 0,04 €». Pulsar el botón **es** la confirmación; la petición de generar lleva
  el `estimateId` recibido.
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

Respuesta: `{estimateId, use, cents, included: boolean, blockedBy: null | 'por_operacion' | 'diario' | 'mensual',
pricingVersion}`.

## Presupuesto (`budget.ts`)

Antes de cada llamada, con los límites de `spending_limits` de la 002:

| Límite | Comprobación |
|---|---|
| `per_operation_cents` | `cents` de la estimación ≤ límite |
| `daily_cents` | suma de `cost_cents` de `ai_usage` de hoy (hora local) + `cents` ≤ límite |
| `monthly_cents` | lo mismo con el mes en curso |

Si no hay límites aceptados (`accepted_at` nulo) se aplica el guard `sin_limites` de la 002.

## Consumo

Tras cada llamada se escribe `ai_usage` con los tokens reales y `cost_cents` calculado con los mismos precios (0 con
suscripción). Ajustes → Consumo lista las llamadas (fecha, uso, importe) y los totales del día y del mes. Si el coste
real supera la estimación en más de un 50 %, se registra un aviso en el log (sin datos del creador) para revisar topes.

## Pruebas

Estimación con precios fijos; redondeo hacia arriba; suscripción a 0; cada límite bloqueando; comprobación repetida
en el servidor.
