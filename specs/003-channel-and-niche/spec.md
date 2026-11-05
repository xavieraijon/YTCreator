# Feature Specification: Canal y nicho — perfil del canal, nicho y posicionamiento

**Feature Branch**: `003-channel-and-niche`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Perfil del canal, nicho y posicionamiento (alcance v1, principio VIII). Dos recorridos
guiados: canal nuevo desde cero (intereses → nichos medidos con datos reales → concepto → nombre y @) y canal que ya
existe (URL o @ → lectura de sus datos públicos → perfil actual y propuesta de posicionamiento). Datos de mercado reales
dentro de esta feature. Gestión de varios canales, estilo, voz, marca, equipo de agentes y banco de ideas, fuera."

## Clarifications

### Session 2026-10-31

- Q: ¿Los datos reales de mercado entran en esta feature o van aparte? → A: Entran en la 003. El nicho se elige con
  cifras reales, con su fuente y su fecha.
- Q: ¿Qué recorridos cubre? → A: Canal nuevo desde cero y canal que ya existe. Cambiar entre canales y archivarlos va
  al backlog.
- Q: ¿El creador puede saltarse el paso del nombre? → A: Sí. Con el concepto aprobado el perfil ya sirve para las
  fases siguientes; el nombre queda «provisional» y la pantalla de inicio recuerda elegirlo.
- Q: ¿El posicionamiento de un canal que ya existe tiene la misma forma que el perfil de uno nuevo? → A: Sí. Acaba en
  nicho + concepto (promesa, pilares, público, formato, ritmo y monetización en rangos); el perfil actual y la
  lectura del canal se guardan como contexto con sus datos.
- Q: ¿Para qué público se miden los nichos y se calcula la monetización? → A: La demanda se mide en castellano sin
  filtrar país; el creador indica su público principal (España por defecto, Latinoamérica o mixto) y los rangos de
  ingresos se ajustan a ese público.
- Q: ¿Qué pregunta la app al creador para proponer un ritmo sostenible? → A: Las horas por semana que puede dedicar y si
  quiere salir en cámara, poner solo la voz o ninguna de las dos; ambas cosas condicionan el ritmo y el formato.

## Contexto

Es la primera fase creativa de YTCreator y la base de todas las demás: las ideas, los guiones y el paquete de
publicación se escriben **para un canal concreto**, con su promesa, sus pilares y su público. Un canal sin hilo común
no crece, y un nicho elegido a ciegas puede no pagar nunca (por ejemplo, el contenido infantil cobra unas 30 veces menos
que el educativo).

El objetivo es que el creador, empiece hoy o tenga ya un canal, termine con un **perfil del canal** claro y aprobado
por él, y que entienda por qué es una buena apuesta: con cifras reales cuando las hay y con la opinión de la IA
marcada como opinión (constitución, principios I, II, III y V).

La feature empieza en la pantalla de inicio que deja el onboarding (002): si aún no hay canal, la acción principal es
«Crear mi canal», con la opción secundaria «Ya tengo un canal».

## User Scenarios & Testing *(mandatory)*

> **Nota (2026-11-04):** US1, US2 y US3 se entregaron antes de la constitución 2.1.0 y no llevan los cinco campos del
> principio XI. No se reescriben. US4 y US5 sí los llevan.

### User Story 1 - Elegir nicho con datos reales (Priority: P1)

Un creador que empieza de cero cuenta en sus palabras qué le interesa («me gustan la historia y los misterios»). La IA
le propone de 3 a 5 nichos, cada uno con una frase. La app mide cada nicho con datos públicos de YouTube y le enseña,
en lenguaje llano: cuánta gente lo busca y lo ve, si los canales pequeños consiguen visitas (la «puerta de entrada»),
si unos pocos canales se lo llevan todo y si está saturado. Cada cifra lleva su fuente y su fecha. La IA da su
recomendación, marcada como opinión, y dice con honestidad si un nicho no conviene aunque sea el que más le guste. El
creador elige uno (o pide otros con indicaciones) y, si quiere, ve 2-4 canales de referencia del nicho.

