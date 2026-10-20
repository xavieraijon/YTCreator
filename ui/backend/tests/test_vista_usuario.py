"""Bloque 3 del recorrido profano: lo que se enseña, con nombres de persona (fuentes con nombre, afiliación donde se usa,
frases con mayúscula y sin la fase A como paso)."""
import json

from app import estado_video, fases_ui, guia, tramos


def _ctx(carpeta, estado=None):
    return tramos.Ctx(video=None, guia=guia.Contexto(carpeta=carpeta, carpeta_canal=carpeta, estado=estado or {},
                                                    guion={}, imagenes=[]), cfg={})


def test_fuentes_con_nombre_desde_fuentes_md(tmp_path):
    (tmp_path / "fuentes.md").write_text(
        "# Fuentes\n"
        "- **[AND21]** Andrillon, T. «Predicting lapses of attention», *Nature* 2021. https://nature.com/x · otra: https://y\n"
        "- **[MON]** Monash Lens, sin título entre comillas. https://lens.monash.edu/z\n"
        "- [SIN] Una fuente sin enlace\n", encoding="utf-8")
    (tmp_path / "investigacion.json").write_text(json.dumps({"datos": [{"texto": "a", "estado": "comprobado",
                                                                        "fuentes": ["[AND21]"]}]}))
    f = tramos.datos_investigacion(_ctx(tmp_path))["fuentes"]
    assert f["[AND21]"] == {"nombre": "Predicting lapses of attention", "url": "https://nature.com/x"}
    assert f["[MON]"]["nombre"] == "Monash Lens, sin título entre comillas" and f["[SIN]"]["url"] is None


def test_fuentes_de_la_lista_de_claude_mandan(tmp_path):
    (tmp_path / "fuentes.md").write_text("- **[AND21]** Otro nombre. https://otra\n")
    (tmp_path / "investigacion.json").write_text(json.dumps({"fuentes_lista": [
        {"codigo": "AND21", "nombre": "Nature Communications, 2021", "url": "https://nature.com/x"}]}))
    assert tramos.datos_investigacion(_ctx(tmp_path))["fuentes"] == {
        "[AND21]": {"nombre": "Nature Communications, 2021", "url": "https://nature.com/x"}}


def test_afiliacion_en_la_publicacion_no_en_la_investigacion(tmp_path):
    (tmp_path / "investigacion.json").write_text(json.dumps({"afiliacion": [{"titulo": "Un libro", "url": "https://l"}]}))
    assert "afiliacion" not in tramos.datos_investigacion(_ctx(tmp_path))
    assert tramos.datos_publicacion(_ctx(tmp_path))["afiliacion"] == [{"titulo": "Un libro", "url": "https://l"}]
    t = next(x for x in tramos.TRAMOS["H"] if x.id == "h-publicacion")
    assert t.datos is tramos.datos_publicacion


def test_enfoques_con_mayuscula(tmp_path):
    (tmp_path / "propuestas.json").write_text(json.dumps({"propuestas": [
        {"id": 1, "titulo": "el gato", "enfoque": "el fenómeno explicado", "pilar": "ciencia", "en": "cats"}]}))
    p = fases_ui.leer_propuestas(tmp_path)[0][0]
    assert p["titulo"] == "El gato" and p["enfoque"] == "El fenómeno explicado"
    assert p["pilar"] == "ciencia" and p["en"] == "cats"                       # claves y búsquedas, tal cual


def test_la_fase_a_no_es_un_paso_del_usuario(tmp_path):
    ctx = guia.Contexto(carpeta=tmp_path, carpeta_canal=tmp_path, estado={"fase": "B", "completadas": ["A"]},
                        guion={}, imagenes=[])
    e = estado_video.calcular("largo", ctx)
    assert [f["letra"] for f in e["fases"]][0] == "B" and e["paso"] == 1 and e["pasos"] == 9
    antiguo = guia.Contexto(carpeta=tmp_path, carpeta_canal=tmp_path, estado={"fase": "A"}, guion={}, imagenes=[])
    assert estado_video.calcular("largo", antiguo)["fases"][0]["letra"] == "A"      # vídeos antiguos que siguen en ella
