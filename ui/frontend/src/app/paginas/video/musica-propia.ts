import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { OndaAudio } from '../../compartido/onda-audio';
import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';
import { ServiciosService } from '../../core/servicios.service';

interface AmbienteMusica {
  ambiente: string;
  escenas: number[];
  propia: string | null;
  origen_propia: 'canal' | 'incluida' | null;
  elegida: number | null;
}

/**
 * Música de fondo con lo propio (bloque B): qué sonará en cada ambiente del guion y subir la tuya, que queda para todo el
 * canal. Una versión de Suno elegida para el vídeo manda sobre ella (se cambia en «Música de fondo (de pago)»).
 */
@Component({
  selector: 'app-musica-propia',
  imports: [MatButton, MatIcon, OndaAudio],
  template: `
    @if (estado.value()?.ambientes; as ambientes) {
      @if (ambientes.length) {
        <section class="musica">
          <h3><mat-icon>library_music</mat-icon>Música de fondo</h3>
          @for (a of ambientes; track a.ambiente + ':' + version()) {
            <div class="ambiente">
              <div class="ambiente__cab">
                <strong>«{{ a.ambiente }}»</strong>
                <span class="secundario">{{ a.escenas.length === 1 ? 'escena ' + a.escenas[0] : a.escenas.length + ' escenas' }} · {{ sonara(a) }}</span>
              </div>
              @if (a.propia && !a.elegida && (a.origen_propia === 'canal' || incluidaActiva())) {
                <app-onda-audio [url]="urlPropia(a.ambiente)" [urlPicos]="urlPropia(a.ambiente, 200)" />
              }
              <div class="acciones">
                <input #archivo type="file" accept="audio/*" hidden (change)="subir(a.ambiente, $any($event.target))" />
                <button mat-stroked-button type="button" [disabled]="ocupado() === a.ambiente" (click)="archivo.click()">
                  <mat-icon>{{ ocupado() === a.ambiente ? 'sync' : 'upload' }}</mat-icon>{{ a.origen_propia === 'canal' ? 'Cambiar por otra mía' : 'Subir la mía' }}
                </button>
                @if (a.origen_propia === 'canal') {
                  <button mat-button type="button" [disabled]="ocupado() === a.ambiente" (click)="quitar(a.ambiente)"><mat-icon>undo</mat-icon>Quitar la mía</button>
                }
              </div>
            </div>
          }
          <p class="secundario nota">La tuya vale para todo el canal y se iguala de volumen sola. Revisa que tengas derecho a usarla en YouTube.</p>
          @if (error(); as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
        </section>
      }
    }
  `,
  styles: `
    .musica { display: flex; flex-direction: column; gap: 0.75rem; }
    h3 { display: flex; align-items: center; gap: 0.4rem; margin: 0; font-size: 1rem; }
    h3 mat-icon { color: var(--ay-acento); }
    .ambiente { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem 0.9rem; border: 1px solid var(--ay-borde); border-radius: var(--ay-radio-peq); }
    .ambiente__cab { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: baseline; }
    app-onda-audio { max-width: 32rem; }
    .acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .nota { margin: 0; font-size: 0.85rem; }
    .error { display: flex; gap: 0.4rem; align-items: center; color: var(--ay-error); margin: 0; }
  `,
})
export class MusicaPropia {
  readonly videoId = input.required<number>();
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly servicios = inject(ServiciosService);
  protected readonly estado = httpResource<{ ambientes: AmbienteMusica[] }>(() => {
    this.eventos.version();
    return `/api/videos/${this.videoId()}/musica`;
  });
  protected readonly ocupado = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Para que el reproductor no se quede con la música anterior tras subir otra. */
  protected readonly version = signal(0);

  protected incluidaActiva(): boolean {
    return this.servicios.disponible('sintetizador');
  }

  protected urlPropia(ambiente: string, picos?: number): string {
    const base = `/api/videos/${this.videoId()}/musica/${ambiente}/propia`;
    return picos ? `${base}?picos=${picos}` : base;
  }

  protected sonara(a: AmbienteMusica): string {
    if (a.elegida) return `sonará la versión ${a.elegida} de Suno`;
    if (a.origen_propia === 'canal') return 'sonará tu música';
    if (a.origen_propia === 'incluida' && this.incluidaActiva()) return 'sonará la música incluida en YTCreator';
    return 'sin música';
  }

  protected async subir(ambiente: string, campo: HTMLInputElement): Promise<void> {
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    await this.hacer(ambiente, () =>
      firstValueFrom(this.http.put(`/api/videos/${this.videoId()}/musica/${ambiente}/propia`, archivo, { params: { nombre: archivo.name } })));
  }

  protected async quitar(ambiente: string): Promise<void> {
    await this.hacer(ambiente, () => firstValueFrom(this.http.delete(`/api/videos/${this.videoId()}/musica/${ambiente}/propia`)));
  }

  private async hacer(ambiente: string, accion: () => Promise<unknown>): Promise<void> {
    this.ocupado.set(ambiente);
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
