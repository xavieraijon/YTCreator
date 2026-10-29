# Contrato: secretos y registros

**Feature**: `002-onboarding` | Decisiones en [research.md](../research.md) R8 y R22.

## `Secret`

```ts
// packages/core/src/secrets/secret.ts
class Secret {
  static from(value: string): Secret;       // limpia espacios y saltos de línea al principio y al final
  reveal(): string;
  hint(): string;                           // 4 últimos caracteres
  toString(): '[oculto]';
  toJSON(): '[oculto]';
  [Symbol.for('nodejs.util.inspect.custom')](): '[oculto]';
}
```

- el valor se guarda en un campo privado (`#value`), no enumerable;
- `reveal()` solo se llama en: el adaptador al construir la petición o el entorno del proceso, el `SecretStore` al
  guardar y el inicio de sesión al escribir el código. Una regla de ESLint limita `reveal()` a `packages/ai/src/**` y
  `apps/server/src/secrets/**`;
- las rutas HTTP reciben las claves como texto, las convierten en `Secret` en la validación (Zod `.transform`) y no
  vuelven a tocar el texto.

## `SecretStore`

```ts
// packages/core/src/secrets/port.ts
type SecretStoreKind = 'keychain' | 'secret-service' | 'file';
type StoreResult<T> = { ok: true; value: T } | { ok: false; failure: AiFailure }; // no_disponible / llavero_no_disponible

interface SecretStore {
  readonly kind: SecretStoreKind;
  set(ref: string, secret: Secret): Promise<StoreResult<void>>;
  get(ref: string): Promise<StoreResult<Secret | null>>;
  delete(ref: string): Promise<StoreResult<void>>;
}
```

`ref` tiene la forma `ytcreator:<tipo>:<id>`, p. ej. `ytcreator:pago_por_uso:anthropic` o
`ytcreator:cuenta:<uuid>`. No contiene datos del creador.

| Implementación | Guardar | Leer | Borrar | Disponible si |
|---|---|---|---|---|
| `macos-keychain` | `security -i` con `add-generic-password -U -s YTCreator -a <ref> -w <valor>` por la entrada estándar | `security find-generic-password -s YTCreator -a <ref> -w` (la salida es el valor) | `security delete-generic-password -s YTCreator -a <ref>` | macOS |
| `linux-secret-service` | `secret-tool store --label=YTCreator service YTCreator account <ref>` con el valor por la entrada estándar | `secret-tool lookup service YTCreator account <ref>` | `secret-tool clear service YTCreator account <ref>` | `secret-tool` existe y la prueba guardar-leer-borrar termina en ≤ 3 s |
| `file-store` | Lee, modifica y escribe `secrets.json` en un temporal `0600` + `rename` | Lee `secrets.json` | Igual que guardar | Siempre |

Reglas:

- el valor **nunca** va en los argumentos de un proceso (visibles con `ps`);
- `select.ts` elige la primera disponible en el orden de la tabla y anota `secret_store` en los ajustes. Después,
  usa siempre esa; si deja de estar disponible, devuelve el fallo y no cambia de almacén en silencio;
- `secrets/` se crea con `0700` y `secrets.json` con `0600`; al leer, si los permisos son más abiertos, se
  corrigen y se registra un aviso (sin contenido);
- los errores de las herramientas se registran por código de salida, nunca con su salida estándar.

## Registros

`apps/server/src/logging.ts`:

```ts
interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}
```

- formato: una línea JSON por evento con `ts`, `level`, `event` y los campos;
- destino: `APP_HOME/logs/server.log`, rotación a los 5 MB, 3 ficheros;
- antes de escribir, la línea pasa por el **redactor**:

  | Patrón | Sustituye |
  |---|---|
  | `sk-ant-[A-Za-z0-9_-]{8,}` | claves de la API y *tokens* de suscripción |
  | cualquier valor de un campo llamado `apiKey`, `token`, `code`, `authorization`, `x-api-key` | por nombre |

  Todo lo que encaja se sustituye por `[oculto]`;
- los errores de los proveedores se registran como `{provider, kind, reason, status?, errorType?}`, nunca el cuerpo
  ni las cabeceras;
- la salida de `claude setup-token` y de `claude -p` no se registra; solo el código de salida y la clasificación.

## Test de fuga de secretos (SC-006)

`apps/web/e2e/secrets-leak.spec.ts`, con el servidor real y el proveedor falso:

1. se conectan las dos opciones con credenciales de prueba reconocibles (`sk-ant-oat-FAKE…` y
   `sk-ant-api03-FAKE…`) y se recorren comprobación, fallo, borrado y cambio de opción;
2. se buscan las dos cadenas (completas y sin los 4 últimos caracteres) en:
   - todos los ficheros de `APP_HOME/logs/`;
   - todo `~/YTCreator` (incluida la base de datos, en binario);
   - el cuerpo de todas las respuestas HTTP capturadas por Playwright;
   - el DOM y `localStorage` al final de cada pantalla;
   - los ficheros versionados del repositorio (`git ls-files`);
3. resultado esperado: cero apariciones. Solo puede aparecer el `hint` de 4 caracteres.

Tests unitarios complementarios: `Secret` no se filtra por `JSON.stringify`, plantillas, `util.inspect` ni
`console.log`; el redactor cubre cada patrón; `file-store` crea los permisos correctos y no deja temporales.
