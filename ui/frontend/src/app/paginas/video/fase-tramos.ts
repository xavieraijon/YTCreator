import { HttpClient, httpResource } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';

import { firstValueFrom } from 'rxjs';

import { ConfirmarService } from '../../compartido/confirmar';
import { Markdown } from '../../compartido/markdown';
import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { urlMedio } from '../../core/medios';
import { EventosService } from '../../core/eventos.service';
import { DatoInvestigacion, FaseTramos as DatosFase, Semaforo, TituloPropuesto, VideoDetalle } from '../../core/modelos';
import { TERMINADAS, TareasService } from '../../core/tareas.service';
import { RegistroMetricas, RegistroPublicacion } from './fase-resultados';
import { DetallesFase } from './detalles-fase';
import { MusicaPropia } from './musica-propia';
import { EfectosPropios } from './efectos-propios';
import { SincroniaVoz } from './sincronia-voz';
import { SubirImagenes } from '../../compartido/subir-imagen';
import { PanelHerramientas } from './panel-herramientas';
import { PestanaImagenes } from './pestana-imagenes';
import { MusicaAi33 } from './musica-ai33';
import { VozAi33 } from './voz-ai33';
import { AvisosService } from '../../core/avisos.service';
import { ServiciosService } from '../../core/servicios.service';
import { mensajeError } from '../../core/errores';
import { nombreDocumento } from '../../core/glosario';

const ICONO: Record<Semaforo, string> = { verde: 'check_circle', ambar: 'error', rojo: 'cancel', gris: 'info' };
const APROBAR: Record<string, string> = {
  investigacion: 'Dar por buena la investigación', empaquetado: 'Elegir este título y continuar',
  escaleta: 'Aprobar la historia', guion: 'Aprobar el guion', voz: 'Aprobar la voz', imagenes: 'Aprobar las imágenes',
  montaje: 'Aprobar el vídeo montado', miniaturas: 'Elegir esta miniatura', doc: 'Aprobar',
};
const ESTADO_DATO: Record<string, string> = { comprobado: 'Comprobado', hipotesis: 'Hipótesis', leyenda: 'Leyenda' };

/** Documentos .md del vídeo (pestañas si hay varios), cargados al abrirlos. */
@Component({
  selector: 'app-visor-docs',
  imports: [Markdown],
  template: `
    @if (docs().length > 1) {
      <div class="pestanas">
        @for (d of docs(); track d) {
          <button type="button" [class.activa]="d === actual()" (click)="elegido.set(d)">{{ nombre(d) }}</button>
        }
      </div>
    }
    @if (doc.value(); as d) { <app-markdown [texto]="d.texto" /> } @else if (doc.error()) { <p>No se pudo leer el documento.</p> }
  `,
  styles: `
    .pestanas { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .pestanas button { cursor: pointer; font: inherit; font-size: 0.85rem; padding: 0.25rem 0.8rem; border-radius: 99px;
      border: 1px solid var(--ay-borde-fuerte); background: transparent; color: var(--ay-tenue); }
    .pestanas .activa { background: var(--ay-acento-suave); border-color: var(--ay-acento); color: var(--ay-acento-fuerte); }
  `,
})
export class VisorDocs {
  readonly videoId = input.required<number>();
  readonly docs = input.required<string[]>();
  protected readonly elegido = signal<string | null>(null);
  protected readonly actual = computed(() => this.elegido() && this.docs().includes(this.elegido()!) ? this.elegido()! : this.docs()[0]);
  protected readonly doc = httpResource<{ texto: string }>(() => (this.actual() ? `/api/videos/${this.videoId()}/documentos/${this.actual()}` : undefined));
  protected readonly nombre = nombreDocumento;
}

