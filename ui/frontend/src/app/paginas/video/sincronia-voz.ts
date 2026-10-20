import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../../core/errores';

interface DatosSincronia {
  elegida: 'exacta' | 'aproximada' | null;
  efectiva: 'exacta' | 'aproximada';
  exacta_posible: boolean;
}

/**
 * Cómo se sincroniza la voz con el texto en este vídeo (dónde cae cada imagen y cada subtítulo), para las voces que no lo
 * dan solas: exacta (con un servicio) o aproximada (sin servicios). Bloque B de docs/plan-mejoras-usuario.md.
 */
@Component({
  selector: 'app-sincronia-voz',
  imports: [MatIcon, RouterLink],
  template: `
    @if (datos.value(); as d) {
      <fieldset class="sincronia">
        <legend>Sincronía de la voz con el texto</legend>
        <label class="opcion" [class.opcion--activa]="d.efectiva === 'exacta'" [class.opcion--apagada]="!d.exacta_posible">
          <input type="radio" name="sincronia" value="exacta" [checked]="d.efectiva === 'exacta'" [disabled]="!d.exacta_posible || ocupado()"
                 (change)="elegir('exacta')" />
          <span><strong>Exacta</strong>
            <small>El momento de cada palabra, medido. Subtítulos y cambios de imagen al instante justo.</small>
            @if (d.exacta_posible) { <small class="servicio">Servicio: Azure Speech</small> }
            @else { <small>Necesita un servicio de sincronía: <a routerLink="/ajustes/servicios">actívalo en Ajustes</a>.</small> }
          </span>
        </label>
        <label class="opcion" [class.opcion--activa]="d.efectiva === 'aproximada'">
          <input type="radio" name="sincronia" value="aproximada" [checked]="d.efectiva === 'aproximada'" [disabled]="ocupado()"
                 (change)="elegir('aproximada')" />
          <span><strong>Aproximada</strong>
            <small>Sin servicios: se calcula con los silencios de la voz y el largo de cada palabra. Algo menos precisa, sobre todo en frases largas sin pausas.</small>
          </span>
        </label>
        <p class="nota"><mat-icon>info</mat-icon>Vale para lo que locutes o subas a partir de ahora; lo ya hecho no cambia (ni se vuelve a pagar).</p>
        @if (error(); as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
      </fieldset>
    }
  `,
  styles: `
    .sincronia { border: 1px solid var(--ay-borde); border-radius: var(--ay-radio); padding: 0.9rem 1.1rem; margin: 0; display: grid; gap: 0.5rem; }
    legend { font-weight: 600; padding: 0 0.3rem; }
    .opcion { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.55rem 0.75rem; border: 1px solid var(--ay-borde); border-radius: var(--ay-radio-peq); cursor: pointer; }
    .opcion input { margin-top: 0.25rem; accent-color: var(--ay-acento); }
    .opcion span { display: flex; flex-direction: column; gap: 0.1rem; }
    .opcion small { color: var(--ay-tenue); }
    .opcion--activa { border-color: var(--ay-acento); background: var(--ay-acento-suave); }
    .opcion--apagada { cursor: default; }
    .servicio { font-size: 0.75rem; }
    .nota, .error { display: flex; gap: 0.4rem; align-items: center; margin: 0; font-size: 0.85rem; color: var(--ay-tenue); }
    .nota mat-icon, .error mat-icon { font-size: 1.1rem; width: 1.1rem; height: 1.1rem; }
    .error { color: var(--ay-error); }
  `,
})
export class SincroniaVoz {
  readonly videoId = input.required<number>();
  private readonly http = inject(HttpClient);
  protected readonly datos = httpResource<DatosSincronia>(() => `/api/videos/${this.videoId()}/voz/sincronia`);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async elegir(sincronia: 'exacta' | 'aproximada'): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      this.datos.set(await firstValueFrom(this.http.put<DatosSincronia>(`/api/videos/${this.videoId()}/voz/sincronia`, { sincronia })));
    } catch (e) {
      this.error.set(mensajeError(e));
      this.datos.reload();
    } finally {
      this.ocupado.set(false);
    }
  }
}