**Why this priority**: Es la decisión con más peso de todo el canal y la que más dinero o tiempo hace perder si sale
mal. Sin un nicho elegido no hay concepto, ni nombre, ni ideas. Es además la que exige el principio V: decidir con
datos y no con promesas.

**Independent Test**: Con un proveedor de IA falso y datos de YouTube grabados, un creador escribe sus intereses, ve
3-5 nichos medidos con fuente y fecha, elige uno y la app lo guarda como nicho del canal en borrador.

**Acceptance Scenarios**:

1. **Given** un creador sin canal en la pantalla de inicio, **When** pulsa «Crear mi canal» y escribe sus intereses,
   **Then** ve de 3 a 5 nichos propuestos, cada uno con una frase que lo explica.
2. **Given** los nichos propuestos, **When** la app termina de medirlos, **Then** cada nicho muestra demanda, puerta de
   entrada, concentración y saturación en lenguaje llano, con una etiqueta visible de «dato» y su fuente y fecha.
3. **Given** un nicho que no se ha podido medir (sin conexión, límite de la fuente agotado), **When** el creador lo
   mira, **Then** la app dice que no hay datos y por qué, no muestra ninguna cifra para él y ofrece reintentar.
4. **Given** los nichos medidos, **When** la IA da su recomendación, **Then** aparece marcada como «opinión de la IA»,
   separada de los datos.
5. **Given** los nichos propuestos, **When** el creador pide otros con una indicación («menos serios»), **Then** recibe
   una tanda nueva y la anterior queda guardada como versión a la que puede volver.
6. **Given** un nicho elegido, **When** el creador pide canales de referencia, **Then** ve de 2 a 4 canales reales del
   nicho con sus cifras públicas y por qué son buen ejemplo.
7. **Given** un nicho para público infantil, **When** se muestra, **Then** lleva un aviso de que YouTube paga mucho menos
   por ese contenido y limita los comentarios, con la fuente.

---

### User Story 2 - Definir el concepto del canal (Priority: P1)

Con el nicho elegido, la IA propone 2-3 conceptos de canal. Cada uno tiene una **promesa** en una frase (qué se lleva el
espectador de cada vídeo), **3-4 pilares** unidos por esa promesa, el **público**, el **formato** (vídeos largos con
Shorts como escaparate, salvo que se justifique otra cosa), un **ritmo de publicación** que se pueda mantener y la
**monetización** honesta, en rangos y con los supuestos a la vista. Cada parte explica por qué importa. El creador
elige uno, lo edita a mano o pide otros con indicaciones.

**Why this priority**: El concepto es lo que leerán todas las fases siguientes para proponer ideas y escribir guiones.
Junto con el nicho, forma el mínimo útil del perfil del canal.

**Independent Test**: Con un nicho ya elegido y un proveedor de IA falso, el creador recibe 2-3 conceptos completos,
edita la promesa de uno, lo aprueba y el perfil del canal queda con nicho y concepto.

**Acceptance Scenarios**:

1. **Given** un nicho elegido, **When** el creador pasa al concepto, **Then** ve 2-3 conceptos, cada uno con promesa,
   3-4 pilares, público, formato, ritmo y monetización.
2. **Given** un concepto, **When** el creador mira la monetización, **Then** ve rangos (nunca una cifra única), los
   supuestos que hay detrás, la fuente de los datos y los requisitos vigentes del programa de socios de YouTube.
3. **Given** un concepto, **When** el creador edita a mano cualquier parte y lo aprueba, **Then** se guarda su versión
   editada y queda registrada como versión nueva.
4. **Given** un concepto con un público infantil o un formato centrado solo en Shorts, **When** se muestra, **Then**
   lleva un aviso que explica la consecuencia para los ingresos, con la fuente.