/** Fases C a I: un tramo a la vez, con su resultado a la vista y un botón principal. Claude produce en segundo plano. */
@Component({
  selector: 'app-fase-tramos',
  imports: [MatButton, MatIcon, MatProgressBar, Markdown, TarjetaTarea, VisorDocs, PanelHerramientas, DetallesFase, SincroniaVoz, SubirImagenes, MusicaPropia, EfectosPropios,
    PestanaImagenes, MusicaAi33, VozAi33, RegistroPublicacion, RegistroMetricas],
  template: `
    @if (datos(); as d) {
      @if (revision() && d.tramos.length > 1) {
        <ol class="tramos tramos--pestanas">
          @for (t of d.tramos; track t.id) {
            <li><button type="button" [class.activo]="tramoVisto()?.id === t.id" (click)="tramoElegido.set(t.id)">{{ t.titulo }}</button></li>
          }
        </ol>
      } @else if (!revision() && d.tramos.length > 1) {
        <ol class="tramos">
          @for (t of d.tramos; track t.id) {
            <li [class]="'tramo tramo--' + t.estado" [class.tramo--visto]="verHecho() === t.id">
              @if (t.estado === 'hecho' || (verHecho() && t.estado === 'actual')) {
                <!-- Un paso ya hecho se abre para mirarlo (hallazgo 10); el actual vuelve al trabajo. -->
                <button type="button" class="tramo__boton" (click)="verHecho.set(t.estado === 'hecho' ? t.id : null)"
                        [attr.aria-label]="(t.estado === 'hecho' ? 'Ver ' : 'Volver a ') + t.titulo">
                  <mat-icon>{{ t.estado === 'hecho' ? 'check_circle' : 'radio_button_checked' }}</mat-icon>{{ t.titulo }}
                </button>
              } @else {
                <mat-icon>{{ t.estado === 'actual' ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>{{ t.titulo }}
              }
            </li>
          }
        </ol>
        @if (verHecho() && tramoVisto(); as a) {
          <div class="revision">
            <mat-icon>history</mat-icon>
            <span>Estás mirando <strong>{{ a.titulo }}</strong>, que ya hiciste. No se pierde nada.</span>
            <button mat-flat-button type="button" (click)="verHecho.set(null)">Volver al paso actual</button>
          </div>
        }
      }
      @if (!mirando() && d.completa) {
        <h1>Fase completa</h1>
        <p class="intro">Todo lo de esta fase está hecho. Puedes pasar a la siguiente.</p>
        @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
        <div class="acciones"><button mat-flat-button type="button" [disabled]="ocupado()" (click)="cerrar()">Continuar<mat-icon iconPositionEnd>arrow_forward</mat-icon></button></div>
      } @else if (tramoVisto(); as a) {
        <h1>{{ a.titulo }}</h1>
        <p class="intro">{{ a.ayuda }}</p>

        @if (a.job && !a.producido) {
          @if (d.trabajo.estado === 'pensando') {
            <div class="trabajando tarjeta">
              <mat-progress-bar mode="indeterminate" />
              <p><strong>Claude está trabajando</strong></p>
              <p class="secundario">{{ d.trabajo.accion ?? 'Leyendo el vídeo y sus archivos…' }}</p>
              @if (a.tarda) { <p class="secundario">Suele tardar {{ a.tarda.toLowerCase() }}. Puedes seguir con otra cosa: te avisamos al terminar.</p> }
              <button mat-button type="button" (click)="parar(d.trabajo.conversacion)">Parar</button>
            </div>
          } @else {
            @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }
            <div class="acciones">
              <button mat-flat-button type="button" [disabled]="lanzando()" (click)="producir()">
                <mat-icon>{{ lanzando() ? 'sync' : 'auto_awesome' }}</mat-icon>{{ lanzando() ? 'Enviando…' : a.boton }}
              </button>
              @if (a.tarda) { <span class="secundario"><mat-icon>schedule</mat-icon>{{ a.tarda }}</span> }
            </div>
          }
        } @else {
          <div class="pantalla">
            <div class="principal">
              @switch (a.vista) {
                @case ('investigacion') {
                  @let c = a.datos['conteo'];
                  <section class="hero">
                    @if (a.datos['resumen']) {
                      <p class="resumen" [class.resumen--recortado]="!resumenAbierto()">{{ a.datos['resumen'] }}</p>
                      @if (a.datos['resumen'].length > 260) {
                        <button type="button" class="enlace" (click)="resumenAbierto.set(!resumenAbierto())">{{ resumenAbierto() ? 'Leer menos' : 'Leer más' }}</button>
                      }
                    }
                    @if (c) {
                      <div class="proporcion" role="img" [attr.aria-label]="c.comprobados + ' comprobados, ' + c.hipotesis + ' hipótesis, ' + c.leyendas + ' leyendas'">
                        <span class="seg seg--comprobado" [style.flex]="c.comprobados || 0.001"></span>
                        <span class="seg seg--hipotesis" [style.flex]="c.hipotesis || 0.001"></span>
                        <span class="seg seg--leyenda" [style.flex]="c.leyendas || 0.001"></span>
                      </div>
                      <ul class="cifras-fila">
                        <li><i class="punto punto--comprobado"></i><strong>{{ c.comprobados }}</strong> comprobados</li>
                        <li><i class="punto punto--hipotesis"></i><strong>{{ c.hipotesis }}</strong> hipótesis</li>
                        <li><i class="punto punto--leyenda"></i><strong>{{ c.leyendas }}</strong> leyendas</li>
                        <li><mat-icon>menu_book</mat-icon><strong>{{ c.fuentes }}</strong> fuentes</li>
                      </ul>
                    }
                  </section>
                  @if (a.datos['avisos']?.length) {
                    <details class="avisos">
                      <summary><mat-icon>lightbulb</mat-icon>{{ a.datos['avisos'].length === 1 ? '1 cosa que conviene saber' : a.datos['avisos'].length + ' cosas que conviene saber' }}{{ importantes(a.datos['avisos']) }}</summary>
                      <ul class="lista-avisos">@for (av of a.datos['avisos']; track av.texto) { <li><span [class]="'grav grav--' + av.gravedad">{{ gravedad(av.gravedad) }}</span><div><p>{{ av.texto }}</p>@if (av.que_hacer) { <small>Qué se hará: {{ av.que_hacer }}</small> }</div></li> }</ul>
                    </details>
                  }
                  @if (a.datos['datos']?.length) {
                    <section class="seccion">
                      <div class="seccion__cab">
                        <h2>Lo que se ha encontrado</h2>
                        <div class="filtros" role="group" aria-label="Filtrar datos">
                          @for (f of filtros(a.datos['datos']); track f.clave) {
                            <button type="button" [class.activo]="filtro() === f.clave" (click)="filtro.set(f.clave); verTodos.set(false)">{{ f.texto }} <b>{{ f.n }}</b></button>
                          }
                        </div>
                      </div>
                      <ul class="datos">
                        @for (x of datosVisibles(a.datos['datos']); track $index) {
                          <li [class]="'dato dato--' + x.estado">
                            <i class="punto" [class]="'punto punto--' + x.estado" [title]="estadoDato(x.estado)"></i>
                            <div><p>{{ x.texto }}</p>@if (x.fuentes?.length) { <span class="fuentes">@for (f of x.fuentes; track f) { @if (fuente(a.datos, f); as fu) { @if (fu.url) { <a [href]="fu.url" target="_blank" rel="noopener" [title]="fu.nombre">{{ corto(fu.nombre) }}</a> } @else { <em>{{ corto(fu.nombre) }}</em> } } @else { <em>{{ f }}</em> } }</span> }</div>
                            <span class="dato__estado">{{ estadoDato(x.estado) }}</span>
                          </li>
                        }
                      </ul>
                      @if (restantes(a.datos['datos']) > 0) {
                        <button mat-stroked-button type="button" (click)="verTodos.set(true)">Ver los {{ restantes(a.datos['datos']) }} restantes</button>
                      } @else if (verTodos() && filtro() === 'todos' && a.datos['datos'].length > 8) {
                        <button mat-button type="button" (click)="verTodos.set(false)">Mostrar menos</button>
                      }
                    </section>
                  }
                }
                @case ('empaquetado') {
                  <div class="citas">
                    @if (a.datos['angulo']) { <blockquote><span>Ángulo</span>{{ a.datos['angulo'] }}</blockquote> }
                    @if (a.datos['promesa']) { <blockquote><span>Promesa del gancho</span>{{ a.datos['promesa'] }}</blockquote> }
                  </div>
                  <section class="seccion">
                    <h2>Elige el título</h2>
                    <div class="opciones">
                      @for (t of a.datos['titulos'] ?? []; track t.n) {
                        <button type="button" class="opcion" [class.opcion--elegida]="titulo(a) === t.n" (click)="eleccion.set(t.n)">
                          <mat-icon class="opcion__radio">{{ titulo(a) === t.n ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
                          <span class="opcion__cuerpo"><span class="opcion__titulo">{{ t.texto }}@if (t.recomendado) { <span class="chip chip--rec">Recomendado</span> }</span><span class="opcion__porque">{{ t.por_que }}</span></span>
                        </button>
                      }
                    </div>
                  </section>
                  @if (a.datos['miniatura']?.muestra) {
                    <section class="seccion">
                      <h2>Concepto de miniatura</h2>
                      <dl class="ficha">
                        <div><dt>Muestra</dt><dd>{{ a.datos['miniatura'].muestra }}</dd></div>
                        <div><dt>Oculta</dt><dd>{{ a.datos['miniatura'].oculta }}</dd></div>
                        @if (a.datos['miniatura'].texto) { <div><dt>Texto</dt><dd><strong>{{ a.datos['miniatura'].texto }}</strong></dd></div> }
                      </dl>
                    </section>
                  }
                }
                @case ('escaleta') {
                  @if (a.datos['resumen']) { <p class="resumen">{{ a.datos['resumen'] }}</p> }
                  @if (a.datos['avisos']?.length) {
                    <details class="avisos" open>
                      <summary><mat-icon>lightbulb</mat-icon>{{ a.datos['avisos'].length }} {{ a.datos['avisos'].length === 1 ? 'aviso del narrador' : 'avisos del narrador' }}{{ importantes(a.datos['avisos']) }}</summary>
                      <ul class="lista-avisos">@for (av of a.datos['avisos']; track av.texto) { <li><span [class]="'grav grav--' + av.gravedad">{{ gravedad(av.gravedad) }}</span><div><p>{{ av.texto }}</p>@if (av.que_hacer) { <small>Qué se hará: {{ av.que_hacer }}</small> }</div></li> }</ul>
                    </details>
                  }
                  <ol class="linea">
                    @for (x of a.datos['actos'] ?? []; track $index) {
                      <li>
                        <span class="num">{{ $index + 1 }}</span>
                        <div class="acto">
                          <div class="acto__cab"><strong>{{ x.titulo }}</strong>@if (x.minutos) { <span class="chip">{{ x.minutos }} min</span> }</div>
                          <p><span>Pregunta</span>{{ x.pregunta }}</p>
                          <p><span>Recompensa</span>{{ x.recompensa }}</p>
                        </div>
                      </li>
                    }
                  </ol>
                  <div class="citas">
                    @if (a.datos['giro']) { <blockquote><span>Giro final</span>{{ a.datos['giro'] }}</blockquote> }
                    @if (a.datos['cierre']) { <blockquote><span>Cierre</span>{{ a.datos['cierre'] }}</blockquote> }
                  </div>
                }
                @case ('guion') {
                  <ul class="lista-pasos">@for (p of a.datos['pasos'] ?? []; track p.texto) { <li [class.falta]="!p.hecho"><mat-icon>{{ p.hecho ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>{{ p.texto }}</li> }</ul>
                  @if (a.datos['errores']?.length) {
                    <details class="avisos avisos--error" open><summary><mat-icon>error</mat-icon>{{ a.datos['errores'].length }} {{ a.datos['errores'].length === 1 ? 'error que hay que corregir' : 'errores que hay que corregir' }} (el revisor no los deja pasar)</summary><ul>@for (x of a.datos['errores']; track x) { <li>{{ x }}</li> }</ul></details>
                  }
                  @if (a.datos['avisos']?.length) {
                    <details class="avisos"><summary><mat-icon>lightbulb</mat-icon>{{ a.datos['avisos'].length }} sugerencias del revisor (no bloquean)</summary><ul>@for (x of a.datos['avisos']; track x) { <li>{{ x }}</li> }</ul></details>
                  }
                }
                @case ('voz') {
                  <app-voz-ai33 [video]="video()" />
                  <app-sincronia-voz [videoId]="video().id" />
                  <div class="acciones">
                    <button mat-stroked-button type="button" [disabled]="enMarcha('entonacion')" (click)="tarea('entonacion')"><mat-icon>graphic_eq</mat-icon>Revisar la entonación (gratis)</button>
                  </div>
                  @for (t of tareaDe('entonacion'); track t.id) { <app-tarjeta-tarea [tarea]="t" /> }
                }
                @case ('imagenes') {
                  <app-panel-herramientas [video]="video()" [solo]="['imagenes', 'imagenes_ai33', 'boceto']" />
                  <app-subir-imagenes [videoId]="video().id" [imagenes]="video().imagenes" (cambiado)="eventos.refrescar()" />
                  <app-pestana-imagenes [video]="video()" />
                }
                @case ('montaje') {
                  <div class="acciones">
                    <button mat-flat-button type="button" [disabled]="enMarcha('montar')" (click)="montar()"><mat-icon>{{ enMarcha('montar') ? 'sync' : 'movie' }}</mat-icon>{{ video().tiene_final ? 'Volver a montar' : video().tipo === 'short' ? 'Montar el Short' : 'Montar el vídeo' }}</button>
                    <button mat-stroked-button type="button" [disabled]="enMarcha('fotogramas') || !video().tiene_final" (click)="tarea('fotogramas')"><mat-icon>grid_view</mat-icon>Control por fotogramas</button>
                    <button mat-stroked-button type="button" [disabled]="enMarcha('exportar_edicion') || !video().tiene_final" (click)="tarea('exportar_edicion')"><mat-icon>folder_zip</mat-icon>Exportar para montar fuera</button>
                  </div>
                  @for (t of tareaDe('montar', 'fotogramas', 'exportar_edicion'); track t.id) { <app-tarjeta-tarea [tarea]="t" /> }
                  <div class="videos">
                    @for (x of video().medios.videos; track x.ruta) {
                      <figure><video controls preload="metadata" [src]="medio(x.ruta)"></video><figcaption>{{ x.nombre }}</figcaption></figure>
                    }
                  </div>
                  <app-musica-propia [videoId]="video().id" />
                  <app-efectos-propios [videoId]="video().id" />
                  @if (servicios.disponible('ai33')) {
                    <details class="plegable"><summary><mat-icon>music_note</mat-icon>Música de Suno para este vídeo (opcional, de pago)</summary><app-musica-ai33 [video]="video()" /></details>
                  }
                }
                @case ('miniaturas') {
                  <div class="miniaturas">
                    @for (n of [1, 2, 3]; track n) {
                      <button type="button" class="miniatura" [class.miniatura--elegida]="(eleccion() ?? 1) === n" (click)="eleccion.set(n)">
                        <img [src]="miniatura(n)" [alt]="'Miniatura ' + n" />
                        <span><mat-icon>{{ (eleccion() ?? 1) === n ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>Miniatura {{ n }}</span>
                      </button>
                    }
                  </div>
                }
                @case ('publicado') { <app-registro-publicacion [videoId]="video().id" [datos]="a.datos" /> }
                @case ('metricas') { <app-registro-metricas [videoId]="video().id" [momento]="a.id === 'j-7d' ? '7d' : '48h'" [datos]="a.datos" /> }
                @case ('subida') {
                  @if (guiaSubida.value()?.texto; as t) { <details class="plegable" open><summary><mat-icon>checklist</mat-icon>Guía de subida paso a paso</summary><app-markdown [texto]="t" /></details> }
                }
              }

              @if (a.datos['afiliacion']?.length) {
                <!-- Van en la descripción del vídeo: se enseñan al preparar la publicación (hallazgo 17). -->
                <details class="plegable">
                  <summary><mat-icon>link</mat-icon>Enlaces de afiliación para la descripción ({{ a.datos['afiliacion'].length }})</summary>
                  <ul class="enlaces">@for (x of a.datos['afiliacion']; track x.url) { <li><strong>{{ x.titulo }}</strong><a [href]="x.url" target="_blank" rel="noopener">{{ x.url }}</a></li> }</ul>
                </details>
              }
              @if (a.docs.length && a.vista !== 'subida') {
                <details class="plegable" [open]="a.vista === 'doc'">
                  <summary><mat-icon>description</mat-icon>{{ a.docs.length > 1 ? 'Leer los documentos completos' : 'Leer el documento completo' }}</summary>
                  <app-visor-docs [videoId]="video().id" [docs]="a.docs" />
                </details>
              }
              <app-detalles-fase [video]="video()" [vista]="a.vista" />
            </div>

            <aside class="decision">
              @if (a.luces.length) {
                @let primera = a.luces[0];
                <div [class]="'veredicto veredicto--' + primera.color">
                  <mat-icon>{{ icono(primera.color) }}</mat-icon>
                  <div><span class="veredicto__titulo">{{ primera.titulo }}</span><strong>{{ primera.valor }}</strong>@if (primera.detalle) { <small>{{ primera.detalle }}</small> }</div>
                </div>
                @if (a.luces.length > 1) {
                  <ul class="indicadores">
                    @for (l of a.luces.slice(1); track l.titulo) {
                      <li [title]="l.detalle"><i [class]="'punto punto--' + l.color"></i><span>{{ l.titulo }}</span><strong>{{ l.valor }}</strong></li>
                    }
                  </ul>
                }
              }
              @if (a.cambios_pendientes.length) {
                <p class="aviso"><mat-icon>edit_note</mat-icon>Cambios anotados: «{{ a.cambios_pendientes.join('»; «') }}»</p>
              }
              @if (d.trabajo.estado === 'pensando') {
                <div class="trabajando-mini"><mat-progress-bar mode="indeterminate" /><p>Claude está trabajando</p><small>{{ d.trabajo.accion ?? 'Aplicando los cambios…' }}</small><button mat-button type="button" (click)="parar(d.trabajo.conversacion)">Parar</button></div>
              }
              @if (error()) { <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p> }

              <div class="decision__acciones">
                @if (mirando()) {
                  <span class="secundario"><mat-icon>history</mat-icon>Ya hecho</span>
                } @else if (a.aprobable) {
                  <button mat-flat-button type="button" [disabled]="ocupado() || d.trabajo.estado === 'pensando'" (click)="aprobar()">
                    {{ textoAprobar(a.vista) }}<mat-icon iconPositionEnd>arrow_forward</mat-icon>
                  </button>
                } @else if (a.aprobacion) {
                  <span class="secundario"><mat-icon>hourglass_empty</mat-icon>Cuando esté listo, podrás aprobarlo aquí.</span>
                }
                @if (a.aprobacion || mirando()) {
                  <button mat-stroked-button type="button" (click)="cambiosAbiertos.set(!cambiosAbiertos())"><mat-icon>edit_note</mat-icon>Pedir cambios</button>
                }
                @if (a.job && a.producido) {
                  <button mat-button type="button" [disabled]="lanzando() || d.trabajo.estado === 'pensando'" (click)="producir()"><mat-icon>autorenew</mat-icon>Volver a generarlo</button>
                }
              </div>
              @if (cambiosAbiertos()) {
                <div class="cambios">
                  <textarea rows="4" placeholder="Qué quieres cambiar. Claude lo aplica en segundo plano." [value]="textoCambios()" (input)="textoCambios.set($any($event.target).value)"></textarea>
                  <div class="cambios__botones">
                    <button mat-button type="button" (click)="cambiosAbiertos.set(false)">Cancelar</button>
                    <button mat-flat-button type="button" [disabled]="!textoCambios().trim() || ocupado()" (click)="enviarCambios()">Enviar</button>
                  </div>
                </div>
              }
            </aside>
          </div>
        }
      }
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }

  `,
  styleUrls: ['./fase-guiada.scss', './fase-tramos.scss'],
})
export class FaseTramos {
  readonly video = input.required<VideoDetalle>();
  private readonly avisos = inject(AvisosService);
  /** La fase que se enseña y si ya está hecha (se mira, no se continúa). */
  readonly letra = input.required<string>();
  readonly revision = input(false);
  readonly hablar = output<void>();

