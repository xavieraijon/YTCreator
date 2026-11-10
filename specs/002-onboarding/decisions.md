# Decisiones: 002 onboarding

Riesgo según `.specify/memory/riesgo.md`. Lo de riesgo alto no se decide aquí: va a «Pendientes del creador».

## Registro

| # | Fecha | Quién decidió | Decisión | Motivo | Alternativas | Riesgo | Tarea |
|---|-------|---------------|----------|--------|--------------|--------|-------|
| 1 | 2026-11-10 | Creador | El pago por uso (API de Anthropic) pasa a ser una opción secundaria: no se quita, pero en la elección del asistente y en los ajustes va tras «Más opciones» (en ajustes, mientras no haya una clave guardada), y la bienvenida la nombra sin enlace. La suscripción es el camino normal | «Todo el mundo tendrá una suscripción». La prueba real de la 005 (T087) vio que la investigación por la API pasa de su límite de tiempo | Quitar la API; dejarla como estaba | Alto | FR-013, FR-018 |

## Pendientes del creador

| # | Qué falta | Opciones | Recomendación | Impacto | Tarea pausada |
|---|-----------|----------|---------------|---------|---------------|
| P1 | Si el creador pulsa «Lo haré más tarde» en la bienvenida y luego conecta la IA desde Ajustes, la entrada (`/`) le sigue llevando a «Aún no has conectado una IA» mientras la cabecera dice «Funciona». Encontrado en la auditoría de novato de la 004 (ronda 1, n.º 1) y trasladado aquí por el creador el 2026-11-09 | Que `/conectar-ia` mire si ya hay una IA activa y, si la hay, cierre la bienvenida; o dejarlo | Corregirlo en una tarea de la 002 tras la v1 | Confunde, no bloquea: el logo lleva a la app | Ninguna |
