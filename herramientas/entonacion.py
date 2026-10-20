"""Revisa la entonación de una locución: finales de frase que suben, acentos que caen al final y cortes
(la voz arranca, se calla en seco y vuelve a empezar).

Uso:
    .venv/bin/python herramientas/entonacion.py videos/NNN-slug          # todas las voces del vídeo
    .venv/bin/python herramientas/entonacion.py videos/NNN-slug/voz/03.wav
    .venv/bin/python herramientas/entonacion.py muestra.mp3 --todas      # ver también las que están bien

Por qué (2026-09-28): eleven_v3 a veces acaba las frases hacia arriba, como una pregunta, y a veces
carga la fuerza en la última sílaba de una palabra llana ("sobreviviera…" sonó "sobrevivierá"). Tras
cada locución se pasa esta revisión y se repiten SOLO los bloques marcados (preguntando antes el coste).

Qué mide (sin cuota: el audio y los tiempos por palabra del .json que deja gen_voz.py / montar.py):
en cada palabra seguida de puntuación compara la primera y la segunda mitad de la palabra.
  SUBE AL ACABAR   fin de frase (. … : ; ») con el tono de la 2.ª mitad > 1,2 × el de la 1.ª. Las
                   preguntas (?) no cuentan; antes de una coma, subir es normal (la frase sigue).
  FINAL FUERTE     palabra llana o esdrújula de 5+ letras cuya 2.ª mitad suena > 0,7 × de fuerte que la
                   1.ª (lo normal es 0,2-0,4): el acento se ha ido a la última sílaba. Las agudas
                   ("después", "Vermont") se saltan. Antes de una coma, solo si además el tono sube.
Umbrales calibrados con 4 tomas escuchadas por el usuario (videos/_pruebas/voz_documental/javier_rojas):
buenas 0,19-0,41 de volumen; malas 0,74-1,00. Ajustarlos si marca cosas que suenan bien.
Con susurros ([whispers]) no hay tono que medir: solo se comprueba el volumen.
"""

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "herramientas"))
import archivos  # noqa: E402
import canal  # noqa: E402
import proveedores  # noqa: E402

FRECUENCIA = 16000
UMBRAL_SUBE = 1.2        # tono 2.ª mitad / 1.ª mitad en un fin de frase
UMBRAL_FUERTE = 0.7      # volumen 2.ª mitad / 1.ª mitad en una llana o esdrújula
UMBRAL_ENTRECORTADA = 3.0  # silencios en mitad de frase por cada 10 s (sonaba bien: 1,0-1,8; mal: 3,6)
CREDITOS_CARACTER = proveedores.valor("ai33.creditos_por_caracter")   # ai33 con marcas de emoción
FIN_FRASE = ".…:;»"
PUNTUACION = FIN_FRASE + ",?!"
TILDES = "áéíóú"
VOCALES = "aeiouáéíóúü"


def es_aguda(palabra):
    """Acento en la última sílaba según las reglas de acentuación del castellano."""
    p = re.sub(r"[^a-záéíóúüñ]", "", palabra.lower())
    con_tilde = [i for i, c in enumerate(p) if c in TILDES]
    if con_tilde:
        return not any(c in VOCALES for c in p[con_tilde[-1] + 1:])
    return bool(p) and p[-1] not in VOCALES + "ns"


def cargar_audio(ruta):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(ruta), "-ac", "1", "-ar", str(FRECUENCIA),
                        "-f", "s16le", "-"], capture_output=True)
    if r.returncode:
        sys.exit(f"ERROR ffmpeg con {ruta}: {r.stderr.decode()[:200]}")
    return np.frombuffer(r.stdout, dtype=np.int16).astype(float) / 32768


def tramos(audio, t0, t1):
    """(volumen, tono en Hz o 0 si no hay voz sonora) cada 10 ms entre t0 y t1."""
    ventana, paso, salida = int(0.04 * FRECUENCIA), int(0.01 * FRECUENCIA), []
    minimo, maximo = FRECUENCIA // 300, FRECUENCIA // 70          # tono de voz entre 70 y 300 Hz
    for i in range(int(t0 * FRECUENCIA), int(t1 * FRECUENCIA) - ventana, paso):
        f = audio[i:i + ventana] * np.hanning(ventana)
        volumen = float(np.sqrt(np.mean(f ** 2)))
        ac = np.correlate(f, f, "full")[ventana - 1:]
        k = minimo + int(np.argmax(ac[minimo:maximo]))
        sonora = ac[k] / (ac[0] + 1e-9) > 0.45 and volumen > 0.01
        salida.append((volumen, FRECUENCIA / k if sonora else 0.0))
    return salida


