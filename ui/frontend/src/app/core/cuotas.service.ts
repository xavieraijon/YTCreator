import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EventosService } from './eventos.service';
import { Cuotas } from './modelos';

/**
 * Cuotas de los servicios de IA, siempre al día: se piden al arrancar y luego llegan solas por SSE (el backend
 * las consulta cada 2 min y al terminar cada tarea). `refrescar()` fuerza una consulta real ahora.
 */
@Injectable({ providedIn: 'root' })
export class CuotasService {
  private readonly http = inject(HttpClient);
  readonly cuotas = signal<Cuotas | null>(null);
  readonly consultando = signal(false);

  constructor() {
    const eventos = inject(EventosService);
    eventos.reconectado$.subscribe(() => void this.cargar(false));
    eventos.cuotas$.subscribe(({ datos, conectados, activos, otros, nombres, error, consultado }) => {
      const antes = this.cuotas();
      this.cuotas.set({ datos: datos ?? antes?.datos ?? null, conectados: conectados ?? antes?.conectados, activos: activos ?? antes?.activos, otros: otros ?? antes?.otros, nombres: nombres ?? antes?.nombres, error, consultado });
    });
    void this.cargar(false);
  }

  refrescar(): Promise<void> {
    return this.cargar(true);
  }

  /** Vuelve a pedir lo último sin consultar los servicios (p. ej. tras elegir en Ajustes qué servicios se usan). */
  releer(): Promise<void> {
    return this.cargar(false);
  }

  private async cargar(refrescar: boolean): Promise<void> {
    this.consultando.set(true);
    try {
      this.cuotas.set(await firstValueFrom(this.http.get<Cuotas>('/api/cuotas', { params: { refrescar } })));
    } catch {
      /* backend parado: se queda lo último */
    } finally {
      this.consultando.set(false);
    }
  }
}
