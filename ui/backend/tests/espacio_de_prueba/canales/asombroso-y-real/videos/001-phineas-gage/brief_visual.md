# Brief visual: Phineas Gage no se volvió un monstruo: se fue a Chile (001)

> Canal: **Asombroso y Real** · Pilar: **ciencia** (con paleta propia del vídeo, ver abajo) · 10 min,
> ≈ 97 imágenes, sin Shorts · Brief del 2026-09-28 (director de arte), pendiente de aprobación.
> Base: `escaleta.md`, `guion.md` (borrador), `fuentes.md` + "Correcciones de la verificación" y
> `verificacion.md`. Los textos entre comillas están en inglés, listos para pegar en los prompts.

**Época:** 1848-1868 (el grueso), con saltos a 1878, 1994, 2001-2012 y 2022.
**Lugares:** Cavendish (Vermont) y Lebanon (New Hampshire) · Boston 1849-1850 · Woburn/Boston 1868 ·
Valparaíso y el camino a Santiago (Chile, 1852/54-1859) · valle de Santa Clara, San Francisco (1859-1860) ·
Museo Anatómico Warren (Harvard, hoy).

**Reglas del usuario para este vídeo (no negociables):** nada de heridas ni gore; la barra, en el aire, en
la mano o en la vitrina, nunca en la cabeza. Gage después del accidente, **siempre de perfil derecho**
(mirando hacia el borde derecho del cuadro, solo se ve el lado derecho de la cara) **o en sombra**. La foto
real no se usa: el "daguerrotipo" es un retrato pintado en el estilo del canal.

---

## Paleta del vídeo (decisión propuesta)

**Problema.** La paleta de ciencia (`muted brick red, deep turquoise and cream, with red and turquoise
dominating`) es roja por diseño, y en este vídeo lo central es un accidente en la cabeza: en la prueba v3
del 28/09 (`_pruebas/paletas/v3/ciencia_1.png`) el rojo acabó en un corte en la mejilla y en el antebrazo
aunque nadie los pidió. Con 97 imágenes, muchas de Gage, es un riesgo seguro (y además, sangre = anunciantes
y filtro de Cloudflare).

**Propuesta: una sola paleta propia para todo el vídeo, sin rojo.**

```
limited palette of deep turquoise, ochre and warm cream with charcoal black shadows, turquoise and ochre dominating the image
```

- Conserva la identidad del pilar ciencia (turquesa y crema) y cambia el rojo teja por **ocre**, que ya es el
  acento del canal (`colores.acento` #C8702A) y está probado sin problemas en la paleta de historia
  (`historia_1.png`, v3).
- Sirve para las dos mitades del vídeo sin subpaletas: **Vermont** = sombras turquesa y luz de lámpara o
  atardecer ocre; **Chile** = tierra y cerros ocres a pleno sol, cielo turquesa pálido. El cambio de época
  lo hace la **luz de cada escena**, no la paleta (ver "Tono visual").
- La coletilla final ("turquoise and ochre dominating the image") repite el refuerzo que funcionó en
  ciencia: sin ella la paleta se nota poco.
- Para lo que la voz quiere "marcar" (la trayectoria de la barra en el modelo 3D, las conexiones cortadas,
  el lóbulo frontal): **"glowing amber-gold"**, nunca rojo. Si hace falta rojo en un detalle (una bandera
  chilena lejana), se nombra ahí y es pequeño.

**Cómo se escribe en `guion.json`** (montar.py usa `guion["paleta"]` si existe y, si no, la del pilar):

```json
"pilar": "ciencia",
"paleta": "limited palette of deep turquoise, ochre and warm cream with charcoal black shadows, turquoise and ochre dominating the image",
```

El estilo del canal lo compone solo: `editorial illustration with visible paper grain texture, painted in a
{paleta}: {escena}, …` (la paleta queda delante de la escena, como pide la lección del 28/09).

**Alternativa descartada: subpaletas por época** (Vermont fría, Chile cálida). montar.py solo admite una
`"paleta"` por vídeo; hacerlo por imagen exige cambiar la herramienta (decisión del kit) y la mitad del
efecto ya se consigue con la luz. Si tras el boceto Chile sale demasiado fría, se refuerza en cada escena
("warm ochre midday sunlight, pale dusty sky") antes de tocar código.

**Prueba antes del lote:** 4 escenas × 2 variantes con `--boceto` (Mac, gratis): 01-3 (barra en el cielo),
05-2 (dormitorio con lámpara), 14-5 (diligencia en la cuesta) y 12-6 (la "ciudad-cerebro"). Si el ocre se
come el turquesa o sale sepia plano, se prueba `…deep turquoise dominating, ochre accents…`.

---

## Mundo

### Vermont y New Hampshire, 1848
- **La obra:** una trinchera abierta a pico y pólvora en una ladera de roca gris en capas: "a raw railway
  cutting blasted through grey layered rock on a wooded Vermont hillside, loose rubble and broken stone on
  the ground, a rough earth embankment, a few wooden planks and trestles". Sin vías todavía (preparaban el
  terreno) o, como mucho, "a short stretch of iron strap rails on wooden cross-ties" en la escena del tren.
