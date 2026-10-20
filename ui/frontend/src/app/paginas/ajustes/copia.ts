import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { mensajeError } from '../../core/errores';
import { TERMINADAS, TareasService } from '../../core/tareas.service';

interface UltimaCopia {
  fecha: string;
  raiz: string;
  ficheros: number;
  bytes: number;
  copiados: number;
  ok: boolean;
}

export interface EstadoCopia {
  destino: string;
  conectado: boolean;
  ultima: UltimaCopia | null;
  dias: number | null;
  aviso: boolean;
  dias_aviso: number;
  dias_anteriores: number;
}

/** Ajustes → Este equipo → Copia de seguridad: carpeta elegida, «Hacer copia ahora» y aviso si hace mucho de la última. */
@Component({
  selector: 'app-ajustes-copia',
  imports: [FormsModule, MatButton, MatIcon, TarjetaTarea],
  template: `
    <section class="bloque">
      <h2>Copia de seguridad</h2>
      <p class="intro secundario">
        Copia las imágenes, voces, música, vídeos y datos de tus canales a una carpeta que elijas: un disco externo, iCloud Drive o
        Google Drive. Solo copia lo que ha cambiado. Lo que se sustituye o se borra se guarda
        {{ estado.value()?.dias_anteriores ?? 30 }} días en la carpeta <code>_anteriores</code> de la copia.
        Las claves de los servicios no se copian: si un día restauras, tendrás que volver a pegarlas.
      </p>
      @if (estado.value(); as e) {
        <div class="clave tarjeta">
          <label for="destino-copia">Carpeta donde guardar la copia</label>
          <div class="clave__fila">
            <input id="destino-copia" [(ngModel)]="destino" placeholder="/Volumes/MiDisco" autocomplete="off" />
            <button mat-stroked-button type="button" [disabled]="!destino().trim() || destino() === e.destino" (click)="guardar()">Guardar</button>
          </div>
          <small class="secundario">Ruta completa. En el Finder: clic derecho en la carpeta con la tecla Opción pulsada → «Copiar como nombre de ruta».</small>
          @if (errorDestino()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorDestino() }}</p> }
          @if (e.destino && !e.conectado) {
            <p class="error"><mat-icon>usb_off</mat-icon>No encuentro esa carpeta. Si es un disco externo, conéctalo.</p>
          }
        </div>
        @if (e.ultima; as u) {
          <p class="resultado" [class.resultado--mal]="!u.ok || e.aviso">
            <mat-icon>{{ u.ok && !e.aviso ? 'check_circle' : 'warning' }}</mat-icon>
            Última copia: {{ fecha(u.fecha) }} ({{ hace(e.dias) }}) · {{ u.ficheros }} archivos, {{ mb(u.bytes) }}{{ u.ok ? '' : ' · incompleta: repítela' }}
          </p>
        } @else {
          <p class="resultado resultado--mal"><mat-icon>warning</mat-icon>Todavía no has hecho ninguna copia.</p>
        }
        @if (e.ultima && e.aviso) {
          <p class="secundario">Hace más de {{ e.dias_aviso }} días de la última copia: haz una nueva.</p>
        }
        <div class="acciones">
          <button mat-flat-button type="button" [disabled]="copiando() || !e.destino || !e.conectado" (click)="copiar()">
            <mat-icon>{{ copiando() ? 'sync' : 'backup' }}</mat-icon>{{ copiando() ? 'Copiando…' : 'Hacer copia ahora' }}
          </button>
          <span class="secundario">Gratis. La primera vez tarda más; las siguientes, solo lo nuevo.</span>
        </div>
        @if (errorCopia()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorCopia() }}</p> }
        @for (t of tarea(); track t.id) { <app-tarjeta-tarea [tarea]="t" /> }
      } @else if (estado.error()) {
        <p class="error"><mat-icon>warning</mat-icon>No se ha podido leer el estado de la copia.</p>
      }
    </section>
  `,
  styleUrl: './ajustes.scss',
})
export class AjustesCopia {
  private readonly http = inject(HttpClient);
  private readonly tareas = inject(TareasService);
  protected readonly estado = httpResource<EstadoCopia>(() => '/api/ajustes/copia');
  protected readonly destino = linkedSignal(() => this.estado.value()?.destino ?? '');
  protected readonly errorDestino = signal<string | null>(null);
  protected readonly errorCopia = signal<string | null>(null);
  protected readonly tarea = computed(() => this.tareas.tareas().filter((t) => t.herramienta === 'copia').slice(0, 1));
  protected readonly copiando = computed(() => this.tarea().some((t) => !TERMINADAS.includes(t.estado)));

  constructor() {
    // Al acabar una copia, su fecha y su resultado.
    let antes = false;
    effect(() => {
      const ahora = this.copiando();
      if (antes && !ahora) this.estado.reload();
      antes = ahora;
    });
  }

  protected async guardar(): Promise<void> {
    this.errorDestino.set(null);
    try {
      await firstValueFrom(this.http.put('/api/ajustes/copia', { destino: this.destino().trim() }));
      this.estado.reload();
    } catch (e) {
      this.errorDestino.set(mensajeError(e));
    }
  }

  protected async copiar(): Promise<void> {
    this.errorCopia.set(await this.tareas.lanzar('copia'));
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected hace(dias: number | null): string {
    if (dias === null) return '';
    return dias === 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
  }

  protected mb(bytes: number): string {
    return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
  }
}