5. **Given** un concepto aprobado, **When** el creador vuelve atrás y cambia de nicho, **Then** la app le avisa de que
   el concepto se basaba en el nicho anterior y le pide confirmación antes de proponer conceptos nuevos.

---

### User Story 3 - Elegir el nombre y la @ (Priority: P2)

La IA propone 6-8 nombres que dicen la promesa, fáciles de decir y de escribir, y el creador puede añadir los suyos. La
app comprueba cada nombre en YouTube y le pone un semáforo: **rojo** si la @ está ocupada o ya hay un canal que se
llama igual, **ámbar** si hay canales parecidos, muchos vídeos con ese nombre en el título o el nombre es demasiado
largo, y **verde** si el camino está limpio. Al elegir uno, el perfil del canal queda completo y la app le explica que
el alta en YouTube la hace él y que la @ solo se confirma al crearla.

**Why this priority**: Es importante, pero el canal puede trabajar con un nombre provisional; las fases siguientes
dependen más del concepto que del nombre.

**Independent Test**: Con un concepto aprobado, un proveedor de IA falso y respuestas de YouTube grabadas, el creador
ve 6-8 nombres con semáforo, añade uno propio, lo ve medido y lo elige.

**Acceptance Scenarios**:

1. **Given** un concepto aprobado, **When** el creador pasa al nombre, **Then** ve 6-8 nombres, cada uno con su @
   propuesta y su semáforo explicado en una frase.
2. **Given** la lista de nombres, **When** el creador escribe un nombre propio, **Then** se mide igual que los
   propuestos y la app no opina sobre él antes de tener la medida.
3. **Given** un nombre en rojo, **When** el creador intenta elegirlo, **Then** la app le explica el problema y le pide
   confirmación; no lo bloquea.
4. **Given** un nombre que no se ha podido comprobar, **When** se muestra, **Then** su semáforo es «sin comprobar»,
   nunca verde.
5. **Given** un concepto aprobado, **When** el creador elige «Decidir el nombre más tarde», **Then** el canal usa un
   nombre provisional, puede pasar a las fases siguientes y la pantalla de inicio le recuerda elegir el nombre.
6. **Given** un nombre elegido, **When** el creador termina, **Then** el perfil del canal queda completo y la pantalla
   de inicio pasa a mostrar el canal y el siguiente paso.

---

### User Story 4 - Posicionar un canal que ya existe (Priority: P2)

Un creador que ya tiene canal pega su URL o su @. La app lee los datos públicos del canal y de sus vídeos (títulos,
visitas, duración y fechas) y le enseña un resumen con cifras reales. La IA saca el **perfil actual** (nicho, pilares,
público, lo que funciona y lo que no, con los vídeos que lo demuestran) y propone **cómo posicionarlo**: la promesa, los
pilares que conviene reforzar o dejar y el ritmo. El creador lo aprueba, lo edita o pide otra propuesta.

**Why this priority**: La constitución quiere servir igual al que ya tiene canal, pero el recorrido desde cero es el
más frecuente y comparte con este casi todo el perfil, así que va después.

**Independent Test**: Con datos de un canal grabados y un proveedor de IA falso, el creador pega una @, ve el resumen
con cifras, recibe el perfil y la propuesta, edita un pilar y lo aprueba.

**Acceptance Scenarios**:

1. **Given** un creador en la pantalla de inicio, **When** pulsa «Ya tengo un canal» y pega una URL o una @ válidas,
   **Then** ve el nombre, la @ y la imagen del canal y le pide confirmar que es el suyo.
2. **Given** el canal confirmado, **When** la app termina de leerlo, **Then** muestra cuántos vídeos se han leído, las
   cifras básicas (visitas, duración media, frecuencia de publicación) y los vídeos que mejor y peor funcionan, todo
   marcado como dato con su fecha.
