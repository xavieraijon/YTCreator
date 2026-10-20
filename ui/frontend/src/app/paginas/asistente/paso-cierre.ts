import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';

import { firstValueFrom } from 'rxjs';

import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';
import { CierreCanal, DatosCrearCanal } from '../../core/modelos';
import { TareasService } from '../../core/tareas.service';

/** Paso 11 de la creación del canal: prueba de que todo funciona y, si se quiere, dejar el canal como el activo. */
@Component({
  selector: 'app-paso-cierre',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar, TarjetaTarea],
  template: `
    @let d = datos();
    @let c = cierre();
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">Prueba final y puesta en marcha</h2>
    @if (d.concepto; as co) { <p class="secundario"><mat-icon>check</mat-icon>{{ co.nombre }}: {{ co.promesa }}</p> }

    <p class="intro">
      Última comprobación: se hace un vídeo de prueba con tu canal para ver que todo está bien enlazado. No cuesta nada
      ni se publica nada.
    </p>
    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos dejando escrita la ficha de tu canal</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Repasando lo que ya hemos decidido…' }}</p>
        <p class="secundario">Suele tardar un par de minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (c.pendientes.length) {
      <p class="aviso"><mat-icon>info</mat-icon>
        Falta dejar escrita la ficha del canal con todo lo que hemos decidido. Lo hacemos en un momento.
      </p>
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="escribirFicha()">
          <mat-icon>edit_note</mat-icon>{{ ocupado() ? 'Enviando…' : 'Escribir la ficha del canal' }}
        </button>
      </div>
    }
    @if (c.candidata; as k) {
      <p class="secundario"><mat-icon>lightbulb</mat-icon>El primer vídeo será: «{{ k.titulo }}».</p>
    }

    @if (tareaActiva(); as t) {
      <app-tarjeta-tarea [tarea]="t" />
    } @else {
      @if (d.tarea; as t) {
        <p [class]="t.estado === 'hecha' ? 'secundario' : 'error'">
          <mat-icon>{{ t.estado === 'hecha' ? 'check_circle' : 'warning' }}</mat-icon>
          {{ t.estado === 'hecha' ? 'La prueba salió bien.' : 'La última prueba no salió bien. Mira el detalle de la tarea y vuelve a probar.' }}
        </p>
      }
      <div class="acciones">
        <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="probar()">
          <mat-icon>science</mat-icon>{{ d.tarea ? 'Repetir la prueba' : 'Hacer la prueba' }}
        </button>
      </div>
    }

    <label class="activar">
      <input type="checkbox" [(ngModel)]="activar" />
      <span>Dejar este canal como el que uso ahora</span>
    </label>
    @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
    <div class="acciones">
      <button mat-flat-button type="button" [disabled]="ocupado() || !listo()" (click)="terminar()">
        Terminar el canal<mat-icon iconPositionEnd>check</mat-icon>
      </button>
      <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
    </div>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    .activar { display: flex; gap: 0.6rem; align-items: center; cursor: pointer; }
    .activar input { width: 1.1rem; height: 1.1rem; }
  `,
})
export class PasoCierre {
  readonly datos = input.required<DatosCrearCanal>();
  readonly numero = input.required<number>();
  readonly hablar = output<void>();
  readonly cambio = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly tareas = inject(TareasService);

  protected readonly cierre = computed<CierreCanal>(() => this.datos().cierre!);
  protected activar = true;
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly tareaActiva = computed(() => {
    const slug = this.datos().creacion?.slug;
    return this.tareas.activas().find((t) => t.herramienta === 'probar_kit' && t.canal === slug) ?? null;
  });

  protected readonly listo = computed(() =>
    this.datos().tarea?.estado === 'hecha' && !this.tareaActiva() && this.cierre().pendientes.length === 0);

  constructor() {
    let activa = false;
    effect(() => {
      const ahora = !!this.tareaActiva();
      if (activa && !ahora) this.cambio.emit();
      activa = ahora;
    });
  }

  protected async escribirFicha(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/cierre/proponer', { indicaciones: '', otros: false }));
      this.cambio.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async probar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(await this.tareas.lanzar('probar_kit', undefined, { canal: this.datos().creacion?.slug }));
    this.ocupado.set(false);
    this.cambio.emit();
  }

  protected async terminar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/cierre/terminar', { activar: this.activar }));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
