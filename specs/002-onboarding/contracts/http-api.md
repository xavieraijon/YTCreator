# Contrato: API HTTP local

**Feature**: `002-onboarding` | Decisiones en [research.md](../research.md) R4, R5, R12–R14, R17, R18, R20.

Servidor Hono en `http://127.0.0.1:<puerto>`. Todas las rutas bajo `/api`; cualquier otra ruta `GET` devuelve la SPA
(`index.html`) o un fichero estático de `web/`. Los esquemas Zod de cuerpos y respuestas viven en
`packages/core/src/api/` y se exportan como `@ytcreator/core/api`: la web y el servidor validan con los mismos.

## Reglas generales

- **Guardia** (R5): `Host` local; `Origin` local en `POST`/`PUT`/`PATCH`/`DELETE`; cuerpo `application/json`. Si
  no se cumple: `403` con `{error: {code: 'prohibido'}}`.
- **Sin textos para personas**: el servidor devuelve códigos (`kind`, `reason`, `code`, `fields`); la web los
  traduce (`strings/`). Así el test de glosario solo mira la web.
- **Sin secretos en las respuestas**: como mucho, `hint` (4 caracteres).
- **Fechas**: ISO 8601 UTC. **Importes**: céntimos enteros.
- **Fallos de IA ≠ errores HTTP**: una comprobación que termina en fallo es una respuesta `200` con el estado
  nuevo. Solo es error cuando la operación no se ha hecho (p. ej. no se guarda la clave porque no es válida).

### Errores

```ts
type ApiError = {
  error: {
    code: 'validacion' | 'conflicto' | 'no_encontrado' | 'ia' | 'prohibido' | 'interno';
    fields?: Record<string, string>;   // validacion: campo → código (p. ej. 'mayor_que_diario')
    guard?: 'sin_conexion' | 'sin_limites' | 'maximo_de_cuentas';
    failure?: AiFailure;               // ia
    current?: OnboardingState;         // conflicto en el asistente
  };
};
```

| HTTP | `code` |
|---|---|
| 400 | `validacion` |
| 403 | `prohibido` |
| 404 | `no_encontrado` |
| 409 | `conflicto` (revisión del asistente, cuenta duplicada) |
| 422 | `ia` (la operación necesitaba que la IA respondiera bien y no lo hizo) |
| 500 | `interno` (sin detalles; el detalle va al registro) |

## Tipos de respuesta

```ts
type OnboardingState = {
  step: WizardStep; chosenKind: ConnectionKind | null; postponed: boolean;
  revision: number; completedAt: string | null;
};

type ConnectionView = {
  kind: ConnectionKind; providerId: string; isActive: boolean;
  status: ConnectionStatus; reason: FailureReason | null; resetsAt: string | null;
  lastCheckedAt: string | null; hint: string | null;
};

type AccountView = {
  id: string; label: string; position: number;
  status: ConnectionStatus; reason: FailureReason | null; resetsAt: string | null;
  lastCheckedAt: string | null; lastCallAt: string | null; hint: string;
};

type AiOverview = {
  activeKind: ConnectionKind | null;
  connections: ConnectionView[];       // solo las configuradas
  accounts: AccountView[];             // en orden
  claudeCode: { installed: boolean; version: string | null; repair: RepairState };
  hasLimits: boolean;
};

type RepairState = { state: 'inactivo' | 'en_curso' | 'hecho' | 'fallido' };
type LimitsView = { perOperationCents: number; dailyCents: number; monthlyCents: number; accepted: boolean };
type GeneralSettings = { updateCheckEnabled: boolean; aiTimeoutSeconds: number | null };
type UpdateInfo = { current: string; latest: string | null; show: boolean };
```

## Rutas

### App

| Método y ruta | Cuerpo | Respuesta | Notas |
|---|---|---|---|
| `GET /api/health` | — | `{app: 'ytcreator', version, instanceId}` | La usan el lanzador y la detección de instancia (R4). Sin guardia de `Origin` (es `GET`) |
| `POST /api/app/shutdown` | `{}` | `202 {}` | Responde y después se apaga (FR-006) |

