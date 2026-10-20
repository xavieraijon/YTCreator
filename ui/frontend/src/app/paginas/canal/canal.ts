import { HttpClient, httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Component, inject, input, signal } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';

import { Markdown } from '../../compartido/markdown';
import { TablaVideos } from '../../compartido/tabla-videos';
import { VideosReferencia } from './videos-referencia';
import { conservar } from '../../compartido/conservar';
import { NuevoVideoService } from '../../compartido/nuevo-video';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { EventosService } from '../../core/eventos.service';
import { CanalDetalle, VideoResumen } from '../../core/modelos';
import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';

@Component({
  selector: 'app-canal',
  imports: [MatButton, MatIcon, MatExpansionModule, MatProgressBar, RouterLink, FormsModule, DatePipe, Markdown, TablaVideos, VideosReferencia],
  template: `
    <nav class="miga"><a routerLink="/canales">Canales</a> <span>/</span></nav>
    @if (canal.error()) {
      <p>Ese canal no existe.</p>
    } @else if (canalVistos(); as c) {
      <span class="antetitulo">Canal</span>
      <h1>
        {{ c.nombre }}
        @if (c.activo) {
          <span class="etiqueta etiqueta--ok">Activo</span>
        } @else if (c.archivado) {
          <span class="etiqueta">Archivado</span>
        }
        @if (c.rapido) {
          <span class="etiqueta etiqueta--acento">Sin nombre</span>
        }
      </h1>
      @if (c.rapido && !c.archivado) {
        <form class="tarjeta basico convertir" (ngSubmit)="convertir(c.slug)">
          <label for="nombre-canal">Convertir en canal</label>
          <small class="secundario">
            Este canal rápido usa el estilo, la voz y la música de fábrica. Ponle un nombre (aunque sea provisional) y el
            Asistente te ayudará a darle identidad propia paso a paso: tema, estilo, voz y marca. Los vídeos que ya has hecho
            se quedan en él.
          </small>
          <input id="nombre-canal" name="nombreCanal" [(ngModel)]="nombreCanal" placeholder="Ej.: Misterios del Mar" autocomplete="off" />
          <div class="acciones">
            <button mat-flat-button type="submit" [disabled]="convirtiendo() || nombreCanal.trim().length < 2">
              <mat-icon>auto_awesome</mat-icon>Convertir en canal
            </button>
          </div>
          @if (errorConvertir()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorConvertir() }}</p> }
        </form>
      } @else if (c.fase_creacion) {
        <p class="aviso-creacion secundario">
          <mat-icon>info</mat-icon>
          <span>Al canal aún le falta identidad propia ({{ c.creacion }}). <a routerLink="/asistente">Sigue en el Asistente</a>.</span>
        </p>
      }
      <p class="secundario">
        {{ c.slug }}
        @if (c.url) {
          · <a [href]="c.url" target="_blank" rel="noopener">YouTube</a>
        }
        @if (c.pendientes) {
          · {{ c.pendientes }} campos sin rellenar
        }
      </p>

      <div class="titular">
        <h2>Vídeos y Shorts</h2>
        @if (!c.archivado) {
          <button mat-flat-button type="button" (click)="nuevo.abrir(c.slug, c.nombre)">
            <mat-icon>add</mat-icon>Nuevo vídeo
          </button>
        }
      </div>
      <app-tabla-videos [agrupar]="true" [videos]="videosVistos() ?? []" />

      @if (!c.archivado) {
        <app-videos-referencia [slug]="c.slug" />
      }

      @if (!c.archivado) {
        <section class="ajustes-canal">
          <h2>Ajustes del canal</h2>
          <form class="tarjeta basico" (ngSubmit)="guardar(c.slug)">
            <label for="nombre">Nombre del canal</label>
            <input id="nombre" name="nombre" [(ngModel)]="nombre" [placeholder]="c.nombre" autocomplete="off" />
            <label for="url">Enlace de YouTube</label>
            <input id="url" name="url" [(ngModel)]="url" [placeholder]="c.url ?? 'https://www.youtube.com/@tucanal'" autocomplete="off" />
            <div class="acciones">
              <button mat-flat-button type="submit" [disabled]="guardando() || (!nombre.trim() && !url.trim())">Guardar</button>
              @if (guardado()) { <span class="secundario"><mat-icon>check_circle</mat-icon>Guardado</span> }
            </div>
            @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
          </form>
          <form class="tarjeta basico" (ngSubmit)="pedirCambio(c)">
            <label for="cambio">Pedir otro cambio a Claude</label>
            <small class="secundario">La voz, el estilo de las imágenes, el tono, las reglas del guion… tocan varios archivos y fichas: Claude
              lo cambia en todos y te explica qué ha hecho. Lo verás en «Actividad».</small>
            <textarea id="cambio" name="cambio" rows="3" [(ngModel)]="cambio" placeholder="Ej.: quiero una voz más grave y pausada; o: las imágenes más oscuras, estilo grabado"></textarea>
            <div class="acciones">
              <button mat-stroked-button type="submit" [disabled]="enviando() || cambio.trim().length < 5"><mat-icon>auto_awesome</mat-icon>Pedírselo a Claude</button>
              @if (enviado()) { <span class="secundario"><mat-icon>check_circle</mat-icon>Enviado: te avisamos al terminar</span> }
            </div>
          </form>
        </section>
      }

      @if (papelera.value()?.length) {
        <details class="papelera tarjeta">
          <summary><mat-icon>delete</mat-icon>Papelera ({{ papelera.value()!.length }})</summary>
          <p class="secundario">Los vídeos que has movido a la papelera. No se borran: puedes devolverlos a su sitio.</p>
          <ul>
            @for (p of papelera.value(); track p.nombre) {
              <li>
                <span><strong>{{ p.titulo }}</strong> <small class="secundario">desde el {{ p.borrado | date: 'd MMM, HH:mm' }}</small></span>
                <button mat-button type="button" (click)="restaurar(c.slug, p.nombre)"><mat-icon>restore_from_trash</mat-icon>Restaurar</button>
              </li>
            }
          </ul>
          @if (errorPapelera()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorPapelera() }}</p> }
        </details>
      }

      @if (c.ficha) {
        <mat-accordion>
          <mat-expansion-panel class="ficha tarjeta">
            <mat-expansion-panel-header>
              <mat-panel-title>Ficha del canal</mat-panel-title>
            </mat-expansion-panel-header>
            <app-markdown [texto]="c.ficha" />
          </mat-expansion-panel>
        </mat-accordion>
      }
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
  styles: `
    h1 {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .titular {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .ficha {
      margin-top: 2rem;
    }
    .ajustes-canal { margin-top: 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem; align-items: start; }
    .ajustes-canal h2 { grid-column: 1 / -1; margin: 0; }
    .basico { display: flex; flex-direction: column; gap: 0.45rem; padding: 1.1rem 1.2rem; }
    .basico label { font-weight: 600; font-size: 0.9rem; }
    .basico input, .basico textarea { font: inherit; padding: 0.55rem 0.7rem; border: 1px solid var(--ay-borde-fuerte); border-radius: var(--ay-radio-peq); background: var(--ay-fondo); color: var(--ay-tinta); }
    .acciones { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.3rem; }
    .acciones .secundario, .error { display: inline-flex; align-items: center; gap: 0.3rem; }
    .error { color: var(--ay-error); }
    .convertir { margin: 1rem 0 1.5rem; max-width: 40rem; }
    .aviso-creacion { display: flex; align-items: center; gap: 0.4rem; }
    .papelera { margin-top: 1.5rem; padding: 0.9rem 1.2rem; }
    .papelera summary { cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-weight: 600; }
    .papelera ul { list-style: none; padding: 0; margin: 0.5rem 0 0; }
    .papelera li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; border-top: 1px solid var(--ay-borde); }
  `,
})
export class CanalPagina {
  readonly slug = input.required<string>();
  private readonly eventos = inject(EventosService);
  private readonly http = inject(HttpClient);
  private readonly avisos = inject(AvisosService);

  private readonly router = inject(Router);

  protected nombre = '';
  protected nombreCanal = '';
  protected url = '';
  protected cambio = '';
  protected readonly guardando = signal(false);
  protected readonly guardado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly errorPapelera = signal<string | null>(null);
  protected readonly convirtiendo = signal(false);
  protected readonly errorConvertir = signal<string | null>(null);

  protected readonly papelera = httpResource<{ nombre: string; carpeta: string; titulo: string; borrado: string | null }[]>(() => {
    this.eventos.version();
    return `/api/canales/${this.slug()}/papelera`;
  });

  protected async guardar(slug: string): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    this.guardado.set(false);
    const cuerpo: Record<string, string> = {};
    if (this.nombre.trim()) cuerpo['nombre'] = this.nombre;
    if (this.url.trim()) cuerpo['url'] = this.url;
    try {
      await firstValueFrom(this.http.patch(`/api/canales/${slug}`, cuerpo));
      this.nombre = '';
      this.url = '';
      this.guardado.set(true);
      this.eventos.refrescar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  /** El resto de cambios (voz, estilo, reglas) los hace Claude en el chat del asistente, que conoce todos los archivos del canal. */
  protected async pedirCambio(c: CanalDetalle): Promise<void> {
    this.enviando.set(true);
    this.avisos.pedirPermiso();
    // Se ve en el chat como mensaje del usuario: en su idioma. Claude sabe por su cuenta qué archivos y fichas tocar.
    const mensaje = `Quiero cambiar esto en el canal «${c.nombre}»: ${this.cambio.trim()}\n` +
      'Aplícalo en todo lo que toque del canal. Si hace falta probar algo de pago, dime antes el coste y espera. ' +
      'Al terminar, explícame en 2-3 líneas qué has cambiado.';
    try {
      // canal: este, no el activo (la ficha puede verse desde un canal que no lo es).
      await firstValueFrom(this.http.post('/api/asistente/claude', { mensaje, canal: c.slug }));
      this.cambio = '';
      this.enviado.set(true);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  /** Canal rápido → canal propio: cambia de carpeta (y de dirección), así que se abre la página nueva. */
  protected async convertir(slug: string): Promise<void> {
    this.convirtiendo.set(true);
    this.errorConvertir.set(null);
    try {
      const c = await firstValueFrom(this.http.post<{ slug: string }>(`/api/canales/${slug}/convertir`, { nombre: this.nombreCanal }));
      this.nombreCanal = '';
      this.eventos.refrescar();
      await this.router.navigate(['/canales', c.slug]);
    } catch (e) {
      this.errorConvertir.set(mensajeError(e));
    } finally {
      this.convirtiendo.set(false);
    }
  }

  protected async restaurar(slug: string, nombre: string): Promise<void> {
    this.errorPapelera.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/canales/${slug}/papelera/${encodeURIComponent(nombre)}/restaurar`, {}));
      this.eventos.refrescar();
    } catch (e) {
      this.errorPapelera.set(mensajeError(e));
    }
  }
  protected readonly nuevo = inject(NuevoVideoService);

  protected readonly canal = httpResource<CanalDetalle>(() => {
    this.eventos.version();
    return `/api/canales/${this.slug()}`;
  });
  protected readonly canalVistos = conservar(this.canal);

  protected readonly videos = httpResource<VideoResumen[]>(() => {
    this.eventos.version();
    return { url: '/api/videos', params: { canal: this.slug() } };
  });
  protected readonly videosVistos = conservar(this.videos);
}