- **La técnica, a mano:** un hombre sujeta el barreno y otro golpea con un mazo; pólvora de barril; mecha de
  cuerda; arena en un cubo. "one man kneeling and holding a long steel hand drill upright in the rock while
  a second man swings a heavy wooden-handled sledgehammer", "a small wooden powder keg with iron hoops",
  "a coil of dark tarred-cord fuse", "a wooden bucket of pale sand".
- **Paisaje y clima:** 13 de septiembre, final del verano: "green wooded hills of the Black River valley,
  the first yellow leaves on the maples, a low late-afternoon sun, dust in the air". Lebanon a finales de
  noviembre: "bare grey maples, frozen brown fields, dry stone walls, a thin first snow".
- **Transporte:** "a heavy two-wheeled wooden farm cart with plank sides pulled by a pair of brown oxen under
  a single wooden yoke", sobre "a rutted dirt road". El médico Williams llega en "a light two-wheeled
  one-horse gig with a black folding hood".
- **El pueblo (Cavendish):** "a small New England village of white clapboard houses with dark green
  shutters, a two-storey white clapboard inn with a long covered front porch and wooden posts, a dirt
  street, a white wooden church steeple in the distance".
- **Interiores 1848:** "a small upstairs room of a country inn, plain whitewashed plaster walls, wide pine
  floorboards, a narrow wooden bed with a patchwork quilt, a washstand with a white china basin and
  pitcher, a ladder-back chair". Casa de los padres: "a modest white clapboard farmhouse with a brick
  chimney, smoke rising".
- **Luz 1848:** velas, lámparas de aceite de ballena, chimenea y sol. **Nada de lámparas de queroseno con
  tubo de cristal** (llegan hacia 1855-1860; la prueba v3 pintó una): "a single tallow candle in a tin
  candlestick" o "a small brass whale-oil lamp with a bare open flame".

