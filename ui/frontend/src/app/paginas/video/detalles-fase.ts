import { Component, computed, input, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { urlMedio } from '../../core/medios';
import { VideoDetalle } from '../../core/modelos';
import { PanelHerramientas } from './panel-herramientas';
import { PestanaGuion } from './pestana-guion';
import { PestanaMontaje } from './pestana-montaje';
import { PestanaPrompts } from './pestana-prompts';

/** Vistas de tramo que tienen detalle técnico (las demás no pintan nada). */
const CON_DETALLE = ['guion', 'voz', 'imagenes', 'montaje'];

/**
 * El detalle técnico de un paso, plegado al final de su pantalla: lo que antes vivía en la vista «Avanzado» (guion escena
 * a escena, descripciones de las imágenes, archivos de locución, todo lo montado). Se pinta solo al abrirlo.
 */
@Component({
  selector: 'app-detalles-fase',
  imports: [MatIcon, PanelHerramientas, PestanaGuion, PestanaMontaje, PestanaPrompts],
  template: `
    @if (tiene()) {
      <details class="detalles" (toggle)="abierto.set($any($event.target).open)">
        <summary><mat-icon>tune</mat-icon>Detalles técnicos</summary>
        @if (abierto()) {
          <div class="detalles__cuerpo">
          @let v = video();
          @switch (vista()) {
            @case ('guion') {
              <app-panel-herramientas [video]="v" [solo]="['revisar_guion', 'comparar_referencia']" />
              <h3>Escena a escena</h3>
              <app-pestana-guion [video]="v" />
              <h3>Descripciones de las imágenes</h3>
              <app-pestana-prompts [video]="v" />
            }
            @case ('voz') {
              @if (v.medios.audio.length) {
                <h3>Archivos de locución</h3>
                @for (x of v.medios.audio; track x.ruta) {
                  <div class="audio"><span>{{ x.nombre }}</span><audio controls preload="metadata" [src]="url(x.ruta)"></audio></div>
                }
              } @else {
                <p class="secundario">Todavía no hay archivos de locución.</p>
              }
            }
            @case ('imagenes') { <app-pestana-prompts [video]="v" /> }
            @case ('montaje') { <app-pestana-montaje [video]="v" /> }
          }
          </div>
        }
      </details>
    }
  `,
  styles: `
    .detalles { margin-top: 1.5rem; background: var(--ay-superficie); border: 1px solid var(--ay-borde); border-radius: var(--ay-radio); }
    summary { display: flex; align-items: center; gap: 0.5rem; padding: 0.8rem 1.1rem; cursor: pointer; font-weight: 600; font-size: 0.93rem; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary mat-icon { color: var(--ay-acento); }
    .detalles__cuerpo { padding: 0 1.1rem 1rem; }
    h3 { font-size: 1rem; font-weight: 650; margin: 1.25rem 0 0.5rem; }
    .secundario { color: var(--ay-tenue); }
    .audio { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.4rem; }
    .audio audio { width: min(40rem, 100%); }
  `,
})
export class DetallesFase {
  readonly video = input.required<VideoDetalle>();
  readonly vista = input.required<string>();
  protected readonly tiene = computed(() => CON_DETALLE.includes(this.vista()));
  protected readonly abierto = signal(false);

  protected url(ruta: string): string {
    return urlMedio(this.video().canal, ruta);
  }
}
