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
import { DatosCrearCanal, ReglasCanal } from '../../core/modelos';

/** Paso 7 de la creación del canal: Claude deja escritas las reglas del canal y razona las dos preguntas de YouTube
 * (contenido sintético y afiliación); el usuario las confirma con un clic. */
@Component({
  selector: 'app-paso-reglas',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar],
  template: `
    @let d = datos();
    @let r = reglas();
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">Reglas del canal y lo que hay que declarar en YouTube</h2>
    @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }

    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos escribiendo las reglas de tu canal</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 2-3 minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (r.prueba; as p) {
      <p class="intro">Estas son las reglas que hemos dejado escritas para tu canal. Las dos preguntas de abajo las respondes tú.</p>
      @if (p.resumen.length) {
        <ul class="datos">@for (x of p.resumen; track x) { <li>{{ x }}</li> }</ul>
      }
      @if (p.licencias) { <p class="secundario"><mat-icon>copyright</mat-icon>Licencias: {{ p.licencias }}</p> }

      <section class="tarjeta pregunta">
        <strong>¿Hay que avisar a YouTube de que el contenido es sintético?</strong>
        <span class="opcion__porque">{{ p.sintetico.motivo }}</span>
        <div class="si-no">
          <button mat-stroked-button type="button" [class.activo]="sintetico()" (click)="sintetico.set(true)">Sí, avisar</button>
          <button mat-stroked-button type="button" [class.activo]="!sintetico()" (click)="sintetico.set(false)">No hace falta</button>
        </div>
      </section>
      <section class="tarjeta pregunta">
        <strong>¿Habrá enlaces de afiliado?</strong>
        <span class="opcion__porque">{{ p.afiliacion.motivo }}</span>
        <div class="si-no">
          <button mat-stroked-button type="button" [class.activo]="afiliacion()" (click)="afiliacion.set(true)">Sí</button>
          <button mat-stroked-button type="button" [class.activo]="!afiliacion()" (click)="afiliacion.set(false)">No</button>
        </div>
      </section>

      @if (r.pendientes.length) {
        <p class="aviso"><mat-icon>info</mat-icon>Aún no hemos terminado de rellenar {{ r.pendientes.length === 1 ? '1 campo' : r.pendientes.length + ' campos' }} de las fichas. Pídele que los complete antes de seguir.</p>
      }
      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado() || r.pendientes.length > 0" (click)="elegir()">
          Confirmar reglas<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
        <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Pedir cambios</button>
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
      </div>
    }
    @if (!r.prueba || otraVez()) {
      <p class="intro">
        Escribiremos las reglas de guion y de voz de tu canal, de dónde salen la música y las imágenes, y te diremos si
        conviene avisar a YouTube de que hay contenido sintético.
      </p>
      <label class="campo">
        <span>¿Algo que quieras que tenga en cuenta? (opcional)</span>
        <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                  placeholder="Por ejemplo: no quiero cifras largas, ni nombres de personas vivas…"></textarea>
      </label>
      @if (r.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? r.error }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer()">
          <mat-icon>gavel</mat-icon>{{ ocupado() ? 'Enviando…' : 'Escribir las reglas' }}
        </button>
        @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a lo que había</button> }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
      </div>
    }
    <details class="mas">
      <summary>Por qué se pregunta esto</summary>
      <p>
        YouTube pide declarar cuando un vídeo tiene voces o escenas realistas hechas con IA, y quien hace enlaces de afiliado
        tiene que avisarlo. No cuesta nada: lo que contestes se guarda en la ficha del canal y se usa al preparar la
        publicación de cada vídeo.
      </p>
    </details>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    .pregunta { display: flex; flex-direction: column; gap: 0.4rem; max-width: 44rem; }
    .si-no { display: flex; gap: 0.5rem; }
    .si-no .activo { background: var(--ay-acento-suave); border-color: var(--ay-acento); }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .campo textarea {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
  `,
})
export class PasoReglas {
  readonly datos = input.required<DatosCrearCanal>();
  readonly numero = input.required<number>();
  readonly hablar = output<void>();
  readonly cambio = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);

  protected readonly reglas = computed<ReglasCanal>(() => this.datos().reglas!);
  protected indicaciones = '';
  protected readonly otraVez = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sintetico = signal(false);
  protected readonly afiliacion = signal(false);

  constructor() {
    effect(() => {
      const i = this.reglas().indicaciones;
      if (i && !this.indicaciones) this.indicaciones = i;
    });
    // Lo que Claude recomienda queda marcado de partida; el usuario lo cambia con un clic.
    effect(() => {
      const p = this.reglas().prueba;
      if (p) { this.sintetico.set(p.sintetico.respuesta); this.afiliacion.set(p.afiliacion.respuesta); }
    });
  }

  protected async proponer(): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/reglas/proponer', { indicaciones: this.indicaciones, otros: false }));
      this.otraVez.set(false);
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
      await firstValueFrom(this.http.post('/api/asistente/canal/reglas/elegir', { sintetico: this.sintetico(), afiliacion: this.afiliacion() }));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
