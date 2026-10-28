# Feature Specification: Onboarding — instalación y elección de la IA

**Feature Branch**: `002-onboarding`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Feature 002 onboarding: instalación de YTCreator y elección de la IA (Claude Code CLI con
la suscripción del creador, API de Anthropic y una opción gratuita)."

## Clarifications

### Session 2026-10-28

- Q: ¿Qué sistemas soporta la v1 en local? → A: macOS y Linux. Windows queda fuera de esta feature.
- Q: ¿La instalación en servidor entra en esta feature? → A: No. Va a una feature propia posterior; la 002 es solo
  local.
- Q: ¿Cuál es la opción gratuita? → A: Gemini con su nivel gratuito.
- Matiz del creador: la IA **por defecto** es la suscripción de Claude, pero puede ser cualquier suscripción que el
  creador ya tenga, al estilo de as-video-studio: el inicio de sesión se hace desde la propia app (sin terminal), se
  pueden tener varias cuentas en orden y se ve la salud de cada una.
- Q: ¿Qué suscripciones entran en la v1? → A: Solo la de Claude, con varias cuentas. El diseño queda abierto a otras
  suscripciones en el futuro, sin enmendar la constitución ahora.
- Q: ¿La app funciona en segundo plano o solo cuando el creador la abre? → A: Solo cuando la abre. El acceso directo
  la arranca (o la reutiliza si ya está en marcha) y abre el navegador. Sigue encendida hasta que se cierra desde la
  app o se apaga el ordenador. No arranca sola al encender el equipo.
- Q: ¿Dónde se guardan las claves y las sesiones? → A: En el llavero del sistema si existe. Si no, en un fichero que
  solo puede leer el usuario. En ambos casos, fuera de la carpeta de trabajo.
- Q: ¿La app avisa de las versiones nuevas? → A: Sí. Una vez al día consulta solo el número de la última versión, sin
  enviar ningún dato del creador, y muestra un aviso discreto con la forma de actualizar. Viene activada y se puede
  desactivar en Ajustes. Nunca se actualiza sola.

## Contexto

Es la primera experiencia del creador con YTCreator y la puerta de todo lo demás: sin la app instalada y sin una IA que
responda, ninguna fase posterior (canal, nicho, ideas, guion…) puede funcionar.

El objetivo es que **alguien que nunca ha abierto una terminal** pase de «no tengo nada» a «YTCreator está abierto y
la IA me responde» en un solo recorrido, sin gastar dinero si no quiere, entendiendo qué ha elegido y por qué
(constitución, principios I, III, IV y VII).

El recorrido tiene dos tramos:

1. **Instalar:** una sola línea en la terminal, en macOS o Linux. Al terminar, se abre la app en el navegador. Es el
   último momento en que el creador toca la terminal.
2. **Primer arranque:** un asistente de pocos pasos dentro de la app. Da la bienvenida, ayuda a elegir la IA, la
   conecta, comprueba que funciona y deja fijados unos límites de gasto razonables.

Al acabar, el creador llega a la pantalla de inicio de la app, cuya única acción principal es **crear su primer
canal**. Esa acción pertenece a la feature siguiente (canal y nicho); aquí solo se muestra la pantalla de llegada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instalar YTCreator en mi ordenador con una línea (Priority: P1)

El creador copia una línea de la portada del proyecto, la pega en la terminal y pulsa Intro. El instalador le dice en
cada momento qué está haciendo, en lenguaje llano, y cuántos pasos quedan. Solo le pide algo cuando de verdad hace
falta (por ejemplo, la contraseña del ordenador para instalar una pieza del sistema), y le explica antes qué va a ver.
Al terminar, se abre YTCreator en su navegador.

Si la instalación se corta (sin conexión, ordenador apagado…), al volver a pegar la misma línea continúa por donde iba
y no repite lo que ya estaba hecho.

**Why this priority**: Sin instalación no hay producto. Es el primer contacto y el punto donde más gente abandona.

