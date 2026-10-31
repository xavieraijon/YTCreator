# Contrato: paquetes de conocimiento

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R11

El saber de YouTube vive en `packages/knowledge/market/*.json`, versionado en Git y validado con Zod al arrancar
(principio V). Ningún umbral ni cifra de YouTube se escribe en código.

## Reglas generales

- Cada fichero tiene `version` (entero), `reviewedAt` (fecha ISO), `source` (`{label, url}`, una o varias) y `data`.
- Si un fichero no pasa el esquema, el servidor no arranca y lo dice en el registro (es un error de la app, no del
  creador).
- Si `reviewedAt` tiene más de 180 días, la pantalla que lo usa muestra «Esta información se revisó por última vez el
  …» y Ajustes lo lista (FR-027).
- Cuando una pantalla usa un dato de aquí, lo cita con `DataSource` (`label` y fecha).

## Ficheros

| Fichero | `data` | Lo usa |
|---|---|---|
| `ypp.json` | Requisitos del Programa de socios: suscriptores, horas de visualización, visitas de Shorts y su ventana | Monetización del concepto |
| `rpm.json` | Rangos de RPM en euros por categoría y por región (`espana`, `latam`, `mixto`) | Monetización del concepto |
| `made-for-kids.json` | Señales de contenido hecho para niños y lo que implica (sin anuncios personalizados, sin comentarios) | Aviso `infantil` (FR-015) |
| `inauthentic.json` | Qué considera YouTube contenido repetitivo o no auténtico, con ejemplos | Aviso `no_autentico` |
| `shorts.json` | Papel de los Shorts como escaparate y sus límites para monetizar | Formato y aviso `solo_shorts` |
| `thresholds.json` | Umbrales de [market](./market.md) y del semáforo de nombres | Medidas y nombres |
| `pricing.json` | Precio por millón de tokens de entrada y salida por modelo, en dólares, y tipo de cambio a euros con su fecha | Estimación de coste ([cost](./cost.md)) |

## Pruebas

Esquema de cada fichero; aviso de caducidad con fechas simuladas; un fichero roto impide arrancar.