  private readonly http = inject(HttpClient);
  protected readonly eventos = inject(EventosService);
  private readonly tareas = inject(TareasService);
  private readonly confirmar = inject(ConfirmarService);
  protected readonly servicios = inject(ServiciosService);

  private readonly recurso = httpResource<DatosFase>(() => {
    this.eventos.version();
    return `/api/videos/${this.video().id}/fase/${this.letra()}${this.mirando() ? '?revision=true' : ''}`;
  });
  protected readonly datos = computed(() => (this.recurso.hasValue() ? this.recurso.value() : undefined));
  protected readonly guiaSubida = httpResource<{ texto: string }>(() => (this.letra() === (this.video().tipo === 'short' ? 'E' : 'I') ? '/api/asistente/guia-subida' : undefined));

  protected readonly lanzando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly eleccion = signal<number | null>(null);
  protected readonly cambiosAbiertos = signal(false);
  protected readonly textoCambios = signal('');
  protected readonly resumenAbierto = signal(false);
  protected readonly filtro = signal<'todos' | 'comprobado' | 'hipotesis' | 'leyenda'>('todos');
  protected readonly verTodos = signal(false);

  /** Revisando una fase hecha: el tramo que se mira (pestañas); si no, el que toca. */
  protected readonly tramoElegido = signal<string | null>(null);
  /** En la fase actual, un paso ya hecho que se ha abierto para mirarlo (null = el paso que toca). */
  protected readonly verHecho = signal<string | null>(null);
  protected readonly mirando = computed(() => this.revision() || this.verHecho() !== null);
  protected readonly tramoVisto = computed(() => {
    const d = this.datos();
    if (!d) return null;
    if (!this.mirando()) return d.actual;
    const fila = d.tramos.find((x) => x.id === (this.verHecho() ?? this.tramoElegido())) ?? d.tramos[0];
    return fila?.detalle ?? null;
  });

