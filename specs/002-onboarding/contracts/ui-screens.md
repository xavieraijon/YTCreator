# Contrato: pantallas, textos y mensajes de fallo

**Feature**: `002-onboarding` | Decisiones en [research.md](../research.md) R13, R18, R19.

Todas las pantallas usan solo componentes y tokens del design system de la 001 (`@ytcreator/ui`, FR-033), tienen
**una** acción principal (principio I), funcionan a 375 px y con zoom del 200 %, en ambos temas, y pasan axe sin
infracciones (SC-010). Todos los textos viven en `apps/web/src/strings/es.ts` y `failures.es.ts`, pasan el test de
glosario de la 001 (FR-032) y se escriben de tú.

## Rutas

| Ruta | Pantalla | Acción principal |
|---|---|---|
| `/` | Redirige según el estado (abajo) | — |
| `/bienvenida` | Welcome | «Empezar» |
| `/bienvenida/elegir` | ChooseAi | «Continuar» (con una opción elegida) |
| `/bienvenida/conectar` | ConnectSubscription · ConnectApiKey, según `chosenKind` | Depende del paso interno (abajo) |
| `/bienvenida/limites` | Limits | «Guardar límites» |
| `/bienvenida/listo` | Done | «Ir al inicio» |
| `/conectar-ia` | ConnectAi | «Conectar ahora» |
| `/inicio` | Home | «Crear mi primer canal» |
| `/ajustes` | Settings (pestañas IA y General) | — |
| `/ajustes/ia` | AiSettings | «Comprobar ahora» |
| `/ajustes/ia/cambiar/:kind` | Las mismas pantallas de conexión (y límites si hacen falta), fuera del asistente | «Usar esta opción» |
| `/ajustes/general` | GeneralSettings | — (interruptores que se guardan solos) |

**Redirección de `/` y de cualquier ruta del asistente** a partir de `GET /api/onboarding`:

- `completedAt` → `/inicio` (las rutas `/bienvenida/*` también redirigen allí);
- `postponed` → `/conectar-ia`;
- si no, `/bienvenida/<step>` (la URL siempre refleja el paso del servidor; ir a mano a otro paso redirige al real).

Al volver a la pestaña (`visibilitychange`) y tras un `409`, la web vuelve a pedir el estado y navega a él.

## Estructura común

- **Cabecera** (`AppHeader`): logotipo; `Badge` con la IA en uso («Tu suscripción de Claude», «Pago por uso de Anthropic»
  o «Sin IA conectada»); enlace a Ajustes; botón «Cerrar YTCreator», que abre un `Dialog` de
  confirmación y, tras `POST /api/app/shutdown`, muestra «YTCreator se ha cerrado. Puedes cerrar esta pestaña.»
  (FR-006). Durante el asistente solo se muestran el logotipo y «Cerrar YTCreator».
- **Progreso del asistente**: `Stepper` con 4 pasos visibles (Elegir, Conectar, Límites, Listo). Con suscripción,
  Límites aparece como «no hace falta». La bienvenida no cuenta.
- **«Lo haré más tarde»**: botón `ghost` en elegir y conectar (FR-010).
- **«Volver»**: botón `ghost` en elegir, conectar, límites y listo.
- **Aviso de versión nueva** (`UpdateNotice`): banda discreta encima del contenido, fuera del asistente, con la
  línea de instalación, un botón «Copiar» y «Cerrar». «Discreta» quiere decir: fondo `--s-color-surface-raised`,
  borde inferior sutil, la altura de su contenido (nunca estirada), «Copiar» `secondary` y «Cerrar aviso» `ghost`.
- **Trabajo de la IA**: cualquier espera de comprobación o inicio de sesión usa `AiWorking` con texto
  («Comprobando tu conexión…») y un botón «Cancelar» si la espera puede pasar de 5 s.

### Jerarquía de acciones

Cada acción usa una variante de `Button` de `@ytcreator/ui` (`primary`, `secondary`, `ghost`, `danger`) o el
`ExternalLink` de la app. Si hiciera falta otra variante, se añade a `packages/ui`; nunca se imita con CSS local.

