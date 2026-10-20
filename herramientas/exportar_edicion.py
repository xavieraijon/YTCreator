"""Exporta las pistas de un vídeo ya montado para editarlo fuera (DaVinci Resolve, Final Cut Pro, Premiere).

Uso:
    .venv/bin/python herramientas/exportar_edicion.py videos/001-pulpo/guion.json

No gasta nada ni genera nada nuevo (voz, imágenes, música): empaqueta en un .zip, en la carpeta del vídeo
(exportacion.zip), lo que ya hay montado:
  - imagenes/EE-N.png (o clips/EE-N.<ext> si es un "video") en el orden del vídeo.
  - voz/escena-EE.wav (cada escena) y voz/locucion_completa.wav (todas seguidas, con sus silencios).
  - musica/<ambiente>.<ext> (solo los ambientes usados) y efectos/<nombre>.wav (solo los sonados).
  - subtitulos.srt (si existe).
  - timeline.fcpxml (Final Cut Pro y DaVinci Resolve: vídeo, voz, música y efectos en pistas separadas) y
    timeline.edl (CMX3600, de reserva: solo vídeo + voz, para el editor que no acepte el FCPXML).
  - LEEME.txt con lo que no se puede traducir (el movimiento de cámara, los fundidos finos de la música).

Lee tmp/linea_tiempo.json (lo escribe montar.py): TRADUCE esa línea de tiempo a los formatos de arriba, no
la recalcula. Por eso monta el vídeo antes si no existe o está desactualizada.
"""

import argparse
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import canal  # noqa: E402
import montar  # noqa: E402

FPS = montar.FPS


def _linea_tiempo(carpeta):
    archivo = carpeta / "tmp" / "linea_tiempo.json"
    try:
        return json.loads(archivo.read_text(encoding="utf-8"))
    except FileNotFoundError:
        sys.exit("ERROR: falta tmp/linea_tiempo.json (lo deja montar.py): monta el vídeo antes de exportarlo")
    except (OSError, json.JSONDecodeError) as e:
        sys.exit(f"ERROR: tmp/linea_tiempo.json dañado: {e}")