def medir_palabra(audio, palabra):
    t = tramos(audio, palabra["inicio"], palabra["fin"])
    if len(t) < 6:
        return None
    mitad = len(t) // 2
    a, b = t[:mitad], t[mitad:]
    vol = np.mean([v for v, _ in b]) / (np.mean([v for v, _ in a]) + 1e-9)
    ta, tb = [f for _, f in a if f], [f for _, f in b if f]
    tono = float(np.median(tb) / np.median(ta)) if len(ta) >= 3 and len(tb) >= 3 else None
    return {"volumen": float(vol), "tono": tono}


def rafagas(audio):
    """Segundos donde la voz «se corta y arranca de golpe» (2026-10-01, Gabo con eleven_v4, «Allí esperó»):
    una ráfaga corta de sonido (< 160 ms) entre un silencio y un silencio ABSOLUTO de ≥ 80 ms. En una voz
    sana los silencios dentro de la frase nunca bajan a −62 dB; en estos fallos el modelo suelta el arranque
    de la palabra, se calla y vuelve a empezar. Las 8 tomas de la prueba de voces que sonaban bien: 0 avisos."""
    paso = FRECUENCIA // 200                                      # 5 ms
    n = len(audio) // paso
    if n < 3:
        return []
    db = 20 * np.log10(np.sqrt((audio[:n * paso].reshape(n, paso) ** 2).mean(1)) + 1e-9)
    muerto = db < -62
    tramos, i = [], 0
    while i < n:
        j = i
        while j < n and muerto[j] == muerto[i]:
            j += 1
        tramos.append((bool(muerto[i]), i, j))
        i = j
    seg = lambda k: (tramos[k][2] - tramos[k][1]) * paso / FRECUENCIA
    return [tramos[k][1] * paso / FRECUENCIA for k in range(1, len(tramos) - 1)
            if not tramos[k][0] and tramos[k - 1][0] and tramos[k + 1][0]
            and 0.015 <= seg(k) < 0.16 and seg(k - 1) >= 0.05 and seg(k + 1) >= 0.08]


def entrecortada(audio, palabras):
    """Silencios en mitad de frase (≥ 150 ms bajo −50 dB detrás de una palabra sin puntuación) por cada 10 s.
    2026-10-01, Juanjo con eleven_v4 a velocidad 1,2: la escena 2 del 001 sonaba «palabra … palabra» con 3,6
    por 10 s; las que sonaban bien, 1,0-1,8. Por encima de UMBRAL_ENTRECORTADA se marca la escena."""
    paso = FRECUENCIA // 200
    n = len(audio) // paso
    if n < 10 or not palabras:
        return 0.0, []
    db = 20 * np.log10(np.sqrt((audio[:n * paso].reshape(n, paso) ** 2).mean(1)) + 1e-9)
    huecos, i = [], 0
    while i < n:
        if db[i] < -50:
            j = i
            while j < n and db[j] < -50:
                j += 1
            t = i * paso / FRECUENCIA
            if (j - i) * paso / FRECUENCIA >= 0.15 and i > 0 and j < n:
                antes = [p for p in palabras if p["inicio"] <= t]
                if antes and antes[-1]["texto"].rstrip()[-1:] not in PUNTUACION + "—»":
                    huecos.append((t, antes[-1]["texto"]))
            i = j
        else:
            i += 1
    return len(huecos) / (len(audio) / FRECUENCIA) * 10, huecos


