import { Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { AvisosService } from '../core/avisos.service';

/** Avisos de lo que termina en segundo plano, abajo a la izquierda (a la derecha está el botón de Claude). */
@Component({
  selector: 'app-avisos',
  imports: [MatIcon],
  template: `
    <div class="pila" role="status" aria-live="polite">
      @for (a of servicio.avisos(); track a.id) {
        <div class="aviso" [class.aviso--error]="a.tono === 'error'">
          <mat-icon>{{ a.tono === 'error' ? 'error' : 'check_circle' }}</mat-icon>
          <span>{{ a.texto }}</span>
          @if (a.enlace) { <button type="button" class="ver" (click)="servicio.ir(a)">Ver</button> }
          <button type="button" class="cerrar" aria-label="Cerrar el aviso" (click)="servicio.cerrar(a.id)"><mat-icon>close</mat-icon></button>
        </div>
      }
    </div>
  `,
  styles: `
    .pila { position: fixed; left: 1.5rem; bottom: 1.5rem; z-index: 30; display: flex; flex-direction: column; gap: 0.5rem; max-width: min(26rem, calc(100vw - 2rem)); }
    .aviso { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.6rem 0.7rem 0.9rem; border-radius: var(--ay-radio);
      background: var(--ay-lateral); color: #fff; box-shadow: var(--ay-sombra-alta); font-size: 0.9rem; line-height: 1.35; }
    .aviso > mat-icon { color: #7ee2a8; flex: none; }
    .aviso--error > mat-icon { color: #ffb4a8; }
    .aviso span { flex: 1; }
    .ver { all: unset; cursor: pointer; font-weight: 650; padding: 0.25rem 0.55rem; border-radius: var(--ay-radio-peq); color: #b9c7ff; }
    .ver:hover, .ver:focus-visible { background: rgb(255 255 255 / 0.12); }
    .cerrar { all: unset; cursor: pointer; display: grid; place-items: center; width: 1.8rem; height: 1.8rem; border-radius: 50%; color: rgb(255 255 255 / 0.7); }
    .cerrar:hover, .cerrar:focus-visible { background: rgb(255 255 255 / 0.12); }
    .cerrar mat-icon { font-size: 1.1rem; width: 1.1rem; height: 1.1rem; }
    @media (max-width: 760px) { .pila { left: 1rem; right: 1rem; bottom: 5rem; max-width: none; } }
  `,
})
export class Avisos {
  protected readonly servicio = inject(AvisosService);
}
