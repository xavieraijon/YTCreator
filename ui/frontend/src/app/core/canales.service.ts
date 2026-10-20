import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { EventosService } from './eventos.service';
import { Canal } from './modelos';

/** Canales del kit (índice del backend, que se rehace desde canales/). */
@Injectable({ providedIn: 'root' })
export class CanalesService {
  private readonly http = inject(HttpClient);

  readonly canales = signal<Canal[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly activo = computed(() => this.canales().find((c) => c.activo) ?? null);

  constructor() {
    const eventos = inject(EventosService);
    effect(() => {
      if (eventos.version() > 0) void this.cargar(false); // cambió algo en disco
    });
  }

  async cargar(indicador = true): Promise<void> {
    this.cargando.set(indicador);
    this.error.set(null);
    try {
      this.canales.set(await firstValueFrom(this.http.get<Canal[]>('/api/canales')));
    } catch {
      this.error.set('No se puede conectar con YTCreator: comprueba que está en marcha.');
    } finally {
      this.cargando.set(false);
    }
  }

  async activar(slug: string): Promise<void> {
    this.canales.set(await firstValueFrom(this.http.post<Canal[]>(`/api/canales/${slug}/activar`, {})));
  }

  /** Vídeo rápido sin canal: crea un canal sin nombre con los valores de fábrica y lo deja activo. */
  async crearRapido(): Promise<Canal> {
    const c = await firstValueFrom(this.http.post<Canal>('/api/canales/rapido', {}));
    await this.cargar(false);
    return c;
  }
}