def revisar(audio, palabras, todas=False):
    """Lista de (palabra, medida, problemas) de las palabras seguidas de puntuación y de los cortes."""
    salida = []
    for t in rafagas(audio):
        cerca = min(palabras, key=lambda p: abs(p["inicio"] - t)) if palabras else None
        p = {"inicio": t, "texto": f"en {cerca['texto']}" if cerca else "?"}
        salida.append((p, {"tono": None, "volumen": 0.0}, ["CORTE: la voz arranca, se calla y vuelve a empezar"]))
    densidad, huecos = entrecortada(audio, palabras)
    if densidad > UMBRAL_ENTRECORTADA:
        p = {"inicio": huecos[0][0], "texto": "toda la escena"}
        ejemplos = ", ".join(f"«{w}…»" for _, w in huecos[:4])
        salida.append((p, {"tono": None, "volumen": 0.0},
                       [f"ENTRECORTADA: {len(huecos)} silencios en mitad de frase ({densidad:.1f} por 10 s; {ejemplos})"]))
    for i, p in enumerate(palabras):
        texto = p["texto"]
        if not (texto[-1] in PUNTUACION or i == len(palabras) - 1):
            continue
        m = medir_palabra(audio, p)
        if not m:
            continue
        problemas = []
        fin_frase = texto[-1] in FIN_FRASE or i == len(palabras) - 1
        if fin_frase and texto[-1] not in "?!" and m["tono"] and m["tono"] > UMBRAL_SUBE:
            problemas.append(f"sube al acabar (+{round((m['tono'] - 1) * 100)} %)")
        letras = re.sub(r"[^\w]", "", texto)
        # Antes de una coma mantener la fuerza es normal (la frase sigue): solo cuenta si además sube.
        sube = bool(m["tono"] and m["tono"] > UMBRAL_SUBE)
        if len(letras) >= 5 and not es_aguda(texto) and m["volumen"] > UMBRAL_FUERTE and (fin_frase or sube):
            problemas.append(f"final fuerte ({m['volumen']:.2f}): acento en la última sílaba")
        if problemas or todas:
            salida.append((p, m, problemas))
    return sorted(salida, key=lambda r: r[0]["inicio"])


def linea(p, m, problemas):
    tono = f"tono ×{m['tono']:.2f}" if m["tono"] else "tono —   "
    estado = "; ".join(problemas) if problemas else "ok"
    return f"{p['inicio']:6.1f} s  «{p['texto']}»".ljust(34) + f"{tono}  vol ×{m['volumen']:.2f}  {estado}"


def revisar_archivo(ruta, todas):
    datos = Path(ruta).with_suffix(".json")
    if not datos.exists():
        sys.exit(f"ERROR: falta {datos.name} (los tiempos por palabra que deja gen_voz.py)")
    resultado = revisar(cargar_audio(ruta), json.loads(datos.read_text(encoding="utf-8"))["palabras"], todas)
    malas = [r for r in resultado if r[2]]
    for r in resultado:
        print(linea(*r))
    print(f"{Path(ruta).name}: {len(malas)} problema(s)" if malas else f"{Path(ruta).name}: sin problemas")
    return len(malas)


def grave(r):
    """¿Aviso claro (repetir) o leve (al límite del umbral: escuchar)?"""
    p, m, problemas = r
    texto = " ".join(problemas)
    if "CORTE" in texto:
        return True
    d = re.search(r"\(([\d.]+) por 10 s", texto)
    if d and float(d.group(1)) > UMBRAL_ENTRECORTADA + 0.5:
        return True
    if "sube al acabar" in texto and m["tono"] and m["tono"] > 1.6:
        return True
    return "final fuerte" in texto and m["volumen"] > 0.85


