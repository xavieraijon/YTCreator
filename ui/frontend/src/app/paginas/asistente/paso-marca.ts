import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';

import { firstValueFrom } from 'rxjs';

import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';
import { DatosCrearCanal, MarcaPropuesta, MarcasCanal } from '../../core/modelos';
import { TareasService } from '../../core/tareas.service';
import { urlMuestra } from './paso-voz';

const COLORES: [keyof MarcaPropuesta['colores'], string][] = [
  ['acento', 'Acento'], ['resaltado', 'Resaltado'], ['texto', 'Texto'], ['fondo', 'Fondo'],
];

/** Paso 6 de la creación del canal: Claude propone combinaciones de tipografía, colores y música; una tarea pinta una
 * miniatura de prueba con cada una sobre las imágenes del estilo elegido y prepara la música para escucharla (todo
 * gratis); el usuario elige viéndolas y oyéndolas. */
@Component({
  selector: 'app-paso-marca',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar, TarjetaTarea],
  template: `
    @let d = datos();
    @let m = marcas();
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">¿Cómo se va a ver y a oír tu canal?</h2>
    @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }

    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos preparando la marca de tu canal</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 2-3 minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (m.propuestas.length && !otraVez()) {
      <p class="intro">
        Hemos propuesto {{ m.propuestas.length }} combinaciones de letra, colores y música. Cada miniatura es de
        prueba, con las imágenes de tu estilo{{ m.titulo ? ' y el texto «' + m.titulo + '»' : '' }}.
      </p>

      @if (tareaActiva(); as t) {
        <app-tarjeta-tarea [tarea]="t" />
      } @else if (m.faltan) {
        <div class="tarjeta generar">
          @if (m.sin_fondos) {
            <p class="aviso"><mat-icon>info</mat-icon>El estilo elegido no tiene imágenes donde pintar las miniaturas.</p>
          } @else {
            <p>
              <strong>{{ m.faltan === 1 ? 'Falta 1 muestra' : 'Faltan ' + m.faltan + ' muestras' }}.</strong>
              Son gratis y se hacen en este ordenador, en menos de un minuto.
            </p>
            @if (d.tarea?.estado === 'error' || d.tarea?.estado === 'interrumpida') {
              <p class="aviso"><mat-icon>info</mat-icon>La última vez no terminó. Las que ya estaban hechas se conservan.</p>
            }
            <button mat-flat-button type="button" [disabled]="ocupado()" (click)="generar()">
              <mat-icon>palette</mat-icon>{{ ocupado() ? 'Lanzando…' : 'Hacer las muestras' }}
            </button>
          }
        </div>
      }

      <div class="marcas">
        @for (x of m.propuestas; track x.id) {
          <section class="marca" [class.marca--elegida]="elegida()?.id === x.id">
            <button type="button" class="marca__cabecera" (click)="propia.set(x.id)">
              <mat-icon class="opcion__radio">{{ elegida()?.id === x.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
              <span class="opcion__cuerpo">
                <span class="opcion__titulo">
                  {{ x.nombre }}
                  @if (x.recomendada) { <span class="chip chip--rec">Recomendada</span> }
                </span>
                @if (x.porque) { <span class="opcion__porque">{{ x.porque }}</span> }
                <span class="opcion__porque">Letra: {{ x.fuente_nombre || x.fuente }} · Música: {{ x.musica }}</span>
              </span>
            </button>
            <div class="colores" aria-label="Colores">
              @for (c of colores; track c[0]) {
                <span class="color"><span class="color__muestra" [style.background]="x.colores[c[0]]"></span>{{ c[1] }} {{ x.colores[c[0]] }}</span>
              }
            </div>
            <div class="miniaturas">
              @for (f of x.miniaturas; track f) {
                <img [src]="url(f)" [alt]="'Miniatura de prueba: ' + x.nombre" loading="lazy" />
              } @empty {
                <p class="secundario">Aún sin miniatura de prueba</p>
              }
            </div>
            @if (x.audio; as a) {
              <div class="muestra">
                <span class="muestra__rotulo">Música «{{ x.musica }}»</span>
                <audio controls preload="none" [src]="url(a)" [attr.aria-label]="x.nombre + ': música'"></audio>
              </div>
            }
          </section>
        }
      </div>

      @if (m.marca; as k) {
        <details class="mas">
          <summary>Los textos de marca que se guardarán</summary>
          <ul>
            @if (k.titulo) { <li>Nombre en el banner: {{ k.titulo }}</li> }
            @if (k.lema) { <li>Lema: {{ k.lema }}</li> }
            @if (k.pilares) { <li>Pilares: {{ k.pilares }}</li> }
            @if (m.pantalla_final?.lema) { <li>Despedida: {{ m.pantalla_final?.lema }}</li> }
            @if (m.hashtags?.length) { <li>Etiquetas de los Shorts: {{ m.hashtags!.join(' ') }}</li> }
          </ul>
        </details>
      }

      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="!puedeElegir() || ocupado()" (click)="elegir()">
          {{ elegida() && !elegida()!.miniaturas.length ? 'Falta su miniatura' : 'Elegir esta marca' }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
        <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Probar otras</button>
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
      </div>
    } @else {
      <p class="intro">
        Te propondremos varias combinaciones de letra para los títulos, colores y música. Verás cada una en una
        miniatura de prueba con las imágenes de tu estilo, y eliges.
      </p>
      <label class="campo">
        <span>¿Cómo te lo imaginas? (opcional)</span>
        <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                  placeholder="Por ejemplo: letras grandes y contundentes, colores cálidos, música tensa pero no de miedo…"></textarea>
      </label>
      @if (m.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? m.error }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer()">
          <mat-icon>palette</mat-icon>{{ ocupado() ? 'Enviando…' : (otraVez() ? 'Proponer más' : 'Proponer marca') }}
        </button>
        @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a las que había</button> }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
      </div>
    }
    <details class="mas">
      <summary>Cómo se prueba</summary>
      <p>
        Las miniaturas de prueba se pintan en este ordenador sobre las imágenes del estilo que elegiste, con cada letra y
        cada color; la música son 30 segundos de la música que ya viene incluida. No cuesta nada. Al elegir, la letra, los colores y los
        textos de marca se guardan para todo el canal; el avatar y el banner se harán después con ellos. Las pruebas se
        guardan en la carpeta del canal (videos/_pruebas/marca) y no se publican.
      </p>
    </details>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    .generar { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
    .generar p { margin: 0; }
    .marcas { display: flex; flex-direction: column; gap: 0.7rem; }
    .marca { border: 1px solid var(--ay-borde); border-radius: var(--ay-radio); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .marca--elegida { border-color: var(--ay-acento); box-shadow: 0 0 0 1px var(--ay-acento); }
    .marca__cabecera {
      display: flex; gap: 0.6rem; align-items: flex-start; width: 100%; text-align: left; font: inherit; color: inherit;
      background: none; border: 0; padding: 0.2rem; cursor: pointer;
    }
    .colores { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; padding-left: 2rem; font-size: 0.82rem; }
    .color { display: inline-flex; align-items: center; gap: 0.35rem; }
    .color__muestra { width: 1rem; height: 1rem; border-radius: 50%; border: 1px solid var(--ay-borde-fuerte); }
    .miniaturas { display: flex; flex-wrap: wrap; gap: 0.5rem; padding-left: 2rem; }
    .miniaturas img { width: min(18rem, 100%); aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--ay-radio-peq); border: 1px solid var(--ay-borde); }
    .miniaturas p { margin: 0; }
    .muestra { display: flex; flex-direction: column; gap: 0.2rem; padding-left: 2rem; }
    .muestra audio { width: min(20rem, 100%); }
    .muestra__rotulo { font-size: 0.8rem; font-weight: 600; }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .campo textarea {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
  `,
})
export class PasoMarca {
  readonly datos = input.required<DatosCrearCanal>();
  readonly numero = input.required<number>();
  /** El usuario quiere hablarlo con Claude: el asistente abre el chat. */
  readonly hablar = output<void>();
  /** Algo cambió (propuesta encargada, tarea lanzada): volver a pedir el estado. */
  readonly cambio = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);
  private readonly tareas = inject(TareasService);

  protected readonly colores = COLORES;
  protected readonly marcas = computed<MarcasCanal>(() => this.datos().marcas!);
  protected indicaciones = '';
  protected readonly otraVez = signal(false);
  protected readonly propia = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly elegida = computed(() => {
    const ps = this.marcas().propuestas;
    return ps.find((x) => x.id === this.propia()) ?? ps.find((x) => x.recomendada) ?? ps[0];
  });

  /** La tarea de las muestras que está en marcha, con su progreso. */
  protected readonly tareaActiva = computed(() => {
    const slug = this.datos().creacion?.slug;
    return this.tareas.activas().find((t) => t.herramienta === 'marca_canal' && t.canal === slug) ?? null;
  });

  protected readonly puedeElegir = computed(() => {
    const x = this.elegida();
    return !!x && x.miniaturas.length > 0 && !this.tareaActiva();
  });

  constructor() {
    effect(() => {
      const i = this.marcas().indicaciones;
      if (i && !this.indicaciones) this.indicaciones = i;
    });
    // Al acabar la tarea, las muestras nuevas se ven sin esperar al siguiente sondeo.
    let activa = false;
    effect(() => {
      const ahora = !!this.tareaActiva();
      if (activa && !ahora) this.cambio.emit();
      activa = ahora;
    });
  }

  protected url(ruta: string): string { return urlMuestra(ruta); }

  protected async proponer(): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const otros = this.otraVez() && this.marcas().propuestas.length > 0;
      await firstValueFrom(this.http.post('/api/asistente/canal/marca/proponer', { indicaciones: this.indicaciones, otros }));
      this.otraVez.set(false);
      this.propia.set(null);
      this.cambio.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async generar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    this.error.set(await this.tareas.lanzar('marca_canal', undefined, { canal: this.datos().creacion?.slug }));
    this.ocupado.set(false);
    this.cambio.emit();
  }

  protected async elegir(): Promise<void> {
    const x = this.elegida();
    if (!x) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/marca/elegir', { marca: x.id }));
      this.propia.set(null);
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
