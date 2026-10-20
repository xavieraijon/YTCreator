import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { ActividadService } from '../core/actividad.service';
import { TERMINADAS, TareasService, porcentajeTarea } from '../core/tareas.service';
import { TarjetaTarea } from './tarjeta-tarea';

/**
 * «Actividad» siempre a mano (cabecera, en cualquier pantalla): lo que está en marcha, sean tareas de las herramientas o
 * turnos de Claude, con el % de la primera tarea y, al pulsar, un panel con todo y lo terminado hace poco (hallazgo 26 del
 * recorrido profano: antes decía «Nada en marcha» mientras Claude trabajaba).
 */
@Component({
  selector: 'app-panel-tareas',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, MatIcon, RouterLink, TarjetaTarea, DatePipe],
  template: `
    <button type="button" class="boton" [class.boton--activo]="enMarcha()" cdkOverlayOrigin
            #origen="cdkOverlayOrigin" (click)="alternar()"
            [attr.aria-label]="'Actividad: lo que está en marcha' + (actividad.sinVer() ? ' y ' + actividad.sinVer() + ' terminado sin mirar' : '')">
      <mat-icon [class.girando]="enMarcha()">{{ enMarcha() ? 'sync' : 'task_alt' }}</mat-icon>
      <span class="boton__texto">
        @if (enMarcha()) {
          {{ enMarcha() }} en marcha
        } @else {
          Actividad
        }
      </span>
      @if (actividad.sinVer() && !enMarcha()) { <span class="nuevo" aria-hidden="true">{{ actividad.sinVer() }}</span> }
      @if (porcentaje(); as pc) {
        <span class="mini" aria-hidden="true"><span [style.width.%]="pc"></span></span>
        <span class="boton__pc">{{ pc }} %</span>
      }
    </button>

    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="origen" [cdkConnectedOverlayOpen]="abierto()"
                 [cdkConnectedOverlayHasBackdrop]="true"
                 cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
                 [cdkConnectedOverlayPositions]="posiciones"
                 (backdropClick)="abierto.set(false)" (detach)="abierto.set(false)">
      <div class="panel">
        <header>
          <strong>Actividad</strong>
          <a routerLink="/tareas" (click)="abierto.set(false)">Historial de tareas</a>
        </header>
        @if (enMarcha()) {
          <p class="seccion">En marcha</p>
          @for (c of actividad.claudeTrabajando(); track c.conversacion) {
            <div class="turno">
              <mat-icon class="girando">auto_awesome</mat-icon>
              <div class="turno__texto">
                <strong>Claude trabaja en «{{ c.titulo }}»</strong>
                <span>{{ c.accion ?? 'Leyendo el vídeo y sus archivos…' }} · desde las {{ c.desde | date: 'HH:mm' }}</span>
              </div>
              <a [routerLink]="c.video_id ? ['/videos', c.video_id] : ['/asistente']" (click)="abierto.set(false)">Ver</a>
              <button type="button" (click)="actividad.parar(c.conversacion)">Parar</button>
            </div>
          }
          @for (t of activas(); track t.id) {
            <app-tarjeta-tarea [tarea]="t" [enlaceVideo]="true" />
          }
        } @else {
          <p class="vacio">Nada en marcha: ni tareas ni Claude.</p>
        }
        @if (recientes().length || actividad.claudeRecientes().length) {
          <p class="seccion">Terminado hace poco</p>
          @for (c of actividad.claudeRecientes(); track c.conversacion) {
            <div class="turno turno--hecho" [class.turno--error]="c.estado === 'error'">
              <mat-icon>{{ c.estado === 'error' ? 'error' : 'auto_awesome' }}</mat-icon>
              <div class="turno__texto">
                <strong>Claude {{ c.estado === 'error' ? 'se paró con un error' : 'terminó' }} en «{{ c.titulo }}»</strong>
                <span>a las {{ c.desde | date: 'HH:mm' }}</span>
              </div>
              <a [routerLink]="c.video_id ? ['/videos', c.video_id] : ['/asistente']" (click)="abierto.set(false)">Ver</a>
            </div>
          }
          @for (t of recientes(); track t.id) {
            <app-tarjeta-tarea [tarea]="t" [enlaceVideo]="true" />
          }
        }
      </div>
    </ng-template>
  `,
  styles: `
    .turno { display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.8rem; margin-bottom: 0.5rem; border: 1px solid var(--ay-borde);
      border-radius: var(--ay-radio-peq); background: var(--ay-acento-suave); }
    .turno--hecho { background: var(--ay-superficie); }
    .nuevo { display: grid; place-items: center; min-width: 1.15rem; height: 1.15rem; padding: 0 0.3rem; border-radius: 99px;
      background: var(--ay-acento); color: var(--ay-superficie); font-size: 0.72rem; font-weight: 700; }
    .turno > mat-icon { color: var(--ay-acento); flex: none; }
    .turno--error > mat-icon { color: var(--ay-error); }
    .turno__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
    .turno__texto span { color: var(--ay-tenue); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .turno a, .turno button { all: unset; cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--ay-acento-fuerte); padding: 0.2rem 0.4rem; border-radius: var(--ay-radio-peq); }
    .turno a:hover, .turno button:hover, .turno a:focus-visible, .turno button:focus-visible { background: var(--ay-superficie-3); }
    .boton {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      height: 2.4rem;
      padding: 0 0.9rem;
      border: 1px solid var(--ay-borde);
      border-radius: 99px;
      background: var(--ay-superficie);
      color: var(--ay-tenue);
      font: inherit;
      font-size: 0.88rem;
      white-space: nowrap;
      flex: none;
      cursor: pointer;
      mat-icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
      }
    }
    .boton--activo {
      border-color: var(--ay-acento);
      color: var(--ay-acento-fuerte);
      background: var(--ay-acento-suave);
    }
    .boton__pc {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .mini {
      width: 3.5rem;
      height: 5px;
      border-radius: 99px;
      background: var(--ay-borde);
      overflow: hidden;
      span {
        display: block;
        height: 100%;
        background: var(--ay-acento);
        transition: width 0.4s ease;
      }
    }
    .girando {
      animation: girar 1.6s linear infinite;
    }
    @keyframes girar {
      to {
        transform: rotate(360deg);
      }
    }
    .panel {
      width: min(30rem, calc(100vw - 32px));
      max-height: 75vh;
      overflow: auto;
      margin-top: 0.5rem;
      padding: 1rem 1rem 0.5rem;
      border: 1px solid var(--ay-borde);
      border-radius: var(--ay-radio);
      background: var(--ay-fondo);
      box-shadow: var(--ay-sombra-alta);
      header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.25rem;
        strong {
          font-family: var(--ay-serif);
          letter-spacing: -0.03em;
          font-size: 1.15rem;
        }
        a {
          color: var(--ay-acento);
          font-size: 0.85rem;
        }
      }
    }
    .seccion {
      margin: 0.75rem 0 0.4rem;
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ay-tenue);
    }
    .vacio {
      color: var(--ay-tenue);
      font-size: 0.9rem;
    }
  `,
})
export class PanelTareas {
  private readonly servicio = inject(TareasService);
  protected readonly actividad = inject(ActividadService);
  protected readonly enMarcha = this.actividad.enMarcha;
  protected readonly abierto = signal(false);
  protected readonly activas = this.servicio.activas;
  protected readonly recientes = computed(() =>
    this.servicio.tareas().filter((t) => TERMINADAS.includes(t.estado))
      .sort((a, b) => b.id - a.id).slice(0, 3),
  );
  /** % de la primera tarea en marcha que tenga cifra (para el botón). */
  protected readonly porcentaje = computed(() => {
    for (const t of this.activas()) {
      const pc = porcentajeTarea(t);
      if (pc !== null) return pc;
    }
    return null;
  });
  /** Abrir el panel cuenta como haber visto lo terminado. */
  protected alternar(): void {
    this.abierto.set(!this.abierto());
    if (this.abierto()) this.actividad.sinVer.set(0);
  }

  protected readonly posiciones: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top' },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
  ];
}