**Independent Test**: En un equipo limpio de cada sistema soportado, pegar la línea y comprobar que acaba con la app
abierta en el navegador. Cortar la conexión a mitad, volver a pegarla y comprobar que termina sin repetir pasos.

**Acceptance Scenarios**:

1. **Given** un ordenador limpio de un sistema soportado, con conexión, **When** el creador pega la línea de
   instalación, **Then** el instalador termina sin errores y abre YTCreator en el navegador.
2. **Given** una instalación interrumpida en el paso 3 de N, **When** el creador vuelve a pegar la misma línea,
   **Then** los pasos ya hechos se marcan como hechos sin volver a hacerse y la instalación sigue desde el paso 3.
3. **Given** un paso que falla (p. ej. sin conexión), **When** el instalador se detiene, **Then** dice qué ha pasado,
   qué puede hacer el creador y que basta con volver a pegar la misma línea.
4. **Given** YTCreator recién instalado en local, **When** otro equipo de la misma red intenta abrir la app,
   **Then** no puede conectarse: la app solo atiende al propio ordenador.
5. **Given** YTCreator instalado y apagado, **When** el creador quiere abrirlo otro día, **Then** tiene un acceso
   directo evidente que lo arranca y lo abre en el navegador sin usar la terminal.
6. **Given** YTCreator ya en marcha, **When** el creador vuelve a usar el acceso directo, **Then** se abre la app en
   el navegador sin arrancar una segunda copia.
7. **Given** YTCreator en marcha, **When** el creador elige «Cerrar YTCreator» en la app, **Then** la app se apaga y
   deja de ocupar recursos hasta que se vuelva a abrir.

---

### User Story 2 - Elegir y conectar la IA en el primer arranque (Priority: P1)

La primera vez que se abre la app, aparece un asistente. La bienvenida explica en una frase qué hace YTCreator. Luego
presenta las formas de darle una IA, descritas por lo que le importan a una persona y no por su nombre técnico:

- **Usar mi suscripción** (la opción **por defecto**, ya marcada): sin coste extra, usando una suscripción que el
  creador ya paga. En la v1 es la de Claude, con una o varias cuentas. Se etiqueta «usa tu suscripción, bajo tu
  responsabilidad».
- **Pagar solo lo que uso**: con una clave de Anthropic.
- **Gratis**: con el nivel gratuito de Gemini, para probar la app de punta a punta sin pagar nada, con resultados más
  modestos.

Cada opción dice qué necesitas, cuánto cuesta y a dónde viaja tu contenido. El creador elige y sigue los pasos para
conectarla. Para la suscripción, **entra en su cuenta desde la propia app**, sin volver a la terminal: la app le da un
enlace, lo abre, aprueba el acceso y pega el código que le devuelven. Después, la app hace una **comprobación sin
coste**. Si sale bien, lo celebra y sigue. Si sale mal, explica qué ha fallado y ofrece un botón para arreglarlo.

**Why this priority**: Es el principio IV hecho experiencia. Sin una IA conectada, YTCreator no aporta nada. Junto con
la US1 forma el MVP de la feature.

**Independent Test**: Con la app instalada y sin configurar, recorrer el asistente con cada una de las tres opciones
(contra un proveedor falso determinista en los tests automáticos y contra el real en la validación manual) y llegar a
la pantalla de inicio con la IA marcada como «conectada».

**Acceptance Scenarios**:

1. **Given** una instalación sin configurar, **When** el creador abre la app, **Then** ve el asistente de primer
   arranque y no puede llegar al resto de la app sin conectar una IA (o sin elegir explícitamente «lo haré más
   tarde», que le lleva a una pantalla que solo le ofrece conectarla).
2. **Given** el paso de elección, **When** el creador mira las opciones, **Then** cada una muestra qué necesita, su
   coste y a dónde viaja su contenido, sin nombres de modelo ni jerga técnica, y «Usar mi suscripción» aparece ya
   marcada como opción por defecto.
