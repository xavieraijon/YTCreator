# Mercado y monetización de YouTube (análisis del 2026-09-27)

> Informe de analista para decidir el rumbo del canal con datos, no con promesas. **Nada aquí asegura
> monetizar.** Hechos (con fuente), estimaciones (con supuestos) y opiniones van separados. Cifras y
> fuentes completas en `herramientas/mercado_referencias.json`; datos crudos en `analisis/datos/`.
> Herramientas: `herramientas/mercado.py` (radiografía de nichos, comparativa y plan de horas) y
> `herramientas/saturacion.py` (semáforo de un tema). Revisar este documento cada 6 meses.

## 1. Hechos que condicionan todo (fuentes de confianza alta)
1. **Requisitos del Programa de Socios (YPP)**: hoy, 1.000 suscriptores + 4.000 h de largos en 12 meses
   o 10 M de visualizaciones de Shorts en 90 días. **Desde el 1 de febrero de 2027, para quien entre
   nuevo: 8.000 h o 20 M.** Quien ya esté dentro no se ve afectado. [Blog oficial de YouTube][b27]
2. **Desde esa fecha, los Shorts solo cobran si el canal mantiene 10 M de visualizaciones de Shorts
   cada 90 días**, aunque ya esté en el YPP. Para un canal pequeño, los Shorts dejan de ser una fuente
   de ingresos: pasan a ser solo un escaparate. [Blog oficial][b27]
3. **Contenido no auténtico** (desde el 15-07-2025): no se monetiza el contenido repetitivo o producido
   en masa ni el de IA con plantillas genéricas. Sí se permiten las series con historias distintas
   aunque sigan un patrón. La revisión mira el canal entero. [Ayuda de YouTube][pol]
4. **"Hecho para niños"**: entre los factores que YouTube enumera están los **personajes animados o de
   dibujos que atraen a niños**. La responsabilidad legal de marcarlo bien (COPPA) es **nuestra**:
   poner "no es para niños" no protege si el conjunto apunta a niños. [Ayuda de YouTube][mfk]

## 2. Cuánto paga YouTube de verdad (confianza media; datos de Studio de redes de canales)
- **Largos, RPM mediano por nicho** (300 canales, may 2025 - may 2026; mayoría en inglés):
  educación y ciencia **10,22 $** (P25-P75: 2,31-19,50), entretenimiento 2,43 $, todos los nichos
  2,30 $, **infantil 0,33 $ (≈ 30 veces menos que educación)**. [AIR Media-Tech][air]
- **Shorts: 3-14 % de lo que paga un largo** por cada 1.000 visualizaciones; para la mayoría de canales
  son **menos del 2 % de sus ingresos**. Los canales con **1 Short por cada 2-3 largos** rinden mejor
  en suscriptores e ingresos; los de educación que se vuelcan en Shorts empeoran en ambos. [AIR][airs]
- **En castellano no hay estudios con metodología.** Los rangos de blogs (España 1-6 $/€, Latinoamérica
  menos) indican entre la mitad y la cuarta parte del RPM en inglés. La herramienta usa escenarios
  prudentes para educación en castellano: **0,5 / 2 / 5 $** por cada 1.000 visitas de largos (confianza baja).
- **Concentración**: el 10 % de los canales se lleva el 58 % del dinero; la mitad inferior, el 4 %.
  El 40,6 % de los canales con algún suscriptor llega a 1.000 suscriptores. Entre los que llegan, la
  **mediana tarda 16 meses** (dato con sesgo de supervivencia). [AIR][air300] · [vidIQ][vidiq]
- **Los Shorts están inundados de IA**: el 21 % de los primeros 500 Shorts que ve una cuenta nueva es
  "slop" de IA, y el 33 % "brainrot". España tiene 8 canales de slop en su top 100 de tendencias, con
  20 M de suscriptores (octubre de 2025). [Kapwing][kap]

