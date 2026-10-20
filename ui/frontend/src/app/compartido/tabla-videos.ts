import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { VideoResumen } from '../core/modelos';
import { EstadoVideo } from './estado-video';

/**
 * Los vídeos y Shorts como tarjetas: título, fase, duración, imágenes hechas y montaje. Con `agrupar`, por su situación real
 * (en marcha / listos para subir / publicados / archivados, este plegado) y, dentro, por número (hallazgo 33).
 */
@Component({
  selector: 'app-tabla-videos',
  imports: [MatIcon, RouterLink, DatePipe, DecimalPipe, NgTemplateOutlet, EstadoVideo],
  template: `
    @if (agrupar()) {
      @for (g of grupos(); track g.clave) {
        @if (g.clave === 'archivados') {
          <details class="grupo grupo--plegable">
            <summary><h3>{{ g.nombre }} <span class="grupo__n">{{ g.videos.length }}</span></h3></summary>
            <div class="lista">@for (v of g.videos; track v.id) { <ng-container *ngTemplateOutlet="tarjeta; context: { $implicit: v }" /> }</div>
          </details>
        } @else {
          <section class="grupo">
            <h3>{{ g.nombre }} <span class="grupo__n">{{ g.videos.length }}</span></h3>
            <div class="lista">@for (v of g.videos; track v.id) { <ng-container *ngTemplateOutlet="tarjeta; context: { $implicit: v }" /> }</div>
          </section>
        }
      } @empty {
        <p class="vacio-grande tarjeta">{{ vacio() }}</p>
      }
    } @else {
      <div class="lista">
        @for (v of videos(); track v.id) {
          <ng-container *ngTemplateOutlet="tarjeta; context: { $implicit: v }" />
        } @empty {
          <p class="vacio-grande tarjeta">{{ vacio() }}</p>
        }
      </div>
    }

    <ng-template #tarjeta let-v>
      <a class="video tarjeta" [routerLink]="['/videos', v.id]">
        <div class="video__cabeza">
          <span class="video__tipo">
            <mat-icon>{{ v.tipo === 'short' ? 'smartphone' : 'movie' }}</mat-icon>
            {{ v.tipo === 'short' ? 'Short' : 'Vídeo largo' }}
            @if (v.pilar) { · {{ v.pilar }} }
          </span>
          <app-estado-video [video]="v" />
        </div>
        <h3 class="video__titulo">{{ v.titulo || v.carpeta }}</h3>
        <p class="video__carpeta">{{ numero(v.carpeta) }}{{ mostrarCanal() ? ' · ' + v.canal : '' }}</p>

        @if (v.imagenes_total) {
          <div class="video__barra">
            <span [style.width.%]="(100 * v.imagenes_hechas) / v.imagenes_total"></span>
          </div>
        }
        <div class="video__datos">
          @if (v.imagenes_total) {
            <span title="Imágenes listas (existen y al día) de las del guion"><mat-icon>image</mat-icon>{{ v.imagenes_hechas }}/{{ v.imagenes_total }} listas</span>
          }
          @if (v.duracion_estimada) {
            <span><mat-icon>schedule</mat-icon>≈ {{ v.duracion_estimada | number: '1.0-1' }} min</span>
          }
          @if (v.estado_real?.montaje === 'al_dia') {
            <span class="ok"><mat-icon>check_circle</mat-icon>Montado</span>
          } @else if (v.estado_real?.montaje === 'desactualizado') {
            <span class="aviso"><mat-icon>sync_problem</mat-icon>Hay que volver a montar</span>
          }
          <span class="video__fecha">{{ v.modificado | date: 'd MMM, HH:mm' }}</span>
        </div>
      </a>
    </ng-template>
  `,
  styles: `
    .grupo { margin-bottom: 1.5rem; }
    .grupo h3 { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 0.75rem; font-size: 0.95rem; }
    .grupo__n { font-size: 0.78rem; font-weight: 600; padding: 0.05rem 0.5rem; border-radius: 99px; background: var(--ay-superficie-3); color: var(--ay-tenue); }
    .grupo--plegable summary { cursor: pointer; list-style: none; }
    .grupo--plegable summary h3 { display: inline-flex; color: var(--ay-tenue); }
    .video__datos .aviso { color: var(--ay-aviso); }
    .lista {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
      gap: 1rem;
    }
    .video {
      display: flex;
      flex-direction: column;
      padding: 1.1rem 1.2rem 1rem;
      color: inherit;
      text-decoration: none;
      transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
    }
    .video:hover {
      transform: translateY(-2px);
      box-shadow: var(--ay-sombra-alta);
      border-color: var(--ay-borde-fuerte);
    }
    .video__cabeza {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    .video__tipo {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ay-tenue);
    }
    .video__titulo {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-size: 1.2rem;
      font-weight: 600;
      line-height: 1.25;
      margin: 0.85rem 0 0.25rem;
    }
    .video__carpeta {
      margin: 0 0 1rem;
      font-family: var(--ay-mono);
      font-size: 0.75rem;
      color: var(--ay-tenue);
    }
    .video__barra {
      height: 4px;
      margin-top: auto;
      border-radius: 99px;
      background: var(--ay-superficie-3);
      overflow: hidden;
    }
    .video__barra span {
      display: block;
      height: 100%;
      border-radius: 99px;
      background: linear-gradient(90deg, var(--ay-acento), var(--ay-acento-fuerte));
    }
    .video__datos {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.9rem;
      margin-top: 0.7rem;
      font-size: 0.8rem;
      color: var(--ay-tenue);
    }
    .video__datos span {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .video__datos mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }
    .video__fecha {
      margin-left: auto;
    }
    .ok {
      color: var(--ay-ok);
    }
  `,
})
export class TablaVideos {
  readonly videos = input.required<VideoResumen[]>();
  readonly mostrarCanal = input(false);
  readonly vacio = input('No hay vídeos.');
  readonly agrupar = input(false);

  protected readonly grupos = computed(() => {
    const porNumero = (a: VideoResumen, b: VideoResumen) => this.orden(a.carpeta) - this.orden(b.carpeta);
    const vs = [...this.videos()].sort(porNumero);
    const grupos = [
      { clave: 'marcha', nombre: 'En marcha',
        videos: vs.filter((v) => !v.aparcado && !v.estado_real?.listo_para_subir && !v.estado_real?.publicado && v.fase !== 'cerrado') },
      { clave: 'listos', nombre: 'Listos para subir', videos: vs.filter((v) => !v.aparcado && v.estado_real?.listo_para_subir) },
      { clave: 'publicados', nombre: 'Publicados',
        videos: vs.filter((v) => !v.aparcado && (v.estado_real?.publicado || (v.fase === 'cerrado' && !v.estado_real?.listo_para_subir))) },
      { clave: 'archivados', nombre: 'Archivados', videos: vs.filter((v) => v.aparcado) },
    ];
    return grupos.filter((g) => g.videos.length);
  });

  /** Orden por número de vídeo: los Shorts (S001…) detrás de los largos. */
  private orden(carpeta: string): number {
    const m = /^(S?)(\d+)/.exec(carpeta);
    return m ? (m[1] ? 10_000 : 0) + Number(m[2]) : 99_999;
  }

  /** «Vídeo nº 5» / «Short nº 2» a partir de la carpeta («005-…», «S002-…»): el nombre de la carpeta no se enseña. */
  protected numero(carpeta: string): string {
    const m = /^(S?)(\d+)/.exec(carpeta);
    return m ? `${m[1] ? 'Short' : 'Vídeo'} nº ${Number(m[2])}` : '';
  }
}
