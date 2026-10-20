import { HttpClient, httpResource } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';

import { firstValueFrom } from 'rxjs';

import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';
import { miles } from '../../core/formato';
import { ConceptoPropuesto, DatosCrearCanal, MedidaNicho, NichoPropuesto, NombrePropuesto, Semaforo } from '../../core/modelos';
import { PasoEstilo } from './paso-estilo';
import { PasoAlta } from './paso-alta';
import { PasoCierre } from './paso-cierre';
import { PasoEquipo } from './paso-equipo';
import { PasoIdeas } from './paso-ideas';
import { PasoMarca } from './paso-marca';
import { PasoReglas } from './paso-reglas';
import { PasoVoz } from './paso-voz';

const NOMBRE_SEMAFORO: Record<Semaforo, string> = { verde: 'Buena opción', ambar: 'Se puede, con matices', rojo: 'Difícil', gris: 'Sin datos' };
const ICONO_SEMAFORO: Record<Semaforo, string> = { verde: 'check_circle', ambar: 'error', rojo: 'cancel', gris: 'help' };
const NOMBRE_SEMAFORO_NOMBRE: Record<Semaforo, string> = { verde: 'Libre', ambar: 'Libre, con matices', rojo: 'No conviene', gris: 'Sin comprobar' };
const NIVEL: Record<string, string> = { alta: 'mucho', media: 'medio', baja: 'poco' };

type Paso = 'mercado' | 'concepto' | 'nombre' | 'estilo';
/** Al elegir en un paso, se encarga a Claude el siguiente (si no puede, se ve el formulario con su botón). */
const SIGUIENTE: Partial<Record<Paso, Paso>> = { mercado: 'concepto', concepto: 'nombre', nombre: 'estilo' };

/** «Paso 3 de 11: Nombre»: la barra de los 11 pasos de la creación del canal y, en los que tienen pantalla propia
 * (1 Mercado, 2 Concepto, 3 Nombre, 4 Estilo en `PasoEstilo`, 5 Voz en `PasoVoz`, 6 Marca en `PasoMarca`), el formulario: Claude propone en segundo plano, la herramienta mide (temas y
 * nombres) y el usuario elige. Los demás pasos se siguen haciendo en el chat (`guiado` = false: el asistente lo enseña
 * debajo). */
