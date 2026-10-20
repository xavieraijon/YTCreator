import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';

import { firstValueFrom } from 'rxjs';

import { ConfirmarService } from '../../compartido/confirmar';
import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';
import { euros, miles } from '../../core/formato';
import { DatosCrearCanal, VocesCanal, VozPropuesta } from '../../core/modelos';
import { TareasService } from '../../core/tareas.service';

/** URL de una muestra de voz (ruta bajo canales/ con su `?v=`). */
export function urlMuestra(ruta: string): string {
  const [camino, version] = ruta.split('?');
  const url = `/api/medios/${camino}`.split('/').map(encodeURIComponent).join('/');
  return version ? `${url}?${version}` : url;
}

/** Paso 5 de la creación del canal: Claude propone voces (de pago, con su muestra oficial, y gratis) y un párrafo como
 * los del canal; una tarea lo locuta con las gratis (las de pago, una a una y solo si el usuario acepta su coste) y el
 * usuario elige escuchándolas. */
@Component({
  selector: 'app-paso-voz',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar, TarjetaTarea],
  template: `
    @let d = datos();
    @let v = voces();
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">¿Con qué voz se van a contar tus vídeos?</h2>
    @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }

    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos buscando voces para tu canal</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 2-3 minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (v.voces.length && !otraVez()) {
      <p class="intro">
        Hemos propuesto {{ v.voces.length }} voces y un párrafo como los de tu canal. Escúchalas leyendo ese
        párrafo: así se oye de verdad cómo sonarán tus vídeos.
      </p>
      @if (v.texto) { <blockquote class="parrafo">{{ v.texto }}</blockquote> }

      @if (tareaActiva(); as t) {
        <app-tarjeta-tarea [tarea]="t" />
      } @else if (v.faltan) {
        <div class="tarjeta generar">
          <p>
            <strong>{{ v.faltan === 1 ? 'Falta 1 muestra' : 'Faltan ' + v.faltan + ' muestras' }}.</strong>
            Son gratis: las voces gratis leen el párrafo y de las de pago se baja la muestra que dan ellos.
          </p>
          @if (d.tarea?.estado === 'error' || d.tarea?.estado === 'interrumpida') {
            <p class="aviso"><mat-icon>info</mat-icon>La última vez no terminó. Las que ya estaban hechas se conservan.</p>
          }
          <button mat-flat-button type="button" [disabled]="ocupado()" (click)="generar()">
            <mat-icon>record_voice_over</mat-icon>{{ ocupado() ? 'Lanzando…' : 'Hacer las muestras' }}
          </button>
        </div>
      }

      <div class="voces">
        @for (x of v.voces; track x.id) {
          <section class="voz" [class.voz--elegida]="elegida()?.id === x.id">
            <button type="button" class="voz__cabecera" (click)="propia.set(x.id)">
              <mat-icon class="opcion__radio">{{ elegida()?.id === x.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
              <span class="opcion__cuerpo">
                <span class="opcion__titulo">
                  {{ x.nombre }}
                  <span class="chip" [class.chip--pago]="x.de_pago">{{ x.de_pago ? 'De pago' : 'Gratis' }}</span>
                  @if (x.recomendado) { <span class="chip chip--rec">Recomendada</span> }
                </span>
                @if (x.porque) { <span class="opcion__porque">{{ x.porque }}</span> }
              </span>
            </button>
            <div class="muestras">
              @if (x.muestra; as m) {
                <div class="muestra">
                  <span class="muestra__rotulo">Tu párrafo</span>
                  <audio controls preload="none" [src]="url(m)" [attr.aria-label]="x.nombre + ': tu párrafo'"></audio>
                  @if (x.ppm) { <span class="secundario">{{ x.ppm }} palabras por minuto</span> }
                </div>
              }
              @if (x.oficial; as o) {
                <div class="muestra">
                  <span class="muestra__rotulo">Muestra de la voz</span>
                  <audio controls preload="none" [src]="url(o)" [attr.aria-label]="x.nombre + ': muestra de la voz'"></audio>
                  @if (!x.muestra) { <span class="secundario">Lee otro texto, quizá en otro idioma</span> }
                </div>
              }
              @if (!x.muestra && !x.oficial && !tareaActiva()) {
                <p class="secundario">{{ x.error ? 'No se pudo hacer: ' + x.error : 'Aún sin muestra' }}</p>
              }
            </div>
            @if (x.avisos.length) {
              <details class="avisos">
                <summary>{{ x.avisos.length }} {{ x.avisos.length === 1 ? 'cosa' : 'cosas' }} que escuchar con atención</summary>
                <ul>@for (a of x.avisos; track $index) { <li>{{ a }}</li> }</ul>
              </details>
            }
            @if (x.de_pago && !x.muestra && v.coste_ai33; as c) {
              <button mat-stroked-button type="button" class="pago" [disabled]="ocupado() || !!tareaActiva()"
                      (click)="muestraDePago(x)">
                <mat-icon>payments</mat-icon>Oírla con tu párrafo ({{ eurosDe(c.euros) }})
              </button>
            }
          </section>
        }
      </div>

      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="!puedeElegir() || ocupado()" (click)="elegir()">
          {{ elegida() && !oida(elegida()!) ? 'Falta su muestra' : 'Elegir esta voz' }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
        <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Probar otras voces</button>
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
      </div>
    } @else {
      <p class="intro">
        Te propondremos varias voces (algunas gratis y otras de pago, con más calidad) y escribirá un párrafo como los
        de tu canal. Luego las escuchas leyéndolo y eliges.
      </p>
      <label class="campo">
        <span>¿Cómo te la imaginas? (opcional)</span>
        <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                  placeholder="Por ejemplo: voz de hombre, grave y tranquila, acento de España, nada de locutor de radio…"></textarea>
      </label>
      @if (v.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? v.error }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer()">
          <mat-icon>record_voice_over</mat-icon>{{ ocupado() ? 'Enviando…' : (otraVez() ? 'Proponer más voces' : 'Proponer voces') }}
        </button>
        @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a las que había</button> }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
      </div>
    }
    <details class="mas">
      <summary>Cómo se prueba</summary>
      <p>
        Las voces gratis leen tu párrafo sin coste. De las de pago se oye primero la muestra que da el servicio (gratis);
        si una te convence, puedes oírla con tu párrafo pagando esa lectura. Al elegir una voz, se guarda para todos los
        vídeos del canal junto con su velocidad (cuántas palabras dice por minuto), que sirve para calcular la duración
        de los guiones. Las pruebas se guardan en la carpeta del canal (videos/_pruebas/voz) y no se publican.
      </p>
    </details>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    .parrafo {
      margin: 0; padding: 0.6rem 0.9rem; border-left: 3px solid var(--ay-acento); background: var(--ay-superficie-2);
      border-radius: var(--ay-radio-peq); max-width: 44rem; font-style: italic;
    }
    .generar { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
    .generar p { margin: 0; }
    .voces { display: flex; flex-direction: column; gap: 0.7rem; }
    .voz { border: 1px solid var(--ay-borde); border-radius: var(--ay-radio); padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
    .voz--elegida { border-color: var(--ay-acento); box-shadow: 0 0 0 1px var(--ay-acento); }
    .voz__cabecera {
      display: flex; gap: 0.6rem; align-items: flex-start; width: 100%; text-align: left; font: inherit; color: inherit;
      background: none; border: 0; padding: 0.2rem; cursor: pointer;
    }
    .muestras { display: flex; flex-wrap: wrap; gap: 0.6rem 1.2rem; padding-left: 2rem; }
    .muestras p { margin: 0; }
    .muestra { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
    .muestra audio { width: min(20rem, 100%); }
    .muestra__rotulo { font-size: 0.8rem; font-weight: 600; }
    .avisos { padding-left: 2rem; font-size: 0.85rem; }
    .avisos ul { margin: 0.3rem 0 0; padding-left: 1.2rem; }
    .pago { align-self: flex-start; margin-left: 2rem; }
    .chip--pago { background: var(--ay-pago-suave); color: var(--ay-pago); }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .campo textarea {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
  `,
})
export class PasoVoz {
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
  private readonly confirmar = inject(ConfirmarService);

