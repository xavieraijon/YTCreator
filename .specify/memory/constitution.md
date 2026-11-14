<!--
Sync Impact Report
- Versión: 2.1.0 → 2.1.1 (PATCH: aclaración de redacción)
- Principios modificados: IV. La IA, detrás de un puerto. Se quita el plan de otros proveedores (el primero era
  Gemini con Google AI Pro): por ahora solo Claude. La regla de añadir un proveedor con un adaptador se mantiene.
- Secciones añadidas o retiradas: ninguna
- Plantillas: ninguna cambia
- Afecta a: nada entregado; la 002 ya dejaba otros proveedores fuera de la v1.
- TODOs: ninguno
-->

# Constitución de YTCreator

YTCreator es un **productor de YouTube con IA**, autoalojado: un agente experto que acompaña al creador paso a paso
desde la idea hasta el paquete listo para publicar, y le quita de encima el trabajo tedioso. Sirve igual al que empieza
hoy y al que ya tiene un canal.

Esta constitución define lo que **no se negocia**. Las specs, los planes y el código se someten a ella. Las palabras
**DEBE** / **NO DEBE** son obligatorias; **DEBERÍA** admite excepciones justificadas por escrito en el plan.

## Principios fundamentales

### I. Un niño lo entiende, el experto lo encuentra

- Cada pantalla DEBE tener **una sola acción principal** evidente y decir en una frase qué se consigue con ella.
- La interfaz NO DEBE mostrar jerga técnica (rutas, JSON, tokens, nombres de modelo, códigos HTTP). Un **test de
  glosario** automatizado DEBE fallar si aparece una palabra prohibida en los textos de la interfaz.
- Las opciones avanzadas DEBEN existir, pero plegadas tras **«Modo experto»** o «Más opciones». Lo básico NUNCA
  depende de ellas: los valores por defecto DEBEN dar un buen resultado sin tocar nada.
- Cada paso guiado DEBE explicar **por qué** importa («un buen gancho retiene a la gente en los 30 primeros
  segundos»). El usuario aprende YouTube mientras lo usa.
- Los errores DEBEN estar escritos para personas: qué ha pasado, qué puede hacer y un botón para hacerlo.

### II. La IA propone, el creador decide

- Cada fase (nicho, ideas, guion, escaleta, paquete de publicación…) DEBE producir una **propuesta** que el
  creador puede **aprobar, editar o regenerar** con indicaciones.
- Todo lo que genere la IA DEBE poder editarse a mano y DEBE quedar **versionado**: se puede volver a cualquier
  versión anterior.
- Ninguna acción con efectos fuera de la app (publicar, subir, enviar) DEBE ocurrir sin una acción explícita del
  creador.
- La app DEBE distinguir de forma visible lo que es **dato** (medido, con fuente) de lo que es **opinión o
  estimación** de la IA.

### III. Nunca se gasta sin avisar

- Antes de cualquier operación con coste, la app DEBE mostrar una **estimación en euros** y pedir confirmación,
  salvo que el creador haya fijado antes un presupuesto que la cubra.
- DEBE haber límites de gasto (por operación, por día y por mes) y un registro del consumo real, legible por
  personas.
- DEBE existir siempre un camino **sin coste adicional** para usar la app de punta a punta: la suscripción de IA
  que el creador ya paga. La app da por hecho que el creador tiene una suscripción o una cuenta de pago por uso, y
  lo DEBE decir antes de instalar y al empezar.

### IV. La IA, detrás de un puerto

- El dominio NO DEBE importar ningún SDK ni CLI de IA. Toda llamada pasa por un **puerto** (`AiProvider`) con
  capacidades declaradas (texto, salida estructurada, streaming, visión…).
- Adaptadores de la v1:
  - **Claude Code CLI**, con la suscripción del creador. Se etiqueta como «usa tu suscripción, bajo tu
    responsabilidad».
  - **API de Anthropic**, la vía recomendada en un VPS.

  La v1 NO incluye ninguna opción gratuita. Por ahora solo se usa Claude: no hay otros proveedores previstos.

  Añadir un proveedor DEBE consistir en escribir un adaptador y registrarlo, sin tocar el dominio.
- Los prompts DEBEN vivir en ficheros versionados, separados del código, y ser **agnósticos del modelo**: nada
  que solo funcione con un proveedor concreto.
- Toda salida estructurada DEBE validarse con un esquema (Zod). Una salida inválida se reintenta una vez y, si
  vuelve a fallar, se muestra como error amable.
