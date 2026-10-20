import { ConfirmarService } from '../../compartido/confirmar';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { conservar } from '../../compartido/conservar';
import { OndaAudio } from '../../compartido/onda-audio';
import { EventosService } from '../../core/eventos.service';
import { Escena, VideoDetalle, VozPrevista } from '../../core/modelos';
import { TERMINADAS, TareasService } from '../../core/tareas.service';
import { mensajeError } from '../../core/errores';
import { miles, euros as eurosLlano } from '../../core/formato';

/**
 * Locución por la API de ai33 (DE PAGO) desde la UI: qué bloques faltan, cuánto cuestan y dos botones —probar el
 * primer bloque o locutar todo—. Cada uno confirma los créditos exactos; si cambian, el backend no lo lanza.
 */
@Component({
  selector: 'app-voz-ai33',
  imports: [MatButton, MatIcon, OndaAudio],
  template: `
    @if (datos(); as d) {
      @if (d.bloques.length) {
        <section class="voz tarjeta">
          <header>
            <mat-icon>record_voice_over</mat-icon>
            <div>
              <h3>Locución{{ d.externa ? ' propia (hecha fuera)' : dePago() ? ' con la voz de pago' : '' }}</h3>
              @if (d.externa; as x) {
                <p class="secundario voz-nombre">
                  Archivo: <strong>{{ x.archivo }}</strong>{{ x.duracion ? ' · ' + duracion(x.duracion) : '' }}
                  · se reparte por escenas con los tiempos de cada palabra (gratis)
                </p>
              } @else {
                <p class="secundario voz-nombre">
                  Voz: <strong>{{ d.nombre_voz ?? d.voz }}</strong>
                  · {{ d.bloques.length }} {{ d.bloques.length === 1 ? 'bloque' : 'bloques' }} (cada bloque se locuta de una tirada)
                </p>
              }
              <p class="secundario">
                @if (d.externa?.existe === false) {
                  <strong>No se encuentra el archivo de la locución propia</strong>: vuelve a subirlo o vuelve a la voz del canal.
                } @else if (d.externa && d.pendientes) {
                  Falta prepararla: repartirla por escenas (gratis, un par de minutos).
                } @else if (d.externa) {
                  Lista y repartida por escenas: escúchala abajo y monta el vídeo.
                } @else {
                  {{ hechos() }} de {{ d.bloques.length }} bloques locutados.
                  @if (d.pendientes && !dePago()) {
                    {{ d.pendientes === 1 ? 'Falta 1' : 'Faltan ' + d.pendientes }}: con esta voz no cuesta nada
                    (se locuta al montar el vídeo).
                  } @else if (d.pendientes) {
                    Faltan {{ d.pendientes }}: {{ miles(d.caracteres_de_pago) }} caracteres ≈
                    <strong>{{ miles(d.creditos) }} créditos</strong> ({{ euros(d.euros) }}).
                  } @else if (textoNuevo().length) {
                    Has cambiado el texto de {{ textoNuevo().length === 1 ? 'la escena' : 'las escenas' }}
                    <strong>{{ textoNuevo().join(', ') }}</strong>: locútala sola con ↻ junto a su audio (abajo).
                  } @else {
                    Toda la voz está hecha: revisa la entonación y monta el vídeo.
                  }
                }
              </p>
            </div>
          </header>

          <ol class="bloques">
            @for (b of d.bloques; track $index) {
              <li [class.hecho]="b.hecho" [class.cambiado]="!!b.solo_escena" [title]="b.caracteres + ' caracteres'">
                <mat-icon>{{ b.hecho ? 'check_circle' : b.solo_escena ? 'edit_note' : 'radio_button_unchecked' }}</mat-icon>
                Esc. {{ b.escenas[0] }}{{ b.escenas.length > 1 ? '–' + b.escenas[b.escenas.length - 1] : '' }}
              </li>
            }
          </ol>

          @if (d.externa && d.pendientes && d.externa.existe) {
            @if (enMarcha()) {
              <p class="aviso"><mat-icon>sync</mat-icon>Preparando la locución… (abajo, en las tareas del vídeo, ves cómo va)</p>
            } @else {
              <div class="acciones">
                <button mat-flat-button type="button" (click)="preparar()">
                  <mat-icon>graphic_eq</mat-icon>Preparar la locución (gratis)
                </button>
              </div>
            }
          }

          @if (d.pendientes && dePago()) {
            @if (enMarcha()) {
              <p class="aviso"><mat-icon>sync</mat-icon>Locutando con la voz profesional… (abajo, en las tareas del vídeo, ves cómo va)</p>
            } @else {
              <div class="acciones">
                @if (d.prueba && d.pendientes > 1) {
                  <button mat-stroked-button type="button" (click)="lanzar(true)">
                    <mat-icon>mic</mat-icon>Locutar solo el siguiente bloque, de prueba ({{ euros(d.prueba.euros) }})
                  </button>
                }
                <button mat-flat-button type="button" (click)="lanzar(false)">
                  <mat-icon>mic</mat-icon>Locutar {{ d.pendientes === 1 ? 'el bloque que falta' : 'los ' + d.pendientes + ' bloques' }}
                  ({{ euros(d.euros) }})
                </button>
              </div>
              <p class="secundario nota">
                Ambos botones <strong>locutan de verdad con la voz profesional y se pagan</strong> (no hay muestras gratis de la voz del
                canal). Recomendado: un bloque primero, escúchalo aquí abajo, pasa «Entonación» (gratis: marca finales raros y cortes de la voz) y,
                si está bien, locuta el resto.
              </p>
            }
          }

          @if (locutados().length) {
            <div class="escuchar">
              <h4><mat-icon>headphones</mat-icon>Escuchar lo locutado</h4>
              @for (b of locutados(); track b.escenas[0]) {
                <div class="bloque">
                  <div class="bloque__cabeza">
                    <strong>Bloque esc. {{ rango(b.escenas) }}</strong>
                    @if (b.solo_escena) {
                      <span class="cambio"><mat-icon>edit_note</mat-icon>Texto nuevo en la escena {{ b.solo_escena }}:
                        ↻ junto a su audio la locuta sola</span>
                    } @else if (dePago() && !enMarcha()) {
                      <button mat-button type="button" (click)="repetir(b.escenas)"
                              title="Otra toma del mismo texto (de pago). Si el problema es el texto, pide los cambios en la Guía.">
                        <mat-icon>replay</mat-icon>Repetir el bloque entero
                      </button>
                    }
                  </div>
                  @for (e of escenasDe(b.escenas); track e.numero) {
                    <div class="pista" [class.pista--cambiada]="e.numero === b.solo_escena">
                      <span class="pista__num">{{ e.numero }}</span>
                      <app-onda-audio [canal]="video().canal" [ruta]="e.audio!" />
                      @if (dePago() && !enMarcha()) {
                        <button mat-icon-button type="button" aria-label="Repetir solo esta escena" (click)="repetirEscena(e.numero)"
                                title="Repetir solo esta escena (de pago, unos céntimos): el resto del bloque no se toca">
                          <mat-icon>replay</mat-icon>
                        </button>
                      }
                    </div>
                  }
                </div>
              }
              @if (d.externa) {
              <p class="secundario nota">
                ¿Algo no cuadra (una escena cortada o con la voz de la siguiente)? La locución tiene que decir el texto
                del guion tal cual: si cambiaste algo al grabarla, corrige el guion o vuelve a grabarla y súbela con
                «Cambiar el archivo».
              </p>
              } @else {
              <p class="secundario nota">
                ¿Suena raro? Si es la toma (un final que sube, un corte, una escena entrecortada), repite solo esa escena con
                ↻ junto a su audio (mucho más barato que el bloque y no toca las que están bien). Si es el texto (frases poco
                naturales), escríbelo en la Guía → «Pedir cambios» y pulsa «Aplicar los cambios con Claude»: reescribe esas
                escenas y los bloques cambiados vuelven a salir aquí como pendientes de locutar.
              </p>
              }
            </div>
          }
          <div class="propia">
            @if (d.externa) {
              <p class="secundario">¿Prefieres otra toma o la voz del canal?</p>
              <div class="acciones">
                <button mat-stroked-button type="button" [disabled]="subiendo() || enMarcha()" (click)="elegir.click()">
                  <mat-icon>upload_file</mat-icon>Cambiar el archivo
                </button>
                <button mat-button type="button" [disabled]="subiendo() || enMarcha()" (click)="quitar()">
                  <mat-icon>undo</mat-icon>Volver a la voz del canal
                </button>
              </div>
            } @else {
              <p class="secundario">
                ¿Tienes la locución hecha fuera (grabada por ti o descargada de otra web)? Súbela y se usa en lugar de
                la voz del canal, sin coste. Tiene que decir el texto del guion entero.
              </p>
              <div class="acciones">
                <button mat-stroked-button type="button" [disabled]="subiendo() || enMarcha()" (click)="elegir.click()">
                  <mat-icon>upload_file</mat-icon>Subir una locución propia
                </button>
              </div>
            }
            <input #elegir type="file" hidden accept=".mp3,.wav,.m4a,.ogg,.flac,.aac,audio/*" (change)="subir(elegir)" />
            @if (subiendo()) {
              <p class="aviso"><mat-icon>sync</mat-icon>Subiendo la locución…</p>
            }
          </div>
          @if (error(); as e) {
            <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p>
          }
        </section>
      }
    }
  `,
  styles: `
    .voz {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1.1rem 1.25rem;
      margin-bottom: 1.25rem;
    }
    header {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      > mat-icon {
        color: var(--ay-pago);
        margin-top: 0.15rem;
      }
      h3 {
        margin: 0 0 0.2rem;
      }
      .voz-nombre {
        margin-bottom: 0.2rem;
        font-size: 0.85rem;
      }
      p {
        margin: 0;
      }
    }
    .bloques {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 0.9rem;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.82rem;
      color: var(--ay-tenue);
      li {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      li.hecho {
        color: var(--ay-ok);
      }
      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
    }
    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      button {
        border-radius: 99px;
      }
    }
    .propia {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--ay-borde);
      p {
        margin: 0;
        font-size: 0.85rem;
      }
    }
    .nota {
      margin: 0;
      font-size: 0.8rem;
    }
    .escuchar {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--ay-borde);
      h4 {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
      }
    }
    .bloque {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .bloque__cabeza {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .pista {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      app-onda-audio {
        flex: 1;
        min-width: 0;
      }
    }
    .cambio {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.82rem;
      color: var(--ay-pago);
      mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
    }
    .pista--cambiada {
      outline: 1px dashed var(--ay-pago);
      border-radius: 8px;
      padding: 0.15rem 0.3rem;
    }
    .bloques li.cambiado {
      color: var(--ay-pago);
    }
    .pista__num {
      width: 1.6rem;
      font-size: 0.8rem;
      color: var(--ay-tenue);
      text-align: right;
    }
    .aviso,
    .error {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0;
    }
    .aviso {
      color: var(--ay-pago);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class VozAi33 {
  protected readonly miles = miles;
  readonly video = input.required<VideoDetalle>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly tareas = inject(TareasService);
  private readonly confirmar = inject(ConfirmarService);

  private readonly recurso = httpResource<VozPrevista>(() => {
    this.eventos.version();
    return `/api/videos/${this.video().id}/voz`;
  });
  protected readonly datos = conservar(this.recurso);
  protected readonly error = signal<string | null>(null);

  protected readonly subiendo = signal(false);
  /** Los botones de pago, solo con la voz de pago del canal y sin locución propia. */
  protected readonly dePago = computed(() => !!this.datos()?.voz?.startsWith('ai33:') && !this.datos()?.externa);
  protected readonly hechos = computed(() => this.datos()?.bloques.filter((b) => b.hecho).length ?? 0);
  protected readonly enMarcha = computed(() =>
    this.tareas.tareas().some((t) => ['voz_ai33', 'voz_externa'].includes(t.herramienta) && t.video_id === this.video().id &&
      !TERMINADAS.includes(t.estado)),
  );

  /** Bloques ya locutados con su audio por escena, para escucharlos aquí mismo. */
  protected readonly locutados = computed(() =>
    (this.datos()?.bloques ?? []).filter((b) => (b.hecho || !!b.solo_escena) && this.escenasDe(b.escenas).length),
  );
  /** Escenas con texto nuevo en bloques ya locutados (se locutan solas). */
  protected readonly textoNuevo = computed(() =>
    (this.datos()?.bloques ?? []).flatMap((b) => (b.solo_escena ? [b.solo_escena] : [])),
  );

  protected escenasDe(numeros: number[]): Escena[] {
    return this.video().escenas.filter((e) => numeros.includes(e.numero) && !!e.audio);
  }

  protected rango(n: number[]): string {
    return n.length > 1 ? `${n[0]}–${n[n.length - 1]}` : `${n[0]}`;
  }

  protected euros(e: number): string {
    return eurosLlano(e);
  }

  protected duracion(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.round(s % 60)).padStart(2, '0')} min`;
  }

  /** Sube la locución hecha fuera tal cual (el cuerpo de la petición es el archivo) y la deja como voz del vídeo. */
  protected async subir(entrada: HTMLInputElement): Promise<void> {
    const archivo = entrada.files?.[0];
    entrada.value = '';                          // elegir el mismo archivo otra vez también avisa
    if (!archivo) return;
    this.error.set(null);
    this.subiendo.set(true);
    try {
      await firstValueFrom(this.http.put(`/api/videos/${this.video().id}/voz/archivo`, archivo, {
        params: { nombre: archivo.name },
        headers: { 'Content-Type': 'application/octet-stream' },
      }));
      this.recurso.reload();
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo subir la locución'));
    } finally {
      this.subiendo.set(false);
    }
  }

  /** Reparte la locución propia por escenas (tarea gratuita). */
  protected async preparar(): Promise<void> {
    this.error.set(await this.tareas.lanzar('voz_externa', this.video().id));
  }

  protected async quitar(): Promise<void> {
    const ok = await this.confirmar.pedir({
      titulo: 'Volver a la voz del canal',
      mensaje: 'La locución propia deja de usarse. El archivo se guarda en voz/anteriores/: no se borra.',
      aceptar: 'Volver a la voz del canal',
    });
    if (!ok) return;
    this.error.set(null);
    try {
      await firstValueFrom(this.http.delete(`/api/videos/${this.video().id}/voz/archivo`));
      this.recurso.reload();
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo quitar la locución propia'));
    }
  }

  /** Otra toma de UNA escena (de pago): el resto de su bloque no se toca. */
  protected async repetirEscena(n: number): Promise<void> {
    this.error.set(null);
    type Coste = { creditos: number; euros: number; caracteres_de_pago: number; escenas: number[] };
    let c: Coste;
    try {
      c = await new Promise<Coste>((ok, mal) =>
        this.http.get<Coste>(`/api/videos/${this.video().id}/voz`, { params: { escena: n } })
          .subscribe({ next: ok, error: mal }),
      );
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo calcular el coste de la escena'));
      return;
    }
    const ok = await this.confirmar.pedir({
      titulo: `Repetir la escena ${n}`,
      tono: 'pago',
      creditos: c.creditos,
      coste: `≈ ${miles(c.creditos)} créditos (${this.euros(c.euros)})`,
      mensaje: `Otra toma solo de la escena ${n}, con la voz del canal (de pago).`,
      detalles: [
        `${miles(c.caracteres_de_pago)} caracteres.`,
        'El resto del bloque no se toca.',
        'La toma actual se guarda en voz/anteriores/.',
      ],
      aceptar: 'Repetir (de pago)',
    });
    if (!ok) return;
    this.error.set(
      await this.tareas.lanzar('voz_ai33', this.video().id, { confirmado: true, previsto: c.creditos, escena_sola: n }),
    );
  }

  /** Otra toma de un bloque ya locutado (de pago): pide el coste exacto y lo confirma. */
  protected async repetir(escenas: number[]): Promise<void> {
    this.error.set(null);
    type Coste = { creditos: number; euros: number; caracteres_de_pago: number; escenas: number[] };
    let c: Coste;
    try {
      c = await new Promise<Coste>((ok, mal) =>
        this.http.get<Coste>(`/api/videos/${this.video().id}/voz`, { params: { repetir: escenas.join(',') } })
          .subscribe({ next: ok, error: mal }),
      );
    } catch {
      this.error.set('No se pudo calcular el coste de repetir el bloque');
      return;
    }
    const ok = await this.confirmar.pedir({
      titulo: `Repetir el bloque entero (escenas ${this.rango(c.escenas)})`,
      tono: 'pago',
      creditos: c.creditos,
      coste: `≈ ${miles(c.creditos)} créditos (${this.euros(c.euros)})`,
      mensaje: `Otra toma de las ${c.escenas.length} escenas del bloque, con el mismo texto.`,
      detalles: [`${miles(c.caracteres_de_pago)} caracteres.`, 'La toma actual se sustituye.'],
      aviso: 'Si solo falla una escena, es mucho más barato repetirla sola con ↻ junto a su audio.',
      aceptar: 'Repetir el bloque (de pago)',
    });
    if (!ok) return;
    this.error.set(
      await this.tareas.lanzar('voz_ai33', this.video().id, {
        confirmado: true, previsto: c.creditos, rehacer: escenas.join(','),
      }),
    );
  }

  /** Pide el coste al backend en ese momento y confirma exactamente esa cifra. */
  protected async lanzar(soloPrimero: boolean): Promise<void> {
    this.error.set(null);
    let d: VozPrevista;
    try {
      d = await new Promise<VozPrevista>((ok, mal) =>
        this.http.get<VozPrevista>(`/api/videos/${this.video().id}/voz`).subscribe({ next: ok, error: mal }),
      );
    } catch {
      this.error.set('No se pudo calcular el coste de la voz');
      return;
    }
    const coste = soloPrimero && d.prueba ? d.prueba : d;
    const prueba = soloPrimero && !!d.prueba;
    const ok = await this.confirmar.pedir({
      titulo: prueba ? `Locutar el bloque de prueba (escenas ${this.rango(d.prueba!.escenas)})`
        : `Locutar ${d.pendientes === 1 ? 'el bloque que falta' : 'los ' + d.pendientes + ' bloques que faltan'}`,
      tono: 'pago',
      coste: `≈ ${miles(coste.creditos)} créditos (${this.euros(coste.euros)})`,
      mensaje: `Con la voz del canal: ${d.nombre_voz ?? d.voz}.`,
      detalles: [
        `${miles(coste.caracteres_de_pago)} caracteres.`,
        'Cada bloque se locuta de una tirada y lo escuchas aquí mismo al terminar.',
      ],
      aviso: 'Cada toma se paga, también si luego la repites.',
      aceptar: 'Locutar (de pago)',
    });
    if (!ok) return;
    this.error.set(
      await this.tareas.lanzar('voz_ai33', this.video().id, {
        confirmado: true, previsto: coste.creditos, solo_primero: soloPrimero && !!d.prueba,
      }),
    );
  }
}