  constructor() {
    effect(() => {                              // otra fase u otro vídeo: se vuelve al paso que toca
      this.letra();
      this.video().id;
      untracked(() => this.verHecho.set(null));
    });
    effect(() => {                              // al cambiar de fase o tramo se limpia lo que el usuario había tecleado
      this.tramoVisto()?.id;
      untracked(() => { this.eleccion.set(null); this.filtro.set('todos'); this.verTodos.set(false); this.resumenAbierto.set(false); this.cambiosAbiertos.set(false); this.textoCambios.set(''); this.error.set(null); });
    });
    const id = setInterval(() => {
      if (this.datos()?.trabajo.estado === 'pensando') this.recurso.reload();
    }, 4000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  /** Nombre y enlace de una fuente a partir de su código («[AND21]»); null si la investigación no los trae. */
  protected fuente(datos: Record<string, unknown>, codigo: string): { nombre: string; url: string | null } | null {
    const lista = datos['fuentes'] as Record<string, { nombre: string; url: string | null }> | undefined;
    return lista?.[codigo] ?? lista?.[`[${codigo.replace(/[[\]]/g, '')}]`] ?? null;
  }
  protected corto(nombre: string): string {
    return nombre.length > 60 ? nombre.slice(0, 57).trimEnd() + '…' : nombre;
  }

  protected filtros(datos: DatoInvestigacion[]) {
    const n = (e: string) => datos.filter((d) => d.estado === e).length;
    return [
      { clave: 'todos' as const, texto: 'Todos', n: datos.length },
      { clave: 'comprobado' as const, texto: 'Comprobados', n: n('comprobado') },
      { clave: 'hipotesis' as const, texto: 'Hipótesis', n: n('hipotesis') },
      { clave: 'leyenda' as const, texto: 'Leyendas', n: n('leyenda') },
    ].filter((f) => f.clave === 'todos' || f.n > 0);
  }
  private filtrados(datos: DatoInvestigacion[]): DatoInvestigacion[] {
    return this.filtro() === 'todos' ? datos : datos.filter((d) => d.estado === this.filtro());
  }
  protected datosVisibles(datos: DatoInvestigacion[]): DatoInvestigacion[] {
    const f = this.filtrados(datos);
    return this.verTodos() || this.filtro() !== 'todos' ? f : f.slice(0, 8);
  }
  protected restantes(datos: DatoInvestigacion[]): number {
    return this.verTodos() || this.filtro() !== 'todos' ? 0 : Math.max(0, datos.length - 8);
  }
  protected gravedad(g: string): string {
    return ({ alta: 'Importante', media: 'Conviene', baja: 'Menor', sin_clasificar: 'Sin clasificar' } as Record<string, string>)[g] ?? g;
  }
  protected importantes(avisos: { gravedad: string }[]): string {
    const n = avisos.filter((a) => a.gravedad === 'alta').length;
    return n ? ` · ${n} ${n === 1 ? 'importante' : 'importantes'}` : '';
  }
  protected icono(c: Semaforo): string { return ICONO[c]; }
  protected estadoDato(e: string): string { return ESTADO_DATO[e] ?? e; }
  protected textoAprobar(vista: string): string { return APROBAR[vista] ?? 'Aprobar'; }
  protected medio(ruta: string): string { return urlMedio(this.video().canal, ruta); }
  protected miniatura(n: number): string { return urlMedio(this.video().canal, `videos/${this.video().carpeta}/miniatura_${n}.jpg`, 480); }
  /** El título elegido en la vista del empaquetado (por defecto, el recomendado). */
  protected titulo(a: { datos: Record<string, unknown> }): number {
    const titulos = (a.datos['titulos'] ?? []) as TituloPropuesto[];
    return this.eleccion() ?? titulos.find((t) => t.recomendado)?.n ?? 1;
  }

  protected tareaDe(...claves: string[]) {
    return this.tareas.tareas().filter((t) => t.video_id === this.video().id && claves.includes(t.herramienta)).slice(0, 1);
  }
  protected enMarcha(clave: string): boolean {
    return this.tareas.tareas().some((t) => t.video_id === this.video().id && t.herramienta === clave && !TERMINADAS.includes(t.estado));
  }
  protected async tarea(clave: string): Promise<void> {
    this.error.set(await this.tareas.lanzar(clave, this.video().id));
  }
  protected async montar(): Promise<void> {
    const ok = await this.confirmar.pedir({
      titulo: 'Montar el vídeo', mensaje: 'Une voz, imágenes y subtítulos en el vídeo final. Es gratis, pero ocupa el ordenador un rato.',
      aceptar: 'Montar', icono: 'movie',
    });
    if (ok) await this.tarea('montar');
  }

  private async enviar(url: string, cuerpo: object = {}): Promise<boolean> {
    this.avisos.pedirPermiso();          // trabajo largo en segundo plano: avisaremos al terminar
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(url, cuerpo));
      return true;
    } catch (e) {
      this.error.set(mensajeError(e));
      return false;
    }
  }

