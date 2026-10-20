# Banco de ideas: "Asombroso y Real"

> Promesa: historias y fenómenos que **parecen inventados y son reales**. Pilares: 🏺 historia insólita ·
> 🐙 naturaleza y animales · 🌌 universo y espacio · 🧠 cuerpo y ciencia (`<canal>/docs/concepto.md`).
> Reparto inicial: 1 de cada 2 vídeos de historia insólita.
> Estado: `pendiente`, `en curso` o `usada (NNN)`.
> Hueco: semáforo de saturación (`herramientas/saturacion.py`, regla del hueco en `<canal>/docs/concepto.md`):
> 🟢 hueco · 🟡 competido (solo con ángulo propio) · 🔴 quemado (no producir tal cual: buscar el dato de
> al lado) · ⚪ frío. Volver a medir antes de producir si la medición tiene más de 1 mes.

## Lecciones de la medición del 2026-09-27
- **Las historias insólitas "famosas" están quemadas en castellano**: la epidemia de baile de 1518, el
  superviviente de las dos bombas atómicas, el timador que vendió la Torre Eiffel, la señal Wow!, la
  hormiga zombi, el planeta donde llueve hierro… Decenas de clones (muchos de canales de IA, con pocas
  visitas) y ráfagas recientes. **Hay que buscar casos menos conocidos**, no los de las listas de
  "datos curiosos".
- **Un "0 clones" suele ser una frase de búsqueda mala**: "la gran peste de olor de Londres" daba 0;
  "el gran hedor de Londres" (su nombre habitual) da 18 → ROJO. Medir siempre con el nombre con el que
  la gente lo busca, y con 2 frases si hay duda.
- **Cómo encontrar casos con hueco**: outliers de canales en inglés que casi nadie ha contado en
  castellano (`saturacion.py "…" --en "…"`), el "dato de al lado" de un caso famoso (otra epidemia de
  baile, otro superviviente), casos locales de España y Latinoamérica, y efemérides (subir 1-2 semanas
  antes de la fecha).
- **30/09 (referentes):** los títulos de éxito de ABISMO se copian casi literal en días (canales «para dormir»
  de 2 h con el mismo título): un tema que acaba de reventar en un referente ya no tiene hueco aunque
  `saturacion.py` no lo encuentre con la frase exacta. Mirar siempre el canal del referente antes de
  proponer uno de sus temas; lo útil de ellos es la **fórmula** (títulos, miniatura, gancho), no el tema.
- Pendiente de mejora de la herramienta: para vídeos largos, contar aparte los clones largos (la
  competencia de un vídeo de 12 min son otros vídeos largos, no los Shorts).

## 🏺 Historia insólita
| Idea (título provisional) | Enfoque | Hueco (2026-09-27) | Estado |
|---|---|---|---|
| Cervantes y Shakespeare no murieron el mismo día | El mito contra los documentos | 🟢 8 clones antiguos, sin ráfaga (ventana: 23 de abril) | pendiente |
| Por qué era un asco ser pirata (la vida real a bordo) | El mito contra los documentos | 🟢 0 clones (medir con otra frase) | pendiente |
| La guerra que Australia perdió contra los emúes | La crónica de un caso | 🟡 18 clones con visitas (mediana 17.700): solo con ángulo propio | pendiente |
| La ciudad que no podía dejar de bailar (Estrasburgo, 1518) | La crónica de un caso | 🔴 20 clones, mediana 34 | descartada tal cual |
| El hombre que sobrevivió a dos bombas atómicas | El personaje imposible | 🔴 28 clones, 7 recientes | descartada tal cual |
| El hombre que vendió la Torre Eiffel dos veces | El personaje imposible | 🔴 24 clones, 8 recientes | descartada tal cual |
| El naufragio que inspiró Moby Dick (el Essex) | La crónica de un caso | 🔴 15 clones, 5 recientes | descartada tal cual |
| El Gran Hedor de Londres (1858) | La crónica de un caso | 🔴 18 clones, mediana 306 | descartada tal cual |
| Por qué cambiamos de calendario | La crónica de un caso | 🔴 14 clones, mediana 354 | descartada tal cual |
| Los diez días que desaparecieron (1582) | La crónica de un caso | 🟢 5 clones | usada (S002, canal antiguo) |
| Cómo se lavaban los dientes en la Edad Media | El mito contra los documentos | 🔴 13 clones, mediana 173 | descartada tal cual |

## 🐙 Naturaleza y animales
| Idea (título provisional) | Enfoque | Hueco (2026-09-27) | Estado |
|---|---|---|---|
| Las abejas que votan dónde vivir | El fenómeno explicado | 🟢 0-1 clones (medido con dos frases) | pendiente |
| ¿Se hablan los árboles bajo tierra? (lo que es verdad y lo que no) | El mito contra los documentos | 🟢 8 clones, sin ráfaga | pendiente |
| El hongo que convierte hormigas en zombis | El fenómeno explicado | 🔴 20 clones, mediana 119 | descartada tal cual |
| El lago que convierte animales en piedra (Natron) | El fenómeno explicado | 🔴 19 clones, mediana 299 | descartada tal cual |
| ¿El pulpo tiene nueve cerebros? | El mito contra los documentos | 🔴 22 clones, mediana 452 | descartada tal cual |
| ¿De qué color eran de verdad los dinosaurios? | El mito contra los documentos | 🔴 25 clones, mediana 835 | descartada tal cual |

