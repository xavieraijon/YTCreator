import { Component, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

import { Fase } from '../../core/modelos';

/**
 * Las fases del vídeo como un camino clicable: se puede volver a cualquier fase ya hecha para mirarla (o pedir cambios)
 * sin perder nada: lo que se ve cambia, el progreso del vídeo no. Las fases que aún no tocan no se pueden abrir.
 */
@Component({
  selector: 'app-tracker',
  imports: [MatIcon, MatTooltip],
  template: `
    <nav aria-label="Fases del vídeo">
      <ol>
        @for (f of fases(); track f.letra) {
          <li [class]="'fase fase--' + f.estado" [class.fase--vista]="f.letra === vista()">
            <button type="button" [disabled]="f.estado === 'pendiente'" (click)="elegir.emit(f.letra)"
                    [attr.aria-current]="f.letra === vista() ? 'step' : null"
                    [matTooltip]="f.estado === 'hecha' ? 'Volver a ' + f.nombre + ' (no se pierde nada)' : f.estado === 'desactualizada' ? 'Hay que ponerla al día: ' + (f.avisos ?? []).join(' ') : f.estado === 'actual' ? 'Fase actual: ' + f.nombre : 'Todavía no toca'">
              <span class="punto">
                @if (f.estado === 'hecha') { <mat-icon>check</mat-icon> } @else if (f.estado === 'desactualizada') { <mat-icon>sync_problem</mat-icon> } @else { {{ $index + 1 }} }
              </span>
              <span class="nombre">{{ f.nombre }}</span>
            </button>
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    ol { display: flex; list-style: none; margin: 0 0 1.25rem; padding: 0; gap: 0.25rem; }
    li { flex: 1 1 0; min-width: 0; position: relative; }
    li:not(:last-child)::after { content: ''; position: absolute; top: 1.05rem; left: calc(50% + 1.2rem); right: calc(-50% + 1.2rem); height: 2px; background: var(--ay-borde-fuerte); }
    li.fase--hecha:not(:last-child)::after { background: var(--ay-ok); }
    button { all: unset; box-sizing: border-box; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 0.35rem; padding: 0.15rem 0.1rem; cursor: pointer; border-radius: var(--ay-radio-peq); }
    button:disabled { cursor: default; }
    button:not(:disabled):hover .punto { box-shadow: 0 0 0 3px var(--ay-acento-suave); }
    button:focus-visible { outline: 2px solid var(--ay-acento); outline-offset: 2px; }
    .punto { position: relative; z-index: 1; display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 50%; border: 2px solid var(--ay-borde-fuerte); background: var(--ay-fondo); color: var(--ay-tenue); font-weight: 650; font-size: 0.85rem; }
    .punto mat-icon { font-size: 1.15rem; width: 1.15rem; height: 1.15rem; }
    .fase--hecha .punto { background: var(--ay-ok); border-color: var(--ay-ok); color: var(--ay-superficie); }
    .fase--desactualizada .punto { border-color: var(--ay-aviso); color: var(--ay-aviso); background: var(--ay-aviso-suave); }
    .fase--desactualizada .nombre { color: var(--ay-tinta); font-weight: 600; }
    .fase--actual .punto { border-color: var(--ay-acento); color: var(--ay-acento-fuerte); background: var(--ay-acento-suave); }
    .fase--vista .punto { box-shadow: 0 0 0 3px var(--ay-acento-suave); border-color: var(--ay-acento); }
    .nombre { font-size: 0.75rem; line-height: 1.2; text-align: center; color: var(--ay-tenue); overflow-wrap: normal; }
    .fase--vista .nombre, .fase--actual .nombre { color: var(--ay-tinta); font-weight: 600; }
    /* Mismo contenedor que el carril de app-fase-guiada: en columna solo si el carril cabe junto a la fase. */
    @container (min-width: 58rem) {
      ol { flex-direction: column; gap: 0.15rem; margin: 0; }
      li { flex: none; }
      li:not(:last-child)::after { display: none; }
      button { flex-direction: row; gap: 0.75rem; padding: 0.4rem 0.6rem; min-height: 2.75rem; border-radius: var(--ay-radio-peq); }
      button:not(:disabled):hover { background: var(--ay-superficie-3); }
      .fase--vista button { background: var(--ay-acento-suave); }
      .punto { width: 1.75rem; height: 1.75rem; font-size: 0.78rem; flex: none; }
      .nombre { font-size: 0.92rem; text-align: left; }
      .fase--pendiente .nombre { color: var(--ay-tenue); }
    }
    @container (max-width: 44rem) {
      .nombre { display: none; }
      .fase--vista .nombre { display: block; position: absolute; top: 2.6rem; width: 8rem; left: calc(50% - 4rem); }
      li:first-child.fase--vista .nombre { left: 0; text-align: left; }      /* sin salirse por los lados (hallazgo 43) */
      li:last-child.fase--vista .nombre { left: auto; right: 0; text-align: right; }
      ol { margin-bottom: 2.5rem; }
    }
  `,
})
export class Tracker {
  readonly fases = input.required<Fase[]>();
  readonly vista = input.required<string>();
  readonly elegir = output<string>();
}
