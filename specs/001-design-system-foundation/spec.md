# Feature Specification: Base del design system

**Feature Branch**: `001-design-system-foundation`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Base del design system de YTCreator (feature 001): estética «precisión oscura con chispa», fundamentos, tres niveles de tokens, tema oscuro y claro, primer conjunto de componentes, iconografía, accesibilidad, catálogo vivo y página de muestra para validar la estética."

## Contexto y dirección estética

El design system es lo que hace que todas las pantallas de YTCreator se vean y se comporten igual, con una identidad
propia y sin depender de frameworks de terceros (constitución, principio VI).

**Dirección: «precisión oscura con chispa».**

- **La base:** sobria, oscura y precisa. Neutros casi negros, mucho aire, retícula y tipografía exactas, bordes
  finos. Es lo que da calma y profesionalidad.
- **La chispa:** un acento de marca vivo, degradados y brillos sutiles, y superficies de cristal (translúcidas, con
  el fondo desenfocado). Es lo que da personalidad y señala lo que está vivo.
- **La regla de la mesura:**
  - El cristal y los brillos aparecen solo donde aportan jerarquía o indican actividad: paneles flotantes, el
    asistente de IA, diálogos y el momento en que la IA genera.
  - **Nunca** en superficies de lectura larga, como guiones o descripciones.
  - Ante la duda, gana la legibilidad.
- **La firma de la IA:** cuando la IA trabaja, se nota de inmediato y siempre igual. Es una aurora o brillo animado,
  reconocible en toda la app.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fundamentos y temas a la vista (Priority: P1)

Quien desarrolla abre el catálogo del design system. Ve todos los fundamentos: colores, tipografía, espaciado,
radios, elevación, cristal, bordes, capas, movimiento y puntos de ruptura. Cada uno aparece con su nombre, su uso
recomendado y su aspecto en el tema oscuro y en el claro. Puede cambiar entre automático, claro y oscuro, y la
elección se recuerda la próxima vez.

**Why this priority**: Sin fundamentos no hay componentes ni pantallas. Es la base de todo lo demás y ya permite
juzgar la paleta y la tipografía.

**Independent Test**: Abrir el catálogo, recorrer la sección de fundamentos en ambos temas, cambiar el tema,
cerrar y volver a abrir. El tema elegido se mantiene y cada fundamento aparece documentado.

**Acceptance Scenarios**:

1. **Given** un navegador con el sistema en modo oscuro y sin preferencia guardada, **When** se abre el catálogo,
   **Then** se muestra en tema oscuro, sin destellos del tema claro durante la carga.
2. **Given** el catálogo abierto en «automático», **When** el sistema operativo cambia de oscuro a claro, **Then**
   el catálogo cambia de tema sin recargar.
3. **Given** el usuario elige «claro», **When** cierra y vuelve a abrir el catálogo, **Then** sigue en claro aunque
   el sistema esté en oscuro.
4. **Given** la sección de color, **When** se consulta un color semántico (p. ej. «texto secundario» o «superficie
   elevada»), **Then** se ve su valor en cada tema, para qué se usa y su contraste con los fondos donde está
   permitido.

---

### User Story 2 - Componentes básicos listos para construir pantallas (Priority: P1)

Quien desarrolla encuentra en el catálogo cada componente del primer conjunto, con todas sus variantes y estados:
normal, encima, foco, pulsado, deshabilitado, cargando y error, según aplique. Para cada uno hay un ejemplo de uso
correcto y otro de uso incorrecto. Con eso construye una pantalla nueva sin escribir estilos propios.

**Why this priority**: Es el objetivo práctico de la feature. Las siguientes (onboarding, canal…) dependen de estos
componentes.

**Independent Test**: Montar una pantalla nueva solo con componentes del catálogo y comprobar que no hace falta
ningún estilo adicional y que todo es usable con teclado.

**Acceptance Scenarios**:

1. **Given** el catálogo, **When** se consulta el botón, **Then** aparecen sus variantes (principal, secundario,
   fantasma, peligro), tamaños y estados (incluidos cargando y deshabilitado), en ambos temas.