3. **Given** que el creador elige «Usar mi suscripción» con Claude, **When** sigue el paso, **Then** entra en su
   cuenta desde la app (enlace → aprobar → pegar el código) sin abrir la terminal, y la app comprueba la sesión sola
   al terminar.
4. **Given** que el código pegado no es válido o ha caducado, **When** la app lo comprueba, **Then** lo dice en
   claro y ofrece pedir un enlace nuevo con un botón.
5. **Given** que el creador elige «Pagar solo lo que uso» y pega una clave, **When** la app la comprueba, **Then**
   dice si es válida sin gastar nada. Una vez guardada, la clave no vuelve a mostrarse entera en ningún sitio.
6. **Given** una clave no válida, sin saldo o sin permiso, **When** la app la comprueba, **Then** el error dice cuál
   de esos casos es, qué hacer y ofrece un botón para hacerlo (p. ej. «Abrir la página de claves»).
7. **Given** que el creador elige «Gratis», **When** completa el paso, **Then** puede usar la app de punta a punta sin
   introducir ningún medio de pago. La app le explica en una frase cómo conseguir el acceso gratuito, con el enlace.
8. **Given** una IA conectada, **When** termina el asistente, **Then** el creador llega a la pantalla de inicio. Su
   única acción principal es «Crear mi primer canal» y un indicador discreto muestra qué IA está en uso.
9. **Given** que el creador cierra la app a mitad del asistente, **When** la vuelve a abrir, **Then** el asistente
   sigue en el paso donde lo dejó, con lo ya hecho conservado.

---

### User Story 3 - Fijar límites de gasto antes de gastar (Priority: P2)

Si la IA elegida cobra por uso, el asistente incluye un paso que explica en una frase por qué conviene poner límites
y propone unos por defecto (por operación, por día y por mes) en euros. El creador puede aceptarlos tal cual o
cambiarlos. Si la opción elegida no cobra por uso (suscripción o gratis), el paso se sustituye por una nota que lo
explica: «Con esta opción no pagas nada extra en YTCreator».

**Why this priority**: El principio III exige límites y avisos, pero en esta feature la IA solo se usa para la
comprobación sin coste. Los límites cobran sentido en cuanto llegan las fases que generan contenido, y deben estar
fijados antes de que eso pase.

**Independent Test**: Conectar la opción de pago por uso y comprobar que el asistente propone límites, que se
guardan y que pueden cambiarse después desde Ajustes. Conectar la opción gratuita y comprobar que el paso se
sustituye por la nota.

**Acceptance Scenarios**:

1. **Given** la opción de pago por uso conectada, **When** llega el paso de límites, **Then** se proponen valores por
   defecto en euros para operación, día y mes, con una frase que explica para qué sirven.
2. **Given** los límites propuestos, **When** el creador los acepta sin tocarlos, **Then** quedan guardados y visibles
   en Ajustes.
3. **Given** un límite introducido que no es válido (negativo, vacío o un límite diario mayor que el mensual),
   **When** el creador intenta seguir, **Then** se le explica el problema junto al campo y no se guarda.
4. **Given** la opción de suscripción o la gratuita, **When** el asistente llegaría a los límites, **Then** muestra la
   nota de «sin coste extra» y deja configurar límites desde Ajustes si el creador cambia de opción.

---

### User Story 4 - Cambiar de IA o reconectarla cuando falla (Priority: P2)

Desde Ajustes → IA, el creador ve qué IA usa, su estado («conectada», «hay que volver a entrar», «sin cupo»…) y
cuándo se comprobó por última vez. Puede cambiar a otra opción con el mismo recorrido del asistente, sin perder sus
datos. Si en cualquier momento la IA deja de responder (sesión caducada, cupo agotado, servicio caído), la app lo dice
en lenguaje llano y ofrece la acción que lo resuelve.

Con la opción de suscripción, el creador puede añadir **más de una cuenta** y ordenarlas: la primera es la favorita.
Cada cuenta enseña cómo respondió la última vez («funciona», «sin cupo hasta el día X», «sesión caducada»). Esa
información sale de las llamadas reales, no de una suposición. Si la cuenta en uso agota su cupo, la app pasa a la
siguiente con sesión válida y lo dice. Si se agotan todas, se para y explica cuándo vuelve el cupo.

