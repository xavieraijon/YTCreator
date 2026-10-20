import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { OndaAudio } from '../../compartido/onda-audio';
import { urlMedio } from '../../core/medios';
import { VideoDetalle } from '../../core/modelos';

/** Lo montado (detalle técnico del paso de montaje): vídeo final, Shorts, boceto, locución, miniaturas y subtítulos. */
@Component({
  selector: 'app-pestana-montaje',
  imports: [MatIcon, DatePipe, DecimalPipe, OndaAudio],
  template: `
    @let v = video();
    @let m = v.medios;
    @if (!m.videos.length && !m.miniaturas.length && !m.subtitulos.length) {
      <p class="secundario">Todavía no hay nada montado.</p>
    }

    @if (m.videos.length) {
      <h3>Vídeos</h3>
      <div class="videos" [class.videos--vertical]="v.tipo === 'short'">
        @for (x of m.videos; track x.ruta) {
          <figure>
            @defer (on viewport) {
              <video controls preload="metadata" [src]="url(x.ruta)"></video>
            } @placeholder {
              <div class="hueco"></div>
            }
            <figcaption>
              <strong>{{ x.nombre }}</strong>
              <span class="secundario">{{ x.bytes / 1048576 | number: '1.0-1' }} MB · {{ x.modificado * 1000 | date: 'short' }}</span>
            </figcaption>
          </figure>
        }
      </div>
    }

    @if (m.audio.length) {
      <h3>Locución</h3>
      @for (x of m.audio; track x.ruta) {
        <div class="audio">
          <span>{{ x.nombre }}</span>
          <app-onda-audio [canal]="v.canal" [ruta]="x.ruta" />
        </div>
      }
    }

    @if (m.miniaturas.length) {
      <h3>Miniaturas de YouTube</h3>
      <div class="miniaturas">
        @for (x of m.miniaturas; track x.ruta) {
          <a [href]="url(x.ruta)" target="_blank" rel="noopener">
            <img [src]="url(x.ruta)" [alt]="x.nombre" loading="lazy" />
            <span>{{ x.nombre }}</span>
          </a>
        }
      </div>
    }

    @if (m.subtitulos.length) {
      <h3>Subtítulos</h3>
      <ul class="subtitulos">
        @for (x of m.subtitulos; track x.ruta) {
          <li>
            <mat-icon>subtitles</mat-icon>
            <a [href]="url(x.ruta)" [download]="x.nombre">{{ x.nombre }}</a>
          </li>
        }
      </ul>
    }

    @if (m.exportaciones.length) {
      <h3>Para montar fuera</h3>
      <ul class="subtitulos">
        @for (x of m.exportaciones; track x.ruta) {
          <li>
            <mat-icon>folder_zip</mat-icon>
            <a [href]="url(x.ruta)" download="exportacion.zip">{{ x.nombre }}</a>
            <span class="secundario">{{ x.bytes / 1048576 | number: '1.0-1' }} MB</span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    h3 {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-size: 1.15rem;
      font-weight: 600;
      margin: 1.25rem 0 0.5rem;
    }
    .secundario {
      color: var(--mat-sys-on-surface-variant);
    }
    .videos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
      gap: 1rem;
      max-width: 90rem;
    }
    .videos--vertical {
      grid-template-columns: repeat(auto-fill, minmax(16rem, 20rem));
    }
    figure {
      margin: 0;
    }
    video,
    .hueco {
      width: 100%;
      max-height: 70vh;
      background: #000;
      border-radius: var(--mat-sys-corner-small);
    }
    .hueco {
      aspect-ratio: 16 / 9;
    }
    figcaption {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      padding-top: 0.25rem;
    }
    .audio {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      app-onda-audio {
        max-width: 40rem;
        flex: 1;
      }
    }
    .miniaturas {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      a {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        color: inherit;
        text-decoration: none;
      }
      img {
        width: 20rem;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        border-radius: var(--mat-sys-corner-small);
      }
    }
    .subtitulos {
      list-style: none;
      padding: 0;
      li {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.3rem;
      }
    }
  `,
})
export class PestanaMontaje {
  readonly video = input.required<VideoDetalle>();

  protected url(ruta: string): string {
    return urlMedio(this.video().canal, ruta);
  }
}
