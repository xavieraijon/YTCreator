"""Muestra la cuota gratuita disponible.

Uso:
    .venv/bin/python herramientas/cuota.py
    .venv/bin/python herramientas/cuota.py --json      # las mismas cifras en JSON (la UI las lee así)
    .venv/bin/python herramientas/cuota.py --previsto-neuronas 3000 --previsto-caracteres 9000

- Cloudflare Workers AI: 10.000 neuronas al día. Las neuronas se leen de la analítica real de Cloudflare
  (el token necesita el permiso Account Analytics: Read); si no se puede, se estiman con data/uso.jsonl.
  La documentación habla de reinicio a las 00:00 UTC, pero el 24/09/2026 bloqueaba con 0 neuronas gastadas
  ese día: se muestran el día UTC y las últimas 24 h, y se toma la más restrictiva. Si se agota, da error
  (nunca cobra en el plan gratuito).
- Azure Speech F0: 500.000 caracteres al mes de voz neural; se reinicia el día 1 (UTC). Para las voces
  HD no está documentado si comparten esta cuota. Un recurso F0 nunca cobra: si se agota, da error.
- ai33.pro (DE PAGO, créditos comprados): saldo real leído de su API, y lo gastado según data/uso.jsonl.
  Voz ≈ 1 crédito/carácter; imagen ≈ 750-1.400 según el modelo (gen_imagen.py --precio lo consulta).
"""

import argparse
import datetime as dt
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import requests  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

import espacio  # noqa: E402
import proveedores  # noqa: E402
import uso  # noqa: E402

CONSULTA = """query($a: String!, $f: AccountAiInferenceAdaptiveGroupsFilter_InputObject) {
  viewer { accounts(filter: {accountTag: $a}) {
    aiInferenceAdaptiveGroups(limit: 500, filter: $f, orderBy: [datetimeHour_ASC]) {
      sum { totalNeurons } count dimensions { datetimeHour }
    } } } }"""

NEURONAS_DIA = proveedores.valor("cloudflare.neuronas_dia")
CARACTERES_MES = proveedores.valor("azure.caracteres_mes")
CREDITOS_POR_CARACTER_AI33 = proveedores.valor("ai33.creditos_por_caracter")


# Por qué falta un dato real (para no pintar «sin saldo» cuando solo no hay conexión): servicio → motivo.
MOTIVOS: dict[str, str] = {}


def _motivo(servicio: str, error: Exception | None = None, codigo: int | None = None) -> None:
    """sin_conexion (sin internet o el servicio no contesta), rechazada (clave no válida) o respuesta_rara."""
    if isinstance(error, (requests.ConnectionError, requests.Timeout)):
        MOTIVOS[servicio] = "sin_conexion"
    elif codigo in (401, 403):
        MOTIVOS[servicio] = "rechazada"
    else:
        MOTIVOS[servicio] = "respuesta_rara"


def creditos_ai33():
    """Saldo de ai33.pro, o None si no hay clave o no responde (el motivo, en MOTIVOS["ai33"])."""
    load_dotenv(espacio.ENV)
    clave = os.getenv("AI33_API_KEY", "").strip()
    if not clave:
        return None
    try:
        r = requests.get("https://api.ai33.pro/v1/credits", headers={"xi-api-key": clave}, timeout=20)
    except requests.RequestException as e:
        _motivo("ai33", e)
        return None
    try:
        return int(r.json()["credits"])
    except (ValueError, KeyError, TypeError):
        _motivo("ai33", codigo=r.status_code)
        return None


def gastado_ai33():
    """Créditos de ai33 gastados según data/uso.jsonl: (hoy, total)."""
    hoy, total, inicio_hoy = 0, 0, dt.datetime.now().replace(hour=0, minute=0, second=0).timestamp()
    if uso.REGISTRO.exists():
        for linea in uso.REGISTRO.read_text(encoding="utf-8").splitlines():
            d = __import__("json").loads(linea)
            if d["servicio"].startswith("ai33") and d.get("cantidad"):
                total += d["cantidad"]
                hoy += d["cantidad"] if d["t"] >= inicio_hoy else 0
    return round(hoy), round(total)


