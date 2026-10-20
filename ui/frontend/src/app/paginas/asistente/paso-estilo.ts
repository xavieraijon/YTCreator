import { HttpClient } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
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
import { DatosCrearCanal, EstilosCanal } from '../../core/modelos';
import { TareasService } from '../../core/tareas.service';

/** URL de una imagen de los estilos (ruta bajo canales/ con su `?v=`) en el tamaño pedido. */
export function urlEstilo(ruta: string, ancho: 480 | 960): string {
  const [camino, version] = ruta.split('?');
  const url = `/api/medios/${camino}`.split('/').map(encodeURIComponent).join('/');
  return `${url}?${version ? version + '&' : ''}ancho=${ancho}`;
}

/** Paso 4 de la creación del canal: Claude propone unos estilos y unas escenas de prueba, una tarea pinta cada escena
 * con cada estilo (gratis: Cloudflare o el Mac) y el usuario elige mirando las imágenes. */
@Component({
  selector: 'app-paso-estilo',
  imports: [FormsModule, NgTemplateOutlet, MatButton, MatIcon, MatProgressBar, TarjetaTarea],
  template: `
    @let d = datos();
    @let e = estilos();

    <ng-template #referencia>
      <div class="tarjeta referencia">
        <strong>¿Tienes una imagen que te guste como ejemplo? (opcional)</strong>
        <span class="secundario">
          Sube una imagen o pega su dirección de internet: los estilos que lo pidan se pintarán parecidos a ella.
          Si ya has pedido estilos, vuelve a pedir las imágenes para verlo.
        </span>
        @if (e.referencias.length) {
          <div class="refs">
            @for (r of e.referencias; track r.nombre) {
              <figure class="ref">
                <img [src]="url(r.url, 480)" alt="Imagen de referencia" />
                <button type="button" class="ref__quitar" aria-label="Quitar esta imagen" [disabled]="ocupado()" (click)="quitarReferencia(r.nombre)">
                  <mat-icon>close</mat-icon>
                </button>
                <textarea class="ref__nota" rows="2" maxlength="500" [disabled]="ocupado()" [value]="r.descripcion"
                          placeholder="Qué quieres de esta imagen (opcional): «solo el trazo», «con cara de perro»…"
                          aria-label="Descripción de esta imagen" (blur)="describirReferencia(r.nombre, $any($event.target).value, r.descripcion)"></textarea>
              </figure>
            }
          </div>
        }
        @if (e.referencias.length < 4) {
          <div class="refs__acciones">
            <input #archivo type="file" accept="image/*" hidden (change)="subirReferencia(archivo)" />
            <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="archivo.click()">
              <mat-icon>upload</mat-icon>Subir una imagen
            </button>
            <input class="direccion" name="direccion-referencia" type="url" placeholder="o pega aquí su dirección (https://…)"
                   [(ngModel)]="direccion" (keydown.enter)="$event.preventDefault(); anadirReferencia()" />
            <button mat-stroked-button type="button" [disabled]="ocupado() || direccion.trim().length < 8" (click)="anadirReferencia()">
              <mat-icon>add_link</mat-icon>Añadir
            </button>
          </div>
        }
      </div>
    </ng-template>
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">¿Cómo se van a ver tus vídeos?</h2>
    @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }

    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos preparando estilos para tu canal</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 2-3 minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (e.estilos.length && !otraVez()) {
      <p class="intro">
        Hemos preparado {{ e.estilos.length }} estilos y {{ e.escenas.length }} escenas de prueba de tu canal. Cada
        escena se pinta con cada estilo para que compares con las imágenes delante, no con palabras.
      </p>

      @if (tareaActiva(); as t) {
        <app-tarjeta-tarea [tarea]="t" />
      } @else if (e.faltan) {
        <div class="tarjeta generar">
          <p>
            <strong>{{ e.faltan === 1 ? 'Falta 1 imagen' : 'Faltan ' + e.faltan + ' imágenes' }}.</strong>
            Son gratis: se hacen en internet (unas 90 al día) y, si se acaba, en este ordenador (unos 2 minutos cada una).
          </p>
          @if (d.tarea?.estado === 'error' || d.tarea?.estado === 'interrumpida') {
            <p class="aviso"><mat-icon>info</mat-icon>La última vez no terminó. Las que ya estaban hechas se conservan.</p>
          }
          <button mat-flat-button type="button" [disabled]="ocupado()" (click)="generar()">
            <mat-icon>palette</mat-icon>{{ ocupado() ? 'Lanzando…' : 'Hacer las imágenes' }}
          </button>
        </div>
      }

      <div class="estilos">
        @for (s of e.estilos; track s.id) {
          <section class="estilo" [class.estilo--elegido]="elegido()?.id === s.id">
            <button type="button" class="estilo__cabecera" (click)="propio.set(s.id)">
              <mat-icon class="opcion__radio">{{ elegido()?.id === s.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
              <span class="opcion__cuerpo">
                <span class="opcion__titulo">
                  {{ s.nombre }}
                  @if (s.recomendado) { <span class="chip chip--rec">Recomendado</span> }
                </span>
                @if (s.porque) { <span class="opcion__porque">{{ s.porque }}</span> }
              </span>
            </button>
            @if (quitando() === s.id) {
              <div class="confirmar">
                <span>¿Quitar «{{ s.nombre }}» y sus imágenes?</span>
                <button mat-flat-button type="button" [disabled]="ocupado()" (click)="quitar(s.id)">Sí, quitarlo</button>
                <button mat-button type="button" (click)="quitando.set(null)">No</button>
              </div>
            } @else {
              <button mat-button type="button" class="quitar" [disabled]="ocupado() || !!tareaActiva()" (click)="quitando.set(s.id)">
                <mat-icon>delete</mat-icon>Quitar este estilo
              </button>
            }
            @if (ajustando() === s.id) {
              <div class="ajuste">
                <label class="secundario" [for]="'aj-' + s.id">
                  ¿Qué sale mal? (por ejemplo: «tiene tres brazos», «el trazo es más grueso que en mi ejemplo»). Si lo dejas vacío,
                  el asistente compara las imágenes con tu ejemplo y lo corrige solo. Sirve también con las imágenes que hayas subido.
                </label>
                <textarea [id]="'aj-' + s.id" rows="2" maxlength="600" [(ngModel)]="comentarioAjuste" name="ajuste-{{ s.id }}"></textarea>
                <div class="acciones">
                  <button mat-flat-button type="button" [disabled]="ocupado()" (click)="ajustar(s.id)">
                    <mat-icon>auto_fix_high</mat-icon>{{ ocupado() ? 'Enviando…' : 'Corregir el estilo' }}
                  </button>
                  <button mat-button type="button" (click)="ajustando.set(null)">Cancelar</button>
                </div>
              </div>
            } @else {
              <button mat-button type="button" class="quitar" [disabled]="ocupado() || !!tareaActiva()" (click)="comentarioAjuste = ''; ajustando.set(s.id)">
                <mat-icon>auto_fix_high</mat-icon>Corregir este estilo
              </button>
            }
            <details class="mas fuera">
              <summary>Crearlas por mi cuenta con otra herramienta</summary>
              <p class="secundario">
                Copia el texto de cada escena, pídele la imagen a la herramienta de IA que prefieras
                @if (e.referencias.length) { (adjunta tus imágenes de ejemplo si te las deja usar) }
                y sube aquí el resultado: contará como hecha.
              </p>
              @for (x of e.escenas; track x.id) {
                <div class="fuera__fila">
                  <div class="fuera__texto">
                    <strong>{{ x.texto }}</strong>
                    <code>{{ s.pedidos[x.id] }}</code>
                  </div>
                  <button mat-stroked-button type="button" (click)="copiar(s.pedidos[x.id])"><mat-icon>content_copy</mat-icon>Copiar texto</button>
                  <input #propia type="file" accept="image/*" hidden (change)="subirPropia(s.id, x.id, propia)" />
                  <button mat-stroked-button type="button" [disabled]="ocupado() || !!tareaActiva()" (click)="propia.click()">
                    <mat-icon>upload</mat-icon>{{ s.imagenes[x.id] ? 'Cambiar mi imagen' : 'Subir mi imagen' }}
                  </button>
                </div>
              }
            </details>
            <div class="rejilla">
              @for (x of e.escenas; track x.id) {
                @if (s.imagenes[x.id]; as img) {
                  <button type="button" class="celda" (click)="ampliada.set({ ruta: img, texto: s.nombre + ' · ' + x.texto })"
                          [attr.aria-label]="'Ampliar: ' + x.texto">
                    <img [src]="url(img, 480)" [alt]="s.nombre + ': ' + x.texto" loading="lazy" />
                  </button>
                } @else {
                  <div class="celda celda--falta" [title]="x.texto"><mat-icon>image</mat-icon><span>{{ x.texto }}</span></div>
                }
              }
            </div>
          </section>
        }
      </div>

      <ng-container *ngTemplateOutlet="referencia" />

      <form class="tarjeta propio" (ngSubmit)="proponer(true)">
        <label class="campo">
          <span>¿Quieres otro estilo distinto de estos?</span>
          <textarea name="estilo-propio" rows="2" maxlength="600" [(ngModel)]="indicaciones"
                    placeholder="Descríbelo con tus palabras: por ejemplo, acuarela suave, o como un cómic antiguo…"></textarea>
        </label>
        <button mat-stroked-button type="submit" [disabled]="ocupado() || indicaciones.trim().length < 3">
          <mat-icon>add</mat-icon>Probar mi estilo
        </button>
      </form>

      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="!puedeElegir() || ocupado()" (click)="elegir()">
          {{ elegido() && !hechas(elegido()!.id) ? 'Faltan sus imágenes' : 'Elegir este estilo' }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
        <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Probar otros estilos</button>
        @if (quitando() === 'todos') {
          <span class="confirmar">¿Quitar todos los estilos, sus imágenes y tus imágenes de ejemplo?
            <button mat-flat-button type="button" [disabled]="ocupado()" (click)="quitar(null)">Sí, empezar de cero</button>
            <button mat-button type="button" (click)="quitando.set(null)">No</button>
          </span>
        } @else {
          <button mat-button type="button" [disabled]="ocupado() || !!tareaActiva()" (click)="quitando.set('todos')">
            <mat-icon>delete_sweep</mat-icon>Empezar de cero
          </button>
        }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
      </div>
    } @else {
      <p class="intro">
        Te propondremos varios estilos de dibujo para el canal y unas escenas típicas de tus vídeos. Luego se pinta
        cada escena con cada estilo (gratis) y eliges mirando las imágenes.
      </p>
      <label class="campo">
        <span>¿Tienes algo en mente? (opcional)</span>
        <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                  placeholder="Por ejemplo: como un cómic antiguo, colores apagados, nada de caras realistas…"></textarea>
      </label>
      <ng-container *ngTemplateOutlet="referencia" />
      @if (e.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? e.error }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer()">
          <mat-icon>palette</mat-icon>{{ ocupado() ? 'Enviando…' : (otraVez() ? 'Proponer más estilos' : 'Proponer estilos') }}
        </button>
        @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a los que había</button> }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
      </div>
    }
    <details class="mas">
      <summary>Cómo se prueba</summary>
      <p>
        Las escenas son momentos típicos de tus vídeos. Cada estilo es una forma de pedir las imágenes; al elegirlo, todas
        las imágenes del canal se pedirán así. Las pruebas se guardan en la carpeta del canal (videos/_pruebas/estilo) y
        no se publican. «Probar otros estilos» conserva los de ahora y añade más; con «Quitar este estilo» o «Empezar de cero»
        limpias los que no te gusten («Empezar de cero» quita también tus imágenes de ejemplo).
      </p>
    </details>

    @if (ampliada(); as a) {
      <div class="visor" role="dialog" aria-modal="true" [attr.aria-label]="a.texto" (click)="ampliada.set(null)">
        <img [src]="url(a.ruta, 960)" [alt]="a.texto" />
        <p>{{ a.texto }}</p>
        <button type="button" class="visor__cerrar" aria-label="Cerrar"><mat-icon>close</mat-icon></button>
      </div>
    }
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    .generar { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
    .generar p { margin: 0; }
    .estilos { display: flex; flex-direction: column; gap: 0.9rem; }
    .estilo { border: 1px solid var(--ay-borde); border-radius: var(--ay-radio); padding: 0.6rem; }
    .estilo--elegido { border-color: var(--ay-acento); box-shadow: 0 0 0 1px var(--ay-acento); }
    .estilo__cabecera {
      display: flex; gap: 0.6rem; align-items: flex-start; width: 100%; text-align: left; font: inherit; color: inherit;
      background: none; border: 0; padding: 0.2rem; cursor: pointer;
    }
    .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.4rem; margin-top: 0.5rem; }
    .celda {
      aspect-ratio: 16 / 9; border: 0; padding: 0; border-radius: var(--ay-radio-peq); overflow: hidden; cursor: zoom-in;
      background: var(--ay-superficie-3);
    }
    .celda img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .celda--falta {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.2rem; cursor: default;
      color: var(--ay-tenue); font-size: 0.75rem; text-align: center; padding: 0.4rem;
    }
    .celda--falta span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .quitar { margin-left: auto; display: flex; }
    .confirmar { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; font-size: 0.9rem; }
    .referencia { display: flex; flex-direction: column; gap: 0.5rem; max-width: 44rem; }
    .refs, .refs__acciones { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .ref { position: relative; margin: 0; width: 11rem; }
    .ref img { width: 100%; border-radius: var(--ay-radio-peq); display: block; }
    .ref__nota { width: 100%; box-sizing: border-box; margin-top: 0.3rem; font: inherit; font-size: 0.8rem; resize: vertical;
      padding: 0.3rem 0.45rem; border: 1px solid var(--ay-borde-fuerte); border-radius: var(--ay-radio-peq);
      background: var(--ay-superficie-2); color: var(--ay-tinta); }
    .ajuste { display: flex; flex-direction: column; gap: 0.4rem; margin: 0.5rem 0; }
    .ajuste textarea { width: 100%; }
    .fuera { margin: 0.5rem 0; }
    .fuera__fila { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-top: 1px solid var(--ay-borde-fuerte); }
    .fuera__texto { flex: 1 1 18rem; display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
    .fuera__texto code { font-size: 0.78rem; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ay-tinta-suave, inherit); }
    .ref__quitar { position: absolute; top: 0.15rem; right: 0.15rem; border: 0; border-radius: 50%; cursor: pointer;
      background: rgb(0 0 0 / 65%); color: #fff; display: flex; padding: 0.1rem; }
    .direccion { flex: 1 1 14rem; font: inherit; padding: 0.45rem 0.6rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .campo textarea {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
    .visor {
      position: fixed; inset: 0; z-index: 1000; background: rgb(0 0 0 / 85%); display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; cursor: zoom-out;
    }
    .visor img { max-width: 100%; max-height: calc(100vh - 5rem); border-radius: var(--ay-radio-peq); }
    .visor p { color: #fff; margin: 0; text-align: center; }
    .visor__cerrar { position: absolute; top: 0.5rem; right: 0.5rem; color: #fff; background: none; border: 0; cursor: pointer; }
  `,
})
export class PasoEstilo {
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

