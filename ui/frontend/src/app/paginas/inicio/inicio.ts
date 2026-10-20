import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatAnchor, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { NuevoVideoService } from '../../compartido/nuevo-video';
import { TablaVideos } from '../../compartido/tabla-videos';
import { conservar } from '../../compartido/conservar';
import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { TareasService } from '../../core/tareas.service';
import { ActividadService } from '../../core/actividad.service';
import { AvisosService } from '../../core/avisos.service';
import { mensajeError } from '../../core/errores';
import { CanalesService } from '../../core/canales.service';
import { EventosService } from '../../core/eventos.service';
import { VideoResumen } from '../../core/modelos';
import { EstadoCopia } from '../ajustes/copia';

const ACCIONES: Record<string, string> = {
  A: 'Arrancar el vídeo',
  B: 'Elegir tema y duración',
  C: 'Revisar la investigación',
  D: 'Aprobar la escaleta y el guion',
  E: 'Generar la voz',
  F: 'Revisar las imágenes',
  G: 'Montar el vídeo y revisarlo',
  H: 'Preparar miniatura y publicación',
  I: 'Cerrar el vídeo y subirlo',
  J: 'Registrar la publicación y sus resultados',
};

@Component({
  selector: 'app-inicio',
  imports: [MatAnchor, MatButton, MatIcon, RouterLink, TablaVideos, TarjetaTarea],
  template: `
    @if (canales.activo(); as activo) {
      <header class="portada">
        <span class="antetitulo">{{ fecha() }}</span>
        <h1>{{ saludo() }}. Esto toca hoy.</h1>
        <p class="secundario">
          {{ activo.nombre }}
          @if (activo.rapido) { <span class="etiqueta etiqueta--acento">Canal rápido · valores de fábrica</span> }
          · {{ activo.videos }} {{ activo.videos === 1 ? 'vídeo' : 'vídeos' }} (largos y Shorts)
          @if (activo.pendientes) { · {{ activo.pendientes }} campos del canal sin rellenar }
          · <a [routerLink]="['/canales', activo.slug]">ficha del canal</a>
        </p>
      </header>

      @if (activo.videos && copia.value()?.aviso) {
        <p class="aviso-copia">
          <mat-icon>backup</mat-icon>
          <span>{{ copia.value()?.ultima ? 'Hace más de ' + copia.value()?.dias_aviso + ' días de la última copia de seguridad.' : 'Aún no has hecho ninguna copia de seguridad.' }}
            Las imágenes y voces pagadas solo están en este ordenador.</span>
          <a mat-stroked-button routerLink="/ajustes/equipo">Hacer copia</a>
        </p>
      }

      @if (activo.pendientes || activo.fase_creacion) {
        <section class="siguiente tarjeta">
          <div class="siguiente__texto">
            <span class="etiqueta etiqueta--aviso">Canal sin terminar</span>
            <h2>Termina de crear {{ activo.nombre }}</h2>
            <p class="secundario">
              @if (activo.fase_creacion) { Va por la fase {{ activo.fase_creacion }} de la creación. }
              @if (activo.pendientes) { Le faltan {{ activo.pendientes }} {{ activo.pendientes === 1 ? 'campo' : 'campos' }} por rellenar. }
              Hasta entonces los agentes no tienen con qué trabajar: el asistente sigue donde lo dejaste.
            </p>
            <a mat-flat-button class="siguiente__boton" routerLink="/asistente">Seguir con el asistente</a>
          </div>
        </section>
      } @else if (siguiente(); as p) {
        <section class="siguiente tarjeta">
          <div class="siguiente__texto">
            <span class="etiqueta etiqueta--aviso">Siguiente paso · {{ p.video.titulo || p.video.carpeta }}</span>
            <h2>{{ p.accion }}</h2>
            <p class="secundario">Paso {{ p.paso }} de {{ p.pasos }} · {{ p.fase }}. Un solo paso cada vez: el resto está en la ficha del vídeo.</p>
            <a mat-flat-button class="siguiente__boton" [routerLink]="['/videos', p.video.id]">Continuar con este vídeo</a>
          </div>
          <ul class="siguiente__estado" aria-label="Estado del vídeo">
            @for (e of p.estado; track e.texto) {
              <li>
                <span class="punto" [class]="'punto punto--' + e.nivel"></span>
                {{ e.texto }}
              </li>
            }
          </ul>
        </section>
      } @else {
        <section class="siguiente tarjeta">
          <div class="siguiente__texto">
            <span class="etiqueta etiqueta--acento">Nada en marcha</span>
            <h2>Empieza el siguiente vídeo</h2>
            <p class="secundario">Claude te guía desde la idea hasta la publicación.</p>
            <button mat-flat-button class="siguiente__boton" type="button" (click)="nuevo.abrir(activo.slug, activo.nombre)">Nuevo vídeo</button>
          </div>
        </section>
      }

      <div class="cifras">
        <div class="cifra tarjeta">
          <mat-icon>movie</mat-icon>
          <span class="cifra__valor">{{ enCurso() }}</span>
          <span class="cifra__texto">en producción</span>
        </div>
        <div class="cifra tarjeta">
          <mat-icon>check_circle</mat-icon>
          <span class="cifra__valor">{{ montados() }}</span>
          <span class="cifra__texto">montados</span>
        </div>
        <div class="cifra tarjeta">
          <mat-icon>bolt</mat-icon>
          <span class="cifra__valor">{{ actividad.enMarcha() }}</span>
          <span class="cifra__texto">en marcha (tareas y Claude)</span>
        </div>
      </div>

      @if (tareas.activas().length) {
        <h2>En marcha</h2>
        @for (t of tareas.activas(); track t.id) {
          <app-tarjeta-tarea [tarea]="t" [enlaceVideo]="true" />
        }
      }

      <section>
          <div class="titular">
            <h2>Tus vídeos</h2>
            <button mat-flat-button type="button" (click)="nuevo.abrir(activo.slug, activo.nombre)">
              <mat-icon>add</mat-icon>Nuevo vídeo
            </button>
          </div>
          <app-tabla-videos
            [agrupar]="true"
            [videos]="videosVistos() ?? []"
            vacio="Todavía no hay vídeos. Crea el primero con «Nuevo vídeo»."
          />
      </section>
    } @else if (!canales.cargando() && !canales.error()) {
      @if (canales.canales().length) {
        <section class="bienvenida tarjeta">
          <p class="bienvenida__antetitulo">Ningún canal activo</p>
          <h1>Elige con qué canal trabajar</h1>
          <p>Tienes {{ canales.canales().length }} {{ canales.canales().length === 1 ? 'canal' : 'canales' }}, pero ninguno está activo.</p>
          <div class="bienvenida__acciones">
            <a mat-flat-button routerLink="/canales">Ver los canales</a>
          </div>
        </section>
      } @else {
        <section class="bienvenida tarjeta">
          <p class="bienvenida__antetitulo">Bienvenido a YTCreator</p>
          <h1>Empieza por tu primer canal</h1>
          <p>
            El asistente te guía paso a paso: el nicho, el concepto, el nombre, el estilo visual, la voz y la marca, con muestras reales
            antes de decidir. Después, cada vídeo se produce por fases y tú apruebas en cada punto.
          </p>
          <ol class="bienvenida__pasos">
            <li><strong>Conecta tus servicios</strong> en Ajustes: Claude y las claves de imágenes y voz.</li>
            <li><strong>Crea el canal</strong> con el asistente.</li>
            <li><strong>Produce el primer vídeo</strong>: investigación, guion, imágenes, voz y montaje.</li>
          </ol>
          <div class="bienvenida__acciones">
            <a mat-flat-button routerLink="/asistente"><mat-icon>auto_awesome</mat-icon>Crear mi primer canal</a>
            <button mat-stroked-button type="button" [disabled]="creandoRapido()" (click)="videoRapido()">
              <mat-icon>bolt</mat-icon>{{ creandoRapido() ? 'Preparando…' : 'Vídeo rápido, sin crear canal' }}
            </button>
            <a mat-button routerLink="/ajustes">Revisar Ajustes</a>
          </div>
          <p class="bienvenida__nota">
            ¿Prefieres probar antes? El vídeo rápido usa un estilo, una voz gratuita y una música de fábrica. Más tarde
            puedes convertirlo en tu canal sin perder lo hecho.
          </p>
        </section>
      }
    }
  `,
  styles: `
    .bienvenida {
      max-width: 46rem;
      margin: 2rem auto;
      padding: 2.25rem 2.5rem;

      h1 {
        margin: 0.25rem 0 0.75rem;
        font-size: 1.9rem;
        letter-spacing: -0.03em;
      }

      p:not(.bienvenida__antetitulo) {
        margin: 0;
        line-height: 1.6;
        color: var(--ay-tenue);
      }

      .bienvenida__antetitulo {
        margin: 0;
      }

      &__antetitulo {
        font-size: 0.75rem;
        font-weight: 650;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ay-acento);
      }

      &__pasos {
        margin: 1.25rem 0 0;
        padding-left: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        line-height: 1.5;
      }

      &__acciones {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 1.75rem;
      }

      p.bienvenida__nota {
        margin-top: 1rem;
        font-size: 0.9rem;
      }
    }

    .titular {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .portada {
      margin-bottom: 1.5rem;
    }
    .aviso-copia {
      display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin: 0 0 1rem;
      padding: 0.6rem 0.9rem; border-radius: var(--ay-radio-peq); background: var(--ay-aviso-suave); color: var(--ay-aviso);
    }
    .aviso-copia span { flex: 1; min-width: 14rem; }
    .siguiente {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2rem;
      padding: 2rem;
      margin-bottom: 1.5rem;
      border: 2px solid var(--ay-acento);
      background: var(--ay-acento-suave);
    }
    .siguiente__texto {
      flex: 1 1 22rem;
      min-width: 0;                  /* en móvil no se sale por la derecha (hallazgo 43) */
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .siguiente__texto .etiqueta {
      max-width: 100%;
      white-space: normal;           /* el título del vídeo puede ser largo */
    }
    @media (max-width: 600px) {
      .siguiente { padding: 1.25rem; gap: 1.25rem; }
    }
    .siguiente__texto h2 {
      margin: 0.6rem 0 0;
      font-size: clamp(1.7rem, 2.6vw, 2.3rem);
    }
    .siguiente__texto p {
      margin: 0;
      max-width: 36rem;
      font-size: 1.02rem;
    }
    .siguiente__boton {
      margin-top: 1rem;
      min-height: 3.2rem;
      padding: 0 1.9rem;
      font-size: 1.05rem;
    }
    .siguiente__estado {
      flex: 0 1 18rem;
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .siguiente__estado li {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .punto {
      width: 0.65rem;
      height: 0.65rem;
      border-radius: 50%;
      flex: none;
      background: var(--ay-tenue);
    }
    .punto--ok {
      background: var(--ay-ok);
    }
    .punto--aviso {
      background: var(--ay-aviso);
    }
    .portada h1 {
      font-size: clamp(2.1rem, 3.4vw, 3rem);
    }
    .portada p {
      margin: 0;
    }
    .cifras {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: 1rem;
    }
    .cifra {
      display: flex;
      flex-direction: column;
      padding: 1rem 1.2rem;
    }
    .cifra mat-icon {
      color: var(--ay-acento);
      margin-bottom: 0.6rem;
    }
    .cifra__valor {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .cifra__valor small {
      font-size: 1.1rem;
      color: var(--ay-tenue);
    }
    .cifra__texto {
      margin-top: 0.35rem;
      font-size: 0.82rem;
      color: var(--ay-tenue);
    }
  `,
})
export class Inicio {
  protected readonly canales = inject(CanalesService);
  protected readonly nuevo = inject(NuevoVideoService);
  protected readonly tareas = inject(TareasService);
  protected readonly actividad = inject(ActividadService);
  private readonly eventos = inject(EventosService);
  private readonly avisos = inject(AvisosService);

