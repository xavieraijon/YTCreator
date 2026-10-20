import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface Aviso {
  id: number;
  texto: string;
  tono: 'ok' | 'error';
  /** Ruta a la que lleva «Ver» (el vídeo); null si no hay dónde ir. */
  enlace: string | null;
}

const DURACION_MS = 9000;

/**
 * Avisos al terminar o fallar algo en segundo plano (hallazgo 27 del recorrido profano): un aviso en la app y, si la
 * ventana no está a la vista, una notificación del sistema. No avisa de lo que el usuario ya está mirando.
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private readonly router = inject(Router);
  readonly avisos = signal<Aviso[]>([]);
  private siguiente = 1;

  /** Pide permiso para las notificaciones del sistema. Llamarlo desde un clic del usuario (al lanzar algo largo). */
  pedirPermiso(): void {
    try {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    } catch {
      /* navegador sin notificaciones: quedan los avisos de la app */
    }
  }

  avisar(texto: string, tono: Aviso['tono'], enlace: string | null = null): void {
    const visible = document.visibilityState === 'visible' && document.hasFocus();
    if (visible && enlace && this.router.url.split('?')[0] === enlace) return;  // ya lo está viendo: la pantalla se pone sola al día
    if (!visible) this.notificar(texto, enlace);
    const aviso: Aviso = { id: this.siguiente++, texto, tono, enlace };
    this.avisos.update((l) => [...l.slice(-3), aviso]);
    setTimeout(() => this.cerrar(aviso.id), DURACION_MS);
  }

  cerrar(id: number): void {
    this.avisos.update((l) => l.filter((a) => a.id !== id));
  }

  ir(a: Aviso): void {
    if (a.enlace) void this.router.navigateByUrl(a.enlace);
    this.cerrar(a.id);
  }

  private notificar(texto: string, enlace: string | null): void {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const n = new Notification('YTCreator', { body: texto, tag: texto });
      n.onclick = () => {
        window.focus();
        if (enlace) void this.router.navigateByUrl(enlace);
        n.close();
      };
    } catch {
      /* sin notificaciones del sistema */
    }
  }
}