**Why this priority**: Las sesiones caducan, los cupos se agotan y las claves se revocan. Sin esto, el creador se
queda bloqueado la primera vez que algo cambia. Aun así, no es imprescindible para la primera demostración.

**Independent Test**: Con un proveedor falso que simula cada fallo tipado (`sin_sesion`, `cupo_agotado`,
`tiempo_agotado`, `contenido_filtrado`, `no_disponible`), comprobar que cada uno produce un mensaje distinto y
comprensible con su acción. Cambiar de opción en Ajustes y verificar que la nueva queda activa.

**Acceptance Scenarios**:

1. **Given** una IA conectada, **When** el creador abre Ajustes → IA, **Then** ve cuál es, su estado, la fecha de la
   última comprobación y un botón «Comprobar ahora» que no tiene coste.
2. **Given** que la sesión de la suscripción ha caducado, **When** la app lo detecta, **Then** muestra «Tienes que
   volver a entrar en tu cuenta de Claude» con un botón para hacerlo.
3. **Given** un cupo agotado sin otra cuenta disponible, **When** la app lo detecta, **Then** no reintenta sola:
   explica qué ha pasado, cuándo suele volver el cupo si se sabe y ofrece cambiar de opción.
4. **Given** que el creador cambia de la opción gratuita a la de pago por uso, **When** termina el recorrido,
   **Then** la nueva queda activa, se le piden los límites de gasto y sus datos siguen intactos.
5. **Given** una clave ya guardada, **When** el creador vuelve a Ajustes → IA, **Then** solo ve una referencia
   parcial (p. ej. los últimos 4 caracteres) y puede sustituirla o borrarla, nunca leerla entera.
6. **Given** dos cuentas de suscripción con sesión, **When** la favorita agota su cupo durante una operación,
   **Then** la operación sigue con la segunda, y el creador ve un aviso de qué cuenta se está usando y por qué.
7. **Given** que todas las cuentas de suscripción han agotado su cupo, **When** el creador lanza una operación,
   **Then** la app no la intenta: dice cuándo vuelve el primer cupo y ofrece cambiar de opción.
8. **Given** varias cuentas, **When** el creador cambia su orden o borra una, **Then** el cambio se aplica a la
   siguiente operación y la cuenta borrada pierde su sesión guardada en la app.

---

### User Story 5 - Actualizar sin perder nada (Priority: P3)

Para actualizar, el creador vuelve a pegar la misma línea de instalación. Se descarga la versión nueva, se adaptan
los datos si hace falta y se vuelve a abrir la app. Sus canales, ajustes y conexión con la IA siguen ahí.

**Why this priority**: Importa desde la segunda versión publicada, no para el primer uso.

**Independent Test**: Instalar una versión, crear datos de prueba y conectar una IA. Repetir la instalación con una
versión más nueva y comprobar que los datos y la conexión se conservan y que la app abre en la versión nueva.

**Acceptance Scenarios**:

1. **Given** YTCreator instalado con datos y una IA conectada, **When** se repite la instalación con una versión más
   nueva, **Then** la app abre actualizada con todos los datos y la conexión intactos.
2. **Given** que YTCreator estaba abierto durante la actualización, **When** termina, **Then** la app se reinicia sola
   en la versión nueva.
3. **Given** una actualización que falla a mitad, **When** se vuelve a intentar, **Then** termina bien y los datos del
   creador no han quedado dañados.
4. **Given** que se ha publicado una versión nueva, **When** el creador abre la app, **Then** ve un aviso discreto
   que dice que hay una versión nueva y cómo actualizar, y puede cerrarlo.
5. **Given** que el creador ha desactivado el aviso de versiones en Ajustes, **When** usa la app, **Then** la app no
   hace ninguna consulta de versiones.

---

### Edge Cases

