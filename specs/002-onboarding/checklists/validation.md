# Validación: 002 Onboarding

## Revisión visual (T164)

Fecha: 2026-10-30. La hizo el agente de implementación y la aprobó el creador el mismo día.

**Cómo:** capturas a página completa en tema claro y oscuro, a 1280 × 800 y a 375 px, de todas las pantallas de
`contracts/ui-screens.md`: bienvenida, elegir, «Conecta una IA», las tres fases de la suscripción, la clave (vacía,
rechazada y guardada), límites, listo con cada opción, inicio con el aviso de versión y con el diálogo, Ajustes (IA y
General) y el cambio de opción desde Ajustes. Se revisaron contra `checklists/design.md`.

**Fallos encontrados y corregidos:**

- **Aviso de versión estirado:** el `UpdateNotice` ocupaba la fila `1fr` de la rejilla de `.app` y llegaba a media
  pantalla. `App.module.css` pasa a una columna flex y `.main` se queda con el espacio libre.
- **Logotipo invisible:** Vite incrustaba el SVG del logotipo como `data:` y la CSP del servidor lo bloqueaba. Ahora
  `vite.config.ts` lo sirve como fichero (`assetsInlineLimit: 0`), sin relajar la CSP.
- **Cabecera a 375 px:** se salía por la derecha (lo detectó `a11y.spec.ts`, T153). Ahora las acciones pasan a la
  línea siguiente, y en pantallas estrechas «Ajustes» y «Cerrar YTCreator» muestran solo el icono, con el nombre
  accesible (decisión del creador). La cabecera queda en 2 líneas.
- **Enlace y botón en la misma fila (CHK002–CHK004):** en `LoginCodeForm`, «Abrir la página de Claude» (enlace) y
  «Pedir un enlace nuevo» (`ghost`) compartían fila y estaban desalineados. Ahora el formulario lleva una frase con el
  enlace «Volver a abrir su página», el campo del código y, en su propia línea, «Pedir un enlace nuevo» como
  `secondary`.
- **Enlaces externos (CHK005–CHK006):** `ExternalLink` añade el icono de enlace externo y el texto oculto «(se abre en
  otra pestaña)».
- **Confirmaciones de borrado:** «Borrar» dentro del diálogo pasa a `danger`.
- **Otros:** con una sola cuenta no se muestran «Subir» y «Bajar». En «Otras opciones» el estado va debajo del nombre.
  La tarjeta de cuenta del asistente lleva el icono de estado, como en Ajustes.

**Contrato:** la nueva sección «Jerarquía de acciones» de `contracts/ui-screens.md` cubre CHK001–CHK012. Define cada
variante con ejemplos, el enlace solo para salir de la app, las excepciones, el contraste de los `ghost`, qué es
«discreta», la herencia en `ChangeAi`, la remisión a `@ytcreator/ui` y qué hacer si falta una variante. «Volver» y
«Lo haré más tarde» figuran como `ghost`, que es lo que hace el código.

**Comprobación:**

- e2e de la web: 20 de 20, incluidos `a11y.spec.ts` (axe en los dos temas) y `secrets-leak.spec.ts`.
- `pnpm test`: 444 pasan y 1 se omite.
- `pnpm lint`, `pnpm typecheck` y prettier: limpios.

**Pendiente:** el creador quiere una pasada de mejora de la interfaz con el modo Design cuando termine el desarrollo.
No forma parte de 002.

## Publicación (T154)

**Hallazgo de seguridad, corregido:** la build de producción llevaba dentro el proveedor falso, con sus tokens
`sk-ant-oat-FAKE…`, su página de inicio de sesión falsa y la variable `YTCREATOR_FAKE_AI`. La causa era que
`createRegistry` tomaba `__YTC_ALLOW_FAKE_AI__` solo como valor por defecto de `allowFake`, así que el empaquetador
no podía quitar la rama. Ahora la condición comprueba también la constante, y en la build publicada esa rama es código
muerto y se elimina. En la build de producción ya no aparece ninguno de esos marcadores.

