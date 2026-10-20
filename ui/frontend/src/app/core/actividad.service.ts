import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AvisosService } from './avisos.service';
import { EventosService } from './eventos.service';
import { TERMINADAS, TareasService } from './tareas.service';
import { EstadoTarea } from './modelos';

/** Un turno de Claude (GET /api/actividad/claude). */
export interface TurnoClaude {
  conversacion: number;
  video_id: number | null;
  titulo: string;
  estado: 'pensando' | 'libre' | 'error';
  desde: string;
  accion: string | null;
}

/**
 * «Actividad»: lo que está en marcha en segundo plano, sean tareas de las herramientas o turnos de Claude (hallazgo 26:
 * antes Tareas decía «Nada en marcha» mientras Claude trabajaba). Avisa al terminar cada cosa (AvisosService).
 */
@Injectable({ providedIn: 'root' })
export class ActividadService {
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly tareasSrv = inject(TareasService);
  private readonly avisos = inject(AvisosService);

  readonly claude = signal<TurnoClaude[]>([]);
  /** Cosas terminadas desde la última vez que se abrió Actividad (el aviso dura 9 s; esto queda; hallazgo 52). */
  readonly sinVer = signal(0);
  readonly claudeTrabajando = computed(() => this.claude().filter((t) => t.estado === 'pensando'));
  readonly claudeRecientes = computed(() => this.claude().filter((t) => t.estado !== 'pensando').slice(0, 3));
  /** Cuántas cosas hay en marcha (tareas + turnos de Claude). */
  readonly enMarcha = computed(() => this.tareasSrv.activas().length + this.claudeTrabajando().length);

  /** Último estado visto de cada tarea: el servicio de tareas actualiza su lista antes de que llegue aquí el evento. */
  private readonly estadoTareas = new Map<number, EstadoTarea>();

  constructor() {
    effect(() => {                                       // tareas nuevas o leídas al arrancar: su estado de partida
      for (const t of this.tareasSrv.tareas()) if (!this.estadoTareas.has(t.id)) this.estadoTareas.set(t.id, t.estado);
    });
    void this.cargar();
    this.eventos.reconectado$.subscribe(() => void this.cargar());
    this.eventos.claude$.subscribe((e) => {
      if (e.evento === 'entrada' && e.entrada?.t === 'herramienta' && !e.entrada.sub && e.entrada.resumen) {
        const accion = e.entrada.resumen;                 // lo que hace ahora, en vivo
        this.claude.update((l) => l.map((t) => (t.conversacion === e.conversacion ? { ...t, accion } : t)));
        return;
      }
      if (e.evento !== 'estado') return;
      const antes = this.claude().find((t) => t.conversacion === e.conversacion);
      void this.cargar().then(() => {
        if (antes?.estado !== 'pensando' || e.estado === 'pensando') return;
        const enlace = antes.video_id ? `/videos/${antes.video_id}` : '/asistente';
        this.sinVer.update((n) => n + 1);
        if (e.estado === 'error') this.avisos.avisar(`Claude se ha parado con un error en «${antes.titulo}».`, 'error', enlace);
        else this.avisos.avisar(`Claude ha terminado en «${antes.titulo}».`, 'ok', enlace);
      });
    });
    this.eventos.tareas$.subscribe((e) => {
      const antes = this.estadoTareas.get(e.id);
      this.estadoTareas.set(e.id, e.estado);
      if (!antes || TERMINADAS.includes(antes) || !TERMINADAS.includes(e.estado) || e.estado === 'cancelada') return;
      const t = this.tareasSrv.tareas().find((x) => x.id === e.id);
      const nombre = t ? `«${t.titulo}»` : 'Una tarea';
      const enlace = t?.video_id ? `/videos/${t.video_id}` : null;
      this.sinVer.update((n) => n + 1);
      if (e.estado === 'hecha') this.avisos.avisar(`${nombre} ha terminado.`, 'ok', enlace);
      else this.avisos.avisar(`${nombre} no ha podido terminar: mira el detalle en Actividad.`, 'error', enlace);
    });
  }

  async cargar(): Promise<void> {
    try {
      this.claude.set(await firstValueFrom(this.http.get<TurnoClaude[]>('/api/actividad/claude')));
    } catch {
      /* sin backend: se reintenta al reconectar */
    }
  }

  async parar(conversacion: number): Promise<void> {
    await firstValueFrom(this.http.post(`/api/claude/${conversacion}/parar`, {}));
    await this.cargar();
  }
}