2. **Given** cualquier componente interactivo, **When** se recorre solo con teclado, **Then** todos sus controles se
   alcanzan en orden lógico, el foco es siempre visible y se puede activar sin ratón.
3. **Given** un diálogo abierto, **When** se pulsa Escape o el botón de cerrar, **Then** se cierra y el foco vuelve
   al elemento que lo abrió. Mientras está abierto, el foco no se escapa del diálogo.
4. **Given** el indicador de pasos (stepper), **When** se está en el paso 3 de 5, **Then** se distinguen claramente
   los pasos hechos, el actual y los pendientes, también para un lector de pantalla y sin depender solo del color.
5. **Given** la sección plegable de «Modo experto», **When** está cerrada, **Then** su contenido no se ve ni recibe
   el foco. Al abrirla, lo anuncia a las tecnologías de apoyo.
6. **Given** un mensaje de error amable, **When** se muestra, **Then** dice qué ha pasado, qué se puede hacer y
   ofrece una acción, en lenguaje llano.

---

### User Story 3 - Cristal, brillo y la firma de la IA (Priority: P2)

El creador ve las superficies de cristal (panel flotante, diálogo, asistente) y el indicador «la IA está
trabajando». Reconoce de inmediato que la IA está generando algo. Si su sistema pide reducir el movimiento o la
transparencia, la app lo respeta sin perder información.

**Why this priority**: Es la personalidad que distingue a YTCreator. Depende de los fundamentos y de los componentes
base, y se puede validar por separado.

**Independent Test**: En el catálogo, activar el indicador de IA y abrir un panel de cristal. Luego activar en el
sistema «reducir movimiento» y «reducir transparencia» y comprobar que la animación se detiene o se suaviza y que el
cristal pasa a ser sólido, sin perder legibilidad ni significado.

**Acceptance Scenarios**:

1. **Given** el indicador «la IA está trabajando» activo, **When** lo ve una persona que no conoce la app, **Then**
   entiende que algo se está generando. Un texto visible acompaña la animación (p. ej. «Escribiendo tu guion…»).
2. **Given** «reducir movimiento» activado en el sistema, **When** aparece el indicador de IA o cualquier transición,
   **Then** no hay desplazamientos ni animaciones continuas; el estado se comunica con un cambio estático o muy suave.
3. **Given** «reducir transparencia» activado, o un navegador que no admite el desenfoque, **When** se muestra una
   superficie de cristal, **Then** se ve como una superficie sólida equivalente, con el mismo contraste o mejor.
4. **Given** una superficie de cristal sobre un fondo con mucho detalle o color, **When** se lee su texto, **Then**
   el contraste sigue cumpliendo AA.

---

### User Story 4 - Página de muestra para validar la estética (Priority: P2)

El creador del producto abre una página de muestra que imita un paso real del recorrido guiado. Por ejemplo, «Elige
el enfoque de tu vídeo», con el stepper, tarjetas de opciones, un campo de texto, «Modo experto» plegado, el
asistente de IA generando y un aviso flotante. Con ella decide si la estética le convence antes de construir nada
más.

**Why this priority**: Evita construir pantallas sobre una estética que luego no guste. Es la puerta de aprobación
de la feature.

**Independent Test**: Abrir la página de muestra en escritorio y a 375 px, en ambos temas, y recorrer el paso
completo con ratón y con teclado.

**Acceptance Scenarios**:

1. **Given** la página de muestra, **When** el creador la recorre, **Then** puede completar el paso de ejemplo
   (elegir una opción, escribir, abrir «Modo experto», lanzar una generación simulada y ver su resultado) sin
   instrucciones.
2. **Given** una pantalla de 375 px de ancho, **When** se abre la página de muestra, **Then** no hay desplazamiento
   horizontal y todo sigue siendo usable con el dedo (zonas táctiles suficientes).
