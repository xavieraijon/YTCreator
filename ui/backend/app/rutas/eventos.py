from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..eventos import difusor

router = APIRouter(prefix="/api", tags=["sistema"])


@router.get("/eventos")
async def eventos():
    """Flujo SSE: {"tipo": "cambio", "canal": slug | null} cuando cambian los archivos del kit."""
    return StreamingResponse(difusor.flujo(difusor.suscribir()), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
