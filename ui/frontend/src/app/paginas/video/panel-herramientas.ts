import { Confirmacion, ConfirmarService } from '../../compartido/confirmar';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

import { firstValueFrom } from 'rxjs';

import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { ColaAi33, VideoDetalle } from '../../core/modelos';
import { desglose, recuento } from '../../compartido/estado-imagen';
import { ColaAi33Panel } from './cola-ai33';
import { TERMINADAS, TareasService } from '../../core/tareas.service';
import { miles } from '../../core/formato';
import { ServiciosService } from '../../core/servicios.service';

interface Accion {
  clave: string;
  texto: string;
  /** «22 nuevas + 5 a rehacer»: se ve en el tooltip. */
  detalle?: string;
  icono: string;
  confirmar?: Confirmacion;
  /** Argumentos fijos para esta acción (p. ej. la URL de la referencia, que no la elige el usuario aquí). */
  argumentos?: Record<string, unknown>;
}

/** Herramientas gratis del kit para este vídeo, y sus tareas (en marcha y la última terminada). */
@Component({
  selector: 'app-panel-herramientas',
  imports: [MatButton, MatIcon, MatTooltip, TarjetaTarea, ColaAi33Panel],
  template: `
    <div class="acciones">
      <span class="acciones__titulo"><mat-icon>construction</mat-icon>Herramientas</span>
      @for (a of acciones(); track a.clave) {
        <button mat-stroked-button type="button" [matTooltip]="(a.detalle ? a.detalle + '. ' : '') + ayuda(a.clave)" [disabled]="ocupada(a.clave)" (click)="lanzar(a)">
          <mat-icon>{{ a.icono }}</mat-icon>{{ a.texto }}
        </button>
      }
    </div>
    <app-cola-ai33 [videoId]="video().id" />
    @if (error(); as e) {
      <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p>
    }
    @for (t of visibles(); track t.id) {
      <app-tarjeta-tarea [tarea]="t" />
    }
  `,
  styles: `
    .acciones {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 0.75rem;
    }
    .acciones__titulo {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-right: 0.5rem;
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ay-tenue);
      mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }
    }
    .acciones button {
      border-radius: 99px;
    }
    .error {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--mat-sys-error);
    }
  `,
})
export class PanelHerramientas {
  readonly video = input.required<VideoDetalle>();
  /** Solo estas herramientas (las de la fase en la que se muestra); sin indicar, todas. */
  readonly solo = input<string[] | null>(null);
  private readonly tareas = inject(TareasService);
  private readonly http = inject(HttpClient);
  private readonly confirmarSrv = inject(ConfirmarService);
  private readonly servicios = inject(ServiciosService);
  protected readonly error = signal<string | null>(null);

  private readonly propias = computed(() => this.tareas.tareas().filter((t) => t.video_id === this.video().id));

  /** Las que siguen en marcha y, si no hay ninguna, la última terminada. */
  protected readonly visibles = computed(() => {
    const activas = this.propias().filter((t) => !TERMINADAS.includes(t.estado));
    return activas.length ? activas : this.propias().slice(0, 1);
  });