## 3. Qué cuentan los que viven de esto (8 vídeos leídos enteros, castellano e inglés)
Casi todos venden cursos, herramientas o afiliación: **incentivo a exagerar**. Las cifras son las
que declaran ellos mismos.
- **El nicho pesa más que el volumen.** 64 M de visitas en un nicho malo dieron 6.000 $ en total;
  10 M en marketing digital dieron 45.000 $ (Digital Income Project). Un canal en inglés de largos de
  ≥ 30 min sobre salud: 4 M de visitas → 33.000 € al año (RPM ≈ 8 €).
- **Con Shorts hacen falta cientos de millones de visualizaciones**: un canal de curiosidades en inglés,
  con ≈ 250 M en 90 días, ganó ≈ 40.000 $ (estimación de vidIQ, ≈ 0,16 $/1.000).
- **Lo realista al empezar**: 30 días, 14 vídeos, 4.000 visitas, 103 suscriptores, 94 $ de afiliación.
  Un canal ya monetizado gracias a un vídeo viral: 20-30 $/día. Muchos canales faceless se abandonan a
  los 3-9 meses, cuando se acaba el dinero.
- **El dinero gordo no viene de los anuncios**: patrocinios, afiliación (Audible paga 10 € por cada
  prueba gratuita), productos propios y cursos. En los que venden cursos, el canal es el embudo.
- **Método común para elegir nicho**: buscar canales pequeños (< 200.000 suscriptores) cuyos vídeos
  tengan **muchas más visitas que suscriptores** (el multiplicador que ahora mide `mercado.py`).
- **Para las horas de YouTube**: vídeos de 10-20 min sobre temas que **se buscan** (a un canal nuevo
  YouTube casi no lo recomienda en la portada), listas de reproducción, pantallas finales y **un solo
  tema durante 40-50 vídeos**. 4.000 h con 6 min vistos de media son 40.000 visitas.
- **Atajos prohibidos** (comprar suscriptores u horas): violan las condiciones de YouTube y acaban en
  desmonetización o cierre del canal.
- Adrián Sáenz ha hecho con Claude un flujo **casi idéntico al nuestro**: guion, voz clonada e imágenes
  con zoom, unos 14 $ y 2 h por un vídeo de 14 min. Nuestra ventaja de coste no es exclusiva:
  cualquiera puede hacer lo mismo, así que lo que nos diferencia es el contenido, no la herramienta.