- **Puerto ocupado:** si el puerto habitual de la app ya lo usa otro programa, el instalador o el arranque lo dicen
  con palabras llanas y lo resuelven sin que el creador tenga que saber qué es un puerto.
- **Poco espacio en disco:** antes de descargar, el instalador comprueba el espacio libre. Si no llega, avisa y
  pregunta si seguir.
- **Sin conexión durante el asistente:** la comprobación de la IA falla con el mensaje «no hay conexión a internet»,
  distinto de «la clave no vale».
- **Suscripción de Claude sin Claude Code:** si la cuenta del creador no incluye Claude Code (p. ej. el plan
  gratuito), se le dice en claro y se le ofrecen las otras opciones.
- **Claude Code no instalado:** el instalador lo deja instalado. Si falta igualmente al abrir la app (borrado a
  mano, instalación con fallo), la app lo detecta y ofrece repararlo con un botón.
- **La misma cuenta añadida dos veces:** la app la reconoce y no la duplica.
- **Linux sin entorno gráfico:** si no se puede abrir el navegador solo, el instalador dice la dirección que hay que
  abrir.
- **Opción gratuita sin cupo:** si el nivel gratuito se agota, la app no reintenta a ciegas. Explica el motivo y
  ofrece esperar o cambiar de opción.
- **Clave pegada con espacios o saltos de línea:** se limpian antes de comprobarla.
- **Dos pestañas con el asistente abierto:** terminarlo en una no deja la otra en un estado incoherente. Al seguir en
  la otra, se pasa a la pantalla de inicio.
- **Reinstalar sobre una carpeta de trabajo que no es de YTCreator:** el instalador no la pisa. Avisa y se detiene.
- **Proveedor que tarda mucho:** la comprobación tiene un tiempo máximo. Al agotarse, el fallo es `tiempo_agotado`,
  con su mensaje propio.
- **Sistema no soportado (p. ej. Windows):** el instalador lo detecta al principio, dice qué sistemas sí lo están y
  no deja nada a medias.

## Requirements *(mandatory)*

### Functional Requirements

**Instalación**

- **FR-001**: La instalación local DEBE hacerse pegando **una sola línea** en la terminal, en **macOS y Linux**. En
  cualquier otro sistema, el instalador DEBE detenerse al principio con un mensaje claro.
- **FR-002**: El instalador DEBE mostrar en cada momento el paso actual, el total de pasos y qué hace cada uno, en
  lenguaje llano.
- **FR-003**: El instalador DEBE ser **repetible y reanudable**: cada paso comprueba si ya está hecho y no lo repite.
  Repetirlo con YTCreator ya instalado equivale a actualizarlo.
- **FR-004**: Todo error del instalador DEBE decir qué ha pasado, qué puede hacer el creador y que basta con repetir
  la misma línea. Además DEBE dejar un registro legible de lo hecho, sin secretos.
- **FR-005**: El instalador DEBE instalar todo en la carpeta del usuario y pedir permisos de administrador solo cuando
  sea imprescindible, avisando antes de qué va a aparecer en pantalla.
- **FR-006**: Al terminar, el instalador DEBE abrir la app en el navegador y dejar un acceso directo para abrirla otro
  día sin usar la terminal. El acceso directo DEBE arrancar la app (o reutilizarla si ya está en marcha) y abrirla en
  el navegador. La app NO DEBE arrancar sola al encender el ordenador. Sigue encendida hasta que el creador la cierra
  desde la propia app («Cerrar YTCreator») o apaga el equipo.
- **FR-007**: La app DEBE atender solo al propio ordenador por defecto.
- **FR-008**: El instalador DEBE dejar instalado Claude Code, porque es la IA por defecto. El inicio de sesión NO
  ocurre en el instalador: se hace después, desde la app.
- **FR-009**: Actualizar DEBE conservar todos los datos del creador, sus ajustes y su conexión con la IA, y adaptar
  los datos a la versión nueva si hace falta.
