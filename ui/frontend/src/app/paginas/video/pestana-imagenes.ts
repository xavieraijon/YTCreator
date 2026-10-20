import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { firstValueFrom } from 'rxjs';

import { Copiar } from '../../compartido/copiar';
import { textoLote } from '../../compartido/lote-prompts';
import { PreferenciasPrompts } from '../../compartido/preferencias-prompts';
import { estadoImagen } from '../../compartido/estado-imagen';
import { MarcarVarias } from '../../compartido/marcar-varias';
import { ModoRevision } from '../../compartido/modo-revision';
import { MiniaturaImagen } from '../../compartido/miniatura-imagen';
import { FiltroImagenes, ResumenImagenes, SIN_FILTRO, cumple, nombreFiltro } from '../../compartido/resumen-imagenes';
import { VisorImagen } from '../../compartido/visor-imagen';
import { urlMedio } from '../../core/medios';
import { Imagen, VideoDetalle } from '../../core/modelos';
import { mensajeError } from '../../core/errores';


/** Todas las imágenes del vídeo por escenas, con filtros y las hojas de contactos. */
@Component({
  selector: 'app-pestana-imagenes',
  imports: [MatButton, MatExpansionModule, MatIcon, MiniaturaImagen, ResumenImagenes],
  template: `
    @let v = video();
    <app-resumen-imagenes [imagenes]="v.imagenes" [filtro]="filtro()" (cambiar)="filtro.set($event)" />
    <div class="barra">
      <span class="mostrando">
        Mostrando: <strong>{{ nombre() }}</strong> ({{ filtradas().length }})
        @if (filtro().estado || filtro().motor) {
          <button type="button" class="quitar" (click)="filtro.set(sinFiltro)"><mat-icon>close</mat-icon>ver todas</button>
        }
      </span>
      @if (marcas().mal) {
        <button type="button" class="marca marca--mal" [class.marca--activa]="marca() === 'mal'" (click)="alternarMarca('mal')">
          <mat-icon>report</mat-icon>Marcadas mal ({{ marcas().mal }})
        </button>
      }
      @if (marcas().rehecha) {
        <button type="button" class="marca marca--rehecha" [class.marca--activa]="marca() === 'rehecha'" (click)="alternarMarca('rehecha')">
          <mat-icon>fiber_new</mat-icon>Rehechas por revisar ({{ marcas().rehecha }})
        </button>
      }
      <span class="hueco"></span>
      <button mat-stroked-button type="button" class="boton-revision" (click)="alternarSeleccion()">
        <mat-icon>{{ seleccionando() ? 'close' : 'checklist' }}</mat-icon>{{ seleccionando() ? 'Terminar selección' : 'Seleccionar varias' }}
      </button>
      <button mat-flat-button type="button" class="boton-revision" (click)="modoRevision()">
        <mat-icon>rate_review</mat-icon>Modo revisión
        @if (marcas().rehecha || marcas().mal) {
          <span class="boton-revision__cuenta">{{ marcas().rehecha + marcas().mal }}</span>
        }
      </button>
      @if (conPrompt(); as n) {
        <button mat-flat-button type="button" (click)="copiarLote()">
          <mat-icon>{{ copia.reciente() === 'lote-imagenes' ? 'check' : 'content_copy' }}</mat-icon>
          Copiar {{ n }} descripciones por escenas
        </button>
      }
    </div>

    @if (v.medios.hojas.length) {
      <mat-accordion class="hojas">
        @for (h of v.medios.hojas; track h.ruta) {
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title>{{ h.nombre }}</mat-panel-title>
            </mat-expansion-panel-header>
            @defer (on viewport) {
              <a [href]="url(h.ruta)" target="_blank" rel="noopener">
                <img class="hoja" [src]="url(h.ruta)" [alt]="h.nombre" />
              </a>
            } @placeholder {
              <p>…</p>
            }
          </mat-expansion-panel>
        }
      </mat-accordion>
    }

    @if (seleccionando()) {
      <div class="seleccion">
        <mat-icon>checklist</mat-icon>
        <span>Pulsa las imágenes para elegirlas: <strong>{{ seleccion().size }}</strong> elegidas</span>
        @if (seleccion().size) {
          <button mat-button type="button" (click)="vaciarSeleccion()">Quitar todas</button>
        }
        <span class="hueco"></span>
        @if (errorSeleccion(); as e) {
          <span class="error">{{ e }}</span>
        }
        <button mat-flat-button type="button" class="boton-revision" [disabled]="!seleccion().size || marcandoVarias()"
                (click)="marcarSeleccion()">
          <mat-icon>report</mat-icon>Marcar {{ seleccion().size }} como mal
        </button>
      </div>
    }

    @for (grupo of grupos(); track grupo.escena) {
      <h3><span class="num">{{ grupo.escena }}</span>Escena {{ grupo.escena }}</h3>
      <div class="rejilla">
        @for (img of grupo.imagenes; track img.ident) {
          <div class="celda" [class.celda--elegida]="seleccion().has(img.ident)"
               [class.celda--seleccionable]="seleccionando() && img.origen === 'prompt'">
            <app-miniatura-imagen [canal]="v.canal" [guia]="v.guia" [imagen]="img" [vertical]="v.tipo === 'short'"
                                  (click)="seleccionando() ? elegir(img) : abrir(img)" />
            @if (seleccion().has(img.ident)) {
              <mat-icon class="celda__marca">check_circle</mat-icon>
            }
          </div>
        }
      </div>
    } @empty {
      <p class="secundario">No hay imágenes con este filtro.</p>
    }
  `,
  styles: `
    .barra {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .secundario {
      color: var(--ay-tenue);
    }
    .seleccion {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
      margin: 0 0 1rem;
      padding: 0.6rem 1rem;
      border: 1px solid var(--ay-acento);
      border-radius: var(--ay-radio);
      background: var(--ay-acento-suave);
      box-shadow: var(--ay-sombra);
      .error {
        color: var(--ay-error);
        font-size: 0.85rem;
      }
    }
    .celda {
      position: relative;
      border-radius: var(--ay-radio-peq);
      outline: 3px solid transparent;
      outline-offset: 2px;
      transition: outline-color 0.15s;
    }
    .celda--seleccionable {
      cursor: pointer;
    }
    .celda--elegida {
      outline-color: var(--ay-acento);
    }
    .celda__marca {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      color: var(--ay-acento);
      background: var(--ay-superficie);
      border-radius: 50%;
      pointer-events: none;
    }
    .boton-revision {
      border-radius: 99px;
    }
    .boton-revision__cuenta {
      margin-left: 0.4rem;
      padding: 0 0.45rem;
      border-radius: 99px;
      background: var(--ay-superficie);
      color: var(--ay-acento-fuerte);
      font-size: 0.78rem;
      font-weight: 700;
    }
    .hueco {
      flex: 1;
    }
    .marca {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.7rem;
      border: 1px solid var(--ay-borde);
      border-radius: 99px;
      background: var(--ay-superficie);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
    }
    .marca--mal {
      color: var(--ay-error);
    }
    .marca--rehecha {
      color: var(--ay-pago);
    }
    .marca--activa {
      border-color: currentColor;
      background: color-mix(in srgb, currentColor 10%, transparent);
    }
    .mostrando {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .quitar {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.1rem 0.5rem;
      border: 1px solid var(--ay-borde);
      border-radius: 99px;
      background: var(--ay-superficie);
      font: inherit;
      font-size: 0.78rem;
      color: var(--ay-tenue);
      cursor: pointer;
      mat-icon {
        font-size: 0.9rem;
        width: 0.9rem;
        height: 0.9rem;
      }
    }
    mat-button-toggle-group {
      max-width: 100%;
      overflow-x: auto;
    }
    .hojas {
      display: block;
      margin-bottom: 1rem;
    }
    .hoja {
      max-width: 100%;
      display: block;
    }
    h3 {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-size: 1.05rem;
      font-weight: 600;
      margin: 1.75rem 0 0.75rem;
    }
    .num {
      display: grid;
      place-items: center;
      width: 1.9rem;
      height: 1.9rem;
      border-radius: 8px;
      font-size: 0.9rem;
      color: var(--ay-acento-fuerte);
      background: var(--ay-acento-suave);
    }
    .rejilla {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      --ancho-mini: 15rem;
      gap: 0.85rem;
      --ancho-mini-vertical: 8rem;
    }
  `,
})
export class PestanaImagenes {
  readonly video = input.required<VideoDetalle>();
  private readonly dialogo = inject(MatDialog);
  protected readonly filtro = signal<FiltroImagenes>(SIN_FILTRO);
  protected readonly sinFiltro = SIN_FILTRO;
  protected readonly nombre = computed(() => nombreFiltro(this.filtro()));
  protected readonly copia = inject(Copiar);
  private readonly prefs = inject(PreferenciasPrompts);