## 3b. Cuatro vídeos más (leídos enteros el 2026-09-29; subtítulos en `analisis/datos/estrategia/`)
| Vídeo | Qué dice | Contraste | ¿Para nosotros? |
|---|---|---|---|
| Edu Serrano, «Si YouTube no recomienda tus vídeos…» (158 k subs, 09-2025, 470 k visitas) | Rellenar en Studio las **palabras clave del canal** (500 caracteres) y una **descripción** con las palabras que busca tu público, escrita a mano (sale en negrita en las búsquedas de YouTube y Google); **ajustes de subida** predeterminados (plantilla de descripción, etiquetas, categoría); **permitir inserción**; en canales nuevos, **no notificar a los suscriptores** para que el algoritmo elija el público | Lo de configurar el canal es gratis y razonable, pero su efecto es pequeño (YouTube da más peso al título, la miniatura y el comportamiento del público); lo de no notificar es su opinión, sin datos | ✅ Configuración única del canal (`docs/guia_subida.md` → «0»). 🧪 La notificación, a probar: nuestros suscriptores vienen de Tok (otro público) |
| Gabriel Signes, «Claude creó mi canal en 10 minutos…» (6,6 k subs, 08-2026) | Nombre, logo, investigación de mercado con un conector de Claude, guion copiando la estructura de la transcripción de un vídeo viral de un referente, voz de ElevenLabs y CapCut. Su canal del nicho universo: **46.900 € en algo más de un año, picos de 437 €/día, hoy 1.000-1.500 €/mes porque el nicho se ha enfriado**. Vende academia | Tercer creador que monta **el mismo flujo que el nuestro** (tras Adrián Sáenz): la herramienta no es ventaja. Copiar la estructura de la transcripción de otro choca con la política de contenido no auténtico si no hay aporte propio. El «Trust Score» del correo nuevo no está documentado por YouTube | ✅ Referentes del pilar universo en castellano: **Abismo** (≈ 19 k subs con 27 vídeos; vidIQ ≈ 2.000 $/mes) y **Late Science** (vidIQ ≈ 5.000 $/mes): analizarlos con la skill antes del primer vídeo de universo. ✅ Los nichos se enfrían: confirma la regla del hueco |
| Alejavi Rivera, «Creo un canal automatizado monetizable con IA gratis» (586 k subs, 08-2024) | Tutorial básico: nicho con un GPT, logo y banner (2048×1152 con zonas seguras), guion de 1 min con 6 escenas, clips de IA, voz, CapCut, miniatura desde un fotograma | Nada que no tengamos, y peor (contenido de plantilla: el que ahora no se monetiza). Único dato útil: **mira canales con muchas visitas en todos sus vídeos, no los de más suscriptores** (ya lo hace `mercado.py`) | ❌ Nada nuevo |
| Iván Marquina en el canal de Javier Limonchi, «Así gana 10.000 €/mes con Shorts» (07-2025, 480 k visitas) | Fábrica de Shorts con IA: 7-8 canales, ≈ 40 vídeos al día con 2 editores, cambio de idioma del canal (español → alemán → coreano → árabe) para monetizar, 5-10 Shorts/día tras llegar a 20 M. Métricas de un Short: **«Vieron / deslizaron» (> 80 % bueno, 70-80 % normal, < 70 % malo)**, retención (una curva plana del 80 % en sus virales) y llamada a la acción final. Un Short puede llevar al largo con la flecha al «vídeo relacionado». Los nichos mueren en semanas (de 4 M/día a 0,5 M) y hay que cambiar | Ingresos declarados por él mismo; es justo el modelo que la política de 07-2025 persigue (producción en masa, traducciones). Útil como referencia de métricas de Shorts, no como modelo | ❌ El modelo, no (decidido: largos + Shorts tráiler). ✅ Umbrales de «Vieron / deslizaron» para nuestros tráileres (≥ 70 %). ✅ El «vídeo relacionado» ya está en la guía |

**Conclusión honesta**: ninguno cambia la estrategia. Los cuatro venden algo (cursos, academia, asesoría), y
dos confirman que nuestro flujo (Claude + voz + imágenes) ya lo hace mucha gente: lo que nos diferencia es
el rigor, la narrativa y el ángulo propio. Lo práctico: configurar el canal una vez en Studio, probar lo
de no notificar en los primeros largos y analizar Abismo y Late Science antes del primer vídeo de universo.

## 3c. Veloz Redes (Nico): 2 vídeos + sus documentos de Notion (leídos el 2026-09-30)
Fuentes: «Claude + YouTube = US$2.000.000 (te regalo mi sistema)» (06-2026, 25 min, 60 k visitas, leído
entero); «Automatización de YouTube 2026 (el curso DEFINITIVO)» (10-2025, 5 h, 40 k visitas: leídos
nichos, guiones, viralidad, monetización, políticas, análisis y las 21 configuraciones; **solo por
encima** el tutorial de Premiere, «escalar/automatizar» y los casos de alumnos); Notion «Docs
Descargables»: leídos enteros *Sistema de Guiones con Claude*, *10 Skills*, *Clonar canales*, *Prompts
de canal*, *+75.000 $/mes* y *Monetizar rápido*; de las fichas por nicho (cosmos, historia oscura,
curiosidades históricas, terror, fauna) solo los canales modelo y la plantilla (son todas iguales);
no abiertas: deportes, culturismo, finanzas, industria, IA visual, avatar. Subtítulos en
`analisis/datos/estrategia/` (`nfqnPnpoN2k`, `zsjdwqNUMR4`). Vende comunidad (Skool) y programa de pago.