### Boston 1849-1850 (Bigelow, la máscara)
- "a bright hospital room of 1849 Boston with tall arched multi-pane windows, pale plaster walls, a plain
  wooden examination chair, a wooden cabinet of glass jars". Opción con más época: el anfiteatro del
  Massachusetts General Hospital ("a small domed operating amphitheatre with steep curved wooden benches and
  a round skylight"). Luz: día de invierno por las ventanas.

### 1868 (Harlow publica) y 1878 (Ferrier)
- Harlow 1868: "a doctor's study in a Massachusetts town, walls of leather-bound books, a green baize desk,
  a brass kerosene lamp with a glass chimney" (en 1868 ya vale el queroseno). Imprenta: "an 1860s print
  shop with an iron hand press, wooden type cases, sheets of paper hanging to dry on cords".
- Ferrier 1878 (Londres): "a steep lecture theatre with tiered curved wooden benches full of men in dark
  frock coats, gas lamps on the walls, a large painted chart of a brain divided into coloured zones without
  labels on an easel". Gas sí (1878), luz eléctrica no.

### Nueva York, hacia 1850 (el rumor de Barnum)
- "the five-storey facade of Barnum's American Museum on Broadway around 1850, large painted picture
  banners hanging between the windows showing strange animals, flags on the roof, a crowd in top hats and
  bonnets on the street, horse-drawn omnibuses", envuelto en bruma ("hazy, like a half-remembered rumour").
  Las pancartas, con dibujos, nunca con letras.

### Chile, 1852/54-1859
- **Valparaíso:** "the wide bay of Valparaíso in the 1850s, a crowd of three-masted sailing ships and one
  paddle steamer at anchor, a long wooden pier, low whitewashed adobe houses with red-brown clay-tile roofs
  scattered up steep dry hills, church towers, dirt lanes". **No** las casas de colores ni los ascensores
  (son posteriores: chapa pintada a finales del XIX, ascensores desde 1883).
- **El camino a Santiago** (Casablanca, cuesta de Zapata, Curacaví, cuesta de Lo Prado): "a winding dirt
  road climbing the dry coastal hills of central Chile, golden dry grass, scattered low thorny espino shrubs,
  golden dry grass and a few small evergreen trees with dense rounded dark green crowns (quillay, litre),
  dust hanging in the air". Sin cactus: klein pinta saguaros de Arizona (prueba del 28/09). Los Andes **solo lejos**: "the snowy Andes as a faint
  pale line far away on the horizon". Nunca "Andean road/pass/mountains" en primer plano (no los cruzaba).
- **Posta y patio de diligencias:** "a coaching inn yard with thick whitewashed adobe walls and a clay-tile
  roof on wooden posts, a stone water trough, lanterns hanging from hooks, harness on wooden pegs".
- **Santiago:** "a sunny square of 1850s Santiago with low whitewashed adobe buildings with tiled roofs and
  wooden balconies, a stone fountain, a baroque church facade, the snowy Andes behind the rooftops".
- **El ferrocarril en obras (1852-1863), por Quillota, en OTRO valle:** "far away across a different valley,
  a green irrigated valley with rows of tall poplars and orchards, a thin line of new rails and small
  figures of workers with picks and wheelbarrows". Siempre separado del camino de la diligencia por cerros.
- **Inauguración 1863:** "an 1860s steam locomotive with a tall funnel-shaped smokestack, a cowcatcher and
  big spoked driving wheels, decorated with strings of small cloth pennants and garlands, arriving at a
  station with a wooden platform roof, a crowd in dark coats and ponchos".
- **Luz de Chile:** sol duro y seco, madrugadas frías con farolillos, polvo dorado a contraluz.

### San Francisco / valle de Santa Clara, 1859-1860
- "a small wooden plank farmhouse with a porch among rolling dry golden hills and scattered dark oak trees,
  a split-rail fence, a plough and a horse". Muerte en mayo: "the hills turning from green to gold, dusk".

### Hoy (1994, 2001-2012, 2022, museo)
- 1994: "a 1990s study desk with a boxy beige computer and a bulky CRT monitor showing a grey 3D brain
  model, a thick stack of typed pages". **Sin persona** (Damasio es real y vive).
- 2001-2012: "a dim modern imaging room, a large white ring-shaped CT scanner", "researchers seen from
  behind in the blue glow of flat monitors showing grey cross-section scans of a skull", "a cardboard
  archive box with old CD cases".
- 2007 (Wilgus): "a flat LCD monitor on a wooden desk in a cosy living room full of framed antique
  photographs"; en la pantalla, "an old sepia portrait", nunca la web de Flickr ni logos.
- 2022: "a modern researcher seen from behind at a large table covered with printed scientific papers, a
  laptop, a desk lamp, night".
- **Museo Warren:** "a museum room with dark wood floors and a single tall glass display case lit from
  above, deep shadows around it". Dentro: la barra "placed diagonally across the case", "a pale plaster life
  mask of a young man's face with closed eyes" y el cráneo "an old ivory-coloured skull seen from the front
  at a distance, half in shadow". Nunca el cráneo desde arriba ni de cerca (el agujero de salida).

---

## Objetos

### Permitidos (clave de la historia), con su forma literal

- **La barra (`{barra}`)**: 1,09 m, 3,2 cm de grosor, ≈ 6 kg, hierro liso, afilada en un extremo a lo largo
  de unos 30 cm. Texto propuesto (sustituye al del borrador, que decía "a little over one metre"):
  > "a single perfectly straight smooth dark iron bar of even thickness along its whole length, round in
  > section and as thick as a thick broom handle, slightly longer than a walking cane, one end cut straight
  > across at full thickness like the end of a broom handle, the other end gradually narrowing over the last
  > quarter of its length to a sharp point"
  > (Prueba del 28/09: "one end blunt and flat" pintó una cabeza de clavo y una barra doblada; "standing on
  > end" la clavó de pie en la roca.)
  - Escala siempre con una persona o una mano. Cuando la lleva Gage: "carried over his right shoulder,
    his right hand gripping it", o "held upright beside him like a walking cane, his right hand on the top".
  - El peso no se dibuja: se sugiere con las manos ("gripped with both hands", "resting on his shoulder").
  - Nada de "spear", "harpoon", "javelin", "needle", "rod like a pencil": se convierten en esos objetos.
  - klein a veces pinta dos barras: una sola por imagen, lejos de otros objetos alargados (en el bodegón
    03-7, el bastón y la escoba bien separados, uno a cada lado).
  - La inscripción (17-6): "a faint row of small scratched marks along the iron", nunca "letters" ni
    "inscription".
- **Pólvora, mecha, arena, barreno, mazo** (ver Vermont). La pólvora, siempre en barril, **nunca cartuchos**.
- **Carreta de bueyes, calesa (gig) del médico, diligencia.**
- **La diligencia (Chile), DESCRIPCIÓN FIJA desde el 01/10 = `{diligencia3}`** (la misma en todos los prompts
  nuevos de la diligencia; `{diligencia}` y `{diligencia2}` se quedan solo porque las usan la miniatura y
  02-4, ya aprobadas, y cambiarlas las haría rehacer):
  > "a dark brown wooden Concord stagecoach with an oval passenger body that has straight upper sides and a
  > deeply curved rounded bottom, hung on two thick leather straps between the axles, a door with a small
  > window in the middle of its side and a small square window on each side of the door, a low iron rail on
  > the flat roof with leather trunks tied on top, a leather-covered luggage boot at the back, a high
  > driver's seat at the front and four large wooden spoked wheels, the rear wheels bigger than the front
  > ones, pulled by exactly six horses harnessed in three pairs, all six facing forward in the direction of
  > travel: two wheel horses just in front of the coach, two swing horses in front of them and two lead
  > horses at the very front"
  - Modelo visual: la de 02-4 (caja oscura con fondo curvo, baúles en la baca, maletero de cuero detrás).
    Revisión del 01/10: con descripciones vagas salió como "una casa" o un vagón de tablas (15-6, 18-4) y
    con caballos a los lados o detrás de la caja (15-3, 16-2, 18-4).
  - **Encuadres que funcionan para el tiro de seis** (en planos a la altura de los ojos y de perfil puro, el
    caballo del lado lejano de cada pareja queda tapado y salen 4; klein y ai33): (a) **de perfil y un poco
    desde arriba** ("seen from the side and a little from above… the six horses stretched out in a straight
    line ahead of the coach along the road, both horses of every pair visible"); (b) **desde el pescante**,
    las tres parejas de espaldas (grupas y colas hacia la cámara); (c) **desde atrás, alto y algo de lado**
    para que el tiro asome por delante de la caja. Toda imagen con los seis caballos a la vista va con
    `"motor": "ai33"`. Un solo camino en el cuadro (el carro de bueyes al fondo de 14-5 rompió la perspectiva).
  - Descripción anterior (`{diligencia2}`, ya no se usa en prompts nuevos): "a heavy wooden stagecoach with a
  rounded egg-shaped body hung on thick leather straps, large wooden spoked wheels, trunks tied on the
  roof, a high driver's box at the front",
  **tirada por seis caballos**: "a short compact team of six horses in three rows, two horses side by side
  in each row, the three rows close together in front of the coach" (con "one pair behind the other"
  salieron 8 en fila india, y "under a canvas" la volvió carreta de lona; prueba del 28/09). El número se cumple mejor en planos laterales o generales (cabezas separadas); en
  planos cerrados, que las riendas sean el foco, no los caballos.
- **Riendas de seis caballos (14-6, 14-7, miniatura):** "a thick fan of six leather reins threaded between
  the fingers of his gloved hands" (los guantes esconden los dedos: menos manos rotas).
- **Daguerrotipo:** "a small hinged daguerreotype case of dark embossed leather lined with red-brown velvet,
  open, a small silvery portrait inside" (el terciopelo, marrón rojizo pequeño: aceptable).
- **Máscara de yeso:** "a pale plaster life mask of a young man's face, eyes closed, calm".
- **Documentos de época:** "old handwritten pages in brown ink, folded letters, a quill pen and an inkwell"
  (letra ilegible: "lines of faint scribbled handwriting").
- **Cuaderno de Harlow:** "a small leather-bound notebook with blank cream pages".

### Prohibidos (anacronismos y errores probables de klein en esta historia)
No se escriben en el prompt (klein añade lo que se nombra): se evitan **nombrando lo correcto** (columna
derecha) y se comprueban al revisar cada imagen.

| Lo que klein puede colar | Por qué | Se evita nombrando |
|---|---|---|
| Cartuchos rojos de dinamita, detonador con émbolo, cables | Dinamita = 1867; en 1848, pólvora negra y mecha | "small wooden powder keg with iron hoops", "coil of dark tarred-cord fuse" |
| Martillo neumático, taladro mecánico, excavadora | Todo era a mano | "steel hand drill", "sledgehammer", "picks and shovels", "wheelbarrow" |
| Casco de obra, gorra de béisbol, sombrero fedora de los años 40 | Obreros de 1848 | "battered low-crowned brown felt hats with soft wide brims" |
| Vaqueros con remaches, cremalleras, camisetas | Posteriores | "brown wool trousers held up by braces", "linen shirt" |
| Batas blancas antes de ~1900 | La bata llega con el siglo XX | "long black wool frock coat, dark waistcoat" (salvo 09-4, donde se piden a propósito al fondo) |
| Lámpara de queroseno con tubo de cristal en 1848-1850 | Queroseno ≈ 1855+ | "tallow candle in a tin candlestick", "brass whale-oil lamp with a bare open flame" |
| Bombillas, farolas eléctricas antes de 1880 | Luz eléctrica ≈ 1880 | "candle", "oil lamp", "gas lamp" (desde 1850 en ciudades) |
| Relojes de pulsera, gafas modernas | Posteriores | "a pocket watch on a chain", "small oval wire spectacles" |
| Postes de telégrafo en la obra y en el camino chileno | Innecesarios y confunden | paisaje limpio: "only the dirt road and the dry hills" |
| Traviesas de hormigón, raíles modernos, locomotora de 1900 con cabina cerrada y faro | Época | "an 1840s steam locomotive with a tall funnel-shaped smokestack, an open wooden cab and a cowcatcher" |
| Sombrero de vaquero (Stetson) en el cochero; iconografía del Far West | Stetson = 1865; esto es Chile | "a low-crowned round black felt hat with a flat wide brim" |
| Los Andes nevados en primer plano, desfiladeros alpinos | El camino cruza los cerros de la costa | "dry coastal hills", "the snowy Andes as a faint pale line far away on the horizon" |
| Casas de colores y ascensores en Valparaíso | Finales del XIX | "low whitewashed adobe houses with clay-tile roofs" |
| Vías del tren junto al camino de la diligencia | El tren iba por Quillota, otro valle | "far away across a different valley" |
| Coches, asfalto, farolas, cables | Siglo XX | "rutted dirt road", "cobbled square" |
| Logotipos, letras, cifras, rótulos | Deforma texto | los datos, en `rotulo`; carteles y pancartas "without letters" solo si no hay otra salida |
| Venda o parche en los dos ojos, ojo cerrado duplicado | Asimetría duplicada | perfil derecho, lado izquierdo fuera de cuadro o en sombra |
| Bigote en Gage (el daguerrotipo le muestra afeitado) | klein ignora "clean-shaven" | se nombra lo que se ve: "a smooth shaven face and jaw"; se acepta si sale |
| Sangre, herida, barra dentro de la cabeza, cráneo con agujero en primer plano | Regla del canal y filtro | la barra en el aire, en la mano o en la vitrina; el cráneo lejos y de frente |
| Cara reconocible de Damasio, Macmillan o los Wilgus | Personas reales | de espaldas, lejos o genéricos (sin buscar parecido) |

---

## Vestuario por grupo (prenda a prenda, en inglés)

- **Cuadrilla de voladuras, 1848** (muchos, irlandeses): "loose off-white linen shirts with sleeves rolled
  to the elbow, brown and grey wool trousers held up by braces, battered low-crowned brown felt hats with
  soft wide brims, heavy brown leather work boots". Números bajos: "two men", "three men, one on the left,
  one in the centre, one on the right"; la cuadrilla completa, siempre de lejos o en silueta.
- **Médicos rurales, 1848** (Harlow, Williams): "long black wool frock coat, black waistcoat, white shirt
  with a high stiff collar, black silk cravat". Williams, además, "a tall black top hat" (Harlow, cabeza
  descubierta: así se distinguen).
- **Cirujano de Boston, 1849** (Bigelow): "a dark grey wool frock coat buttoned high, a white shirt with a
  high collar and a black neck stock", unos 31 años, delgado, pelo oscuro peinado hacia atrás.
- **Aldeanos de Nueva Inglaterra, 1848-1850:** hombres, "dark wool coats and waistcoats, low felt hats";
  mujeres, "long plain wool dresses in dark colours with white collars, white linen caps or bonnets,
  shawls".
- **Sabios del XIX** (1868-1878): "long black frock coats, dark waistcoats, white shirts with high collars,
  black bow ties or cravats, full beards or side-whiskers"; Ferrier (1878, 35 años): "a full dark beard".
- **Sabios del XX** (solo en 09-4): "white lab coats over shirts and ties", siempre detrás de los de levita.
- **Pasajeros de diligencia en Chile, 1850s:** hombres, "dark frock coats and top hats, or linen jackets and
  straw hats"; mujeres, "long wide skirts, shawls and bonnets".
- **Chilenos del campo (huasos) y mozos de posta:** "short striped woollen ponchos, flat-brimmed round
  felt or straw hats, white shirts, dark trousers, long leather leggings, large iron spurs".
- **Obreros del ferrocarril chileno, 1850s:** "white shirts, dark trousers, wide straw hats, some with short
  ponchos", siempre pequeños y lejos.
- **Público de Barnum, 1850:** "men in top hats and dark frock coats, women in bonnets and wide skirts".
- **Granja de California, 1859:** "a faded blue cotton work shirt, brown canvas trousers, braces, a wide
  straw hat".
- **Hoy:** investigadores con "dark jumpers, shirts, lanyards", casi siempre de espaldas o a contraluz de
  las pantallas.

---

## Personajes fijos (van a `"personajes"` del guion; una frase cada uno)

Cambios respecto al borrador del guion: `{gage_despues}` ya **no** nombra el ojo cerrado (klein lo
duplicaría) ni lleva "no visible wound" (negación); en su lugar, el encuadre que lo resuelve. Se añaden la
versión cochero, Harlow mayor y los secundarios con nombre. Nada de "clean-shaven" (klein lo ignora): se
nombra lo que se ve.

- `{gage}` (1848, antes del accidente):
  "Phineas Gage, a 25-year-old railway foreman of 1848, medium height and sturdy, square jaw, smooth shaven
  face, thick dark wavy hair, wearing an off-white linen shirt with sleeves rolled to the elbow, an open
  dark brown wool waistcoat, brown wool trousers with braces, heavy brown leather boots and a low-crowned
  brown felt hat"
- `{gage_despues}` (1849-1851, Nueva Inglaterra; y el retrato tipo daguerrotipo):
  "Phineas Gage in his late twenties, sturdy, square jaw, smooth shaven face, thick dark wavy hair combed
  back, seen in right profile facing the right edge of the frame with the left side of his face turned away
  into shadow, wearing a white shirt with a high collar, a black silk neck stock, a dark patterned
  waistcoat and a dark wool frock coat"
- `{gage_cochero}` (Chile, 1852/54-1859):
  "Phineas Gage in his early thirties, sturdy, square jaw, smooth shaven sunburnt face, dark wavy hair under
  a low-crowned round black felt hat with a flat wide brim, seen in right profile facing the right edge of
  the frame, wearing a long dark brown wool coachman's coat with a short shoulder cape, a cream linen shirt,
  a knotted dark neckerchief, brown leather gloves and dusty tall boots"
- `{harlow}` (1848):
  "Dr. John Martyn Harlow, a 29-year-old country doctor, slim, dark hair parted at the side, dark
  side-whiskers along his jaw, bare-headed, wearing a long black wool frock coat, a black waistcoat, a white
  shirt with a high stiff collar and a black silk cravat"
- `{harlow_mayor}` (1866-1868):
  "Dr. John Martyn Harlow at about fifty, greying hair parted at the side, full grey side-whiskers along his
  jaw, small oval wire spectacles, wearing a long black wool frock coat, a black waistcoat, a white shirt
  with a high stiff collar and a black bow tie"
- `{williams2}` (1848, primer médico; **aspecto fijo desde el 01/10**, el de 04-5):
  "a stout country doctor of about fifty in 1848 with a round face, grey hair, thick grey mutton-chop
  side-whiskers running down his cheeks to the corners of his jaw, his chin and upper lip bare, wearing a
  tall black top hat, a long black wool frock coat, a black waistcoat, a white shirt with a high collar and
  a black cravat"
  (con "grey side-whiskers" a secas, klein le puso barba entera en 04-3 y un bigote grande en 04-4; ai33
  acertó en 04-5. `{williams}` sigue en el guion solo para no rehacer 04-4 y 04-5.)
- `{trevitt}` (hacia 1860, testimonio):
  "Henry Trevitt, a slim American man in his early twenties, light brown hair parted at the side, a short
  trimmed beard along the jaw, wearing a brown wool sack coat, a buttoned waistcoat, a white shirt with a
  turned-down collar and a narrow black bow tie"
  (su oyente, el profesor J. W. Hamilton: "an older professor of about sixty with white hair and a white
  chin beard, black frock coat, holding a pen over a notebook"; sin clave propia si solo sale una vez).
- `{wilgus}` (2007-2009; personas reales, sin buscar parecido, preferible de tres cuartos o de espaldas):
  "an American couple in their sixties in a cosy living room, the man with short grey hair and a trimmed
  grey beard wearing a plaid flannel shirt, the woman with shoulder-length silver hair and reading glasses
  wearing a knitted cardigan"
- `{barra}`: ver "Objetos" (texto propuesto arriba).

**Coherencia:** mismo pelo y mandíbula en las tres versiones de Gage; Harlow joven y mayor con las mismas
patillas (más grises). Revisar en la hoja que Gage no cambie de cara entre capítulos.

---

## Tono visual (el arco de la luz)

El vídeo va **de la sombra al cielo abierto**, igual que la historia va del mito a los documentos:
- **El accidente y la convalecencia (1848):** planos cerrados y bajos, polvo y humo, atardecer ocre
  contra sombras turquesa; interiores de vela con mucha oscuridad alrededor. La tragedia, fuera de cuadro:
  la barra en el cielo, siluetas de espaldas, la cama en sombra.
- **El mito (1868-2022):** oscuro e inquietante, casi de grabado: siluetas, sombras alargadas, papeles bajo
  una sola lámpara, bruma ("like a half-remembered rumour"). Es el único tramo "turbio" a propósito.
- **La ciencia de hoy:** limpio y esquemático sobre fondo crema o turquesa oscuro, con el ámbar como
  marca; el cerebro como ciudad y como red de cables, nunca anatómico.
- **Chile:** planos generales, horizonte ancho, sol seco, polvo dorado, madrugadas con farolillos; la
  diligencia pequeña en el paisaje. Gage de perfil derecho, erguido, a contraluz cálida: dignidad, sin
  heroísmo exagerado.
- **Final (San Francisco, museo):** vuelve la calma: luz baja de atardecer, la vitrina sola con un foco.

Planos: alternar general (dónde estamos), medio (acción), detalle (barra, riendas, papeles) y reacción
(caras de secundarios; la de Gage, solo de perfil derecho).

---

## Avisos para la fase de prompts (sobre el borrador de `guion.md`)
No son prompts nuevos: son los puntos del borrador que ya sé que hay que cambiar.
- **Negaciones y "sin texto" en la escena** (01-2 "no wound", 02-2 y 07-2 "without text", 06-4 "no face
  details", 12-1 "no anatomical detail", 12-3 "no blood", 14-3 "no lettering"): fuera; se nombra lo que sí
  se ve (el estilo ya lleva "no gore, no text").
- **14-3, el mapa:** los mapas atraen letras. Mejor "a painted bird's-eye view of the land from the coast to
  the Santiago valley, a thin winding pale road across the hills".
- **Rojo en la ciencia** (12-3, 12-4, 12-6, 13-1): "glowing amber-gold line/patch" en vez de "red".
- **14-1 Valparaíso:** quitar "colourful houses" (anacrónico).
- **04-3/04-4:** el médico llega en su calesa y Gage espera sentado en el porche (corrección M1).
- **07-3 y 07-4:** la barra con Gage, según el texto de `{barra}` (sobre el hombro derecho, o de pie como
  bastón en la mano derecha).
- **11-6/18-2, el retrato:** tres cuartos o perfil desde su derecha, el lado izquierdo en sombra; "holding
  the bar upright beside him like a walking cane, his right hand on its top".
- **03-7:** bastón, escoba y barra, uno a cada lado y separados; la garrafa, "a large clear plastic water
  bottle with a small handle moulded at its neck", con su altura comparada ("only about a third as tall as
  the cane") y los cuatro enteros de suelo a punta (01/10: la jarra salió casi tan alta como los palos).
- **04-2 (pista de tenis) y 12-7 (cables en casa):** comparaciones que klein puede liar; hacerlas en plano
  cenital sencillo o probarlas primero en el boceto. 04-2, rehecha el 01/10: las líneas de pista pintadas
  sobre la roca no se entendían; ahora es una pista de tenis de verdad vista a lo largo, un obrero de 1848 en
  un fondo y la barra en el otro (la comparación dibujada, no superpuesta).
- **09-3 Ferrier y 09-4:** multitudes de lejos; primeros planos, como mucho de dos personas.
- **Cloudflare:** 01-2, 01-3, 02-1, 05-1, 05-2 y 12-3 son las más propensas al filtro ("output has been
  flagged"); si saltan, `--motor local`.

## Miniaturas (tono sobrio, lado derecho vacío)
- Las tres del guion encajan con este brief. La 1 y la 2, con `{gage_cochero}` a la izquierda **mirando
  hacia la derecha** (perfil derecho), las seis cabezas de caballo separadas y el lado derecho con cielo
  liso ("empty pale sky on the right for text"); la 2, en "cuesta de la costa", no "andina".
- La 3 (retrato), con Gage a la izquierda de tres cuartos desde su derecha y fondo oscuro liso a la
  derecha.