- **FR-009b**: Con la app en marcha, como mucho una vez al día, la app DEBE consultar cuál es la última versión
  publicada. La consulta NO DEBE enviar ningún dato del creador ni de su uso. Si hay una versión nueva, la app DEBE
  mostrar un aviso discreto que diga cómo actualizar (repetir la línea de instalación). La consulta viene activada y
  DEBE poder desactivarse en Ajustes. La app NUNCA DEBE actualizarse sola. Si la consulta falla, no se muestra ningún
  error.

**Asistente de primer arranque**

- **FR-010**: Mientras no haya una IA conectada, la app DEBE mostrar el asistente de primer arranque, o una pantalla
  cuya única acción principal sea conectarla.
- **FR-011**: El asistente DEBE tener pocos pasos (bienvenida → elegir IA → conectarla → límites, si aplica → listo),
  con una sola acción principal por pantalla y una frase que explique por qué importa cada paso.
- **FR-012**: El asistente DEBE recordar su progreso y retomarse en el mismo paso si se cierra la app.
- **FR-013**: El paso de elección DEBE presentar las opciones de la v1 por lo que necesitan, lo que cuestan y a dónde
  viaja el contenido del creador, sin nombres de modelo ni jerga.
- **FR-014**: «Usar mi suscripción» DEBE ser la opción **por defecto**, ya marcada al llegar al paso. La elección final
  es siempre del creador.
- **FR-015**: La opción de suscripción DEBE llevar la etiqueta «usa tu suscripción, bajo tu responsabilidad». La
  v1 solo admite la suscripción de Claude. La pantalla y los datos NO DEBEN dar por hecho que es la única: añadir
  otra suscripción después debe consistir en registrar un adaptador nuevo (principio IV).
- **FR-016**: El inicio de sesión en una suscripción DEBE hacerse **desde la app, sin terminal**: la app da un enlace,
  el creador aprueba el acceso en su cuenta y pega en la app el código que recibe. La app DEBE comprobar la sesión al
  terminar y, si el código no vale o ha caducado, ofrecer un enlace nuevo.
- **FR-016b**: El creador DEBE poder añadir varias cuentas de suscripción, ordenarlas (la primera es la favorita) y
  borrarlas. Cada cuenta DEBE mostrar su último estado real («funciona», «sin cupo hasta…», «sesión caducada»),
  anotado a partir de cada llamada.
- **FR-016c**: Si la cuenta en uso agota su cupo, la operación DEBE pasar a la siguiente cuenta con sesión válida, una
  sola vez por cuenta, y avisar al creador. Un tiempo agotado NO DEBE provocar ese cambio. Si no queda ninguna cuenta
  con cupo, la app DEBE parar y decir cuándo vuelve el primero.
- **FR-017**: Para la opción de pago por uso, la app DEBE permitir pegar una clave, limpiarla de espacios, comprobarla
  sin coste y distinguir en el error entre clave no válida, sin saldo, sin permiso y sin conexión.
- **FR-018**: DEBE existir la opción **gratuita**, con el nivel gratuito de Gemini, que permita recorrer la app de
  punta a punta sin medio de pago. La app DEBE explicar cómo conseguir el acceso gratuito, con el enlace, y avisar de
  que sus resultados son más modestos y su cupo, limitado.
- **FR-019**: Toda conexión DEBE validarse con una **comprobación sin coste** antes de darse por buena. Su resultado
  se traduce a uno de los fallos tipados del principio IV o a «conectada».
- **FR-020**: Al terminar el asistente, el creador DEBE llegar a la pantalla de inicio, con «Crear mi primer canal»
  como única acción principal y un indicador discreto de la IA en uso.

**Gasto**

- **FR-021**: Si la opción conectada cobra por uso, el asistente DEBE proponer límites de gasto por defecto (por
  operación, por día y por mes) en euros y permitir aceptarlos o cambiarlos.
- **FR-022**: Los límites DEBEN validarse (positivos; diario ≤ mensual; por operación ≤ diario) y poder cambiarse
  después desde Ajustes.