- Los fallos DEBEN tiparse: `sin_sesion`, `cupo_agotado`, `tiempo_agotado`, `contenido_filtrado` y
  `no_disponible`. Un cupo o un tiempo agotado NO DEBEN reintentarse a ciegas.
- Cada llamada DEBE fijar de forma explícita el modelo y los parámetros según el **uso** que se le pide
  (`redaccion`, `analisis`, `sugerencia`…), nunca según el entorno.

### V. El conocimiento experto es un activo versionado

- El saber de YouTube (ganchos, retención, títulos, miniaturas, SEO, monetización, políticas) DEBE vivir en
  **paquetes de conocimiento** versionados, con fuente y fecha de revisión. NO DEBE quedar repartido por los prompts.
- Las afirmaciones sobre el mercado (saturación de un tema, competencia, tendencias) DEBEN basarse en **datos
  reales obtenidos** (YouTube Data API, yt-dlp) y citar su origen y su fecha. Si no hay datos, la app lo dice: la
  IA NO DEBE inventar cifras.
- Los textos generados DEBEN pasar por las reglas de **escritura humana** (sin muletillas de IA, ritmo hablado,
  español natural). Esas reglas forman parte del conocimiento versionado.

### VI. Design system propio, los tokens primero

- NO DEBE usarse ningún framework de componentes con estilos propios (Material, PrimeNG, Bootstrap, Chakra,
  MUI…). Se permiten **primitivas headless sin estilos** (p. ej. Radix o Ark) solo para la accesibilidad y el
  comportamiento.
- Todo valor visual (color, espacio, tipografía, radio, sombra, movimiento, capa) DEBE salir de **tokens**:
  primitivos → semánticos → de componente, publicados como CSS custom properties. Un linter DEBE impedir valores
  sueltos en los estilos de los componentes.
- Los estilos DEBEN organizarse con `@layer` (reset, tokens, base, componentes, utilidades) y CSS Modules por
  componente. Nada de estilos globales improvisados.
- Tema **claro y oscuro** desde el día 1. El movimiento DEBE respetar `prefers-reduced-motion`.
- Accesibilidad **WCAG 2.2 AA** como mínimo: navegable con teclado, foco visible, nombres accesibles y
  contraste comprobado en ambos temas.
- Cada componente del design system DEBE tener documentación viva (estados, variantes, uso correcto e
  incorrecto) antes de usarse en una pantalla.
- Diseño **mobile-first**: toda pantalla DEBE funcionar a 375 px de ancho.

### VII. Tuyo, local y portable

- La app es **autoalojada**: en local o en un VPS. Cada instalación es de **un creador con varios canales**.
- Los datos del creador DEBEN quedarse en su máquina y poder **exportarse** en formatos abiertos (Markdown y JSON),
  legibles sin la app.
- Las claves y los secretos NO DEBEN aparecer nunca en logs, en Git ni en la interfaz después de guardarse.
- Expuesta en un VPS, la app DEBE exigir autenticación y HTTPS. En local DEBE escuchar solo en `127.0.0.1`
  por defecto.
- Sin telemetría salvo consentimiento explícito.
- La instalación DEBE ser de **un solo paso** (una línea en local, `docker compose up` en un VPS), repetible y
  capaz de retomarse si se interrumpe.

### VIII. Alcance disciplinado

- **Alcance v1:** de la idea al paquete listo para publicar. Incluye onboarding, perfil del canal, nicho y
  posicionamiento, banco de ideas con detección de temas quemados, guion y escaleta (vídeo largo y Short),
  paquete de publicación (títulos, brief de miniatura, descripción, capítulos, etiquetas) y subtítulos a partir
  del audio o vídeo del creador.
- **Fuera de la v1:** síntesis de voz, generación de imágenes y vídeo, montaje y subida automática a YouTube. La
  arquitectura DEBE permitir añadirlos como nuevas capacidades del puerto, pero NO DEBEN construirse sin una
  enmienda del alcance.
- **Sin spec no hay código.** Toda funcionalidad nace como spec aprobada. Lo que aparezca a mitad de trabajo se
  apunta en el backlog y no se hace en esa feature.

### IX. Calidad verificable

- La lógica de dominio DEBE tener tests unitarios, escritos antes o junto al código.
- Cada adaptador de IA DEBE pasar la misma **batería de contrato**. Los tests nunca llaman a una IA real: usan un
  proveedor falso determinista.
- Los recorridos principales de la v1 DEBEN tener tests end-to-end (Playwright) y pruebas automáticas de
  accesibilidad (axe), en los temas claro y oscuro.
