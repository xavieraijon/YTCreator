# Contrato: instalador y lanzador

**Feature**: `002-onboarding` | Decisiones en [research.md](../research.md) R1–R3, R6, R21.

## Línea de instalación

```sh
curl -fsSL https://github.com/<owner>/<repo>/releases/latest/download/install.sh | bash
```

La misma línea instala, reanuda y actualiza (FR-003). No pide argumentos.

## Variables de entorno

| Variable | Uso | Quién la usa |
|---|---|---|
| `YTCREATOR_RELEASE_BASE` | Sustituye la URL base de descarga (carpeta local o servidor de pruebas) | Validación manual, tests |
| `YTCREATOR_INSTALL_TEST` | `1` activa los ganchos de prueba | Tests |
| `YTCREATOR_INSTALL_FAIL_STEP` | `1`–`8`: termina con error justo después de hacer el trabajo de ese paso. Ignorada sin `YTCREATOR_INSTALL_TEST=1` | Tests (SC-003) |
| `YTCREATOR_ASSUME_YES` | `1` responde «sí» a las preguntas (poco disco). Solo con `YTCREATOR_INSTALL_TEST=1` | Tests |
| `YTCREATOR_PORT` | Fija el puerto del servidor en lugar de buscar uno libre en 4310–4329 (si está ocupado, no arranca). Solo en compilaciones de desarrollo (`__YTC_ALLOW_FAKE_AI__`) | e2e (Playwright) |

Ninguna se documenta para el creador.

## Pasos y salida

Cada paso se anuncia como `Paso N de 8 · <texto>` (FR-002) y termina con `✓` o con un error. Los textos son los
del bloque `MSG_*`; los siguientes son orientativos y los fija la implementación con el test de glosario.

| N | Anuncio | Hecho si… (`step_N_done`) | Si falla |
|---|---|---|---|
| 1 | Comprobando tu ordenador | Siempre se ejecuta (no escribe nada) | Sistema no soportado (código 10), falta una herramienta (11), poco disco y el creador dice que no (12) |
| 2 | Preparando las carpetas | Existen `APP_HOME` con sus subcarpetas y `~/YTCreator/.ytcreator` | Carpeta de trabajo ajena (20), sin permisos de escritura (21) |
| 3 | Descargando el motor | `runtime/node-v<fijada>/bin/node --version` responde la versión fijada | Sin conexión (30), suma no coincide (31) |
| 4 | Descargando YTCreator | `versions/<v>/VERSION` contiene `<v>` | Sin conexión (30), suma no coincide (31) |
| 5 | Instalando Claude Code | `claude --version` responde (binario en `PATH` o `~/.local/bin`) | **No para**: aviso y sigue. La app ofrecerá repararlo |
| 6 | Preparando tus datos | `current` apunta a `versions/<v>` y `schema_migrations` tiene todas las migraciones de `<v>` | Migración fallida (60): se restaura la copia y `current` no cambia |
| 7 | Creando el acceso directo | Existe el acceso y apunta a `current` | Aviso y sigue (71): la app funciona sin él |
| 8 | Abriendo YTCreator | Siempre se ejecuta | Sin entorno gráfico: muestra la dirección, no es error |

Final con éxito:

```text
✓ YTCreator está listo.
  Se ha abierto en tu navegador. La próxima vez, ábrelo desde <Launchpad | el menú de aplicaciones>.
```

Un error termina siempre con tres líneas: qué ha pasado, qué hacer y «Cuando lo tengas, vuelve a pegar la misma
línea: seguirá donde se quedó». Más la ruta del registro.

## Códigos de salida

| Código | Significado |
|---|---|
| 0 | Instalado o actualizado |
| 10 | Sistema no soportado (Windows/WSL sin Linux real, *BSD, arquitectura desconocida) |
| 11 | Falta una herramienta del sistema (`curl`, `tar`, `shasum`/`sha256sum`, `script`) |
| 12 | Poco espacio y el creador eligió parar (o no hay terminal para preguntar) |
| 20 | `~/YTCreator` existe, tiene contenido y no es de YTCreator |
| 21 | Sin permiso de escritura en el `HOME` |
| 30 | Descarga fallida tras 3 intentos |
| 31 | La suma SHA-256 no coincide |
| 60 | Migración fallida (datos restaurados) |
| 99 | Fallo inesperado (siempre con la ruta del registro) |

## Registro

`APP_HOME/logs/install-<AAAAMMDD-HHMMSS>.log`: una línea por evento con fecha, paso y resultado; la salida completa
de los comandos que fallan. El instalador no maneja secretos; aun así, el test de fuga también lo recorre. Antes de
existir `APP_HOME` (paso 1), el registro va a un fichero temporal que se mueve al crearla.

## Garantías

- Ningún paso usa `sudo` (FR-005).
- Nada fuera de `APP_HOME`, `~/YTCreator`, el acceso directo y lo que instale Claude Code en `~/.local`.
- Cortar con Ctrl+C o cerrar la terminal en cualquier momento y repetir la línea termina en el mismo estado que
  una instalación sin cortes (SC-003).
- Actualizar no borra datos ni credenciales (FR-009, SC-009) y conserva la versión anterior en `versions/`.
- Repetir con la misma versión instalada no descarga nada y solo ejecuta los pasos 1, 6 (comprobación), 7 y 8.

## Lanzador `bin/ytcreator`

| Subcomando | Efecto | Salida |
|---|---|---|
| *(ninguno)* / `open` | Reutiliza la instancia o arranca una; abre el navegador (R6) | Sin entorno gráfico: `YTCreator está en http://127.0.0.1:<puerto>` |
| `serve` | Arranca el servidor en primer plano (lo usa `open` y el desarrollo) | Registros a fichero |
| `migrate` | Copia la base y aplica migraciones; código 0 o 60 | Lo usa el paso 6 |

Tiempos: ≤ 1 s con la instancia en marcha; ≤ 5 s en frío (plan, Performance Goals).

## Acceso directo

| Sistema | Ruta | Contenido |
|---|---|---|
| macOS | `~/Applications/YTCreator.app` | `Contents/Info.plist` (nombre, identificador `com.ytcreator.app`, icono) y `Contents/MacOS/YTCreator`: `exec "<APP_HOME>/current/bin/ytcreator" open` |
| Linux | `~/.local/share/applications/ytcreator.desktop` | `Type=Application`, `Name=YTCreator`, `Exec="<APP_HOME>/current/bin/ytcreator" open`, `Terminal=false`, `Categories=AudioVideo;` |

## Tests (R23)

`installer/test/install.test.ts` con `HOME` temporal y `curl`, `uname`, `script` y el instalador de Claude falsos en
el `PATH`:

1. instalación limpia en `darwin-arm64` y `linux-x64` simulados → código 0 y estructura de R3;
2. para cada `N` de 1 a 8: corte con `YTCREATOR_INSTALL_FAIL_STEP=N`, repetición sin el gancho → código 0, mismo
   árbol que el caso 1 y sin repetir descargas ya verificadas;
3. sistema no soportado → 10 y nada escrito;
4. carpeta de trabajo ajena → 20 y su contenido intacto;
5. suma incorrecta → 31 y ningún `*.partial` promovido;
6. actualización de `v1` a `v2` con datos → datos y secretos de prueba intactos, `current` → `v2`, `v1` conservada;
7. migración que falla → 60, base restaurada byte a byte, `current` → `v1`;
8. fallo al instalar Claude Code → aviso, código 0;
9. `shellcheck` sin avisos (CI).