3. **Given** la página de muestra en tema claro, **When** se compara con la oscura, **Then** se reconoce la misma
   marca y personalidad (mismo acento, misma firma de IA, misma jerarquía).

---

### User Story 5 - Reglas que impiden inventar estilos (Priority: P3)

Quien desarrolla intenta usar un color, espacio o tamaño que no sale de los tokens en un componente o pantalla. Una
comprobación automática se lo impide y le indica el token que debe usar. La documentación explica cuándo usar cada
nivel de token.

**Why this priority**: Garantiza que el sistema siga siendo coherente con el tiempo. No aporta nada visible, pero
protege la inversión.

**Independent Test**: Introducir a propósito un valor suelto en un componente y comprobar que la verificación falla
con un mensaje claro.

**Acceptance Scenarios**:

1. **Given** un estilo de componente con un color o espaciado escrito a mano, **When** se ejecutan las
   comprobaciones de calidad, **Then** fallan y señalan la línea y el tipo de token que corresponde.
2. **Given** la documentación de tokens, **When** se consulta, **Then** explica la diferencia entre primitivos,
   semánticos y de componente, y cuál usar en cada caso (las pantallas solo usan semánticos o de componente).

---

### Edge Cases

- **Tema guardado inaccesible:** si el navegador no permite guardar la preferencia de tema (modo privado,
  almacenamiento bloqueado), se usa «automático» sin errores visibles.
- **Desenfoque no soportado:** si el navegador no admite el desenfoque de fondo, el cristal cae a sólido
  automáticamente.
- **Textos largos:** palabras largas del castellano («Configuración», «Personalizar») y textos largos en botones,
  pastillas, avisos y pestañas no rompen el diseño. Se ajustan o se recortan con indicación, y el texto completo
  sigue disponible.
- **Zoom:** con el navegador al 200 %, el contenido sigue siendo usable sin pérdida de información.
- **Varios avisos a la vez:** se apilan de forma ordenada, sin tapar la acción principal ni el botón del asistente,
  y cada uno se puede cerrar.
- **Alto contraste:** en modo de colores forzados del sistema, los controles siguen viéndose y el foco sigue siendo
  visible.
- **Tooltips:** no son la única vía para una información esencial. En pantallas táctiles su contenido es accesible
  sin pasar el ratón.
- **Indicador de IA sin fin:** si se queda activo mucho tiempo, sigue siendo discreto y no distrae ni consume
  recursos de forma excesiva.

## Requirements *(mandatory)*

### Functional Requirements

**Fundamentos y tokens**

- **FR-001**: El sistema DEBE definir fundamentos de: color (neutros, acento de marca, estados de éxito, aviso,
  error e información), tipografía (escala, pesos, interlineados; una familia para la interfaz y otra monoespaciada),
  espaciado, radios, sombras y elevación, cristal (translucidez y desenfoque), bordes, capas, movimiento (duraciones
  y curvas) y puntos de ruptura.
- **FR-002**: Los valores DEBEN organizarse en tres niveles:
  - **primitivos:** la paleta y las escalas en bruto;
  - **semánticos:** el significado, p. ej. «superficie elevada» o «texto secundario»;
  - **de componente:** p. ej. «fondo del botón principal».

  Cada nivel solo puede referenciar al nivel inferior.
- **FR-003**: El acento de marca DEBE ser un color vivo y propio, distinto del rojo de YouTube para no confundirse
  con su marca. DEBE incluir un degradado de marca, reservado a momentos de énfasis y a la firma de la IA.
- **FR-004**: Cada color semántico de texto o icono DEBE documentar sobre qué fondos está permitido, y cumplir con
  ellos el contraste AA (4,5:1 en texto normal; 3:1 en texto grande y en elementos gráficos de la interfaz) en ambos
  temas.

**Temas**

- **FR-005**: DEBE haber un tema oscuro (por defecto) y un tema claro equivalente, con la misma marca, jerarquía y
  personalidad.
- **FR-006**: El usuario DEBE poder elegir automático (sigue al sistema), claro u oscuro. La elección DEBE recordarse
  entre sesiones y aplicarse desde el primer instante de la carga, sin destellos.