| Idea | Contraste | ¿Para nosotros? |
|---|---|---|
| **Bucle de mejora del guion**: tras cada guion, comparar la versión de Claude con la editada por el usuario y convertir cada cambio en una regla de estilo («Collaboration Report» → guía de estilo) | Lo más valioso de todo: es barato y cada vídeo mejora el siguiente. Nosotros aprendemos «a mano» (sección *Aprender*), sin comparar versiones | ✅ Adoptar (propuesta 1) |
| **Payoffs antes de escribir**: por cada parte, la pregunta que abre y la recompensa (1-2 frases); avisar si alguna es floja o repetida antes de escribir | Complementa nuestros bucles abiertos: hoy la escaleta dice qué pregunta se abre, pero no obliga a escribir la respuesta ni a compararlas | ✅ Adoptar en la escaleta (propuesta 2) |
| **Estructura de cada parte**: tensión concreta → pregunta sin responder → giro/ironía → información → mini-recompensa → reenganche más urgente | Coincide con nuestro «mini-giro que abre la siguiente»; el «miedo del espectador» es de canales de consejos: en el nuestro es **extrañeza o asombro** | 🟡 Solo como lista de control de la revisión |
| **Orden de las cartas**: la 2.ª mejor en el gancho, la mejor en 2.º lugar | Choca con lo nuestro (el dato más fuerte al final, anunciado antes: la «recompensa retardada» que él mismo cita de MrBeast en el curso). Lo útil: **el gancho no puede ser flojo por guardar la mejor carta** | 🟡 Añadir ese matiz a narrativa |
| **Empaquetado antes del guion**: título y concepto de miniatura (qué muestra y qué **oculta**) antes de escribir, y la intro **confirma el clic en ≤ 10 s** | Nosotros fijamos el título en la fase B, pero la miniatura llega en la H: el gancho se escribe sin saber qué promesa visual hará | ✅ Adoptar (propuesta 3) |
| **Diagnóstico cruzado**: CTR bajo + retención buena → cambiar título/miniatura, no el guion; CTR bueno + retención mala → el vídeo no cumple la promesa; ambos malos → el tema; ambos buenos → volumen | Sensato y coincide con la skill de análisis; los umbrales que da no cuadran entre sí (Notion: CTR verde ≥ 6 %; curso: «lo ideal es 10 %») y ninguno tiene fuente | ✅ La tabla de decisión; umbrales solo como referencia provisional hasta tener 5 vídeos propios (propuesta 4) |
| **Rescatar un vídeo flojo**: cambiar título **o** miniatura, nunca ambos a la vez | Correcto (si no, no se sabe qué funcionó) | ✅ Al estratega (propuesta 4) |
| **Configuración de Studio**: capítulos automáticos **desactivados** (pueden destripar el giro), sitios destacados desactivados, marca de agua «Suscribirse» en todo el vídeo, enlace `?sub_confirmation=1`, pestaña Inicio con tráiler + listas por tema y sin la fila de Shorts arriba, programar 1-2 h antes del pico de actividad, idoneidad para anuncios **siempre honesta** | Gratis y razonable; las cifras que da (+23 % retención, +67 % suscriptores, +200 % alcance) no tienen fuente. Lo de los capítulos automáticos importa en un canal de giros | ✅ A `docs/guia_subida.md` (propuesta 5) |
| **Voz «poco usada»**: usar voces de ElevenLabs con < 20.000 usos o clonar una, porque YouTube «detecta voces repetidas» | Sin fuente: la política de 07-2025 habla de contenido **masivo y repetitivo** (historias copiadas, sin transformación), no de voces. La voz no es lo que nos distingue, pero tampoco nos pone en riesgo | 🧪 Mirar cuántos usos tiene «Javier Rojas» en la biblioteca; no cambiar nada por esto |
| **Referentes por nicho** (Notion): Weirdium (curiosidades históricas, recopilaciones de 35-40 min), Cosmicus y Big Space Explainer (universo), History of Battlefields (historia oscura), SafeHaven Wildlife y Bloop Labs (fauna) | Canales en inglés, útiles para ver formatos y títulos que funcionan en nuestros pilares | 🧪 Analizarlos con la skill cuando toque cada pilar (junto a Abismo y Late Science) |
| Nichos «rentables» (historia medieval para dormir, aviones, aeropuertos…), *niche bending* con NexLev, palabras clave con vidIQ | NexLev y vidIQ son de pago; nuestro nicho ya está elegido y `mercado.py` + `saturacion.py` cubren la parte útil. Lo de «historia para dormir» (vídeos de horas) es un formato, no un tema: anotado | ❌ Nada que cambiar |
| Adaptar títulos del canal modelo «cambiando 1-2 palabras»; comprar canales ya monetizados; poner licencia Creative Commons; inventar nombres rimbombantes para las ideas («protocolo de optimización algorítmica»); nombrar el archivo como el título | Plantilla = contenido no auténtico; comprar canales va contra las normas de YouTube; CC regala nuestras imágenes a los resubidores; los nombres inventados chocan con «…y real»; lo del archivo no tiene efecto documentado | ❌ Descartado |