**`release.yml`:**

- se dispara con etiquetas `v*` y antes ejecuta `lint`, `typecheck` y `test`;
- compila la web y el servidor con `mode=production`;
- falla si `server.mjs` contiene el proveedor falso;
- empaqueta `ytcreator-<v>.tar.gz`, con `server.mjs`, `web/`, `bin/ytcreator` y `VERSION` en la raíz;
- genera `SHA256SUMS` (el tarball, los cuatro Node de nodejs.org e `install.sh`);
- sella `install.sh` y falla si le queda algún marcador `__…__`;
- publica el tarball, `install.sh`, `SHA256SUMS` y `VERSION`, que `version-check` lee.

**URL de descarga:** el servidor (`main.ts`) y `install.sh` apuntaban a `github.com/ytcreator/ytcreator`. Ahora apuntan
a `github.com/xavieraijon/YTCreator`, igual que la línea de instalación de `UpdateNotice`.

**Comprobación local:**

- se repitieron a mano el empaquetado y el sellado, con Node 24.22.1 y las sumas reales de nodejs.org;
- el servidor, arrancado desde el tarball descomprimido, sirve la web y `/api/health` responde con la versión `0.1.0`
  leída de `VERSION`;
- `shellcheck` pasa sobre el instalador, el lanzador y los bloques del workflow;
- `pnpm test` da 444 pasan y 1 se omite; e2e 97 (catálogo) y 20 (web); lint y typecheck limpios.

**Sin probar:** el workflow en GitHub. Se verá con la primera etiqueta.

## Glosario (T155)

`apps/web/test/glossary.test.ts` pasa (4/4): ni `es.ts`/`failures.es.ts` ni los textos visibles de `install.sh`
usan términos prohibidos ni nombres de modelo.

**Revisión a mano:** se encontró una inconsistencia de tono en `connectSubscription.reopenPage`: «Volver a abrir
su página» usaba un posesivo de tercera persona («su»), mientras el resto del glosario se dirige siempre al
creador en «tú». Se cambió a «Volver a abrir la página de Claude» (sin ambigüedad sobre a qué página se refiere)
y se actualizó la comprobación de `settings.spec.ts:88`. El resto de `es.ts`, `failures.es.ts` e `install.sh` es
coherente: tono «tú», sin jerga técnica.

## Instalador y actualización (T157)

**Cómo:** recorrido manual de §3 y §4 de `quickstart.md` contra una build de producción real (`server.mjs` +
`apps/web/dist`, empaquetados y sellados como lo hace `release.yml`), servida por HTTP local e instalada dentro de
contenedores `ubuntu:24.04` limpios con la línea real (`curl -fsSL http://host.docker.internal:<puerto>/install.sh |
bash`). Se encontraron y corrigieron tres fallos reales, ninguno relacionado con el manejo de credenciales.

**Fallo 1 — `migrate` con la ruta de `APP_HOME` equivocada:** el paso 6 ejecuta `bin/ytcreator migrate` en
`$APP_HOME/versions/<v>/bin/ytcreator` (tres niveles de profundidad) antes de que exista el enlace `current`, pero el
lanzador deducía siempre `APP_HOME` asumiendo dos niveles (`current/bin/`). Corregido con la variable de entorno
`YTC_APP_HOME`, que `install.sh` pasa solo en esa llamada del paso 6; documentado en `contracts/installer.md`
(«Lanzador `bin/ytcreator`»).