def _voz_por_escena(carpeta, n_esc):
    """[(wav, datos)] de cada escena real (sin la pantalla final); para antes exige que exista."""
    salida = []
    for i in range(1, n_esc + 1):
        wav, js = carpeta / "voz" / f"{i:02d}.wav", carpeta / "voz" / f"{i:02d}.json"
        if not (wav.exists() and js.exists()):
            sys.exit(f"ERROR: falta la voz de la escena {i} ({wav.name}): monta el vídeo antes de exportarlo")
        try:
            datos = json.loads(js.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            sys.exit(f"ERROR: {js} dañado: {e}")
        salida.append((wav, datos))
    return salida


def _voz_completa(voces, durs, salida):
    """Concatena la voz de cada escena (rellenada hasta su duración exacta), como la pista de voz de
    mezclar_audio pero sin música ni efectos: la locución sola, para remezclar fuera."""
    entradas, filtros = [], []
    for i, (wav, dur) in enumerate(zip(voces, durs)):
        entradas += ["-i", str(wav)]
        filtros.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur={dur:.4f}[v{i}]")
    n = len(durs)
    filtros.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[voz]")
    montar.ffmpeg(*entradas, "-filter_complex", ";".join(filtros), "-map", "[voz]", "-c:a", "pcm_s16le", salida)


def _efectos_de(datos_voz, durs):
    """[(ruta_sfx, nombre, t_absoluto)] de cada marca de efecto (no {img}) de las escenas reales."""
    efectos, t = [], 0.0
    for (_, datos), dur in zip(datos_voz, durs):
        for m in datos["marcas"]:
            if m["nombre"] != montar.MARCA_IMAGEN:
                archivo = montar.ruta_sfx(m["nombre"])
                if archivo.exists():
                    efectos.append((archivo, m["nombre"], round(t + m["t"], 3)))
        t += dur
    return efectos


def _musica_de(guion, carpeta, durs):
    """[(ruta, nombre, inicio, fin)] de los tramos de música (montar.tramos_musica, sin recalcular nada
    nuevo: música propia del vídeo si hay, si no la del canal, como al montar)."""
    montar.CARPETA_VIDEO = carpeta
    musicas = montar.musicas_por_escena(guion)
    tramos = montar.tramos_musica(musicas, durs)
    return [(archivo, Path(archivo).stem, ini, fin) for archivo, ini, fin in tramos]


def _rt(segundos):
    """Tiempo FCPXML como fracción de fotogramas (evita redondeos): «90/30s» = 3 s a 30 fps."""
    return f"{round(segundos * FPS)}/{FPS}s"


def _tc(segundos):
    """Timecode HH:MM:SS:FF (EDL, no-drop) a FPS fotogramas por segundo."""
    total = round(segundos * FPS)
    ff, total = total % FPS, total // FPS
    ss, total = total % 60, total // 60
    mm, hh = total % 60, total // 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}:{ff:02d}"


def _escapar(texto):
    return (texto or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _fcpxml(nombre_video, ancho, alto, duracion, planos, img_zip, pistas_audio):
    """pistas_audio: [(zip_name, duracion_s, [(offset, duracion, nombre)])], una lista por pista (voz,
    música, efectos); cada clip de audio va anclado (lane) al primer plano, con el offset absoluto porque
    ese primer plano empieza en 0."""
    recursos, spine = [], []
    rid = 1

    def nuevo_id():
        nonlocal rid
        rid += 1
        return f"r{rid}"

    r_formato = "r1"
    recursos.append(f'<format id="{r_formato}" name="FFVideoFormat{alto}p{FPS}" '
                    f'frameDuration="1/{FPS}s" width="{ancho}" height="{alto}"/>')

    ids_imagen = {}
    for p in planos:
        clave = img_zip[p["id"]]
        if clave not in ids_imagen:
            rimg = nuevo_id()
            ids_imagen[clave] = rimg
            recursos.append(f'<asset id="{rimg}" name="{_escapar(p["id"])}" src="{clave}" '
                            f'hasVideo="1" format="{r_formato}" duration="0s" start="0s"/>')
        spine.append(f'<asset-clip ref="{ids_imagen[clave]}" name="{_escapar(p["id"])}" '
                     f'offset="{_rt(p["inicio"])}" duration="{_rt(p["fin"] - p["inicio"])}" '
                     f'start="{_rt(p.get("desde", 0))}"/>')

    lanes, lane_n = [], 0
    for zip_name, dur_archivo, instancias in pistas_audio:
        if not instancias:
            continue
        lane_n -= 1
        raudio = nuevo_id()
        recursos.append(f'<asset id="{raudio}" name="{_escapar(Path(zip_name).stem)}" src="{zip_name}" '
                        f'hasAudio="1" duration="{_rt(dur_archivo)}" audioSources="1" audioChannels="2"/>')
        for offset, dur, nombre in instancias:
            lanes.append(f'<asset-clip ref="{raudio}" name="{_escapar(nombre)}" lane="{lane_n}" '
                         f'offset="{_rt(offset)}" duration="{_rt(dur)}"/>')

    if spine and lanes:
        primero = spine[0][:-2] + ">" + "".join(lanes) + "</asset-clip>"
        spine[0] = primero
    cuerpo_spine = "\n          ".join(spine)
    cuerpo_recursos = "\n    ".join(recursos)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    {cuerpo_recursos}
  </resources>
  <library>
    <event name="CanalYT">
      <project name="{_escapar(nombre_video)}">
        <sequence format="{r_formato}" duration="{_rt(duracion)}" tcStart="0s" tcFormat="NDF">
          <spine>
          {cuerpo_spine}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
'''


def _edl(nombre_video, planos, con_voz, duracion_voz):
    """CMX3600 mínimo (de reserva): pista de vídeo (imágenes y clips, reel AX) + voz completa en A2 (reel
    AX2). La música y los efectos, solo en el FCPXML: EDL no estandariza bien más de dos pistas de audio."""
    lineas = [f"TITLE: {nombre_video}", "FCM: NON-DROP FRAME", ""]
    n = 0
    for p in planos:
        n += 1
        ini, fin = _tc(p["inicio"]), _tc(p["fin"])
        lineas.append(f"{n:03d}  AX       V     C        {ini} {fin} {ini} {fin}")
        lineas.append(f"* FROM CLIP NAME: {p['id']}")
        lineas.append("")
    if con_voz:
        n += 1
        fin = _tc(duracion_voz)
        lineas.append(f"{n:03d}  AX2      A2    C        00:00:00:00 {fin} 00:00:00:00 {fin}")
        lineas.append("* FROM CLIP NAME: locucion_completa.wav")
        lineas.append("")
    return "\n".join(lineas) + "\n"


def _leeme(sin_pantalla_final):
    texto = """Exportación de CanalYT para montar fuera
==========================================

- imagenes/ y clips/: en el orden del vídeo, un archivo por plano (EE-N).
- voz/: cada escena suelta (escena-EE.wav) y la locución entera ya unida (locucion_completa.wav).
- musica/ y efectos/: solo los que de verdad suenan en este vídeo.
- subtitulos.srt: los mismos subtítulos del vídeo montado.
- timeline.fcpxml: ábrelo en DaVinci Resolve o Final Cut Pro (Archivo → Importar → Línea de tiempo XML).
  Trae el vídeo en la pista principal y la voz, la música y los efectos en pistas de audio por debajo.
- timeline.edl: de reserva, si el FCPXML no importa bien. Solo trae el vídeo y la voz completa (A2); la
  música y los efectos no entran (EDL no estandariza bien más de dos pistas).

Lo que NO se traduce (hay que rehacerlo a mano en el editor):
- El movimiento de cámara de cada imagen (zoom/paneo): llega como una imagen fija; el editor la anima si
  quiere.
- Los fundidos finos de la música y el "ducking" (bajar la música mientras habla la voz): la música llega
  entera, sin mezclar.
- El volumen final (normalizado a -14 LUFS en el montaje de CanalYT): cada pista llega a su volumen
  original.
"""
    if sin_pantalla_final:
        texto += "\n- La pantalla final (si este vídeo la lleva) no tiene voz ni efectos propios: solo su imagen,\n  en la pista de vídeo, en su sitio.\n"
    return texto


def main():
    p = argparse.ArgumentParser(description="Exporta voz, imágenes, música, efectos y subtítulos de un vídeo "
                                             "montado en un .zip con línea de tiempo (FCPXML/EDL) para editarlo "
                                             "fuera (DaVinci Resolve, Final Cut, Premiere)")
    p.add_argument("guion", help="Ruta del guion.json del vídeo (ya montado)")
    p.add_argument("--destino", help="Ruta del .zip (por defecto exportacion.zip en la carpeta del vídeo)")
    a = p.parse_args()

    ruta_guion, guion = canal.leer_guion(a.guion)
    carpeta = ruta_guion.parent
    linea = _linea_tiempo(carpeta)
    n_esc = len(guion["escenas"])
    durs_todas = [e["fin"] - e["inicio"] for e in linea["escenas"]]
    durs = durs_todas[:n_esc]       # sin la pantalla final, si la hay (una escena "de más" al final)
    if len(durs_todas) < n_esc:
        sys.exit("ERROR: tmp/linea_tiempo.json no tiene tantas escenas como el guion: vuelve a montar el vídeo")

    voz_por_escena = _voz_por_escena(carpeta, n_esc)
    efectos = _efectos_de(voz_por_escena, durs)
    tramos_musica = _musica_de(guion, carpeta, durs)

    tmp = carpeta / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    voz_completa_wav = tmp / "exportar_voz_completa.wav"
    print("1/3 Uniendo la voz de todas las escenas…")
    _voz_completa([w for w, _ in voz_por_escena], durs, voz_completa_wav)

    formato = guion.get("formato", "horizontal")
    ancho, alto = montar.TAMANOS[formato]
    nombre_video = guion.get("titulo") or carpeta.name
    destino = Path(a.destino) if a.destino else carpeta / "exportacion.zip"
    destino.parent.mkdir(parents=True, exist_ok=True)

    print("2/3 Empaquetando imágenes, voz, música y efectos…")
    img_zip = {}
    musica_zip, musica_duracion = {}, {}
    efectos_zip = {}
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as zf:
        for pl in linea["planos"]:
            origen = Path(pl.get("video") or pl["imagen"])
            carpeta_zip = "clips" if pl.get("video") else "imagenes"
            nombre_zip = f"{carpeta_zip}/{pl['id']}{origen.suffix}"
            zf.write(origen, nombre_zip)
            img_zip[pl["id"]] = nombre_zip
        for wav, _ in voz_por_escena:
            zf.write(wav, f"voz/escena-{wav.stem}.wav")
        zf.write(voz_completa_wav, "voz/locucion_completa.wav")
        for archivo, nombre, _, _ in tramos_musica:
            if nombre not in musica_zip:
                nombre_zip = f"musica/{nombre}{Path(archivo).suffix}"
                zf.write(archivo, nombre_zip)
                musica_zip[nombre] = nombre_zip
                musica_duracion[nombre] = montar.duracion_s(archivo)
        for archivo, nombre, _ in efectos:
            if nombre not in efectos_zip:
                nombre_zip = f"efectos/{nombre}.wav"
                zf.write(archivo, nombre_zip)
                efectos_zip[nombre] = nombre_zip
        srt = carpeta / "subtitulos.srt"
        if srt.exists():
            zf.write(srt, "subtitulos.srt")

        print("3/3 Traduciendo la línea de tiempo (FCPXML y EDL)…")
        duracion_voz = sum(durs)
        pistas_audio = [("voz/locucion_completa.wav", duracion_voz, [(0.0, duracion_voz, "locución")])]
        for nombre, nombre_zip in musica_zip.items():
            instancias = [(ini, fin - ini, nombre) for archivo, n, ini, fin in tramos_musica if n == nombre]
            pistas_audio.append((nombre_zip, musica_duracion[nombre], instancias))
        for nombre, nombre_zip in efectos_zip.items():
            dur_sfx = next(montar.duracion_s(ruta_sfx_orig) for ruta_sfx_orig, n, _ in efectos if n == nombre)
            instancias = [(t, dur_sfx, nombre) for _, n, t in efectos if n == nombre]
            pistas_audio.append((nombre_zip, dur_sfx, instancias))

        zf.writestr("timeline.fcpxml", _fcpxml(nombre_video, ancho, alto, linea["duracion"], linea["planos"],
                                                img_zip, pistas_audio))
        zf.writestr("timeline.edl", _edl(nombre_video, linea["planos"], bool(voz_por_escena), duracion_voz))
        zf.writestr("LEEME.txt", _leeme(len(durs_todas) > n_esc))

    voz_completa_wav.unlink(missing_ok=True)
    print(f"OK: {destino.relative_to(montar.RAIZ)} ({destino.stat().st_size / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