3. **Given** el resumen, **When** la IA propone el perfil actual y el posicionamiento, **Then** cada afirmación sobre lo
   que funciona cita los vídeos en que se basa y las opiniones van marcadas como tales.
4. **Given** una URL o una @ que no existen o no son de un canal, **When** el creador la pega, **Then** la app le dice
   qué ha pasado y qué puede pegar en su lugar, con un ejemplo.
5. **Given** un canal sin vídeos o con muy pocos, **When** se lee, **Then** la app dice que hay poca información para
   sacar conclusiones y ofrece seguir con el recorrido de canal nuevo usando lo que ya existe (nombre y @).

**Qué podrá hacer el creador**: Pegar la URL o la @ de su canal, confirmar que es el suyo, ver lo que la app ha leído y
aprobar, editar o pedir de nuevo la propuesta de posicionamiento. Necesita conexión y la IA configurada; la lectura de
datos públicos no pide clave.

**Resultado observable**: Pantalla de confirmación con nombre, @ e imagen; resumen con cifras marcadas como dato con su
fecha; perfil actual que cita vídeos, con las opiniones marcadas; al aprobar, un perfil guardado como versión 1.

**Qué debe respetar**: Principios I, II, III, IV, V y IX. El mismo `ChannelProfile` y los contratos de
`contracts/` que el recorrido de canal nuevo; yt-dlp con argumentos en lista; los cinco fallos tipados de IA. Regresión:
`channel-niche.spec.ts`, `a11y.spec.ts` y el test de glosario.

**Cómo se demuestra**: T101 a T104 con los proveedores falsos, axe a 375 y 1280 px en claro y oscuro (T123), y el
recorrido de «Independent Test». Evidencia en la sección «US4» de `checklists/validation.md`.

**Huecos abiertos**: heredados de `decisions.md`: P1, P3, P6, P7 y P17. Lo que queda para T125b: entradas 56, 57, 68, 81, 84
y 88 (las URL `/c/` y `/user/` no se reconocen: el mensaje dice qué pegar). Ajustes aún no tiene nada de YouTube (T120, US5):
«Ir a Ajustes» se ofrece junto a reintentar. El texto del perfil actual se guarda en español desde el servidor (entrada 83).

---

### User Story 5 - Ver, editar y exportar el perfil del canal (Priority: P3)

Con el perfil terminado, el creador lo ve en una sola página: nicho con sus datos, concepto, nombre y @. Puede editar
cualquier parte a mano o pedir a la IA que la regenere con indicaciones, volver a cualquier versión anterior y
exportarlo en un documento legible y en un fichero de datos abierto.

**Why this priority**: Da control y portabilidad, pero el perfil ya es útil para las fases siguientes sin esta
pantalla.

**Independent Test**: Con un perfil guardado, el creador cambia un pilar, vuelve a la versión anterior y exporta;
los ficheros exportados se leen sin la app y contienen lo mismo que la pantalla.

**Acceptance Scenarios**:

1. **Given** un perfil completo, **When** el creador abre «Mi canal», **Then** ve el nicho, el concepto, el nombre y
   la @, con los datos de mercado y su fecha.
2. **Given** el perfil, **When** edita una parte y guarda, **Then** se crea una versión nueva y puede volver a la
   anterior desde el historial.
3. **Given** el perfil, **When** pulsa «Descargar como documento» o «Descargar como datos», **Then** obtiene un
   documento legible o un fichero de datos con el mismo contenido, incluidas las fuentes y fechas de las cifras.
4. **Given** unos datos de mercado de hace más de 90 días, **When** el creador abre el perfil, **Then** ve un aviso de
   que las cifras pueden haber cambiado y la opción de volver a medir.

**Qué podrá hacer el creador**: Abrir «Mi canal» con un perfil terminado, editar o regenerar una parte, volver a una
versión anterior, descargar el perfil y gestionar YouTube y el consumo en Ajustes. Regenerar con IA necesita la IA
configurada; lo demás funciona sin conexión.