| Variante | Cuándo | Ejemplos |
|---|---|---|
| `primary` | La acción que hace avanzar la pantalla. Una por pantalla, a la derecha de la fila de acciones (`WizardShell`, `ConnectShell`) | Empezar, Continuar, Comprobar y guardar, Guardar límites, Ir al inicio, Conectar |
| `secondary` | Hace trabajo en la pantalla sin ser la acción principal | Añadir otra cuenta, Comprobar, Sustituir, Copiar, Pedir un enlace nuevo, Usar esta opción, Configurar, el «Cancelar» de `AiWorking` |
| `ghost` | Navega o cancela sin hacer la tarea | Volver, Lo haré más tarde, Cerrar aviso, Cerrar YTCreator, el «Cancelar» de los diálogos, Borrar (abre la confirmación), Subir/Bajar |
| `danger` | Confirma algo que no se puede deshacer, solo dentro de un `Dialog` | Borrar |
| Enlace (`ExternalLink`) | Solo páginas fuera de YTCreator: abre otra pestaña, con el icono de enlace externo y el texto oculto «(se abre en otra pestaña)». Va dentro del texto o en su propia línea, nunca en una fila con botones | Ver las suscripciones de Claude, Conseguir mi clave, Volver a abrir su página |

Reglas:

- en una misma fila no conviven un enlace y un botón;
- una acción que repite otra («Pedir un enlace nuevo», que repite «Abrir la página de Claude») es `secondary` y va
  en su propia línea;
- excepciones a «enlace solo para salir»: «Abrir la página de Claude» es `primary` porque pide al servidor el
  enlace antes de abrirlo; las acciones de un `ErrorMessage` son siempre su botón, aunque lleven fuera;
- con una sola cuenta, «Subir» y «Bajar» no se muestran;
- el texto de los `ghost` y de los enlaces cumple 4.5:1 de contraste en los dos temas (lo comprueba axe en
  `a11y.spec.ts`);
- `ChangeAi` (`/ajustes/ia/cambiar/:kind`) reutiliza las pantallas de conectar y hereda estas reglas;
- los mismos nombres en el asistente y en Ajustes para la misma acción (p. ej. «Añadir otra cuenta»,
  «Comprobar»).

## Pantallas del asistente

### Welcome (FR-018)
Título, una frase sobre qué hace YTCreator y qué va a pasar ahora («Vamos a conectar una IA. Son unos minutos.»),
la nota de lo que hace falta («Necesitas una suscripción de Claude o una cuenta de Anthropic con saldo. YTCreator no
incluye una IA gratuita.»), con un enlace a los planes de Claude (`claude.ai/pricing`) y otro a la consola de
Anthropic (`console.anthropic.com`), y «Empezar».

### ChooseAi (FR-013–FR-015, FR-030)
`RadioGroup` con tarjetas, en este orden y con la primera marcada (FR-014):

| Opción | Qué dice | Etiquetas |
|---|---|---|
| **Usar mi suscripción de Claude** | Para quien ya paga Claude Pro o Max. Sin coste extra | «Recomendado», «Usa tu suscripción, bajo tu responsabilidad» (con un `Tooltip` que lo explica en una frase) |
| **Pagar solo lo que uses** | Con una clave de Anthropic; pagas por cada uso, con límites que tú pones | — |

Debajo, una línea fija: «Tus ideas y guiones se envían al servicio de IA que elijas.» (FR-030).

### ConnectSubscription (FR-016, FR-016b)
Estados internos de la pantalla:

1. **Comprobación previa**: si Claude Code no está instalado, `ErrorMessage` con «Reparar» (`POST
   /api/ai/repair-claude-code`) y `ProgressBar` indeterminada mientras está `en_curso`;
2. **Inicio**: explicación en tres pasos numerados (abrir el enlace, aprobar, copiar el código). Acción principal
   «Abrir la página de Claude» (llama a `login`, abre `url` en otra pestaña y pasa al estado 3);
3. **Pegar el código**: una frase («Claude te muestra el código al aprobar el acceso.») con el enlace «Volver a
   abrir su página», el `TextField` «Código de Claude» y, debajo, «Pedir un enlace nuevo» (`secondary`). Acción
   principal «Conectar»;
4. **Conectada**: `Card` con la cuenta («Cuenta 1 · Funciona»), botón secundario «Añadir otra cuenta» y una frase
   que explica para qué sirve («Si una se queda sin cupo, YTCreator usa la siguiente»). Acción principal
   «Continuar».

Un código no válido muestra el mensaje y vuelve al estado 2 con «Pedir un enlace nuevo» como acción principal.
Una cuenta duplicada (mismo acceso pegado dos veces): «Esta cuenta ya está conectada». Bajo la lista, una nota:
«YTCreator no puede saber si dos accesos son de la misma cuenta de Claude. Añade cada cuenta una sola vez.» (S3)

