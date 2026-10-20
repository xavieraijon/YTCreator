import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';

import { firstValueFrom } from 'rxjs';

import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';
import { DatosCrearCanal, EquipoCanal } from '../../core/modelos';

/** Paso 8 de la creación del canal: Claude escribe la ficha de cada especialista del equipo y propone cuáles de los
 * opcionales conviene tener; el usuario marca los que quiere. */
@Component({
  selector: 'app-paso-equipo',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar],
  template: `
    @let d = datos();
    @let e = equipo();
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">El equipo de especialistas de tu canal</h2>
    @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }

    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos preparando a tus especialistas</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 3-5 minutos: escribe la ficha de cada uno y los prueba. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (e.roles.length && e.roles.some(r => r.ficha) && !otraVez()) {
      <p class="intro">
        Cada especialista conoce el estilo de tu canal y se encarga de una parte del vídeo. Los cuatro primeros siempre
        están; los dos últimos son opcionales.
      </p>
      <div class="opciones">
        @for (r of e.roles; track r.id) {
          <section class="rol tarjeta" [class.rol--falta]="r.ficha && !r.rellena">
            <label class="rol__cabecera">
              <input type="checkbox" [checked]="r.base || marcados().has(r.id)" [disabled]="r.base || !r.ficha"
                     (change)="alternar(r.id)" [attr.aria-label]="r.nombre" />
              <span class="opcion__cuerpo">
                <span class="opcion__titulo">
                  {{ r.nombre }}
                  @if (!r.base && r.recomendado) { <span class="chip chip--rec">Recomendado</span> }
                  @if (r.base) { <span class="chip">Siempre</span> }
                </span>
                @if (r.porque) { <span class="opcion__porque">{{ r.porque }}</span> }
                @if (!r.ficha) { <span class="opcion__porque">No lo hemos preparado.</span> }
                @else if (!r.rellena) { <span class="opcion__porque aviso">Su ficha aún tiene huecos por rellenar.</span> }
              </span>
            </label>
            @if (prueba(r.id); as t) { <p class="secundario"><mat-icon>science</mat-icon>Prueba: {{ t }}</p> }
          </section>
        }
      </div>
      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado() || !listo()" (click)="elegir()">
          Quedarme con este equipo<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
        <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Pedir cambios</button>
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
      </div>
    } @else {
      <p class="intro">
        Escribiremos la ficha de tus especialistas (narrativa, guion, dirección de arte y títulos) con el estilo de tu
        canal, y dirá si te conviene un verificador de datos o un asesor de la temática.
      </p>
      <label class="campo">
        <span>¿Algo que quieras que tenga en cuenta? (opcional)</span>
        <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                  placeholder="Por ejemplo: quiero un verificador porque habrá muchas cifras…"></textarea>
      </label>
      @if (e.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? e.error }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer()">
          <mat-icon>groups</mat-icon>{{ ocupado() ? 'Enviando…' : 'Preparar el equipo' }}
        </button>
        @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a lo que había</button> }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
      </div>
    }
    <details class="mas">
      <summary>Cómo se prepara</summary>
      <p>
        Cada especialista es un asistente con una ficha propia: cómo escribe, qué evita y ejemplos de tu canal.
        No cuesta nada. Los opcionales que no elijas se quitan del canal; puedes volver a añadirlos más adelante.
      </p>
    </details>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    .rol { display: flex; flex-direction: column; gap: 0.3rem; max-width: 46rem; }
    .rol--falta { border-color: var(--ay-aviso); }
    .rol__cabecera { display: flex; gap: 0.7rem; align-items: flex-start; cursor: pointer; }
    .rol__cabecera input { margin-top: 0.3rem; width: 1.1rem; height: 1.1rem; }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .campo textarea {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
  `,
})
export class PasoEquipo {
  readonly datos = input.required<DatosCrearCanal>();
  readonly numero = input.required<number>();
  readonly hablar = output<void>();
  readonly cambio = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);

  protected readonly equipo = computed<EquipoCanal>(() => this.datos().equipo!);
  protected indicaciones = '';
  protected readonly otraVez = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Los opcionales marcados (de partida, los que Claude recomienda). */
  protected readonly marcados = signal<Set<string>>(new Set());
  private inicial = false;

  /** Todas las fichas de lo marcado están escritas. */
  protected readonly listo = computed(() =>
    this.equipo().roles.every((r) => !(r.base || this.marcados().has(r.id)) || (r.ficha && r.rellena)));

  constructor() {
    effect(() => {
      const i = this.equipo().indicaciones;
      if (i && !this.indicaciones) this.indicaciones = i;
    });
    effect(() => {
      const roles = this.equipo().roles;
      if (this.inicial || !roles.some((r) => r.ficha)) return;
      this.inicial = true;
      this.marcados.set(new Set(roles.filter((r) => !r.base && r.ficha && r.recomendado).map((r) => r.id)));
    });
  }

  protected prueba(rol: string): string {
    return this.equipo().pruebas.find((p) => p.rol === rol)?.resultado ?? '';
  }

  protected alternar(id: string): void {
    const s = new Set(this.marcados());
    if (!s.delete(id)) s.add(id);
    this.marcados.set(s);
  }

  protected async proponer(): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/equipo/proponer', { indicaciones: this.indicaciones, otros: false }));
      this.otraVez.set(false);
      this.inicial = false;
      this.cambio.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async elegir(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const opcionales = this.equipo().roles.filter((r) => !r.base && this.marcados().has(r.id)).map((r) => r.id);
      await firstValueFrom(this.http.post('/api/asistente/canal/equipo/elegir', { opcionales }));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