def neuronas_reales(desde):
    """Neuronas por hora desde `desde` según la analítica de Cloudflare: [(hora_utc, neuronas, llamadas)].
    Devuelve None si no hay credenciales o el token no tiene permiso."""
    load_dotenv(espacio.ENV)
    cuenta, token = os.getenv("CF_ACCOUNT_ID", "").strip(), os.getenv("CF_API_TOKEN", "").strip()
    if not cuenta or not token:
        return None
    filtro = {"datetime_geq": desde.strftime("%Y-%m-%dT%H:%M:%SZ")}
    try:
        r = requests.post("https://api.cloudflare.com/client/v4/graphql", timeout=30,
                          headers={"Authorization": f"Bearer {token}"},
                          json={"query": CONSULTA, "variables": {"a": cuenta, "f": filtro}})
    except requests.RequestException as e:
        _motivo("cloudflare", e)
        return None
    try:
        grupos = r.json()["data"]["viewer"]["accounts"][0]["aiInferenceAdaptiveGroups"]
    except (KeyError, IndexError, TypeError, ValueError):
        # Sin permiso de analítica es lo normal (se estima con data/uso.jsonl): solo cuenta como fallo una clave rechazada.
        if r.status_code in (401, 403):
            _motivo("cloudflare", codigo=r.status_code)
        return None
    horas = {}
    for g in grupos:
        h = dt.datetime.fromisoformat(g["dimensions"]["datetimeHour"].replace("Z", "+00:00"))
        n, c = horas.get(h, (0, 0))
        horas[h] = (n + g["sum"]["totalNeurons"], c + g["count"])
    return sorted((h, n, c) for h, (n, c) in horas.items())


def resumen_real(ahora):
    """Uso real del día UTC y de las últimas 24 h, y cuándo se liberan neuronas si la ventana es móvil."""
    horas = neuronas_reales(ahora - dt.timedelta(hours=25))
    if horas is None:
        return None
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    hace_24h = ahora - dt.timedelta(hours=24)
    dia = sum(n for h, n, _ in horas if h >= inicio_dia)
    # La analítica agrupa por horas: una hora cuenta en la ventana mientras no haya terminado hace 24 h.
    ventana = [(h, n) for h, n, _ in horas if h + dt.timedelta(hours=1) > hace_24h]
    return {"dia": dia, "llamadas_dia": sum(c for h, _, c in horas if h >= inicio_dia),
            "ventana": sum(n for _, n in ventana), "horas_ventana": ventana}


def cuando_caben(horas_ventana, necesarias):
    """Hora (local) a la que, con ventana móvil de 24 h, quedarán libres `necesarias` neuronas."""
    usadas = sum(n for _, n in horas_ventana)
    for h, n in horas_ventana:
        if NEURONAS_DIA - usadas >= necesarias:
            break
        usadas -= n
        libre_desde = h + dt.timedelta(hours=25)
    else:
        if NEURONAS_DIA - usadas < necesarias:
            return None
    if NEURONAS_DIA - sum(n for _, n in horas_ventana) >= necesarias:
        return "ya"
    return libre_desde.astimezone().strftime("%d/%m %H:%M")


def resumen():
    ahora = dt.datetime.now(dt.timezone.utc)
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    inicio_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    registros = uso.leer()
    neuronas = sum(r["cantidad"] for r in registros if r["servicio"] == "cloudflare" and r["t"] >= inicio_dia)
    imagenes = sum(1 for r in registros if r["servicio"] == "cloudflare" and r["t"] >= inicio_dia)
    caracteres = sum(r["cantidad"] for r in registros if r["servicio"] == "azure" and r["t"] >= inicio_mes)
    manana = (ahora + dt.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "neuronas_hoy": round(neuronas), "imagenes_hoy": imagenes,
        "neuronas_libres": max(0, NEURONAS_DIA - round(neuronas)),
        "caracteres_mes": caracteres, "caracteres_libres": max(0, CARACTERES_MES - caracteres),
        "reinicio_cloudflare": manana.astimezone().strftime("%d/%m %H:%M"),
    }