### ConnectApiKey (FR-017, FR-019)
- frase de qué es una clave y enlace «Conseguir mi clave» (consola de Anthropic, abre en otra pestaña);
- aviso: «Necesitas saldo en tu cuenta de Anthropic» con enlace a la facturación (R12);
- `TextField` de tipo contraseña «Tu clave» con botón de mostrar/ocultar y «Comprobar y guardar»;
- tras guardar: «Clave guardada ••••abcd · Funciona» y «Continuar».

### Limits (FR-021–FR-023)
Tres `TextField` en euros con dos decimales (`inputmode="decimal"`, admite coma), con los valores propuestos de R17
ya escritos y una frase por campo («Lo máximo que puede costar una sola operación»). Errores por campo
(`fields` de la API). «Guardar límites».

### Done (FR-020, FR-023)
«Todo listo», resumen de la opción elegida y, con suscripción, «Con esta opción no pagas nada extra en
YTCreator». «Ir al inicio».

## Otras pantallas

### ConnectAi — `/conectar-ia` (FR-010)
`EmptyState`: «Aún no has conectado una IA. Sin ella, YTCreator no puede ayudarte a crear.» y «Conectar ahora»
(`retomar`).

### Home — `/inicio` (FR-020)
`EmptyState` con «Crear mi primer canal» habilitado como acción principal (principio I). Al pulsarlo, un `Dialog`:
«Crear canales llegará en la próxima versión. Mientras, puedes revisar tu IA en Ajustes», con «Entendido» y
«Ir a Ajustes» (supuesto de la spec). Si no hay opción activa (p. ej. se borró la clave), encima va un `ErrorMessage` con «Conectar una IA» que
lleva a `/ajustes/ia`.

### AiSettings — `/ajustes/ia` (FR-016b, FR-025–FR-027, FR-029)
- **Opción en uso**: nombre, estado (texto + icono, nunca solo color), «Última comprobación: hace 5 minutos»,
  «Comprobar ahora». Si el resultado incluye `switched`, un `Toast`: «Cuenta 1 se ha quedado sin cupo. Ahora usas
  Cuenta 2.»;
- **Cuentas de suscripción** (si hay): lista ordenada; por cada una, nombre editable, estado, «Subir»/«Bajar»
  (botones, no arrastrar), «Comprobar» y «Borrar» (con `Dialog`). Con `sesion_caducada`, «Volver a conectar»
  (enlace + código, como al añadir; conserva nombre y posición), con el aviso «Entra con la misma cuenta de Claude:
  YTCreator no puede comprobarlo». Si el acceso ya es de otra fila (`409`): «Ese acceso ya está en otra cuenta de
  la lista.» Bajo la lista, la nota de S3 de `ConnectSubscription`. «Añadir otra cuenta» (hasta 5;
  con 5, el botón explica que es el máximo) (FR-016);
- **Claves guardadas**: «••••abcd» con «Sustituir» y «Borrar»;
- **Otras opciones**: las no activas, con «Usar esta opción» (si están conectadas) o «Configurar» (→
  `/ajustes/ia/cambiar/:kind`);
- **Límites de gasto** (`LimitsForm`) si la opción de pago por uso está configurada.

### GeneralSettings — `/ajustes/general` (FR-009b, FR-034)
- `Switch` «Avisarme cuando haya una versión nueva» con la frase «YTCreator consulta una vez al día si hay versión
  nueva. No envía nada tuyo.»;
- `Disclosure` «Modo experto»: «Tiempo máximo de espera de la IA» en segundos (10–300; vacío = el de la app).

## Estados y textos de estado

| `status` | Texto | Icono |
|---|---|---|
| `conectada` | Funciona | `check-circle` |
| `sin_comprobar` | Sin comprobar | `circle-dashed` |
| `sin_sesion` | Sesión caducada · Clave no válida · Sin permiso (según `reason`) | `alert-circle` |
| `cupo_agotado` | Sin cupo hasta el {fecha y hora} · Sin saldo | `clock` |
| `tiempo_agotado` | No respondió a tiempo | `clock` |
| `contenido_filtrado` | Respuesta bloqueada | `shield-alert` |
| `no_disponible` | Sin conexión · Servicio caído · Falta Claude Code · Llavero bloqueado | `cloud-off` |

Las fechas se formatean con `Intl.DateTimeFormat('es-ES')` en la zona horaria del navegador.

## Mensajes de fallo

`failures.es.ts` define, para cada `kind` + `reason`, **qué ha pasado**, **qué hacer** y **la acción** (FR-027,
SC-007). `AiFailureMessage` los muestra con `ErrorMessage` de la 001. Ninguna acción es «Reintentar» a ciegas.

