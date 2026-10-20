import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';

import { firstValueFrom } from 'rxjs';

import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';
import { EventosService } from '../../core/eventos.service';
import { AltaCanal, DatosCrearCanal } from '../../core/modelos';
import { TareasService } from '../../core/tareas.service';
import { urlMuestra } from './paso-voz';

/** Paso 9 de la creación del canal: la imagen del canal (avatar y banner) y los textos para darlo de alta en YouTube. */
@Component({
  selector: 'app-paso-alta',
  imports: [FormsModule, MatButton, MatIcon, MatProgressBar, TarjetaTarea],
  template: `
    @let d = datos();
    @let a = alta();
    <span class="antetitulo">Paso {{ numero() }} de {{ d.pasos.length }}</span>
    <h2 class="titulo">Imagen del canal y alta en YouTube</h2>
    @if (d.concepto; as c) { <p class="secundario"><mat-icon>check</mat-icon>{{ c.nombre }}: {{ c.promesa }}</p> }

    @if (d.trabajo.estado === 'pensando') {
      <div class="trabajando tarjeta">
        <mat-progress-bar mode="indeterminate" />
        <p><strong>Estamos escribiendo los textos de tu canal</strong></p>
        <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo lo que has elegido hasta ahora…' }}</p>
        <p class="secundario">Suele tardar 1-2 minutos. Puedes dejar esta pantalla: avisaremos al terminar.</p>
      </div>
    } @else if (a.prueba; as p) {
      <p class="intro">Con estos textos creas el canal en YouTube. Cada uno tiene su botón para copiarlo.</p>
      <div class="textos">
        @for (t of textos(); track t.etiqueta) {
          <section class="tarjeta texto">
            <span class="texto__etiqueta">{{ t.etiqueta }}</span>
            <span class="texto__valor">{{ t.valor }}</span>
            <button mat-button type="button" (click)="copiar(t.valor)"><mat-icon>content_copy</mat-icon>Copiar</button>
          </section>
        }
      </div>

      <h3>Avatar y banner</h3>
      @if (tareaActiva(); as t) {
        <app-tarjeta-tarea [tarea]="t" />
      } @else {
        @if (a.avatar || a.banner) {
          <div class="imagenes">
            @if (a.avatar) { <img class="avatar" [src]="url(a.avatar)" alt="Avatar del canal" /> }
            @if (a.banner) { <img class="banner" [src]="url(a.banner)" alt="Banner del canal" /> }
          </div>
        }
        <div class="acciones">
          <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="generar()">
            <mat-icon>image</mat-icon>{{ a.avatar ? 'Rehacer avatar y banner' : 'Crear avatar y banner' }}
          </button>
        </div>
        <p class="secundario">Se hacen con la tipografía y los colores que elegiste. No cuesta nada.</p>
      }

      <h3>Ya creado en YouTube</h3>
      <label class="campo">
        <span>Pega aquí la dirección de tu canal (youtube.com/@…)</span>
        <input type="url" [(ngModel)]="direccion" placeholder="https://www.youtube.com/@tucanal" />
      </label>
      @if (aviso()) { <p class="aviso"><mat-icon>info</mat-icon>{{ aviso() }}</p> }
      @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado() || !direccion.trim() || !!tareaActiva()" (click)="confirmar()">
          Comprobar y seguir<mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
        <button mat-button type="button" [disabled]="ocupado()" (click)="saltar()">Lo haré más tarde</button>
        <button mat-stroked-button type="button" (click)="otraVez.set(true)"><mat-icon>autorenew</mat-icon>Pedir otros textos</button>
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Hablar con el asistente</button>
      </div>
    }
    @if (!a.prueba || otraVez()) {
      <p class="intro">
        Escribiremos el nombre tal como irá en YouTube, la descripción del canal, las palabras clave y la categoría.
      </p>
      <label class="campo">
        <span>¿Algo que quieras que tenga en cuenta? (opcional)</span>
        <textarea rows="3" maxlength="600" [(ngModel)]="indicaciones"
                  placeholder="Por ejemplo: que la descripción hable de un vídeo nuevo cada semana…"></textarea>
      </label>
      @if (a.error || error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() ?? a.error }}</p> }
      <div class="acciones">
        <button mat-flat-button type="button" [disabled]="ocupado()" (click)="proponer()">
          <mat-icon>edit_note</mat-icon>{{ ocupado() ? 'Enviando…' : 'Escribir los textos' }}
        </button>
        @if (otraVez()) { <button mat-button type="button" (click)="otraVez.set(false)">Volver a lo que había</button> }
        <button mat-button type="button" (click)="hablar.emit()"><mat-icon>chat</mat-icon>Prefiero hablarlo con el asistente</button>
      </div>
    }
    <details class="mas">
      <summary>Cómo se crea el canal en YouTube</summary>
      <p>
        Entra en YouTube con tu cuenta, pulsa tu foto, «Crear un canal», y pega el nombre y la descripción. Sube el
        avatar y el banner desde «Personalizar canal». Después copia la dirección del canal y pégala aquí: comprobamos que existe.
      </p>
    </details>
  `,
  styleUrls: ['../video/fase-guiada.scss'],
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.75rem; }
    .titulo { margin: 0.2rem 0 0; font-size: 1.4rem; }
    h3 { margin: 0.6rem 0 0; font-size: 1.05rem; }
    .textos { display: flex; flex-direction: column; gap: 0.5rem; max-width: 46rem; }
    .texto { display: grid; grid-template-columns: 9rem 1fr auto; gap: 0.75rem; align-items: start; }
    .texto__etiqueta { font-weight: 600; }
    .texto__valor { white-space: pre-wrap; overflow-wrap: anywhere; }
    .imagenes { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .avatar { width: 7rem; height: 7rem; border-radius: 50%; object-fit: cover; }
    .banner { max-width: 28rem; width: 100%; border-radius: var(--ay-radio-peq); }
    .campo { display: flex; flex-direction: column; gap: 0.35rem; max-width: 44rem; font-weight: 600; }
    .campo input, .campo textarea {
      font: inherit; font-weight: 400; padding: 0.6rem 0.75rem; border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2); color: var(--ay-tinta); resize: vertical;
    }
    @media (max-width: 40rem) { .texto { grid-template-columns: 1fr; } }
  `,
})
export class PasoAlta {
  readonly datos = input.required<DatosCrearCanal>();
  readonly numero = input.required<number>();
  readonly hablar = output<void>();
  readonly cambio = output<void>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);
  private readonly tareas = inject(TareasService);

  protected readonly alta = computed<AltaCanal>(() => this.datos().alta!);
  protected indicaciones = '';
  protected direccion = '';
  protected readonly otraVez = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);

  protected readonly textos = computed(() => {
    const p = this.alta().prueba;
    if (!p) return [];
    return [
      { etiqueta: 'Nombre', valor: p.nombre },
      { etiqueta: 'Identificador', valor: '@' + p.arroba },
      { etiqueta: 'Descripción', valor: p.descripcion },
      { etiqueta: 'Palabras clave', valor: p.palabras_clave.join(', ') },
      { etiqueta: 'Categoría', valor: p.categoria },
      { etiqueta: 'Público', valor: p.audiencia },
    ];
  });

  protected readonly tareaActiva = computed(() => {
    const slug = this.datos().creacion?.slug;
    return this.tareas.activas().find((t) => t.herramienta === 'marca_alta' && t.canal === slug) ?? null;
  });

  constructor() {
    effect(() => {
      const i = this.alta().indicaciones;
      if (i && !this.indicaciones) this.indicaciones = i;
    });
    let activa = false;
    effect(() => {
      const ahora = !!this.tareaActiva();
      if (activa && !ahora) this.cambio.emit();
      activa = ahora;
    });
  }

  protected url(ruta: string): string { return urlMuestra(ruta); }

  protected copiar(texto: string): void {
    void navigator.clipboard?.writeText(texto);
  }

  protected async proponer(): Promise<void> {
    this.avisos.pedirPermiso();
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/alta/proponer', { indicaciones: this.indicaciones, otros: false }));
      this.otraVez.set(false);
      this.cambio.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async generar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(await this.tareas.lanzar('marca_alta', undefined, { canal: this.datos().creacion?.slug }));
    this.ocupado.set(false);
    this.cambio.emit();
  }

  protected async confirmar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    this.aviso.set(null);
    try {
      const r = await firstValueFrom(this.http.post<{ ok: boolean; resultado: { nombre: string; coincide: boolean } }>(
        '/api/asistente/canal/alta/confirmar', { url: this.direccion.trim() }));
      if (r.resultado && !r.resultado.coincide) this.aviso.set(`El canal se llama «${r.resultado.nombre}», distinto del elegido; lo hemos anotado igualmente.`);
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async saltar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/asistente/canal/alta/saltar', {}));
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