def datos():
    """Las cifras de cuota en un dict (lo que imprime main y lo que lee la UI con --json)."""
    MOTIVOS.clear()
    ahora = dt.datetime.now(dt.timezone.utc)
    r = resumen()
    real = resumen_real(ahora)
    cf = {"total": NEURONAS_DIA, "real": bool(real), "motivo": MOTIVOS.get("cloudflare"), "usadas_dia": r["neuronas_hoy"], "usadas_24h": None,
          "libres": r["neuronas_libres"], "libre_imagen": None, "reinicio": r["reinicio_cloudflare"]}
    if real:
        cf.update(usadas_dia=round(real["dia"]), usadas_24h=round(real["ventana"]),
                  libres=max(0, round(NEURONAS_DIA - max(real["dia"], real["ventana"]))),
                  libre_imagen=cuando_caben(real["horas_ventana"], 110))    # cuándo cabe la siguiente imagen
    siguiente_mes = (ahora.replace(day=1) + dt.timedelta(days=32)).replace(day=1, hour=0, minute=0, second=0,
                                                                          microsecond=0)
    saldo = creditos_ai33()
    hoy, total = gastado_ai33()
    comprados = proveedores.valor("ai33.creditos_comprados")
    coste_video = round(proveedores.valor("video.caracteres_de_pago") * proveedores.valor("ai33.creditos_por_caracter")
                        + proveedores.valor("video.imagenes_ai33") * proveedores.valor("ai33.creditos_por_imagen")
                        + proveedores.valor("video.ambientes_musica") * proveedores.valor("ai33.creditos_por_encargo_musica"))
    tarifa = proveedores.valor("ai33.euros_por_millon_creditos")
    # Conciliación: lo que dice el saldo real (comprados − saldo) frente a lo apuntado por las herramientas. La diferencia
    # es lo gastado fuera de ellas (la web de ai33, pruebas) o un cambio de saldo ajeno (créditos regalados, otra compra).
    gastado_real = max(0, comprados - saldo) if saldo is not None else None
    return {
        "consultado": ahora.isoformat(),
        "cloudflare": cf,
        "azure": {"total": CARACTERES_MES, "usados": r["caracteres_mes"], "libres": r["caracteres_libres"],
                  "reinicio": siguiente_mes.astimezone().strftime("%d/%m")},
        "ai33": {"saldo": saldo, "motivo": MOTIVOS.get("ai33"), "gastado_hoy": hoy, "gastado_total": total, "euros_por_millon": tarifa,
                 "comprados": comprados, "gastado_real": gastado_real,
                 "sin_registrar": None if gastado_real is None else gastado_real - total,
                 "coste_video": coste_video, "coste_video_euros": round(coste_video * tarifa / 1_000_000, 2),
                 "videos_que_caben": None if saldo is None or not coste_video else saldo // coste_video},
    }, real


def main():
    p = argparse.ArgumentParser(description="Cuota gratuita disponible")
    p.add_argument("--previsto-neuronas", type=float, default=0, help="Neuronas que necesitará un vídeo")
    p.add_argument("--previsto-caracteres", type=int, default=0, help="Caracteres de voz que necesitará")
    p.add_argument("--previsto-ai33", type=float, default=0, help="Créditos de ai33 que necesitará")
    p.add_argument("--json", action="store_true", help="Las cifras en JSON (para la UI)")
    a = p.parse_args()
    d, real = datos()
    if a.json:
        print(__import__("json").dumps(d, ensure_ascii=False))
        return
    r = resumen()
    if real:
        r["neuronas_libres"] = d["cloudflare"]["libres"]
        print("Cloudflare (imágenes), consumo REAL según su analítica:")
        print(f"  día UTC: {real['dia']:.0f} neuronas en {real['llamadas_dia']} llamadas; "
              f"últimas 24 h: {real['ventana']:.0f} neuronas")
        print(f"  libres ≈ {r['neuronas_libres']} de {NEURONAS_DIA} (la más restrictiva de las dos cuentas)")
    else:
        print("Cloudflare (imágenes), hoy (ESTIMACIÓN; no se pudo leer la analítica real):")
        print(f"  usadas ≈ {r['neuronas_hoy']} neuronas en {r['imagenes_hoy']} imágenes; "
              f"libres ≈ {r['neuronas_libres']} de {NEURONAS_DIA} (se reinicia el {r['reinicio_cloudflare']} hora local)")
    print("Azure (voz), este mes:")
    print(f"  usados {r['caracteres_mes']} caracteres; libres {r['caracteres_libres']} de {CARACTERES_MES}")
    saldo, hoy, total = d["ai33"]["saldo"], d["ai33"]["gastado_hoy"], d["ai33"]["gastado_total"]
    print("ai33.pro (DE PAGO):")
    no_hay = {"sin_conexion": "sin conexión con ai33", "rechazada": "ai33 rechaza la clave",
              "respuesta_rara": "ai33 ha respondido algo inesperado"}.get(d["ai33"]["motivo"] or "", "¿AI33_API_KEY?")
    print(f"  saldo {saldo:,} créditos".replace(",", ".") if saldo is not None else f"  saldo: no disponible ({no_hay})")
    print(f"  gastado con las herramientas: {hoy:,} hoy; {total:,} en total".replace(",", "."))
    if a.previsto_ai33 and saldo is not None:
        print(f"Previsto ai33: {a.previsto_ai33:,.0f} créditos → quedarían {saldo - a.previsto_ai33:,.0f}".replace(",", "."))
    if a.previsto_neuronas:
        dias = 1 if a.previsto_neuronas <= r["neuronas_libres"] else \
            1 + math.ceil((a.previsto_neuronas - r["neuronas_libres"]) / NEURONAS_DIA)
        print(f"Previsto: {a.previsto_neuronas:.0f} neuronas → {'cabe hoy' if dias == 1 else f'{dias} días'}")
        if real and dias > 1:
            cuando = cuando_caben(real["horas_ventana"], min(a.previsto_neuronas, NEURONAS_DIA))
            if cuando and cuando != "ya":
                print(f"  Con ventana móvil de 24 h habrá sitio a partir del {cuando} hora local")
    if a.previsto_caracteres:
        cabe = a.previsto_caracteres <= r["caracteres_libres"]
        print(f"Previsto: {a.previsto_caracteres} caracteres → {'cabe este mes' if cabe else 'NO cabe este mes'}")
    if not real:
        print("(Estimación con data/uso.jsonl; para el dato real el token necesita Account Analytics: Read.)")


if __name__ == "__main__":
    main()