**Conclusión honesta**: no cambia la estrategia ni el nicho. Lo que sí mejora el motor es el **método de
guion** (bucle de mejora con las ediciones del usuario, recompensas escritas antes de escribir, promesa
de título+miniatura fijada antes del gancho) y una **tabla de decisión para las métricas**. Casi todo lo
demás ya lo tenemos (bucles abiertos, regla del hueco, análisis con la skill, guía de subida) o es humo
de venta.

## 3d. Alejavi Rivera: «Google acaba de reventar los vídeos largos y consistentes por IA GRATIS» (leído el 2026-10-01)
26 min, 206 k visitas, 20-07-2026; subtítulos en `analisis/datos/estrategia/3h89eX-p5sE_*.txt`. Tutorial de
herramientas de Google Flow (con un patrocinio de Mistral en medio). Lo que puede servir al kit:
- **Flow → Tools → Storyboard Studio**: de un texto (pegado o generado) saca los *assets* (personajes de cuerpo
  entero y cara, lugares, objetos) y un storyboard de imágenes **consistentes entre sí**; cada fotograma tiene una
  descripción editable que referencia los assets; estilo propio definible por nombre o descripción. Imágenes
  «gratis e ilimitadas» según él (sin verificar); **no deja subir imágenes propias** (ni nuestra referencia de estilo).
  Interés: la consistencia de personajes (Gage, Harlow) es nuestro punto débil con klein. Coste: trabajo a mano
  en la web (o Claude in Chrome), no API.
- **Shot Explorer**: desde UNA imagen genera otros planos del mismo objeto (detalle, lateral, desde arriba,
  espaldas) manteniéndolo. Interés: variar planos de una imagen buena (la barra, la vitrina) en vez de rehacerla.
- **Máquina de transición**: un clip que une el último fotograma de un vídeo con el primero del siguiente.
- Vídeo en Flow: 50 créditos/día gratis (≈ 5 clips) y 1.000/mes en las cuentas de pago; modelo «Omni Flash», 4-10 s.
  Encaja con los 1-3 clips animados por vídeo que ya prevé el método.
- Lo demás no aplica: Gemini TTS con contexto (ya probado; voz elegida: Gabo), clonar anuncios de AdForum,
  «Create Tool» (vibe-coding dentro de Flow), Qwen/Wan y Meta AI por WhatsApp (calidad baja).
**Prueba propuesta (gratis):** Storyboard Studio con las escenas 1-3 del 001 y el estilo editorial descrito a
mano; comparar consistencia y estilo con las imágenes aprobadas. Si gana en personas, puede sustituir a ai33
para los planos con personajes.

