---
name: puerta-a
description: Cierra una fase o historia de YTCreator con la Puerta A: autocomprobación, revisión independiente, controles, corrección e informe de evidencia. Se invoca desde la tarea [A] de tasks.md.
---

Argumento: la fase o historia (ej. `US4`). Se trabaja sobre el diff aún sin commit. Riesgo y regla anti-asunción:
`.specify/memory/riesgo.md`.

## Ciclo

1. **Implementar y autocomprobar.** Pruebas antes del código. `fnm exec --using=24 -- pnpm lint`, `typecheck`, `test`;
   con interfaz, `test:e2e`; si toca el instalador, `test:installer`. Si cambió un prompt, borra
   `node_modules/.vitest-cache` antes de `test`, porque esa caché no ve cambios en imports `?raw`. Ejecuta el flujo real
   de la historia con los proveedores falsos y guarda el resultado.
2. **Revisar.** Escribe el diff en el scratchpad (`git add -N .` para incluir ficheros nuevos, y `git diff HEAD`) y lanza
   en paralelo `revisor-fidelidad`, `revisor-logica`, `revisor-seguridad-y-coste` y `revisor-regresion`. Dales solo
   rutas: diff, `spec.md`, `plan.md`, `contracts/`, `decisions.md` y constitución. Nunca tu razonamiento.
3. **Verificar los hallazgos antes de creerlos.** Contrasta cada uno con el código, quita duplicados y ordena por
   gravedad. Un descarte lleva justificación escrita. Un hallazgo sin respaldo no es un fallo.
4. **Controles obligatorios**, todos a la vez:
   - `lint`, `typecheck`, `test`, `test:e2e` y `test:installer` donde aplique;
   - el test de glosario y los de fuga de secretos (`secrets-leak`);
   - axe en claro y oscuro a 375 y 1280 px, teclado y `prefers-reduced-motion`;
   - tipos de fallo de IA (`sin_sesion`, `cupo_agotado`, `tiempo_agotado`, `contenido_filtrado`, `no_disponible`);
   - la comprobación de «Cómo se demuestra» de la historia.

   Lee el código de salida real de cada comando, no el de un filtro. Un control que falla impide cerrar. Uno que no se
   ejecutó se escribe como no ejecutado, con el motivo.
5. **Corregir.** Los hallazgos confirmados se corrigen o se descartan con justificación. Máximo 3 vueltas; si no
   converge, para y avisa al creador.
6. **Decidir según riesgo.** Riesgo alto: para y pregunta, y sigue con lo independiente. Registra las decisiones en
   `specs/NNN/decisions.md` (se crea desde `.specify/templates/overrides/decisions-template.md`).
7. **Cerrar.** Solo después de leer todos los resultados: escribe el informe, marca la tarea `[A]` y haz el commit.

## Informe

Al final de la sección de la fase en `checklists/validation.md`:

1. Resumen en tres líneas.
2. Requisitos, uno a uno, en tabla: requisito → cumplido / parcial / no cumplido → evidencia → fecha.
3. Cómo se comprobó: comandos y resultado real.
4. Controles obligatorios: pasados, fallidos y no ejecutados (con el motivo).
5. Hallazgos de revisión: confirmados y corregidos, descartados con justificación, abiertos.
6. Desviaciones respecto a la spec: lo hecho de más o de menos.
7. Decisiones: las del agente (bajo y medio) y las pendientes del creador (alto).
8. Impacto en la constitución: qué principios se tocaron y cómo se respetan.
9. Cómo revertir y qué queda pendiente.

## Resultado

- **Pasada:** cinco campos cubiertos, controles sin fallos, sin hallazgos graves abiertos, informe escrito y sin
  pendientes de riesgo alto que afecten a esta fase.
- **Bloqueada:** falta una decisión de riesgo alto, la spec choca con la constitución o con un contrato previo, un
  control falla tras 3 vueltas, o haría falta gastar o llamar a algo real sin aprobación. Se documenta y se pasa a otra
  tarea; no se resuelve inventando.

## Tras integrar

Cuando el creador pida el PR: confirma que el CI completo pasa en la versión integrada, anota cómo revertir y, si cambió
el empaquetado, comprueba que `release.yml` sigue verificando que el proveedor falso no entra en producción.
