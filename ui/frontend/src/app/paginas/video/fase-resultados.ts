import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { EventosService } from '../../core/eventos.service';
import { mensajeError } from '../../core/errores';

/** Cuándo se publicó, para el selector de fecha (hora local, sin segundos). */
function ahoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Fase J, primer paso: el enlace de YouTube y cuándo se publicó (de ahí se cuentan las 48 h y los 7 días). */
@Component({
  selector: 'app-registro-publicacion',
  imports: [FormsModule, MatButton, MatIcon],
  template: `
    <form class="registro tarjeta" (ngSubmit)="guardar()">
      <label>
        <span>Enlace del vídeo en YouTube</span>
        <input type="url" name="url" [(ngModel)]="url" placeholder="https://www.youtube.com/watch?v=…" required autocomplete="off" />
      </label>
      <label>
        <span>Fecha y hora de publicación</span>
        <input type="datetime-local" name="fecha" [(ngModel)]="fecha" required />
      </label>
      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="submit" [disabled]="guardando() || !url.trim()">
          {{ publicacion()?.url ? 'Guardar los cambios' : 'Registrar la publicación' }}
        </button>
      </div>
    </form>
  `,
  styleUrl: './fase-resultados.scss',
})
export class RegistroPublicacion {
  readonly videoId = input.required<number>();
  readonly datos = input<{ publicacion?: { url?: string; fecha?: string } } | null>(null);
  protected readonly publicacion = computed(() => this.datos()?.publicacion);

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  protected url = '';
  protected fecha = ahoraLocal();
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    queueMicrotask(() => {
      const p = this.publicacion();
      if (p?.url) this.url = p.url;
      if (p?.fecha) this.fecha = p.fecha.slice(0, 16);
    });
  }

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.videoId()}/publicacion`, { url: this.url.trim(), fecha: this.fecha }));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}

const CAMPOS = [
  { id: 'visitas', texto: 'Visitas', ayuda: 'Vistas del vídeo', obligatorio: true },
  { id: 'ctr', texto: 'CTR (%)', ayuda: 'Porcentaje de clics sobre impresiones', obligatorio: true },
  { id: 'retencion', texto: 'Retención media (%)', ayuda: 'Porcentaje medio visto del vídeo', obligatorio: true },
  { id: 'impresiones', texto: 'Impresiones', ayuda: 'Veces que se enseñó la miniatura', obligatorio: false },
  { id: 'horas_vistas', texto: 'Horas vistas', ayuda: 'Tiempo de visualización', obligatorio: false },
  { id: 'suscriptores', texto: 'Suscriptores ganados', ayuda: 'Nuevos con este vídeo', obligatorio: false },
] as const;

/** Fase J: las cifras de YouTube Studio a las 48 h o a los 7 días. */
@Component({
  selector: 'app-registro-metricas',
  imports: [FormsModule, MatButton, MatIcon],
  template: `
    <form class="registro tarjeta" (ngSubmit)="guardar()">
      <p class="secundario">YouTube Studio → Analytics → Contenido → este vídeo. Copia las cifras tal como salen.</p>
      <div class="campos">
        @for (c of campos; track c.id) {
          <label>
            <span>{{ c.texto }}@if (!c.obligatorio) { <em> (opcional)</em> }</span>
            <input type="text" inputmode="decimal" [name]="c.id" [(ngModel)]="valores[c.id]" [required]="c.obligatorio" autocomplete="off" />
            <small>{{ c.ayuda }}</small>
          </label>
        }
      </div>
      <label>
        <span>Notas <em>(opcional)</em></span>
        <input type="text" name="notas" [(ngModel)]="notas" maxlength="500" placeholder="Qué te ha llamado la atención" autocomplete="off" />
      </label>
      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="submit" [disabled]="guardando() || !completo()">Guardar los resultados</button>
      </div>
    </form>
  `,
  styleUrl: './fase-resultados.scss',
})
export class RegistroMetricas {
  readonly videoId = input.required<number>();
  readonly momento = input.required<string>();
  readonly datos = input<{ metricas?: Record<string, number | string> } | null>(null);

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  protected readonly campos = CAMPOS;
  protected valores: Record<string, string> = {};
  protected notas = '';
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    queueMicrotask(() => {
      const m = this.datos()?.metricas ?? {};
      for (const c of CAMPOS) if (m[c.id] !== undefined) this.valores[c.id] = String(m[c.id]);
      this.notas = String(m['notas'] ?? '');
    });
  }

  protected completo(): boolean {
    return CAMPOS.filter((c) => c.obligatorio).every((c) => (this.valores[c.id] ?? '').trim() !== '');
  }

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    const cuerpo: Record<string, unknown> = { notas: this.notas };
    for (const c of CAMPOS) {
      const v = (this.valores[c.id] ?? '').trim().replace(',', '.');
      if (v !== '') cuerpo[c.id] = Number(v);
    }
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.videoId()}/metricas/${this.momento()}`, cuerpo));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