  /** Cuántas de las que se ven tienen prompt (las reutilizadas o los clips no). */
  protected readonly conPrompt = computed(() => this.filtradas().filter((i) => i.prompt_final ?? i.prompt).length);

  /** Filtro por marca de revisión (se suma al de estado). */
  protected readonly marca = signal<'mal' | 'rehecha' | null>(null);
  protected readonly marcas = computed(() => {
    const imgs = this.video().imagenes;
    return {
      mal: imgs.filter((i) => i.revision?.estado === 'mal').length,
      rehecha: imgs.filter((i) => i.revision?.estado === 'rehecha').length,
    };
  });

  protected alternarMarca(m: 'mal' | 'rehecha'): void {
    this.marca.update((x) => (x === m ? null : m));
  }

  protected readonly filtradas = computed(() => {
    const f = this.filtro();
    const m = this.marca();
    return this.video().imagenes.filter(
      (i) => cumple(f, estadoImagen(i), i.origen === 'prompt' ? i.motor : null) && (!m || i.revision?.estado === m),
    );
  });

  protected readonly grupos = computed(() => {
    const mapa = new Map<number, Imagen[]>();
    for (const img of this.filtradas()) mapa.set(img.escena, [...(mapa.get(img.escena) ?? []), img]);
    return [...mapa].map(([escena, imagenes]) => ({ escena, imagenes }));
  });