**Resultado observable**: Página con nicho, concepto, nombre y @, con datos y su fecha; una versión nueva por cada
cambio, también al restaurar; ficheros `.md` y `.json` con el mismo contenido y sus fuentes; aviso si los datos tienen
más de 90 días.

**Qué debe respetar**: Principios II, III, V, VII y IX. `Secret` y `SecretStore`: la clave de YouTube solo por su
`hint`, y nunca en base de datos, logs, URL ni Git. Regresión: los ajustes de 002 y `secrets-leak.spec.ts`.

**Cómo se demuestra**: T111 a T114, fuga de la clave (T124), axe (T123) y el recorrido de «Independent Test». Evidencia
en la sección «US5» de `checklists/validation.md`.

**Huecos abiertos**: Si la edición de un concepto necesita historial propio (ver P2 en `decisions.md`).

---

### Edge Cases

- El creador cierra la app a mitad del recorrido: al volver, retoma en el mismo paso con todo lo elegido hasta ahí.
- La IA no responde, se agota el cupo o devuelve una propuesta inválida: se reintenta una vez si procede y, si no,
  se muestra un error para personas con un botón para reintentar o volver más tarde; lo ya elegido no se pierde.
- La fuente de datos de YouTube no está disponible o limita las consultas: los nichos o nombres afectados quedan
  como «sin datos» o «sin comprobar»; el creador puede seguir y la IA no rellena cifras por su cuenta.
- Los intereses del creador son muy vagos («cualquier cosa») o están vacíos: la app le hace 2-3 preguntas sencillas
  antes de proponer nichos.
- Un nicho propuesto choca con las políticas de YouTube (contenido no auténtico, temas delicados): la propuesta lo
  avisa y explica el riesgo con la fuente.
- El creador pega la URL de un vídeo en lugar de la del canal: la app reconoce el canal del vídeo y le pregunta si es
  ese.
- El canal que ya existe tiene miles de vídeos: la app lee solo los más recientes hasta un límite y dice cuántos ha
  leído.
- El creador usa la API de pago por uso: antes de cada operación de IA ve la estimación en euros, salvo que su
  presupuesto ya la cubra; si supera un límite de gasto, la operación no se hace y se le explica.
- El creador ya tiene un canal guardado e intenta crear otro: en esta feature la app le dice que la gestión de varios
  canales llegará más adelante.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada y recorrido**

- **FR-001**: La pantalla de inicio, sin canal guardado, DEBE ofrecer «Crear mi canal» como acción principal y «Ya
  tengo un canal» como secundaria, cada una con una frase que dice qué se consigue.
- **FR-002**: El recorrido de canal nuevo DEBE tener los pasos nicho → concepto → nombre, mostrar en qué paso está el
  creador y permitir volver a un paso anterior.
- **FR-003**: El progreso del recorrido DEBE guardarse en cada paso y retomarse en el mismo punto al volver a la app.
- **FR-004**: Cada paso DEBE explicar en una o dos frases por qué importa, en lenguaje llano y sin jerga.

**Nicho y datos de mercado**

- **FR-005**: El sistema DEBE pedir los intereses del creador en texto libre y, si son insuficientes, hacer como
  máximo 3 preguntas sencillas antes de proponer.
- **FR-006**: La IA DEBE proponer de 3 a 5 nichos, cada uno con una frase de explicación y las búsquedas que lo
  representan.
- **FR-007**: El sistema DEBE medir cada nicho con datos públicos reales de YouTube y mostrar al menos: demanda
  (visitas de los vídeos que salen para esas búsquedas), puerta de entrada (cuántos canales de menos de 200.000
  suscriptores consiguen bastantes más visitas que suscriptores), concentración (qué parte de las visitas se llevan
  los canales más grandes) y saturación (cuántos vídeos recientes compiten).
