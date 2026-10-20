import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { CuotasService } from '../core/cuotas.service';
import { miles } from '../core/formato';

type Nivel = 'ok' | 'aviso' | 'agotada' | 'neutro';

/** Neuronas de una imagen de klein 4B en Cloudflare (medido; ≈ 90 imágenes al día). */
const NEURONAS_IMAGEN = 110;
/** Caracteres por minuto de locución (≈ 170 palabras/min × ≈ 6 caracteres). */
const CARACTERES_MINUTO = 1000;

/** Las cuotas de los servicios de IA en la cabecera, siempre a la vista y al día (llegan solas por SSE). */
@Component({
  selector: 'app-barra-cuotas',
  imports: [DecimalPipe, NgTemplateOutlet, MatIcon, MatMenuModule, MatTooltip, RouterLink],
  template: `
    @if (servicio.cuotas()?.datos; as d) {
      <div class="cuotas">
        <!-- Cloudflare: imágenes gratis -->
        @if (!usa('cloudflare')) {
          <!-- No lo usa (Ajustes → Servicios): no se enseña. -->
        } @else if (!conectado('cloudflare')) {
          <ng-container *ngTemplateOutlet="sinConectar; context: { titulo: 'Imágenes gratis' }" />
        } @else {
        <button type="button" class="pastilla" [class]="'pastilla pastilla--' + cf().nivel" [matMenuTriggerFor]="menuCf">
          <span class="pastilla__cabeza"><i class="punto"></i>Imágenes gratis</span>
          <span class="pastilla__valor">{{ cf().texto }}</span>
          <span class="barra"><span [style.width.%]="cf().pct"></span></span>
        </button>
        <mat-menu #menuCf="matMenu" class="menu-cuota" xPosition="after">
          <div class="detalle" (click)="$event.stopPropagation()">
            <strong>Imágenes gratis</strong>
            <span class="secundario">Unas {{ d.cloudflare.total / 110 | number: '1.0-0' }} al día</span>
            <dl>
              <dt>Quedan</dt><dd>≈ {{ cf().imagenes }} imágenes</dd>
              <dt>Usadas hoy</dt><dd>≈ {{ d.cloudflare.usadas_dia / 110 | number: '1.0-0' }} imágenes</dd>
              @if (d.cloudflare.usadas_24h !== null) {
                <dt>Últimas 24 horas</dt><dd>≈ {{ d.cloudflare.usadas_24h / 110 | number: '1.0-0' }} imágenes</dd>
              }
              @if (d.cloudflare.libre_imagen && d.cloudflare.libre_imagen !== 'ya') {
                <dt>Siguiente imagen</dt><dd>desde las {{ d.cloudflare.libre_imagen }}</dd>
              }
            </dl>
            <span class="nota">
              {{ d.cloudflare.real ? 'Dato real del servicio' : 'Estimación' }}. Se recupera poco a poco a lo largo de 24 horas; si
              se acaba, las imágenes se hacen en este ordenador (≈ 2 min cada una).
            </span>
            <small class="proveedor">Servicio: {{ nCf() }} · FLUX.2 klein ({{ d.cloudflare.libres | number }} de {{ d.cloudflare.total | number }} neuronas)</small>
          </div>
        </mat-menu>
        }

        <!-- Azure: voz gratis -->
        @if (!usa('azure')) {
          <!-- No lo usa (Ajustes → Servicios): no se enseña. -->
        } @else if (!conectado('azure')) {
          <ng-container *ngTemplateOutlet="sinConectar; context: { titulo: 'Voz gratis' }" />
        } @else {
        <button type="button" [class]="'pastilla pastilla--' + az().nivel" [matMenuTriggerFor]="menuAz">
          <span class="pastilla__cabeza"><i class="punto"></i>Voz gratis</span>
          <span class="pastilla__valor">{{ az().texto }}</span>
          <span class="barra"><span [style.width.%]="az().pct"></span></span>
        </button>
        <mat-menu #menuAz="matMenu" class="menu-cuota" xPosition="after">
          <div class="detalle" (click)="$event.stopPropagation()">
            <strong>Voz gratis</strong>
            <span class="secundario">Gratis: {{ d.azure.total | number }} caracteres al mes</span>
            <dl>
              <dt>Libres</dt><dd>{{ d.azure.libres | number }} (≈ {{ az().minutos }} min de voz)</dd>
              <dt>Usados este mes</dt><dd>{{ d.azure.usados | number }}</dd>
              <dt>Se reinicia</dt><dd>el {{ d.azure.reinicio }}</dd>
            </dl>
            <span class="nota">También sincroniza los subtítulos con la voz profesional (gratis).</span>
            <small class="proveedor">Servicio: {{ nAz() }} · F0</small>
          </div>
        </mat-menu>
        }

        <!-- ai33: de pago -->
        @if (!usa('ai33')) {
          <!-- No lo usa (Ajustes → Servicios): no se enseña. -->
        } @else if (!conectado('ai33')) {
          <ng-container *ngTemplateOutlet="sinConectar; context: { titulo: 'De pago' }" />
        } @else {
        <button type="button" [class]="'pastilla pastilla--pago pastilla--' + ai().nivel" [matMenuTriggerFor]="menuAi">
          <span class="pastilla__cabeza"><i class="punto"></i>De pago</span>
          <span class="pastilla__valor">{{ ai().texto }}</span>
          <span class="pastilla__pie">{{ ai().euros }}@if (d.ai33.videos_que_caben !== null) { · {{ d.ai33.videos_que_caben === 0 ? 'no cabe 1 vídeo' : 'caben ' + d.ai33.videos_que_caben + ' vídeos' }}}@if (d.ai33.gastado_hoy) { · hoy −{{ compacto(d.ai33.gastado_hoy) }}}</span>
        </button>
        <mat-menu #menuAi="matMenu" class="menu-cuota" xPosition="after">
          <div class="detalle" (click)="$event.stopPropagation()">
            <strong>De pago: voz profesional, imágenes de calidad y música</strong>
            <span class="secundario">De pago: créditos comprados (15 € = 3,3 M)</span>
            <dl>
              <dt>Saldo</dt><dd>{{ d.ai33.saldo === null ? 'no disponible' : (d.ai33.saldo | number) + ' créditos' }}</dd>
              <dt>En euros</dt><dd>{{ ai().euros }}</dd>
              <dt>Gastado hoy</dt><dd>{{ d.ai33.gastado_hoy | number }} créditos</dd>
              <dt>Gastado en total</dt><dd>{{ d.ai33.gastado_total | number }} (con las herramientas)</dd>
              @if (d.ai33.gastado_real !== null && d.ai33.sin_registrar !== null) {
                <dt>Gastado según el saldo</dt><dd>{{ d.ai33.gastado_real | number }} (de {{ d.ai33.comprados | number }} comprados)</dd>
                <dt>Fuera de las herramientas</dt>
                <dd [class.desajuste]="d.ai33.sin_registrar > 2000 || d.ai33.sin_registrar < -2000">{{ d.ai33.sin_registrar | number }}
                  <small>{{ d.ai33.sin_registrar > 2000 ? '(web del servicio o pruebas)' : d.ai33.sin_registrar < -2000 ? '(el saldo es mayor: ¿créditos añadidos?)' : '(cuadra)' }}</small></dd>
              }
              <dt>Un vídeo típico</dt>
              <dd>≈ {{ d.ai33.coste_video | number }} créditos · {{ d.ai33.coste_video_euros | number: '1.2-2' }} €
                @if (d.ai33.videos_que_caben !== null) { <small>({{ d.ai33.videos_que_caben === 0 ? 'no cabe ni uno' : 'caben ' + (d.ai33.videos_que_caben | number) }})</small> }</dd>
            </dl>
            <span class="nota">Imagen ≈ 1.720 créditos (0,8 cént.); voz ≈ 1,15 por carácter. Lo locutado en su web también gasta.</span>
            <small class="proveedor">Servicio: {{ nAi() }} (voz, imágenes y música)</small>
          </div>
        </mat-menu>
        }

        <!-- Google AI Pro: suscripción, sin API para leer el saldo. Solo para quien usa Gemini (su clave guardada). -->
        @if (usa('gemini') && conectado('gemini')) {
        <button type="button" class="pastilla pastilla--neutro" [matMenuTriggerFor]="menuGo">
          <span class="pastilla__cabeza"><i class="punto"></i>Google AI Pro</span>
          <span class="pastilla__valor">Suscripción</span>
          <span class="pastilla__pie">Gemini · Flow</span>
        </button>
        <mat-menu #menuGo="matMenu" class="menu-cuota" xPosition="after">
          <div class="detalle" (click)="$event.stopPropagation()">
            <strong>Google AI Pro: miniaturas y clips a mano</strong>
            <span class="secundario">Suscripción mensual: su saldo no se puede leer desde aquí</span>
            <dl>
              <dt>Flow</dt><dd>50 créditos al día + 1.000 al mes</dd>
              <dt>Imagen en Flow</dt><dd>≈ 1-2 créditos (según terceros)</dd>
              <dt>Uso en YTCreator</dt><dd>a mano: miniaturas, clips y rescates</dd>
            </dl>
            <a class="enlace" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener">
              Ver los créditos en Flow <mat-icon>open_in_new</mat-icon>
            </a>
            <small class="proveedor">Servicio: {{ nGo() }} y Flow</small>
          </div>
        </mat-menu>
        }

        <!-- Servicios sin cuota consultable (los que conecta el usuario): su nombre y lo que ha gastado, contado por el kit. -->
        @for (o of servicio.cuotas()?.otros ?? []; track o.id) {
        <div class="pastilla pastilla--neutro" [class.pastilla--pago]="o.de_pago" [matTooltip]="o.hace.join(', ') + ': este servicio no informa de su cuota; se cuenta lo gastado desde aquí'">
          <span class="pastilla__cabeza"><i class="punto"></i>{{ o.nombre }}</span>
          <span class="pastilla__valor">{{ o.gastado_total ? (o.gastado_total | number: '1.0-2') + ' ' + o.unidad : 'Sin gasto' }}</span>
          <span class="pastilla__pie">{{ o.gastado_hoy ? 'hoy −' + (o.gastado_hoy | number: '1.0-2') : 'Sin cuota que consultar' }}</span>
        </div>
        }

        <button
          type="button"
          class="refrescar"
          [disabled]="servicio.consultando()"
          (click)="servicio.refrescar()"
          [matTooltip]="'Consultadas ' + hace() + '. Se actualizan solas cada 2 min y al terminar cada tarea; pulsa para consultar ahora'"
        >
          <mat-icon [class.girando]="servicio.consultando()">{{ servicio.cuotas()?.error ? 'sync_problem' : 'bolt' }}</mat-icon>
          <span>{{ hace() }}</span>
        </button>
      </div>
    } @else if (servicio.cuotas()?.error; as e) {
      <span class="error" [matTooltip]="e"><mat-icon>sync_problem</mat-icon>Cuotas no disponibles</span>
    } @else {
      <span class="secundario cargando">Consultando cuotas…</span>
    }
    <ng-template #sinConectar let-titulo="titulo">
      <a class="pastilla pastilla--neutro" routerLink="/ajustes" [matTooltip]="titulo + ': falta guardar su clave en Ajustes'">
        <span class="pastilla__cabeza"><i class="punto"></i>{{ titulo }}</span>
        <span class="pastilla__valor">Sin conectar</span>
        <span class="pastilla__pie">Conéctalo en Ajustes</span>
      </a>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .cuotas {
      display: flex;
      align-items: stretch;
      padding: 0.45rem 0;
      gap: 0.45rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .pastilla {
      --color: var(--ay-ok);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.15rem;
      min-width: 7.5rem;
      padding: 0.3rem 0.7rem 0.35rem;
      border: 1px solid var(--ay-borde);
      border-radius: 10px;
      background: var(--ay-superficie);
      font: inherit;
      line-height: 1.2;
      text-align: left;
      color: var(--ay-tinta);
      cursor: pointer;
      text-decoration: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .pastilla:hover {
      border-color: var(--ay-borde-fuerte);
      box-shadow: var(--ay-sombra);
    }
    .pastilla--aviso {
      --color: var(--ay-aviso);
    }
    .pastilla--agotada {
      --color: var(--ay-error);
    }
    .pastilla--pago {
      --color: var(--ay-pago);
    }
    .pastilla--neutro {
      --color: var(--ay-tenue);
    }
    .pastilla__cabeza {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--ay-tenue);
    }
    .punto {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color) 18%, transparent);
    }
    .pastilla__valor {
      font-size: 0.84rem;
      font-weight: 650;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .pastilla__pie {
      font-size: 0.75rem;
      white-space: nowrap;
      color: var(--ay-tenue);
    }
    .barra {
      display: block;
      height: 3px;
      margin-top: 0.2rem;
      border-radius: 99px;
      background: var(--ay-superficie-3);
      overflow: hidden;
    }
    .barra span {
      display: block;
      height: 100%;
      border-radius: 99px;
      background: var(--color);
      transition: width 0.6s ease;
    }
    .refrescar {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0 0.5rem;
      border: 0;
      background: none;
      font: inherit;
      font-size: 0.75rem;
      white-space: nowrap;
      color: var(--ay-tenue);
      cursor: pointer;
    }
    .refrescar:hover {
      color: var(--ay-acento);
    }
    .refrescar mat-icon {
      font-size: 1.05rem;
      width: 1.05rem;
      height: 1.05rem;
    }
    .girando {
      animation: girar 1s linear infinite;
    }
    @keyframes girar {
      to {
        transform: rotate(360deg);
      }
    }
    .detalle {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.6rem 1rem 0.75rem;
      font-size: 0.82rem;
      cursor: default;
    }
    .detalle strong {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-size: 0.98rem;
    }
    .secundario {
      color: var(--ay-tenue);
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.3rem 0.9rem;
      margin: 0.6rem 0;
    }
    dt {
      color: var(--ay-tenue);
    }
    dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .desajuste { color: var(--ay-aviso); }
    .nota {
      font-size: 0.75rem;
      line-height: 1.45;
      color: var(--ay-tenue);
    }
    .proveedor {                 /* el proveedor, solo en el detalle (glosario de la UI) */
      display: block;
      font-size: 0.75rem;
      color: var(--ay-tenue);
      border-top: 1px solid var(--ay-borde);
      padding-top: 0.4rem;
    }
    .enlace {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-weight: 600;
      text-decoration: none;
    }
    .enlace mat-icon {
      font-size: 0.95rem;
      width: 0.95rem;
      height: 0.95rem;
    }
    .error {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.82rem;
      color: var(--ay-error);
    }
    .cargando {
      font-size: 0.82rem;
      color: var(--ay-tenue);
    }
  `,
})
export class BarraCuotas {
  protected readonly servicio = inject(CuotasService);
  private readonly ahora = signal(Date.now());

