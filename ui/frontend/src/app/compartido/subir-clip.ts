import { HttpClient } from '@angular/common/http';
import { Component, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../core/errores';
import { Imagen } from '../core/modelos';

export const TIPOS_VIDEO = 'video/mp4,video/quicktime,video/webm,video/x-m4v';

/** Sube un clip propio a un hueco del guion (PUT /api/videos/:id/video/:ident/propia). Devuelve el error o null. */
export async function subirClip(
  http: HttpClient, videoId: number, ident: string, archivo: File, mezclarAudio: boolean,
): Promise<string | null> {
  try {
    await firstValueFrom(http.put(`/api/videos/${videoId}/video/${ident}/propia`, archivo,
      { params: { nombre: archivo.name, mezclar_audio: mezclarAudio } }));
    return null;
  } catch (e) {
    return mensajeError(e);
  }
}

/** En el visor de una imagen: ponerle un clip animado en su lugar (se usa al montar en vez de una imagen fija), o
 * quitarlo y volver a generar la imagen desde su descripción. */
@Component({
  selector: 'app-subir-clip',
  imports: [MatButton, MatIcon],
  template: `
    @let img = imagen();
    @if (img.origen === 'prompt' || img.origen === 'video') {
      <div class="subir">
        <label class="mezcla">
          <input type="checkbox" [checked]="mezclar()" (change)="mezclar.set($any($event.target).checked)" />
          Mezclar el sonido del clip bajo la voz
        </label>
        <div class="botones">
          <input #archivo type="file" [accept]="tipos" hidden (change)="subir($any($event.target))" />
          <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="archivo.click()">
            <mat-icon>{{ ocupado() ? 'sync' : 'movie' }}</mat-icon>{{ img.origen === 'video' ? 'Cambiar el clip' : 'Subir un clip en su lugar' }}
          </button>
          @if (img.origen === 'video' && img.prompt) {
            <button mat-button type="button" [disabled]="ocupado()" (click)="quitar()"><mat-icon>undo</mat-icon>Volver a generar la imagen</button>
          }
        </div>
      </div>
      @if (error(); as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
    }
  `,
  styles: `
    .subir { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.75rem 0; }
    .botones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .mezcla { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--ay-tenue); }
    .error { display: flex; gap: 0.4rem; align-items: center; color: var(--ay-error); margin: 0; }
  `,
})
export class SubirClip {
  readonly videoId = input.required<number>();
  readonly imagen = input.required<Imagen>();
  readonly cambiado = output<void>();
  private readonly http = inject(HttpClient);
  protected readonly tipos = TIPOS_VIDEO;
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Si el clip trae sonido, mezclarlo bajo la voz en lugar de descartarlo. */
  protected readonly mezclar = signal(false);

  protected async subir(campo: HTMLInputElement): Promise<void> {
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    this.ocupado.set(true);
    this.error.set(await subirClip(this.http, this.videoId(), this.imagen().ident, archivo, this.mezclar()));
    this.ocupado.set(false);
    if (!this.error()) this.cambiado.emit();
  }

  protected async quitar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.delete(`/api/videos/${this.videoId()}/video/${this.imagen().ident}/propia`));
      this.cambiado.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