- **FR-007b**: Esas medidas y el veredicto DEBEN calcularse solo con vídeos largos, sin mezclar Shorts. Los Shorts que
  salgan en las búsquedas DEBEN mostrarse como cifra aparte, sin nivel y sin influir en el veredicto.
- **FR-008**: Cada cifra mostrada DEBE llevar su fuente y la fecha en que se obtuvo, y distinguirse visualmente de la
  opinión de la IA.
- **FR-009**: Si un nicho no se puede medir, el sistema DEBE decirlo, explicar la causa y no mostrar cifras para él;
  la IA NO DEBE dar cifras de mercado que no vengan de una medida.
- **FR-010**: La IA DEBE dar una recomendación entre los nichos basada en las medidas, marcada como opinión, y decir
  cuándo un nicho no conviene.
- **FR-011**: El creador DEBE poder elegir un nicho, pedir otra tanda con indicaciones o escribir un nicho propio, que
  se mide igual.
- **FR-012**: Para el nicho elegido, el sistema DEBE poder mostrar de 2 a 4 canales de referencia reales con sus cifras
  públicas y el motivo de cada uno, incluido su mejor vídeo comparado con lo normal en ese canal cuando se pueda
  calcular.

**Concepto**

- **FR-012b**: Antes de proponer conceptos o el posicionamiento de un canal que ya existe, el sistema DEBE preguntar cuántas horas por semana puede dedicar el creador
  y si quiere salir en cámara, poner solo la voz o ninguna de las dos; el ritmo y el formato propuestos DEBEN encajar
  con esas respuestas. Excepción aceptada por el creador (`decisions.md`, entrada 31): si elige un concepto escrito con
  otras respuestas, tras el aviso, el perfil puede guardar el ritmo y el formato de ese concepto.
- **FR-013**: La IA DEBE proponer de 2 a 3 conceptos con promesa (una frase), 3-4 pilares, público, formato, ritmo de
  publicación y monetización.
- **FR-014**: La monetización DEBE expresarse en rangos con sus supuestos visibles, basarse en el conocimiento
  versionado de la app (requisitos del programa de socios, ingresos por nicho) y citar su fuente y fecha.
- **FR-014b**: El sistema DEBE pedir el público principal del canal (España por defecto, Latinoamérica o mixto) y
  ajustar a él los rangos de monetización; la demanda se mide en el idioma del canal sin filtrar por país.
- **FR-015**: El sistema DEBE avisar, con la fuente, cuando el público sea infantil, cuando el formato se apoye solo en
  Shorts o cuando el concepto roce las políticas de contenido no auténtico.

**Nombre**

- **FR-016**: La IA DEBE proponer de 6 a 8 nombres con su @, y el creador DEBE poder añadir nombres propios.
- **FR-017**: El sistema DEBE comprobar cada nombre en YouTube y asignarle un semáforo: rojo (@ ocupada o canal con el
  mismo nombre), ámbar (canales parecidos, 3 o más vídeos con el nombre en el título, o más de 30 letras), verde
  (ninguna de las anteriores) o «sin comprobar» si la comprobación falla.
- **FR-018**: El sistema DEBE explicar el semáforo de cada nombre en una frase y avisar de que la @ solo se confirma al
  crearla en YouTube; elegir un nombre en rojo DEBE pedir confirmación, no estar prohibido.
- **FR-018b**: El creador DEBE poder dejar el nombre para más tarde: el perfil con nicho y concepto aprobados ya sirve
  para las fases siguientes, el nombre se marca como provisional y la pantalla de inicio recuerda elegirlo.

**Canal que ya existe**

- **FR-019**: El sistema DEBE aceptar la URL de un canal, su @ o la URL de uno de sus vídeos, reconocer el canal y
  pedir al creador que confirme que es el suyo.