  protected async producir(): Promise<void> {
    const a = this.tramoVisto();
    if (!a) return;
    if (this.mirando() && !(await this.confirmar.pedir({
      titulo: `Volver a generar «${a.titulo}»`,
      mensaje: 'Claude rehará este paso y sobrescribirá sus archivos. No se pierde ninguna otra fase, pero lo que dependa de él (voz, imágenes, montaje) puede quedar desactualizado.',
      aceptar: 'Volver a generarlo', icono: 'autorenew' }))) return;
    this.lanzando.set(true);
    if (await this.enviar(`/api/videos/${this.video().id}/tramo/${a.id}/producir`)) this.recurso.reload();
    this.lanzando.set(false);
  }

  protected async aprobar(): Promise<void> {
    const a = this.tramoVisto();
    if (!a) return;
    this.ocupado.set(true);
    const eleccion = a.vista === 'empaquetado' ? this.titulo(a) : a.vista === 'miniaturas' ? (this.eleccion() ?? 1) : null;
    if (await this.enviar(`/api/videos/${this.video().id}/tramo/${a.id}/aprobar`, { eleccion })) this.eventos.refrescar();
    this.ocupado.set(false);
  }

  protected async enviarCambios(): Promise<void> {
    const a = this.tramoVisto();
    if (!a) return;
    this.ocupado.set(true);
    if (await this.enviar(`/api/videos/${this.video().id}/tramo/${a.id}/cambios`, { texto: this.textoCambios() })) {
      this.cambiosAbiertos.set(false);
      this.textoCambios.set('');
      this.eventos.refrescar();
    }
    this.ocupado.set(false);
  }

  protected async completar(): Promise<void> {
    const a = this.tramoVisto();
    if (!a) return;
    this.ocupado.set(true);
    if (await this.enviar(`/api/videos/${this.video().id}/tramo/${a.id}/completar`)) this.eventos.refrescar();
    this.ocupado.set(false);
  }

  protected async cerrar(): Promise<void> {
    this.ocupado.set(true);
    if (await this.enviar(`/api/videos/${this.video().id}/fase/${this.video().fase}/cerrar`)) this.eventos.refrescar();
    this.ocupado.set(false);
  }

  protected async parar(conversacion: number | null): Promise<void> {
    if (conversacion) await firstValueFrom(this.http.post(`/api/claude/${conversacion}/parar`, {}));
  }
}
