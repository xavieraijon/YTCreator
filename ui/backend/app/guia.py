"""Guía paso a paso de la producción de un vídeo o Short, tal como la describen .claude/commands/nuevo-video.md
y nuevo-short.md (fases, pasos, quién los hace y puntos de aprobación). Si cambian los comandos, actualizar
aquí (tests/test_guia.py comprueba que las fases coinciden).

El estado de cada paso se deduce de los archivos del vídeo cuando se puede (existe escaleta.md, no quedan
imágenes por generar…); los que no se pueden comprobar solo se dan por hechos al cerrar su fase. Las
aprobaciones se guardan en estado.json ("aprobaciones" y "cambios_pedidos"), que Claude lee al continuar."""

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from functools import cached_property
from pathlib import Path
from typing import Callable

import archivos  # noqa: E402  (herramientas/, en sys.path por config)
import esquema  # noqa: E402
import proveedores  # noqa: E402


@dataclass
class Contexto:
    carpeta: Path                  # carpeta del vídeo
    carpeta_canal: Path
    estado: dict
    guion: dict
    imagenes: list                 # modelos.Imagen del índice

    def existe(self, *nombres):
        return all((self.carpeta / n).exists() for n in nombres)

    def hay(self, patron):
        return any(self.carpeta.glob(patron))

    def contiene(self, nombre, texto):
        try:
            return texto.lower() in (self.carpeta / nombre).read_text(encoding="utf-8").lower()
        except OSError:
            return False

    def por_generar(self):
        return sum(i.origen == "prompt" and (not i.existe or i.desactualizada) for i in self.imagenes)

    def marcadas_mal(self):
        """Imágenes marcadas como mal en la UI (revision_imagenes.json) que siguen sin darse por buenas."""
        try:
            marcas = json.loads((self.carpeta / "revision_imagenes.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return 0
        return sum(m.get("estado") == "mal" for m in marcas.values())

    def entonacion_al_dia(self):
        """«Entonación» pasada después de la última locución y con toda la voz hecha. Sus avisos informan; la
        decisión es del usuario al aprobar la voz (puede dar por buena una escena con aviso)."""
        js = self.carpeta / "voz" / "entonacion.json"
        try:
            d = json.loads(js.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        voces = list((self.carpeta / "voz").glob("[0-9][0-9].wav"))
        ultima = max((v.stat().st_mtime for v in voces), default=0)
        return js.stat().st_mtime >= ultima and d.get("revisadas") == d.get("escenas")

    def musica_elegida(self):
        """Cada ambiente del guion tiene elegida una versión de Suno (musica/musica.json → "elegida")."""
        try:
            datos = json.loads((self.carpeta / "musica" / "musica.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        actual, ambientes = self.guion.get("musica"), set()
        for e in self.guion.get("escenas", []):
            actual = e.get("musica", actual)
            if actual and actual != "ninguna" and "/" not in actual:
                ambientes.add(actual)
        return bool(ambientes) and all((datos.get(a) or {}).get("elegida") for a in ambientes)

    def musica_elegida_por_ambiente(self) -> dict:
        """Réplica de montar.musica_elegida: {ambiente: versión elegida}."""
        try:
            datos = json.loads((self.carpeta / "musica" / "musica.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return {a: d["elegida"] for a, d in sorted(datos.items()) if isinstance(d, dict) and d.get("elegida")}

    def con_voz(self):
        return bool(self.guion.get("voz_archivo")) or self.hay("voz/*.mp3") or self.hay("voz/*.wav")

    # --- Vigencia: si lo producido sigue correspondiendo a lo de antes (guion → voz → imágenes → montaje) -----------

    @cached_property
    def cfg(self) -> dict:
        try:
            return json.loads((self.carpeta_canal / "canal.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def ultima(self, patron) -> float:
        """Fecha (mtime) del archivo más reciente que encaja con el patrón; 0 si no hay ninguno."""
        return max((p.stat().st_mtime for p in self.carpeta.glob(patron)), default=0.0)

    @cached_property
    def voz(self) -> dict:
        """{"sin_voz": [escenas sin locutar], "cambiadas": [escenas cuyo texto o voz ha cambiado desde que se
        locutaron]}. Mismo criterio que montar.escenas_cambiadas: voz/NN.json guarda el texto con el que se locutó
        (desde el 01/10; los anteriores no se pueden comparar y se dan por buenos). Con una locución hecha fuera
        (voz_archivo) no se comprueba por escenas."""
        escenas = self.guion.get("escenas") or []
        if not escenas or self.guion.get("voz_archivo"):
            return {"sin_voz": [], "cambiadas": []}
        voz_canal = self.guion.get("voz") or self.cfg.get("voz")
        sin_voz, cambiadas = [], []
        for i, e in enumerate(escenas, 1):
            base = self.carpeta / "voz" / f"{i:02d}"
            if not base.with_suffix(".wav").exists():
                sin_voz.append(i)
                continue
            try:
                datos = json.loads(base.with_suffix(".json").read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            voz = e.get("voz") or voz_canal
            if ("texto" in datos and datos["texto"] != e.get("texto")) or (voz and datos.get("voz") and datos["voz"] != voz):
                cambiadas.append(i)
        return {"sin_voz": sin_voz, "cambiadas": cambiadas}

    def caracteres(self, escenas: list[int]) -> int:
        """Caracteres que se locutan de esas escenas (como montar.voces_previstas: sin marcas {…})."""
        todas = self.guion.get("escenas") or []
        return sum(len(" ".join(re.sub(r"\{[^}]*\}", " ", todas[i - 1].get("texto", "")).split()))
                   for i in escenas if 0 < i <= len(todas))

    @cached_property
    def montaje(self) -> dict:
        """{"existe", "al_dia", "motivos": [por qué hay que volver a montar]}. El montaje es final.mp4; está al día si
        nada de lo que contiene es posterior a él (voz, imágenes, música elegida) ni está pendiente de rehacer, y si
        el guion es el mismo con el que se montó (montaje.json, que deja montar.py)."""
        final = self.carpeta / "final.mp4"
        if not final.exists():
            return {"existe": False, "al_dia": False, "motivos": []}
        t = final.stat().st_mtime
        motivos = []
        v = self.voz
        if v["cambiadas"]:
            motivos.append("hay escenas con la voz por rehacer")
        elif v["sin_voz"]:
            motivos.append("hay escenas con la voz por hacer")
        elif self.ultima("voz/[0-9][0-9].wav") > t:
            motivos.append("la voz ha cambiado después de montarlo")
        if self.por_generar():
            motivos.append("hay imágenes por rehacer")
        elif self.ultima("img/*.png") > t:
            motivos.append("hay imágenes nuevas desde que se montó")
        try:
            registro = json.loads((self.carpeta / "montaje.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            registro = None
        elegida = self.musica_elegida_por_ambiente()
        if (elegida != registro.get("musica", {}) if registro
                else elegida and self.ultima("musica/musica.json") > t):    # montajes de antes de montaje.json
            motivos.append("la música elegida ha cambiado")
        if registro and registro.get("escenas") != huella_escenas(self.guion.get("escenas") or []):
            motivos.append("el guion ha cambiado desde el montaje")
        return {"existe": True, "al_dia": not motivos, "motivos": motivos}

    def montaje_al_dia(self):
        return self.montaje["al_dia"]

    def voz_completa(self):
        """Toda la voz locutada y con el texto actual."""
        return self.con_voz() and not self.voz["sin_voz"] and not self.voz["cambiadas"]

    def en_historial(self):
        try:
            texto = (self.carpeta_canal / "docs" / "historial.md").read_text(encoding="utf-8")
        except OSError:
            return False
        return self.carpeta.name in texto        # la carpeta exacta: «001» a secas puede ser de otro canal o vídeo


def huella_escenas(escenas) -> str:
    """Réplica de montar.huella_escenas (tests/test_estado_real.py comprueba que coinciden)."""
    texto = json.dumps(escenas, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(texto.encode()).hexdigest()[:12]


Comprobacion = Callable[[Contexto], bool]


@dataclass
class Paso:
    id: str
    texto: str
    quien: str                                 # claude | tu | herramienta
    detalle: str = ""
    agente: str | None = None                  # narrativa, guionista, director-arte, verificador, estratega-youtube
    herramienta: str | None = None             # clave de tareas.HERRAMIENTAS (se lanza desde la UI)
    ver: str | None = None                     # pestaña o documento donde mirarlo: "imagenes", "doc:escaleta.md"…
    hecho: Comprobacion | None = None          # None: no se puede comprobar (se da por hecho al cerrar la fase)
    aprobacion: bool = False                   # punto de aprobación: lo decides tú
    opcional: bool = False


@dataclass
class FaseGuia:
    letra: str
    nombre: str
    objetivo: str
    pasos: list[Paso] = field(default_factory=list)


LARGO = [
    FaseGuia("A", "Arranque", "Comprobar que el kit funciona y cuánta cuota hay antes de empezar.", [
        Paso("a-cuota", "Mirar la cuota disponible", "herramienta", "Cloudflare, Azure y ai33 (arriba, en la cabecera).",
             herramienta="cuota"),
        Paso("a-probar", "Probar el kit", "herramienta", "≈ 1-2 min, sin gastar cuota de imágenes.",
             herramienta="probar_kit", opcional=True),
    ]),
    FaseGuia("B", "Tema y duración", "Elegir un tema que «parece inventado y es real», con hueco en YouTube.", [
        Paso("b-referencia", "Analizar un vídeo de referencia", "tu",
             "Si tienes la URL de uno que funcionó: página del canal → «Vídeos de referencia». Solo se toma la "
             "estructura, nunca el texto.", opcional=True),
        Paso("b-temas", "Proponer 5 temas", "claude",
             "Con pilar, enfoque, título, gancho y por qué puede funcionar (de ideas.md y nuevos).", agente="narrativa"),
        Paso("b-hueco", "Medir la saturación de cada tema (regla del hueco)", "claude",
             "Semáforo con saturacion.py: nada en rojo; en ámbar, solo con ángulo propio.", herramienta="saturacion"),
        Paso("b-aprobar", "Aprobar tema, enfoque y duración", "tu",
             "10, 12 o 14 min (nunca menos de 8). Aprueba con el botón, o escribe tu elección en el comentario "
             "(p. ej. «enfoque 1, 10 min»).", aprobacion=True,
             # Con la carpeta creada desde la UI (fase A) el tema ya está; se puede aprobar en cuanto empieza la B.
             hecho=lambda c: bool(c.estado.get("duracion_objetivo")) or c.estado.get("fase") not in (None, "A")),
    ]),
    FaseGuia("C", "Investigación", "Datos verificados en al menos 2 fuentes fiables, separando lo comprobado.", [
        Paso("c-fuentes", "Investigar y anotar las fuentes", "claude", "fuentes.md: cada dato con sus fuentes.",
             ver="doc:fuentes.md", hecho=lambda c: c.existe("fuentes.md")),
        Paso("c-separar", "Separar comprobado, hipótesis y leyendas", "claude",
             "La promesa del canal es «…y real»: las cifras sin respaldo, fuera o dichas como leyenda.",
             ver="doc:fuentes.md", hecho=lambda c: c.contiene("fuentes.md", "hipótesis")),
        Paso("c-afiliacion", "Buscar enlaces de afiliación honestos", "claude", "Libros o audiolibros del caso.",
             ver="doc:fuentes.md", opcional=True, hecho=lambda c: c.contiene("fuentes.md", "afiliación")),
        Paso("c-aprobar", "Dar por buena la investigación", "tu",
             "Datos comprobados, hipótesis y leyendas, y si el tema da para la duración elegida.", aprobacion=True,
             ver="doc:fuentes.md", hecho=lambda c: c.existe("fuentes.md")),
    ]),
    FaseGuia("D", "Escaleta y guion", "Del esquema al texto definitivo para la voz, verificado y con sus prompts.", [
        Paso("d-empaquetado", "Decidir título y miniatura (empaquetado)", "claude",
             "Ángulo, 5 títulos, qué muestra y qué oculta la miniatura, y la promesa que el gancho confirmará en 10 s.",
             agente="estratega-youtube", ver="doc:empaquetado.md", hecho=lambda c: c.existe("empaquetado.md")),
        Paso("d-aprobar-empaquetado", "Aprobar el empaquetado", "tu",
             "El guion tendrá que cumplir lo que prometen el título y la miniatura.", aprobacion=True,
             ver="doc:empaquetado.md", hecho=lambda c: c.existe("empaquetado.md")),
        Paso("d-escaleta", "Escribir la escaleta", "claude",
             "Escena a escena: gancho, actos con su pregunta y su recompensa, giro y cierre.",
             agente="narrativa", ver="doc:escaleta.md", hecho=lambda c: c.existe("escaleta.md")),
        Paso("d-aprobar-escaleta", "Aprobar la escaleta", "tu",
             "Es mucho más barato cambiar aquí que en el guion.", aprobacion=True, ver="doc:escaleta.md",
             hecho=lambda c: c.existe("escaleta.md")),
        Paso("d-guion", "Escribir el guion", "claude", "guion.json (para la voz) y guion.md (para leer).",
             agente="guionista", ver="guion", hecho=lambda c: c.existe("guion.json", "guion.md")),
        Paso("d-verificar", "Verificar los datos del guion", "claude", "Cada afirmación contra las fuentes.",
             agente="verificador", ver="doc:verificacion.md", hecho=lambda c: c.existe("verificacion.md")),
        Paso("d-estructura", "Revisar ritmo y estructura", "claude",
             "Bucles sin cerrar, datos contados con más seguridad de la que tienen, dónde se iría el espectador.",
             agente="narrativa", ver="doc:revision_estructura.md", hecho=lambda c: c.existe("revision_estructura.md")),
        Paso("d-brief", "Escribir el brief visual", "claude", "Época, lugar, vestuario, objetos y personajes fijos.",
             agente="director-arte", ver="doc:brief_visual.md", hecho=lambda c: c.existe("brief_visual.md")),
        Paso("d-prompts", "Escribir un prompt por imagen", "claude", "Con su ficha de plano, reutilizaciones y miniaturas.",
             agente="director-arte", ver="prompts", hecho=lambda c: bool(c.imagenes)),
        Paso("d-revisar", "Revisión automática del guion", "herramienta", "Sin errores; los avisos, corregidos o justificados.",
             herramienta="revisar_guion"),
        Paso("d-solape", "Comprobar que el guion no copia la referencia", "claude",
             "Solo con vídeo de referencia: estructura_referencia.py --comparar guion.json URL; error si el solape pasa del 3 %.",
             opcional=True),
        Paso("d-aprobar-guion", "Aprobar el guion", "tu", "Lee guion.md: duración, imágenes y coste previstos.",
             aprobacion=True, ver="doc:guion.md", hecho=lambda c: c.existe("guion.json", "guion.md")),
    ]),
    FaseGuia("E", "Voz", "La locución completa, con un tono de documental sereno.", [
        Paso("e-locucion", "Locutar con ai33 (API) desde «Voz y montaje»", "tu",
             "De pago (≈ 1,15 créditos por carácter; no hay muestras gratis): la tarjeta «Locución» da el coste "
             "exacto. Primero un bloque de prueba; lo escuchas en la misma tarjeta.", ver="montaje",
             hecho=lambda c: c.voz_completa()),
        Paso("e-texto", "Alternativa: texto para la web de ai33", "claude",
             "Si prefieres locutar en su web: Claude te da el texto listo para pegar (también se paga). Luego "
             "súbela en la tarjeta «Locución» → «Subir una locución propia» y pulsa «Preparar la locución» (gratis).",
             opcional=True),
        Paso("e-entonacion", "Revisar la entonación (gratis)", "herramienta",
             "Mide los audios ya locutados: finales que suben como pregunta, acentos en la última sílaba y "
             "cortes (la voz arranca, se calla y vuelve a empezar). Dice qué bloques repetir; si casi todos "
             "fallan, el problema es el texto.",
             herramienta="entonacion", hecho=lambda c: c.entonacion_al_dia()),
        Paso("e-aprobar", "Escuchar y aprobar la voz", "tu",
             "¿Mala toma? «Repetir» en la tarjeta. ¿Texto poco natural? «Pedir cambios» y «Aplicar los cambios "
             "con Claude»: reescribe esas escenas y vuelven a salir como pendientes de locutar.",
             aprobacion=True, ver="montaje", hecho=lambda c: c.voz_completa()),
    ]),
    FaseGuia("F", "Imágenes", "Todas las imágenes del guion hechas, revisadas y con el estilo del canal.", [
        Paso("f-google", "Prompts para Gemini/Flow (miniaturas y clips)", "claude", "google/PROMPTS.md, solo para lo que más luce.",
             opcional=True, hecho=lambda c: c.existe("google/PROMPTS.md")),
        Paso("f-boceto", "Boceto (storyboard en baja)", "herramienta", "En el Mac, sin cuota; ocupa el portátil un rato.",
             herramienta="boceto", opcional=True, hecho=lambda c: c.existe("boceto.mp4")),
        Paso("f-generar", "Generar las imágenes", "herramienta",
             "klein gratis (Cloudflare o el Mac) y las de ai33 de pago (con confirmación del coste).",
             herramienta="imagenes", ver="imagenes", hecho=lambda c: bool(c.imagenes) and c.por_generar() == 0),
        Paso("f-revisar", "Revisar la hoja de contactos", "claude",
             "Estilo, anatomía, época sin anacronismos, sin texto deformado y que cuente lo que dice la voz.",
             agente="director-arte", ver="imagenes", hecho=lambda c: c.existe("tmp/contactos.png")),
        Paso("f-marcadas", "Rehacer las imágenes marcadas como mal", "tu",
             "En el visor: «Está mal» con el motivo y el servicio. Las rehechas se revisan y se marcan «Está bien».",
             ver="imagenes", hecho=lambda c: c.marcadas_mal() == 0),
        Paso("f-aprobar", "Aprobar las imágenes", "tu", "Mira cada una a tamaño grande: tú encuentras fallos que se escapan.",
             aprobacion=True, ver="imagenes",
             hecho=lambda c: bool(c.imagenes) and c.por_generar() == 0 and c.marcadas_mal() == 0),
    ]),
    FaseGuia("G", "Montaje y control", "final.mp4 sincronizado, legible y sin nada cortado.", [
        Paso("g-musica", "Música de fondo con Suno", "tu",
             "Opcional y de pago (≈ 3.600 créditos por ambiente, 2 versiones): en «Voz y montaje» → «Música», revisa "
             "el prompt de cada ambiente, encárgalo, escucha las versiones y elige una. Sin elegir, se usa la música "
             "propia del canal (gratis). Antes de publicar, revisa la licencia de Suno.", ver="montaje",
             opcional=True, hecho=lambda c: c.musica_elegida()),
        Paso("g-montar", "Montar el vídeo", "herramienta",
             "final.mp4 con pantalla final, subtítulos, miniaturas y publicacion.md. Gratis; ocupa el portátil un rato.",
             herramienta="montar", ver="montaje", hecho=lambda c: c.montaje_al_dia()),
        Paso("g-control", "Control de calidad por fotogramas", "herramienta",
             "Sincronía imagen-voz, rótulos legibles, ninguna imagen de más de 10 s.", herramienta="fotogramas",
             hecho=lambda c: c.existe("tmp/control.png")),
        Paso("g-aprobar", "Ver final.mp4 y aprobarlo", "tu", "Claude te dice qué mirar.", aprobacion=True, ver="montaje",
             hecho=lambda c: c.montaje_al_dia()),
    ]),
    FaseGuia("H", "Miniatura y publicación", "Todo listo para subir: miniatura, textos, subtítulos y fuentes.", [
        Paso("h-miniatura", "Elegir la miniatura", "tu", "Las 3 se pueden subir a «Probar y comparar».", agente="estratega-youtube",
             aprobacion=True, ver="montaje", hecho=lambda c: c.hay("miniatura_*.jpg")),
        Paso("h-subtitulos", "Subtítulos en inglés", "claude", "subtitulos_en.srt (traducción natural).",
             hecho=lambda c: c.existe("subtitulos_en.srt")),
        Paso("h-publicacion", "Textos de publicación revisados", "claude",
             "Títulos, descripción con fuentes y capítulos, etiquetas, comentario fijado.", agente="estratega-youtube",
             ver="doc:publicacion_final.md", hecho=lambda c: c.existe("publicacion_final.md")),
    ]),
    FaseGuia("I", "Cierre", "El vídeo, anotado y guardado; ideas nuevas para el siguiente.", [
        Paso("i-aprendizajes", "Aprender de tus ediciones del guion", "claude",
             "comparar_guion.py (entregado frente a locutado) → reglas nuevas para la ficha del guionista.",
             agente="guionista", ver="doc:aprendizajes.md", hecho=lambda c: c.existe("aprendizajes.md")),
        Paso("i-aprobar-aprendizajes", "Aprobar las reglas aprendidas", "tu",
             "Las que apruebes se aplican a todos los guiones siguientes.", aprobacion=True,
             ver="doc:aprendizajes.md", hecho=lambda c: c.existe("aprendizajes.md")),
        Paso("i-historial", "Añadirlo al historial del canal", "claude", "Con la duración real y el pilar.",
             hecho=lambda c: c.en_historial()),
        Paso("i-ideas", "Proponer 3 ideas nuevas medidas", "claude", "Con su semáforo, a ideas.md.", agente="narrativa"),
        Paso("i-subir", "Subirlo a YouTube", "tu", "Con docs/guia_subida.md y publicacion_final.md."),
    ]),
    FaseGuia("J", "Publicado y resultados", "El vídeo ya está en YouTube: su enlace y sus números a las 48 h y a los 7 días.", [
        Paso("j-publicado", "Registrar el enlace y la fecha de publicación", "tu", "Desde ahí se cuentan las 48 h y los 7 días.",
             hecho=lambda c: bool((c.estado.get("publicacion") or {}).get("url"))),
        Paso("j-48h", "Resultados a las 48 horas (visitas, CTR, retención)", "tu", "De YouTube Studio → Analytics.",
             hecho=lambda c: bool((c.estado.get("metricas") or {}).get("48h"))),
        Paso("j-7d", "Resultados a los 7 días", "tu", "Con esto se decide qué cambiar en el siguiente vídeo.",
             hecho=lambda c: bool((c.estado.get("metricas") or {}).get("7d"))),
    ]),
]

SHORT = [
    FaseGuia("A", "Arranque y enfoque", "Un gancho de ≤ 10 palabras apoyado en un dato del vídeo largo.", [
        Paso("sa-enfoques", "Proponer 2-3 enfoques", "claude", "Con su gancho y el dato en el que se apoyan; medidos con saturacion.py.",
             herramienta="saturacion"),
        Paso("sa-aprobar", "Elegir el enfoque", "tu", "Al elegir se crea la carpeta del Short.", aprobacion=True,
             hecho=lambda c: c.existe("estado.json")),
    ]),
    FaseGuia("B", "Guion", "90-140 palabras, imagen cada 2-4 s y un final que remite al vídeo largo.", [
        Paso("sb-guion", "Escribir el guion", "claude", "guion.json vertical y guion.md.", agente="guionista", ver="guion",
             hecho=lambda c: c.existe("guion.json", "guion.md")),
        Paso("sb-verificar", "Verificar el dato", "claude", "Si no estaba verificado en el vídeo largo.", agente="verificador",
             opcional=True),
        Paso("sb-prompts", "Prompts en vertical", "claude", "Sujeto grande y centrado; nada importante en el tercio inferior.",
             agente="director-arte", ver="prompts", hecho=lambda c: bool(c.imagenes)),
        Paso("sb-revisar", "Revisión automática del guion", "herramienta", "Sin errores.", herramienta="revisar_guion"),
        Paso("sb-aprobar", "Aprobar el guion", "tu", "Con la duración estimada y las imágenes.", aprobacion=True,
             ver="doc:guion.md", hecho=lambda c: c.existe("guion.json", "guion.md")),
    ]),
    FaseGuia("C", "Voz e imágenes", "La locución y todas las imágenes, revisadas una a una.", [
        Paso("sc-voz", "Locutar y dejar el mp3 en voz/", "tu", "En la web de ai33 (de pago; Claude te dice el coste).",
             ver="montaje", hecho=lambda c: c.voz_completa()),
        Paso("sc-imagenes", "Generar las imágenes", "herramienta", "klein automático.", herramienta="imagenes", ver="imagenes",
             hecho=lambda c: bool(c.imagenes) and c.por_generar() == 0),
        Paso("sc-marcadas", "Rehacer las imágenes marcadas como mal", "tu", "En el visor: motivo y servicio.",
             ver="imagenes", hecho=lambda c: c.marcadas_mal() == 0),
        Paso("sc-aprobar", "Aprobar voz e imágenes", "tu", "Claude te dice qué ha rehecho y qué conviene mirar.",
             aprobacion=True, ver="imagenes",
             hecho=lambda c: c.voz_completa() and bool(c.imagenes) and c.por_generar() == 0 and c.marcadas_mal() == 0),
    ]),
    FaseGuia("D", "Montaje y publicación", "final.mp4 vertical con el primer segundo que engancha.", [
        Paso("sd-montar", "Montar el Short", "claude", "final.mp4, subtítulos y publicacion.md.", ver="montaje",
             hecho=lambda c: c.montaje_al_dia()),
        Paso("sd-control", "Control por fotogramas", "herramienta", "Título legible los 3 primeros segundos.",
             herramienta="fotogramas", hecho=lambda c: c.existe("tmp/control.png")),
        Paso("sd-aprobar", "Ver final.mp4 y aprobarlo", "tu", "Sobre todo el primer segundo.", aprobacion=True, ver="montaje",
             hecho=lambda c: c.montaje_al_dia()),
        Paso("sd-publicacion", "Textos de publicación revisados", "claude", "Para YouTube Shorts, TikTok y Reels.",
             agente="estratega-youtube", ver="doc:publicacion_final.md", hecho=lambda c: c.existe("publicacion_final.md")),
    ]),
    FaseGuia("E", "Cierre", "Anotado en el historial y subido, enlazado al vídeo largo.", [
        Paso("se-historial", "Añadirlo al historial", "claude", "Sección «Shorts», con el vídeo al que apoya.",
             hecho=lambda c: c.en_historial()),
        Paso("se-subir", "Subirlo y enlazarlo al vídeo largo", "tu", "«Vídeo relacionado» del Short."),
    ]),
]


def de(tipo):
    return SHORT if tipo == "short" else LARGO


# --- Vigencia de las fases ya hechas ----------------------------------------------------------------

# Lo que aprueba cada punto: si alguno de esos archivos es posterior a la aprobación, lo aprobado ya no es lo que hay.
APROBADO = {"e-aprobar": ("la voz", ("voz/[0-9][0-9].wav",)), "f-aprobar": ("las imágenes", ("img/*.png",)),
            "g-aprobar": ("el vídeo montado", ("final.mp4",)),
            "sc-aprobar": ("la voz o las imágenes", ("voz/[0-9][0-9].wav", "img/*.png")),
            "sd-aprobar": ("el vídeo montado", ("final.mp4",))}
# Fase de la voz, de las imágenes y del montaje en cada tipo.
FASES_PRODUCTO = {"largo": ("E", "F", "G"), "short": ("C", "C", "D")}


def _fecha(apr: dict | None) -> float | None:
    try:
        return datetime.fromisoformat(apr["fecha"]).timestamp() if apr and apr.get("fecha") else None
    except (TypeError, ValueError):
        return None


def aprobacion_caducada(ctx: Contexto, punto: str) -> bool:
    """La aprobación existe y lo aprobado ha cambiado después (otra toma de voz, imágenes rehechas, otro montaje)."""
    fecha = _fecha((ctx.estado.get("aprobaciones") or {}).get(punto))
    if fecha is None or punto not in APROBADO:
        return False
    return max(ctx.ultima(p) for p in APROBADO[punto][1]) > fecha + 1


def _escenas(ns: list[int]) -> str:
    """«la escena 3» / «las escenas 1-6 y 9»."""
    tramos, ini = [], None
    for i, n in enumerate(ns):
        ini = n if ini is None else ini
        if i + 1 == len(ns) or ns[i + 1] != n + 1:
            tramos.append(str(n) if ini == n else f"{ini}-{n}")
            ini = None
    texto = ", ".join(tramos[:-1]) + (" y " if len(tramos) > 1 else "") + tramos[-1]
    return f"la escena {texto}" if len(ns) == 1 else f"las escenas {texto}"


def vigencia(tipo, ctx: Contexto) -> dict[str, list[str]]:
    """Por qué lo producido en cada fase ya no corresponde a lo de antes: {letra: [avisos]}; sin clave = al día.
    Un vídeo publicado no se revisa (lo subido es lo que es)."""
    if ctx.estado.get("fase") == "cerrado" or (ctx.estado.get("publicacion") or {}).get("url"):
        return {}
    voz_l, img_l, montaje_l = FASES_PRODUCTO["short" if tipo == "short" else "largo"]
    avisos: dict[str, list[str]] = {}
    v = ctx.voz
    if v["cambiadas"]:
        de_pago = str(ctx.guion.get("voz") or ctx.cfg.get("voz") or "").startswith("ai33:")
        coste = (f"≈ {round(ctx.caracteres(v['cambiadas']) * proveedores.valor('ai33.creditos_por_caracter')):,} créditos"
                 .replace(",", ".") if de_pago else "gratis")
        avisos.setdefault(voz_l, []).append(
            f"Has cambiado el texto de {_escenas(v['cambiadas'])} después de locutar: hay que volver a locutar ({coste}).")
    if v["sin_voz"] and ctx.con_voz():
        avisos.setdefault(voz_l, []).append(f"Falta locutar {_escenas(v['sin_voz'])}.")
    if ctx.imagenes:
        n = ctx.por_generar()
        if n:
            avisos.setdefault(img_l, []).append(f"{n} {'imagen por hacer o rehacer' if n == 1 else 'imágenes por hacer o rehacer'}"
                                                " (su descripción ha cambiado o no existen).")
        m = ctx.marcadas_mal()
        if m:
            avisos.setdefault(img_l, []).append(f"{m} {'imagen marcada' if m == 1 else 'imágenes marcadas'} como mal.")
    mon = ctx.montaje
    if mon["existe"] and not mon["al_dia"]:
        avisos.setdefault(montaje_l, []).append("Hay que volver a montar el vídeo (gratis): " + ", ".join(mon["motivos"]) + ".")
    elif not mon["existe"] and montaje_l in (ctx.estado.get("completadas") or []):
        # La fase se cerró (a mano, en el chat…) pero el vídeo montado no está: no se da por montado (hallazgo 41).
        avisos.setdefault(montaje_l, []).append("Falta el vídeo montado: hay que montarlo (gratis).")
    for f in de(tipo):
        for p in f.pasos:
            if p.id in APROBADO and f.letra not in avisos and aprobacion_caducada(ctx, p.id):
                fecha = datetime.fromtimestamp(_fecha(ctx.estado["aprobaciones"][p.id])).strftime("%d/%m")
                avisos[f.letra] = [f"{APROBADO[p.id][0].capitalize()} ha cambiado desde que lo aprobaste el {fecha}: "
                                   "vuelve a revisarlo."]
    return avisos


def _ids_aprobacion(tipo):
    return {p.id for f in de(tipo) for p in f.pasos if p.aprobacion}


def construir(tipo, ctx: Contexto):
    """La guía con el estado de cada fase, paso y aprobación, y el siguiente paso."""
    completadas = set(ctx.estado.get("completadas") or [])
    cerrado = ctx.estado.get("fase") == "cerrado"
    actual = ctx.estado.get("fase")
    aprobaciones = ctx.estado.get("aprobaciones") or {}
    hechos_claude = set(ctx.estado.get("pasos_hechos") or [])   # los que Claude da por terminados (ids de la guía)
    cambios = [c for c in ctx.estado.get("cambios_pedidos") or [] if not c.get("atendido")]

    avisos = vigencia(tipo, ctx)
    fases, siguiente = [], None
    for f in de(tipo):
        # `completadas` es el historial (se cerró alguna vez); la fase solo está hecha si además sigue al día.
        cerrada = cerrado or f.letra in completadas
        desactualizada = cerrada and bool(avisos.get(f.letra))
        fase_hecha = cerrada and not desactualizada
        pasos = []
        for p in f.pasos:
            comprobado = p.hecho(ctx) if p.hecho else None
            if p.aprobacion:
                pedidos = [c for c in cambios if c.get("punto") == p.id]
                caducada = p.id in aprobaciones and (desactualizada or aprobacion_caducada(ctx, p.id))
                if p.id in aprobaciones and not caducada:
                    estado = "aprobado"
                elif fase_hecha:
                    estado = "aprobado"                 # antes de la UI: se aprobó en el chat
                elif pedidos:
                    estado = "cambios"
                elif comprobado:
                    estado = "esperando"                # listo para que lo mires
                else:
                    estado = "pendiente"
                apr = aprobaciones.get(p.id) or {}
                aprobacion = {"estado": estado, "fecha": apr.get("fecha"), "comentario": apr.get("comentario"),
                              "cambios": pedidos, "previa": fase_hecha and p.id not in aprobaciones,
                              "caducada": caducada}
                paso_estado = "hecho" if estado == "aprobado" else estado
            else:
                aprobacion = None
                if fase_hecha or comprobado or p.id in hechos_claude:
                    paso_estado = "hecho"
                elif comprobado is None:
                    paso_estado = "sin_comprobar"
                else:
                    paso_estado = "pendiente"
            pasos.append({
                "id": p.id, "texto": p.texto, "detalle": p.detalle, "quien": p.quien, "agente": p.agente,
                "herramienta": p.herramienta, "ver": p.ver, "opcional": p.opcional, "estado": paso_estado,
                "aprobacion": aprobacion,
            })
        estado_fase = ("hecha" if fase_hecha else "desactualizada" if desactualizada
                       else "actual" if f.letra == actual else "pendiente")
        if estado_fase in ("actual", "desactualizada") and siguiente is None:
            # Primero lo que espera tu decisión; si no, el primer paso obligatorio sin hacer.
            candidatos = [p for p in pasos if p["estado"] in ("esperando", "cambios")] or \
                         [p for p in pasos if p["estado"] in ("pendiente", "sin_comprobar") and not p["opcional"]]
            if candidatos:
                siguiente = {"fase": f.letra, **{k: candidatos[0][k] for k in ("id", "texto", "quien", "estado")}}
        fases.append({"letra": f.letra, "nombre": f.nombre, "objetivo": f.objetivo, "estado": estado_fase,
                      "avisos": avisos.get(f.letra, []), "pasos": pasos})
    return {"fase_actual": "cerrado" if cerrado else actual, "siguiente": siguiente,
            "comando": "/nuevo-short continuar" if tipo == "short" else "/nuevo-video continuar", "fases": fases}


def situacion(tipo, g: dict, estado: dict) -> dict:
    """Lo que el resto de pantallas (Asistente, Inicio) necesitan saber de un vídeo, sacado de su guía ya construida
    (`construir`) para que nadie cuente el estado con reglas propias: si el montaje está aprobado, si está listo para
    subir y si ya se ha publicado."""
    fases = {f["letra"]: f for f in g["fases"]}
    pasos = {p["id"]: p for f in g["fases"] for p in f["pasos"]}
    montaje = pasos.get("sd-aprobar" if tipo == "short" else "g-aprobar") or {}
    al_dia = not any(f["estado"] == "desactualizada" for f in g["fases"])
    montaje_al_dia = fases.get(FASES_PRODUCTO["short" if tipo == "short" else "largo"][2], {}).get("estado") != "desactualizada"
    preparado = fases.get("D" if tipo == "short" else "H", {}).get("estado") == "hecha" and al_dia
    publicado = bool((estado.get("publicacion") or {}).get("url")) or g["fase_actual"] == "cerrado"
    return {"montado": montaje.get("estado") == "hecho" and montaje_al_dia, "listo_para_subir": preparado and not publicado,
            "publicado": publicado}


# --- Escribir en estado.json ------------------------------------------------------------------------

def _guardar(ruta: Path, estado: dict):
    """Escritura atómica (el vigilante nunca ve un JSON a medias), con el mismo formato que usa Claude y la versión de
    esquema sellada (herramientas/esquema.py)."""
    archivos.escribir_json(ruta, esquema.sellar("estado", estado))


def _leer(ruta: Path) -> dict:
    """estado.json en la versión de esquema actual (migrado en memoria; no se escribe al leer)."""
    return esquema.migrar("estado", archivos.leer_json(ruta))           # dañado → ArchivoDanado, nunca {}


def _ahora():
    return datetime.now().isoformat(timespec="seconds")


def _validar(tipo, punto):
    if punto not in _ids_aprobacion(tipo):
        raise ValueError(f"No es un punto de aprobación: {punto}")


def aprobar(ruta: Path, tipo, punto, comentario=None):
    _validar(tipo, punto)
    estado = _leer(ruta)
    estado.setdefault("aprobaciones", {})[punto] = {"fecha": _ahora(), "desde": "UI",
                                                    **({"comentario": comentario} if comentario else {})}
    for c in estado.get("cambios_pedidos") or []:           # aprobar cierra los cambios pedidos de ese punto
        if c.get("punto") == punto and not c.get("atendido"):
            c["atendido"] = _ahora()
    _guardar(ruta, estado)


def avanzar(ruta: Path, tipo, guia_actual: dict):
    """Cierra la fase actual y pasa a la siguiente sin hacer (solo si la guía no tiene nada pendiente en ella)."""
    estado = _leer(ruta)
    actual = estado.get("fase")
    if not actual or actual == "cerrado" or guia_actual.get("fase_actual") != actual:
        raise ValueError("Este vídeo no tiene una fase en curso")
    if guia_actual.get("siguiente"):
        s = guia_actual["siguiente"]
        if s["fase"] != actual:
            raise ValueError(f"Antes hay que poner al día la fase {s['fase']}: «{s['texto']}»")
        raise ValueError(f"La fase {actual} aún tiene un paso pendiente: «{s['texto']}»")
    completadas = list(dict.fromkeys((estado.get("completadas") or []) + [actual]))
    letras = [f.letra for f in de(tipo)]
    siguiente = next((l for l in letras if l not in completadas), None)
    estado["completadas"] = completadas
    estado["fase"] = siguiente or "cerrado"
    estado.setdefault("historial_fases", []).append({"de": actual, "a": estado["fase"], "fecha": _ahora(),
                                                     "desde": "UI"})
    _guardar(ruta, estado)


def retirar(ruta: Path, tipo, punto):
    _validar(tipo, punto)
    estado = _leer(ruta)
    (estado.get("aprobaciones") or {}).pop(punto, None)
    _guardar(ruta, estado)


def pedir_cambios(ruta: Path, tipo, punto, texto):
    _validar(tipo, punto)
    texto = re.sub(r"\s+", " ", texto or "").strip()
    if not texto:
        raise ValueError("Escribe qué cambios quieres")
    estado = _leer(ruta)
    (estado.get("aprobaciones") or {}).pop(punto, None)
    estado.setdefault("cambios_pedidos", []).append({"punto": punto, "texto": texto[:2000], "fecha": _ahora(),
                                                     "desde": "UI", "atendido": False})
    _guardar(ruta, estado)