  protected readonly estilos = computed<EstilosCanal>(() => this.datos().estilos!);
  protected indicaciones = '';
  protected direccion = '';
  protected readonly otraVez = signal(false);
  protected readonly propio = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly ajustando = signal<string | null>(null);
  protected comentarioAjuste = '';
  protected readonly error = signal<string | null>(null);
  /** Lo que se está a punto de quitar: el id de un estilo o 'todos' (pide confirmar antes). */
  protected readonly quitando = signal<string | null>(null);
  protected readonly ampliada = signal<{ ruta: string; texto: string } | null>(null);

  protected readonly elegido = computed(() => {
    const ps = this.estilos().estilos;
    return ps.find((p) => p.id === this.propio()) ?? ps.find((p) => p.recomendado) ?? ps[0];
  });

  /** La tarea de las imágenes que está en marcha, con su progreso (la del servicio de tareas, en directo). */
  protected readonly tareaActiva = computed(() => {
    const slug = this.datos().creacion?.slug;
    return this.tareas.activas().find((t) => t.herramienta === 'estilo_canal' && t.canal === slug) ?? null;
  });

  protected readonly puedeElegir = computed(() => {
    const s = this.elegido();
    return !!s && this.hechas(s.id) && !this.tareaActiva();
  });

  constructor() {
    effect(() => {
      const i = this.estilos().indicaciones;
      if (i && !this.indicaciones) this.indicaciones = i;
    });
    // Al acabar la tarea, las imágenes nuevas se ven sin esperar al siguiente sondeo.
    let activa = false;
    effect(() => {
      const ahora = !!this.tareaActiva();
      if (activa && !ahora) this.cambio.emit();
      activa = ahora;
    });
  }

