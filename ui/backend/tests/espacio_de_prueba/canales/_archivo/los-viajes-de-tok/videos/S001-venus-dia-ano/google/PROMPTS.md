# Prueba Google AI Pro: S001 (Venus), 3 imágenes + 1 animación

Objetivo: comparar Nano Banana (app de Gemini) con klein en las 3 imágenes que más le costaron, y probar
una animación con Veo (Flow). Guarda cada resultado en ESTA carpeta (`videos/S001-venus-dia-ano/google/`)
con el nombre indicado. Si una imagen sale mal, pídele el arreglo en el mismo chat ("the arms must be
solid black", "remove the text"...) antes de descargarla.

Comprueba en la primera descarga si lleva **marca de agua visible** (una estrella o un logotipo en una
esquina) y dímelo.

---

## Parte 1: imágenes (app de Gemini, modelo de imágenes / Nano Banana)

Abre un **chat nuevo** solo para este vídeo.

### Mensaje 1 (preparación): adjunta `personaje/ref/tok_frente.png` y pega:

```
You are the illustrator of a children's science cartoon. The attached image is TOK, the main character.
Copy his design EXACTLY in every image I ask for:
- flat orange square head with two small round orange ears and two tiny bolts on the top corners
- two big round white eyes with black pupils (both eyes always visible, never a side profile)
- a thin wiggly antenna with a small glowing YELLOW light bulb on top
- a separate flat orange square body with a simple round clock on the chest: only two hands, NO numbers
- EXACTLY two arms and EXACTLY two legs, thin, SOLID BLACK and fully filled (never white, grey, hollow
  or outlined tubes); the arms end in white cartoon glove hands, the legs in white oval feet
- no mouth details beyond a simple line, no extra faces anywhere (not on the feet, not on objects)

Art style for every image: simple 2D cartoon frame from a modern preschool TV show, clean thick smooth
black outlines, rounded friendly shapes, bright cheerful flat colors, no shading or gradients, soft
colored background and colored ground (never plain white), lots of empty space.
Absolutely NO text, letters, numbers or logos anywhere in the image.
Format: vertical 9:16. Keep Tok large and centered, nothing important in the bottom third or touching
the right edge (the phone app buttons go there).

Reply only "OK" and wait for my scene descriptions.
```

### Mensaje 2 → guardar como `01-2.png` (Tok llama a la puerta)

```
Scene: at night on the planet Venus. Reddish-orange rocky ground with a few rounded rocks, a flat
horizon and a thick cloudy DARK PURPLE night sky (no sun, no moon). A lone closed purple wooden door
with a round yellow knob stands by itself on the ground, with no walls around it. Tok stands at the
right of the door in three-quarter view (both eyes visible), cheerful, knocking on the door with one
raised white glove fist; small motion lines next to the fist. His other arm hangs relaxed.
Vertical 9:16, Tok large and centered.
```

### Mensaje 3 → guardar como `02-2.png` (Tok preocupado mira su reloj)

```
Scene: close-up of Tok's upper body, front view, on a soft plain yellow background. Tok is VERY
worried: big downturned frowning mouth, worried eyebrow lines above both round eyes, a small drop of
sweat next to his head. He looks down at the clock on his chest; the clock has only two hands and no
numbers, and the hands are blurred with small spinning motion lines. Both glove hands visible at his
sides. Vertical 9:16, Tok large and centered.
```

### Mensaje 4 → guardar como `04-2.png` (Tok ve que el Sol sale a su espalda)

```
Scene: dawn on Venus. Reddish-orange rocky ground, a flat horizon and a thick cloudy yellowish sky.
Tok sits on a small blue folding camping stool without armrests, three-quarter view with both eyes
visible, totally SHOCKED: huge round eyes, wide open mouth, both glove hands on his cheeks. Behind
him, a big half yellow cartoon sun (no face) is rising from the horizon. Vertical 9:16, Tok large and
centered, plain reddish-orange ground filling the lower third.
```

---

## Parte 2: animación (Flow → Veo, "Frames to Video" / imagen de inicio)

Imagen de inicio: la `01-2.png` que acabas de hacer en Gemini (si no te convence, usa
`videos/S001-venus-dia-ano/img/01-2.png`, la de klein). Formato vertical 9:16, 8 s, el modelo más
barato que ofrezca (Veo Fast o Lite). Guarda el vídeo como `anim_01-2.mp4`.

```
Keep the exact art style, colors and character design of the starting image: flat 2D preschool
cartoon, thick black outlines, no shading. Static camera, no zoom, no pan. Tok, the orange square
robot, knocks on the lone purple door three times with his white glove fist, with a small bounce of
his body on each knock and the yellow bulb on his antenna wobbling. Then he steps back half a step
and looks at the camera with a happy expectant smile. His arms and legs stay thin and solid black,
exactly two arms and two legs. The door stays closed. The background stays completely still.
No text, no new characters, no camera movement.
```

(El sonido que genere Veo no se usará: en el montaje van nuestra voz, efectos y música.)