@Component({
  selector: 'app-crear-canal',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar, NgTemplateOutlet, PasoAlta, PasoCierre, PasoEquipo, PasoEstilo, PasoIdeas, PasoMarca, PasoReglas, PasoVoz],
  template: `
    @if (datos(); as d) {
      <ol class="barra" aria-label="Pasos para crear el canal">
        @for (p of d.pasos; track p.letra; let i = $index) {
          <li [class]="'barra__paso barra__paso--' + p.estado" [attr.aria-current]="p.estado === 'actual' ? 'step' : null">
            <span class="barra__marca">@if (p.estado === 'hecho') { <mat-icon>check</mat-icon> } @else { {{ i + 1 }} }</span>
            <span class="barra__nombre">{{ p.nombre }}</span>
          </li>
        }
      </ol>

      @if (d.mercado; as m) {
        <span class="antetitulo">Paso 1 de {{ d.pasos.length }}</span>
        <h2 class="titulo">¿De qué va a tratar tu canal?</h2>
        @if (d.trabajo.estado === 'pensando') {
          <ng-container *ngTemplateOutlet="trabajando; context: { $implicit: 'buscando temas para tu canal', d }" />
        } @else if (m.propuestas.length && !otraVez()) {
          <p class="intro">
            Hemos propuesto estos temas para «{{ m.intereses || 'tus gustos' }}». Cada uno se ha medido en YouTube: cuánto
            se busca, si hay sitio para un canal que empieza y cuánto se reparte el público.
          </p>
          <div class="opciones">
            @for (p of m.propuestas; track p.id) {
              <button type="button" class="opcion" [class.opcion--elegida]="elegida()?.id === p.id" (click)="propia.set(p.id)">
                <mat-icon class="opcion__radio">{{ elegida()?.id === p.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
                <span class="opcion__cuerpo">
                  <span class="opcion__titulo">
                    {{ p.nicho }}
                    @if (p.recomendado) { <span class="chip chip--rec">Recomendado</span> }
                  </span>
                  @if (p.publico) { <span class="opcion__texto">Para: {{ p.publico }}</span> }
                  <span class="opcion__porque">{{ p.porque }}</span>
                  @if (p.medida; as x) {
                    <span [class]="'semaforo semaforo--' + x.semaforo">
                      <mat-icon>{{ icono(x.semaforo) }}</mat-icon><strong>{{ nombre(x.semaforo) }}</strong><span>{{ x.motivo }}</span>
                    </span>
                    @if (x.ok) {
                      <span class="cifras">
                        @for (c of cifras(x); track c) { <span>{{ c }}</span> }
                      </span>
                    }
                  } @else {
                    <span class="semaforo semaforo--midiendo"><mat-icon class="girando">sync</mat-icon>Midiendo en YouTube… (1-2 minutos)</span>
                  }
                </span>
              </button>
            }
          </div>
          @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
          @if (elegida()?.medida?.semaforo === 'rojo') {
            <p class="aviso"><mat-icon>info</mat-icon>Este tema es difícil para un canal nuevo. Puedes elegirlo igualmente, pero hará falta un enfoque muy propio.</p>
          }
          <div class="acciones">
            <button mat-flat-button type="button" [disabled]="!elegida()?.medida || ocupado()" (click)="elegir('mercado', elegida()?.id)">
              {{ elegida()?.medida || !elegida() ? 'Elegir este tema' : 'Esperando la medición…' }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
            </button>
            <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Proponer otros</button>
            <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
          </div>
        } @else {
          <p class="intro">
            Cuéntanos qué te gusta o de qué sabes. Te propondremos varios temas para el canal y se medirá cada uno en
            YouTube, para que elijas con datos. No cuesta nada.
          </p>
          <label class="campo">
            <span>¿Qué te interesa?</span>
            <textarea rows="3" maxlength="600" [(ngModel)]="intereses"
                      placeholder="Por ejemplo: historia, economía, misterios sin resolver, curiosidades del cuerpo humano…"></textarea>
          </label>
          @if (m.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? m.error }}</p> }
          <div class="acciones">
            <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer('mercado')">
              <mat-icon>travel_explore</mat-icon>{{ ocupado() ? 'Enviando…' : 'Buscar temas' }}
            </button>
            @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a los que había</button> }
            <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
          </div>
        }
        <details class="mas">
          <summary>Cómo se mide</summary>
          <p>
            Para cada tema se miran en YouTube las búsquedas que haría su público: cuántas visitas tienen los vídeos, si
            canales pequeños consiguen visitas (si solo las tienen los grandes, es difícil empezar) y cuánto se lo llevan los
            tres canales más fuertes. Los ingresos son rangos orientativos de estudios públicos, no una promesa. Las cifras
            salen de una herramienta, no del asistente.
          </p>
        </details>
      } @else if (d.conceptos; as c) {
        <span class="antetitulo">Paso 2 de {{ d.pasos.length }}</span>
        <h2 class="titulo">¿Cómo va a ser tu canal?</h2>
        @if (d.nicho; as n) { <p class="secundario"><mat-icon>check</mat-icon>Tema elegido: {{ n.nicho }}</p> }
        @if (d.trabajo.estado === 'pensando') {
          <ng-container *ngTemplateOutlet="trabajando; context: { $implicit: 'preparando cómo sería tu canal', d }" />
        } @else if (c.propuestas.length && !otraVez()) {
          <p class="intro">
            Hemos pensado estas formas de hacer el canal. El nombre es provisional: lo eliges en el paso siguiente.
          </p>
          <div class="opciones">
            @for (p of c.propuestas; track p.id) {
              <button type="button" class="opcion" [class.opcion--elegida]="conceptoElegido()?.id === p.id" (click)="propia.set(p.id)">
                <mat-icon class="opcion__radio">{{ conceptoElegido()?.id === p.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
                <span class="opcion__cuerpo">
                  <span class="opcion__titulo">
                    {{ p.nombre }}
                    @if (p.recomendado) { <span class="chip chip--rec">Recomendado</span> }
                  </span>
                  <span class="opcion__texto promesa">«{{ p.promesa }}»</span>
                  <span class="ficha">
                    @if (p.pilares.length) { <span><strong>Temas:</strong> {{ p.pilares.join(' · ') }}</span> }
                    @if (p.publico) { <span><strong>Para:</strong> {{ p.publico }}</span> }
                    @if (p.formato) { <span><strong>Vídeos:</strong> {{ p.formato }}</span> }
                    @if (p.narrador) { <span><strong>Quién lo cuenta:</strong> {{ p.narrador }}</span> }
                    @if (p.ritmo) { <span><strong>Ritmo:</strong> {{ p.ritmo }}</span> }
                    @if (p.monetizacion) { <span><strong>De qué vivirá:</strong> {{ p.monetizacion }}</span> }
                  </span>
                  @if (p.para_ninos) {
                    <span class="semaforo semaforo--ambar"><mat-icon>child_care</mat-icon>Para niños: YouTube lo marca así y gana mucho menos con anuncios.</span>
                  }
                </span>
              </button>
            }
          </div>
          @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
          <div class="acciones">
            <button mat-flat-button type="button" [disabled]="!conceptoElegido() || ocupado()" (click)="elegir('concepto', conceptoElegido()?.id)">
              {{ ocupado() ? 'Creando el canal…' : 'Elegir este concepto' }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
            </button>
            <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Proponer otros</button>
            <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
          </div>
        } @else {
          <p class="intro">
            Te propondremos dos o tres formas de hacer el canal sobre ese tema: qué promete cada vídeo, de qué temas
            hablará, para quién es y cómo se cuenta. Si tienes algo claro, díselo.
          </p>
          <label class="campo">
            <span>¿Algo que quieras para tu canal? (opcional)</span>
            <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                      placeholder="Por ejemplo: vídeos cortos, tono serio, sin salir yo en cámara…"></textarea>
          </label>
          @if (c.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? c.error }}</p> }
          <div class="acciones">
            <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer('concepto')">
              <mat-icon>lightbulb</mat-icon>{{ ocupado() ? 'Enviando…' : 'Proponer conceptos' }}
            </button>
            @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a los que había</button> }
            <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
          </div>
        }
      } @else if (d.nombres; as n) {
        <span class="antetitulo">Paso 3 de {{ d.pasos.length }}</span>
        <h2 class="titulo">¿Cómo se va a llamar?</h2>
        @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }
        @if (d.trabajo.estado === 'pensando') {
          <ng-container *ngTemplateOutlet="trabajando; context: { $implicit: 'pensando nombres para tu canal', d }" />
        } @else if (n.propuestas.length && !otraVez()) {
          <p class="intro">
            Cada nombre se ha buscado en YouTube: si su @ está libre y si al buscarlo sale alguien más. Un nombre que no
            comparte búsqueda con nadie es más fácil de encontrar.
          </p>
          <div class="opciones">
            @for (p of n.propuestas; track p.id) {
              <button type="button" class="opcion" [class.opcion--elegida]="nombreElegido()?.id === p.id" (click)="propia.set(p.id)">
                <mat-icon class="opcion__radio">{{ nombreElegido()?.id === p.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
                <span class="opcion__cuerpo">
                  <span class="opcion__titulo">
                    {{ p.nombre }}
                    <span class="arroba">&#64;{{ p.medida?.id ?? p.arroba ?? '…' }}</span>
                    @if (p.recomendado) { <span class="chip chip--rec">Recomendado</span> }
                    @if (p.propio) { <span class="chip">Tuyo</span> }
                  </span>
                  @if (!p.propio) { <span class="opcion__porque">{{ p.porque }}</span> }
                  @if (p.medida; as x) {
                    <span [class]="'semaforo semaforo--' + x.semaforo">
                      <mat-icon>{{ icono(x.semaforo) }}</mat-icon><strong>{{ nombreNombre(x.semaforo) }}</strong><span>{{ x.motivo }}</span>
                    </span>
                    @if (x.ok && x.ejemplos?.length) {
                      <span class="cifras">
                        Vídeos que ya lo llevan en el título: {{ x.videos }}
                        @for (e of x.ejemplos; track e.titulo) { <span>· {{ e.titulo }} ({{ e.canal }})</span> }
                      </span>
                    }
                  } @else {
                    <span class="semaforo semaforo--midiendo"><mat-icon class="girando">sync</mat-icon>Buscándolo en YouTube…</span>
                  }
                </span>
              </button>
            }
          </div>
          @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
          @if (nombreElegido()?.medida?.arroba_libre === false) {
            <p class="aviso"><mat-icon>info</mat-icon>Esa &#64; ya es de otro canal. Elige otro nombre o añádelo abajo con otra &#64;.</p>
          } @else if (nombreElegido()?.medida?.semaforo === 'rojo') {
            <p class="aviso"><mat-icon>info</mat-icon>Ya hay un canal que se llama así: la gente os confundirá. Puedes elegirlo igualmente.</p>
          }
          <div class="acciones">
            <button mat-flat-button type="button" [disabled]="!puedeElegirNombre() || ocupado()" (click)="elegir('nombre', nombreElegido()?.id)">
              {{ nombreElegido()?.medida || !nombreElegido() ? 'Elegir este nombre' : 'Esperando la búsqueda…' }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
            </button>
            <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Proponer otros</button>
            <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
          </div>
          <ng-container *ngTemplateOutlet="anadir" />
        } @else {
          <p class="intro">
            Te propondremos varios nombres y se buscará cada uno en YouTube. Si ya tienes uno en mente, añádelo abajo y
            se comprobará igual.
          </p>
          <label class="campo">
            <span>¿Cómo te gustaría que sonara? (opcional)</span>
            <textarea rows="2" maxlength="600" [(ngModel)]="indicaciones"
                      placeholder="Por ejemplo: corto, que se entienda en inglés, con la palabra dinero…"></textarea>
          </label>
          @if (n.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? n.error }}</p> }
          <div class="acciones">
            <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer('nombre')">
              <mat-icon>edit_note</mat-icon>{{ ocupado() ? 'Enviando…' : 'Proponer nombres' }}
            </button>
            @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a los que había</button> }
            <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
          </div>
          <ng-container *ngTemplateOutlet="anadir" />
        }
        <details class="mas">
          <summary>Cómo se comprueba</summary>
          <p>
            Se busca el nombre en YouTube y se cuentan los canales que se llaman igual o parecido y los vídeos que lo llevan
            en el título. Además se mira si la &#64; está libre. La &#64; no se reserva hasta que crees el canal en YouTube: no
            tardes mucho en hacerlo.
          </p>
        </details>
      } @else if (d.estilos) {
        <app-paso-estilo [datos]="d" [numero]="actual()?.numero ?? 4" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (d.voces) {
        <app-paso-voz [datos]="d" [numero]="actual()?.numero ?? 5" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (d.marcas) {
        <app-paso-marca [datos]="d" [numero]="actual()?.numero ?? 6" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (d.reglas) {
        <app-paso-reglas [datos]="d" [numero]="actual()?.numero ?? 7" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (d.equipo) {
        <app-paso-equipo [datos]="d" [numero]="actual()?.numero ?? 8" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (d.alta) {
        <app-paso-alta [datos]="d" [numero]="actual()?.numero ?? 9" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (d.ideas) {
        <app-paso-ideas [datos]="d" [numero]="actual()?.numero ?? 10" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (d.cierre) {
        <app-paso-cierre [datos]="d" [numero]="actual()?.numero ?? 11" (hablar)="hablar.emit()" (cambio)="recurso.reload()" />
      } @else if (actual(); as a) {
        <span class="antetitulo">Paso {{ a.numero }} de {{ d.pasos.length }}</span>
        <h2 class="titulo">{{ a.nombre }}</h2>
        @if (d.nicho; as n) { <p class="secundario"><mat-icon>check</mat-icon>Tema elegido: {{ n.nicho }}</p> }
        @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }
        <p class="intro">Este paso se hace con el asistente en el chat de aquí debajo: pulsa «Seguir creando el canal» y te enseñará opciones para elegir con un clic.</p>
      }
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }

    <ng-template #trabajando let-que let-d="d">
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos {{ que }}</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 2-3 minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    </ng-template>

    <ng-template #anadir>
      <form class="anadir" (ngSubmit)="anadirNombre()">
        <label class="campo"><span>¿Tienes un nombre en mente?</span>
          <input name="nombre" maxlength="40" [(ngModel)]="nombrePropio" placeholder="Nombre del canal" /></label>
        <label class="campo campo--corto"><span>&#64; que quieres (opcional)</span>
          <input name="arroba" maxlength="31" [(ngModel)]="arrobaPropia" placeholder="SinEspacios" /></label>
        <button mat-stroked-button type="submit" [disabled]="ocupado() || nombrePropio.trim().length < 2"><mat-icon>add</mat-icon>Añadir y comprobar</button>
      </form>
    </ng-template>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { max-width: none; }
    .barra { display: flex; flex-wrap: wrap; gap: 0.35rem; list-style: none; padding: 0; margin: 0 0 1.25rem; }
    .barra__paso {
      display: flex; gap: 0.35rem; align-items: center; padding: 0.2rem 0.6rem 0.2rem 0.2rem; border-radius: 99px;
      border: 1px solid var(--ay-borde); font-size: 0.8rem; color: var(--ay-tenue);
    }
    .barra__marca {
      display: grid; place-items: center; width: 1.35rem; height: 1.35rem; border-radius: 50%;
      background: var(--ay-superficie-3); font-weight: 650;
    }
    .barra__marca mat-icon { font-size: 0.95rem; width: 0.95rem; height: 0.95rem; }
    .barra__paso--hecho { color: var(--ay-ok); border-color: var(--ay-ok); }
    .barra__paso--actual { color: var(--ay-acento); border-color: var(--ay-acento); background: var(--ay-acento-suave); font-weight: 600; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    .cifras { display: flex; flex-direction: column; gap: 0.1rem; }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .promesa { font-family: var(--ay-serif); font-size: 1.1rem; }
    .ficha { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.88rem; color: var(--ay-tenue); }
    .ficha strong { color: var(--ay-tinta); font-weight: 600; }
    .arroba { font-weight: 400; font-size: 0.88rem; color: var(--ay-tenue); }
    .anadir { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; margin: 0.5rem 0 1rem; }
    .anadir .campo { flex: 1 1 14rem; }
    .anadir .campo--corto { flex: 0 1 12rem; }
    .campo textarea, .campo input {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
    .campo textarea:focus, .campo input:focus { outline: 2px solid var(--ay-acento); outline-offset: -1px; }
  `,
})
export class CrearCanal {
  /** El usuario quiere hablarlo con Claude: el asistente abre el chat. */
  readonly hablar = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);

  protected readonly recurso = httpResource<DatosCrearCanal>(() => {
    this.eventos.version();
    return '/api/asistente/canal';
  });
  protected readonly datos = computed(() => (this.recurso.hasValue() ? this.recurso.value() : undefined));
  /** El paso actual tiene pantalla propia (si no, el asistente enseña el chat). */
  readonly guiado = computed(() => this.datos()?.pasos.find((p) => p.estado === 'actual')?.guiado ?? true);
  protected readonly actual = computed(() => {
    const ps = this.datos()?.pasos ?? [];
    const i = ps.findIndex((p) => p.estado === 'actual');
    return i < 0 ? null : { numero: i + 1, nombre: ps[i].nombre };
  });

  protected intereses = '';
  protected indicaciones = '';
  protected nombrePropio = '';
  protected arrobaPropia = '';
  protected readonly otraVez = signal(false);
  protected readonly propia = signal<number | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly elegida = computed<NichoPropuesto | undefined>(() => {
    const ps = this.datos()?.mercado?.propuestas ?? [];
    return ps.find((p) => p.id === this.propia()) ?? ps.find((p) => p.recomendado) ?? ps[0];
  });

  protected readonly conceptoElegido = computed<ConceptoPropuesto | undefined>(() => {
    const ps = this.datos()?.conceptos?.propuestas ?? [];
    return ps.find((p) => p.id === this.propia()) ?? ps.find((p) => p.recomendado) ?? ps[0];
  });

  protected readonly nombreElegido = computed<NombrePropuesto | undefined>(() => {
    const ps = this.datos()?.nombres?.propuestas ?? [];
    return ps.find((p) => p.id === this.propia()) ?? ps.find((p) => p.recomendado) ?? ps[0];
  });

  /** Medido y con la @ libre (una @ de otro no se puede usar). */
  protected readonly puedeElegirNombre = computed(() => {
    const m = this.nombreElegido()?.medida;
    return !!m && m.arroba_libre !== false;
  });

  private medidas = '';

  constructor() {
    // Lo que escribió la otra vez, para retocarlo.
    effect(() => {
      const i = this.datos()?.mercado?.intereses;
      if (i && !this.intereses) this.intereses = i;
    });
    effect(() => {
      const i = this.datos()?.conceptos?.indicaciones;
      if (i && !this.indicaciones) this.indicaciones = i;
    });
    // Los temas y los nombres sin medir se miden solos (una vez por conjunto de ids).
    effect(() => {
      const d = this.datos();
      const [paso, ids] = d?.mercado ? ['mercado', d.mercado.por_medir] : d?.nombres ? ['nombre', d.nombres.por_medir] : d?.ideas ? ['ideas', d.ideas.por_medir] : ['', []];
      if (!ids.length) return;
      const clave = `${paso}:${ids.join(',')}`;
      if (clave === this.medidas) return;
      this.medidas = clave;
      untracked(() => void firstValueFrom(this.http.post(`/api/asistente/canal/${paso}/medir`, {})).then(() => this.recurso.reload()));
    });
    // Mientras Claude trabaja, se mide o se hacen las imágenes de los estilos o las muestras de voz o de marca, el estado se vuelve a pedir cada 4 s.
    const id = setInterval(() => {
      const d = this.datos();
      const midiendo = [...(d?.mercado?.propuestas ?? []), ...(d?.nombres?.propuestas ?? [])].some((p) => p.midiendo || !p.medida)
        || (d?.ideas?.ideas ?? []).some((x) => x.midiendo || !x.medida);
      const pintando = d?.tarea?.estado === 'en_cola' || d?.tarea?.estado === 'en_curso';
      if (d && (d.trabajo.estado === 'pensando' || midiendo || pintando)) this.recurso.reload();
    }, 4000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  /** Vuelve a pedir el estado (p. ej., cuando Claude acaba un turno en el chat). */
  recargar(): void {
    this.recurso.reload();
  }

  protected nombre(s: Semaforo): string { return NOMBRE_SEMAFORO[s]; }
  protected nombreNombre(s: Semaforo): string { return NOMBRE_SEMAFORO_NOMBRE[s]; }
  protected icono(s: Semaforo): string { return ICONO_SEMAFORO[s]; }

  /** Las cifras de un tema en frases (sin jerga: «puerta de entrada», YPP…). */
  protected cifras(m: MedidaNicho): string[] {
    const c: string[] = [];
    if (m.demanda) c.push(`Público: ${NIVEL[m.demanda.nivel] ?? m.demanda.nivel} (un vídeo típico de estas búsquedas tiene ${miles(Math.round(m.demanda.mediana))} visitas)`);
    if (m.puerta) {
      const n = m.puerta.n_evidencias;
      c.push(`Canales pequeños que consiguen visitas: ${n === 0 ? 'ninguno a la vista' : n === 1 ? '1' : n}`);
    }
    if (m.concentracion) c.push(`Los 3 canales más fuertes se llevan el ${Math.round(m.concentracion.top3 * 100)} % de las visitas`);
    c.push(m.ingresos_mes
      ? `Ingresos de un canal mediano del tema: ${miles(m.ingresos_mes.bajo)}-${miles(m.ingresos_mes.alto)} $ al mes`
      : 'Ingresos: sin datos (YouTube no ha dado los últimos vídeos de los canales)');
    if (m.canales?.length) c.push(`Ya lo hacen: ${m.canales.slice(0, 3).map((x) => x.nombre).join(', ')}`);
    return c;
  }

  /** Encarga a Claude las propuestas del paso (otras distintas, si ya había y el usuario pidió «Proponer otros»). */
  protected async proponer(paso: Exclude<Paso, 'estilo'>): Promise<void> {
    this.avisos.pedirPermiso();          // trabajo largo en segundo plano: avisaremos al terminar
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const d = this.datos();
      const habia = { mercado: d?.mercado, concepto: d?.conceptos, nombre: d?.nombres }[paso]?.propuestas.length;
      const otros = this.otraVez() && !!habia;
      const cuerpo = paso === 'mercado' ? { intereses: this.intereses, otros } : { indicaciones: this.indicaciones, otros };
      await firstValueFrom(this.http.post(`/api/asistente/canal/${paso}/proponer`, cuerpo));
      this.otraVez.set(false);
      this.propia.set(null);
      this.recurso.reload();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async elegir(paso: Paso, propuesta: number | undefined): Promise<void> {
    if (propuesta === undefined) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/asistente/canal/${paso}/elegir`, { propuesta }));
      this.propia.set(null);
      this.indicaciones = '';
      const siguiente = SIGUIENTE[paso];
      if (siguiente) {
        // Sin esperar a que el usuario lo pida: si no se puede (Claude ocupado), se ve el formulario con su botón.
        await firstValueFrom(this.http.post(`/api/asistente/canal/${siguiente}/proponer`, { indicaciones: '', otros: false })).catch(() => undefined);
      }
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async anadirNombre(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const r = await firstValueFrom(this.http.post<{ id: number }>('/api/asistente/canal/nombre/anadir',
        { nombre: this.nombrePropio, arroba: this.arrobaPropia.trim() || null }));
      this.nombrePropio = '';
      this.arrobaPropia = '';
      this.otraVez.set(false);
      this.propia.set(r.id);
      this.recurso.reload();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
