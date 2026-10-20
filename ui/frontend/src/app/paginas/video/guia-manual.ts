import { Component, computed, inject, input } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTooltip } from '@angular/material/tooltip';

import { Copiar } from '../../compartido/copiar';
import { PreferenciasPrompts } from '../../compartido/preferencias-prompts';
import { urlMedio } from '../../core/medios';
import { VideoDetalle } from '../../core/modelos';

/** Todo lo necesario para generar a mano (Gemini) las imágenes del vídeo con el mismo estilo que las de ai33:
 *  la imagen de referencia, la instrucción de estilo, el formato y los pasos. */
@Component({
  selector: 'app-guia-manual',
  imports: [MatButton, MatIconButton, MatIcon, MatSlideToggle, MatTooltip],
  template: `
    @let g = video().guia;
    <section class="guia tarjeta">
      <div class="guia__refs">
        @for (r of g.referencias; track r.ruta) {
          <figure class="ref">
            @if (r.existe) {
              <a [href]="url(r.ruta)" target="_blank" rel="noopener" matTooltip="Ver a tamaño completo">
                <img [src]="url(r.ruta, 960)" [alt]="r.nombre" />
              </a>
            } @else {
              <div class="ref__falta"><mat-icon>image_not_supported</mat-icon>No existe todavía</div>
            }
            <figcaption>
              <span><mat-icon>star</mat-icon>{{ r.nombre }}</span>
              @if (r.existe) {
                <a mat-stroked-button [href]="url(r.ruta)" [attr.download]="r.nombre">
                  <mat-icon>download</mat-icon>Descargar
                </a>
              }
            </figcaption>
          </figure>
        } @empty {
          <div class="ref__falta ref__falta--vacia">
            <mat-icon>hide_image</mat-icon>
            <span>Este vídeo no tiene imagen de referencia.</span>
            <small>Se define en guion.json → "ai33" → "referencias_estilo" (una imagen buena del propio vídeo).</small>
          </div>
        }
      </div>

      <div class="guia__texto">
        <span class="antetitulo">Generar a mano · Gemini (Nano Banana)</span>
        <h3>Cómo pedir las imágenes con el estilo del vídeo</h3>
        <ol class="pasos">
          @if (principal(); as r) {
            <li>Adjunta <strong>primero</strong> la imagen de referencia <strong>{{ r }}</strong> (descárgala aquí).</li>
          }
          <li>
            Pega el <strong>prompt de una imagen</strong> (su botón Copiar)@if (conInstruccion()) {: ya lleva delante
            la instrucción que dice que la primera imagen adjunta es la referencia}. Una imagen por petición.
          </li>
          <li>Pide formato <strong>{{ g.aspecto }}</strong>.</li>
          <li>Guarda el resultado como <code>img/EE-N.png</code> (el id de su prompt) y avisa a Claude para conectarla.</li>
        </ol>

        @if (g.instruccion; as instr) {
          <div class="instruccion">
            <div class="instruccion__cabeza">
              <span>Instrucción de estilo</span>
              <button aria-label="Copiar la instrucción" mat-icon-button type="button" matTooltip="Copiar la instrucción"
                      (click)="copia.copiar(instr, 'instruccion', 'Instrucción copiada')">
                <mat-icon>{{ copia.reciente() === 'instruccion' ? 'check' : 'content_copy' }}</mat-icon>
              </button>
            </div>
            <p>{{ instr }}<em>…prompt de la imagen</em></p>
          </div>
          <mat-slide-toggle [checked]="prefs.conInstruccion()" (change)="prefs.cambiar($event.checked)">
            Añadirla delante al copiar los prompts
          </mat-slide-toggle>
        }
        <p class="nota">
          Es lo mismo que hace el kit con las de ai33 ({{ g.modelo }}): referencia + instrucción + prompt final.
          «Copiar … por escenas» copia el lote entero, para guardarlo o pasárselo a Claude, no para pegarlo de golpe.
        </p>
      </div>
    </section>
  `,
  styles: `
    .guia {
      display: grid;
      grid-template-columns: minmax(16rem, 26rem) minmax(0, 1fr);
      gap: 1.75rem;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      background:
        radial-gradient(120% 120% at 0% 0%, var(--ay-acento-suave) 0%, transparent 60%),
        var(--ay-superficie);
    }
    @media (max-width: 900px) {
      .guia {
        grid-template-columns: 1fr;
      }
    }
    .guia__refs {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .ref {
      margin: 0;
    }
    .ref img {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: 10px;
      box-shadow: var(--ay-sombra-alta);
    }
    figcaption {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.6rem;
      font-family: var(--ay-mono);
      font-size: 0.82rem;
      font-weight: 600;
    }
    figcaption span {
      display: flex;
      align-items: center;
      gap: 0.3rem;
    }
    figcaption span mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      color: var(--ay-acento);
    }
    .ref__falta {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      aspect-ratio: 16 / 9;
      padding: 1rem;
      text-align: center;
      border: 1px dashed var(--ay-borde-fuerte);
      border-radius: 10px;
      color: var(--ay-tenue);
    }
    .ref__falta small {
      font-size: 0.75rem;
    }
    .guia__texto h3 {
      margin: 0 0 0.75rem;
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-size: 1.3rem;
      font-weight: 600;
    }
    .pasos {
      margin: 0 0 1rem;
      padding-left: 1.2rem;
      line-height: 1.6;
    }
    .pasos li {
      margin-bottom: 0.2rem;
    }
    .pasos li::marker {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-weight: 700;
      color: var(--ay-acento);
    }
    code {
      font-family: var(--ay-mono);
      font-size: 0.85em;
      padding: 0.05rem 0.3rem;
      border-radius: 4px;
      background: var(--ay-superficie-3);
    }
    .instruccion {
      padding: 0.35rem 0.4rem 0.75rem 0.9rem;
      margin-bottom: 0.75rem;
      border-radius: 10px;
      border-left: 3px solid var(--ay-acento);
      background: var(--ay-superficie-2);
    }
    .instruccion__cabeza {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ay-acento);
    }
    .instruccion p {
      margin: 0;
      padding-right: 0.5rem;
      font-size: 0.87rem;
      line-height: 1.6;
    }
    .instruccion em {
      color: var(--ay-tenue);
    }
    .nota {
      margin: 0.75rem 0 0;
      font-size: 0.78rem;
      color: var(--ay-tenue);
    }
  `,
})
export class GuiaManual {
  readonly video = input.required<VideoDetalle>();
  protected readonly copia = inject(Copiar);
  protected readonly prefs = inject(PreferenciasPrompts);

  protected readonly principal = computed(() => this.video().guia.referencias.map((r) => r.nombre).join(' y ') || null);
  protected readonly conInstruccion = computed(() => this.prefs.conInstruccion() && !!this.video().guia.instruccion);

  protected url(ruta: string, ancho?: 960): string {
    return urlMedio(this.video().canal, ruta, ancho);
  }
}
