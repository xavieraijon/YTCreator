# Concepto del canal: "{{nombre}}"

> Documento de referencia para elegir temas, escribir guiones, crear imágenes y publicar. Lo leen los
> agentes a través de sus fichas (`<canal>/equipo/`). Creado el {{fecha}} con `/nuevo-canal`.
> Rutas: `<canal>/…` = carpeta del canal;
> `docs/mercado.md` y `analisis/mercado/` son del kit (raíz del proyecto).

## Nombre y promesa
- **{{nombre}}** · <<RELLENAR: @identificador (fase C, comprobado con yt-dlp)>>
- **Promesa (una frase):** <<RELLENAR: qué se lleva el espectador de cada vídeo (fase B)>>
- **Por qué este nombre:** <<RELLENAR: qué dice, qué alternativas se descartaron y por qué, búsqueda limpia en YouTube>>

## Mercado (fase A)
<<RELLENAR: resumen de `herramientas/mercado.py` (demanda, puerta de entrada, concentración, ritmo al YPP, RPM en rangos) con el enlace al informe de `analisis/mercado/` y la decisión tomada>>

## Pilares
| Pilar | Qué entra | Datos (mercado.py) |
|---|---|---|
| <<RELLENAR: emoji + pilar>> | | |
- Lo que une los pilares: <<RELLENAR: promesa, estilo, voz y fórmula de título comunes>>. Los canales con
  temas sin conexión no crecen (YouTube no sabe a quién enseñarlos).
- **Reparto inicial:** <<RELLENAR: qué pilar abre y cómo se rota>>. Se ajusta con las métricas propias a
  partir del vídeo 6-8.

## Público
<<RELLENAR: edad, países, qué busca>>. En YouTube: <<RELLENAR: "No, no es contenido creado para niños" o "Sí"; si es infantil, leer antes `docs/mercado.md` §1.4 (RPM ≈ 30 veces menor, sin comentarios)>>.

## Voz y narrador
- <<RELLENAR: quién cuenta (narrador en off, personaje…), tono, cómo trata al espectador>>
- Voz: <<RELLENAR: voz elegida en la fase E, con fecha y por qué; alternativa gratuita>>.
- Marcas de emoción permitidas: <<RELLENAR: p. ej. [curious], [whispers]…>>, como mucho una por bloque
  si la voz es eleven_v3 (con varias distintas salta de tono); con voces sin marcas, "ninguna".

## Estilo visual (fase D)
- <<RELLENAR: descripción del estilo y muestra aprobada en `<canal>/videos/_pruebas/estilo/…`>>
- **Base del prompt:** la de `canal.json` → `estilo` (manda sobre este resumen).
- Paletas: <<RELLENAR: por pilar, o una sola>>.
- Personaje fijo: <<RELLENAR: no / sí (hoja de referencia en `<canal>/personaje/`)>>.
- Lo que nunca sale: <<RELLENAR: p. ej. sangre, logotipos, texto dentro de la imagen>>.

## Formato
- **Producto principal:** <<RELLENAR: largos de N-M min / Shorts / ambos, con la razón de `docs/mercado.md`>>
- **Ritmo de publicación:** <<RELLENAR: p. ej. 2 al mes para empezar>>. Constancia antes que volumen.
- **Shorts:** <<RELLENAR: tráileres de los largos (1-2 por vídeo) o producto propio>>.
- **Ritmo visual:** una imagen cada 5-8 s con movimiento; rótulos solo para datos clave.

## Títulos, series y miniaturas
- **Fórmulas de título** (< 60 caracteres, promesa + curiosidad): <<RELLENAR: 2-4 fórmulas con un ejemplo cada una>>
- **Tipografía (fase F):** <<RELLENAR: títulos, subtítulos y rótulos (`canal.json` → `fuentes`)>>.
- **Miniatura:** <<RELLENAR: imagen, 2-4 palabras que no repiten el título, qué evitar>>. La imagen de
  fondo se pide con un lado vacío para el texto.
- **Pantalla final:** `canal.json` → `pantalla_final`; la mitad derecha libre para YouTube.

## Estructura de un vídeo
<<RELLENAR: bloques del vídeo largo (gancho 0-30 s sin saludos, contexto, actos que van a más con bucles abiertos, explicación, giro final, cierre con pregunta a los comentarios) adaptados a la temática>>

## Reglas de guion
- **Rigor:** <<RELLENAR: si el canal cuenta hechos: cada dato con 2 fuentes fiables en `fuentes.md` y
  revisión del `verificador`; si no, qué se comprueba>>.
- **Regla del hueco** (`herramientas/saturacion.py`): tema amplio con público × dato concreto que casi
  nadie cuenta. Nada en ROJO; mide el enfoque (la pregunta-título), no solo el tema.
- **Aporte propio en cada vídeo** (política de contenido no auténtico de YouTube): narrativa, opinión,
  conexión con el espectador; nunca un pase de datos sacado de una plantilla.
- Voz sintética (del kit): frases de menos de 25 palabras y encadenadas; números y años en letra; comas
  solo donde hay pausa real; con eleven_v3, puntos suspensivos nunca tras una palabra llana larga y
  ninguna frase acaba al cerrar una cita. Tras locutar, `herramientas/entonacion.py`.
- <<RELLENAR: reglas propias de la temática (temas delicados, lenguaje, lo que no se dice)>>

## Monetización (expectativa honesta: `docs/mercado.md`)
- Anuncios al llegar al YPP (si se solicita después del 01-02-2027: 1.000 suscriptores + 8.000 h, o
  20 M de visualizaciones de Shorts).
- <<RELLENAR: afiliación, patrocinios u otros ingresos posibles del nicho>>. Nunca prometer ingresos ni plazos.
