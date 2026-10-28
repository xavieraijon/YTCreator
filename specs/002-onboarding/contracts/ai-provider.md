# Contrato: puerto `AiProvider`, inicio de sesión y rotación

**Feature**: `002-onboarding` | Decisiones en [research.md](../research.md) R9–R16.

Los tipos viven en `packages/core/src/ai/`; las implementaciones, en `packages/ai/src/`. `packages/ai` depende de
`core`, nunca al revés. Nada fuera de `packages/ai` importa un SDK de IA (principio IV; regla de ESLint
`no-restricted-imports`).

## Tipos

```ts
// packages/core/src/ai/capabilities.ts
interface AiCapabilities { text: boolean; structured: boolean; streaming: boolean; vision: boolean }
type Billing = 'por_uso' | 'suscripcion' | 'gratis';
type ConnectionKind = 'suscripcion' | 'pago_por_uso' | 'gratis';

// packages/core/src/ai/uses.ts
type AiUse = 'comprobacion'; // crece con cada feature que llame a la IA

// packages/core/src/ai/failures.ts
type FailureKind = 'sin_sesion' | 'cupo_agotado' | 'tiempo_agotado' | 'contenido_filtrado' | 'no_disponible';
type FailureReason =
  | 'clave_no_valida' | 'sesion_caducada' | 'sin_permiso' | 'plan_sin_acceso' | 'codigo_no_valido'
  | 'sin_saldo' | 'limite_de_uso'
  | 'respuesta_lenta'
  | 'rechazo_del_modelo'
  | 'sin_conexion' | 'servicio_caido' | 'programa_no_instalado' | 'llavero_no_disponible' | 'region_no_soportada';
interface AiFailure { kind: FailureKind; reason: FailureReason; resetsAt?: string /* ISO */ }

// packages/core/src/ai/port.ts
type CheckResult = { ok: true } | { ok: false; failure: AiFailure };

interface AiRequest<T> {
  use: AiUse;
  prompt: { id: string; version: number; text: string }; // de packages/knowledge
  schema?: ZodType<T>;          // salida estructurada; sin él, T = string
  signal?: AbortSignal;
}
interface AiUsage { inputTokens?: number; outputTokens?: number }
type AiResult<T> = { ok: true; value: T; usage: AiUsage } | { ok: false; failure: AiFailure };

interface AiProvider {
  readonly id: string;                 // 'claude-code' | 'anthropic' | 'gemini' | 'fake'
  readonly capabilities: AiCapabilities;
  readonly billing: Billing;
  check(signal?: AbortSignal): Promise<CheckResult>;
  generate<T>(request: AiRequest<T>): Promise<AiResult<T>>;
}
```

Reglas del puerto:

- `check()` y `generate()` **no lanzan nunca**. Cualquier excepción interna se clasifica (R13); lo que no se
  reconoce es `no_disponible` / `servicio_caido`;
- `check()` no tiene coste en euros (R12, SC-004);
- `generate()` con `schema` valida la salida con Zod. Si no valida, el adaptador repite la petición **una sola
  vez** (principio IV). Si la segunda tampoco valida, `no_disponible` / `servicio_caido`, y se registra el fallo de
  validación sin el contenido. Los fallos del proveedor (cupo, tiempo, caída) no se reintentan nunca;
- ningún adaptador reintenta por su cuenta (`maxRetries: 0` en el SDK de Anthropic);
- el modelo, el esfuerzo y el tiempo máximo salen del **perfil** `(provider, use)`, nunca del llamador ni del
  entorno.

## Perfiles

```ts
// packages/ai/src/profiles.ts
interface AiProfile { model: string; timeoutMs: number; maxOutputTokens: number; effort?: 'low' | 'medium' | 'high' }
const PROFILES: Record<ProviderId, Record<AiUse, AiProfile>>;
```

