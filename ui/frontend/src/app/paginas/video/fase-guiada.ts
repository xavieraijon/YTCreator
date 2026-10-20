import { DecimalPipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import { CuotasService } from '../../core/cuotas.service';
import { EventosService } from '../../core/eventos.service';
import { AsistenteEstado, DatosFaseB, MedidaPropuesta, PropuestaB, Semaforo, VideoDetalle } from '../../core/modelos';
import { FaseTramos } from './fase-tramos';
import { Tracker } from './tracker';
import { DiarioVideo } from './diario-video';
import { GastoVideo } from './gasto-video';
import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';
import { miles } from '../../core/formato';

const NOMBRE_SEMAFORO: Record<Semaforo, string> = { verde: 'Hay hueco', ambar: 'Con ángulo propio', rojo: 'Muy contado', gris: 'Sin datos' };
const ICONO_SEMAFORO: Record<Semaforo, string> = { verde: 'check_circle', ambar: 'error', rojo: 'cancel', gris: 'help' };

/** Fase A: ¿está todo listo? Cuatro luces (imágenes, voz gratis, voz de pago, herramientas) y un solo botón. */
@Component({
  selector: 'app-fase-a',
  imports: [MatButton, MatIcon],
  template: `
    <h1>Comprueba que todo está listo</h1>
    <p class="intro">Antes de empezar, miramos cuánto puedes producir hoy. Nada de esto cuesta dinero.</p>

    <div class="luces">
      @for (l of luces(); track l.id) {
        <div class="luz" [class]="'luz luz--' + l.color">
          <mat-icon>{{ l.icono }}</mat-icon>
          <div>
            <strong>{{ l.titulo }}</strong>
            <span class="valor">{{ l.valor }}</span>
            <span class="detalle">{{ l.detalle }}</span>
          </div>
        </div>
      }
    </div>

    @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }

    <div class="acciones">
      @if (revision()) {
        <button mat-flat-button type="button" (click)="kit.reload()"><mat-icon>refresh</mat-icon>Comprobar de nuevo</button>
      } @else if (listo()) {
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="continuar()">
          Continuar con el tema<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
      } @else {
        <button mat-flat-button type="button" (click)="kit.reload()"><mat-icon>refresh</mat-icon>Comprobar de nuevo</button>
      }
    </div>

    <details class="mas">
      <summary>Qué se ha comprobado</summary>
      <ul>
        @for (i of kit.value()?.kit?.items ?? []; track i.id) {
          <li [class.falta]="!i.ok && i.requerido">
            <mat-icon>{{ i.ok ? 'check_circle' : i.requerido ? 'error' : 'radio_button_unchecked' }}</mat-icon>
            <span>{{ i.texto }}@if (!i.requerido) { <em> (opcional)</em> }@if (!i.ok) { <small> · {{ i.ayuda }}</small> }</span>
          </li>
        }
      </ul>
    </details>
  `,
  styleUrl: './fase-guiada.scss',
})
export class FaseA {
  readonly video = input.required<VideoDetalle>();
  /** Se está mirando una fase ya hecha: no hay nada que continuar. */
  readonly revision = input(false);
  protected readonly cuotas = inject(CuotasService);
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  protected readonly kit = httpResource<AsistenteEstado>(() => { this.eventos.version(); return '/api/asistente'; });
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly listo = computed(() => this.kit.value()?.kit.listo ?? false);

  protected readonly luces = computed(() => {
    const d = this.cuotas.cuotas()?.datos;
    const luces: { id: string; titulo: string; valor: string; detalle: string; color: Semaforo; icono: string }[] = [];
    const icono = (c: Semaforo) => ICONO_SEMAFORO[c];
    if (d) {
      const n = Math.floor(d.cloudflare.libres / 110);
      const c: Semaforo = n >= 95 ? 'verde' : n >= 30 ? 'ambar' : 'rojo';
      luces.push({ id: 'img', titulo: 'Imágenes gratis', valor: `≈ ${n} hoy`, color: c, icono: icono(c),
        detalle: n >= 95 ? 'Alcanza para un vídeo de 10 minutos.' : 'Lo que falte se hará otro día o en tu Mac (más lento).' });
      const v: Semaforo = d.azure.libres >= 12000 ? 'verde' : 'ambar';
      luces.push({ id: 'voz', titulo: 'Voz gratis', valor: `${miles(d.azure.libres)} caracteres`, color: v, icono: icono(v),
        detalle: 'Un vídeo de 10 minutos gasta unos 10.000.' });
      const s = d.ai33.saldo;
      const p: Semaforo = s === null ? 'gris' : s >= 15000 ? 'verde' : 'ambar';
      luces.push({ id: 'pago', titulo: 'Voz de pago (opcional)', valor: s === null ? 'Sin datos' : `${miles(s)} créditos`,
        color: p, icono: icono(p), detalle: 'Solo se gasta si lo eliges, y siempre se confirma antes.' });
    } else {
      luces.push({ id: 'cuotas', titulo: 'Cuotas', valor: 'Consultando…', detalle: 'Mirando cuánto queda de cada servicio.', color: 'gris', icono: icono('gris') });
    }
    const k = this.kit.value()?.kit;
    const falta = k?.items.filter((i) => i.requerido && !i.ok) ?? [];
    const c: Semaforo = !k ? 'gris' : falta.length ? 'rojo' : 'verde';
    luces.push({ id: 'kit', titulo: 'Herramientas', valor: !k ? 'Comprobando…' : falta.length ? `Falta: ${falta.map((f) => f.texto).join(', ')}` : 'Todo instalado',
      color: c, icono: icono(c), detalle: falta[0]?.ayuda ?? 'yt-dlp, ffmpeg, Claude y las claves necesarias.' });
    return luces;
  });


  protected async continuar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.video().id}/fase-a/continuar`, {}));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}

/** Elegir el enfoque (fase B de un vídeo largo, con la duración; fase A de un Short, sin ella). Claude propone en segundo
 * plano; la herramienta mide; tú haces clic. */
@Component({
  selector: 'app-fase-b',
  imports: [DecimalPipe, MatButton, MatIcon, MatProgressBar, RouterLink],
  template: `
    @if (!revision() && faltaKit().length) {
      <!-- La antigua fase A: solo aparece si algo falla (hallazgo 13 del recorrido profano). -->
      <div class="desactualizada" role="alert">
        <mat-icon>build</mat-icon>
        <div>
          <strong>Antes de producir falta preparar algo:</strong>
          <ul>@for (i of faltaKit(); track i.id) { <li>{{ i.texto }}<br /><small>{{ i.ayuda }}</small></li> }</ul>
        </div>
        <a mat-flat-button routerLink="/ajustes">Ir a Ajustes</a>
      </div>
    }
    @if (datos(); as d) {
      @if (revision()) {
        <h1>Enfoque elegido</h1>
        <div class="tema tarjeta"><span class="antetitulo">Tu idea</span><p class="tema__texto">{{ mayuscula(d.tema) }}</p></div>
        @if (d.propuestas.length) {
          <div class="opciones">
            @for (p of d.propuestas; track p.id) {
              <div class="opcion" [class.opcion--elegida]="d.elegido?.propuesta === p.id">
                <mat-icon class="opcion__radio">{{ d.elegido?.propuesta === p.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
                <span class="opcion__cuerpo">
                  <span class="opcion__titulo">{{ p.titulo }}@if (d.elegido?.propuesta === p.id) { <span class="chip chip--rec">Elegido@if (d.elegido?.minutos) { · {{ d.elegido?.minutos }} min }</span> }</span>
                  <span class="opcion__texto">{{ p.enfoque }}</span>
                  @if (p.medida; as m) { <span [class]="'semaforo semaforo--' + m.semaforo"><mat-icon>{{ icono(m.semaforo) }}</mat-icon><strong>{{ nombre(m.semaforo) }}</strong><span>{{ m.motivo }}</span></span> }
                </span>
              </div>
            }
          </div>
        } @else {
          <p class="intro">Este enfoque se eligió antes de existir esta pantalla (por ejemplo, en el chat). Está en «Archivos y notas del vídeo», en el menú ⋮ de arriba.</p>
        }
      } @else if (!d.propuestas.length) {
        <h1>{{ short() ? 'Elige de qué trata el Short' : 'Elige de qué trata el vídeo' }}</h1>
        @if (d.trabajo.estado === 'pensando') {
          <div class="trabajando tarjeta">
            <mat-progress-bar mode="indeterminate" />
            <p><strong>Claude está buscando enfoques</strong></p>
            <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo el canal y sus ideas…' }}</p>
            <p class="secundario">Suele tardar unos 3 minutos. Puedes seguir con otra cosa: te avisamos al terminar.</p>
            <button mat-button type="button" (click)="parar(d.trabajo.conversacion)">Parar</button>
          </div>
        } @else {
          <div class="tema tarjeta">
            <span class="antetitulo">Tu idea</span>
            <p class="tema__texto">{{ mayuscula(d.tema) || 'Sin tema todavía' }}</p>
            @if (short()) {
              <p class="secundario"><mat-icon>movie</mat-icon>{{ d.apoya ? 'Lleva al vídeo largo ' + d.apoya + ': el dato saldrá de lo ya verificado en él.' : 'Sin vídeo largo detrás: conviene que un Short lleve a uno.' }}</p>
            }
            @if (d.referencia) { <p class="secundario"><mat-icon>link</mat-icon>Con un vídeo de referencia que se analizará.</p> }
          </div>
          <p class="intro">
            Claude buscará 3 enfoques{{ short() ? ', cada uno con su frase de arranque,' : '' }} para esta idea y se medirá cuánto se ha contado ya cada uno en YouTube, para que
            elijas con datos.
          </p>
          @if (d.error || fallo()) { <p class="error"><mat-icon>warning</mat-icon>{{ d.error ?? fallo() }}</p> }
          <div class="acciones">
            <button mat-flat-button type="button" [disabled]="lanzando()" (click)="proponer(false)">
              <mat-icon>{{ lanzando() ? 'sync' : 'travel_explore' }}</mat-icon>{{ lanzando() ? 'Enviando…' : 'Buscar enfoques' }}
            </button>
            <span class="secundario"><mat-icon>schedule</mat-icon>Unos 3 minutos</span>
          </div>
        }
      } @else {
        <h1>Elige un enfoque</h1>
        <p class="intro">
          Para «{{ mayuscula(d.tema) }}». El semáforo dice cuánto se ha contado ya en YouTube: verde, hay hueco; ámbar, hace falta un
          ángulo propio; rojo, está muy visto.
        </p>
        <div class="opciones">
          @for (p of d.propuestas; track p.id) {
            <button type="button" class="opcion" [class.opcion--elegida]="elegida()?.id === p.id" (click)="elegirPropuesta(p.id)">
              <mat-icon class="opcion__radio">{{ elegida()?.id === p.id ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
              <span class="opcion__cuerpo">
                <span class="opcion__titulo">
                  {{ p.titulo }}
                  @if (p.recomendada) { <span class="chip chip--rec">Recomendado</span> }
                </span>
                <span class="opcion__texto">{{ p.enfoque }}</span>
                @if (short() && p.gancho) { <span class="opcion__texto">Arranca con: «{{ p.gancho }}»</span> }
                <span class="opcion__porque">{{ p.porque }}</span>
                @if (p.medida; as m) {
                  <span [class]="'semaforo semaforo--' + m.semaforo">
                    <mat-icon>{{ icono(m.semaforo) }}</mat-icon>
                    <strong>{{ nombre(m.semaforo) }}</strong>
                    <span>{{ m.motivo }}</span>
                  </span>
                  <span class="cifras">
                    {{ m.clones === 1 ? '1 vídeo parecido' : m.clones + ' vídeos parecidos' }} · {{ m.recientes }} de los últimos 3 meses · {{ publico(m.demanda) }}@if (m.perennes) { · {{ m.perennes === 1 ? '1 sigue viéndose' : m.perennes + ' siguen viéndose' }} años después }
                  </span>
                } @else {
                  <span class="semaforo semaforo--midiendo"><mat-icon class="girando">sync</mat-icon>Midiendo cuánto se ha contado…</span>
                }
              </span>
            </button>
          }
        </div>

        @if (!short()) {
        <h2>Duración</h2>
        <div class="duraciones">
          @for (x of d.duraciones; track x.minutos) {
            <button type="button" class="duracion" [class.duracion--elegida]="minutos() === x.minutos" (click)="minutos.set(x.minutos)">
              <strong>{{ x.minutos }} min</strong>
              @if (x.recomendada) { <span class="chip chip--rec">Recomendada</span> }
              <span>{{ x.palabras | number }} palabras · {{ x.imagenes }} imágenes</span>
              <span>{{ x.dias_imagenes === 1 ? '1 día' : x.dias_imagenes + ' días' }} de cuota de imágenes</span>
              <span>Voz de pago ≈ {{ x.creditos_voz | number }} créditos ({{ euros(x.creditos_voz) }})</span>
            </button>
          }
        </div>
        }

        @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
        @if (elegida()?.medida?.semaforo === 'rojo') {
          <p class="aviso"><mat-icon>info</mat-icon>Este enfoque está muy contado. Solo merece la pena si tienes un ángulo propio.</p>
        }
        <div class="acciones">
          <button mat-flat-button type="button" [disabled]="!puedeElegir() || ocupado()" (click)="elegir()">
            {{ elegida()?.medida || !elegida() ? (short() ? 'Elegir y escribir el guion' : 'Elegir y empezar la investigación') : 'Esperando la medición…' }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
          </button>
          <button mat-stroked-button type="button" [disabled]="lanzando() || d.trabajo.estado === 'pensando'" (click)="proponer(true)">
            <mat-icon>autorenew</mat-icon>Buscar otros enfoques
          </button>
          @if (d.trabajo.estado === 'pensando') { <span class="secundario"><mat-icon class="girando">sync</mat-icon>Claude busca otros…</span> }
        </div>
      }
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }

    <details class="mas">
      <summary>Cómo se ha medido</summary>
      <p>
        Para cada enfoque se buscan en YouTube los vídeos que cuentan casi lo mismo. Pocos y poco vistos = hueco. Muchos y
        recientes = ya se está llenando. Si el tema general tiene público, el hueco vale la pena. La medida sale de una
        herramienta, no de Claude, y es orientativa: no sustituye a tu criterio.
      </p>
      <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Preguntar algo a Claude</button>
    </details>
  `,
  styleUrl: './fase-guiada.scss',
})
export class FaseB {
  readonly video = input.required<VideoDetalle>();
  private readonly avisos = inject(AvisosService);
  readonly revision = input(false);
  readonly hablar = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly cuotas = inject(CuotasService);
  /** La comprobación del kit (lo que hacía la fase A): solo se enseña lo necesario que falta. */
  private readonly kit = httpResource<AsistenteEstado>(() => { this.eventos.version(); return '/api/asistente'; });
  protected readonly faltaKit = computed(() => (this.kit.value()?.kit.items ?? []).filter((i) => i.requerido && !i.ok));

  private readonly recurso = httpResource<DatosFaseB>(() => {
    this.eventos.version();
    return `/api/videos/${this.video().id}/fase-b`;
  });
  protected readonly datos = computed(() => (this.recurso.hasValue() ? this.recurso.value() : undefined));
  protected readonly short = computed(() => this.video().tipo === 'short');

  protected readonly lanzando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly fallo = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly propia = signal<number | null>(null);
  protected readonly minutos = signal(10);

  protected readonly elegida = computed<PropuestaB | undefined>(() => {
    const ps = this.datos()?.propuestas ?? [];
    return ps.find((p) => p.id === this.propia()) ?? ps.find((p) => p.recomendada) ?? ps[0];
  });
  protected readonly puedeElegir = computed(() => !!this.elegida() && !!this.elegida()!.medida);

  private medidas = '';

  constructor() {
    // Las propuestas sin medir se miden solas (una vez por conjunto de ids).
    effect(() => {
      const d = this.datos();
      if (!d?.por_medir.length) return;
      const clave = `${this.video().id}:${d.por_medir.join(',')}`;
      if (clave === this.medidas) return;
      this.medidas = clave;
      untracked(() => void firstValueFrom(this.http.post(`/api/videos/${this.video().id}/fase-b/medir`, {})).then(() => this.recurso.reload()));
    });
    // Mientras Claude trabaja o se mide, el estado se vuelve a pedir cada 4 s (los avisos de archivos no siempre llegan).
    const id = setInterval(() => {
      const d = this.datos();
      if (d && (d.trabajo.estado === 'pensando' || d.propuestas.some((p) => p.midiendo || !p.medida))) this.recurso.reload();
    }, 4000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected nombre(s: Semaforo): string { return NOMBRE_SEMAFORO[s]; }
  protected publico(d: MedidaPropuesta['demanda']): string {
    return { alta: 'el tema tiene mucho público', media: 'el tema tiene algo de público', baja: 'el tema tiene poco público' }[d];
  }
  /** La idea tal como la escribió el usuario, con mayúscula inicial (hallazgo 53). */
  protected mayuscula(t: string | null): string { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
  protected icono(s: Semaforo): string { return ICONO_SEMAFORO[s]; }
  protected euros(creditos: number): string {
    const porMillon = this.cuotas.cuotas()?.datos?.ai33.euros_por_millon ?? 4.55;
    return `≈ ${((creditos * porMillon) / 1_000_000).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }
  protected elegirPropuesta(id: number): void { this.propia.set(id); }

  protected async proponer(otros: boolean): Promise<void> {
    this.avisos.pedirPermiso();          // trabajo largo en segundo plano: avisaremos al terminar
    this.lanzando.set(true);
    this.fallo.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.video().id}/fase-b/proponer`, { otros }));
      this.recurso.reload();
    } catch (e) {
      this.fallo.set(mensajeError(e));
    } finally {
      this.lanzando.set(false);
    }
  }

  protected async parar(conversacion: number | null): Promise<void> {
    if (conversacion) await firstValueFrom(this.http.post(`/api/claude/${conversacion}/parar`, {}));
  }

  protected async elegir(): Promise<void> {
    const p = this.elegida();
    if (!p) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.video().id}/fase-b/elegir`, { propuesta: p.id, minutos: this.short() ? null : this.minutos() }));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}

/** Las fases guiadas: el camino clicable arriba y, debajo, la fase que se mira (la actual o una ya hecha). */
@Component({
  selector: 'app-fase-guiada',
  imports: [FaseA, FaseB, FaseTramos, Tracker, DiarioVideo, GastoVideo, MatButton, MatIcon],
  template: `
    <div class="marco-fases">
    <aside class="carril">
      <p class="carril__titulo">{{ video().titulo || video().carpeta }}</p>
      <app-tracker [fases]="video().fases" [vista]="letra()" (elegir)="elegir($event)" />
      <app-gasto-video [videoId]="video().id" />
    </aside>
    <div class="marco-fases__contenido">
    <app-diario-video [videoId]="video().id" />
    @for (f of desactualizadas(); track f.letra) {
      <div class="desactualizada" role="status">
        <mat-icon>sync_problem</mat-icon>
        <div>
          @if (f.letra === letra()) {
            <strong>Esta fase ya estaba hecha, pero ha cambiado algo de antes: hay que ponerla al día.</strong>
          } @else {
            <strong>{{ f.nombre }} ya no está al día.</strong>
          }
          <ul>@for (a of f.avisos ?? []; track a) { <li>{{ a }}</li> }</ul>
        </div>
        @if (f.letra !== letra()) {
          <button mat-flat-button type="button" (click)="elegir(f.letra)">Ir a {{ f.nombre }}</button>
        }
      </div>
    }
    @if (revision()) {
      <div class="revision">
        <mat-icon>history</mat-icon>
        <span>Estás mirando <strong>{{ nombre() }}</strong>, que ya hiciste. No se pierde nada: el vídeo sigue en
          {{ nombreActual() }}.</span>
        <button mat-flat-button type="button" (click)="elegida.set(null)">Volver a {{ nombreActual() }}</button>
      </div>
    }
    @switch (letra()) {
      @case ('cerrado') {
        <h1>{{ video().tipo === 'short' ? 'Short terminado' : 'Vídeo terminado' }}</h1>
        <p class="intro">Todas las fases están hechas. Pulsa una fase de arriba para repasarla o pedir cambios.</p>
      }
      @case (enfoque()) { <app-fase-b [video]="video()" [revision]="revision()" (hablar)="hablar.emit()" /> }
      @case ('A') { <app-fase-a [video]="video()" [revision]="revision()" /> }
      @default { <app-fase-tramos [video]="video()" [letra]="letra()" [revision]="revision()" (hablar)="hablar.emit()" /> }
    }
    </div>
    </div>
  `,
  styleUrl: './fase-guiada.scss',
  styles: `
    /* El carril va a la izquierda solo si cabe junto a la fase: depende del espacio que deja el panel de Claude, no de la
       ventana (hallazgo 39 del recorrido profano). 58rem = carril 15,5 + hueco 2 + fase de ~40 (a 1280 px sin panel, cabe). */
    :host { display: block; max-width: none; container-type: inline-size; }
    .marco-fases { display: block; }
    .carril__titulo { display: none; }
    @container (min-width: 58rem) {
      .marco-fases { display: grid; grid-template-columns: 15.5rem minmax(0, 1fr); gap: 2rem; align-items: start; }
      .carril { position: sticky; top: calc(var(--ay-alto-cabecera) + 1rem); }
      .carril__titulo { display: block; margin: 0 0 0.75rem; padding: 0 0.6rem; font-size: 0.78rem; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ay-tenue); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
  `,
})
export class FaseGuiada {
  readonly video = input.required<VideoDetalle>();
  readonly hablar = output<void>();
  /** La fase elegida en el camino; null = la que toca (la primera desactualizada o, si no hay, la actual). */
  protected readonly elegida = signal<string | null>(null);
  protected readonly toca = computed(() => this.video().estado_real?.vista ?? this.video().fase ?? 'A');
  /** Fase en la que se elige el enfoque: la B de un vídeo largo, la A de un Short. */
  protected readonly enfoque = computed(() => (this.video().tipo === 'short' ? 'A' : 'B'));
  protected readonly letra = computed(() => this.elegida() ?? this.toca());
  /** Mirando una fase ya hecha (y al día): modo revisión. Una desactualizada se trabaja, no se repasa. */
  protected readonly revision = computed(
    () => this.letra() !== this.toca() && this.video().fases.find((f) => f.letra === this.letra())?.estado === 'hecha',
  );
  protected readonly desactualizadas = computed(() => this.video().fases.filter((f) => f.estado === 'desactualizada'));
  protected readonly nombre = computed(() => this.video().fases.find((f) => f.letra === this.letra())?.nombre ?? '');
  protected readonly nombreActual = computed(() => this.video().fases.find((f) => f.letra === this.toca())?.nombre ?? 'la última fase');

  constructor() {
    effect(() => {                                    // otro vídeo, o el vídeo avanzó de fase: se vuelve a la actual
      this.video().id;
      this.toca();
      untracked(() => this.elegida.set(null));
    });
  }

  protected elegir(letra: string): void {
    this.elegida.set(letra === this.toca() ? null : letra);
  }
}