  protected readonly voces = computed<VocesCanal>(() => this.datos().voces!);
  protected indicaciones = '';
  protected readonly otraVez = signal(false);
  protected readonly propia = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly elegida = computed(() => {
    const vs = this.voces().voces;
    return vs.find((x) => x.id === this.propia()) ?? vs.find((x) => x.recomendado) ?? vs[0];
  });

  /** La tarea de las muestras que está en marcha (gratis o de pago), con su progreso. */
  protected readonly tareaActiva = computed(() => {
    const slug = this.datos().creacion?.slug;
    return this.tareas.activas().find((t) => (t.herramienta === 'voz_canal' || t.herramienta === 'voz_canal_ai33')
      && t.canal === slug) ?? null;
  });

  protected readonly puedeElegir = computed(() => {
    const x = this.elegida();
    return !!x && this.oida(x) && !this.tareaActiva();
  });

  constructor() {
    effect(() => {
      const i = this.voces().indicaciones;
      if (i && !this.indicaciones) this.indicaciones = i;
    });
    // Al acabar la tarea, las muestras nuevas se oyen sin esperar al siguiente sondeo.
    let activa = false;
    effect(() => {
      const ahora = !!this.tareaActiva();
      if (activa && !ahora) this.cambio.emit();
      activa = ahora;
    });
  }