**Fallo 2 — `open`/`serve` no hacían nada, en silencio:** `cli.ts` comparaba `import.meta.url` (que Node resuelve
siguiendo enlaces simbólicos) con `process.argv[1]` tal cual se pasó en la línea de comandos. Como `bin/ytcreator`
siempre invoca el servidor a través de `current` (un enlace simbólico a `versions/<v>`), esa comparación nunca
coincidía al entrar por `current` —el camino normal de `open`/`serve`—, así que `runCli` nunca se ejecutaba: el
proceso terminaba con código 0 sin abrir nada ni escribir nada. `migrate` no se vio afectado porque el paso 6 lo
invoca directamente en `versions/<v>/bin/`, sin enlace de por medio, lo que ocultó el fallo en las pruebas
anteriores. Confirmado de forma aislada (dos scripts mínimos y dos disposiciones de enlaces) antes de tocar código.
Corregido resolviendo también `process.argv[1]` con `realpathSync` antes de comparar (`isEntryPoint()` en `cli.ts`).
`launcher.test.ts` tenía un `server.mjs` de prueba sin ninguna guarda de punto de entrada, así que no podía haber
detectado este fallo; se reescribió para que imite la guarda real y se comprobó que, con la guarda antigua, la
prueba falla.

**Fallo 3 — el paso 8 colgaba el instalador para siempre:** al arreglar el Fallo 2, `open` pasó a arrancar de
verdad un servidor que bloquea el proceso hasta que se apaga (como al abrir el acceso directo). El paso 8 lo
invocaba de forma síncrona, así que el propio `install.sh` nunca volvía a dar la terminal. Esto se desvía de
`research.md` R6 (el lanzador en bash debería arrancar el servidor desacoplado y esperar `instance.json`); la
implementación real deja esa decisión dentro de Node (`main.ts`/`instance.ts`), que nunca se desacopla a sí mismo.
Corregido en `install.sh`: el paso 8 lanza `ytcreator open` con `setsid` (o `nohup` si no existe) en segundo plano y
`disown`, en vez de esperarlo. Documentado en `contracts/installer.md`, justo después de la tabla del lanzador.
`installer/test/fixtures/make-release.ts` tenía un `bin/ytcreator` de prueba cuyo caso `open` terminaba al momento,
así que tampoco podía haber detectado este fallo; se cambió para que, como el real, no vuelva (`sleep 300` tras
imprimir la línea). Se comprobó revirtiendo el arreglo de `install.sh`: la suite entera, que con el arreglo tarda
~70 s, pasados 11 minutos seguía sin terminar (cada prueba que llega al paso 8 se queda esperando hasta el límite de
60 s de `spawnSync`), así que se dio por confirmado y se mató el proceso.

**Verificación de extremo a extremo con los tres arreglos**, en un contenedor `ubuntu:24.04` nuevo: los 8 pasos
terminan con `✓`, mensaje final «YTCreator está listo», código de salida 0 y la terminal vuelve enseguida. Dentro
del contenedor, el proceso del servidor queda vivo y desacoplado del script de instalación
(`.../current/bin/../server.mjs open`, escuchando en `127.0.0.1:4310`) y `/api/health` responde con la versión
correcta.

**Reanudación tras un corte:** cubierta por el caso ya existente en `install.test.ts`
(`resumes after an interruption at step %i`, `N` de 1 a 8), que ahora sí ejercita el bloqueo real de `open` gracias
al Fallo 3; antes de este arreglo, esas mismas pruebas habrían colgado en el paso 8 igual que el recorrido manual.
No se encontró ninguna diferencia frente a una instalación sin cortes.

**Actualización (§7):** cubierta por el caso `updates from v1 to v2 keeping data and secrets, moving current to v2
and keeping v1` de `install.test.ts`: datos y secretos de prueba intactos, `current` pasa a `v2`, `v1` se conserva y
las migraciones se aplican una sola vez.

**§8 «dos pestañas»:** no se repitió a mano; el comportamiento (instancia ya en marcha → reutilizarla y abrir una
pestaña) ya está cubierto por el e2e existente de la web, sin relación con el instalador.

**Comprobación tras los tres arreglos:** `pnpm lint` y `pnpm typecheck` limpios; `pnpm test` 447 pasan y 1 se omite
(448); `pnpm test:installer` 18/18 (~70 s, antes ~83 s); `shellcheck installer/install.sh` sin avisos.