- **FR-020**: El sistema DEBE leer los datos públicos del canal y de hasta sus 200 vídeos más recientes (título,
  visitas, duración, fecha) y mostrar un resumen con cifras marcadas como dato y con fecha.
- **FR-020b**: El resumen DEBE separar vídeos largos y Shorts, y elegir los mejores y peores vídeos comparando cada uno
  con lo normal en el canal para su formato, no por visitas totales. Un vídeo publicado hace menos de 30 días no DEBE
  contar entre los peores.
- **FR-021**: La IA DEBE proponer el perfil actual (nicho, pilares, público, lo que funciona y lo que no) y una
  propuesta de posicionamiento; cada afirmación sobre lo que funciona DEBE citar los vídeos en que se basa.
- **FR-021b**: El posicionamiento aprobado DEBE tener la misma forma que el perfil de un canal nuevo (nicho y concepto
  completos, con la monetización en rangos de FR-014), para que las fases siguientes lean siempre el mismo perfil; el
  perfil actual y la lectura del canal se conservan como contexto.
- **FR-022**: Con menos de 5 vídeos, el sistema DEBE avisar de que hay poca información y ofrecer el recorrido de canal
  nuevo conservando el nombre y la @ existentes.

**Propuestas, versiones y perfil**

- **FR-023**: Toda propuesta de la IA (nichos, conceptos, nombres, perfil actual, posicionamiento) DEBE poder
  aprobarse, editarse a mano o regenerarse con indicaciones.
- **FR-024**: Cada cambio aprobado del perfil, de la IA o a mano, DEBE guardarse como versión, y el creador DEBE
  poder volver a cualquier versión anterior.
- **FR-025**: Cambiar el nicho con un concepto ya aprobado DEBE avisar de que el concepto se basaba en el nicho
  anterior y pedir confirmación.
- **FR-026**: El perfil del canal DEBE poder verse en una sola página y exportarse como documento legible y como
  fichero de datos abierto, ambos con las fuentes y fechas de las cifras.
- **FR-027**: Si los datos de mercado del perfil tienen más de 90 días, el sistema DEBE avisarlo y ofrecer volver a
  medir.
- **FR-028**: El modelo de datos DEBE admitir varios canales por instalación, aunque esta feature solo permita crear
  uno.

**Coste, conocimiento y seguridad**

- **FR-029**: Antes de cada operación de IA con coste, el sistema DEBE mostrar una estimación en euros y pedir
  confirmación, salvo que el presupuesto fijado la cubra, y respetar los límites de gasto del onboarding.
- **FR-030**: Las consultas de datos de YouTube NO DEBEN tener coste para el creador; si la fuente limita las
  consultas diarias, el sistema DEBE avisar antes de agotar el límite.
- **FR-031**: El saber de YouTube que usa esta fase (programa de socios, ingresos por nicho, contenido infantil,
  contenido no auténtico, Shorts) DEBE vivir en un paquete de conocimiento versionado con fuente y fecha de revisión.
- **FR-032**: Los textos que genere la IA para el creador DEBEN pasar las reglas de escritura humana del conocimiento
  versionado.
- **FR-033**: Si alguna fuente de datos necesita una clave, la clave NO DEBE aparecer en logs, en Git ni en la
  interfaz después de guardarse, y lo básico DEBE funcionar sin ella.
- **FR-034**: Los textos de todas las pantallas de esta feature DEBEN pasar el test de glosario.

### Key Entities

- **Canal**: el canal del creador. Origen (nuevo o existente), idioma, público principal, horas por semana, presencia
  (cámara, solo voz o ninguna), estado del recorrido, paso actual, nombre (definitivo o provisional), @, enlace al
  canal de YouTube si ya existe. Una instalación puede tener varios.
- **Perfil del canal**: lo aprobado sobre el canal: nicho, concepto y nombre, con la misma forma venga de un canal
  nuevo o de uno que ya existía (en ese caso, con el perfil actual y la lectura como contexto). Tiene un historial de
  versiones.