  protected url(ruta: string): string { return urlMuestra(ruta); }
  protected eurosDe(e: number): string { return euros(e); }

  /** Una voz se puede elegir habiéndola oído: con el párrafo o, si es de pago, al menos su muestra oficial. */
  protected oida(x: VozPropuesta): boolean { return !!x.muestra || !!x.oficial; }

  protected async proponer(): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const otros = this.otraVez() && this.voces().voces.length > 0;
      await firstValueFrom(this.http.post('/api/asistente/canal/voz/proponer', { indicaciones: this.indicaciones, otros }));
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
    this.error.set(await this.tareas.lanzar('voz_canal', undefined, { canal: this.datos().creacion?.slug }));
    this.ocupado.set(false);
    this.cambio.emit();
  }

  /** DE PAGO: el párrafo con una voz de pago, solo si el usuario acepta el coste (el servidor lo vuelve a calcular). */
  protected async muestraDePago(x: VozPropuesta): Promise<void> {
    const c = this.voces().coste_ai33;
    if (!c) return;
    const ok = await this.confirmar.pedir({
      titulo: `Oír «${x.nombre}» con tu párrafo`,
      tono: 'pago',
      creditos: c.creditos,
      coste: `≈ ${miles(c.creditos)} créditos (${euros(c.euros)})`,
      mensaje: 'La voz de pago lee el párrafo de muestra de tu canal, para oír cómo sonarán tus vídeos.',
      detalles: ['Tarda unos segundos o unos minutos, según la cola del servicio.',
        'La muestra que da el servicio ya se puede oír gratis; esto es solo para oírla con tu texto.'],
      aviso: 'La lectura se paga aunque luego no elijas esta voz.',
      aceptar: 'Oírla (de pago)',
      icono: 'record_voice_over',
    });
    if (!ok) return;
    this.ocupado.set(true);
    this.error.set(await this.tareas.lanzar('voz_canal_ai33', undefined,
      { canal: this.datos().creacion?.slug, voz: x.id, confirmado: true, previsto: c.creditos }));
    this.ocupado.set(false);
    this.cambio.emit();
  }

  protected async elegir(): Promise<void> {
    const x = this.elegida();
    if (!x) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/voz/elegir', { voz: x.id }));
      this.propia.set(null);
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