## 3e. Iván Marquina en AkoriTalk: «Experto en YouTube Shorts te explica cómo genera 10k al mes» (leído el 2026-10-01)
1 h 03 min, 8,5 k visitas, 29-09-2026; texto limpio en `analisis/datos/estrategia/dXWt72jE5Jk_limpio.txt`. Mismo
creador que en §3b; vende mentorías. Su negocio (40-70 Shorts al día entre muchos canales con editores, resubir
clips de Douyin o TikTok «modificados lo suficiente», saltar de nicho e idioma cuando uno muere) **no es el nuestro**
y choca con la marca del canal. Lo aprovechable:
- **Política de «contenido inauténtico»**: según él, YouTube no castiga la IA; desmonetiza lo **repetitivo o de
  plantilla** (PNG + subtítulos automáticos + vídeo de fondo; historias de Reddit sobre parkour con voz de
  ElevenLabs) y los vídeos «hechos con un prompt». Confirma la línea del canal: guion propio y verificado, escritura
  humana (`docs/escritura_humana.md`), imágenes por escena y 1 vídeo/semana.
- **Shorts que llevan al largo** («vídeo relacionado»): para él, empezar sin Shorts es «un 500 % más difícil». Ya está
  en el método (Shorts-tráiler); el 001 va sin Shorts por decisión del 29/09. Matiz propio: los suscriptores que
  vinieron por los Shorts de Tok no hacen clic en largos; un Short-tráiler de ESTE canal sí apunta al mismo público.
- **Visitas «interesadas»** (Studio → vídeo → Interacción): las que monetizan en Shorts, ≈ la mitad de las visitas
  totales. Métricas de un Short que despega: «vieron» ≈ 89 %, retención > 100 % (se repite), 1 like de cada 10.
- **RPM de Shorts en español ≈ 0,05 €/1.000**; en largos varía por temática (0,30-9 €). Coincide con §2.
- Búsqueda de temas: feed de Shorts en incógnito cambiando de idioma; Playboard y ViewStats filtrando por
  crecimiento semanal. Útil como complemento de `saturacion.py`, no como método.
**Decisión propuesta:** ninguna nueva; reconsiderar 1-2 Shorts-tráiler del 001 cuando esté montado.

## 4. Los canales faceless de referencia (datos de yt-dlp, 27-09-2026)
| Canal | Subs | Ritmo · duración | Qué le funciona | ¿Replicable por nosotros? |
|---|---|---|---|---|
| Kurzgesagt | 25,6 M | 1,5/mes · 14 min | Animación con mascota y **tono adulto y existencial** | El enfoque sí; la producción no |
| The Infographics Show | 15,5 M | 35/mes · 19 min | Monigotes simples y curiosidad morbosa (muerte, crímenes, cuerpo) | El tipo de tema sí; el volumen no |
| Daily Dose of Internet | 20,7 M | 14/mes · 15 min | Recopilaciones de clips reales (sin IA) | No (derechos) |
| MagnatesMedia | 1,9 M | < 1/mes · 31 min | Documentales de negocios (RPM alto) | Solo el formato de historia larga |
| **Zenn** | 192 k | 5/mes · 8,5 min | **Serie de fórmula fija** ("The X Effect"), psicología y curiosidad | **Sí: es el modelo de una sola persona** |
| Adrián Sáenz | 4,1 M | 11/mes · 35 min | Marca personal de finanzas (no es faceless) | No; fuente de estrategia |

**Lo que comparten los que funcionan**: vídeos **largos** (8-30 min), tema de **adultos** aunque el
dibujo sea simple o de caricatura, una **fórmula de título o serie** reconocible, y **pocos Shorts o
ninguno** como fuente de ingresos. Ninguno de los que triunfan es infantil.

## 5. Implicaciones para "Los Viajes de Tok" (análisis y opinión, no hechos)
1. **Nuestra estrategia actual (solo Shorts sueltos) no lleva a monetizar.** Con requisitos de 20 M
   en 90 días (≈ 222.000 visualizaciones al día) y un mínimo de 10 M para cobrar, los Shorts deben ser
   tráiler y escaparate de los largos, no el producto. Proporción razonable: 1 Short por cada 2-3 largos.