### Asistente

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/onboarding` | — | `OnboardingState` |
| `POST /api/onboarding/step` | `{expectedRevision: number, action: 'continuar' \| 'volver' \| 'elegir' \| 'aplazar' \| 'retomar', kind?: ConnectionKind}` | `OnboardingState` |

- `kind` es obligatorio con `elegir` e ignorado en el resto;
- `expectedRevision` distinto → `409 conflicto` con `current` (dos pestañas);
- guarda incumplida → `400 validacion` con `guard`;
- al salir de `conectar` (sin límites) o de `limites`, el servidor **activa** la conexión de `chosenKind` en la
  misma transacción ([data-model](../data-model.md#estado-del-asistente)).

### IA: resumen y activación

| Método y ruta | Cuerpo | Respuesta | Notas |
|---|---|---|---|
| `GET /api/ai` | — | `AiOverview` | Lo usan Ajustes, la cabecera y el asistente |
| `POST /api/ai/active` | `{kind}` | `AiOverview` | Exige conexión `conectada` (`guard: 'sin_conexion'`); `pago_por_uso` exige límites (`guard: 'sin_limites'`). Las demás conexiones se conservan (FR-026) |

### Suscripción: inicio de sesión y cuentas

| Método y ruta | Cuerpo | Respuesta | Notas |
|---|---|---|---|
| `POST /api/ai/subscription/login` | `{}` | `{loginId, url, expiresAt}` | Cancela el inicio de sesión anterior si lo había. Error `422 ia` (p. ej. `programa_no_instalado`) |
| `POST /api/ai/subscription/login/:loginId/complete` | `{code: string, label?: string}` | `AccountView` (`201`) | Limpia espacios. Código malo → `422 ia` con `codigo_no_valido` (la web ofrece enlace nuevo). Duplicada → `409 conflicto` (si el inicio viene de `accounts/:id/login`, se aplica esa ruta). Sexta cuenta → `400` con `guard: 'maximo_de_cuentas'`. Crea la conexión `suscripcion` si no existía |
| `DELETE /api/ai/subscription/login/:loginId` | — | `204` | |
| `POST /api/ai/subscription/accounts/:id/check` | `{}` | `AccountView` | Comprueba esa cuenta, sin rotar |
| `POST /api/ai/subscription/accounts/:id/login` | `{}` | `{loginId, url, expiresAt}` | Volver a entrar en una cuenta (FR-016). El inicio queda ligado a esa cuenta: al completarlo, sustituye su *token* y su huella y responde `200 AccountView` `conectada`, con el mismo nombre y posición (no se puede saber si es la misma cuenta, S3); si la huella nueva ya es de otra fila → `409 conflicto` y no cambia nada |
| `PATCH /api/ai/subscription/accounts/order` | `{ids: string[]}` | `AccountView[]` | `ids` debe ser una permutación exacta de las existentes |
| `PATCH /api/ai/subscription/accounts/:id` | `{label}` | `AccountView` | 1–40 caracteres |
| `DELETE /api/ai/subscription/accounts/:id` | — | `204` | Borra secreto y carpeta (FR-029) |

### Claves: pago por uso y gratis

| Método y ruta | Cuerpo | Respuesta | Notas |
|---|---|---|---|
| `PUT /api/ai/connections/:kind/credential` | `{key: string}` | `ConnectionView` | `kind` ∈ `pago_por_uso`, `gratis`. Limpia espacios; comprueba sin coste; **solo guarda si queda `conectada`**. Si no, `422 ia` con el fallo y la clave no se guarda (FR-017) |
| `DELETE /api/ai/connections/:kind/credential` | — | `204` | Borra la clave del almacén y la fila. Si estaba activa, ya no hay opción activa |
| `POST /api/ai/connections/:kind/check` | `{}` | `ConnectionView` | «Comprobar ahora» (FR-025). Para `suscripcion`, pasa por la rotación (R14) y la respuesta añade `switched?: AccountSwitched[]` |

### Reparar Claude Code

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/ai/repair-claude-code` | `{}` | `202 RepairState` (ejecuta el instalador oficial en segundo plano; uno a la vez) |
| `GET /api/ai/repair-claude-code` | — | `RepairState` (la web consulta cada 2 s mientras está `en_curso`) |

### Ajustes

| Método y ruta | Cuerpo | Respuesta | Notas |
|---|---|---|---|
| `GET /api/settings/limits` | — | `LimitsView` | Sin límites guardados, devuelve los propuestos con `accepted: false` |
| `PUT /api/settings/limits` | `{perOperationCents, dailyCents, monthlyCents}` | `LimitsView` | `fields` con `debe_ser_positivo`, `mayor_que_diario`, `mayor_que_mensual`, `demasiado_alto` (FR-022) |
| `GET /api/settings/general` | — | `GeneralSettings` | |
| `PATCH /api/settings/general` | `Partial<GeneralSettings>` | `GeneralSettings` | `aiTimeoutSeconds`: 10–300 o `null` |

### Versiones

| Método y ruta | Cuerpo | Respuesta | Notas |
|---|---|---|---|
| `GET /api/updates` | — | `UpdateInfo` | Lee lo que guardó la última consulta; no consulta fuera. `show` = hay versión nueva, el aviso está activado y no se ha descartado |
| `POST /api/updates/dismiss` | `{version}` | `UpdateInfo` | |

## Proveedor falso en los tests

Con `YTCREATOR_FAKE_AI=<escenario>` ([ai-provider.md](./ai-provider.md#proveedor-falso)), el registro sustituye
los tres proveedores reales por el falso. Solo en compilaciones de desarrollo y test (R23, R24). La API no cambia.

## Tests del servidor

Con `app.request()` de Hono, SQLite en memoria y `file-store` en una carpeta temporal:

- la guardia rechaza `Host` ajeno, `Origin` ajeno o ausente en mutaciones y `Content-Type` distinto de JSON;
- cada ruta con cuerpo válido, inválido y, cuando aplica, con cada guarda;
- `409` del asistente con dos revisiones;
- `PUT credential` con clave mala no deja ni fila ni secreto;
- borrar la última cuenta desactiva la suscripción;
- `GET /api/updates` no hace peticiones de red;
- ninguna respuesta contiene la credencial de prueba (parte del test de fuga).
