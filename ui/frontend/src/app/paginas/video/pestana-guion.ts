import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { ConfirmarService } from '../../compartido/confirmar';
import { MiniaturaImagen } from '../../compartido/miniatura-imagen';
import { OndaAudio } from '../../compartido/onda-audio';
import { VisorImagen } from '../../compartido/visor-imagen';
import { mensajeError } from '../../core/errores';
import { euros as eurosLlano, miles } from '../../core/formato';
import { Imagen, VideoDetalle } from '../../core/modelos';
import { TareasService } from '../../core/tareas.service';

type Coste = { creditos: number; euros: number; caracteres_de_pago: number; escenas: number[] };

/**
 * El guion escena a escena: texto, voz de la escena con karaoke (clic en una palabra → salta ahí), sus imágenes y,
 * por escena, corregir el texto, rehacer solo su voz o marcarla como «suena mal» (bloque C de
 * docs/plan-mejoras-usuario.md: guion y voz sincronizados, para corregir oyendo).
 */
@Component({
  selector: 'app-pestana-guion',
  imports: [DecimalPipe, FormsModule, MatButton, MatIcon, MiniaturaImagen, OndaAudio],
  template: `
    @let v = video();
    @if (!v.escenas.length) {
      <p class="secundario">Este vídeo todavía no tiene guion.json.</p>
    }
    @if (pendientes().length) {
      <section class="pendientes tarjeta">
        <h4><mat-icon>warning</mat-icon>Pendientes de revisar la voz ({{ pendientes().length }})</h4>
        <ul>
          @for (p of pendientes(); track p.numero) {
            <li>
              <a [href]="'#escena-' + p.numero">Escena {{ p.numero }}</a>: {{ p.suena_mal!.motivo }}
            </li>
          }
        </ul>
      </section>
    }
    @for (e of v.escenas; track e.numero) {
      <article class="escena tarjeta" [id]="'escena-' + e.numero" [class.escena--mal]="!!e.suena_mal">
        <header class="escena__cabecera">
          <span class="escena__num">{{ e.numero }}</span>
          <h3>{{ e.capitulo ?? 'Escena ' + e.numero }}</h3>
          <span class="secundario">
            {{ e.palabras }} palabras · ≈ {{ (e.palabras / v.palabras_por_minuto) * 60 | number: '1.0-0' }} s
          </span>
        </header>

        @if (e.audio && e.tiempos?.length) {
          <div class="karaoke">
            <app-onda-audio #onda [canal]="v.canal" [ruta]="e.audio" (tiempo)="marcar(e.numero, $event, e.tiempos!)"
                            (pausa)="despuntar(e.numero)" />
            <p class="karaoke__texto">
              @for (p of e.tiempos; track $index) {
                <span class="palabra" [class.palabra--activa]="sonando() === e.numero && indice() === $index"
                      (click)="onda.saltar(p.inicio)">{{ p.texto }}</span
                >{{ ' ' }}
              }
            </p>
          </div>
        } @else {
          @if (e.audio) {
            <app-onda-audio [canal]="v.canal" [ruta]="e.audio" />
          }
          <p class="escena__texto">{{ e.texto }}</p>
        }

        @if (editando() === e.numero) {
          <div class="editor">
            <textarea [(ngModel)]="borrador" rows="3"></textarea>
            <div class="acciones">
              <button mat-button type="button" (click)="editando.set(null)">Cancelar</button>
              <button mat-flat-button type="button" [disabled]="guardando()" (click)="guardarTexto(e.numero)">Guardar</button>
            </div>
          </div>
        } @else if (marcandoMal() === e.numero) {
          <div class="editor">
            <textarea [(ngModel)]="motivo" rows="2" placeholder="¿Qué suena mal? (un final que sube, un corte, una palabra rara…)"></textarea>
            <div class="acciones">
              <button mat-button type="button" (click)="marcandoMal.set(null)">Cancelar</button>
              <button mat-flat-button type="button" [disabled]="guardando()" (click)="marcarMal(e.numero)">Guardar</button>
            </div>
          </div>
        } @else {
          <div class="escena__acciones">
            <button mat-button type="button" (click)="empezarEdicion(e.numero, e.texto)">
              <mat-icon>edit</mat-icon>Editar el texto
            </button>
            @if (e.audio) {
              <button mat-button type="button" [disabled]="ocupada() === e.numero" (click)="rehacerEscena(e.numero)">
                <mat-icon>replay</mat-icon>Rehacer solo esta
              </button>
            }
            @if (e.suena_mal) {
              <button mat-button type="button" class="boton-mal" [disabled]="guardando()" (click)="quitarMal(e.numero)">
                <mat-icon>warning</mat-icon>Suena mal: {{ e.suena_mal.motivo }} (quitar)
              </button>
            } @else {
              <button mat-button type="button" (click)="empezarMarcarMal(e.numero)">
                <mat-icon>flag</mat-icon>Suena mal
              </button>
            }
          </div>
        }

        @if (error() && errorEscena() === e.numero) {
          <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p>
        }

        <div class="escena__imagenes">
          @for (img of porEscena().get(e.numero) ?? []; track img.ident) {
            <app-miniatura-imagen [canal]="v.canal" [guia]="v.guia" [imagen]="img" [vertical]="v.tipo === 'short'" (click)="abrir(img)" />
          }
        </div>
      </article>
    }
    @if (v.medios.audio.length) {
      <p class="secundario aviso">
        <mat-icon>info</mat-icon> La voz es una locución completa ({{ v.medios.audio[0].nombre }}): está en «Voz y montaje».
      </p>
    }
  `,
  styles: `
    .escena {
      padding: 1.25rem 1.5rem 1.4rem;
      margin-bottom: 1rem;
      max-width: 72rem;
    }
    .escena--mal {
      border-color: var(--ay-error);
    }
    .escena__cabecera {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      h3 {
        flex: 1;
        margin: 0;
        font-family: var(--ay-serif);
        letter-spacing: -0.03em;
        font-size: 1.2rem;
        font-weight: 600;
      }
    }
    .escena__num {
      display: grid;
      place-items: center;
      width: 2.2rem;
      height: 2.2rem;
      border-radius: 9px;
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-weight: 600;
      color: var(--ay-acento-fuerte);
      background: var(--ay-acento-suave);
    }
    .escena__texto {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      line-height: 1.75;
      font-size: 1.08rem;
      max-width: 60rem;
    }
    .karaoke__texto {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      line-height: 1.9;
      font-size: 1.08rem;
      max-width: 60rem;
      margin-top: 0.6rem;
    }
    .palabra {
      cursor: pointer;
      border-radius: 4px;
      padding: 0 0.1rem;
      &:hover {
        background: var(--ay-acento-suave);
      }
    }
    .palabra--activa {
      background: var(--ay-acento);
      color: var(--ay-sobre-acento, #fff);
    }
    .escena__acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      margin-top: 0.3rem;
    }
    .boton-mal {
      color: var(--ay-error);
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin-top: 0.4rem;
      textarea {
        font: inherit;
        padding: 0.5rem 0.6rem;
        border: 1px solid var(--ay-borde);
        border-radius: var(--ay-radio-peq);
        resize: vertical;
      }
      .acciones {
        display: flex;
        justify-content: flex-end;
        gap: 0.4rem;
      }
    }
    .escena__imagenes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.6rem;
    }
    .secundario {
      color: var(--mat-sys-on-surface-variant);
    }
    .aviso {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .pendientes {
      padding: 0.9rem 1.1rem;
      margin-bottom: 1rem;
      border-color: var(--ay-error);
      h4 {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0 0 0.3rem;
        color: var(--ay-error);
      }
      ul {
        margin: 0;
        padding-left: 1.3rem;
      }
    }
    .error {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--ay-error);
      margin: 0.4rem 0 0;
    }
  `,
})
export class PestanaGuion {
  readonly video = input.required<VideoDetalle>();
  private readonly dialogo = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly tareas = inject(TareasService);
  private readonly confirmar = inject(ConfirmarService);