  /** Los prompts finales de lo que se ve, agrupados por escenas (con el capítulo de cada una). */
  protected copiarLote(): void {
    const v = this.video();
    const capitulos = new Map(v.escenas.map((e) => [e.numero, e.capitulo]));
    const grupos = this.grupos().map((g) => ({
      escena: g.escena,
      titulo: capitulos.get(g.escena) ?? null,
      items: g.imagenes.map((i) => {
        const p = i.prompt_final ?? i.prompt;
        return { ident: i.ident, motor: i.motor, texto: p ? this.prefs.preparar(p, v.guia) : '' };
      }),
    }));
    const que = this.nombre().toLowerCase();
    this.copia.copiar(
      textoLote(`${v.titulo || v.carpeta} · ${que} (versión final)`, grupos, this.prefs.cabecera(v.guia)),
      'lote-imagenes',
      `${this.conPrompt()} descripciones copiadas, por escenas`,
    );
  }

  protected url(ruta: string): string {
    return urlMedio(this.video().canal, ruta);
  }

  // --- Selección de varias para marcarlas como mal de golpe
  private readonly http = inject(HttpClient);
  protected readonly seleccionando = signal(false);
  protected readonly seleccion = signal<Set<string>>(new Set());
  protected readonly marcandoVarias = signal(false);
  protected readonly errorSeleccion = signal<string | null>(null);

  protected alternarSeleccion(): void {
    this.seleccionando.update((x) => !x);
    this.seleccion.set(new Set());
    this.errorSeleccion.set(null);
  }

  protected vaciarSeleccion(): void {
    this.seleccion.set(new Set());
  }

  protected elegir(img: Imagen): void {
    if (img.origen !== 'prompt') return;            // reutilizadas, clips y archivos propios no se rehacen
    const s = new Set(this.seleccion());
    if (s.has(img.ident)) s.delete(img.ident);
    else s.add(img.ident);
    this.seleccion.set(s);
  }

  protected async marcarSeleccion(): Promise<void> {
    const ids = [...this.seleccion()].sort();
    const marca = await MarcarVarias.pedir(this.dialogo, ids);
    if (!marca) return;
    this.marcandoVarias.set(true);
    this.errorSeleccion.set(null);
    try {
      for (const id of ids) {
        await firstValueFrom(this.http.post(`/api/videos/${this.video().id}/imagenes/${id}/revision`,
          { estado: 'mal', motivo: marca.motivo, etiquetas: marca.etiquetas }));
      }
      this.seleccion.set(new Set());
      this.seleccionando.set(false);
      this.modoRevision();                          // a la bandeja, para rehacerlas
    } catch (e) {
      this.errorSeleccion.set(mensajeError(e, 'No se pudieron marcar'));
    } finally {
      this.marcandoVarias.set(false);
    }
  }

  /** Revisión rápida con el teclado y rehacer en lote (compartido/modo-revision.ts). */
  protected modoRevision(): void {
    ModoRevision.abrir(this.dialogo, { videoId: this.video().id, canal: this.video().canal });
  }

  protected abrir(img: Imagen): void {
    const imagenes = this.filtradas();
    VisorImagen.abrir(this.dialogo, { canal: this.video().canal, imagenes, indice: imagenes.indexOf(img), videoId: this.video().id });
  }
}