def revisar_video(carpeta, todas):
    _, guion = canal.leer_guion(carpeta / "guion.json")
    escenas = guion["escenas"]
    # Solo las escenas cuya voz está al día: si cambió el texto, la voz o el reparto en bloques, el audio
    # que queda en voz/ es viejo (se locutará de nuevo) y sus avisos no cuentan.
    try:
        import montar
        vigentes = {i for b in montar.voces_previstas(guion, carpeta, set()) if b["hecho"] for i in b["bloque"]}
    except Exception:                                   # sin montar.py a mano: todas las que tengan audio
        vigentes = set(range(1, len(escenas) + 1))
    viejas = 0
    bloques, revisadas, con_fallos, fallos = {}, 0, 0, {}
    for n in range(1, len(escenas) + 1):
        wav = carpeta / "voz" / f"{n:02d}.wav"
        if not wav.exists():
            continue
        if n not in vigentes:
            viejas += 1
            continue
        canal.progreso(n - 1, len(escenas), f"Escena {n}")
        revisadas += 1
        d = json.loads(wav.with_suffix(".json").read_text(encoding="utf-8"))
        resultado = revisar(cargar_audio(wav), d["palabras"], todas)
        if not resultado:
            continue
        print(f"Escena {n:02d}:")
        for r in resultado:
            print("  " + linea(*r))
        if any(r[2] for r in resultado):
            con_fallos += 1
            fallos[n] = resultado
            bloque = tuple(d.get("bloque") or (n, n))
            bloques.setdefault(bloque, []).append(n)
    if viejas:
        print(f"({viejas} escenas con audio viejo, de otra voz o de otro texto: no se revisan; se locutarán de nuevo.)")
    def constancia(claras, leves, resumen):
        """voz/entonacion.json: la guía de la UI da el paso por hecho si es posterior a la última voz."""
        archivos.escribir_json(carpeta / "voz" / "entonacion.json",
                               {"fecha": time.strftime("%Y-%m-%dT%H:%M:%S"), "revisadas": revisadas, "escenas": len(escenas),
                                "claras": claras, "leves": leves, "resumen": resumen}, indent=1, final_linea=False)

    if not revisadas:
        print("Entonación: no hay ninguna escena con la voz al día que revisar.")
        return 0
    if not bloques:
        resumen = f"Entonación: sin problemas en las {revisadas} escenas locutadas."
        constancia([], [], resumen)
        print(resumen)
        return 0
    # Desde el 01/10 se repite UNA escena (montar.py --escena-sola N, ↻ en la UI) y no el bloque entero.
    # Avisos claros: se repiten. Leves: al límite del umbral; el usuario dio por buenas escenas así (001,
    # escenas 2 y 3: «libros.» 0,75 y «procedimiento.» +57 %), así que solo se escuchan.
    claras, leves = [], []
    for n, resultado in sorted(fallos.items()):
        (claras if any(grave(r) for r in resultado if r[2]) else leves).append(n)
    coste = lambda ns: round(sum(len(" ".join(re.sub(r"\{[^}]*\}|\[[^]]*\]", " ", escenas[i - 1]["texto"]).split()))
                                 for i in ns) * CREDITOS_CARACTER)
    if claras:
        print(f"\nRepetir solo estas escenas (≈ {coste(claras)} créditos, de pago; ↻ junto a su audio en la UI):")
        for n in claras:
            print(f"  .venv/bin/python herramientas/montar.py {carpeta / 'guion.json'} --escena-sola {n} --gastar-ai33"
                  f"   (≈ {coste([n])} créditos)")
        print("Si una escena falla dos veces, cambiar la frase (reglas de voz del guionista) en vez de repetir.")
    if leves:
        print("\nAvisos leves (al límite): escúchalas y repite solo si se nota: escenas "
              + ", ".join(str(n) for n in leves) + ".")
    # La última línea es el resumen que enseña la UI en la tarjeta de la tarea.
    if con_fallos * 2 > revisadas:
        consejo = "casi todas fallan: el problema es el texto, pide cambios del guion antes de repetir"
    elif claras:
        consejo = (f"repite SOLO las escenas {', '.join(map(str, claras))} (≈ {coste(claras)} créditos, ↻ en Locución)"
                   + (f"; escucha las {', '.join(map(str, leves))} (avisos leves)" if leves else ""))
    else:
        consejo = f"nada claro que repetir; escucha las escenas {', '.join(map(str, leves))} (avisos leves, al límite)"
    resumen = f"Resumen: {con_fallos} de {revisadas} escenas con avisos; {consejo}."
    constancia(claras, leves, resumen)
    print("\n" + resumen)
    return len(bloques)


def main():
    ap = argparse.ArgumentParser(description="Revisa la entonación de una locución (finales y acentos)")
    ap.add_argument("ruta", help="Carpeta de un vídeo (con guion.json y voz/) o un audio con su .json")
    ap.add_argument("--todas", action="store_true", help="Mostrar también las palabras que están bien")
    a = ap.parse_args()
    ruta = canal.ruta(a.ruta)
    if ruta.is_dir():
        revisar_video(ruta, a.todas)
    elif ruta.exists():
        revisar_archivo(ruta, a.todas)
    else:
        sys.exit(f"ERROR: no existe {ruta}")


if __name__ == "__main__":
    main()