  protected readonly acciones = computed<Accion[]>(() => {
    const v = this.video();
    const gratis = recuento(v.imagenes, 'klein');
    const pago = recuento(v.imagenes, 'ai33');
    const nGratis = gratis.nueva + gratis.rehacer;
    const nPago = pago.nueva + pago.rehacer;
    const lista: Accion[] = [{ clave: 'revisar_guion', texto: 'Revisar guion', icono: 'fact_check' }];
    const gratisPosible = this.servicios.disponible('cloudflare') || this.servicios.disponible('local');
    if (nGratis && gratisPosible) {
      lista.push({
        clave: 'imagenes',
        texto: `Generar ${nGratis} gratis`,
        detalle: desglose(gratis),
        icono: 'image',
        confirmar: {
          titulo: `Generar ${nGratis} imágenes gratis`,
          mensaje: `Con el servicio gratuito (${desglose(gratis)}). Si se acaba la cuota de hoy, sigue en este ordenador.`,
          aviso: 'Se para sola si se agota la cuota diaria; lo que falte, en otra pasada.',
          detalles: nPago ? [`Las ${nPago} de pago NO entran: se lanzan con «Generar ${nPago} de pago».`] : [],
          aceptar: 'Generar', icono: 'image',
        },
      });
    }
    if (nPago && this.servicios.disponible('ai33')) {
      lista.push({ clave: 'imagenes_ai33', texto: `Generar ${nPago} de pago`, detalle: desglose(pago), icono: 'paid' });
    }
    if (this.servicios.disponible('local')) {        // el boceto se hace en el Mac
      lista.push({
        clave: 'boceto',
        texto: 'Boceto',
        icono: 'draw',
        confirmar: {
          titulo: 'Hacer el boceto',
          mensaje: 'Genera TODAS las imágenes en baja resolución en este ordenador (≈ 50 s cada una), sin gastar cuota.',
          aviso: 'Ocupa el ordenador un buen rato.',
          aceptar: 'Hacer el boceto', icono: 'draw',
        },
      });
    }
    if (v.medios.audio.length || v.escenas.some((e) => e.audio)) {
      lista.push({ clave: 'entonacion', texto: 'Entonación', icono: 'graphic_eq' });
    }
    if (v.tiene_final) {
      lista.push({ clave: 'fotogramas', texto: 'Fotogramas de control', icono: 'grid_view' });
    }
    const referencia = (v.extra?.['referencia'] as string | null | undefined) ?? null;
    if (referencia) {
      lista.push({
        clave: 'comparar_referencia', texto: 'Comparar con la referencia', icono: 'compare',
        argumentos: { url: referencia },
      });
    }
    const solo = this.solo();
    return solo ? lista.filter((a) => solo.includes(a.clave)) : lista;
  });

  protected ayuda(clave: string): string {
    return this.tareas.herramientas().find((h) => h.clave === clave)?.descripcion ?? '';
  }

  /** Una herramienta ya en marcha para este vídeo no se lanza dos veces. */
  protected ocupada(clave: string): boolean {
    return this.propias().some((t) => t.herramienta === clave && !TERMINADAS.includes(t.estado));
  }

  protected async lanzar(a: Accion): Promise<void> {
    if (a.clave === 'imagenes_ai33') return this.lanzarAi33();
    if (a.confirmar && !(await this.confirmarSrv.pedir(a.confirmar))) return;
    this.error.set(await this.tareas.lanzar(a.clave, this.video().id, a.argumentos));
  }

  /** De pago: se pide la cifra al backend y se confirma exactamente esa (si cambia, el backend la rechaza). */
  private async lanzarAi33(): Promise<void> {
    const c = await firstValueFrom(this.http.get<ColaAi33>(`/api/videos/${this.video().id}/ai33`, { params: { vivo: false } }));
    const n = c.por_mandar.length;
    const ok = await this.confirmarSrv.pedir({
      titulo: `Generar ${n} imágenes de pago`,
      tono: 'pago',
      coste: `≈ ${miles(c.previsto_creditos)} créditos ` +
        `(≈ ${c.previsto_euros.toLocaleString('es', { minimumFractionDigits: 2 })} €)`,
      mensaje: `${c.modelo}: ${n} imágenes × ${miles(c.creditos_por_imagen)} créditos.`,
      detalles: c.apuntadas.length ? [`Además se recogen ${c.apuntadas.length} ya pagadas que esperan en su cola.`] : [],
      aviso: 'Son lentas (de minutos a horas en su cola) y NO se pueden cancelar sin perder los créditos.',
      aceptar: 'Generar (de pago)',
    });
    if (!ok) return;
    this.error.set(await this.tareas.lanzar('imagenes_ai33', this.video().id, { confirmado: true, previsto: n }));
  }
}
