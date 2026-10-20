import { Component, computed, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

import { urlMedio } from '../core/medios';
import { GuiaManual, Imagen } from '../core/modelos';
import { PreferenciasPrompts } from './preferencias-prompts';
import { Copiar } from './copiar';

const ICONO: Partial<Record<Imagen['origen'], string>> = {
  video: 'movie',
  reutilizar: 'content_copy',
  imagen: 'upload_file',
};

/** Miniatura clicable de una imagen del guion, con su id y el tipo de origen. */
@Component({
  selector: 'app-miniatura-imagen',
  imports: [MatIcon],
  template: `
    @let img = imagen();
    <div class="caja">
    <button type="button" class="mini" [class.mini--falta]="!img.existe" [class.mini--rehacer]="img.desactualizada" [class.mini--mal]="img.revision?.estado === 'mal'" [class.mini--vertical]="vertical()" [title]="img.desactualizada ? 'A rehacer: existe, pero su descripción ha cambiado y se sustituirá en la próxima pasada' : !img.existe ? 'Nueva: todavía no existe' : ''">
      @if (img.existe) {
        <img [src]="src()" [alt]="img.ident" loading="lazy" />
      } @else {
        <span class="mini__falta"><mat-icon>{{ img.en_cola ? 'schedule' : 'add_photo_alternate' }}</mat-icon>{{ img.en_cola ? 'En espera' : 'Nueva' }}</span>
      }
      @if (img.motor === 'ai33') {
        <span class="mini__motor" title="Imagen de calidad (de pago)">pago</span>
      }
      @if (img.revision?.estado === 'mal') {
        <span class="mini__marca mini__marca--mal" [title]="'Marcada como mal: ' + img.revision?.motivo"><mat-icon>report</mat-icon>Mal</span>
      } @else if (img.revision?.estado === 'rehecha') {
        <span class="mini__marca mini__marca--rehecha" title="Se rehízo después de marcarla: revísala"><mat-icon>fiber_new</mat-icon>Rehecha · revisar</span>
      } @else if (img.desactualizada) {
        <span class="mini__rehacer"><mat-icon>{{ img.en_cola ? 'schedule' : 'sync_problem' }}</mat-icon>{{ img.en_cola ? 'En espera' : 'A rehacer' }}</span>
      }
      <span class="mini__pie">
        {{ img.ident }}
        @if (icono(); as i) {
          <mat-icon>{{ i }}</mat-icon>
        }
      </span>
    </button>
    @if (img.prompt_final ?? img.prompt; as p) {
      <button
        type="button"
        class="copiar"
        [class.copiar--hecho]="copia.reciente() === 'mini-' + img.ident"
        [class.copiar--siempre]="!img.existe || img.desactualizada"
        [attr.aria-label]="'Copiar la descripción de ' + img.ident"
        title="Copiar la descripción completa (con estilo y paleta)"
        (click)="$event.stopPropagation(); copia.copiar(prefs.preparar(p, guia()), 'mini-' + img.ident, 'Descripción ' + img.ident + ' copiada')"
      >
        <mat-icon>{{ copia.reciente() === 'mini-' + img.ident ? 'check' : 'content_copy' }}</mat-icon>
      </button>
    }
    </div>
  `,
  styles: `
    .caja {
      position: relative;
    }
    .copiar {
      position: absolute;
      right: 0.3rem;
      bottom: 0.3rem;
      display: grid;
      place-items: center;
      width: 1.9rem;
      height: 1.9rem;
      padding: 0;
      border: 0;
      border-radius: 7px;
      color: #fff;
      background: rgb(0 0 0 / 0.55);
      backdrop-filter: blur(4px);
      cursor: copy;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s;
      mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }
    }
    .caja:hover .copiar,
    .copiar:focus-visible,
    .copiar--siempre,
    .copiar--hecho {
      opacity: 1;
    }
    .copiar:hover {
      background: var(--ay-acento);
    }
    .copiar--hecho {
      background: var(--ay-ok);
    }
    .mini {
      position: relative;
      display: block;
      width: var(--ancho-mini, 11rem);
      aspect-ratio: 16 / 9;
      padding: 0;
      border: 1px solid var(--ay-borde);
      border-radius: 9px;
      box-shadow: var(--ay-sombra);
      transition: transform 0.18s, box-shadow 0.18s;
      overflow: hidden;
      cursor: zoom-in;
      background: var(--ay-superficie-3);
    }
    .mini:hover {
      transform: translateY(-2px);
      box-shadow: var(--ay-sombra-alta);
    }
    .mini img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .mini--vertical {
      width: var(--ancho-mini-vertical, 6.5rem);
      aspect-ratio: 9 / 16;
    }
    .mini--falta {
      border-style: dashed;
    }
    .mini__falta {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--mat-sys-on-surface-variant);
    }
    .mini__motor {
      position: absolute;
      top: 0;
      left: 0;
      padding: 0.1rem 0.45rem;
      font: var(--mat-sys-label-small);
      font-weight: 700;
      color: #fff;
      background: var(--ay-pago);
      color: var(--ay-superficie);
      border-bottom-right-radius: 6px;
    }
    .mini--rehacer {
      outline: 2px dashed var(--ay-aviso);
      outline-offset: -2px;
    }
    .mini--mal {
      outline: 2px solid var(--ay-error);
      outline-offset: -2px;
    }
    .mini__marca {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.1rem 0.45rem;
      font: var(--mat-sys-label-small);
      font-weight: 700;
      color: #fff;
      border-bottom-left-radius: 6px;
      mat-icon {
        font-size: 0.9rem;
        width: 0.9rem;
        height: 0.9rem;
      }
    }
    .mini__marca--mal {
      background: var(--ay-error);
    }
    .mini__marca--rehecha {
      background: var(--ay-pago);
    }
    .mini__rehacer {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.1rem 0.4rem;
      font: var(--mat-sys-label-small);
      color: #fff;
      background: var(--ay-aviso);
      border-bottom-left-radius: 6px;
      mat-icon {
        font-size: 0.9rem;
        width: 0.9rem;
        height: 0.9rem;
      }
    }
    .mini__pie {
      position: absolute;
      left: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.1rem 0.4rem;
      font: var(--mat-sys-label-small);
      color: #fff;
      background: rgb(0 0 0 / 0.55);
      backdrop-filter: blur(4px);
      font-family: var(--ay-mono);
      border-top-right-radius: 6px;
      mat-icon {
        font-size: 0.9rem;
        width: 0.9rem;
        height: 0.9rem;
      }
    }
  `,
})
export class MiniaturaImagen {
  readonly canal = input.required<string>();
  readonly imagen = input.required<Imagen>();
  readonly vertical = input(false);
  /** Con ella, el prompt se copia con la instrucción de estilo delante (si está activada). */
  readonly guia = input<GuiaManual>();
  protected readonly copia = inject(Copiar);
  protected readonly prefs = inject(PreferenciasPrompts);

  /** Con la marca en la URL: al rehacerse (mismo nombre de archivo) el navegador no enseña la vieja. */
  protected readonly src = computed(() => {
    const r = this.imagen().revision;
    const v = r ? `&v=${r.estado}-${r.historial.length}` : '';
    return urlMedio(this.canal(), this.imagen().ruta!, 480) + v;
  });
  protected readonly icono = computed(() => ICONO[this.imagen().origen] ?? null);
}
