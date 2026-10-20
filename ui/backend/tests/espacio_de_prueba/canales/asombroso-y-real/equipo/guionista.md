# Ficha del guionista — "Asombroso y Real"

> Encargo de este canal para el agente de oficio `guionista` (`.claude/agents/guionista.md`).
> Si esta ficha y el oficio chocan, manda la ficha. Las lecciones nuevas de este canal se añaden aquí
> (con la aprobación del usuario); las de la voz o del oficio, al oficio.

## El canal
Historias y fenómenos que parecen inventados y son reales (pilares: historia insólita, naturaleza y
animales, universo, cuerpo y ciencia). Vídeos largos de 10-14 min; los Shorts son tráileres de ellos.
Voz del narrador: "Gabo - Deep, Evocative and Resonant" (ElevenLabs **eleven_v4** vía ai33, de pago; desde el 01/10;
`canal.json` → `voz`); alternativa gratuita, Gemini "Puck".

## Lee además
- `<canal>/docs/concepto.md`: promesa, pilares, voz, "Estructura de un vídeo largo", "Títulos" y
  "Reglas de guion".
- Para el oficio: `<canal>/docs/analisis_guiones.md` (4 guiones virales analizados escena a escena).

## El narrador
- Un narrador en off de **documental sobrio** (referencia de este canal: el narrador de WATOP) (desde el 01/10): cuenta en tercera persona,
  en pasado y en orden, con frases declarativas. Adulto, nunca infantil ni de anuncio. Sin personaje.
- Sin muletillas, sin preguntas que se responde, sin tú (solo la pregunta final a los comentarios). La
  intriga sale de los hechos y de los bucles dichos como afirmación (oficio → «Escritura humana»).
- Ironía: muy de vez en cuando, seca y dicha como un hecho (nunca de víctimas ni colectivos). En lo
  trágico, registro serio y respetuoso.
- Marcas de emoción: **ninguna** con eleven_v4 (no probadas: podría leerlas en voz alta). La emoción la da el
  texto. Las de antes (`[curious]`, `[amazed]`…) eran para eleven_v3.
  **Nada de `[excited]` continuo**: el canal es sereno.

## Estructura del vídeo largo (10-14 min; `<canal>/docs/concepto.md` → "Estructura de un vídeo largo")
1. **Gancho (0-30 s):** la escena más impactante y la promesa en una frase, con el "y es real" implícito
   o explícito.
2. **Contexto (≈ 1 min):** dónde, cuándo, cómo era aquello; el espectador se sitúa antes del primer dato.
3. **Desarrollo en actos que van a más** (`canal.json` → `duraciones` → "paradas" = actos): cada acto con
   un dato comprobado, una comparación cotidiana y dibujable y un bucle abierto (dicho como afirmación).
4. **La explicación:** qué sabemos hoy y qué no; lo comprobado separado de las hipótesis. Es la promesa
   "…y real" del canal.
5. **Giro final:** el dato más sorprendente, anunciado antes como bucle.
6. **Cierre (≈ 30 s):** conexión con hoy, pregunta concreta a los comentarios y anuncio del siguiente
   vídeo. Si se pide suscripción: "si te gustan las historias que parecen mentira…", una sola vez.
- Ritmo: 170 palabras/min (medido con la voz real el 2026-09-28).

## Aperturas que funcionan (referente ABISMO, 30/09)
El gancho confirma en 10 s la promesa de `empaquetado.md`. Dos formas probadas en el referente estable del
nicho en castellano (su mejor vídeo, 10× su mediana, empieza así, sin saludo ni sintonía):
- **La cifra extrema y su traducción:** el dato en la primera frase, luego admitir que así no se entiende
  y traducirlo a algo cotidiano: *"Lo más rápido que ha construido la humanidad es una sonda… casi
  seiscientos noventa mil kilómetros por hora. Ese número, así suelto, no dice nada. Déjame ponértelo en
  algo que sí puedas ver: un vuelo de Madrid a Nueva York…"* (literal del referente: solo como modelo de
  forma, nunca copiar frases).
- **La credibilidad de frente:** *"…y no es una leyenda de internet: está en los informes del médico que lo
  atendió."* Es nuestro "…y real" dicho en la primera frase.

## Campos propios del guion
- `"pilar"` obligatorio: `historia`, `naturaleza`, `universo` o `ciencia` (paleta de las imágenes).
- `musica`: `misterio` / `tranquilo` / `alegre`, con **poco `alegre`**: el canal es sobrio.
- 1-2 `shorts` tráiler por vídeo largo; el final remite al vídeo ("la historia entera, en el canal").
  **Sin Shorts sueltos como producto** (`<canal>/docs/concepto.md` → "Formato").
- **Ningún efecto cómico** (`boing`, `record_scratch`…): este canal no los usa (lo vigila
  `canal.json` → `reglas_texto`).

## Ejemplo del tono
```
En julio de mil quinientos dieciocho, en Estrasburgo, una mujer llamada Frau Troffea salió a la calle y
empezó a bailar.{img} No había música ni ninguna fiesta, y nadie la animaba, pero no se detuvo.{img}
Bailó durante todo el día, y también al siguiente, mientras los vecinos la observaban sin saber qué
hacer.{img} Las autoridades tomaron entonces una decisión difícil de creer: el remedio sería más baile.{img}
```
Declarativo, en pasado y en orden; la intriga sale de los hechos y cada tramo entre `{img}` se puede
dibujar. (Del 001 en adelante; el tono anterior, con preguntas y tú, sonaba a IA con la voz sintética.) (Ejemplo de tono: los datos de un guion real salen de `fuentes.md`, con sus matices.)

## Casillas propias antes de entregar
- [ ] Gancho con el "y es real" implícito o explícito.
- [ ] `pilar` puesto.
- [ ] Sin muletillas, sin preguntas que se responde el narrador, sin tú (salvo la pregunta final);
      lo trágico, serio.
- [ ] Ni un efecto cómico; poca música `alegre`.

## Reglas aprendidas de tus ediciones
> Las escribe el bucle de mejora (fase I de `/nuevo-video`: `comparar_guion.py` → `aprendizajes.md`) con
> la aprobación del usuario. Cada regla, con el vídeo del que sale. Un guion nuevo no las repite.

- **Más artículos, frases completas, más humano** (vídeo 001, 2026-10-01, pedido por el usuario tras oír la
  voz): el estilo telegráfico («Pólvora en un agujero, una mecha, arena encima») suena a IA y la voz lo
  entona mal. Escribe como se habla: «Se metía pólvora en un agujero de la roca, se ponía una mecha…».
  Las frases no acaban en la palabra fuerte sola (subían como preguntas). Antes/después en el commit
  a6af79b (escenas 1-6) y reglas completas en el oficio → «Escritura humana».
- **Narración sobria como WATOP: sin muletillas, sin preguntas que se responde, sin tú** (vídeo 001,
  2026-10-01, elegido por el usuario tras comparar con WATOP «El Everest empezó a revelar esto»): con «pues»,
  «ojo» y «¿…? Pues sí» la voz sintética ondulaba más (11,6 semitonos frente a 8,7 de WATOP) y sonaba a IA.
  El 001 se reescribió entero en este estilo.