- **FR-023**: Si la opción conectada no cobra por uso, la app DEBE decirlo en claro en lugar del paso de límites.
- **FR-024**: Ninguna operación de esta feature DEBE tener coste para el creador.

**Ajustes y fallos**

- **FR-025**: Ajustes → IA DEBE mostrar la opción en uso, su estado, la fecha de la última comprobación y un botón para
  comprobarla de nuevo sin coste.
- **FR-026**: El creador DEBE poder cambiar de opción desde Ajustes con el mismo recorrido del asistente, sin perder
  datos. Solo puede haber una opción activa a la vez (dentro de ella puede haber varias cuentas, según FR-016b). Las
  credenciales de las otras opciones se conservan hasta que el creador las borre.
- **FR-027**: Cada fallo tipado (`sin_sesion`, `cupo_agotado`, `tiempo_agotado`, `contenido_filtrado`,
  `no_disponible`) DEBE mostrarse con un mensaje propio, para personas, con la acción que lo resuelve. Un cupo o un
  tiempo agotado NO DEBEN reintentarse a ciegas.

**Privacidad y seguridad**

- **FR-028**: Las claves y los secretos NO DEBEN aparecer nunca en registros, en el repositorio ni en la interfaz
  después de guardarse. Como mucho se muestra una referencia parcial.
- **FR-028b**: Las claves y las sesiones DEBEN guardarse en el llavero del sistema cuando exista. Si no existe (p. ej.
  Linux sin escritorio), DEBEN guardarse en un fichero que solo pueda leer el usuario del sistema. En los dos casos,
  DEBEN quedar **fuera de la carpeta de trabajo**, de modo que copiar o exportar los datos del creador nunca arrastre
  credenciales.
- **FR-029**: El creador DEBE poder borrar una credencial guardada. Al borrarla, desaparece del llavero o del fichero
  de secretos.
- **FR-030**: Al elegir una opción en la nube, la app DEBE decir en una frase que el contenido que el creador trabaje
  se enviará a ese proveedor.
- **FR-031**: La app NO DEBE enviar telemetría ni datos de uso a nadie sin consentimiento explícito. Esta feature no
  pide ese consentimiento. La consulta de versiones de FR-009b no cuenta como telemetría porque no envía datos del
  creador.

**Lenguaje y accesibilidad**

- **FR-032**: Todos los textos del asistente, de Ajustes → IA y de los errores DEBEN pasar el test de glosario (sin
  jerga técnica) y vivir en catálogos de textos preparados para i18n.
- **FR-033**: Las pantallas de esta feature DEBEN construirse con el design system de la feature 001, funcionar a
  375 px de ancho, en tema claro y oscuro, y cumplir WCAG 2.2 AA.
- **FR-034**: Las opciones avanzadas (p. ej. un tiempo máximo distinto para las respuestas de la IA) DEBEN quedar
  plegadas tras «Modo experto». Los valores por defecto DEBEN funcionar sin tocarlas.

### Key Entities *(include if feature involves data)*

- **Instalación**: el YTCreator de un creador en su ordenador. Atributos: versión instalada, carpeta de trabajo y
  fecha de la última actualización. Hay una por equipo.
- **Estado del primer arranque**: si el asistente se ha completado y, si no, en qué paso está y qué se ha hecho ya.
- **Conexión de IA**: una opción configurada por el creador (suscripción, pago por uso o gratis). Atributos: tipo de
  opción, si es la activa, estado (conectada o uno de los fallos tipados) y fecha de la última comprobación. La de
  pago por uso y la gratuita tienen una credencial, de la que solo se muestra una referencia parcial. La de
  suscripción tiene una o varias cuentas.
- **Cuenta de suscripción**: un inicio de sesión del creador en una suscripción. Atributos: proveedor, etiqueta
  legible, posición en el orden, último estado real (con la fecha de vuelta del cupo, si se conoce) y fecha de la
  última llamada. La sesión se guarda aparte (según FR-028b) y nunca se devuelve a la interfaz.