| Proveedor | `comprobacion` |
|---|---|
| `claude-code` | `claude-haiku-5-5`, 60 s, 16 tokens, esfuerzo bajo |
| `anthropic` | `claude-haiku-5-5`, 30 s, 16 tokens (solo si S4 añade una llamada; hoy no genera) |
| `gemini` | el modelo gratuito más ligero (S6), 30 s, 16 tokens |
| `fake` | `fake`, 1 s |

`ai_timeout_seconds` de los ajustes (Modo experto) sustituye `timeoutMs` si existe.

## Registro de proveedores

```ts
// packages/core/src/ai/registry.ts
interface ProviderDescriptor {
  id: string;
  connectionKind: ConnectionKind;
  billing: Billing;
  label: string;                     // clave de texto, no el texto
  create(credentials: Secret, deps: ProviderDeps): AiProvider;
  login?: SubscriptionLogin;         // solo suscripción
}
interface ProviderDeps { fetch: typeof fetch; now(): Date; logger: Logger; claudeBin?: string; accountDir?: string }
```

`packages/ai/src/registry.ts` exporta la lista: `claude-code` (suscripción), `anthropic` (pago por uso), `gemini`
(gratis) y, solo si `__YTC_ALLOW_FAKE_AI__`, `fake`. Añadir una suscripción nueva = un descriptor más (FR-015).

## Inicio de sesión de suscripción

```ts
// packages/core/src/ai/port.ts
interface LoginStart { loginId: string; url: string; expiresAt: string }
type LoginResult =
  | { ok: true; token: Secret }   // huella = SHA-256 del token (S3: no hay identidad de cuenta)
  | { ok: false; failure: AiFailure };              // codigo_no_valido, sin_conexion, tiempo_agotado…

interface SubscriptionLogin {
  start(): Promise<{ ok: true; value: LoginStart } | { ok: false; failure: AiFailure }>;
  complete(loginId: string, code: Secret): Promise<LoginResult>;
  cancel(loginId: string): Promise<void>;
}
```

- como mucho **un** inicio de sesión en curso; `start()` con otro abierto lo cancela;
- caduca a los 10 minutos: el proceso se mata y `complete()` devuelve `sin_sesion` / `codigo_no_valido`;
- el código que pega el creador también va envuelto en `Secret` y se limpia de espacios;
- el *token* y la salida del proceso no se registran nunca.

## Rotación

```ts
// packages/core/src/ai/rotation.ts
interface AccountState { id: string; position: number; status: ConnectionStatus; resetsAt?: string }
interface AccountSwitched { fromId: string; toId: string; reason: 'cupo_agotado' }

function pickCandidates(accounts: AccountState[], now: Date): AccountState[];
async function runWithRotation<T>(
  accounts: AccountState[],
  call: (accountId: string) => Promise<AiResult<T>>,
  now: Date,
): Promise<{ result: AiResult<T>; updates: AccountUpdate[]; switched: AccountSwitched[] }>;
```

Reglas (R14, FR-016c):

1. candidatas = cuentas en orden de `position`, sin `sin_sesion` y sin `cupo_agotado` con `resetsAt` futuro;
2. sin candidatas → no se llama; resultado `cupo_agotado` / `limite_de_uso` con el `resetsAt` más próximo; si
   ninguna tiene cupo agotado (todas `sin_sesion`), devuelve el fallo de la primera;
3. se llama a la primera candidata. `cupo_agotado` → se anota y se pasa a la siguiente, con un `AccountSwitched`.
   Cada cuenta se intenta **una vez** como mucho;
4. cualquier otro fallo (incluido `tiempo_agotado`) se devuelve tal cual, sin pasar a la siguiente;
5. `updates` lleva el estado nuevo de cada cuenta tocada; el servidor lo persiste.

## Proveedor falso

`packages/ai/src/fake/` implementa `AiProvider` y `SubscriptionLogin` de forma determinista. Escenarios
(`YTCREATOR_FAKE_AI=<nombre>` en e2e; parámetro directo en unitarios):

