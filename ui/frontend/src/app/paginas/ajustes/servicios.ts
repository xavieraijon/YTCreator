import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSlideToggle } from '@angular/material/slide-toggle';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../../core/errores';
import { CuotasService } from '../../core/cuotas.service';
import { ServiciosService } from '../../core/servicios.service';
import { ConectarServicio } from './conectar-servicio';
import { Capacidad, ClaveServicio, DatosServicios, Servicio } from './modelos';

const TIPO: Record<Servicio['tipo'], string> = { gratis: 'Gratis', pago: 'De pago', local: 'En este ordenador', incluido: 'Incluido' };
/** Lo que se hace si ningún servicio cubre una parte (bloque B: ninguno es obligatorio). */
const SIN_SERVICIO: Record<Capacidad, string> = {
  imagen: 'Ninguno: subirás tus imágenes',
  voz: 'Ninguno: subirás tu locución',
  musica: 'Ninguno: subirás tu música (o el vídeo irá sin ella)',
  sincronia: 'Aproximada, sin servicios (por los silencios de la voz)',
};
/** Servicios con prueba gratuita (app/probar_claves.py). */
const CON_PRUEBA = ['cloudflare', 'azure', 'ai33', 'gemini', 'local'];

/**
 * Ajustes → Servicios: el usuario elige qué servicios usa y ninguno es obligatorio (bloque B de docs/plan-mejoras-usuario.md).
 * Las claves se guardan en local, solo se piden las de los servicios que se usan y no se vuelven a mostrar.
 */
@Component({
  selector: 'app-ajustes-servicios',
  imports: [FormsModule, MatButton, MatIcon, MatSlideToggle, ConectarServicio],
  template: `
    <section class="bloque">
      <h2>Servicios</h2>
      <p class="secundario">
        Elige los que quieras usar. Ninguno es obligatorio: lo que no haga ningún servicio lo puedes subir tú (imágenes,
        locución y música). Claude, que investiga y escribe, se conecta en la pestaña «IA (Claude)».
      </p>

      @if (datos.value(); as d) {
        @if (sinNada(d)) {
          <div class="tarjeta primer" role="status">
            <strong>Aún no has conectado ningún servicio.</strong>
            <p class="secundario">Puedes conectar el que prefieras (más abajo) o seguir sin ninguno y subir tú tus imágenes, tu locución y tu música.</p>
          </div>
        }
        <dl class="tarjeta resumen" aria-label="Qué hará cada parte">
          @for (c of capacidades(d); track c.id) {
            <div>
              <dt>{{ c.nombre }}</dt>
              <dd [class.secundario]="!c.servicios.length">{{ c.servicios.length ? c.servicios.join(' · ') : sinServicio[c.id] }}</dd>
            </div>
          }
        </dl>

        <div class="claves">
          @for (s of d.servicios; track s.id) {
            <article class="clave tarjeta" [class.clave--apagada]="!s.activo">
              <div class="clave__cabeza">
                <span class="servicio__titulo">
                  <strong>{{ s.nombre }}</strong>
                  <span class="etiqueta">{{ tipo[s.tipo] }}</span>
                </span>
                <mat-slide-toggle [checked]="s.activo" [disabled]="eligiendo() === s.id" (change)="elegir(s, $event.checked)"
                                  [attr.aria-label]="'Usar ' + s.nombre">Usar</mat-slide-toggle>
              </div>
              <p class="servicio__hace">
                @for (c of s.hace; track c) { <span class="chip">{{ d.capacidades[c] }}</span> }
              </p>
              <p class="secundario servicio__texto">{{ s.descripcion }}</p>

              @if (s.activo) {
                @if (!s.conectado) {
                  <p class="aviso" role="status"><mat-icon>info</mat-icon>{{ s.claves.length ? 'Falta guardar su clave para poder usarlo.' : 'No está instalado en este ordenador.' }}</p>
                }
                @for (c of s.claves; track c.clave) {
                  <form class="clave__campo" (ngSubmit)="guardar(c)">
                    <label [for]="'k-' + c.clave">{{ c.texto }}</label>
                    <div class="clave__fila">
                      <input [id]="'k-' + c.clave" type="password" [name]="c.clave" [(ngModel)]="valores[c.clave]" autocomplete="off"
                             [placeholder]="c.rellena ? '•••••••• (escribe para cambiarla)' : 'Pega aquí la clave'" />
                      <button mat-stroked-button type="submit" [disabled]="!(valores[c.clave] ?? '').trim() || guardando() === c.clave">Guardar</button>
                    </div>
                    <small class="secundario">Dónde conseguirla: {{ c.ayuda }}</small>
                    @if (errores()[c.clave]; as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
                  </form>
                }
                @if (s.id === 'local' && !s.conectado) {
                  <p class="secundario">Se instala una vez, en una terminal, desde la carpeta de YTCreator (descarga unos 16 GB):</p>
                  <pre><code>{{ instalarLocal }}</code></pre>
                }
                @if (conPrueba(s)) {
                  <div class="acciones">
                    <button mat-stroked-button type="button" [disabled]="probandoServicio() === s.id" (click)="probarServicio(s.id)">
                      <mat-icon>{{ probandoServicio() === s.id ? 'sync' : 'bolt' }}</mat-icon>Probar
                    </button>
                    <span class="secundario">Gratis: no genera nada ni gasta créditos.</span>
                  </div>
                }
                @if (pruebas()[s.id]; as r) {
                  <p class="resultado" [class.resultado--mal]="!r.ok" role="status"><mat-icon>{{ r.ok ? 'check_circle' : 'warning' }}</mat-icon>{{ r.mensaje }}</p>
                }
              }
            </article>
          }
        </div>
        <app-conectar-servicio (cambiado)="releer()" />
        @if (errorEleccion(); as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
      } @else if (datos.error()) {
        <p class="error"><mat-icon>warning</mat-icon>No se pudieron leer los servicios.</p>
      } @else {
        <p class="secundario">Cargando…</p>
      }
    </section>
  `,
  styleUrl: './ajustes.scss',
  styles: `
    .primer { margin: 0.85rem 0 0; padding: 0.8rem 1.15rem; }
    .primer p { margin: 0.25rem 0 0; }
    .resumen { margin: 0.85rem 0 0; padding: 0.4rem 1.15rem; }
    .resumen div { display: grid; grid-template-columns: minmax(7rem, 12rem) 1fr; gap: 0.75rem; padding: 0.5rem 0; border-top: 1px solid var(--ay-borde); }
    .resumen div:first-child { border-top: 0; }
    .resumen dt { color: var(--ay-tenue); }
    .resumen dd { margin: 0; font-weight: 600; }
    .resumen dd.secundario { font-weight: 400; }
    .clave--apagada { background: transparent; }
    .servicio__titulo { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .servicio__hace { display: flex; gap: 0.35rem; flex-wrap: wrap; margin: 0; }
    .servicio__texto { margin: 0; }
    .chip { font-size: 0.75rem; padding: 0.1rem 0.55rem; border-radius: 99px; background: var(--ay-acento-suave); color: var(--ay-acento-fuerte); }
    .aviso { display: flex; gap: 0.4rem; align-items: center; margin: 0; color: var(--ay-aviso); }
    pre { margin: 0; padding: 0.6rem 0.8rem; overflow-x: auto; border-radius: var(--ay-radio-peq); background: var(--ay-superficie-2, rgba(127, 127, 127, 0.12)); }
    pre code { background: none; padding: 0; white-space: pre; }
  `,
})
export class AjustesServicios {
  private readonly http = inject(HttpClient);
  private readonly cuotas = inject(CuotasService);
  private readonly servicios = inject(ServiciosService);
  protected readonly datos = httpResource<DatosServicios>(() => '/api/servicios');
  protected readonly tipo = TIPO;
  protected readonly sinServicio = SIN_SERVICIO;
  protected readonly instalarLocal = [
    '/opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .venv-local',
    'PIP_CACHE_DIR=modelos/pip-cache .venv-local/bin/pip install mflux==0.20.0',
    '.venv-local/bin/python herramientas/motor_local.py --preparar',
  ].join('\n');
  protected readonly probandoServicio = signal<string | null>(null);
  protected readonly pruebas = signal<Record<string, { ok: boolean; mensaje: string }>>({});
  protected valores: Record<string, string> = {};
  protected readonly guardando = signal<string | null>(null);
  protected readonly errores = signal<Record<string, string>>({});
  protected readonly eligiendo = signal<string | null>(null);
  protected readonly errorEleccion = signal<string | null>(null);

