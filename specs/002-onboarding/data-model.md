# Data Model: Onboarding — instalación y elección de la IA

**Feature**: `002-onboarding` | **Fecha**: 2026-10-28

Las entidades de la spec se reparten en dos sitios:

- **base de datos** `~/YTCreator/ytcreator.db` (SQLite, migración `0001_onboarding.sql`): lo que el creador
  configura y que se exporta con sus datos. **Nunca contiene secretos**, solo referencias (R8);
- **ficheros de la carpeta interna** (`APP_HOME`, R3): lo que es de la instalación y no del creador.

Los tipos de TypeScript viven en `packages/core` y los esquemas Zod de las respuestas en `@ytcreator/core/api`
([contracts/http-api.md](./contracts/http-api.md)). Los nombres de columnas y valores van en español cuando son
conceptos del dominio que aparecen en la spec (`suscripcion`, `cupo_agotado`) y en inglés cuando son técnicos
(`created_at`, `position`).

---

## Entidades de la spec → dónde viven

| Entidad (spec) | Dónde | Tabla o fichero |
|---|---|---|
| Instalación | `APP_HOME` | `install.json`, `instance.json` |
| Estado del asistente (primer arranque) | BD | `onboarding_state` |
| Conexión de IA | BD + `SecretStore` | `ai_connection` |
| Cuenta de suscripción | BD + `SecretStore` | `subscription_account` |
| Límites de gasto | BD | `spending_limits` |
| *(ajustes de la app)* | BD | `app_settings` |

---

## Ficheros de `APP_HOME`

### `install.json`

Lo escribe el instalador (pasos 2 y 6). El servidor lo lee al arrancar para saber dónde está la carpeta de trabajo.

| Campo | Tipo | Regla |
|---|---|---|
| `schemaVersion` | `1` | Sube si cambia la forma del fichero |
| `version` | `string` (semver) | Versión instalada; coincide con `current` |
| `previousVersion` | `string \| null` | La que había antes de actualizar (R21) |
| `workspacePath` | `string` (ruta absoluta) | `~/YTCreator` en la v1 |
| `platform` | `'darwin-arm64' \| 'darwin-x64' \| 'linux-x64' \| 'linux-arm64'` | |
| `installedAt` | ISO 8601 | Primera instalación; no cambia al actualizar |
| `updatedAt` | ISO 8601 | Última instalación o actualización |

### `instance.json`

Lo crea el servidor con `O_EXCL` al arrancar y lo borra al cerrarse (R4). Si existe y el proceso no responde, se
considera caducado.

| Campo | Tipo |
|---|---|
| `pid` | `number` |
| `port` | `number` (4310–4329) |
| `instanceId` | `string` (UUID aleatorio por arranque) |
| `version` | `string` |
| `startedAt` | ISO 8601 |

### Otros

- `~/YTCreator/.ytcreator`: marca vacía que identifica la carpeta de trabajo (paso 2 del instalador).
- `APP_HOME/secrets/secrets.json` (`0600`): solo si no hay llavero. `{ "<secret_ref>": "<valor>" }`
  ([contracts/secrets.md](./contracts/secrets.md)).
- `APP_HOME/claude-accounts/<account_id>/` (`0700`): configuración aislada de cada cuenta de suscripción (R10).
  Se borra con la cuenta.

---

## Tablas

Convenciones: fechas en ISO 8601 UTC (`TEXT`); booleanos como `INTEGER` 0/1; identificadores `TEXT` con UUID;
cada tabla de fila única fija `id = 1` con un `CHECK`.

### `schema_migrations`

| Columna | Tipo | Regla |
|---|---|---|
| `version` | `INTEGER` PK | Número del fichero (`0001` → 1) |
| `applied_at` | `TEXT` NOT NULL | |

### `onboarding_state` — Estado del asistente (primer arranque)

Una sola fila, creada por la migración en `bienvenida`.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `INTEGER` PK | `CHECK (id = 1)` |
| `step` | `TEXT` NOT NULL | `bienvenida` \| `elegir` \| `conectar` \| `limites` \| `listo` \| `completado` |
| `chosen_kind` | `TEXT` NULL | `suscripcion` \| `pago_por_uso` \| `gratis`; NULL hasta elegir |
| `postponed` | `INTEGER` NOT NULL DEFAULT 0 | 1 tras «Lo haré más tarde» |
| `completed_at` | `TEXT` NULL | Se fija al pasar a `completado` |
| `revision` | `INTEGER` NOT NULL DEFAULT 0 | Sube en cada cambio (R18) |
| `updated_at` | `TEXT` NOT NULL | |

### `ai_connection` — Conexión de IA

Una fila por **tipo de opción**, creada la primera vez que el creador la configura. Se conservan las tres aunque
solo una esté activa (FR-026).

