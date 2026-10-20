import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';

import { DatosServicios } from '../paginas/ajustes/modelos';

/**
 * Qué servicios se pueden usar ahora (Ajustes → Servicios; bloque B de docs/plan-mejoras-usuario.md). Las pantallas lo
 * usan para no ofrecer lo que no funcionaría: sin servicio de imágenes gratis no hay «Generar gratis», etc.
 */
@Injectable({ providedIn: 'root' })
export class ServiciosService {
  readonly datos = httpResource<DatosServicios>(() => '/api/servicios');
  /** Ids disponibles (los usa y están conectados). Mientras no ha llegado la lista, null: no se oculta nada. */
  readonly disponibles = computed(() => {
    const d = this.datos.value();
    return d ? new Set(d.servicios.filter((s) => s.disponible).map((s) => s.id)) : null;
  });

  disponible(id: string): boolean {
    return this.disponibles()?.has(id) ?? true;
  }

  releer(): void {
    this.datos.reload();
  }
}
