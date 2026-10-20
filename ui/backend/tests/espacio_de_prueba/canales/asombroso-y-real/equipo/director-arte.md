# Ficha del director de arte — "Asombroso y Real"

> Encargo de este canal para el agente de oficio `director-arte` (`.claude/agents/director-arte.md`).
> Si esta ficha y el oficio chocan, manda la ficha. Las lecciones nuevas de este canal se añaden aquí
> (con la aprobación del usuario); las del modelo o del método, al oficio.

## Lee además
- `<canal>/docs/concepto.md` → "Estilo visual" y "Títulos, series y miniaturas".
- Muestras aprobadas: `<canal>/videos/_pruebas/estilo_b/3_editorial.png` (el estilo) y
  `<canal>/videos/_pruebas/estilo_b/mini_A_playfair.jpg` (la miniatura).

## Identidad visual (decidida el 2026-09-27)
- **Ilustración editorial** con textura de papel, pinceladas visibles, claroscuro, paleta limitada y
  personas con proporciones realistas, con FLUX.2 klein 4B.
- **No hay personaje fijo** (el robot Tok del canal antiguo ya no existe: nunca `{tok}` ni poses). Los
  personajes de cada historia se definen por vídeo en `"personajes"` del guion.
- Sin aspecto de foto ni de dibujos infantiles.

## Cómo se aplica el estilo
- `canal.json` → `estilo`: `editorial illustration with visible paper grain texture, painted in a
  {paleta}: {escena}, dramatic chiaroscuro lighting, …`.
- **Paleta por pilar**: la pone montar.py según el `"pilar"` del guion (`historia`, `naturaleza`,
  `universo`, `ciencia`; `canal.json` → `paletas`). Hoja de las cuatro, probadas el 2026-09-27:
  `<canal>/videos/_pruebas/paletas/hoja_paletas.jpg` (ciencia reforzada después en canal.json).

## Brief visual: campos propios
- En la cabecera, además de época y lugar: `Pilar: <historia | naturaleza | universo | ciencia>`.
- **Anacronismos: el fallo más probable del canal** (casi todo son historias situadas en una época).
  La lista de "prohibidos" del brief es obligatoria y se usa al revisar cada imagen.

## Lecciones de este canal
- **Pilar ciencia + heridas**: el rojo de la paleta de ciencia llena de sangre las escenas de heridas
  (venda, camisa, mesa; prueba v2/v3 de Phineas Gage). En escenas con heridas: encuadre sin herida
  visible (de espaldas, el objeto solo, el antes o el después). Si un vídeo de ciencia tiene heridas en el
  centro, valora una `"paleta"` propia sin rojos para todo el vídeo.
- Historias médicas (heridas, operaciones): riesgo del filtro de Cloudflare → sugerir, o `--motor local`.
- Pruebas del método: `<canal>/videos/_pruebas/paletas/` (v1), `v2` y `v3` (hojas
  `v2/hoja_antes_despues.jpg` y `v3/hoja_v1_v2_v3.jpg`). Con el método desaparecieron los anacronismos
  (batas, sombreros, prismáticos, móvil), la venda salió en un solo ojo con el perfil y la barra fue
  donde se pedía.

## Ejemplo aprobado: antes / después (Phineas Gage, 1848, pilar ciencia)
- Antes (falló: bata blanca, sombreros de los años 40, venda en los dos ojos, un móvil): `a young railway
  worker in 1848 with a white cloth bandage covering only his left eye, holding a long straight smooth
  iron rod, two 19th-century country doctors in long black frock coats and waistcoats examining him in a
  wooden cabin, no white lab coats, no modern hats, medium shot`
- Después: `medium shot at eye level, a 25-year-old railway foreman seen in left profile, sitting upright
  on a wooden chair, wearing a collarless linen shirt with rolled sleeves and brown wool trousers, a
  folded white cloth bandage wrapped over his left eye and forehead, both hands resting on his knees, one
  older country doctor in a long black wool frock coat and dark waistcoat standing beside him, leaning in
  to look at the bandage, a smooth one-metre iron rod lying across a plank table in the foreground, rough
  pine board walls of a small boarding-house room in Vermont, lit by a single oil lamp on the table, dusk
  light through a small window behind them, dust in the air`
- Ojo con el "después": aun siendo el aprobado, "collarless" salió con cuello (klein ignora lo que "no
  tiene"; ver el oficio). Al reutilizarlo, nombra la prenda que sí se ve ("a plain linen shirt with a
  simple band neckline").

## Miniaturas
Imagen editorial muy contrastada; el texto lo pone `miniatura.py` en Playfair Display. **Canal sobrio**:
sin caras de sorpresa exageradas tipo "reacción de YouTuber".
- **Un solo objeto protagonista** y fondo limpio, siempre con el mismo sistema (referente ABISMO, 30/09: sus
  dos miniaturas que rompieron el sistema, con flecha roja o texto gigante, son las de sus vídeos más flojos).
- Si el vídeo gira en torno a una cifra o una escala, la miniatura es una **metáfora visual de esa cifra**
  (su mejor vídeo: una sonda avanzando por una carretera hecha de hojas de calendario = "un año luz"), no la
  escena literal. Sigue el concepto de `empaquetado.md` (qué muestra y qué oculta).
- Formato catálogo (`<canal>/docs/concepto.md` → "Formato"): cuadrícula de 6-12 ilustraciones pequeñas,
  cada una rotulada, sobre papel.
- Nunca imitar una grabación real, un informativo ni un "directo": el canal es ilustración editorial.

## Revisión: casillas de estilo de este canal
- Textura de papel visible y claroscuro.
- Paleta del pilar del vídeo (no colores naturales de foto).
- Ni aspecto de foto ni de dibujos infantiles.
- Tragedia sugerida, nunca mostrada.