| Columna | Tipo | Regla |
|---|---|---|
| `kind` | `TEXT` PK | `suscripcion` \| `pago_por_uso` \| `gratis` |
| `provider_id` | `TEXT` NOT NULL | `claude-code` \| `anthropic` \| `gemini` (registro, R9) |
| `is_active` | `INTEGER` NOT NULL DEFAULT 0 | Índice único parcial `WHERE is_active = 1`: como mucho una activa |
| `status` | `TEXT` NOT NULL | `sin_comprobar` \| `conectada` \| `sin_sesion` \| `cupo_agotado` \| `tiempo_agotado` \| `contenido_filtrado` \| `no_disponible` |
| `status_reason` | `TEXT` NULL | Motivo de R13; NULL si `conectada` o `sin_comprobar` |
| `resets_at` | `TEXT` NULL | Solo con `cupo_agotado` |
| `last_checked_at` | `TEXT` NULL | Última comprobación, con éxito o no (FR-025) |
| `secret_ref` | `TEXT` NULL | Clave guardada (pago por uso, gratis). NULL en suscripción: las credenciales están en cada cuenta |
| `secret_hint` | `TEXT` NULL | 4 últimos caracteres de la clave |
| `created_at`, `updated_at` | `TEXT` NOT NULL | |

Reglas:

- en `suscripcion`, `status` es el **resumen** de las cuentas: `conectada` si alguna lo está; si no, el fallo de
  la primera cuenta en orden, y con `cupo_agotado` en todas, el `resets_at` más próximo (US4-7);
- una clave solo se guarda si la comprobación termina en `conectada` (FR-017). Por eso una fila de `pago_por_uso`
  o `gratis` siempre tiene `secret_ref`;
- activar `pago_por_uso` exige que `spending_limits` exista (FR-021, R17).

### `subscription_account` — Cuenta de suscripción

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | UUID; también nombra su carpeta en `claude-accounts/` |
| `provider_id` | `TEXT` NOT NULL | `claude-code` en la v1 |
| `label` | `TEXT` NOT NULL | Nombre que pone el creador; por defecto «Cuenta 1», «Cuenta 2»…; 1–40 caracteres |
| `identity_fingerprint` | `TEXT` NOT NULL | `UNIQUE (provider_id, identity_fingerprint)`; detecta la cuenta duplicada (R11, S3) |
| `position` | `INTEGER` NOT NULL | Orden de uso; 1..n sin huecos |
| `status` | `TEXT` NOT NULL | Igual que en `ai_connection` |
| `status_reason` | `TEXT` NULL | |
| `resets_at` | `TEXT` NULL | |
| `last_checked_at` | `TEXT` NULL | |
| `last_call_at` | `TEXT` NULL | Última llamada real (estado real, FR-016b) |
| `secret_ref` | `TEXT` NOT NULL | El *token* de larga duración |
| `secret_hint` | `TEXT` NOT NULL | 4 últimos caracteres |
| `created_at` | `TEXT` NOT NULL | |

Reglas:

- máximo **5 cuentas** por proveedor (escala del plan); la sexta da `400 validacion` con
  `guard: 'maximo_de_cuentas'` ([http-api.md](./contracts/http-api.md));
- borrar una cuenta borra su secreto, su carpeta en `claude-accounts/` y recompone `position`; si era la última,
  la conexión `suscripcion` pasa a `sin_sesion` / `sesion_caducada` y, si estaba activa, deja de estarlo;
- la huella **nunca** es el *token* ni un fragmento: es un *hash* SHA-256 de la identidad (o del *token*, si S3
  falla).

### `spending_limits` — Límites de gasto

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `INTEGER` PK | `CHECK (id = 1)` |
| `per_operation_cents` | `INTEGER` NOT NULL | `CHECK (per_operation_cents > 0)` |
| `daily_cents` | `INTEGER` NOT NULL | `CHECK (daily_cents >= per_operation_cents)` |
| `monthly_cents` | `INTEGER` NOT NULL | `CHECK (monthly_cents >= daily_cents AND monthly_cents <= 100000)` |
| `accepted_at` | `TEXT` NOT NULL | Cuándo los aceptó o cambió el creador |

No existe hasta que el creador acepta los valores (FR-021). Valores propuestos: 50, 300 y 2000 céntimos (R17). El
tope mensual de 1000 € (100000 céntimos) viene de FR-022. La validación del dominio repite los `CHECK` para
devolver errores por campo antes de llegar a la base (FR-022).

### `app_settings`

Clave/valor (`key TEXT PK`, `value TEXT NOT NULL`). Claves conocidas, validadas con Zod al leer:

