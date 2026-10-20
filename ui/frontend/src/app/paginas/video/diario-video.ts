import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { EventosService } from '../../core/eventos.service';
import { SucesoDiario } from '../../core/modelos';

const CLAVE = (id: number) => `canalyt.diario.visto.${id}`;

function leerVisto(id: number): string | null {
  try { return localStorage.getItem(CLAVE(id)); } catch { return null; }
}
function guardarVisto(id: number, fecha: string): void {
  try { localStorage.setItem(CLAVE(id), fecha); } catch { /* sin almacenamiento: solo no se recuerda */ }
}

/**
 * Qué ha pasado en este vídeo, para acompañar al usuario: un aviso de las novedades desde su última visita (lo que ha hecho
 * Claude, qué archivos ha cambiado y por qué) y el historial completo con sus decisiones. Cada cambio se puede abrir hasta el diff.
 */
@Component({
  selector: 'app-diario-video',
  imports: [DatePipe, MatButton, MatIcon],
  template: `
    @if (novedades().length && !abierto()) {
      <div class="novedades" role="status">
        <mat-icon>notifications_active</mat-icon>
        <div class="novedades__texto">
          @if (novedades().length === 1) {
            <strong>{{ novedades()[0].titulo }}</strong>
            @if (resumenCorto(novedades()[0]); as r) { <span>{{ r }}</span> }
          } @else {
            <strong>{{ novedades().length }} novedades desde tu última visita</strong>
            <span>{{ novedades()[0].titulo }} y otras.</span>
          }
        </div>
        <button mat-stroked-button type="button" (click)="abrir()">Ver qué ha pasado</button>
        <button mat-button type="button" (click)="entendido()">Entendido</button>
      </div>
    }

    <details class="historial" #historial [open]="abierto()" (toggle)="abierto.set(historial.open)">
      <summary><mat-icon>history</mat-icon>Historial del vídeo @if (lista().length) { <span class="cuenta">{{ lista().length }}</span> }</summary>
      @if (!lista().length) {
        <p class="vacio">Todavía no hay nada. Aquí verás cada decisión que tomes y todo lo que haga Claude, con lo que ha cambiado.</p>
      } @else {
        <ol class="sucesos">
          @for (e of lista(); track e.id) {
            <li [class]="'suceso suceso--' + e.quien" [class.suceso--error]="e.error">
              <span class="suceso__icono"><mat-icon>{{ icono(e) }}</mat-icon></span>
              <div class="suceso__cuerpo">
                <div class="suceso__cab">
                  <strong>{{ e.titulo }}</strong>
                  @if (e.fase) { <span class="chip">Fase {{ e.fase }}</span> }
                  <time>{{ e.fecha | date: 'd MMM, HH:mm' }}@if (e.segundos) { · {{ duracion(e.segundos) }} }</time>
                </div>
                @if (e.pedido) { <p class="suceso__pedido"><span>Le pediste</span>«{{ e.pedido }}»</p> }
                @if (e.detalle) { <p class="suceso__detalle">{{ e.detalle }}</p> }
                @if (e.cambios?.length) {
                  <details class="cambios-suceso">
                    <summary>Qué ha cambiado ({{ e.cambios!.length === 1 ? '1 archivo' : e.cambios!.length + ' archivos' }})</summary>
                    @for (c of e.cambios; track c.archivo) {
                      <div class="cambio">
                        <div class="cambio__cab"><code>{{ c.archivo }}</code><span [class]="'chip chip--' + c.tipo">{{ c.tipo }}</span><span class="mm">+{{ c.mas }} −{{ c.menos }}</span></div>
                        <ul>@for (r of c.resumen; track r) { <li>{{ r }}</li> }</ul>
                        <details class="diff-caja"><summary>Ver el detalle línea a línea</summary>
                          <pre class="diff">@for (l of lineas(c.diff); track $index) {<span [class]="clase(l)">{{ l }}
</span>}</pre>
                        </details>
                      </div>
                    }
                  </details>
                }
              </div>
            </li>
          }
        </ol>
      }
    </details>
  `,
  styles: `
    :host { display: block; margin: 0 0 1.25rem; }
    .novedades { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; padding: 0.8rem 1rem; margin-bottom: 1rem; border-radius: var(--ay-radio-peq); background: var(--ay-acento-suave); border: 1px solid var(--ay-acento); }
    .novedades > mat-icon { color: var(--ay-acento); }
    .novedades__texto { flex: 1 1 18rem; display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
    .novedades__texto span { color: var(--ay-tenue); font-size: 0.9rem; }
    .historial { background: var(--ay-superficie); border: 1px solid var(--ay-borde); border-radius: var(--ay-radio); }
    .historial > summary { display: flex; align-items: center; gap: 0.5rem; padding: 0.85rem 1.1rem; cursor: pointer; font-weight: 600; list-style: none; }
    .historial > summary::-webkit-details-marker { display: none; }
    .historial > summary mat-icon { color: var(--ay-acento); }
    .cuenta { font-size: 0.75rem; font-weight: 500; padding: 0.05rem 0.55rem; border-radius: 99px; background: var(--ay-superficie-3); color: var(--ay-tenue); }
    .vacio { margin: 0; padding: 0 1.1rem 1rem; color: var(--ay-tenue); }
    .sucesos { list-style: none; margin: 0; padding: 0 1.1rem 1rem; display: flex; flex-direction: column; }
    .suceso { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: 0.8rem; padding: 0.8rem 0; border-top: 1px solid var(--ay-borde); }
    .suceso__icono { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: 50%; background: var(--ay-superficie-3); color: var(--ay-tenue); }
    .suceso--claude .suceso__icono { background: var(--ay-acento-suave); color: var(--ay-acento-fuerte); }
    .suceso--usuario .suceso__icono { background: var(--ay-ok-suave); color: var(--ay-ok); }
    .suceso--error .suceso__icono { background: color-mix(in srgb, var(--ay-error) 14%, transparent); color: var(--ay-error); }
    .suceso__icono mat-icon { font-size: 1.15rem; width: 1.15rem; height: 1.15rem; }
    .suceso__cab { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.5rem; }
    .suceso__cab time { margin-left: auto; font-size: 0.8rem; color: var(--ay-tenue); }
    .chip { font-size: 0.75rem; padding: 0.05rem 0.5rem; border-radius: 99px; background: var(--ay-superficie-3); color: var(--ay-tenue); }
    .chip--creado { background: var(--ay-ok-suave); color: var(--ay-ok); }
    .chip--borrado { background: color-mix(in srgb, var(--ay-error) 14%, transparent); color: var(--ay-error); }
    .chip--modificado { background: var(--ay-aviso-suave); color: var(--ay-aviso); }
    .suceso p { margin: 0.35rem 0 0; line-height: 1.5; }
    .suceso__pedido { color: var(--ay-tenue); font-size: 0.9rem; }
    .suceso__pedido span { font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; margin-right: 0.4rem; color: var(--ay-acento-fuerte); font-weight: 600; }
    .suceso__detalle { white-space: pre-line; }
    .cambios-suceso { margin-top: 0.5rem; }
    .cambios-suceso > summary, .diff-caja > summary { cursor: pointer; font-size: 0.88rem; color: var(--ay-acento-fuerte); }
    .cambio { margin: 0.6rem 0 0 0.2rem; padding: 0.65rem 0.85rem; border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); border: 1px solid var(--ay-borde); }
    .cambio__cab { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    .cambio__cab code { font-size: 0.85rem; }
    .mm { margin-left: auto; font-size: 0.8rem; color: var(--ay-tenue); font-variant-numeric: tabular-nums; }
    .cambio ul { margin: 0.4rem 0 0.3rem; padding-left: 1.1rem; font-size: 0.92rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .diff { margin: 0.5rem 0 0; max-height: 18rem; overflow: auto; padding: 0.6rem 0.8rem; font-family: var(--ay-mono); font-size: 0.78rem; line-height: 1.5; background: var(--ay-superficie); border: 1px solid var(--ay-borde); border-radius: var(--ay-radio-peq); white-space: pre-wrap; overflow-wrap: anywhere; }
    .diff .mas { color: var(--ay-ok); background: var(--ay-ok-suave); display: block; }
    .diff .menos { color: var(--ay-error); background: color-mix(in srgb, var(--ay-error) 10%, transparent); display: block; }
    .diff .cab { color: var(--ay-tenue); display: block; }
  `,
})
export class DiarioVideo {
  readonly videoId = input.required<number>();
  private readonly eventos = inject(EventosService);
  private readonly caja = viewChild<ElementRef<HTMLElement>>('historial');