2. **El riesgo del robot infantil es real, pero lo que pesa es el conjunto, no el robot.** Juntamos
   varios de los factores que YouTube enumera: personaje animado que atrae a niños, estilo "dibujos de
   TV infantil", narrador "estilo Pocoyó" y temas escolares. Aunque marquemos "no es para niños", el
   público que atrae ese envoltorio será infantil o de sus padres (poco valor para anunciantes) y el
   riesgo legal es nuestro. Kurzgesagt demuestra que **una mascota animada funciona para adultos** si el
   tema, el tono y los títulos son de adultos.
3. **Opciones para el replanteamiento** (decisión del usuario):
   - **A. Tok se queda, pero adulto**: el mismo robot con un estilo menos "infantil de TV", narrador
     irónico en vez de Pocoyó y temas con gancho adulto (cuerpo, muerte, historia turbia, dinero,
     psicología). Aprovecha lo hecho. Riesgo medio: hay que revisar la hoja del personaje.
   - **B. Tok como firma, no como protagonista**: un estilo visual propio de canal (en la línea de
     Zenn o Kurzgesagt) con Tok como mascota ocasional o logotipo. Riesgo bajo de clasificación y más
     libertad de temas.
   - **C. Canal infantil de verdad**: marcar "hecho para niños" y asumir un RPM ≈ 30 veces menor, sin
     comentarios ni notificaciones. Solo tiene sentido con un volumen enorme; **desaconsejado**.
4. **El formato que más opciones da** según los datos: largos de 8-15 min en castellano, de un tema
   paraguas con público adulto y RPM de educación, en una serie de fórmula fija. Los temas se eligen
   con demanda de búsqueda y hueco (`saturacion.py`) y el nicho con puerta de entrada (`mercado.py`).
   Afiliación desde el primer vídeo (libros o audiolibros del tema), porque YouTube tardará en pagar.
5. **Expectativa honesta**: meses sin ingresos. La mediana de quien llega a 1.000 suscriptores son
   16 meses, y con requisitos de 8.000 h para los que entren en 2027. Nuestra ventaja real es el coste
   casi nulo por vídeo: permite aguantar donde otros abandonan por dinero. Pero la herramienta no nos
   diferencia (otros ya tienen la misma); nos diferencia el contenido.