## Ejecución completa (T156)

Todo verde: `pnpm lint` (eslint + stylelint), `pnpm typecheck` (`tsc -b`) y `pnpm format` sin cambios pendientes;
`pnpm test` 444 pasan y 1 se omite; `pnpm test:installer` 18/18; `pnpm test:e2e` 97/99 en el catálogo (2 omitidos
a propósito) y 20/20 en la web.

## Preparación de T158: `pnpm dev` escribía fuera del repo

**Hallazgo:** el servidor de desarrollo usaba las mismas rutas que una instalación real. En el Mac del creador,
`~/YTCreator` ya era una carpeta suya (un repo con enlaces a otro proyecto, sin la marca `.ytcreator`), y `pnpm dev`
dejó dentro `ytcreator.db`. El instalador real sí la protege (para con el código 20), pero el modo de desarrollo no.
Además, las pruebas de desarrollo con la IA falsa compartían `APP_HOME` con una futura instalación real.

**Corregido:** `pnpm dev` pasa `YTCREATOR_HOME=../../.dev-home` y `cli.ts` toma esa carpeta como carpeta personal,
solo en las builds de desarrollo (en la publicada la rama se elimina con `__YTC_ALLOW_FAKE_AI__`; comprobado que
`YTCREATOR_HOME` no aparece en `server.mjs` de producción). `.dev-home/` está en `.gitignore`. Con el permiso del
creador se borraron los `ytcreator.db*` que quedaron en su carpeta.

**Cómo se hace T158:** en una carpeta de pruebas que hace de carpeta personal (`HOME` apuntando a ella, con el Llavero
real enlazado y sin `~/.local/bin` en el `PATH`), instalando con la línea real contra una release local. Se comprobó
antes en una carpeta temporal: los 8 pasos con `✓`, Claude Code instalado dentro de esa carpeta y el del creador
intacto.

## Proveedores reales (T158)

**Fallo encontrado en la primera prueba de la suscripción:** el creador autorizó en claude.ai, pero la web no le
mostró ningún código para pegar. Causa: `claude setup-token` abre por su cuenta una pestaña con el flujo
automático, cuyo `redirect_uri` es `http://localhost:<puerto>/callback`, además de dar el enlace del flujo manual
(`platform.claude.com/oauth/code/callback`, el que sí muestra el código), que es el que enseña la app. Si se autoriza
en la pestaña que abrió la CLI, no aparece ningún código y la app nunca se entera de que el inicio de sesión terminó.
El spike S2 no lo vio porque se hizo desde la terminal, donde esa pestaña se confunde con la del enlace.
Confirmado con la CLI real (2.1.314): con `BROWSER` apuntando a un script que solo anota la llamada, la CLI lo
invoca con el `redirect_uri` de `localhost`.

**Corregido:** `login.ts` lanza `setup-token` con `BROWSER=true`, así la CLI no abre nada y el único enlace es el de
la app. Prueba nueva en `claude-code.contract.test.ts` (falla sin el arreglo).

**Segundo fallo, en la siguiente prueba:** con el código recién generado, la app estuvo unos 30 s «pensando» y
después respondió «El código no es válido o ha caducado». El registro solo mostraba `ai.login_failed` con
`stage: token, timedOut: true`. Causa: el adaptador escribía el código y el Enter de una vez (`código\r`). La CLI
real trata como un pegado una entrada larga que llega junta, y el Enter que viene dentro pasa a ser texto, así que
el código se escribía pero nunca se enviaba. Los códigos reales tienen unos 100 caracteres (`código#estado`). Con un
código corto inventado, la CLI sí respondía, y por eso el spike S2 no lo vio: allí el código se tecleó en la
terminal. Además, cuando la CLI rechaza un código no termina: muestra `OAuth error: …` y espera un Enter para
reintentar, así que la app agotaba siempre los 30 s.

