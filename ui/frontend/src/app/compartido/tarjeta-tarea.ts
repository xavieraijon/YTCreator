import { ConfirmarService } from './confirmar';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { EstadoTarea, Tarea } from '../core/modelos';
import { TERMINADAS, TareasService } from '../core/tareas.service';

const ESTADO: Record<EstadoTarea, { texto: string; icono: string }> = {
  en_cola: { texto: 'En cola', icono: 'schedule' },
  en_curso: { texto: 'En curso', icono: 'sync' },
  hecha: { texto: 'Hecha', icono: 'check_circle' },
  error: { texto: 'Error', icono: 'error' },
  cancelada: { texto: 'Cancelada', icono: 'cancel' },
  interrumpida: { texto: 'Interrumpida', icono: 'power_off' },
};

/** 75 → «1 min 15 s»; 30 → «30 s». */
function minutos(s: number): string {
  s = Math.round(s);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

/** Una tarea: estado, progreso, cancelar y su salida (en directo mientras corre). */
@Component({
  selector: 'app-tarjeta-tarea',
  imports: [DatePipe, MatButton, MatIcon, MatProgressBar, RouterLink],
  template: `
    @let t = tarea();
    <div class="tarea" [class]="'tarea tarea--' + t.estado">
      <div class="tarea__cabecera">
        <mat-icon class="tarea__icono">{{ estado().icono }}</mat-icon>
        <div class="tarea__titulo">
          <strong>{{ t.titulo }}</strong>
          <span class="secundario">
            {{ estado().texto }}
            @if (t.codigo !== null && t.estado === 'error') { (código {{ t.codigo }}) }
            · {{ t.creada | date: 'short' }}
            @if (t.terminada && t.empezada) { · {{ duracion() }} }
            @if (enlaceVideo() && t.video_id) { · <a [routerLink]="['/videos', t.video_id]">ver el vídeo</a> }
          </span>
        </div>
        <span class="tarea__acciones">
          <button mat-button type="button" (click)="alternar()">
            <mat-icon>{{ abierta() ? 'expand_less' : 'terminal' }}</mat-icon>{{ abierta() ? 'Ocultar' : 'Salida' }}
          </button>
          @if (!terminada()) {
            <button mat-button type="button" (click)="cancelar()"><mat-icon>stop_circle</mat-icon>Cancelar</button>
          }
        </span>
      </div>
      @if (t.estado === 'en_curso') {
        @let b = barra();
        <div class="progreso">
          @if (b.porcentaje !== null) {
            <mat-progress-bar mode="determinate" [value]="b.porcentaje" />
          } @else {
            <mat-progress-bar mode="indeterminate" />
          }
          <div class="progreso__texto">
            <span class="progreso__etapa">
              @if (b.porcentaje !== null) { <strong>{{ b.porcentaje }} %</strong> }
              {{ b.etapa }}
            </span>
            <span class="secundario progreso__tiempo">{{ b.tiempo }}</span>
          </div>
        </div>
      }
      @if (t.progreso?.texto && !abierta()) {
        <code class="tarea__ultima">{{ t.progreso?.texto }}</code>
      }
      @if (abierta()) {
        <pre class="tarea__salida" #salida>{{ lineas().join('\\n') || '(sin salida todavía)' }}</pre>
      }
    </div>
  `,
  styles: `
    .tarea {
      border: 1px solid var(--ay-borde);
      border-radius: var(--ay-radio);
      padding: 0.75rem 1rem;
      margin-bottom: 0.6rem;
      background: var(--ay-superficie);
      box-shadow: var(--ay-sombra);
    }
    .tarea__cabecera {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .tarea__titulo {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .tarea__acciones {
      display: flex;
      gap: 0.25rem;
    }
    .tarea--en_curso .tarea__icono {
      color: var(--mat-sys-primary);
      animation: girar 1.6s linear infinite;
    }
    .tarea--hecha .tarea__icono {
      color: var(--ay-ok);
    }
    .tarea--error .tarea__icono,
    .tarea--interrumpida .tarea__icono {
      color: var(--mat-sys-error);
    }
    .progreso {
      margin: 0.55rem 0 0.1rem;
    }
    mat-progress-bar {
      border-radius: 99px;
      --mat-progress-bar-active-indicator-height: 6px;
      --mat-progress-bar-track-height: 6px;
    }
    .progreso__texto {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.75rem;
      margin-top: 0.35rem;
      font-size: 0.85rem;
    }
    .progreso__etapa {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      strong {
        color: var(--ay-acento);
        margin-right: 0.3rem;
        font-variant-numeric: tabular-nums;
      }
    }
    .progreso__tiempo {
      flex: none;
      font-variant-numeric: tabular-nums;
    }
    .tarea__ultima {
      display: block;
      margin-top: 0.35rem;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tarea__salida {
      margin: 0.5rem 0 0;
      max-height: 22rem;
      overflow: auto;
      padding: 0.6rem;
      font-size: 0.78rem;
      line-height: 1.35;
      background: #0c0d11;
      color: #d5d9e4;
      font-family: var(--ay-mono);
      border-radius: var(--mat-sys-corner-small);
      white-space: pre-wrap;
    }
    .secundario {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.85rem;
    }
    @keyframes girar {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class TarjetaTarea {
  readonly tarea = input.required<Tarea>();
  readonly enlaceVideo = input(false);
  private readonly servicio = inject(TareasService);
  private readonly confirmar = inject(ConfirmarService);
  private readonly salida = viewChild<ElementRef<HTMLPreElement>>('salida');

  protected readonly abierta = signal(false);
  protected readonly estado = computed(() => ESTADO[this.tarea().estado]);
  protected readonly terminada = computed(() => TERMINADAS.includes(this.tarea().estado));
  protected readonly lineas = computed(() => this.servicio.lineas()[this.tarea().id] ?? []);
  protected readonly duracion = computed(() => {
    const t = this.tarea();
    if (!t.empezada || !t.terminada) return '';
    const s = Math.max(0, Math.round((Date.parse(t.terminada) - Date.parse(t.empezada)) / 1000));
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
  });

  /** Reloj de la tarjeta (cada segundo mientras la tarea corre) para el tiempo transcurrido. */
  private readonly ahora = signal(Date.now());

  /** Barra: % real (pasos de la herramienta o imágenes), etapa, tiempo y estimación de lo que queda. */
  protected readonly barra = computed(() => {
    const t = this.tarea();
    const p = t.progreso ?? {};
    let fraccion: number | null = null;
    let cuenta = '';
    if (p.pasos) {
      fraccion = Math.min(1, (p.paso ?? 0) / p.pasos);
      cuenta = `${p.paso ?? 0} de ${p.pasos}`;
    } else if (p.total) {
      fraccion = Math.min(1, (p.hecho ?? 0) / p.total);
      cuenta = `${p.hecho ?? 0} de ${p.total} imágenes`;
    }
    const etapa = [p.etapa, cuenta].filter(Boolean).join(' · ') || 'En marcha…';
    const pasados = t.empezada ? Math.max(0, (this.ahora() - Date.parse(t.empezada)) / 1000) : 0;
    let tiempo = minutos(pasados);
    if (fraccion !== null && fraccion >= 0.05 && fraccion < 1) {
      tiempo += ` · quedan ~${minutos((pasados * (1 - fraccion)) / fraccion)}`;
    } else if (fraccion === null && p.suele) {
      tiempo += ` · suele tardar ~${minutos(p.suele)}`;
    }
    return { porcentaje: fraccion === null ? null : Math.round(fraccion * 100), etapa, tiempo };
  });

  constructor() {
    const reloj = setInterval(() => {
      if (this.tarea().estado === 'en_curso') this.ahora.set(Date.now());
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
    // La salida se queda pegada al final mientras llegan líneas.
    effect(() => {
      this.lineas();
      const pre = this.salida()?.nativeElement;
      if (pre) queueMicrotask(() => (pre.scrollTop = pre.scrollHeight));
    });
  }

  protected async alternar(): Promise<void> {
    const abrir = !this.abierta();
    this.abierta.set(abrir);
    if (abrir) await this.servicio.detalle(this.tarea().id); // la salida guardada hasta ahora
  }

  protected async cancelar(): Promise<void> {
    const ok = await this.confirmar.pedir({
      titulo: 'Cancelar la tarea',
      mensaje: `«${this.tarea().titulo}» se detendrá.`,
      aviso: this.tarea().herramienta.includes('ai33')
        ? 'Si es de pago, lo que ya se ha pagado NO se devuelve: mejor esperar a que termine.' : undefined,
      aceptar: 'Cancelar la tarea', cancelar: 'Dejarla seguir', tono: 'peligro',
    });
    if (ok) await this.servicio.cancelar(this.tarea().id);
  }
}