**Componentes**

- **FR-007**: El sistema DEBE ofrecer estos componentes, con sus variantes y estados documentados:
  - **acciones:** botón (principal, secundario, fantasma, peligro; tamaños; cargando; deshabilitado) y botón de
    icono;
  - **formularios:** campo de texto, área de texto, selector, interruptor, casilla y grupo de opciones;
  - **contenedores:** tarjeta, panel de cristal, diálogo, pestañas y sección plegable;
  - **comunicación:** aviso flotante, etiqueta o pastilla, tooltip, estado vacío y mensaje de error amable;
  - **progreso:** indicador de pasos, barra de progreso, spinner, esqueleto de carga e indicador «la IA está
    trabajando».
- **FR-008**: Todos los controles interactivos DEBEN poder usarse solo con teclado, tener foco visible con contraste
  suficiente en ambos temas, tener un nombre accesible y anunciar su estado a las tecnologías de apoyo.
- **FR-009**: Los botones de solo icono DEBEN tener siempre un nombre accesible. Las zonas táctiles DEBEN medir al
  menos 24×24 px (WCAG 2.2) y, en los controles principales, se recomiendan 44×44 px.
- **FR-010**: Los formularios DEBEN asociar cada campo con su etiqueta, su ayuda y su mensaje de error, y el error
  DEBE comunicarse con algo más que el color.
- **FR-011**: El indicador «la IA está trabajando» DEBE ser reconocible y consistente en toda la app, ir acompañado
  de un texto que diga qué se está haciendo, ser anunciado a las tecnologías de apoyo y poder mostrar el progreso
  cuando se conozca.
- **FR-012**: Los avisos flotantes DEBEN poder cerrarse, no tapar la acción principal, durar lo suficiente para
  leerse (o no desaparecer solos si incluyen una acción) y anunciarse a las tecnologías de apoyo.

**Cristal, brillo y movimiento**

- **FR-013**: El cristal y los brillos DEBEN usarse solo en paneles flotantes, diálogos, el asistente de IA y la
  firma de la IA. La documentación DEBE prohibir expresamente su uso en superficies de lectura larga.
- **FR-014**: Con «reducir movimiento» activado, el sistema DEBE eliminar las animaciones continuas y los
  desplazamientos, y conservar como mucho transiciones de opacidad breves.
- **FR-015**: Con «reducir transparencia» activado, o sin soporte de desenfoque, toda superficie de cristal DEBE
  mostrarse sólida con un contraste igual o mejor.

**Iconografía**

- **FR-016**: El sistema DEBE usar un único conjunto de iconos coherente en trazo y estilo, con una licencia libre
  que permita su redistribución. Los iconos decorativos DEBEN quedar ocultos a las tecnologías de apoyo.

**Adaptación**

- **FR-017**: Todos los componentes y la página de muestra DEBEN funcionar desde 375 px de ancho sin desplazamiento
  horizontal, y con zoom del 200 %.

**Documentación viva y control**

- **FR-018**: DEBE existir un catálogo navegable con cada fundamento y cada componente. Para cada componente mostrará
  sus variantes, estados, uso correcto e incorrecto, notas de accesibilidad y un selector de tema.
- **FR-019**: Los textos de los componentes y del catálogo NO DEBEN ir incrustados en los propios componentes:
  DEBEN poder sustituirse para preparar la internacionalización.
- **FR-020**: DEBE existir una página de muestra que imite un paso del recorrido guiado. Combinará: indicador de
  pasos, tarjetas de opciones, campo de texto, «Modo experto» plegado, una generación simulada con la firma de la IA
  y un aviso flotante. Es para que el creador valide la estética.
- **FR-021**: DEBE existir una comprobación automática que haga fallar la verificación de calidad si un componente o
  una pantalla usa valores visuales que no salen de los tokens, o si una pantalla usa tokens primitivos.
- **FR-022**: DEBE haber pruebas automáticas de accesibilidad de cada componente en ambos temas, y una comprobación
  del contraste de los pares de color documentados.