  /** Cada parte (imágenes, voz, música, sincronía) con los nombres de los servicios que la harán. */
  protected readonly capacidades = (d: DatosServicios) =>
    (Object.keys(d.capacidades) as Capacidad[]).map((id) => ({
      id,
      nombre: d.capacidades[id],
      servicios: d.resumen[id].map((sid) => d.servicios.find((s) => s.id === sid)?.nombre ?? sid),
    }));

  protected conPrueba(s: Servicio): boolean {
    return CON_PRUEBA.includes(s.id);
  }

  /** Ninguna parte tiene servicio (ni siquiera la música incluida): primer arranque. */
  protected sinNada(d: DatosServicios): boolean {
    return (Object.keys(d.capacidades) as Capacidad[]).every((c) => !d.resumen[c].length);
  }

  protected releer(): void {
    this.datos.reload();
    void this.cuotas.releer();
    this.servicios.releer();
  }

  /** Usar o dejar de usar un servicio. Las claves guardadas no se borran: al volver a usarlo, siguen ahí. */
  protected async elegir(s: Servicio, activo: boolean): Promise<void> {
    this.eligiendo.set(s.id);
    this.errorEleccion.set(null);
    try {
      const d = await firstValueFrom(this.http.put<DatosServicios>(`/api/servicios/${s.id}`, { activo }));
      this.datos.set(d);
      void this.cuotas.releer();              // la cabecera deja de enseñar (o vuelve a enseñar) su cuota
      this.servicios.releer();                // y las pantallas, sus botones
    } catch (e) {
      this.errorEleccion.set(mensajeError(e));
      this.datos.reload();
    } finally {
      this.eligiendo.set(null);
    }
  }

  protected async probarServicio(servicio: string): Promise<void> {
    this.probandoServicio.set(servicio);
    try {
      const r = await firstValueFrom(this.http.post<{ ok: boolean; mensaje: string }>(`/api/ajustes/probar/${servicio}`, {}));
      this.pruebas.update((x) => ({ ...x, [servicio]: r }));
    } catch (e) {
      this.pruebas.update((x) => ({ ...x, [servicio]: { ok: false, mensaje: mensajeError(e) } }));
    } finally {
      this.probandoServicio.set(null);
    }
  }

  protected async guardar(c: ClaveServicio): Promise<void> {
    this.guardando.set(c.clave);
    this.errores.update((e) => ({ ...e, [c.clave]: '' }));
    try {
      await firstValueFrom(this.http.put('/api/ajustes/clave', { clave: c.clave, valor: (this.valores[c.clave] ?? '').trim() }));
      this.valores[c.clave] = '';
      this.datos.reload();
      void this.cuotas.releer();
      this.servicios.releer();
    } catch (e) {
      this.errores.update((x) => ({ ...x, [c.clave]: mensajeError(e) }));
    } finally {
      this.guardando.set(null);
    }
  }
}