  protected readonly videos = httpResource<VideoResumen[]>(() => {
    const activo = this.canales.activo();
    this.eventos.version();
    return activo ? { url: '/api/videos', params: { canal: activo.slug } } : undefined;
  });
  protected readonly videosVistos = conservar(this.videos);
  /** Aviso si nunca se ha hecho copia de seguridad o hace más de 7 días (solo con vídeos que perder). */
  protected readonly copia = httpResource<EstadoCopia>(() => '/api/ajustes/copia');

  protected readonly enCurso = computed(
    () => (this.videosVistos() ?? []).filter((v) => v.fase !== 'cerrado' && !v.aparcado).length,
  );
  protected readonly montados = computed(() => (this.videosVistos() ?? []).filter((v) => v.estado_real?.montaje === 'al_dia').length);
  /** El vídeo en marcha más reciente y el paso que le toca, con su estado en semáforo. */
  protected readonly siguiente = computed(() => {
    const v = (this.videosVistos() ?? [])
      .filter((x) => x.fase && x.fase !== 'cerrado' && !x.aparcado)
      // El más avanzado primero (el que antes se puede terminar); a igualdad, el tocado más recientemente.
      .sort((a, b) => b.completadas.length - a.completadas.length || b.modificado.localeCompare(a.modificado))[0];
    if (!v) return null;
    const e = v.estado_real;
    // Lo que ya estaba hecho y ha cambiado va primero: no se sigue adelante sobre algo desactualizado.
    const accion = e?.avisos.length
      ? `Poner al día: ${e.vista_nombre}`
      : v.tipo === 'largo' && v.fase === 'G' && e?.montaje === 'al_dia'
        ? 'Revisar el vídeo montado'
        : ((v.tipo === 'largo' ? ACCIONES[v.fase!] : undefined) ?? `Continuar: ${v.fase_nombre ?? 'siguiente fase'}`);
    const montaje = e?.montaje ?? (v.tiene_final ? 'al_dia' : 'sin_montar');
    const estado: { texto: string; nivel: 'ok' | 'aviso' | 'neutro' }[] = [
      { texto: v.escenas_total ? `Guion listo (${v.escenas_total} escenas)` : 'Guion sin escribir', nivel: v.escenas_total ? 'ok' : 'neutro' },
      v.imagenes_total
        ? {
            texto: `${v.imagenes_hechas} de ${v.imagenes_total} imágenes listas`,
            nivel: v.imagenes_hechas === v.imagenes_total ? ('ok' as const) : ('aviso' as const),
          }
        : { texto: 'Imágenes sin empezar', nivel: 'neutro' as const },
      montaje === 'al_dia'
        ? { texto: 'Vídeo montado', nivel: 'ok' as const }
        : montaje === 'desactualizado'
          ? { texto: 'Hay que volver a montarlo', nivel: 'aviso' as const }
          : { texto: 'Sin montar todavía', nivel: 'neutro' as const },
    ];
    if (v.imagenes_desactualizadas) {
      estado.push({ texto: `${v.imagenes_desactualizadas} imágenes por rehacer`, nivel: 'aviso' });
    }
    const pasos = e?.pasos ?? (v.tipo === 'largo' ? 10 : 5);
    return { video: v, accion, estado, paso: e?.paso ?? Math.min(v.completadas.length + 1, pasos), pasos,
             fase: e?.vista_nombre ?? v.fase_nombre };
  });

  protected readonly creandoRapido = signal(false);

  /** Vídeo rápido sin canal (bloque E): crea el canal sin nombre y abre directamente el diálogo de vídeo nuevo. */
  protected async videoRapido(): Promise<void> {
    this.creandoRapido.set(true);
    try {
      const c = await this.canales.crearRapido();
      await this.nuevo.abrir(c.slug, c.nombre);
    } catch (e) {
      this.avisos.avisar(mensajeError(e, 'No se ha podido preparar el vídeo rápido.'), 'error');
    } finally {
      this.creandoRapido.set(false);
    }
  }

  protected readonly fecha = computed(() =>
    new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
  );

  protected readonly saludo = computed(() => {
    const h = new Date().getHours();
    return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  });
}
