# Guía de validación: onboarding

**Feature**: `002-onboarding` | **Fecha**: 2026-10-28

Cómo comprobar que la feature cumple la spec de punta a punta. No contiene código: los detalles están en
[data-model.md](./data-model.md) y en [contracts/](./contracts/).

## Requisitos

- Node 24 a través de fnm. Todos los comandos se ejecutan con el prefijo `fnm exec --using=24 --`;
- pnpm, con las dependencias instaladas (`pnpm install`);
- para las pruebas del instalador: un usuario nuevo de macOS (o una máquina virtual) y una máquina virtual de Linux
  con escritorio (Ubuntu LTS) y otra sin entorno gráfico;
- para las comprobaciones manuales: una suscripción de Claude Pro o Max, una clave de la API de Anthropic con algo
  de saldo y otra sin saldo.

## 0. Verificación previa: spikes

Antes de implementar las piezas afectadas, se cierran los spikes S1–S5 de [research.md](./research.md#spikes-verificación-antes-de-construir). Cada
uno deja su resultado anotado en `research.md`; si alguno cambia una decisión, se actualizan el plan y los
contratos antes de seguir.

| Spike | Qué confirma | Si falla |
|---|---|---|
| S1 | Los flags de `claude -p` del adaptador | Ajustar el adaptador y CC1 |
| S2 | `claude setup-token` bajo `script` da enlace y acepta el código | Plan B/C de R11 (el C rompe SC-011: hay que decidirlo con el creador) |
| S3 | De dónde sale la identidad de la cuenta | Hecho: huella = SHA-256 del *token* (alcance reducido, aceptado) |
| S4 | Si `countTokens` (gratuito) detecta la falta de saldo | Mantener solo el aviso previo de saldo de R12 (nunca una llamada de pago) |
| S5 | `node:sqlite` con el empaquetado de Vite | Cambiar el empaquetado del servidor |

## 1. Automático

```sh
fnm exec --using=24 -- pnpm lint
fnm exec --using=24 -- pnpm typecheck
fnm exec --using=24 -- pnpm test
fnm exec --using=24 -- pnpm test:e2e
```

Resultado esperado: todo en verde. Cubren, entre otros:

- batería de contrato de proveedores y tests de rotación ([ai-provider.md](./contracts/ai-provider.md#batería-de-contrato));
- `Secret`, redactor y `file-store` ([secrets.md](./contracts/secrets.md));
- rutas, guardia y `409` del servidor ([http-api.md](./contracts/http-api.md#tests-del-servidor));
- migraciones y máquina del asistente ([data-model.md](./data-model.md));
- tests del instalador en contenedor ([installer.md](./contracts/installer.md#tests-r23));
- e2e de pantallas, fallos, rotación, fuga de secretos y axe ([ui-screens.md](./contracts/ui-screens.md#e2e-playwright--axe)).

Los tests nunca llaman a una IA real: usan el proveedor falso (`YTCREATOR_FAKE_AI`).

## 2. Desarrollo local

```sh
fnm exec --using=24 -- pnpm --filter @ytcreator/server dev
fnm exec --using=24 -- pnpm --filter @ytcreator/web dev
```

Con `YTCREATOR_FAKE_AI=ok` se recorre el asistente sin cuentas reales. Probar al menos `cuentas:cupo,ok`,
`sin_sesion:clave_no_valida`, `no_disponible:sin_conexion` y `lento`.

Comprobar que el servidor escucha solo en `127.0.0.1` (`lsof -iTCP -sTCP:LISTEN | grep node`).

## 3. Instalador

Se genera una release local y se sirve con `YTCREATOR_RELEASE_BASE` apuntando a ella
([installer.md](./contracts/installer.md#variables-de-entorno)).

**macOS (usuario nuevo, sin Node ni Homebrew)**:

1. pegar la línea de instalación en Terminal y cronometrar hasta que se abre el navegador: **≤ 15 min** (SC-001);
2. comprobar el acceso directo en Aplicaciones y que abre la app con Terminal cerrado;
3. cerrar desde «Cerrar YTCreator» y volver a abrir desde el acceso directo (SC-011);
4. abrir dos veces seguidas: la segunda reutiliza la instancia en marcha.

**Linux con escritorio**: lo mismo, con el acceso directo `.desktop`.

**Linux sin entorno gráfico**: el instalador termina mostrando la dirección local en lugar de abrir el navegador, y
los secretos van a `file-store` (`0600` dentro de `0700`).

**Casos límite**: puerto ocupado (se elige otro), poco disco y el creador elige parar (código 12), sistema no
soportado (código 10), carpeta `~/YTCreator` ajena (código 20, no se toca nada).

## 4. Interrumpir en cada paso (SC-003)

- **Instalador**: con `YTCREATOR_INSTALL_FAIL_STEP=N` para cada N de 1 a 8, y además cortando a mano (Ctrl+C,
  cerrar Terminal) en dos pasos. Volver a ejecutar la línea: continúa donde se quedó y termina bien;
- **Asistente**: cerrar la pestaña y la app en cada paso y volver a abrir: aparece el mismo paso con lo ya hecho.

## 5. Con proveedores reales (manual)

Una sola vez por proveedor, antes de cerrar la feature:

| Prueba | Resultado esperado |
|---|---|
| Suscripción: conectar desde la app, sin Terminal | Cuenta «Funciona» en ≤ 5 min (SC-002, SC-011) |
| Suscripción: código mal copiado | «El código no es válido…» y enlace nuevo |
| Suscripción: añadir la misma cuenta | «Esta cuenta ya está conectada» |
| Suscripción: desinstalar Claude Code y pulsar «Reparar» | Vuelve a «Funciona» |
| API: clave con espacios al principio y al final | Se guarda y funciona |
| API: clave sin saldo | Antes de pegarla, aviso de que hace falta saldo con enlace a facturación; si S4 lo confirma, además «Tu cuenta de Anthropic no tiene saldo» al conectar (FR-017) |
| Suscripción: sesión caducada | «Volver a conectar» en esa cuenta; tras el código, vuelve a «Funciona» sin duplicarse (FR-016) |
| API: clave revocada | «La clave no es válida» |
| API: Wi-Fi apagada | «No hay conexión a internet» (no «clave no válida») |
| README, instalador y bienvenida | Los tres dicen que hace falta una suscripción de Claude o saldo en Anthropic, sin opción gratuita (FR-001b, FR-018, SC-005) |
| Consola de Anthropic tras todo el recorrido | 0 € gastados por comprobaciones (SC-004) |

## 6. Fuga de secretos (SC-006)

Además del e2e `secrets-leak`, después de las pruebas manuales buscar las claves reales (completas y sin sus 4
últimos caracteres) en `APP_HOME/logs/`, en `~/YTCreator` y en el repositorio. Resultado esperado: cero
apariciones.

## 7. Actualización (SC-009)

1. instalar la versión N y completar el asistente;
2. publicar la N+1 en la release local; al día siguiente (o forzando `last_update_check_at`) aparece el aviso;
3. copiar la línea del aviso y ejecutarla: la app arranca con la N+1, conserva conexiones, cuentas y límites, y las
   migraciones se aplican una sola vez;
4. desactivar el aviso en Ajustes General: no se hace ninguna consulta (comprobarlo con el registro de red).

## 8. Dos pestañas

Abrir la app en dos pestañas, avanzar en una y pulsar en la otra: la segunda se coloca en el paso real sin
romper nada.

## 9. Auditoría de novato (SC-008)

Una persona que no ha usado nunca YTCreator ni la terminal instala y conecta una IA sin ayuda, mientras alguien
observa y anota. Resultado esperado: **0 problemas graves** (se queda bloqueada o hace algo que no quería) y **≤ 3
medios** (duda o se equivoca y se recupera sola). Los textos se revisan con el glosario.

## Mapeo a criterios de éxito

| Criterio | Dónde se valida |
|---|---|
| SC-001 | §3, cronometrado |
| SC-002 | §5, suscripción |
| SC-003 | §4 y e2e `wizard-resume` |
| SC-004 | §5, consola de Anthropic; perfil de `comprobacion` sin coste |
| SC-005 | §5 (README, instalador y bienvenida) y §9 |
| SC-006 | §6 y e2e `secrets-leak` |
| SC-007 | e2e `failures` y §5 |
| SC-008 | §9 |
| SC-009 | §7 |
| SC-010 | e2e `a11y` |
| SC-011 | §3 y §5 (suscripción sin Terminal) |
| SC-012 | e2e `rotation` y tests R1–R6 |
