import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { EventoCambio, EventoClaude, EventoCuotas, EventoTarea } from './modelos';

/**
 * Avisos del backend (SSE en /api/eventos).
 * - `version` sube con los cambios en los archivos del kit: los recursos que la leen se vuelven a pedir solos.
 *   Los avisos seguidos (un lote de imágenes llegando) se agrupan: como mucho una subida cada 1,5 s.
 * - `tareas$` emite el progreso y la salida de las tareas (no toca `version`: llegan muy seguido).
 * - El SSE solo avisa (no se repiten eventos perdidos): al RECONECTAR (backend reiniciado, cliente lento cerrado,
 *   red) se sube `version` y se emite `reconectado$` para que cada servicio vuelva a pedir su estado.
 */
@Injectable({ providedIn: 'root' })
export class EventosService {
  readonly version = signal(0);
  readonly conectado = signal(false);
  readonly ultimo = signal<EventoCambio | null>(null);
  readonly tareas$ = new Subject<EventoTarea>();
  /** Cuotas nuevas: el backend las consulta cada 2 min y al terminar cada tarea. */
  readonly cuotas$ = new Subject<EventoCuotas>();
  /** El chat con Claude: entradas nuevas, texto que va llegando y cambios de estado. */
  readonly claude$ = new Subject<EventoClaude>();
  /** La conexión se ha recuperado tras un corte: lo que llegó mientras tanto se ha perdido, hay que releer. */
  readonly reconectado$ = new Subject<void>();
  private haConectado = false;
  private pendiente: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const fuente = new EventSource('/api/eventos');
    fuente.onopen = () => {
      this.conectado.set(true);
      if (this.haConectado) {
        this.refrescar();
        this.reconectado$.next();
      }
      this.haConectado = true;
    };
    fuente.onerror = () => this.conectado.set(false); // EventSource reintenta solo
    fuente.onmessage = (e) => {
      const evento = JSON.parse(e.data) as EventoCambio | EventoTarea | EventoCuotas | EventoClaude;
      if (evento.tipo === 'tarea') {
        this.tareas$.next(evento);
        return;
      }
      if (evento.tipo === 'claude') {
        this.claude$.next(evento);
        return;
      }
      if (evento.tipo === 'cuotas') {
        this.cuotas$.next(evento);
        return;
      }
      this.ultimo.set(evento);
      this.agrupar();
    };
  }

  /** Fuerza que los recursos se vuelvan a pedir (p. ej. al terminar una tarea que tocó tmp/). */
  refrescar(): void {
    this.version.update((v) => v + 1);
  }

  private agrupar(): void {
    if (this.pendiente) return; // ya hay una subida programada: este aviso va en ella
    this.pendiente = setTimeout(() => {
      this.pendiente = null;
      this.version.update((v) => v + 1);
    }, 1500);
  }
}
