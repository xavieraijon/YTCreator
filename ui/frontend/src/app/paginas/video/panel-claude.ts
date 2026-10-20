import { ConfirmarService } from '../../compartido/confirmar';
import { HttpClient } from '@angular/common/http';
import {
  Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';

import { firstValueFrom } from 'rxjs';

import { Markdown } from '../../compartido/markdown';
import { Opcion, separarOpciones } from '../../compartido/opciones';
import { EventosService } from '../../core/eventos.service';
import { Chat, Conversacion, EntradaChat, VideoDetalle } from '../../core/modelos';
import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';

/** Un bloque del chat: un mensaje suelto o un grupo de herramientas seguidas (se pliega). */
type Bloque =
  | { tipo: 'entrada'; entrada: EntradaChat; clave: string }
  | { tipo: 'herramientas'; herramientas: EntradaChat[]; clave: string };

const ICONOS: Record<string, string> = {
  Read: 'description', Write: 'edit_document', Edit: 'edit', Glob: 'folder_open', Grep: 'search',
  Bash: 'terminal', Task: 'group', Agent: 'group', WebSearch: 'travel_explore', WebFetch: 'public',
  Skill: 'extension', TodoWrite: 'checklist',
};

/**
 * Claude dentro de la UI: el chat del vídeo, en un panel lateral. Cada mensaje lanza `claude -p` en el backend
 * (con la suscripción, desde la raíz del kit y con permisos limitados: nada que gaste créditos) y la respuesta
 * llega por SSE mientras se escribe. La conversación continúa la misma sesión hasta que se empieza otra.
 */
@Component({
  selector: 'app-panel-claude',
  imports: [MatProgressBar, MatButton, MatIconButton, MatIcon, MatTooltip, Markdown],
  template: `
    <header class="cabecera">
      <div class="cabecera__titulo">
        <mat-icon>auto_awesome</mat-icon>
        <div>
          <strong>Claude</strong>
          <span class="cabecera__estado" [class]="'cabecera__estado estado--' + estado()">{{ textoEstado() }}</span>
        </div>
      </div>
      <button aria-label="Empezar una conversación nueva (Claude olvida esta)" mat-icon-button type="button" matTooltip="Empezar una conversación nueva (Claude olvida esta)"
              [disabled]="estado() === 'pensando' || !conversacion()" (click)="nuevaConversacion()">
        <mat-icon>add_comment</mat-icon>
      </button>
      <button aria-label="Cerrar el panel (Claude sigue trabajando)" mat-icon-button type="button" matTooltip="Cerrar el panel (Claude sigue trabajando)" (click)="cerrar.emit()">
        <mat-icon>close</mat-icon>
      </button>
    </header>

    <div class="mensajes" #mensajes>
      @if (!entradas().length && estado() !== 'pensando') {
        <div class="vacio">
          @if (video(); as v) {
            <p>
              Pregúntale lo que quieras sobre <strong>«{{ v.titulo || v.carpeta }}»</strong> o pídele cambios en la
              investigación, el guion o los textos. <strong>No gasta dinero</strong>: la voz, las imágenes y el montaje
              los lanzas tú con su botón, que te dice antes lo que cuestan.
            </p>
          } @else {
            <p>
              Claude te lleva paso a paso por la <strong>creación del canal</strong>: mercado, concepto, nombre,
              estilo, voz, marca y equipo, con muestras reales y tu visto bueno en cada fase. <strong>No puede
              gastar créditos</strong>: lo que cueste dinero te lo indicará para que lo hagas tú.
            </p>
          }
          <p class="secundario">Usa tu suscripción de Claude (el mismo límite de uso que Claude Code).</p>
        </div>
      }
      @for (b of bloques(); track b.clave) {
        @if (b.tipo === 'herramientas') {
          <div class="herramientas">
            <!-- Plegado por defecto (hallazgo 30): lo que hace Claude por dentro es detalle, no conversación. -->
            <button type="button" class="herramientas__resumen" (click)="alternar(b.clave)" [attr.aria-expanded]="abiertos().has(b.clave)">
              <mat-icon>{{ abiertos().has(b.clave) ? 'expand_less' : 'expand_more' }}</mat-icon>{{ resumenPasos(b) }}
            </button>
            @for (h of plegar(b); track $index) {
              <div class="herramienta" [class.herramienta--sub]="h.sub" [class.herramienta--fallo]="h.t === 'fallo'"
                   [matTooltip]="h.t === 'fallo' ? (h.texto ?? '') : ''">
                <mat-icon>{{ h.t === 'fallo' ? 'block' : icono(h.nombre) }}</mat-icon>
                <span>{{ h.t === 'fallo' ? resumirFallo(h.texto) : h.resumen }}</span>
              </div>
            }
          </div>
        } @else {
          @switch (b.entrada.t) {
            @case ('usuario') {
              @if (encargo(b.entrada.texto); as e) {
                <!-- Encargo que manda la pantalla (no lo escribió el usuario): plegado, con el detalle a mano. -->
                <details class="encargo">
                  <summary><mat-icon>bolt</mat-icon>Le has pedido desde la pantalla: {{ e }}</summary>
                  <pre>{{ b.entrada.texto }}</pre>
                </details>
              } @else {
                <div class="burbuja burbuja--usuario">{{ dicho(b.entrada.texto) }}</div>
              }
            }
            @case ('texto') {
              <div class="burbuja burbuja--claude"><app-markdown [texto]="sinOpciones(b.entrada.texto)" /></div>
            }
            @case ('aviso') {
              <div class="nota nota--aviso" [matTooltip]="b.entrada.detalle ?? ''"><mat-icon>info</mat-icon><span>{{ b.entrada.texto }}</span></div>
            }
            @case ('error') {
              <div class="nota nota--error"><mat-icon>error</mat-icon><span>{{ b.entrada.texto }}</span></div>
            }
            @case ('fin') {
              <div class="fin">Terminado en {{ duracion(b.entrada.segundos) }}</div>
            }
          }
        }
      }
      @if (opciones().length) {
        <!-- Las opciones de la última pregunta de Claude: responder es un clic (regla en chat.REGLAS_RESPUESTA). -->
        <div class="opciones" role="group" aria-label="Respuestas propuestas">
          @for (o of opciones(); track o.texto) {
            <button type="button" class="opcion" [class.opcion--recomendada]="o.recomendada" [disabled]="enviando()"
                    (click)="enviar(o.texto)">
              @if (o.recomendada) { <mat-icon>star</mat-icon> }{{ o.texto }}
            </button>
          }
          <button type="button" class="opcion opcion--otra" (click)="caja.focus()">
            <mat-icon>edit</mat-icon>Otra cosa…
          </button>
        </div>
      }
      @if (estado() === 'pensando') {
        @if (parcial()) {
          <div class="burbuja burbuja--claude burbuja--escribiendo"><app-markdown [texto]="sinOpciones(parcial())" /></div>
        }
        <div class="pensando">
          <mat-progress-bar mode="indeterminate" />
          <div class="pensando__texto">
            <span class="puntos"><i></i><i></i><i></i></span>
            <span class="pensando__accion">{{ accionActual() }}</span>
            <span class="pensando__tiempo">{{ transcurrido() }}</span>
          </div>
        </div>
      }
    </div>

    @if (error(); as e) {
      <p class="nota nota--error pie-error"><mat-icon>warning</mat-icon><span>{{ e }}</span></p>
    }

    <div class="atajos">
      @for (a of atajos(); track a.texto) {
        <button type="button" class="atajo" [disabled]="estado() === 'pensando' || enviando()" (click)="enviar(a.mensaje)">
          {{ a.texto }}
        </button>
      }
    </div>

    <form class="entrada" (submit)="$event.preventDefault(); enviar()">
      <textarea #caja rows="2" placeholder="Escribe a Claude… (Intro envía, Mayús+Intro salta de línea)"
                [value]="borrador()" (input)="borrador.set(caja.value)" (keydown)="tecla($event)"
                [disabled]="enviando()"></textarea>
      @if (estado() === 'pensando') {
        <button mat-stroked-button type="button" class="parar" (click)="parar()"><mat-icon>stop</mat-icon>Parar</button>
      } @else {
        <button mat-flat-button type="submit" [disabled]="!borrador().trim() || enviando()"><mat-icon>send</mat-icon>Enviar</button>
      }
    </form>
  `,
  styleUrl: './panel-claude.scss',
})
export class PanelClaude {
  /** El vídeo del chat; sin él, es el chat del asistente (crear el canal). */
  readonly video = input<VideoDetalle>();
  /** Asistente: hay un canal a medio crear (solo entonces tiene sentido «Seguir con el canal»). */
  readonly canalAMedias = input(false);
  private readonly avisos = inject(AvisosService);
  readonly cerrar = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly confirmar = inject(ConfirmarService);
  private readonly lista = viewChild<ElementRef<HTMLElement>>('mensajes');

  protected readonly conversacion = signal<Conversacion | null>(null);
  protected readonly entradas = signal<EntradaChat[]>([]);
  protected readonly parcial = signal('');
  protected readonly borrador = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly abiertos = signal(new Set<string>());

  readonly estado = computed(() => this.conversacion()?.estado ?? 'libre');
  protected readonly textoEstado = computed(() =>
    ({ libre: 'Listo', pensando: 'Trabajando…', error: 'El último turno falló' })[this.estado()],
  );

  /** 0 = el asistente (sin vídeo). */
  private readonly clave = computed(() => this.video()?.id ?? 0);
  private readonly ruta = computed(() => (this.video() ? `/api/videos/${this.clave()}/claude` : '/api/asistente/claude'));

  protected readonly atajos = computed(() => {
    const v = this.video();
    if (!v) {
      return [
        ...(this.canalAMedias()
          ? [{ texto: 'Seguir creando el canal', mensaje: '/nuevo-canal continuar' }]
          : [{ texto: 'Crear un canal nuevo', mensaje: '/nuevo-canal' }]),
        { texto: '¿En qué punto estamos?', mensaje: '¿En qué fase está la creación del canal y qué es lo siguiente? Resúmelo en pocas líneas.' },
      ];
    }
    const comando = v.tipo === 'short' ? '/nuevo-short continuar' : '/nuevo-video continuar';
    return [
      { texto: 'Seguir con la producción', mensaje: `${comando} ${v.carpeta}` },
      { texto: '¿En qué punto estamos?', mensaje: '¿En qué punto está este vídeo y qué es lo siguiente? Resúmelo en pocas líneas.' },
    ];
  });

  /** Las herramientas seguidas se agrupan en un bloque (los fallos van dentro, junto a la herramienta). */
  protected readonly bloques = computed<Bloque[]>(() => {
    const bloques: Bloque[] = [];
    this.entradas().forEach((e, i) => {
      if (e.t === 'herramienta' || e.t === 'fallo') {
        const ultimo = bloques.at(-1);
        if (ultimo?.tipo === 'herramientas') ultimo.herramientas.push(e);
        else bloques.push({ tipo: 'herramientas', herramientas: [e], clave: 'h' + i });
      } else {
        bloques.push({ tipo: 'entrada', entrada: e, clave: 'e' + i });
      }
    });
    return bloques;
  });

  /** Las opciones de la última respuesta, solo si el turno ha terminado y el usuario aún no ha contestado. */
  protected readonly opciones = computed<Opcion[]>(() => {
    if (this.estado() === 'pensando') return [];
    const es = this.entradas();
    for (let i = es.length - 1; i >= 0 && es[i].t !== 'usuario'; i--) {
      if (es[i].t === 'texto') return separarOpciones(es[i].texto ?? '').opciones;
    }
    return [];
  });

  protected sinOpciones(texto?: string): string {
    return separarOpciones(texto ?? '').texto;
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.reloj));
    // Cargar la conversación del vídeo (y otra vez si se cambia de vídeo).
    effect(() => {
      this.clave();
      untracked(() => this.cargar());
    });
    const destruir = inject(DestroyRef);
    this.eventos.reconectado$.pipe(takeUntilDestroyed(destruir)).subscribe(() => this.cargar());
    this.eventos.claude$.pipe(takeUntilDestroyed(destruir)).subscribe((ev) => {
      const c = this.conversacion();
      if (ev.evento === 'estado' && (ev.video_id ?? 0) === this.clave()) {
        if (!c || c.id !== ev.conversacion) {
          this.cargar();
          return;
        }
        this.conversacion.set({ ...c, estado: ev.estado ?? c.estado });
        if (ev.estado !== 'pensando') this.parcial.set('');
        return;
      }
      if (!c || c.id !== ev.conversacion) return;
      if (ev.evento === 'delta') {
        this.parcial.update((p) => p + (ev.texto ?? ''));
        this.bajar();
      } else if (ev.evento === 'entrada' && ev.entrada) {
        const entrada = ev.entrada;
        if (entrada.t === 'texto') this.parcial.set('');
        // El mensaje del usuario ya se pintó al enviarlo: no duplicarlo.
        this.entradas.update((es) => {
          const ultima = es.at(-1);
          if (entrada.t === 'usuario' && ultima?.t === 'usuario' && ultima.texto === entrada.texto) return es;
          return [...es, entrada];
        });
        this.bajar();
      }
    });
  }

  /** Enviar un mensaje (desde la caja, un atajo o la guía del vídeo). */
  async enviar(texto?: string, nueva = false): Promise<void> {
    this.avisos.pedirPermiso();          // trabajo largo en segundo plano: avisaremos al terminar
    const mensaje = (texto ?? this.borrador()).trim();
    if (!mensaje || this.enviando() || this.estado() === 'pensando') return;
    this.enviando.set(true);
    this.error.set(null);
    try {
      const crear = nueva || this.nuevaPendiente;
      const c = await firstValueFrom(
        this.http.post<Conversacion>(this.ruta(), { mensaje, nueva: crear }),
      );
      this.nuevaPendiente = false;
      if (crear || c.id !== this.conversacion()?.id) this.entradas.set([]);
      this.conversacion.set({ ...c, estado: 'pensando' });
      this.entradas.update((es) => [...es, { t: 'usuario', texto: mensaje, fecha: new Date().toISOString() }]);
      if (texto === undefined) this.borrador.set('');
      this.bajar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  protected async parar(): Promise<void> {
    const c = this.conversacion();
    if (!c) return;
    try {
      await firstValueFrom(this.http.post(`/api/claude/${c.id}/parar`, {}));
    } catch (e) {
      this.error.set(mensajeError(e));
    }
  }

  /** Reloj del indicador «trabajando» (un texto con tiempo no tiene porcentaje: Claude no sabe cuánto le queda). */
  private readonly ahora = signal(Date.now());
  private readonly reloj = setInterval(() => {
    if (this.estado() === 'pensando') this.ahora.set(Date.now());
  }, 1000);

  /** Lo que está haciendo Claude ahora: la última herramienta del turno, o escribir la respuesta. */
  protected readonly accionActual = computed(() => {
    if (this.parcial()) return 'Escribiendo la respuesta…';
    const turno = this.entradas();
    for (let i = turno.length - 1; i >= 0 && turno[i].t !== 'usuario'; i--) {
      const e = turno[i];
      if (e.t === 'herramienta') return (e.resumen || e.nombre || 'Trabajando') + '…';
    }
    return 'Pensando…';
  });

  protected readonly transcurrido = computed(() => {
    const turno = this.entradas();
    const pregunta = [...turno].reverse().find((e) => e.t === 'usuario');
    if (!pregunta) return '';
    const s = Math.max(0, Math.round((this.ahora() - Date.parse(pregunta.fecha)) / 1000));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
  });

  protected async nuevaConversacion(): Promise<void> {
    const ok = await this.confirmar.pedir({
      titulo: 'Empezar una conversación nueva',
      mensaje: 'Claude no recordará esta conversación. Los archivos del vídeo no cambian.',
      aceptar: 'Empezar de nuevo', icono: 'chat',
    });
    if (!ok) return;
    this.conversacion.set(null);
    this.entradas.set([]);
    this.parcial.set('');
    this.nuevaPendiente = true;
  }

  /** Tras «nueva conversación», el siguiente mensaje la crea. */
  private nuevaPendiente = false;

  protected tecla(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void this.enviar();
    }
  }

  /** Desplegado: todos los pasos. Plegado: ninguno, salvo el último mientras Claude sigue trabajando (lo que hace ahora). */
  protected plegar(b: Extract<Bloque, { tipo: 'herramientas' }>): EntradaChat[] {
    if (this.abiertos().has(b.clave)) return b.herramientas;
    return this.trabajandoEn(b) ? b.herramientas.slice(-1) : [];
  }

  private trabajandoEn(b: Bloque): boolean {
    return this.bloques().at(-1) === b && this.estado() === 'pensando';
  }

  protected resumenPasos(b: Extract<Bloque, { tipo: 'herramientas' }>): string {
    const n = b.herramientas.length;
    const fallos = b.herramientas.filter((h) => h.t === 'fallo').length;
    const pasos = `${n} ${n === 1 ? 'paso' : 'pasos'}`;
    const texto = this.trabajandoEn(b) ? `Trabajando: ${pasos} hasta ahora` : `Ha hecho ${pasos}`;
    return texto + (fallos ? ` (${fallos} no ${fallos === 1 ? 'salió' : 'salieron'})` : '') +
      (this.abiertos().has(b.clave) ? '' : ' · ver lo que ha hecho');
  }

  /** Las órdenes de los atajos (llegan a Claude tal cual, con su procedimiento) dichas como las diría el usuario (hallazgo 47). */
  protected dicho(texto?: string): string {
    const t = (texto ?? '').trim();
    if (t === '/nuevo-canal') return 'Quiero crear un canal nuevo.';
    if (t.startsWith('/nuevo-canal')) return 'Sigue con la creación del canal.';
    if (/^\/nuevo-(video|short) continuar/.test(t)) return 'Sigue con la producción.';
    return t;
  }

  /** Si el mensaje es un encargo automático de una pantalla guiada («MODO UI · fase B, paso «proponer»…»), su nombre. */
  protected encargo(texto?: string): string | null {
    if (!texto?.startsWith('MODO UI')) return null;
    const nombre = /«([^»]+)»/.exec(texto)?.[1];
    const dicho = nombre === 'proponer' ? 'buscar enfoques' : nombre;     // el paso de la fase del tema (hallazgo 54)
    return dicho ? dicho.charAt(0).toUpperCase() + dicho.slice(1) : 'un trabajo en segundo plano';
  }

  /** Un fallo de una herramienta, dicho en castellano y sin la traza (la traza, en el tooltip). */
  protected resumirFallo(texto?: string): string {
    const t = (texto ?? '').toLowerCase();
    if (/permission|denied|not allowed|requires approval|permiso/.test(t)) return 'No tenía permiso para eso aquí: lo hace un botón de la pantalla.';
    if (/no such file|does not exist|not found|enoent/.test(t)) return 'No encontró un archivo que buscaba.';
    if (/timed? ?out|timeout/.test(t)) return 'Tardó demasiado y se cortó.';
    if (/modified since|has been modified|read it first|must read/.test(t)) return 'El archivo había cambiado: lo volvió a leer.';
    return 'Un paso no salió (pasa el ratón por encima para ver el detalle).';
  }

  protected alternar(clave: string): void {
    this.abiertos.update((s) => {
      const n = new Set(s);
      if (!n.delete(clave)) n.add(clave);
      return n;
    });
  }

  protected icono(nombre?: string): string {
    return ICONOS[nombre ?? ''] ?? 'build';
  }

  protected duracion(s?: number): string {
    if (!s) return 'un momento';
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
  }

  private async cargar(): Promise<void> {
    const clave = this.clave();
    try {
      const chat = await firstValueFrom(this.http.get<Chat>(this.ruta()));
      if (clave !== this.clave()) return;
      this.conversacion.set(chat.conversacion);
      this.entradas.set(chat.entradas);
      this.parcial.set('');
      this.bajar();
    } catch (e) {
      this.error.set(mensajeError(e));
    }
  }

  private bajar(): void {
    setTimeout(() => {
      const el = this.lista()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

}