**Corregido:**
- `login.ts` escribe el código, espera a que la pantalla lo muestre enmascarado (`*`, 2 s como máximo) y después
  envía el Enter aparte.
- Al ver `OAuth error` en la salida, responde «código no válido» al momento y lo anota en el registro con
  `rejected: true`. Es solo un indicador: la salida nunca se registra.
- Confirmado con la CLI real (2.1.314) y un código inventado de longitud real: antes, 30 s sin respuesta; ahora,
  rechazo en 0,3 s.
- La CLI falsa de los tests se comporta como la real: modo crudo, pegado enmascarado, solo un Enter suelto envía el
  código y sigue viva tras rechazarlo.
- Dos pruebas nuevas en `claude-code.contract.test.ts`: código largo y rechazo sin esperar al tiempo máximo. Las dos
  fallan sin el arreglo.

**Tercer fallo, en la siguiente prueba:** el código ya se enviaba y Claude lo aceptaba. El registro lo confirma:
`exitCode: 0, rejected: false`. Aun así, la app respondió «código no válido». Causa: el servidor instalado se arranca
sin `TERM`, y como `cleanEnv` solo pasa `PATH`, `HOME` y `LANG`, la CLI tampoco lo tenía. Sin tipo de terminal, la CLI
no pinta colores, y el analizador busca el final del token en el código que cierra su color (`ESC[39m`). El token
se creaba, pero la app no lo encontraba. El spike S2 se hizo en una terminal con colores, y la CLI falsa reproducía
siempre esa grabación. Confirmado con la CLI real (2.1.314), por el mismo camino que la app: 0 secuencias de color
sin `TERM` y 49 con `TERM=xterm-256color`.

**Corregido:**
- `login.ts` lanza `setup-token` con `TERM=xterm-256color` y `COLORTERM=truecolor`, igual que la terminal del spike.
- La CLI falsa quita los colores de la grabación cuando no recibe `TERM`. Sin el arreglo, CC4 y la prueba del código
  largo fallan como en la prueba real: la CLI termina bien y no se encuentra el token.
- El token que se creó en ese intento no se guardó en ninguna parte: la carpeta temporal del inicio de sesión se
  borra al terminar.

**Cuarto fallo, en la siguiente prueba:** con colores, la CLI terminaba bien (`exitCode: 0, rejected: false`) y en
la salida estaba el principio del token, pero la app seguía sin encontrarlo. Para averiguarlo se usó una build de
prueba con un diagnóstico enmascarado: registraba la forma de la salida alrededor del token, con el token sustituido
por su longitud. No se registró ni se copió ningún trozo del token, y el diagnóstico no se ha guardado en el repo.
Causa: en la 2.1.314, detrás del token no viene `ESC[39m`, sino directamente el color de la línea siguiente
(`<token>\r ESC[1C ESC[2B ESC[38;2;153;153;153m Store this token securely…`). La grabación del spike (2.1.312)
sí cerraba el color, y el analizador dependía de eso. Tampoco hubo copia al portapapeles (OSC 52).

**Corregido:**
- `extractToken` ya no busca un código de cierre concreto. Desde `sk-ant-oat01-`, toma caracteres del token, saltos
  de línea y movimientos del cursor, y para en la primera secuencia que no lo sea (por ejemplo, un color). Si lo
  tomado llega hasta el final de la salida, aún no lo da por bueno, porque el token podría estar a medio llegar.
- Dos pruebas nuevas en `claude-code.contract.test.ts`: la salida de la 2.1.314 sin cierre de color, que falla con
  el analizador anterior, y un token a medio llegar. La prueba con la grabación de la 2.1.312 sigue pasando.

**Quinta prueba, con los cuatro arreglos (2026-10-30, CLI 2.1.314):** la suscripción se conectó desde la app, sin
Terminal. Instalación en la carpeta de pruebas a las 14:21:11; el inicio de sesión tardó 10 s
(`ai.login_started` → `ai.login_completed`), la comprobación respondió `ok: true` y el asistente terminó a las
14:22:50, menos de 2 min desde el final de la instalación (SC-002, SC-011: ≤ 5 min). En la base de datos: una cuenta
`conectada`, la conexión `suscripcion` activa y el asistente en `completado`. Una segunda comprobación a las 14:23
también dio `ok: true`.