  protected readonly porEscena = computed(() => {
    const mapa = new Map<number, Imagen[]>();
    for (const img of this.video().imagenes) mapa.set(img.escena, [...(mapa.get(img.escena) ?? []), img]);
    return mapa;
  });

  protected readonly pendientes = computed(() => this.video().escenas.filter((e) => e.suena_mal));

  /** Karaoke: la escena que suena y el índice de la palabra que toca ahora (-1 si ninguna). */
  protected readonly sonando = signal<number | null>(null);
  protected readonly indice = signal(-1);

  protected readonly editando = signal<number | null>(null);
  protected readonly marcandoMal = signal<number | null>(null);
  protected borrador = '';
  protected motivo = '';
  protected readonly guardando = signal(false);
  protected readonly ocupada = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly errorEscena = signal<number | null>(null);

  protected abrir(img: Imagen): void {
    const imagenes = this.video().imagenes;
    VisorImagen.abrir(this.dialogo, { canal: this.video().canal, imagenes, indice: imagenes.indexOf(img), videoId: this.video().id });
  }

  /** La palabra que suena ahora mismo, buscando en los tiempos de la escena. */
  protected marcar(numero: number, t: number, tiempos: { inicio: number; fin: number }[]): void {
    this.sonando.set(numero);
    const i = tiempos.findIndex((p) => t >= p.inicio && t < p.fin);
    this.indice.set(i);
  }

