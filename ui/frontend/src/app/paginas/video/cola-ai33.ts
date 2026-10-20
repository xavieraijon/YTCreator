import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { EventosService } from '../../core/eventos.service';
import { ColaAi33 } from '../../core/modelos';

/** Imágenes de pago del vídeo en la cola de ai33: cuáles esperan, cuánto llevan y cuáles faltan por mandar. */
@Component({
  selector: 'app-cola-ai33',
  imports: [DecimalPipe, MatIcon],
  template: `
    @if (cola(); as c) {
      @if (c.apuntadas.length || c.por_mandar.length) {
        <div class="cola">
          <div class="cola__cabecera">
            <mat-icon class="cola__icono">schedule</mat-icon>
            <strong>Imágenes de pago en espera</strong>
            <span class="secundario">
              {{ c.apuntadas.length }} en su cola · {{ c.por_mandar.length }} por mandar
              @if (c.en_marcha) { · lote en marcha }
              · {{ c.modelo }}
            </span>
          </div>
          @if (c.apuntadas.length) {
            <div class="cola__lista">
              @for (t of c.apuntadas; track t.ident) {
                <span class="chip" [class.chip--error]="t.estado === 'error'" [title]="'Tarea ' + t.tarea">
                  <b>{{ t.ident }}</b>
                  {{ t.estado === 'doing' ? 'esperando' : (t.estado ?? '¿?') }}
                  @if (t.progreso !== null && t.estado === 'doing') { {{ t.progreso }} % }
                  · {{ tiempo(t.minutos) }}
                </span>
              }
            </div>
            <p class="secundario nota">
              Pagadas y en la cola del servicio: se recogen solas (quedarse al 15 % durante horas es su cola, no un fallo).
              Nunca se cancelan: el servicio no devuelve los créditos.
            </p>
          }
          @if (c.por_mandar.length) {
            <p class="secundario nota">
              Por mandar: {{ c.por_mandar.join(', ') }} (≈ {{ c.previsto_creditos | number: '1.0-0' }} créditos,
              {{ c.previsto_euros | number: '1.2-2' }} €).
            </p>
          }
        </div>
      }
    }
  `,
  styles: `
    .cola {
      border: 1px solid color-mix(in srgb, var(--ay-pago) 30%, transparent);
      background: var(--ay-pago-suave);
      border-radius: var(--mat-sys-corner-medium);
      padding: 0.6rem 0.9rem;
      margin-bottom: 0.75rem;
    }
    .cola__cabecera {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .cola__icono {
      color: var(--ay-pago);
    }
    .cola__lista {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.5rem;
    }
    .chip {
      font-size: 0.8rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ay-pago) 14%, transparent);
      color: var(--ay-pago);
    }
    .chip--error {
      background: var(--mat-sys-error-container);
    }
    .nota {
      margin: 0.4rem 0 0;
      font-size: 0.82rem;
    }
    .secundario {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ColaAi33Panel {
  readonly videoId = input.required<number>();
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  protected readonly cola = signal<ColaAi33 | null>(null);

  constructor() {
    effect(() => {
      this.eventos.version(); // llegó una imagen o terminó una tarea
      void this.cargar(this.videoId());
    });
    const reloj = setInterval(() => void this.cargar(this.videoId()), 60_000); // la cola de ai33 no avisa
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  private async cargar(id: number): Promise<void> {
    try {
      this.cola.set(await firstValueFrom(this.http.get<ColaAi33>(`/api/videos/${id}/ai33`)));
    } catch {
      /* sin cola: no se enseña nada */
    }
  }

  protected tiempo(min: number | null): string {
    if (min === null) return '';
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  }
}
