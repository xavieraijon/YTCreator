import { HttpErrorResponse } from '@angular/common/http';

/**
 * El texto que se enseña cuando falla una petición al backend. Una sola regla para toda la UI:
 * - `detail` en texto (los errores del backend, ya en castellano) → tal cual;
 * - `detail` en lista (validación de FastAPI, 422) → los mensajes unidos, nunca «[object Object]»;
 * - sin conexión (status 0) → cómo arrancar el backend;
 * - lo demás → `defecto` o «Error <código>».
 */
export function mensajeError(e: unknown, defecto?: string): string {
  if (e instanceof HttpErrorResponse) {
    const detalle: unknown = (e.error as { detail?: unknown } | null)?.detail;
    if (typeof detalle === 'string' && detalle.trim()) return detalle;
    if (Array.isArray(detalle)) {
      const mensajes = detalle
        .map((d) => (d as { msg?: unknown } | null)?.msg)
        .filter((m): m is string => typeof m === 'string' && !!m);
      if (mensajes.length) return `Datos no válidos: ${mensajes.join(' · ')}`;
    }
    if (e.status === 0) return 'No se puede conectar con YTCreator: comprueba que está en marcha.';
    return defecto ?? `Error ${e.status}`;
  }
  return defecto ?? String(e);
}
