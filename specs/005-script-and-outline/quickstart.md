# Quickstart: comprobar el guion y la escaleta

Todo se hace con la IA y YouTube falsos y la carpeta `.dev-home`. Nunca se tocan `~/YTCreator`, `~/ytc-prueba` ni el
puerto 4310. Los tests nunca buscan en internet ni llaman a una IA real.

## Requisitos

- Node 24 (`fnm exec --using=24 --`) y las dependencias instaladas.
- Un canal con perfil aprobado y una idea elegida: el e2e lo prepara con los recorridos de la 003 y la 004.

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
| 1 | US1 | Abrir la primera idea, escribir apuntes, proponer escaleta, mover un bloque con el teclado, aprobar y recargar | Coste antes de generar; bloques con propósito y duración; aprobada tras recargar |
| 2 | US2 | Escribir el guion, editar una frase, pedir de nuevo un bloque | El resto de bloques idéntico; marcas «por comprobar»; duración recalculada |
| 3 | US2 | Cerrar la pestaña durante la generación y volver | El resultado aparece |
| 4 | US3 | Revisar un guion grabado con muletillas y gancho largo, aprobar con pendientes, editar y descargar | Avisos enlazados; se pregunta; vuelve a borrador; ficheros legibles |
| 5 | US4 | Abrir una idea Short | Sin escaleta; tres tramos; dentro del máximo |
| 6 | US5 | Volver a una versión antigua | Una versión más y ninguna menos |
| 7 | US6 | Investigar con enlaces falsos: dos que abren, uno roto | Etiquetas correctas; el roto señalado y sin contar |
| 8 | US6 | Escenario `sin_web` | La app lo explica y deja seguir |
| 9 | US6 | Comprobar pendientes y aceptar una propuesta | El guion cambia solo al aceptar |
| 10 | US7 | Sacar un Short de un guion aprobado y escribirlo | Idea enlazada en el banco; el guion abre sin escribir y pide confirmar el coste |

## 3. Comprobación de enlaces

Los tests deben rechazar las direcciones no públicas de R7, tanto escritas como IP como resueltas por DNS, una
redirección hacia cualquiera de ellas y un esquema distinto de `http` y `https`.

## 4. Lo que no se comprueba aquí

Quedan como **no ejecutados** hasta que el creador apruebe la prueba real (P1 de `decisions.md`):

- la búsqueda real por la API de Anthropic y por Claude Code;
- SC-002 (acierto de duración) y SC-011 (tiempo de investigación);
- la calidad real de los textos.
