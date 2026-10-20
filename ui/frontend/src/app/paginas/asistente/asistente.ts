import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { Markdown } from '../../compartido/markdown';
import { NuevoVideoService } from '../../compartido/nuevo-video';
import { CanalesService } from '../../core/canales.service';
import { EventosService } from '../../core/eventos.service';
import { AsistenteEstado } from '../../core/modelos';
import { PanelClaude } from '../video/panel-claude';
import { CrearCanal } from './crear-canal';

type IdPaso = AsistenteEstado['actual'];

/**
 * El camino desde cero en cuatro pasos: preparar el kit → crear el canal → producir el primer vídeo → publicarlo.
 * Lee el estado de los archivos (nada se guarda aquí); cada paso lleva a donde se hace: el chat de Claude para el canal
 * (/nuevo-canal), «Nuevo vídeo» y la guía del vídeo, y la guía de subida.
 */
@Component({
  selector: 'app-asistente',
  imports: [MatButton, MatExpansionModule, MatIcon, RouterLink, Markdown, PanelClaude, CrearCanal],
  template: `
    <span class="antetitulo">Desde cero</span>
    <h1>Asistente</h1>
    <p class="secundario">
      Te lleva paso a paso desde la instalación hasta el primer vídeo publicado. Cada paso se marca solo al
      cumplirse; si ya tienes canal y vídeos, aquí ves en qué punto estás.
    </p>

    @if (estado(); as e) {
      <div class="camino">
        <nav class="pasos" aria-label="Pasos">
          @for (p of e.pasos; track p.id; let i = $index) {
            <button type="button" class="paso" [class.paso--hecho]="p.hecho" [class.paso--actual]="p.id === e.actual"
                    [class.paso--abierto]="p.id === visto()" (click)="elegir(p.id)">
              <span class="paso__marca">
                @if (p.hecho) { <mat-icon>check</mat-icon> } @else { {{ i + 1 }} }
              </span>
              <span class="paso__texto">
                <strong>{{ p.titulo }}</strong>
                <small>{{ p.resumen }}</small>
              </span>
            </button>
          }
        </nav>

        <section class="detalle tarjeta">
          @switch (visto()) {
            @case ('kit') {
              <h2>Dejarlo todo listo</h2>
              <p class="secundario">Lo mínimo para producir. Las claves se guardan en Ajustes, nunca por el chat; aquí solo se comprueba si están.</p>
              <ul class="lista">
                @for (i of e.kit.items; track i.id) {
                  <li [class.falta]="!i.ok && i.requerido">
                    <mat-icon>{{ i.ok ? 'check_circle' : i.requerido ? 'error' : 'radio_button_unchecked' }}</mat-icon>
                    <span>
                      <strong>{{ i.texto }}</strong>
                      @if (!i.requerido) { <small class="etiqueta">opcional</small> }
                      @if (!i.ok) { <br /><small>{{ i.ayuda }}</small> }
                    </span>
                  </li>
                }
              </ul>
              <div class="acciones">
                <button mat-stroked-button type="button" (click)="estadoRecurso.reload()"><mat-icon>refresh</mat-icon>Comprobar de nuevo</button>
                <a mat-flat-button routerLink="/ajustes"><mat-icon>settings</mat-icon>Guardar claves en Ajustes</a>
              </div>
            }
            @case ('canal') {
              <h2>Crear el canal</h2>
              @if (e.canal.hay_canal && !e.canal.creacion) {
                @if (e.canal.pendientes) {
                  <p>
                    <a [routerLink]="['/canales', e.canal.activo]">{{ e.canal.activo }}</a> está a medio crear: le
                    {{ e.canal.pendientes === 1 ? 'falta 1 campo' : 'faltan ' + e.canal.pendientes + ' campos' }} por rellenar.
                    Pídele al asistente que siga con la creación del canal desde donde se quedó.
                  </p>
                } @else {
                  <p>Ya tienes un canal activo: <a [routerLink]="['/canales', e.canal.activo]">{{ e.canal.activo }}</a>. Si quieres otro, empieza uno nuevo con el asistente.</p>
                }
                <div class="chat"><app-panel-claude (cerrar)="elegir('video')" /></div>
              } @else {
                <app-crear-canal (hablar)="conChat.set(true)" />
                @if (crear()?.guiado() === false || conChat()) {
                  <div class="chat"><app-panel-claude [canalAMedias]="!!e.canal.creacion" (cerrar)="elegir('video')" /></div>
                }
              }
            }
            @case ('video') {
              <h2>Producir el primer vídeo</h2>
              @if (!e.canal.hay_canal) {
                <p class="secundario">Primero hace falta un canal: termina el paso anterior.</p>
              } @else {
                <p class="secundario">
                  Eliges el tema (o una referencia que haya funcionado) y te guiamos por las fases con tu aprobación:
                  investigación, escaleta, guion, voz, imágenes, montaje y miniatura.
                </p>
                <div class="acciones">
                  <button mat-flat-button type="button" (click)="nuevoVideo()"><mat-icon>add</mat-icon>Nuevo vídeo</button>
                  @for (v of e.video.en_curso; track v.id) {
                    <a mat-stroked-button [routerLink]="['/videos', v.id]">
                      <mat-icon>play_arrow</mat-icon>Seguir con «{{ v.titulo || v.carpeta }}»@if (v.fase_nombre) { · {{ v.fase_nombre }} }
                    </a>
                  }
                </div>
              }
            }
            @case ('publicar') {
              <h2>Publicarlo en YouTube</h2>
              @if (e.video.publicables.length) {
                <p>Listos para subir:</p>
                <div class="acciones">
                  @for (v of e.video.publicables; track v.id) {
                    <a mat-stroked-button [routerLink]="['/videos', v.id]"><mat-icon>movie</mat-icon>{{ v.titulo || v.carpeta }}</a>
                  }
                </div>
              } @else if (e.video.publicados?.length) {
                <p class="secundario">Ya has publicado {{ e.video.publicados.length === 1 ? 'un vídeo' : e.video.publicados.length + ' vídeos' }}. Ahora mismo no hay otro listo para subir: cuando termines el siguiente, aparecerá aquí.</p>
              } @else {
                <p class="secundario">Todavía no hay ningún vídeo listo para subir (con el montaje, la miniatura y los textos aprobados). Cuando lo haya, aparecerá aquí con la guía de subida.</p>
              }
              @if (e.video.publicados?.length) {
                <p>Ya publicados:</p>
                <div class="acciones">
                  @for (v of e.video.publicados; track v.id) {
                    <a mat-stroked-button [routerLink]="['/videos', v.id]"><mat-icon>check_circle</mat-icon>{{ v.titulo || v.carpeta }}</a>
                  }
                </div>
              }
              @if (guia.value()?.texto; as texto) {
                <mat-accordion>
                  <mat-expansion-panel>
                    <mat-expansion-panel-header><mat-panel-title>Guía de subida paso a paso</mat-panel-title></mat-expansion-panel-header>
                    <app-markdown [texto]="texto" />
                  </mat-expansion-panel>
                </mat-accordion>
              }
            }
          }
        </section>
      </div>
    }
  `,
  styles: `
    .secundario { color: var(--mat-sys-on-surface-variant); max-width: 52rem; }
    .camino { display: grid; grid-template-columns: 17rem 1fr; gap: 1.5rem; margin-top: 1.5rem; align-items: start; }
    @media (max-width: 1100px) { .camino { grid-template-columns: 1fr; } }
    .pasos { display: flex; flex-direction: column; gap: 0.5rem; }
    .paso {
      display: flex; gap: 0.75rem; align-items: center; text-align: left; cursor: pointer;
      padding: 0.75rem 0.9rem; border: 1px solid var(--ay-borde); border-radius: var(--ay-radio-peq);
      background: var(--ay-superficie); color: var(--ay-tinta); font: inherit;
    }
    .paso--abierto { border-color: var(--ay-acento); background: var(--ay-acento-suave); }
    .paso__marca {
      display: grid; place-items: center; flex: none; width: 1.9rem; height: 1.9rem; border-radius: 50%;
      border: 1.5px solid var(--ay-borde-fuerte); font-weight: 650; font-size: 0.9rem;
    }
    .paso--actual .paso__marca { border-color: var(--ay-acento); color: var(--ay-acento); }
    .paso--hecho .paso__marca { background: var(--ay-ok); border-color: var(--ay-ok); color: var(--ay-superficie); }
    .paso__marca mat-icon { font-size: 1.1rem; width: 1.1rem; height: 1.1rem; }
    .paso__texto { display: flex; flex-direction: column; min-width: 0; }
    .paso__texto small { color: var(--ay-tenue); }
    .detalle { padding: 1.25rem 1.5rem; min-width: 0; }
    .detalle h2 { margin-top: 0; }
    .lista { list-style: none; padding: 0; margin: 1rem 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .lista li { display: flex; gap: 0.6rem; align-items: flex-start; }
    .lista mat-icon { color: var(--ay-ok); flex: none; }
    .lista li.falta mat-icon { color: var(--ay-error); }
    .lista small { color: var(--ay-tenue); }
    .acciones { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0; }
    .chat { height: 34rem; border: 1px solid var(--ay-borde); border-radius: var(--ay-radio-peq); overflow: hidden; }
    mat-accordion { display: block; margin-top: 1rem; }
  `,
})
export class Asistente {
  private readonly eventos = inject(EventosService);
  private readonly canales = inject(CanalesService);
  private readonly nuevo = inject(NuevoVideoService);
  private readonly panel = viewChild(PanelClaude);
  protected readonly crear = viewChild(CrearCanal);
  /** En un paso con pantalla propia el chat se esconde, salvo que el usuario pida hablar con Claude. */
  protected readonly conChat = signal(false);

  protected readonly estadoRecurso = httpResource<AsistenteEstado>(() => {
    this.eventos.version();
    return '/api/asistente';
  });
  protected readonly estado = computed(() => (this.estadoRecurso.hasValue() ? this.estadoRecurso.value() : undefined));
  protected readonly guia = httpResource<{ texto: string }>(() => '/api/asistente/guia-subida');

  /** El paso que se enseña: el que elige el usuario o, por defecto, el actual. */
  protected readonly elegido = signal<IdPaso | null>(null);
  protected readonly visto = computed<IdPaso>(() => this.elegido() ?? this.estado()?.actual ?? 'kit');

  constructor() {
    // Cuando Claude termina un turno (o cambia de fase), el estado de los archivos pudo cambiar.
    effect(() => {
      const e = this.panel()?.estado();
      if (e && e !== 'pensando') untracked(() => {
        this.estadoRecurso.reload();
        this.crear()?.recargar();
      });
    });
  }

  protected elegir(id: IdPaso): void {
    this.elegido.set(id);
  }
  protected nuevoVideo(): void {
    const c = this.canales.activo();
    if (c) void this.nuevo.abrir(c.slug, c.nombre);
  }

}