- **Versión del perfil**: copia fechada del perfil con su origen (propuesta de la IA, edición a mano, vuelta atrás).
- **Propuesta**: una tanda generada por la IA para un paso (nichos, conceptos, nombres, perfil actual), con las
  indicaciones que la pidieron y su fecha. Las tandas anteriores se conservan.
- **Nicho**: tema con su frase, sus búsquedas representativas y su medida de mercado.
- **Medida de mercado**: cifras de demanda, puerta de entrada, concentración y saturación de un nicho, con fuente,
  fecha y estado (medida, sin datos, error).
- **Canal de referencia**: canal real de YouTube asociado a un nicho, con sus cifras públicas y el motivo.
- **Concepto**: promesa, pilares, público, formato, ritmo, monetización en rangos y avisos.
- **Comprobación de nombre**: nombre, @, semáforo, motivo y fecha de la comprobación.
- **Lectura de canal existente**: datos públicos del canal y de sus vídeos leídos, con fecha y número de vídeos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un creador sin experiencia termina el recorrido de canal nuevo (nicho, concepto y nombre) en menos de
  20 minutos, sin contar la espera de la IA y de las medidas.
- **SC-002**: El 100 % de las cifras de mercado que se muestran llevan fuente y fecha; ninguna cifra procede solo de la
  IA (comprobable con un proveedor falso que inventa cifras: no deben aparecer en pantalla).
- **SC-003**: Las medidas de los nichos de una tanda están listas en menos de 2 minutos en una conexión doméstica
  normal.
- **SC-004**: En una prueba con nombres de canales conocidos, el semáforo marca rojo en el 100 % de los casos en que la
  @ está ocupada.
- **SC-005**: El recorrido de canal existente muestra el resumen con cifras en menos de 1 minuto para un canal de hasta
  200 vídeos.
- **SC-006**: Cerrar la app en cualquier paso y volver la deja en el mismo paso, sin perder nada aprobado, en el 100 %
  de los casos probados.
- **SC-007**: Los ficheros exportados se abren y se entienden sin la app y contienen todo lo que muestra la página del
  perfil.
- **SC-008**: La auditoría de novato de esta feature da 0 graves y como mucho 3 medios.
- **SC-009**: Con la suscripción de Claude, el recorrido completo no cuesta nada adicional; con la API, ninguna
  operación con coste se ejecuta sin estimación previa o presupuesto que la cubra.

## Assumptions

- El onboarding (002) está completo: hay una IA conectada y unos límites de gasto fijados.
- Los datos de mercado se obtienen de fuentes públicas de YouTube **sin que el creador tenga que crear ninguna cuenta
  ni clave**. Una clave propia de la API de datos de YouTube puede añadirse en «Modo experto» para medir más rápido o
  con más volumen. Qué fuente se usa en cada caso se decide en el plan.
- La medida de un nicho usa de 2 a 4 búsquedas representativas y los primeros resultados de cada una; los umbrales
  exactos de cada indicador se fijan en el plan y viven en el conocimiento versionado.
- Las cifras de ingresos en castellano tienen poca base con método; se usan escenarios prudentes en rangos y se dice
  la confianza de cada uno.
- La app no crea el canal en YouTube ni publica nada: el alta la hace el creador en YouTube Studio.
- Solo se lee información pública: la app no se conecta a la cuenta de YouTube del creador ni lee sus estadísticas
  privadas.
- El idioma por defecto del canal es el castellano; el mercado se mide en ese idioma, sin filtrar por país, salvo que
  el creador indique otro. El público principal (España, Latinoamérica o mixto) solo cambia los rangos de ingresos.
- Fuera de esta feature: gestionar varios canales (cambiar y archivar), estilo visual, voz, música, marca gráfica,
  equipo de agentes y banco de ideas.
