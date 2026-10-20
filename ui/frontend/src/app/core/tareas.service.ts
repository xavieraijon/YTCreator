import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AvisosService } from './avisos.service';
import { EventosService } from './eventos.service';
import { EstadoTarea, Herramienta, Tarea, TareaDetalle } from './modelos';
import { mensajeError } from './errores';

const MAX_LINEAS = 400;
export const TERMINADAS: EstadoTarea[] = ['hecha', 'error', 'cancelada', 'interrumpida'];

/** % real de una tarea (pasos que da la herramienta o imágenes generadas), o null si no tiene cifra. */
export function porcentajeTarea(t: Tarea): number | null {
  const p = t.progreso ?? {};
  if (p.pasos) return Math.round(Math.min(1, (p.paso ?? 0) / p.pasos) * 100);
  if (p.total) return Math.round(Math.min(1, (p.hecho ?? 0) / p.total) * 100);
  return null;
}

/** Tareas lanzadas desde la UI: lista, salida en directo (SSE) y acciones. */
@Injectable({ providedIn: 'root' })
export class TareasService {
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);

  readonly tareas = signal<Tarea[]>([]);
  readonly herramientas = signal<Herramienta[]>([]);
  /** Últimas líneas de salida por tarea (las que se han visto en directo o se han pedido). */
  readonly lineas = signal<Record<number, string[]>>({});
  readonly activas = computed(() => this.tareas().filter((t) => !TERMINADAS.includes(t.estado)));

  constructor() {
    void this.cargar();
    void firstValueFrom(this.http.get<Herramienta[]>('/api/herramientas')).then((h) => this.herramientas.set(h));
    this.eventos.reconectado$.subscribe(() => void this.cargar()); // lo que terminó durante el corte
    this.eventos.tareas$.subscribe((e) => {
      const conocida = this.tareas().some((t) => t.id === e.id);
      if (!conocida) {
        void this.cargar(); // tarea nueva (quizá lanzada desde otra pestaña)
        return;
      }
      this.tareas.update((lista) =>
        lista.map((t) =>
          t.id === e.id
            ? {
                ...t,
                estado: e.estado,
                codigo: e.codigo ?? t.codigo,
                progreso: e.progreso ?? t.progreso,
                terminada: TERMINADAS.includes(e.estado) ? new Date().toISOString() : t.terminada,
              }
            : t,
        ),
      );
      if (e.lineas?.length) this.anadirLineas(e.id, e.lineas);
      if (TERMINADAS.includes(e.estado)) this.eventos.refrescar(); // lo que generó (tmp/, hojas…) se vuelve a leer
    });
  }

  async cargar(): Promise<void> {
    this.tareas.set(await firstValueFrom(this.http.get<Tarea[]>('/api/tareas', { params: { limite: 100 } })));
  }

  async detalle(id: number): Promise<TareaDetalle> {
    const d = await firstValueFrom(this.http.get<TareaDetalle>(`/api/tareas/${id}`));
    this.lineas.update((l) => ({ ...l, [id]: d.lineas }));
    return d;
  }

  /** Lanza una herramienta; devuelve el error del backend en texto si no se puede. */
  async lanzar(herramienta: string, videoId?: number, argumentos: Record<string, unknown> = {}): Promise<string | null> {
    this.avisos.pedirPermiso();                  // un clic del usuario: el momento de pedir las notificaciones
    try {
      const t = await firstValueFrom(
        this.http.post<Tarea>('/api/tareas', { herramienta, video_id: videoId ?? null, argumentos }),
      );
      this.tareas.update((lista) => [t, ...lista.filter((x) => x.id !== t.id)]);
      return null;
    } catch (e) {
      return mensajeError(e);
    }
  }

  async cancelar(id: number): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`/api/tareas/${id}/cancelar`, {}));
    } finally {
      await this.cargar();
    }
  }

  deVideo(videoId: number): Tarea[] {
    return this.tareas().filter((t) => t.video_id === videoId);
  }

  private anadirLineas(id: number, nuevas: string[]): void {
    this.lineas.update((l) => ({ ...l, [id]: [...(l[id] ?? []), ...nuevas].slice(-MAX_LINEAS) }));
  }
}