| Prueba de §5 | Resultado |
|---|---|
| Suscripción: conectar desde la app, sin Terminal | ✓ |
| Suscripción: código mal copiado | ✓ |
| Suscripción: añadir la misma cuenta | ✓ (alcance reducido de S3) |
| Suscripción: desinstalar Claude Code y pulsar «Reparar» | ✓ (tras dos arreglos; repetida el 2026-10-31) |
| Suscripción: sesión caducada | ✓ |
| API: clave con espacios | ✓ |
| API: sin saldo | solo el aviso ✓ (la consola pide 5 $ para crear la clave) |
| API: sin Wi-Fi | ✓ (tras un arreglo) |
| API: clave revocada | ✓ |
| README, instalador y bienvenida sin opción gratuita | pendiente |
| Consola de Anthropic: 0 € por comprobaciones | pendiente |
| §6: búsqueda de las claves reales | ✓ (0 apariciones) |

**Código mal copiado y misma cuenta (2026-10-30, desde Ajustes → «Añadir otra cuenta»):**
- Código con letras borradas: «El código no es válido o ha caducado.» al momento y enlace nuevo. En el registro,
  `ai.login_failed` con `rejected: true, timedOut: false`.
- Con el enlace nuevo y la misma suscripción, la app la añadió como «Cuenta 2», con otra huella. Es el comportamiento
  aceptado en S3 (2026-10-28): dos `setup-token` de la misma cuenta dan *tokens* distintos y Claude no dice de quién
  son, así que solo se detecta el mismo *token* pegado dos veces. La pantalla muestra el aviso
  (`sameAccountNote`). La fila de `quickstart.md` §5 aún esperaba «Esta cuenta ya está conectada»; corregida.

**Reparar Claude Code (2026-10-30):** con Claude Code apartado de la carpeta de pruebas, la comprobación dio
`programa_no_instalado` y la app ofreció «Reparar». El instalador oficial terminó bien (`exitCode: 0`, 14 s), pero la
cuenta siguió con «programa no instalado» hasta que el creador pulsó «Comprobar». Causa: al terminar, la reparación
solo olvidaba el `claude --version` guardado; el estado de las cuentas era el de la última comprobación.

**Corregido:** al terminar con código 0, el servidor vuelve a comprobar las cuentas que fallaron por
`programa_no_instalado`, sin rotar, y solo después pasa a `hecho`. La pantalla, que pregunta mientras está
`en_curso`, recibe ya las cuentas comprobadas. Si el instalador falla, las cuentas no se tocan. Dos pruebas nuevas en
`claude-repair.test.ts`; la primera falla sin el arreglo.

**Carpeta `~/YTCreator` ajena (2026-10-30, hallazgo de rebote):** al repetir «Reparar», el creador abrió la app desde el
atajo `YTCreator.app` de la carpeta de pruebas. macOS la lanzó con el HOME real, así que el servidor usó el APP_HOME
real y la carpeta `~/YTCreator` del creador, que tiene un repositorio git suyo y no tiene la marca `.ytcreator`.
Escribió ahí `ytcreator.db` sin avisar y empezó una bienvenida nueva. El instalador ya rechaza esa carpeta (paso 2,
salida 20), pero el servidor no lo comprobaba, y puede correr donde el instalador nunca ha corrido.

**Corregido:** `prepareWorkspace` hace en el servidor la misma comprobación que el paso 2: si la carpeta existe, no
está vacía y no tiene la marca, `serve`, `open` y `migrate` se paran con el mensaje del instalador y la salida 20, sin
escribir nada. Si no existe o está vacía, la crea y le pone la marca. Pruebas nuevas en `paths.test.ts`,
`main.test.ts` y `cli.test.ts`; fallan sin el arreglo.

