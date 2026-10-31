# Guía de validación: Canal y nicho

**Feature**: `003-channel-and-niche` | **Fecha**: 2026-10-31

Cómo comprobar de punta a punta que la feature funciona. Los detalles están en el
[modelo de datos](./data-model.md) y en los [contratos](./contracts/).

## Requisitos

- La 002 instalada y con una IA conectada (o el proveedor `fake` para pruebas).
- Node 24 con `fnm`. Los comandos se lanzan con `fnm exec --using=24 --`.
- Para las pruebas sin red: `YTCREATOR_FAKE_YOUTUBE=1` y el proveedor de IA `fake`.

## 0. Verificación previa: spikes

Antes de escribir código de los adaptadores (primera tarea de implementación):

| Spike | Qué confirma | Si falla |
|---|---|---|
| S1 | Opciones y salida de yt-dlp para búsqueda, canal y listado; qué campos vienen vacíos | Ajustar el adaptador y los `null` del contrato |
| S2 | `@handle`: 404 si está libre, 200 si está ocupado | El semáforo de la @ queda solo en `sin_comprobar` y se avisa |
| S3 | Medir 5 nichos tarda menos de lo que pide la spec | Bajar la muestra o las búsquedas por nicho en `thresholds.json` |
| S4 | Unidades de la Data API por recorrido completo | Cambiar el reparto entre Data API y yt-dlp |
| S5 | `count_tokens` con suscripción | Resuelto: no aplica, coste 0 € |

Los resultados se anotan en [research.md](./research.md) («Resultados»).

## 1. Comprobaciones automáticas

```bash
fnm exec --using=24 -- pnpm lint
fnm exec --using=24 -- pnpm typecheck
fnm exec --using=24 -- pnpm test
fnm exec --using=24 -- pnpm test:installer
fnm exec --using=24 -- pnpm test:e2e
```

Todo en verde. `pnpm test:real-youtube` es opcional y queda fuera de CI.

## 2. Canal nuevo de punta a punta

1. Arrancar con `fnm exec --using=24 -- pnpm dev` y pulsar «Crear mi canal».
2. Escribir intereses, contestar o saltar las preguntas.
3. Ver 3–5 nichos medidos, cada cifra con «Dato de YouTube · fecha» y el veredicto con su razón.
4. Elegir uno, revisar los 2–4 canales de referencia, contestar el ritmo.
5. Ver 2–3 conceptos con monetización en rangos y fuentes; elegir uno.
6. Ver 6–8 nombres con semáforo; elegir uno verde.
7. Llegar al perfil y exportarlo en Markdown y en JSON: las mismas secciones y «Fuentes» al final.

Esperado: cada botón de IA mostró el importe antes de pulsarlo; Ajustes → Consumo lista las llamadas.

## 3. Canal existente

1. «Ya tengo un canal», pegar la @ de un canal de prueba (con `fake`: uno con 30 vídeos).
2. Confirmar el canal, esperar la lectura.
3. Ver el perfil actual: cada «lo que funciona» cita vídeos concretos.
4. Aprobar la propuesta de posicionamiento: el perfil tiene la misma forma que el de un canal nuevo.

## 4. Casos difíciles

| Caso | Cómo provocarlo | Esperado |
|---|---|---|
| Nicho sin datos | Nicho `sin_datos` del `fake` | Tarjeta sin cifras ni veredicto, explicación llana |
| YouTube bloquea | Nicho `bloqueado` del `fake` | «Volver a intentarlo»; el resto de nichos sí se miden |
| Sin lector | Borrar `<datos>/bin/yt-dlp` | Aviso con enlace a Ajustes → YouTube; «Actualizar el lector» lo arregla |
| Nombre en rojo | Una @ ocupada del `fake` | Rojo con razón; no se ofrece como recomendado |
| Nombre aplazado | «Decidir más tarde» | Perfil guardado con nombre provisional |
| Menos de 5 vídeos | Canal de 3 vídeos del `fake` | Ofrece el recorrido de canal nuevo conservando nombre y @ |
| Cerrar a mitad | Cerrar la pestaña midiendo nichos | Al volver, «Seguir donde lo dejaste» y lo ya medido |
| Límite de gasto | Límite por operación de 1 céntimo con API | Botón desactivado y enlace a Ajustes → Límites |
| Cifra inventada | Respuesta grabada del `fake` | Frase quitada y aviso de que se recortó |
| Versiones | Editar el perfil dos veces y restaurar la 1 | Versión 4 `restaurada`; la 2 y la 3 siguen ahí |

## 5. Seguridad de la clave de YouTube

1. Guardar una clave de prueba en Ajustes → YouTube.
2. Buscar esa clave en la base de datos, los logs, la carpeta de trabajo, Git y las respuestas HTTP: no aparece.
   Solo se ve el `hint` de 4 caracteres.
3. Borrar la clave: todo sigue funcionando con yt-dlp.

## 6. Auditoría de novato

El agente `usuario-novato` recorre los dos recorridos con `fake` y anota lo que no entiende. Se cierra cuando no
quedan bloqueos ni términos sin explicar.
