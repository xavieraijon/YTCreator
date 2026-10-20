import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';

interface Efecto {
  nombre: string;
  escenas: number[];
  origen_propio: 'canal' | 'incluido' | null;
}

/**
 * Efectos de sonido que usa el guion (marca `{nombre}` en el texto), con lo propio (bloque G): subir un archivo para
 * cada uno, que vale para todo el canal. Sin archivo (ni propio ni incluido en el kit), montar.py falla al llegar ahí.
 */
@Component({
  selector: 'app-efectos-propios',
  imports: [MatButton, MatIcon],
  template: `
    @if (estado.value()?.efectos; as efectos) {
      @if (efectos.length) {
        <section class="efectos">
          <h3><mat-icon>graphic_eq</mat-icon>Efectos de sonido</h3>
          @for (e of efectos; track e.nombre) {
            <div class="efecto">
              <div class="efecto__cab">
                <strong>«{{ '{' + e.nombre + '}' }}»</strong>
                <span class="secundario">{{ e.escenas.length === 1 ? 'escena ' + e.escenas[0] : 'escenas ' + e.escenas.join(', ') }} · {{ sonara(e) }}</span>
              </div>
              @if (e.origen_propio === 'canal') {
                <audio controls preload="none" [src]="'/api/videos/' + videoId() + '/efectos/' + e.nombre + '?v=' + version()"></audio>
              }
              <div class="acciones">
                <input #archivo type="file" accept="audio/*" hidden (change)="subir(e.nombre, $any($event.target))" />
                <button mat-stroked-button type="button" [disabled]="ocupado() === e.nombre" (click)="archivo.click()">
                  <mat-icon>{{ ocupado() === e.nombre ? 'sync' : 'upload' }}</mat-icon>{{ e.origen_propio === 'canal' ? 'Cambiar por otro mío' : 'Subir el mío' }}
                </button>
                @if (e.origen_propio === 'canal') {
                  <button mat-button type="button" [disabled]="ocupado() === e.nombre" (click)="quitar(e.nombre)"><mat-icon>undo</mat-icon>Quitar el mío</button>
                }
              </div>
            </div>
          }
          <p class="secundario nota">Se recorta el silencio de los bordes y se normaliza su volumen solo. Revisa que tengas derecho a usarlo en YouTube.</p>
          @if (error(); as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
        </section>
      }
    }
  `,
  styles: `
    .efectos { display: flex; flex-direction: column; gap: 0.75rem; }
    h3 { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: 1rem; }
    h3 mat-icon { color: var(--ay-acento); }
    .efecto { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 0.9rem; border: 1px solid var(--ay-borde); border-radius: var(--ay-radio-peq); }
    .efecto__cab { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: baseline; }
    audio { width: min(32rem, 100%); }
    .acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .nota { margin: 0; font-size: 0.85rem; }
    .error { display: flex; gap: 0.4rem; align-items: center; color: var(--ay-error); margin: 0; }
  `,
})
export class EfectosPropios {
  readonly videoId = input.required<number>();
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  protected readonly estado = httpResource<{ efectos: Efecto[] }>(() => {
    this.eventos.version();
    return `/api/videos/${this.videoId()}/efectos`;
  });
  protected readonly ocupado = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Para que el reproductor no se quede con el audio anterior tras subir otro con el mismo nombre. */
  protected readonly version = signal(0);

  protected sonara(e: Efecto): string {
    if (e.origen_propio === 'canal') return 'sonará el tuyo';
    if (e.origen_propio === 'incluido') return 'sonará el incluido en YTCreator';
    return 'falta un archivo: el montaje fallará ahí';
  }

  protected async subir(nombre: string, campo: HTMLInputElement): Promise<void> {
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    await this.hacer(nombre, () =>
      firstValueFrom(this.http.put(`/api/videos/${this.videoId()}/efectos/${nombre}`, archivo, { params: { archivo: archivo.name } })));
  }

  protected async quitar(nombre: string): Promise<void> {
    await this.hacer(nombre, () => firstValueFrom(this.http.delete(`/api/videos/${this.videoId()}/efectos/${nombre}`)));
  }

  private async hacer(nombre: string, accion: () => Promise<unknown>): Promise<void> {
    this.ocupado.set(nombre);
    this.error.set(null);
    try {
      await accion();
      this.version.update((n) => n + 1);
      this.estado.reload();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(null);
    }
  }
}