## 🌌 Universo y espacio
| Idea (título provisional) | Enfoque | Hueco (2026-09-27) | Estado |
|---|---|---|---|
| ʻOumuamua, el visitante que no debería existir | El fenómeno explicado | 🟡 29 clones con visitas (mediana 9.400): solo con ángulo propio | pendiente |
| Qué pasaría si vivieras en Marte | Qué pasaría si | 🟡 17 clones con visitas | pendiente |
| La señal Wow! | El fenómeno explicado | 🔴 32 clones, 4 recientes | descartada tal cual |
| El planeta donde llueve hierro | El fenómeno explicado | 🔴 23 clones, mediana 236 | descartada tal cual |
| En Venus un día dura más que un año | El fenómeno explicado | 🔴 26 clones, 6 recientes | usada (S001, canal antiguo) |
| ¿Cuánto se tarda en cruzar un año luz? (de los outliers de ABISMO, 30/09) | El fenómeno explicado | 🟡 30/09: 13 clones; ABISMO 2,3 M y varios canales ya copian su título casi literal | solo con ángulo propio (p. ej. un día luz: Voyager 1 lo alcanza el 18/11/2026) |
| Todas las formas en que puede acabar el universo (formato catálogo, de Big Space Explainer) | Catálogo completo | 🔴/🟢 30/09: "formas en que terminará el universo" 16 clones, mediana 134 (quemado); "cómo acabará el universo" 7 clones | descartada tal cual: las listas del fin del universo están quemadas en castellano |
| Vivir en Titán, el único mundo donde llueve (de ABISMO) | Qué pasaría si | 🟡 30/09: "vivir en Titán" 3 clones, pero ABISMO lo publicó el 19/09 (762 k); "lagos de metano de Titán" 🔴 26 clones y ráfaga | aparcada: esperar meses o buscar el dato de al lado |
> El pilar más competido: necesita casos poco contados (buscar outliers en inglés con `--en`).

## 🧠 Cuerpo y ciencia
| Idea (título provisional) | Enfoque | Hueco (2026-09-27) | Estado |
|---|---|---|---|
| El hombre que no podía olvidar (Solomon Shereshevsky) | El personaje imposible | 🟢 5 clones, sin ráfaga | pendiente |
| El hombre al que una barra atravesó el cerebro (Phineas Gage) | El mito contra los documentos (no se volvió un bruto: acabó conduciendo diligencias en Chile) | 🟡 (28/09) «Phineas Gage Chile» 🔴 30 clones, pero ninguno cuenta Chile (la herramienta cuenta cualquier vídeo de Gage); «la verdad sobre Phineas Gage» 🟡 12 clones, mediana 1.370; tema amplio fuerte (mediana 71.500). Ángulo propio: «no se volvió un monstruo, acabó conduciendo diligencias en Chile»; el título debe venderlo | en curso (001) |
| Qué pasa si no duermes en tres días | Qué pasaría si | 🟢 3 clones | pendiente |
| Qué le pasa a tu cerebro cuando te quedas en blanco | El fenómeno explicado | 🟢 2 clones · 03/10: «quedarse en blanco mirando un punto fijo» 0 clones; «por qué nos quedamos en blanco» 3 clones (mediana 6.047), tema amplio mediana 394.878, en inglés 31 clones («mind blanking»): oportunidad de traerlo; «el cerebro se duerme a trozos» 🟢 0; «se puede no pensar en nada» 🟡 (15 clones, casi todos canciones); «red neuronal por defecto» 🔴 19 clones, mediana 769 | propuesta (002) |
| Qué pasaría si fueras del tamaño de una hormiga | Qué pasaría si | 🟢 6 clones, sin ráfaga | pendiente |
| Qué le pasa a tu comida en un día dentro de tu estómago | El fenómeno explicado | 🟡 6 clones, 4 recientes | pendiente |
| El experimento de la cárcel de Stanford: lo que no te contaron | El mito contra los documentos | 🔴 28 clones, mediana 770 | descartada tal cual |

## Ideas para ampliar la promesa (de `docs/mercado.md` §5b, sin medir todavía)
- Historias insólitas de **dinero, empresas y estafas** ("La empresa que…"): anunciantes de RPM alto.
- **Barcos y travesías imposibles** (naufragios, supervivencias en el mar), buscando casos poco contados.

## Del canal antiguo (Tok), fuera de la promesa
Venus (S001), 1582 (S002), el pulpo (vídeo 001, aparcado), ¿puede una IA tener ideas propias?, ¿cómo
sabe tu móvil dónde estás? (🔴): se conservan en `canales/_archivo/los-viajes-de-tok/docs/concepto.md` y en el historial de Git.
