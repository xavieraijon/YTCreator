import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';

import { Copiar } from './copiar';
import { RevisionImagen } from './revision-imagen';
import { SubirClip } from './subir-clip';
import { SubirImagen } from './subir-imagen';
import { EventosService } from '../core/eventos.service';

import { Imagen, VideoDetalle } from '../core/modelos';
import { esVideo, urlMedio } from '../core/medios';

export interface DatosVisor {
  canal: string;
  imagenes: Imagen[];
  indice: number;
  /** Con él, el visor permite revisar (marcar mal/bien y rehacer) y se mantiene al día. */
  videoId?: number;
}

const ORIGEN: Record<Imagen['origen'], string> = {
  prompt: 'Generada',
  imagen: 'Archivo propio (imagen)',
  video: 'Clip animado (video)',
  reutilizar: 'Reutiliza otra',
};

/** Imagen a tamaño completo con su prompt; flechas ← → para pasar, Esc para cerrar. */
@Component({
  selector: 'app-visor-imagen',
  imports: [MatDialogModule, MatIcon, MatIconButton, MatButton, RevisionImagen, SubirClip, SubirImagen],
  template: `
    @let img = actual();
    <div class="visor">
      <div class="visor__lienzo">
        <!-- Un elemento nuevo por imagen: nunca se ve la anterior con el rótulo de la siguiente. -->
        @for (x of [img]; track x.ident) {
          @if (anterior(); as a) {
            <img [src]="url(a)" [alt]="x.ident + ' (anterior)'" />
            <span class="visor__aviso">Versión anterior de {{ x.ident }}</span>
          } @else if (!x.existe) {
            <div class="visor__falta"><mat-icon>image_not_supported</mat-icon> Todavía no existe</div>
          } @else if (clip(); as c) {
            <video [src]="c" controls autoplay muted loop></video>
          } @else {
            <img [src]="url(x.ruta!) + version()" [alt]="x.ident" />
          }
        }
        <button matIconButton class="visor__nav visor__nav--prev" (click)="mover(-1)" [disabled]="indice() === 0">
          <mat-icon>chevron_left</mat-icon>
        </button>
        <button matIconButton class="visor__nav visor__nav--next" (click)="mover(1)"
                [disabled]="indice() === lista().length - 1">
          <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
      <aside class="visor__ficha">
        <div class="visor__cabecera">
          <h2>{{ img.ident }}</h2>
          <button matIconButton mat-dialog-close aria-label="Cerrar"><mat-icon>close</mat-icon></button>
        </div>
        <p class="secundario">Escena {{ img.escena }} · {{ indice() + 1 }} de {{ lista().length }}</p>
        <p><span class="etiqueta">{{ origen[img.origen] }}</span></p>
        @if (img.fuente) {
          <p class="secundario fuente">{{ img.origen === 'reutilizar' ? 'Reutiliza ' : '' }}{{ img.fuente }}</p>
        }
        @if (img.prompt) {
          <details class="visor__prompt">
            <summary>Lo que se le pidió al programa que pinta (en inglés)</summary>
            <div class="visor__prompt-cabeza">
              <span class="secundario">Es la descripción del guion. Solo te hace falta si quieres pintarla tú en otro sitio.</span>
              <button mat-stroked-button type="button" (click)="copiar(img.ident, img.prompt)">
                <mat-icon>{{ copia.reciente() === 'visor-' + img.ident ? 'check' : 'content_copy' }}</mat-icon>
                {{ copia.reciente() === 'visor-' + img.ident ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
            <p class="prompt">{{ img.prompt }}</p>
            <p class="secundario nota">La completa (con estilo y paleta) está en «Detalles técnicos», al final del paso de imágenes.</p>
          </details>
        }
        @if (datos.videoId) {
          <app-subir-imagen [videoId]="datos.videoId" [imagen]="img" (cambiado)="recargar()" />
          <app-subir-clip [videoId]="datos.videoId" [imagen]="img" (cambiado)="recargar()" />
          <app-revision-imagen [videoId]="datos.videoId" [imagen]="img" (cambiado)="recargar()" (verAnterior)="anterior.set($event)" />
        }
      </aside>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .visor {
      display: flex;
      height: 100%;
      background: #0c0d11;
    }
    .visor__lienzo {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
    }
    .visor__lienzo :is(img, video) {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    @media (max-width: 800px) {
      .visor {
        flex-direction: column;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .visor__lienzo {
        flex: none;
        height: 38vh;
        width: 100%;
      }
      .visor__ficha {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        overflow: visible;
        overflow-wrap: anywhere;
        padding: 1rem;
        border-left: 0;
      }
    }
    .visor__aviso {
      position: absolute;
      top: 0.75rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.25rem 0.8rem;
      border-radius: 99px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
      background: rgb(0 0 0 / 0.6);
    }
    .visor__falta {
      color: #bbb;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .visor__nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      color: #fff;
      background: rgb(255 255 255 / 0.1);
      backdrop-filter: blur(6px);
    }
    .visor__nav--prev {
      left: 0.5rem;
    }
    .visor__nav--next {
      right: 0.5rem;
    }
    .visor__ficha {
      width: 24rem;
      flex-shrink: 0;
      padding: 1.25rem 1.5rem;
      overflow: auto;
      background: var(--ay-superficie);
      color: var(--ay-tinta);
      border-left: 1px solid var(--ay-borde);
    }
    .visor__prompt {
      margin-top: 1.25rem;
      summary {
        cursor: pointer;
        font-weight: 600;
      }
    }
    .visor__prompt-cabeza {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    .nota {
      font-size: 0.78rem;
    }
    .visor__cabecera {
      display: flex;
      justify-content: space-between;
      align-items: center;
      h2 {
        margin: 0;
        font-family: var(--ay-mono);
        font-size: 1.25rem;
      }
    }
    .secundario {
      color: var(--ay-tenue);
    }
    .fuente {
      overflow-wrap: anywhere;
      font-size: 0.85em;
    }
    h3 {
      font-size: 0.95rem;
      font-weight: 650;
      margin: 1rem 0 0.25rem;
    }
    .prompt {
      margin: 0.5rem 0;
      font-size: 0.9rem;
      line-height: 1.65;
      white-space: pre-wrap;
    }
  `,
})
export class VisorImagen {
  protected readonly datos = inject<DatosVisor>(MAT_DIALOG_DATA);
  protected readonly origen = ORIGEN;
  protected readonly copia = inject(Copiar);