- **FR-023**: Se usará un logotipo provisional, sustituible sin tocar los componentes.

### Key Entities

- **Token**: un valor de diseño con nombre. Tiene nivel (primitivo, semántico o de componente), categoría (color,
  espacio, tipo, radio, sombra, cristal, borde, capa, movimiento, ruptura), un valor por tema cuando aplica, una
  descripción de uso y la referencia al token del que deriva.
- **Tema**: un conjunto de valores de los tokens semánticos (oscuro o claro), más la preferencia del usuario
  (automático, claro u oscuro).
- **Componente**: una pieza de interfaz reutilizable, con variantes, estados, tokens de componente, textos
  sustituibles, notas de accesibilidad y ejemplos de uso correcto e incorrecto.
- **Pareja de contraste**: la combinación documentada de un color de primer plano con un fondo, con su ratio en
  cada tema y si está permitida.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las parejas de color documentadas para texto e iconos cumplen AA en ambos temas,
  verificado automáticamente.
- **SC-002**: Las pruebas automáticas de accesibilidad dan 0 infracciones en todos los componentes y en la página de
  muestra, en ambos temas.
- **SC-003**: El 100 % de los componentes interactivos y de la página de muestra se pueden usar de principio a fin
  solo con teclado.
- **SC-004**: Quien desarrolla puede montar una pantalla de ejemplo nueva solo con el catálogo en menos de 2 horas,
  sin escribir ningún estilo propio (0 valores visuales sueltos detectados).
- **SC-005**: A 375 px y con zoom del 200 %, la página de muestra y el catálogo no tienen desplazamiento horizontal
  ni contenido inaccesible.
- **SC-006**: Al abrir la app con el tema guardado, no se ve nunca el tema contrario durante la carga (0 destellos
  en 10 cargas consecutivas).
- **SC-007**: En la auditoría de novato sobre la página de muestra, el usuario profano identifica sin ayuda cuándo
  la IA está trabajando y completa el paso de ejemplo. El informe da 0 graves y como mucho 3 medios (constitución,
  principio IX).
- **SC-008**: El creador del producto aprueba explícitamente la estética en la página de muestra, en ambos temas y en
  móvil, antes de cerrar la feature.
- **SC-009**: Con «reducir movimiento» y «reducir transparencia» activados, no queda ninguna animación continua ni
  ninguna superficie translúcida, y no se pierde ninguna información.

## Assumptions

- **Acento de marca:** una familia coral-magenta encendida, con degradado de marca hacia violeta para la firma de
  la IA. Se aleja del rojo de YouTube y transmite energía creativa. Los valores exactos se fijan en el plan y se
  validan en la página de muestra (SC-008). Si no convence, se cambia en el nivel primitivo sin tocar nada más.
- **Tipografía:**
  - **interfaz:** una sans-serif geométrica y neutra con licencia libre, que se pueda incluir con la app sin
    depender de servicios externos (candidatas: Geist o Inter);
  - **monoespaciada:** su pareja (p. ej. Geist Mono).
- **Iconos:** candidato Lucide (licencia ISC), o equivalente de trazo uniforme.
- **Navegadores:** las dos últimas versiones de Chrome, Edge, Firefox y Safari, en escritorio y móvil.
- **Catálogo:** es una herramienta interna de desarrollo y validación. No forma parte de la app que usa el creador
  final, aunque se instale con ella o se publique aparte.
- **Página de muestra:** usa datos y generaciones simuladas. No llama a ninguna IA real.
- **Fuera de alcance:**
  - las pantallas reales de la app y la lógica de negocio;
  - la traducción de contenidos (sí la preparación: textos sustituibles);
  - el logotipo final;
  - los componentes complejos (tablas de datos, editor de guion enriquecido, calendario, gráficas), que llegarán con
    sus features.
- **Dependencia:** solo depende de la constitución v1.0.0. Las features siguientes (onboarding, canal…) dependen de
  esta.