| Clave | Valor | Por defecto |
|---|---|---|
| `update_check_enabled` | `'1'` \| `'0'` | `'1'` (FR-009b) |
| `last_update_check_at` | ISO 8601 | — |
| `latest_version` | semver | — |
| `dismissed_version` | semver | — |
| `ai_timeout_seconds` | entero 10–300 | — (usa el perfil); solo «Modo experto» (FR-034) |
| `secret_store` | `'keychain'` \| `'secret-service'` \| `'file'` | Se fija la primera vez (R8) |

---

## Estado del asistente

Máquina pura en `packages/core/src/onboarding/wizard.ts` (R18). `transition(state, action, context)` devuelve el
estado nuevo o un error de guarda; `context` trae lo que la máquina necesita saber del resto (si hay una conexión
activa `conectada`, si hay límites).

```text
                   aplazar ─────────────────────────────┐
                      │                                 ▼
bienvenida ──continuar──▶ elegir ──elegir(k)──▶ conectar ──continuar──▶ limites ──continuar──▶ listo ──continuar──▶ completado
     ▲                     ▲  │                   │  ▲                      │ (solo pago_por_uso)  ▲
     └──────volver─────────┘  └──────volver───────┘  └────────volver────────┘                      │
                                                    └──────────continuar (suscripcion, gratis)─────┘

postponed = 1  ──retomar──▶  postponed = 0, mismo step
```

| Acción | Desde | Guarda | Resultado |
|---|---|---|---|
| `continuar` | `bienvenida` | — | `elegir` |
| `elegir(kind)` | `elegir` | `kind` válido | `chosen_kind = kind`, `conectar` |
| `continuar` | `conectar` | conexión de `chosen_kind` existe y está `conectada` | `limites` si `pago_por_uso`; si no, activa la conexión y pasa a `listo` |
| `continuar` | `limites` | `spending_limits` existe | activa la conexión y pasa a `listo` |
| `continuar` | `listo` | — | `completado`, `completed_at = now` |
| `volver` | `elegir`, `conectar`, `limites`, `listo` | — | paso anterior; desde `listo` sin límites, vuelve a `conectar` |
| `aplazar` | cualquiera salvo `completado` | — | `postponed = 1` (la web muestra `/conectar-ia`) |
| `retomar` | `postponed = 1` | — | `postponed = 0` |

Cada acción válida sube `revision`. Una acción con `expectedRevision` distinto da `conflicto` con el estado actual.
Una guarda que no se cumple da `validacion` con el motivo (`sin_conexion`, `sin_limites`). Activar la conexión
en la misma transacción que el paso garantiza que `pago_por_uso` nunca queda activa sin límites.

Tras `completado`, el asistente no vuelve a aparecer. Cambiar de opción se hace desde Ajustes (FR-026) con las
mismas pantallas de conexión, sin tocar `onboarding_state`.

---

## Estados de una conexión o cuenta

```text
            comprobar → éxito
sin_comprobar ───────────────▶ conectada ◀──────────────┐
      │                           │                     │ comprobar → éxito
      │ comprobar → fallo         │ llamada → fallo     │ (o pasa resets_at y la siguiente llamada va bien)
      ▼                           ▼                     │
   <fallo>  ◀───────────────── <fallo> ─────────────────┘
```

- `sin_comprobar` solo existe entre crear la cuenta y la primera comprobación; en la práctica dura milisegundos,
  porque crear implica comprobar;
- `cupo_agotado` con `resets_at` pasado se trata como **candidata** en la rotación (R14): no se cambia a `conectada`
  hasta que una llamada real lo confirme;
- cada transición escribe `last_checked_at` (comprobación) o `last_call_at` (llamada).

---

## Tipos del dominio (resumen)

Definición completa en [contracts/ai-provider.md](./contracts/ai-provider.md).

```ts
type ConnectionKind = 'suscripcion' | 'pago_por_uso' | 'gratis';
type FailureKind = 'sin_sesion' | 'cupo_agotado' | 'tiempo_agotado' | 'contenido_filtrado' | 'no_disponible';
type ConnectionStatus = 'sin_comprobar' | 'conectada' | FailureKind;
type WizardStep = 'bienvenida' | 'elegir' | 'conectar' | 'limites' | 'listo' | 'completado';
interface SpendingLimits { perOperationCents: number; dailyCents: number; monthlyCents: number }
```

---

## Qué se exporta y qué no

| Dato | En `~/YTCreator` (exportable) | Fuera |
|---|---|---|
| Estado del asistente, conexiones, cuentas (sin secretos), límites, ajustes | ✅ `ytcreator.db` | |
| Claves y *tokens* | | Llavero o `APP_HOME/secrets/` |
| Configuración aislada de Claude por cuenta | | `APP_HOME/claude-accounts/` |
| Registros | | `APP_HOME/logs/` |
| Copias de seguridad de la base | | `APP_HOME/backups/` |

El test de fuga de secretos (SC-006) recorre `~/YTCreator` entero con las credenciales de prueba.
