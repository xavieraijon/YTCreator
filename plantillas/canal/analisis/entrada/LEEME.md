# Aquí van tus capturas de YouTube Studio (opcional)

Esta carpeta es la bandeja de entrada de la skill `analisis-canal-youtube` (modo nuestro canal). Arrastra aquí las capturas de tu
YouTube Studio y dile a Claude que ya están.

**Son opcionales.** El análisis funciona sin ellas: del enlace del canal ya salen los
títulos, las duraciones, las visitas, los me gusta, los comentarios, las etiquetas,
los capítulos, las descripciones, los hashtags, los Shorts y **las miniaturas**, que
Claude mira una por una.

## Qué añaden exactamente

Hay cuatro números que **no existen en ningún sitio público**: solo los ve el dueño
del canal desde su Studio.

| Dato privado | Qué contesta |
|---|---|
| **Impresiones** | ¿YouTube te está enseñando a la gente, sí o no? |
| **CTR** (porcentaje de clics) | De los que te ven en la portada, ¿cuántos hacen clic? |
| **Retención** (% y minutos) | ¿Se quedan o se van, y en qué segundo se van? |
| **Fuentes de tráfico** | ¿Te vienen de la portada, de sugeridos, de la búsqueda o de Shorts? |

Con esos cuatro, la fuga se localiza **con tus propios números** en lugar de con un
juicio sobre el mecanismo. La diferencia es enorme: sin ellos el informe dice "tus
miniaturas tienen este problema"; con ellos dice "te están enseñando a *tantas*
personas, hacen clic *tantos* de cada cien, y aquí está exactamente el agujero".
(Las cifras del ejemplo salen de tus capturas, no de ningún sitio: Claude no estima
ninguna.)

Y si no puedes darlas —porque el canal no es tuyo, por ejemplo— no pasa nada: esas
partes salen marcadas como **"sin datos"** en el informe. **Nunca se estiman.**

## Las cuatro capturas (un minuto)

Todo está en **studio.youtube.com** → *Estadísticas* (menú de la izquierda).

| # | Qué capturar | Dónde está | Nombre sugerido |
|---|---|---|---|
| 1 | **Resumen de los últimos 28 días**: visualizaciones, tiempo de visualización, impresiones, porcentaje de clics y duración media | Estadísticas → pestaña **Panorama general**. Baja hasta ver la caja de impresiones y clics | `1-resumen.png` |
| 2 | **Cómo encuentran los espectadores tus vídeos**: el reparto entre portada, vídeos sugeridos, búsqueda, Shorts y externos | Estadísticas → pestaña **Alcance** → "Fuentes de tráfico" | `2-trafico.png` |
| 3 | **La curva de retención de un vídeo**: elige uno normal, no el mejor. La gráfica completa con los primeros segundos a la vista | Contenido → clic en un vídeo → Estadísticas → pestaña **Interacción** | `3-retencion.png` |
| 4 | **Audiencia**: espectadores nuevos frente a recurrentes, y suscriptores frente a no suscriptores | Estadísticas → pestaña **Audiencia** | `4-audiencia.png` |

La **1 es la que más vale** con diferencia: es la que dice si el problema es que no te
reparten o que no te hacen clic. La **3** es la que confirma si el gancho funciona.

Los nombres son una sugerencia para tu orden; Claude las reconoce igual.

## Cómo se hace una captura

- **Windows**: tecla `Windows` + `Shift` + `S`, seleccionas la zona, y se copia; pega
  en Paint y guarda, o busca la imagen en `Imágenes/Capturas de pantalla`.
- **Mac**: `Cmd` + `Shift` + `4`, seleccionas la zona, y aparece en el escritorio.
- **Móvil**: la app de YouTube Studio tiene las mismas pantallas. Captura de pantalla
  normal y las pasas al ordenador (por ejemplo, mandándotelas a ti mismo).

Que se lea el texto: a pantalla completa, sin zoom y sin recortar los números.

## Privacidad

- **Nunca hacen falta contraseñas.** Claude no entra en tu cuenta de YouTube ni en tu
  Studio: solo mira las imágenes que tú dejas aquí.
- Si en una captura hay correos, teléfonos o datos de otras personas, Claude te avisa
  y **no los incorpora** al informe.
- **Las capturas no se meten dentro del informe HTML**: se citan ("captura de Studio,
  Resumen 28 días"). Así el informe se le puede enseñar a alguien sin repartir tus
  datos.
- Esta carpeta está excluida del control de versiones: las capturas se quedan en tu
  ordenador.
- Cuando termines un análisis puedes borrar lo que haya aquí. No hace falta guardarlo.