  protected url(ruta: string, ancho: 480 | 960): string { return urlEstilo(ruta, ancho); }

  /** Un estilo se puede elegir con al menos una imagen hecha. */
  protected hechas(id: string): boolean {
    const s = this.estilos().estilos.find((x) => x.id === id);
    return !!s && Object.keys(s.imagenes).length > 0;
  }

  protected async proponer(sumar = false): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const otros = (sumar || this.otraVez()) && this.estilos().estilos.length > 0;
      await firstValueFrom(this.http.post('/api/asistente/canal/estilo/proponer', { indicaciones: this.indicaciones, otros }));
      this.otraVez.set(false);
      this.propio.set(null);
      this.cambio.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Pide al asistente corregir el prompt de un estilo mirando sus imágenes (hechas o subidas) frente al ejemplo. */
  protected async ajustar(id: string): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/asistente/canal/estilo/${id}/ajustar`, { comentario: this.comentarioAjuste }));
      this.ajustando.set(null);
      this.cambio.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async subirReferencia(entrada: HTMLInputElement): Promise<void> {
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    await this.cambiarReferencias(() => this.http.put('/api/asistente/canal/estilo/referencia', archivo, { params: { nombre: archivo.name } }));
  }

  protected async anadirReferencia(): Promise<void> {
    const direccion = this.direccion.trim();
    if (direccion.length < 8) return;
    await this.cambiarReferencias(() => this.http.post('/api/asistente/canal/estilo/referencia', { direccion }));
    if (!this.error()) this.direccion = '';
  }

  protected async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      this.error.set('No se ha podido copiar: selecciona el texto y cópialo a mano.');
    }
  }

  protected async subirPropia(estilo: string, escena: string, entrada: HTMLInputElement): Promise<void> {
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    await this.cambiarReferencias(() => this.http.put(`/api/asistente/canal/estilo/${encodeURIComponent(estilo)}/imagen/${encodeURIComponent(escena)}`, archivo));
  }

  protected async describirReferencia(nombre: string, texto: string, anterior: string): Promise<void> {
    if (texto.trim() === anterior.trim()) return;
    await this.cambiarReferencias(() => this.http.put(`/api/asistente/canal/estilo/referencia/${encodeURIComponent(nombre)}/descripcion`, { descripcion: texto }));
  }

  protected async quitarReferencia(nombre: string): Promise<void> {
    await this.cambiarReferencias(() => this.http.delete(`/api/asistente/canal/estilo/referencia/${encodeURIComponent(nombre)}`));
  }

  private async cambiarReferencias(llamada: () => ReturnType<HttpClient['post']>): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(llamada());
      this.cambio.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Quita un estilo (o todos, con `null`) con sus imágenes. */
  protected async quitar(id: string | null): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.delete(id ? `/api/asistente/canal/estilo/${encodeURIComponent(id)}` : '/api/asistente/canal/estilos'));
      this.quitando.set(null);
      if (!id || this.propio() === id) this.propio.set(null);
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
    const fallo = await this.tareas.lanzar('estilo_canal', undefined, { canal: this.datos().creacion?.slug });
    this.error.set(fallo);
    this.ocupado.set(false);
    this.cambio.emit();
  }

  protected async elegir(): Promise<void> {
    const s = this.elegido();
    if (!s) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/estilo/elegir', { estilo: s.id }));
      this.propio.set(null);
      // El paso 5 empieza solo: si Claude está ocupado, se verá el formulario con su botón.
      await firstValueFrom(this.http.post('/api/asistente/canal/voz/proponer', { indicaciones: '', otros: false })).catch(() => undefined);
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