- **Auditoría de novato:** antes de cerrar una feature con interfaz, un agente que hace de usuario profano la
  recorre. Para cerrarla, su informe DEBE dar **0 graves y como mucho 3 medios**.
- El aspecto (`lint`, `typecheck`, `test`) DEBE estar en verde para integrar en `main`.

### X. Simple antes que listo

- Se elige siempre la solución más simple que cumpla la spec (YAGNI). Toda abstracción DEBE justificarse con un
  caso de uso real de la v1. La excepción es el puerto de IA, que exige el principio IV.
- Cada dependencia nueva DEBE justificarse en el plan: qué resuelve, alternativa sin ella y coste de
  mantenimiento.
- Los documentos de contexto para agentes (`CLAUDE.md` y similares) DEBEN ser **cortos** y remitir a las specs.
  La verdad vive en las specs y en esta constitución, no en planes que se reescriben.

### XI. Autonomía demostrada

Una tarea o historia no está terminada porque pasen los tests, sino cuando el agente puede enseñar qué requisito cumple,
cómo lo comprobó, con qué evidencia y qué queda pendiente. La revisión independiente ocurre dentro de la implementación,
no solo al final. La atención del creador se concentra según riesgo y decisiones pendientes.

- Cada historia de una spec DEBE decir qué podrá hacer el creador, su resultado observable, qué debe respetar, cómo se
  demuestra y qué huecos deja abiertos.
- Cada fase o historia DEBE cerrar con una **Puerta A**, con revisores independientes de contexto limpio.
- Un control que no se ejecutó DEBE constar como no ejecutado. NUNCA se presenta como pasado.
- Lo que la spec no decide NO DEBE rellenarse por suposición: se registra en `decisions.md` de la feature y se decide
  según la matriz de riesgo (`.specify/memory/riesgo.md`).

## Restricciones técnicas

- **Lenguaje:** TypeScript en modo `strict` en todo el monorepo.
- **Estructura:** monorepo con pnpm workspaces:
  - `apps/web`: React + Vite.
  - `apps/server`: Node + Hono.
  - `packages/ui`: design system.
  - `packages/tokens`: tokens del design system.
  - `packages/core`: dominio y puertos.
  - `packages/ai`: adaptadores de IA.
  - `packages/knowledge`: paquetes de conocimiento y prompts.
- **Datos:** SQLite con migraciones versionadas. Los ficheros del creador se guardan en una carpeta de trabajo
  propia.
- **Contratos:** esquemas Zod compartidos entre cliente y servidor. Ningún tipo de API se duplica a mano.
- **Binarios externos:** `yt-dlp` y `whisper.cpp`. Se invocan solo a través de adaptadores, nunca desde el dominio.
- **Runtime:** Node LTS activa.
- **Idioma:** la interfaz va en español primero, preparada para i18n desde el día 1 (todo texto en catálogos,
  ninguno incrustado en componentes). El código y sus identificadores, en inglés. Las specs y la documentación
  para el usuario, en español.

## Flujo de desarrollo

1. `/speckit-constitution` → esta constitución.
2. Por cada feature:
   1. `/speckit-specify`: qué y por qué, sin el cómo.
   2. `/speckit-clarify`: dudas resueltas.
   3. `/speckit-plan`: el cómo, con un **Constitution Check** que verifica cada principio.
   4. `/speckit-tasks`, `/speckit-analyze` y luego `/speckit-implement`.
3. Una rama por feature (`NNN-nombre-corto`) y commits convencionales.
4. Una feature se cierra cuando:
   - sus criterios de aceptación pasan;
   - los checks están en verde;
   - la auditoría de novato está superada (si tiene interfaz);
   - la documentación de usuario está al día.
   - la Puerta A de cada fase está pasada, `decisions.md` no tiene pendientes sin resolver y
     `checklists/validation.md` tiene la evidencia, sin hallazgos graves abiertos.

## Gobierno

- Esta constitución **prevalece** sobre cualquier spec, plan, tarea o costumbre. Un plan que viole un principio
  DEBE justificarlo en su tabla de «Complexity Tracking» o cambiarse.
- Las enmiendas se proponen por escrito con su motivo y su impacto, actualizan el Sync Impact Report y suben la
  versión:
  - **MAJOR**: se elimina o redefine un principio, o cambia el alcance de la v1.
  - **MINOR**: se añade un principio o una sección.
  - **PATCH**: aclaraciones de redacción.
- Cada revisión de código DEBE comprobar el cumplimiento de la constitución.

**Versión**: 2.1.1 | **Ratificada**: 2026-10-26 | **Última enmienda**: 2026-11-14