**Reparar, segunda vuelta (2026-10-30):** con la build anterior, «Reparar» terminó bien (`exitCode: 0`) y la
comprobación posterior se hizo, pero siguió dando `programa_no_instalado` 45 ms después. Causa: el servidor buscaba la
ruta de `claude` una sola vez, al arrancar. Como Claude Code no estaba, se quedó con `claude` del PATH, que no lo
tiene, y no volvía a mirar `~/.local/bin/claude` después de instalarlo. La primera vuelta no lo destapó porque aquel
servidor había arrancado con Claude Code aún instalado.

**Corregido:** la ruta se busca en cada uso, en `claude --version`, en cada comprobación y en cada inicio de sesión.
Prueba nueva en `claude-code.contract.test.ts` (Claude Code instalado después de crear el inicio de sesión); falla sin
el arreglo.

Repetida el 2026-10-31 con la build corregida: tras «Reparar», «Cuenta 2» pasa sola a «Funciona», sin pulsar
«Comprobar» ni reiniciar el servidor.

**Sesión caducada (2026-10-31):** el token de «Cuenta 2» se cambió en el llavero por uno falso. Claude Code
respondió `401 OAuth access token is invalid` y la comprobación dio `sin_sesion`/`sesion_caducada` (`status: 401`),
con «Volver a conectar». El creador volvió a entrar con su suscripción: `ai.login_completed`, la comprobación dio bien y
«Cuenta 2» volvió a «Funciona». En la base de datos sigue habiendo dos cuentas, sin duplicados.

**API, clave con espacios (2026-10-31):** la clave pegada con espacios delante y detrás se guardó bien. La pista es
la de los últimos 4 caracteres y la clave no aparece en `server.log`.

**API sin saldo (2026-10-31):** no se puede probar de verdad, porque la consola de Anthropic pide 5 $ de saldo para
crear una clave (como en S4). Se comprobó solo el aviso previo, «Necesitas saldo en tu cuenta de Anthropic.» con «Ver
mi saldo».

**«Usar esta opción» volvía a pedir la clave (2026-10-31, hallazgo):** con la clave guardada desde «Configurar» pero
sin límites de gasto, «Usar esta opción» llevaba a `/ajustes/ia/cambiar/pago_por_uso`, que empieza por el formulario
de la clave. **Corregido:** ruta nueva `/ajustes/ia/cambiar/:kind/limites`, que abre directamente en los límites
(contrato `ui-screens.md`). Prueba e2e nueva en `settings.spec.ts`; falla sin el arreglo.

**API sin Wi-Fi (2026-10-31):** con la build corregida, «Usar esta opción» pidió solo los límites y la API quedó en
uso. Sin Wi-Fi, «Comprobar ahora» dio «No hay conexión a internet». Con Wi-Fi, se volvió a la suscripción sin
problemas. La suscripción sin Wi-Fi también dio «Sin conexión».

**API, clave revocada (2026-10-31):** el creador revocó la clave en la consola de Anthropic con la API en uso.
«Comprobar ahora» dio `sin_sesion`/`clave_no_valida` (`status: 401`). En pantalla salió «Clave no válida», el mensaje
«La clave no es válida. Revisa que la has copiado entera o crea una nueva.» y «Conseguir una clave nueva». La clave no
aparece en `server.log`.

**§6, búsqueda de secretos (2026-10-31):** se leyeron del llavero los tres secretos que guarda YTCreator: las dos cuentas
de suscripción y la clave de API, ya revocada. Se buscaron con un script que no los imprime, enteros y sin sus 4 últimos
caracteres, en:

- el APP_HOME de prueba (logs incluidos) y `~/ytc-prueba/YTCreator`;
- el APP_HOME real, que se usó por error con el `.app`;
- el repositorio, en sus ficheros y en todo el historial de git.

**Resultado:** 0 apariciones.
