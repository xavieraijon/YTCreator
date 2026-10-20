import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { EventosService } from '../../core/eventos.service';

interface DatosGasto {
  creditos: number;
  euros: number;
  tope_euros: number | null;
  superado: boolean;
}

/** Cuánto lleva gastado en servicios de pago este vídeo, y si ha pasado el tope que fijó el usuario en Ajustes. */
@Component({
  selector: 'app-gasto-video',
  imports: [DecimalPipe, MatIcon, RouterLink],
  template: `
    @if (gasto.value(); as g) {
      @if (g.creditos > 0 || g.tope_euros) {
        <div class="gasto" [class.gasto--tope]="g.superado" [title]="g.creditos | number: '1.0-0'">
          <mat-icon>{{ g.superado ? 'warning' : 'payments' }}</mat-icon>
          <span>
            Gasto de pago de este vídeo: <strong>≈ {{ g.euros | number: '1.2-2' }} €</strong>
            @if (g.tope_euros) { · tope {{ g.tope_euros | number: '1.0-2' }} € }
            @if (g.superado) { <br /><a routerLink="/ajustes/gasto">Has pasado el tope: cámbialo en Ajustes</a> }
          </span>
        </div>
      }
    }
  `,
  styles: `
    .gasto { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.6rem 0.75rem; border-radius: var(--ay-radio-peq);
      background: var(--ay-pago-suave); color: var(--ay-pago); font-size: 0.85rem; line-height: 1.4; }
    .gasto mat-icon { flex: none; width: 1.2rem; height: 1.2rem; font-size: 1.2rem; }
    .gasto--tope { background: var(--ay-aviso-suave); color: var(--ay-aviso); }
    a { color: inherit; font-weight: 600; }
  `,
})
export class GastoVideo {
  readonly videoId = input.required<number>();
  private readonly eventos = inject(EventosService);
  protected readonly gasto = httpResource<DatosGasto>(() => {
    this.eventos.version();
    return `/api/videos/${this.videoId()}/gasto`;
  });
}
