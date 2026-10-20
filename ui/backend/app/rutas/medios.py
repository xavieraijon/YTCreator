from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .. import medios

router = APIRouter(prefix="/api/medios", tags=["medios"])


@router.get("/{ruta:path}")
def archivo(ruta: str, ancho: int | None = None, picos: int | None = None):
    """Un archivo de canales/ (ruta relativa a canales/). Con ?ancho=240|480|960, miniatura JPEG de una
    imagen. Con ?picos=N, la onda de amplitud de un audio (N picos entre 0 y 1, para dibujarla sin
    descargar ni decodificar el archivo entero). El vídeo y el audio admiten peticiones por rangos (saltar
    en el reproductor)."""
    p = medios.resolver(ruta)
    if not p:
        raise HTTPException(404, "Archivo no encontrado o no permitido")
    if ancho and p.suffix.lower() in medios.IMAGENES:
        # no-cache: el navegador revalida (ETag) y ve al momento una imagen rehecha con el mismo nombre
        return FileResponse(medios.miniatura(p, ancho), media_type="image/jpeg",
                            headers={"Cache-Control": "no-cache"})
    if picos and p.suffix.lower() in medios.AUDIOS:
        try:
            return {"picos": medios.picos(p, picos)}
        except ValueError as e:
            raise HTTPException(500, str(e)) from e
    return FileResponse(p, headers={"Cache-Control": "no-cache"})
