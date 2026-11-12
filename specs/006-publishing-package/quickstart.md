# Quickstart: comprobar el paquete de publicación

Todo se hace con la IA y YouTube falsos y la carpeta `.dev-home`. Nunca se tocan `~/YTCreator`, `~/ytc-prueba` ni el
puerto 4310. Los tests nunca llaman a una IA real ni a YouTube: esta feature no hace llamadas a YouTube en ningún caso.

## Requisitos

- Node 24 (`fnm exec --using=24 --`) y las dependencias instaladas.
- Un canal con perfil aprobado y un guion aprobado: el e2e lo prepara con los recorridos de la 003 a la 005.

## 1. Controles

```bash
fnm exec --using=24 -- pnpm lint
```

```bash
fnm exec --using=24 -- pnpm typecheck
```

```bash
fnm exec --using=24 -- pnpm test
```

```bash
fnm exec --using=24 -- pnpm test:e2e
```

## 2. Recorridos

| # | Historia | Qué hacer | Qué debe pasar |
|---|---|---|---|
| 1 | US1 | Desde un guion aprobado, «Preparar la publicación», proponer títulos, elegir principal y dos alternativos, proponer miniaturas, editar una, aprobar y recargar | Coste antes de cada petición; cada título con su motivo, su bloque y sus caracteres; aprobado tras recargar |
| 2 | US1 | Abrir publicaciones en un canal sin guiones aprobados | Explica qué falta y lleva a los guiones |
| 3 | US2 | Proponer descripción con un guion con hechos enlazados | Capítulos desde 0:00 con «estimado»; fuentes solo de la lista de hechos; parte fija al final |
| 4 | US2 | Pedir de nuevo solo las etiquetas tras editar la descripción | La descripción, carácter a carácter, igual |
| 5 | US2 | Cambiar la parte fija en los ajustes | Los paquetes aprobados no cambian; sale «Usar la nueva» |
| 6 | US3 | Revisar un paquete grabado con un título de 110 caracteres y un capítulo de 5 s, copiar cada pieza, marcar la lista guiada, aprobar con avisos y descargar | Dos avisos enlazados; «Copiado»; se pregunta y se deja aprobar; `.md`, `.json` y las indicaciones de miniatura legibles |
| 7 | US3 | Editar una pieza de un paquete aprobado | Avisa y vuelve a borrador; la cola deja de decir «Lista para publicar» |
| 8 | US4 | Publicación de un Short sacado de un vídeo largo | Sin capítulos ni miniaturas; portada sugerida; menciona el vídeo largo |
| 9 | US5 | Volver a una versión antigua de la descripción | Una versión más y ninguna menos |
| 10 | Casos | Reabrir el guion tras empezar el paquete | Aviso; no se puede aprobar el paquete hasta aprobar el guion |

## 3. Garantías del dominio

Los tests unitarios deben probar con casos grabados que:

- los capítulos empiezan en 0:00, van en orden y ninguno queda por debajo del mínimo tras `proposeChapters` (SC-003);
- una salida de la IA con una dirección web no valida, y el apartado de fuentes solo contiene enlaces de la lista de
  hechos que abrían (SC-004);
- pedir de nuevo una parte no crea versiones de las demás (SC-005);
- la revisión de un paquete de 30 capítulos tarda menos de 1 s (SC-007).

## 4. Lo que no se comprueba aquí

Quedan como **no ejecutados** hasta que el creador apruebe una prueba con IA real:

- la calidad real de los títulos, las miniaturas y las descripciones;
- SC-001 (paquete en menos de 15 minutos) y SC-002 (títulos que no se cortan en el móvil), que dependen de la IA real.