  protected despuntar(numero: number): void {
    if (this.sonando() === numero) this.indice.set(-1);
  }

  // --- Editar el texto de la escena -------------------------------------------------------------------------------

  protected empezarEdicion(numero: number, texto: string): void {
    this.error.set(null);
    this.marcandoMal.set(null);
    this.borrador = texto;
    this.editando.set(numero);
  }

  protected async guardarTexto(numero: number): Promise<void> {
    const texto = this.borrador.trim();
    if (!texto) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.put(`/api/videos/${this.video().id}/escena/${numero}/texto`, { texto }));
      this.editando.set(null);
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo guardar el texto'));
      this.errorEscena.set(numero);
    } finally {
      this.guardando.set(false);
    }
  }

  // --- Marcar «suena mal» -------------------------------------------------------------------------------------------

  protected empezarMarcarMal(numero: number): void {
    this.error.set(null);
    this.editando.set(null);
    this.motivo = '';
    this.marcandoMal.set(numero);
  }

  protected async marcarMal(numero: number): Promise<void> {
    const motivo = this.motivo.trim();
    if (!motivo) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.put(`/api/videos/${this.video().id}/voz/escena/${numero}/revision`, { motivo }));
      this.marcandoMal.set(null);
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo marcar la escena'));
      this.errorEscena.set(numero);
    } finally {
      this.guardando.set(false);
    }
  }

  protected async quitarMal(numero: number): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.put(`/api/videos/${this.video().id}/voz/escena/${numero}/revision`, { motivo: null }));
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo quitar la marca'));
      this.errorEscena.set(numero);
    } finally {
      this.guardando.set(false);
    }
  }

  // --- Rehacer solo esta escena --------------------------------------------------------------------------------------

  /** Otra toma de una escena ya locutada: gratis con la voz del canal, o de pago (ai33) con confirmación del coste. */
  protected async rehacerEscena(numero: number): Promise<void> {
    this.error.set(null);
    this.ocupada.set(numero);
    try {
      const c = await firstValueFrom(this.http.get<Coste>(`/api/videos/${this.video().id}/voz`, { params: { escena: numero } }));
      if (!c.creditos) {
        this.error.set(await this.tareas.lanzar('voz_escena', this.video().id, { escena_sola: numero }));
        return;
      }
      const ok = await this.confirmar.pedir({
        titulo: `Repetir la escena ${numero}`,
        tono: 'pago',
        creditos: c.creditos,
        coste: `≈ ${miles(c.creditos)} créditos (${eurosLlano(c.euros)})`,
        mensaje: `Otra toma solo de la escena ${numero}, con la voz del canal (de pago).`,
        detalles: [`${miles(c.caracteres_de_pago)} caracteres.`, 'El resto del bloque no se toca.'],
        aceptar: 'Repetir (de pago)',
      });
      if (!ok) return;
      this.error.set(
        await this.tareas.lanzar('voz_ai33', this.video().id, { confirmado: true, previsto: c.creditos, escena_sola: numero }),
      );
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo calcular el coste de la escena'));
      this.errorEscena.set(numero);
    } finally {
      this.ocupada.set(null);
    }
  }
}