| `kind` / `reason` | Qué ha pasado | Qué hacer | Acción |
|---|---|---|---|
| `sin_sesion` / `clave_no_valida` | La clave no es válida | Revisa que la has copiado entera o crea una nueva | «Conseguir una clave nueva» (enlace) + volver al campo |
| `sin_sesion` / `sesion_caducada` | La sesión de tu suscripción ha caducado | Vuelve a conectar la cuenta | «Volver a conectar» |
| `sin_sesion` / `sin_permiso` | Tu clave no tiene permiso para usar este servicio | Revisa los permisos de la clave en la consola | «Abrir la consola» |
| `sin_sesion` / `plan_sin_acceso` | Tu plan de Claude no incluye Claude Code | Necesitas Claude Pro o Max, o elige otra opción | «Elegir otra opción» |
| `sin_sesion` / `codigo_no_valido` | El código no es válido o ha caducado | Pide un enlace nuevo y copia el código que te dé | «Pedir un enlace nuevo» |
| `cupo_agotado` / `sin_saldo` | Tu cuenta de Anthropic no tiene saldo | Añade saldo y vuelve a comprobar | «Añadir saldo» (enlace) |
| `cupo_agotado` / `limite_de_uso` | Has llegado al límite de uso hasta el {fecha} | Espera a esa hora, añade otra cuenta o cambia de opción | «Añadir otra cuenta» o «Cambiar de opción» |
| `tiempo_agotado` / `respuesta_lenta` | La IA no ha respondido a tiempo | Puede estar saturada. Vuelve a intentarlo dentro de un rato | «Comprobar ahora» (decisión del creador, no automática) |
| `contenido_filtrado` / `rechazo_del_modelo` | La IA no ha querido responder | Cambia la petición | — (en esta feature no se da; queda el texto) |
| `no_disponible` / `sin_conexion` | No hay conexión a internet | Revisa tu conexión | «Comprobar ahora» |
| `no_disponible` / `servicio_caido` | El servicio de IA no está funcionando ahora | Suele arreglarse solo. Prueba más tarde | «Comprobar ahora» |
| `no_disponible` / `programa_no_instalado` | Falta Claude Code en tu ordenador | YTCreator puede instalarlo por ti | «Reparar» |
| `no_disponible` / `llavero_no_disponible` | No se puede abrir el llavero del sistema | Desbloquea tu sesión y vuelve a probar | «Comprobar ahora» |

Los errores de API que no son de IA (`validacion`, `conflicto`, `interno`) tienen sus propios textos en `es.ts`.

## Accesibilidad

- foco al título (`h1`) en cada cambio de pantalla; el título del documento cambia con ella;
- resultados de comprobación anunciados en una región viva (`role="status"`); fallos con `role="alert"`;
- el estado nunca se transmite solo con color;
- `Dialog` de la 001 para borrar y cerrar (foco atrapado y devuelto);
- todos los controles alcanzables y usables con teclado; orden de foco = orden visual.

## e2e (Playwright + axe)

En `apps/web/e2e/`, con `YTCREATOR_FAKE_AI`, ambos temas y 375 px:

1. `wizard-subscription`: elegir → reparar Claude Code → enlace → código → añadir segunda cuenta → listo → inicio;
2. `wizard-api-key`: clave no válida, sin conexión, válida; límites con errores y válidos;
3. `wizard-resume`: recargar en cada paso y volver al mismo (SC-003 en la app);
4. `wizard-postpone`: «Lo haré más tarde» → `/conectar-ia` → retomar;
5. `two-tabs`: avanzar en una pestaña, actuar en la otra → `409` → la otra se coloca en el paso real;
6. `failures`: cada fila de la tabla de mensajes muestra su texto y su acción (SC-007);
7. `rotation`: `cuentas:cupo,ok` → «Comprobar ahora» → aviso de cambio; `cuentas:cupo,cupo` → «Sin cupo hasta…»
   con la primera fecha y sin llamadas (SC-012);
8. `settings`: reordenar, renombrar, borrar cuenta, sustituir y borrar clave, cambiar de opción conservando la
   anterior, límites, interruptor de versiones y Modo experto;
9. `shutdown`: «Cerrar YTCreator» → confirmación → mensaje final y servidor parado;
10. `secrets-leak` ([secrets.md](./secrets.md#test-de-fuga-de-secretos-sc-006));
11. `a11y`: axe en cada pantalla y estado de error, ambos temas, 375 px y zoom 200 % (SC-010).