  private readonly http = inject(HttpClient);
  /** Las imágenes, al día: se vuelven a pedir al revisar o cuando llega una imagen rehecha. */
  protected readonly lista = signal(this.datos.imagenes);
  protected readonly indice = signal(this.datos.indice);
  protected readonly actual = computed(() => this.lista()[this.indice()]);
  /** Versión anterior que se está viendo (ruta relativa al canal), o null. */
  protected readonly anterior = signal<string | null>(null);
  /** Evita la caché del navegador cuando la imagen se ha rehecho con el mismo nombre. */
  protected readonly version = signal('');

  constructor() {
    if (this.datos.videoId) {
      const eventos = inject(EventosService);
      let primera = true;
      effect(() => {
        eventos.version();
        if (primera) primera = false;
        else void this.recargar();
      });
    }
    effect(() => {
      this.indice();
      this.anterior.set(null);
    });
  }

  protected async recargar(): Promise<void> {
    if (!this.datos.videoId) return;
    try {
      const v = await firstValueFrom(this.http.get<VideoDetalle>(`/api/videos/${this.datos.videoId}`));
      const nuevas = new Map(v.imagenes.map((i) => [i.ident, i]));
      this.lista.update((l) => l.map((i) => nuevas.get(i.ident) ?? i));
      this.version.set(`?v=${Date.now()}`);
    } catch {
      /* se queda lo que había */
    }
  }
  /** Si la imagen es un clip animado, el clip (la ruta de la imagen es su primer fotograma). */
  protected readonly clip = computed(() => {
    const img = this.actual();
    return img.origen === 'video' && esVideo(img.fuente) ? urlMedio(this.datos.canal, img.fuente!) : null;
  });

  protected url(ruta: string): string {
    return urlMedio(this.datos.canal, ruta);
  }

  protected copiar(ident: string, prompt: string): void {
    this.copia.copiar(prompt, 'visor-' + ident, `Descripción ${ident} copiada`);
  }

  protected mover(paso: number): void {
    this.indice.update((i) => Math.min(Math.max(i + paso, 0), this.lista().length - 1));
  }

  @HostListener('document:keydown', ['$event'])
  protected tecla(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.closest?.('textarea, input')) return;   // escribiendo: las flechas son del texto
    if (e.key === 'ArrowRight') this.mover(1);
    else if (e.key === 'ArrowLeft') this.mover(-1);
    else return;
    e.preventDefault();
  }

  static abrir(dialog: MatDialog, datos: DatosVisor) {
    return dialog.open(VisorImagen, {
      data: datos,
      width: '96vw',
      maxWidth: '96vw',
      height: '92vh',
      panelClass: 'panel-visor',
      autoFocus: false,
    });
  }
}