- **Límites de gasto**: importes máximos en euros por operación, por día y por mes. Solo aplican a opciones que cobran
  por uso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En un equipo limpio de macOS y de Linux, con una conexión doméstica normal, la instalación local
  termina con la app abierta en **15 minutos o menos**, sin que el creador tenga que escribir nada aparte de la línea
  de instalación y lo que se le pida explícitamente.
- **SC-002**: Desde que se abre la app por primera vez, un creador novato conecta una IA y llega a la pantalla de
  inicio en **5 minutos o menos** con cualquiera de las tres opciones (sin contar crear cuentas en servicios
  externos).
- **SC-003**: Cortar la instalación en cualquier paso y repetirla termina siempre en una instalación correcta, sin
  rehacer los pasos ya completados (comprobado interrumpiendo en cada paso).
- **SC-004**: El recorrido completo, con cualquier opción, cuesta **0 €** al creador.
- **SC-005**: El recorrido completo con la opción gratuita no pide en ningún momento un medio de pago.
- **SC-006**: Ningún secreto aparece en registros, en el repositorio ni en la interfaz después de guardarse,
  comprobado por un test automático que busca las credenciales de prueba en todos esos sitios y en la carpeta de
  trabajo.
- **SC-007**: Cada uno de los cinco fallos tipados produce un mensaje distinto, sin jerga y con una acción. Lo
  verifican tests con un proveedor falso.
- **SC-008**: La auditoría de novato del recorrido instalación → asistente → pantalla de inicio da **0 graves y como
  mucho 3 medios**.
- **SC-009**: Una actualización conserva el 100 % de los datos, los ajustes y la conexión de IA del creador.
- **SC-010**: Las pantallas de la feature pasan las pruebas automáticas de accesibilidad sin infracciones, en tema
  claro y oscuro y a 375 px de ancho.
- **SC-011**: Después de pegar la línea de instalación, el creador no necesita volver a abrir la terminal para nada
  de esta feature, incluido el inicio de sesión en su suscripción.
- **SC-012**: Con dos cuentas de suscripción y la favorita sin cupo, el 100 % de las operaciones de prueba terminan
  con la segunda cuenta, con el aviso visible.

## Assumptions

- **Fuera de alcance (features propias posteriores):** la instalación en servidor (con identificación y conexión
  cifrada, principio VII) y el soporte de Windows. La arquitectura NO DEBE impedir ninguna de las dos.
- **Uso de varias cuentas:** las condiciones de cada suscripción son responsabilidad del creador, de ahí la etiqueta
  «bajo tu responsabilidad». La app no crea cuentas ni las comparte: solo usa las que el creador añade.
- **Binarios de otras features:** la consulta de YouTube y la transcripción de audio se instalan con el mismo
  instalador, pero en las features que las necesitan (banco de ideas y subtítulos). Esta feature deja el instalador
  preparado para añadir pasos sin rehacerlo.
- **Sin elección de modelo en la interfaz:** el creador elige una opción (suscripción, pago por uso o gratis), no un
  modelo. La app fija el modelo según el uso, como pide el principio IV.
- **Comprobación sin coste:** se da por hecho que las tres opciones permiten comprobar una credencial o sesión sin
  generar contenido facturable. Si alguna no lo permitiera, el plan DEBE proponer una alternativa que mantenga el
  coste en 0 € o avisar antes, como pide el principio III.
- **Límites por defecto:** los importes por defecto los fija el plan, con valores prudentes para un creador que empieza
  (orientativos: céntimos por operación, pocos euros al día, pocas decenas al mes).
- **Un creador por instalación:** no hay registro de usuarios ni identificación, porque la app solo atiende al propio
  ordenador.
- **Pantalla de inicio vacía:** «Crear mi primer canal» lleva a la feature siguiente. Hasta que exista, la acción
  explica que llegará pronto.
- **Desinstalar:** queda fuera de esta feature. La documentación explica qué carpetas borrar.
- **Idioma:** la interfaz va en español. Los textos del instalador también, con el mismo tono que la app.
