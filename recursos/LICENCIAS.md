# Licencias de los recursos

Todo recurso de terceros que se use en los vídeos debe figurar aquí con su origen y licencia.

## Fuentes (`recursos/fuentes/`)

| Archivo | Fuente | Autor | Licencia | Uso comercial | Atribución |
|---|---|---|---|---|---|
| `LuckiestGuy-Regular.ttf` | github.com/google/fonts (`apache/luckiestguy`) | Astigmatic (AOETI) | Apache 2.0 | Sí | No obligatoria en vídeo |
| `Baloo2-SemiBold.ttf`, `Baloo2-ExtraBold.ttf` | github.com/google/fonts (`ofl/baloo2`) | Ek Type | SIL OFL 1.1 | Sí | No obligatoria en vídeo |
| `PlayfairDisplay-Black.ttf` | github.com/google/fonts (`ofl/playfairdisplay`) | Claus Eggers Sørensen | SIL OFL 1.1 | Sí | No obligatoria en vídeo |
| `SourceSans3-Bold.ttf`, `SourceSans3-Black.ttf` | github.com/google/fonts (`ofl/sourcesans3`) | Paul D. Hunt (Adobe) | SIL OFL 1.1 | Sí | No obligatoria en vídeo |
| `Nunito-Bold.ttf`, `Nunito-Black.ttf` | github.com/google/fonts (`ofl/nunito`) | Vernon Adams y colaboradores | SIL OFL 1.1 | Sí | No obligatoria en vídeo |

- Baloo 2 y Nunito se descargaron como fuentes variables y se convirtieron a pesos fijos con
  `fonttools varLib.instancer` (la OFL permite versiones modificadas; no se venden por separado).
- Textos completos de las licencias en `recursos/fuentes/licencias/`.
- Descargadas el 2026-09-23 (Playfair Display y Source Sans 3, el 2026-09-27: tipografías del canal "Asombroso y Real",
  pesos fijos con `varLib.instancer --update-name-table`). Luckiest Guy, Baloo 2 y Nunito se conservan como
  valores por defecto del kit (`herramientas/canal.py`).

## Música (`recursos/musica/`)

Música **original del canal**, generada con `herramientas/gen_musica.py` (sintetizador propio en Python,
sin muestras ni modelos de terceros). No hay licencia de terceros ni atribución: es obra propia.
Se descartó la Biblioteca de audio de YouTube (al usuario no le convenció ninguna pista) y las IA
musicales gratuitas (MusicGen, Stable Audio: licencias no comerciales o limitadas).

| Archivo | Ambiente | Semilla | Uso |
|---|---|---|---|
| `alegre.wav` | alegre (marimba, pizzicato, bajo, batería suave; 118 bpm) | 1 | Gancho, salida, viajes |
| `tranquilo.wav` | tranquilo (caja de música y pad; 84 bpm) | 1 | Fondo de las explicaciones |
| `misterio.wav` | misterio (pizzicato en re menor; 92 bpm) | 1 | Giro final |

Regenerar: `.venv/bin/python herramientas/gen_musica.py <ambiente> -o recursos/musica/<ambiente>.wav --semilla 1`

### Música de Suno por vídeo (opcional, desde el 2026-10-02)

Un vídeo puede llevar música encargada a **Suno** a través de ai33.pro (`herramientas/musica_ai33.py`, en
`<vídeo>/musica/`). **No es obra propia**: antes de publicar hay que comprobar (1) las condiciones de uso
comercial de Suno para música generada a través de un revendedor como ai33 y (2) que YouTube no ponga
reclamaciones de Content ID (hay quien registra pistas hechas con Suno). Si hay duda, montar con la música propia
(volver a elegir «Propia del canal» en la UI).

## Efectos de sonido (`recursos/sfx/`)

Origen: pixabay.com/sound-effects, descargados por el usuario el 2026-09-23.
Licencia: **Pixabay Content License** (pixabay.com/service/license-summary/): uso comercial
permitido, atribución no obligatoria. No se permite revender o redistribuir los sonidos sueltos.
Procesados con `herramientas/prep_sfx.py` (recorte de silencios, pico -3 dBFS, WAV 48 kHz estéreo).

| Archivo | Uso | Autor en Pixabay | ID Pixabay | Archivo original |
|---|---|---|---|---|
| `pop.wav` | Aparece rótulo/imagen | dragon-studio | 402324 | `dragon-studio-pop-402324.mp3` |
| `whoosh.wav` | Transición | ribhavagrawal | 230554 | `ribhavagrawal-woosh-230554.mp3` |
| `boing.wav` | Momento cómico | universfield | 229137 | `universfield-cartoon-spring-229137.mp3` |
| `ding.wav` | Dato curioso / acierto | dragon-studio | 472366 | `dragon-studio-ding-sfx-472366.mp3` |
| `record_scratch.wav` | "Espera, ¿qué?" | freesound_community | 108233 | `freesound_community-record_scratch-108233.mp3` |
| `redoble.wav` | Antes de una revelación | lazychillzone | 228357 | `lazychillzone-drum-roll-3-228357.mp3` |
| `remate_chiste.wav` | Remate de chiste | universfield | 242242 | `universfield-comedy-drum-roll-242242.mp3` |
| `error.wav` | Mito falso / error | freesound_community | 47985 | `freesound_community-wrong-47985.mp3` |

Añadidos el 2026-09-25 desde el "Kit 05 · Editor de vídeo vertical" (`~/Documents/IA/Kits/05-kit-editor-video/
assets/sfx/`). Su catálogo (`sonidos.json`) declara **Pixabay Content License** (uso comercial permitido,
sin atribución obligatoria), pero NO indica autor ni ID de Pixabay: no se ha podido comprobar el
origen de cada uno. Si algún día hace falta acreditarlos, buscarlos en Pixabay o sustituirlos.

| Archivo | Uso | Archivo del kit |
|---|---|---|
| `brillo.wav` | Descubrimiento, algo mágico | `sparkle.mp3` |
| `ping.wav` | Subraya una cifra o un rótulo | `ping.mp3` |
| `campanilla.wav` | Acierto, confirmación | `chime.mp3` |
| `impacto.wav` | Revelación, giro final | `impact-bass-1.mp3` |
| `clic.wav` | Tok pulsa un botón | `click.mp3` |
| `interferencia.wav` | Confusión de Tok (circuitos cruzados) | `glitch-1.mp3` |

Voz de Tok (`toc_toc.wav`, `tok_*.wav`): obra propia generada con Gemini TTS (voz "Puck") y filtrada con
ffmpeg (`voz_tok.py`); archivados con el canal en `canales/_archivo/los-viajes-de-tok/` (recursos/sfx y herramientas); sin licencias de terceros.