## 5b. Contraste: "Los 7 nichos que te harán ganar dinero en 2026" (Eric Alanis, 2026-07-09)
Vídeo de [Eric Alanis](https://www.youtube.com/watch?v=vhHISBB0lEk) (64.000 subs, 92.000 visitas), el
invitado de Adrián Sáenz que "monetizó en 5 días". **Incentivo a tener en cuenta**: el vídeo termina en
un embudo de venta (llamada para ayudarte a "ganar 2.000-3.000 al mes"); sus ingresos (15 canales,
10.000-15.000 €/mes) son autodeclarados y sin verificar.

**Su método**: (1) canales de menos de 3-4 meses que ya despegan, (2) poca competencia en castellano,
(3) baratos de producir; señales: muchas más visitas que suscriptores y branding repetido (misma
miniatura y título). Nichos: finanzas para 50-60 años, salud y gimnasio, ganar dinero por internet,
relaciones y desarrollo personal, herramientas de IA, animales y cruceros.

| Punto | Él dice | Nuestros datos | Veredicto |
|---|---|---|---|
| El nicho es "el 90 %" | Lo que más pesa | 64 M de visitas → 6.000 $ frente a 10 M → 45.000 $ (Digital Income Project); AIR: diferencias de ×4-30 entre nichos | ✅ De acuerdo en la dirección (el 90 % es retórico) |
| Canales pequeños con más visitas que suscriptores | La señal clave | Es la "puerta de entrada" y el multiplicador de `mercado.py` | ✅ Coincide: ya lo medimos |
| "En español aún no hay casi nadie" | Oportunidad | Medido el 27-09: en cruceros, jubilación e IA **ya hay canales en castellano** de 6-13 meses con 11.000-18.000 subs | ⚠️ Exagerado; pero cruceros (9 evidencias) e IA (4, concentración 33 %) tienen la puerta abierta |
| RPM de finanzas 10-15 y de IA "10" | Alto | AIR (Studio, may 2025-may 2026): negocios y finanzas, mediana 2,01 $; gadgets y tecnología, 2,33 $; **educación y ciencia, 10,22 $** | ❌ Sus cifras no cuadran con datos de Studio (son de audiencia de EE. UU. o de anunciante); en castellano, menos aún |
| Salud y gimnasio RPM 3-4 | Medio | AIR: salud y deporte, 1,23 $ | ⚠️ Optimista |
| Vídeos largos = más RPM | Hacerlos de 20-40 min | Anuncios a mitad de vídeo desde 8 min; más horas para el YPP | ✅ De acuerdo (por eso nuestros largos de 10-14 min) |
| Imágenes de stock + locución + "replicar los vídeos virales cambiando el color" | Barato y funciona | Política de contenido no auténtico: pases de imágenes con poca narrativa y contenido de plantilla no se monetizan; la revisión mira el canal entero | ❌ Riesgo real de desmonetización; él mismo pide "una imagen por idea" y "aportar valor" |
| Branding repetido en miniaturas | Clave para que te reconozcan | Coincide con Zenn, Kurzgesagt y con la recomendación de la plantilla fija | ✅ Ya lo aplicamos |

**Implicaciones para "Asombroso y Real"** (opinión):
1. Nuestro pilar de educación y ciencia es, según los datos de Studio, **el que mejor paga**: no hay
   motivo para pasarse a finanzas, IA o salud, donde además haría falta autoridad (temas de dinero y
   salud: YouTube exige más fiabilidad) y no encajan con la promesa del canal.
2. **Animales** (su nicho 6) coincide con nuestro pilar de naturaleza: validado por las dos vías.
3. **Idea aprovechable dentro de nuestra promesa**: historias insólitas de **dinero, empresas y
   estafas** ("La empresa que…", modelo MagnatesMedia) y de **barcos y viajes** (naufragios, travesías
   imposibles), que caben en historia insólita y acercan anunciantes de RPM alto. Medir cada una con
   `saturacion.py` antes de producirla.
4. Su criterio de "canales de menos de 3 meses" es más estricto que el nuestro (≤ 24 meses): es una
   señal útil pero ruidosa (un canal nuevo puede haber comprado audiencia o ser de una red).

## 6. Cómo usar las herramientas
```bash
.venv/bin/python herramientas/mercado.py --comparar analisis/mercado/nichos.json   # comparar nichos
.venv/bin/python herramientas/mercado.py --nicho "..." --busqueda "..." --busqueda "..."
.venv/bin/python herramientas/mercado.py --plan                                   # horas para el YPP
.venv/bin/python herramientas/saturacion.py "dato concreto" --amplio "tema"        # un tema concreto
```
Límites: la búsqueda sin sesión favorece a los canales grandes; las muestras de canales pequeños por
nicho son de 2 a 9 canales, así que dos ejecuciones pueden variar. Hay que mirar las evidencias y la
tabla de canales, no solo el semáforo. Cuando el canal tenga datos de Studio, sustituir los RPM y la
retención supuesta por los reales.

[b27]: https://blog.youtube/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn/
[pol]: https://support.google.com/youtube/answer/1311392
[mfk]: https://support.google.com/youtube/answer/9528076
[air]: https://air.io/en/air-data-findings/which-youtube-niche-makes-the-most-money-in-2026-ranked-by-real-rpm-and-cpm
[airs]: https://air.io/en/air-data-findings/what-is-youtube-shorts-rpm-in-your-niche-in-2026
[air300]: https://air.io/en/air-data-findings/how-much-does-youtube-really-pay-in-2026-real-rpm-data-from-300-channels
[vidiq]: https://vidiq.com/research/youtube-subscriber-benchmarks-2026/
[kap]: https://www.kapwing.com/blog/ai-slop-report-the-global-rise-of-low-quality-ai-videos/