  protected readonly abierto = signal(false);
  private readonly visto = signal<string | null>(null);
  private inicializado = -1;

  private readonly recurso = httpResource<SucesoDiario[]>(() => {
    this.eventos.version();
    return { url: `/api/videos/${this.videoId()}/diario`, params: { limite: 60 } };
  });
  protected readonly lista = computed(() => (this.recurso.hasValue() ? this.recurso.value() : []));

  constructor() {
    // La primera vez que se ve el diario de un vídeo no se avisa de lo anterior: se toma lo último como visto.
    effect(() => {
      const id = this.videoId();
      if (!this.recurso.hasValue() || this.inicializado === id) return;
      const l = this.lista();
      untracked(() => {
        this.inicializado = id;
        const guardado = leerVisto(id);
        this.visto.set(guardado ?? l[0]?.fecha ?? new Date().toISOString());
        if (!guardado && l[0]) guardarVisto(id, l[0].fecha);
      });
    });
  }

  /** Lo que ha hecho Claude desde la última visita. */
  protected readonly novedades = computed(() => {
    const desde = this.visto();
    return desde ? this.lista().filter((e) => e.fecha > desde && e.quien === 'claude') : [];
  });

  protected abrir(): void {
    this.abierto.set(true);
    this.entendido();
    setTimeout(() => this.caja()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected entendido(): void {
    const ultima = this.lista()[0]?.fecha;
    if (ultima) { this.visto.set(ultima); guardarVisto(this.videoId(), ultima); }
  }

  protected icono(e: SucesoDiario): string {
    if (e.error) return 'error';
    return e.quien === 'claude' ? 'auto_awesome' : e.quien === 'usuario' ? 'person' : 'settings';
  }
  protected duracion(s: number): string { return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; }
  protected resumenCorto(e: SucesoDiario): string {
    const n = e.cambios?.length ?? 0;
    if (!n) return e.detalle ? e.detalle.slice(0, 140) : '';
    return `${n === 1 ? '1 archivo cambiado' : n + ' archivos cambiados'}: ${e.cambios![0].resumen[0] ?? e.cambios![0].archivo}`;
  }
  protected lineas(diff: string): string[] { return diff.split('\n'); }
  protected clase(l: string): string { return l.startsWith('+++') || l.startsWith('---') || l.startsWith('@@') ? 'cab' : l.startsWith('+') ? 'mas' : l.startsWith('-') ? 'menos' : ''; }
}
