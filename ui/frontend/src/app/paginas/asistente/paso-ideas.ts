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
import { DatosCrearCanal, IdeaPropuesta, IdeasCanal } from '../../core/modelos';

/** Paso 10 de la creación del canal: un banco de ideas de vídeos, cada una medida en YouTube (verde, ámbar o rojo);
 * el usuario descarta las que no quiere y elige con cuál empezar. */
@Component({
  selector: 'app-paso-ideas',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar],
  template: `
    @let d = datos();
    @let i = ideas();
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">Ideas para tus primeros vídeos</h2>
    @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }

    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos buscando ideas para tu canal</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 2-3 minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (i.ideas.length && !otraVez()) {
      <p class="intro">
        Cada idea se mira en YouTube para ver si ya hay muchos vídeos iguales. Quita las que no te gusten (quedan al menos
        {{ i.minimo }}) y marca con cuál empezar: la que no esté en rojo.
      </p>
      @if (i.por_medir.length || midiendo()) {
        <p class="secundario"><mat-icon class="girando">autorenew</mat-icon>Comprobando ideas en YouTube… ({{ i.por_medir.length }} por mirar)</p>
      }
      @for (g of grupos(); track g.pilar) {
        <h3>{{ g.pilar }}</h3>
        <div class="opciones">
          @for (x of g.ideas; track x.id) {
            <section class="tarjeta idea" [class.idea--fuera]="descartadas().has(x.id)">
              <label class="idea__cabecera">
                <input type="radio" name="candidata" [checked]="candidata() === x.id" [disabled]="descartadas().has(x.id) || x.medida?.semaforo === 'rojo'"
                       (change)="candidata.set(x.id)" [attr.aria-label]="x.titulo" />
                <span class="opcion__cuerpo">
                  <span class="opcion__titulo">
                    {{ x.titulo }}
                    @if (x.recomendada) { <span class="chip chip--rec">Recomendada</span> }
                    @if (x.medida; as m) { <span class="semaforo" [class]="'semaforo semaforo--' + m.semaforo">{{ etiqueta(m.semaforo) }}</span> }
                    @else if (x.midiendo || i.por_medir.includes(x.id)) { <span class="semaforo semaforo--midiendo">Mirando…</span> }
                  </span>
                  <span class="opcion__porque">{{ x.dato }}</span>
                  @if (x.medida; as m) { <span class="opcion__porque">{{ m.motivo }}</span> }
                </span>
              </label>
              <button mat-button type="button" (click)="alternarDescarte(x)">
                {{ descartadas().has(x.id) ? 'Recuperar' : 'Quitar' }}
              </button>
            </section>
          }
        </div>
      }
      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      @if (!puede() && motivo()) { <p class="aviso"><mat-icon>info</mat-icon>{{ motivo() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado() || !puede()" (click)="elegir()">
          Quedarme con estas ideas<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
        <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Pedir otras ideas</button>
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
      </div>
    } @else {
      <p class="intro">
        Propondremos unas diez ideas repartidas entre los temas de tu canal, con el dato concreto de cada una, y
        las mirará en YouTube para avisarte de las que ya están muy vistas.
      </p>
      <label class="campo">
        <span>¿Algo que quieras que tenga en cuenta? (opcional)</span>
        <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                  placeholder="Por ejemplo: quiero empezar por algo muy conocido…"></textarea>
      </label>
      @if (i.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? i.error }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer()">
          <mat-icon>lightbulb</mat-icon>{{ ocupado() ? 'Enviando…' : 'Buscar ideas' }}
        </button>
        @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a lo que había</button> }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
      </div>
    }
    <details class="mas">
      <summary>Qué significan los colores</summary>
      <p>
        Verde: hay hueco, pocos vídeos iguales. Ámbar: hay competencia, pero con otro enfoque se puede. Rojo: ya hay muchos
        vídeos iguales y muy vistos; mejor no empezar por ahí. Mirarlas no cuesta nada.
      </p>
    </details>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    h3 { margin: 0.6rem 0 0; font-size: 1.05rem; }
    .idea { display: flex; gap: 0.75rem; align-items: flex-start; justify-content: space-between; max-width: 46rem; }
    .idea--fuera { opacity: 0.5; }
    .idea__cabecera { display: flex; gap: 0.7rem; align-items: flex-start; cursor: pointer; flex: 1; }
    .idea__cabecera input { margin-top: 0.3rem; width: 1.1rem; height: 1.1rem; }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .campo textarea {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
  `,
})
export class PasoIdeas {
  readonly datos = input.required<DatosCrearCanal>();
  readonly numero = input.required<number>();
  readonly hablar = output<void>();
  readonly cambio = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);

  protected readonly ideas = computed<IdeasCanal>(() => this.datos().ideas!);
  protected indicaciones = '';
  protected readonly otraVez = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly descartadas = signal<Set<number>>(new Set());
  protected readonly candidata = signal<number | null>(null);
  private inicial = false;

  protected readonly midiendo = computed(() => this.ideas().ideas.some((x) => x.midiendo));

  protected readonly grupos = computed(() => {
    const por = new Map<string, IdeaPropuesta[]>();
    for (const x of this.ideas().ideas) por.set(x.pilar, [...(por.get(x.pilar) ?? []), x]);
    return [...por].map(([pilar, ideas]) => ({ pilar, ideas }));
  });

  protected readonly motivo = computed(() => {
    const i = this.ideas();
    const quedan = i.ideas.filter((x) => !this.descartadas().has(x.id)).length;
    if (quedan < i.minimo) return `Tienen que quedar al menos ${i.minimo} ideas.`;
    const c = i.ideas.find((x) => x.id === this.candidata());
    if (!c || this.descartadas().has(c.id)) return 'Marca con qué idea quieres empezar.';
    if (!c.medida) return 'Espera a que se mire la idea elegida en YouTube.';
    if (c.medida.semaforo === 'rojo') return 'La idea para empezar no puede estar en rojo.';
    return '';
  });
  protected readonly puede = computed(() => !this.motivo());

  constructor() {
    effect(() => {
      const t = this.ideas().indicaciones;
      if (t && !this.indicaciones) this.indicaciones = t;
    });
    effect(() => {
      const ideas = this.ideas().ideas;
      if (this.inicial || !ideas.length) return;
      this.inicial = true;
      this.candidata.set((ideas.find((x) => x.recomendada) ?? ideas[0]).id);
    });
  }

  protected etiqueta(s: string): string {
    return s === 'verde' ? 'Hay hueco' : s === 'ambar' ? 'Con competencia' : s === 'rojo' ? 'Muy vista' : 'Sin datos';
  }

  protected alternarDescarte(x: IdeaPropuesta): void {
    const s = new Set(this.descartadas());
    if (!s.delete(x.id)) s.add(x.id);
    this.descartadas.set(s);
    if (this.candidata() === x.id && s.has(x.id)) this.candidata.set(null);
  }

  protected async proponer(): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/ideas/proponer', { indicaciones: this.indicaciones, otros: false }));
      this.otraVez.set(false);
      this.inicial = false;
      this.descartadas.set(new Set());
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
      await firstValueFrom(this.http.post('/api/asistente/canal/ideas/elegir', {
        candidata: this.candidata(), descartadas: [...this.descartadas()],
      }));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
