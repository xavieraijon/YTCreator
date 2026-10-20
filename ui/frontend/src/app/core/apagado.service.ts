import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ConfirmarService } from '../compartido/confirmar';
import { AvisosService } from './avisos.service';
import { mensajeError } from './errores';
import { TareasService } from './tareas.service';

export interface Salud {
  cambiados?: string[];
  /** Hora de arranque del servidor: cambia al reiniciar (así se sabe que ha vuelto). */
  arranque?: number;
  /** Se abrió con ui/arrancar.py («Abrir YTCreator»): se puede cerrar y reiniciar desde aquí. */
  apagable?: boolean;
}

/** null = en marcha; si no, lo que tapa toda la pantalla. */
export type Apagado = 'reiniciando' | 'cerrado' | 'sin_volver' | null;

const PASO_MS = 1000;
const ESPERA_MAX_MS = 90_000;

/** «Reiniciar ahora» y «Cerrar YTCreator»: confirma, deja la orden al servidor (POST /api/reiniciar | /api/cerrar) y, al
 * reiniciar, espera a que vuelva (otro `arranque` en /api/salud) para recargar la página. */
@Injectable({ providedIn: 'root' })
export class ApagadoService {
  private readonly http = inject(HttpClient);
  private readonly confirmar = inject(ConfirmarService);
  private readonly avisos = inject(AvisosService);
  private readonly tareas = inject(TareasService);

  readonly estado = signal<Apagado>(null);
  readonly apagable = signal(false);
  private arranque = 0;

  /** Lo llama App con cada /api/salud. */
  salud(r: Salud): void {
    this.apagable.set(!!r.apagable);
    this.arranque = r.arranque ?? 0;
  }

  private aviso(): string | undefined {
    const n = this.tareas.activas().length;
    if (!n) return undefined;
    return n === 1
      ? 'Hay 1 trabajo en marcha: se parará y tendrás que volver a lanzarlo.'
      : `Hay ${n} trabajos en marcha: se pararán y tendrás que volver a lanzarlos.`;
  }

  async reiniciar(): Promise<void> {
    const ok = await this.confirmar.pedir({
      titulo: 'Reiniciar YTCreator',
      mensaje: 'Se cierra y se vuelve a abrir solo, en unos segundos, para cargar lo nuevo. No se pierde nada: tus canales, vídeos y ajustes están guardados.',
      aviso: this.aviso(),
      aceptar: 'Reiniciar ahora',
      icono: 'restart_alt',
    });
    if (!ok || !(await this.pedir('reiniciar'))) return;
    this.estado.set('reiniciando');
    const antes = this.arranque;
    const limite = Date.now() + ESPERA_MAX_MS;
    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, PASO_MS));
      try {
        const r = await firstValueFrom(this.http.get<Salud>('/api/salud'));
        if (r.arranque && r.arranque !== antes) {
          location.reload();
          return;
        }
      } catch {
        /* todavía arrancando */
      }
    }
    this.estado.set('sin_volver');
  }

  async cerrar(): Promise<void> {
    const ok = await this.confirmar.pedir({
      titulo: 'Cerrar YTCreator',
      mensaje:
        'Se apaga el programa en este ordenador y esta pestaña deja de funcionar. No se pierde nada: tus canales, vídeos y ajustes están guardados.\n\n' +
        'Para volver a usarlo, abre «Abrir YTCreator» (en Aplicaciones, en el menú Inicio o en el Escritorio).',
      aviso: this.aviso(),
      aceptar: 'Cerrar YTCreator',
      icono: 'power_settings_new',
    });
    if (ok && (await this.pedir('cerrar'))) this.estado.set('cerrado');
  }

  private async pedir(orden: 'reiniciar' | 'cerrar'): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post(`/api/${orden}`, {}));
      return true;
    } catch (e) {
      this.avisos.avisar(mensajeError(e, orden === 'cerrar' ? 'No se pudo cerrar' : 'No se pudo reiniciar'), 'error');
      return false;
    }
  }
}