  constructor() {
    const reloj = setInterval(() => this.ahora.set(Date.now()), 20_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  /** Lo usa el usuario (Ajustes → Servicios). Sin el dato (backend antiguo), sí: se ve como antes. */
  protected usa(servicio: 'cloudflare' | 'azure' | 'ai33' | 'gemini'): boolean {
    return this.servicio.cuotas()?.activos?.[servicio] ?? true;
  }

  /** Sin datos de conexión (backend antiguo) se da por conectado: se ve como antes. */
  protected conectado(servicio: 'cloudflare' | 'azure' | 'ai33' | 'gemini'): boolean {
    return this.servicio.cuotas()?.conectados?.[servicio] ?? true;
  }

  /** El nombre del servicio como lo ve el usuario (el del catálogo; cae al id si el backend es antiguo). */
  protected nombre(id: string): string {
    return this.servicio.cuotas()?.nombres?.[id] ?? id;
  }
  protected nCf = () => this.nombre('cloudflare');
  protected nAz = () => this.nombre('azure');
  protected nAi = () => this.nombre('ai33');
  protected nGo = () => this.nombre('gemini');

  protected readonly cf = computed(() => {
    const c = this.servicio.cuotas()?.datos?.cloudflare;
    if (!c) return { texto: '', pct: 0, nivel: 'neutro' as Nivel, imagenes: 0 };
    const imagenes = Math.floor(c.libres / NEURONAS_IMAGEN);
    const agotada = imagenes < 1;
    const vuelve = c.libre_imagen && c.libre_imagen !== 'ya' ? this.hora(c.libre_imagen) : null;
    if (c.motivo === 'sin_conexion' || c.motivo === 'rechazada') {
      // Sin el dato real no se puede decir cuánto queda: se dice por qué (fiabilidad, 07/10).
      return { texto: c.motivo === 'rechazada' ? 'Clave rechazada' : 'Sin conexión', pct: 0, nivel: 'neutro' as Nivel, imagenes };
    }
    return {
      texto: agotada ? (vuelve ? `Agotada · vuelve ${vuelve}` : 'Agotada') : `≈ ${imagenes} imágenes`,
      pct: (100 * c.libres) / c.total,
      nivel: this.nivel(c.libres / c.total, agotada),
      imagenes,
    };
  });

  protected readonly az = computed(() => {
    const a = this.servicio.cuotas()?.datos?.azure;
    if (!a) return { texto: '', pct: 0, nivel: 'neutro' as Nivel, minutos: 0 };
    const minutos = Math.floor(a.libres / CARACTERES_MINUTO);
    return {
      texto: `${this.compacto(a.libres)} caracteres`,
      pct: (100 * a.libres) / a.total,
      nivel: this.nivel(a.libres / a.total, a.libres < 2000),
      minutos,
    };
  });

  protected readonly ai = computed(() => {
    const a = this.servicio.cuotas()?.datos?.ai33;
    if (!a || a.saldo === null) {
      // Sin saldo leído no es «sin saldo»: se dice por qué falta (sin conexión, clave rechazada o respuesta rara).
      const porque: Record<string, [string, Nivel]> = {
        sin_conexion: ['Sin conexión', 'neutro'], rechazada: ['Clave rechazada', 'agotada'], respuesta_rara: ['Sin datos', 'neutro'],
      };
      const [texto, nivel] = porque[a?.motivo ?? ''] ?? ['Sin datos', 'neutro'];
      return { texto, euros: '—', nivel };
    }
    const euros = (a.saldo / 1_000_000) * a.euros_por_millon;
    return {
      texto: `${this.compacto(a.saldo)} créditos`,
      euros: `≈ ${euros.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
      nivel: (a.saldo < 50_000 ? 'agotada' : a.saldo < 300_000 ? 'aviso' : 'ok') as Nivel,
    };
  });

  /** «hace 1 min», al día con un reloj de 20 s. */
  protected readonly hace = computed(() => {
    const c = this.servicio.cuotas()?.consultado;
    if (!c) return '';
    const min = Math.floor((this.ahora() - Date.parse(c)) / 60_000);
    return min < 1 ? 'ahora' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h`;
  });

  protected compacto(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es', { maximumFractionDigits: 2 })} M`;
    if (n >= 10_000) return `${miles(Math.round(n / 1000))} k`;
    return miles(n);
  }

  private nivel(fraccion: number, agotada: boolean): Nivel {
    return agotada ? 'agotada' : fraccion < 0.25 ? 'aviso' : 'ok';
  }

  /** «30/09 11:00» → «11:00» si es hoy. */
  private hora(texto: string): string {
    const hoy = new Date().toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
    return texto.startsWith(hoy) ? texto.slice(hoy.length).trim() : texto;
  }
}
