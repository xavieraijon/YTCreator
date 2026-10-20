import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';

import { firstValueFrom } from 'rxjs';

import { Markdown } from '../../compartido/markdown';
import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { conservar } from '../../compartido/conservar';
import { EventosService } from '../../core/eventos.service';
import { EstructuraReferencia } from '../../core/modelos';
import { TERMINADAS, TareasService } from '../../core/tareas.service';

const HERRAMIENTA = 'estructura_referencia';

/**
 * Vídeos de referencia del canal: se pega la URL de uno que funcionó y `estructura_referencia.py` saca su esqueleto
 * (ritmo, gancho, bucles, giro, cierre, factor MRV) sin copiar el texto. Gratis (yt-dlp). Alimenta la fase B de
 * «Nuevo vídeo» y la escaleta de `narrativa`, que nunca ve la transcripción.
 */
@Component({
  selector: 'app-videos-referencia',
  imports: [MatButton, MatExpansionModule, MatFormField, MatIcon, MatInput, MatLabel, MatTooltip, Markdown, TarjetaTarea],
  template: `
    <h2>Vídeos de referencia</h2>
    <p class="secundario">
      Pega la URL de un vídeo que haya funcionado (de otro canal o idioma). Se analiza su estructura sin copiar el
      texto; es gratis. Con varios del mismo idioma, «Resumir» da el patrón común.
    </p>
    <div class="formulario">
      <mat-form-field appearance="outline" class="url">
        <mat-label>URL del vídeo de YouTube</mat-label>
        <input matInput type="url" [value]="url()" (input)="url.set($any($event.target).value)" (keydown.enter)="analizar()"
               placeholder="https://www.youtube.com/watch?v=…" />
      </mat-form-field>
      <button mat-flat-button type="button" [disabled]="!url().trim() || ocupada()" (click)="analizar()">
        <mat-icon>{{ ocupada() ? 'sync' : 'travel_explore' }}</mat-icon>{{ ocupada() ? 'En marcha…' : 'Analizar' }}
      </button>
      <button mat-stroked-button type="button" [disabled]="ocupada() || lista().length < 1" (click)="resumir()">
        <mat-icon>functions</mat-icon>Resumir los analizados
      </button>
    </div>
    @if (error()) {
      <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p>
    }
    @for (t of visibles(); track t.id) {
      <app-tarjeta-tarea [tarea]="t" />
    }
    @if (lista().length) {
      <mat-accordion>
        @for (e of lista(); track e.id) {
          <mat-expansion-panel (opened)="abrir(e.id)" class="tarjeta">
            <mat-expansion-panel-header collapsedHeight="auto" expandedHeight="auto" class="cabecera">
              <mat-panel-title>{{ e.titulo }}</mat-panel-title>
              <mat-panel-description>
                {{ e.canal }} · {{ minutos(e.duracion_s) }} · {{ e.idioma }}
                @if (e.outlier) { · <span class="etiqueta etiqueta--ok" matTooltip="Tuvo muchas más visitas que lo normal en su canal">Éxito{{ e.ratio ? ' ×' + e.ratio : '' }}</span> }
                @if (e.mrv?.reciente && e.mrv?.viral) { · <span class="etiqueta etiqueta--ok" matTooltip="Reciente y viral frente al resto de su canal">Reciente y viral</span> }
              </mat-panel-description>
            </mat-expansion-panel-header>
            @if (textos()[e.id]; as texto) {
              <app-markdown [texto]="texto" />
            }
          </mat-expansion-panel>
        }
      </mat-accordion>
    } @else {
      <p class="secundario">Todavía no hay ninguno analizado.</p>
    }
  `,
  styles: `
    .formulario {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }
    .url {
      flex: 1 1 24rem;
    }
    .secundario {
      color: var(--mat-sys-on-surface-variant);
      max-width: 50rem;
    }
    .error {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--mat-sys-error);
    }
    mat-accordion {
      display: block;
      margin-top: 1rem;
    }
    .cabecera {
      padding-block: 0.7rem;
    }
    .cabecera mat-panel-title {
      flex: 1 1 55%;
      line-height: 1.3;
    }
    .cabecera mat-panel-description {
      flex: 1 1 45%;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.25rem;
      line-height: 1.3;
    }
  `,
})
export class VideosReferencia {
  readonly slug = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly tareas = inject(TareasService);

  protected readonly url = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly textos = signal<Record<string, string>>({});

  private readonly estructuras = httpResource<EstructuraReferencia[]>(() => {
    this.eventos.version();
    return `/api/canales/${this.slug()}/estructuras`;
  });
  private readonly vistas = conservar(this.estructuras);
  protected readonly lista = computed(() => this.vistas() ?? []);

  private readonly propias = computed(() =>
    this.tareas.tareas().filter((t) => t.herramienta === HERRAMIENTA && t.argumentos['canal'] === this.slug()));
  protected readonly visibles = computed(() => {
    const activas = this.propias().filter((t) => !TERMINADAS.includes(t.estado));
    return activas.length ? activas : this.propias().slice(0, 1);
  });
  protected readonly ocupada = computed(() => this.propias().some((t) => !TERMINADAS.includes(t.estado)));

  protected minutos(s: number): string {
    return `${Math.round(s / 60)} min`;
  }

  protected async analizar(): Promise<void> {
    if (!this.url().trim() || this.ocupada()) return;
    this.error.set(await this.tareas.lanzar(HERRAMIENTA, undefined, { url: this.url().trim(), canal: this.slug() }));
    if (!this.error()) this.url.set('');
  }

  protected async resumir(): Promise<void> {
    const idioma = this.lista()[0]?.idioma ?? '';
    this.error.set(await this.tareas.lanzar(HERRAMIENTA, undefined, { sintesis: true, idioma, canal: this.slug() }));
  }

  protected async abrir(id: string): Promise<void> {
    if (this.textos()[id]) return;
    const r = await firstValueFrom(this.http.get<{ texto: string }>(`/api/canales/${this.slug()}/estructuras/${id}`));
    this.textos.update((t) => ({ ...t, [id]: r.texto }));
  }
}