| Escenario | `check()` | `login` |
|---|---|---|
| `ok` | conectada | enlace fijo; código `ABCD-1234` → *token* `sk-ant-oat-FAKE…` |
| `<kind>:<reason>` (p. ej. `sin_sesion:clave_no_valida`) | ese fallo | — |
| `cupo:<resetsAt>` | `cupo_agotado` con esa fecha | — |
| `cuentas:<s1>,<s2>,…` | por cuenta, en orden (p. ej. `cupo,ok`) | — |
| `lento` | no responde hasta el tiempo máximo | — |
| `login:codigo_malo` | — | `codigo_no_valido` con cualquier código |
| `login:duplicada` | — | siempre el mismo *token* (misma huella) |

Las claves aceptadas por los adaptadores falsos de pago por uso y gratis son `sk-ant-api03-FAKE…` y
`AIzaFAKE…`: reconocibles para el test de fuga (SC-006).

## Batería de contrato

`packages/ai/test/contract/battery.ts` exporta `runProviderContract(name, factory)`. Se ejecuta contra `fake`,
`claude-code` (con `fake-claude`), `anthropic` y `gemini` (con `fetch` inyectado). Cada adaptador aporta el
*stub* que provoca cada caso.

| # | Caso | Esperado |
|---|---|---|
| C1 | Credencial válida | `check()` → `{ok: true}` |
| C2 | Credencial no válida | `sin_sesion` / `clave_no_valida` o `sesion_caducada` |
| C3 | Sin permiso / plan sin acceso | `sin_sesion` / `sin_permiso` o `plan_sin_acceso` |
| C4 | Cupo o límite de uso | `cupo_agotado` con `resetsAt` si el proveedor lo da |
| C5 | Sin conexión | `no_disponible` / `sin_conexion` (distinto de C2, FR-017) |
| C6 | Tiempo agotado | `tiempo_agotado` en ≤ tiempo máximo + 1 s |
| C7 | Servicio caído (5xx, 529) | `no_disponible` / `servicio_caido` |
| C8 | Respuesta filtrada | `contenido_filtrado` |
| C9 | Error desconocido | `no_disponible` / `servicio_caido`, sin lanzar |
| C10 | `generate` con `schema` y salida válida | `{ok: true, value}` tipado |
| C11 | `generate` con salida que no valida | un reintento: si la segunda valida → `{ok: true, value}`; si no → `no_disponible` / `servicio_caido`. Contador = 2 |
| C12 | Salvo C11, ningún fallo provoca más de una llamada al transporte | contador = 1 |
| C13 | La credencial no aparece en registros, errores ni `JSON.stringify` del proveedor | búsqueda vacía |

Solo `claude-code`:

| # | Caso | Esperado |
|---|---|---|
| CC1 | Entorno del proceso | sin `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_*`, `CLAUDE_EFFORT`, `MAX_THINKING_TOKENS`; con `CLAUDE_CODE_OAUTH_TOKEN` y `CLAUDE_CONFIG_DIR` de la cuenta, `CLAUDE_CODE_MAX_RETRIES=0`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_TELEMETRY=1` y `DISABLE_AUTOUPDATER=1` (S1) |
| CC2 | Binario ausente | `no_disponible` / `programa_no_instalado` |
| CC3 | El *token* no aparece en los argumentos del proceso | `argv` sin el *token* |
| CC4 | Inicio de sesión: enlace → código → *token* | `LoginResult` ok con la salida grabada |
| CC5 | Código no válido | `codigo_no_valido` |
| CC6 | Caducidad del inicio de sesión | proceso terminado, `codigo_no_valido` |

Solo `anthropic`: el cliente se crea con `maxRetries: 0` (AN1); un 429 con cabeceras de reinicio da `resetsAt`
(AN2). Solo `gemini`: la clave va en `x-goog-api-key` y nunca en la URL (GE1).

La rotación tiene sus propios tests unitarios en `packages/core` (casos R1–R6: orden, una vez por cuenta, no rota con
`tiempo_agotado`, todas agotadas sin llamar, `resetsAt` más próximo, `resetsAt` pasado vuelve a ser candidata).
