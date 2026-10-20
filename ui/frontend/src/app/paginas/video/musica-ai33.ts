import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { ConfirmarService } from '../../compartido/confirmar';
import { conservar } from '../../compartido/conservar';
import { OndaAudio } from '../../compartido/onda-audio';
import { EventosService } from '../../core/eventos.service';
import { AmbienteMusica, MusicaVideo, VideoDetalle } from '../../core/modelos';
import { TERMINADAS, TareasService } from '../../core/tareas.service';
import { mensajeError } from '../../core/errores';
import { miles, euros as eurosLlano } from '../../core/formato';

/**
 * Música de fondo del vídeo (02/10): por cada ambiente del guion (misterio, tranquilo…), la música propia del canal
 * (gratis) o una encargada a Suno por ai33 (DE PAGO, 2 versiones por encargo). Se escucha cada opción, se elige
 * la que se usa al montar y se ajusta el prompt antes de encargar. El encargo confirma los créditos exactos.
 */
@Component({
  selector: 'app-musica-ai33',
  imports: [MatButton, MatIcon, OndaAudio],
  template: `
    @if (datos(); as d) {
      @if (d.ambientes.length) {
        <section class="musica tarjeta">
          <header>
            <mat-icon>music_note</mat-icon>
            <div>
              <h3>Música de fondo</h3>
              <p class="secundario">
                Por defecto suena la música propia del canal (gratis). Para este vídeo puedes encargar a Suno una a medida:
                <strong>de pago, ≈ {{ miles(d.creditos_por_encargo) }} créditos por ambiente</strong>
                ({{ euros(d.euros_por_encargo) }}), que dan 2 versiones de unos 3 minutos. Escúchalas con la voz en la cabeza
                y elige la que se usará al montar.
              </p>
            </div>
          </header>

          @for (a of d.ambientes; track a.ambiente) {
            <article class="ambiente">
              <div class="ambiente__cabeza">
                <h4>{{ a.ambiente }}</h4>
                <span class="secundario">{{ a.escenas.length === 1 ? 'escena' : 'escenas' }} {{ rangos(a.escenas) }}</span>
                <span class="chip" [class.chip--suno]="!!a.elegida">
                  {{ a.elegida ? 'Al montar: Suno, versión ' + a.elegida : 'Al montar: la propia del canal' }}
                </span>
              </div>

              <ul class="opciones">
                @if (a.propia) {
                  <li [class.elegida]="!a.elegida">
                    <span class="opcion__nombre">Propia del canal <span class="secundario">· gratis, en bucle</span></span>
                    <app-onda-audio [url]="urlPropia(a.ambiente)" [urlPicos]="urlPropia(a.ambiente, 200)" />
                    @if (a.elegida) {
                      <button mat-button type="button" [disabled]="ocupado()" (click)="elegir(a, 0)">Usar esta</button>
                    } @else {
                      <span class="usada"><mat-icon>check</mat-icon>En uso</span>
                    }
                  </li>
                }
                @for (v of a.versiones; track v.n) {
                  <li [class.elegida]="a.elegida === v.n">
                    <span class="opcion__nombre">Suno · versión {{ v.n }}
                      @if (v.duracion) { <span class="secundario">· {{ minutos(v.duracion) }}</span> }</span>
                    <app-onda-audio [canal]="video().canal" [ruta]="'videos/' + video().carpeta + '/' + v.archivo" />
                    @if (a.elegida !== v.n) {
                      <button mat-button type="button" [disabled]="ocupado()" (click)="elegir(a, v.n)">Usar esta</button>
                    } @else {
                      <span class="usada"><mat-icon>check</mat-icon>En uso</span>
                    }
                  </li>
                }
              </ul>

              @if (enMarcha(a.ambiente)) {
                <p class="aviso"><mat-icon class="girando">progress_activity</mat-icon>Suno está componiendo «{{ a.ambiente }}»…
                  (suele tardar menos de un minuto; la barra está en el panel de tareas)</p>
              } @else {
                <details class="prompt" [open]="!a.versiones.length">
                  <summary>Descripción de la música {{ a.prompt_propio ? '(propia de este vídeo)' : '(la del canal)' }}</summary>
                  <textarea rows="5" [value]="borrador(a)" (input)="editar(a, $any($event.target).value)"></textarea>
                  <div class="prompt__pie">
                    <span class="secundario" [class.largo]="borrador(a).length > maxPrompt()">
                      {{ borrador(a).length }} / {{ maxPrompt() }} caracteres · en inglés, instrumental y pensado para ir bajo la voz
                    </span>
                    @if (cambiado(a)) {
                      <button mat-button type="button" [disabled]="ocupado() || borrador(a).length > maxPrompt()"
                              (click)="guardarPrompt(a)">Guardar</button>
                    }
                    @if (a.prompt_propio) {
                      <button mat-button type="button" [disabled]="ocupado()" (click)="restaurarPrompt(a)">Volver al del canal</button>
                    }
                  </div>
                </details>
                <div class="acciones">
                  <button mat-stroked-button type="button" class="boton-pago"
                          [disabled]="ocupado() || encargando() || borrador(a).length > maxPrompt()" (click)="encargar(a)">
                    <mat-icon>auto_awesome</mat-icon>
                    {{ a.versiones.length ? 'Encargar otra vez' : 'Encargar a Suno' }}
                    (≈ {{ miles(d.creditos_por_encargo) }} créditos)
                  </button>
                </div>
              }
            </article>
          }

          <p class="secundario nota">
            <mat-icon>gavel</mat-icon>
            Antes de publicar con música de Suno, revisa sus condiciones de uso comercial y si YouTube pone reclamaciones de
            Content ID (hay quien registra pistas hechas con Suno). La música propia del canal no tiene ese riesgo.
          </p>
          @if (error(); as e) {
            <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p>
          }
        </section>
      }
    }
  `,
  styles: `
    .musica {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
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
      p {
        margin: 0;
      }
    }
    .ambiente {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--ay-borde);
    }
    .ambiente__cabeza {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.4rem 0.75rem;
      h4 {
        margin: 0;
        font-family: var(--ay-serif);
        letter-spacing: -0.03em;
        font-size: 1.05rem;
        text-transform: capitalize;
      }
    }
    .chip {
      padding: 0.1rem 0.6rem;
      border: 1px solid var(--ay-borde-fuerte);
      border-radius: 99px;
      font-size: 0.75rem;
      color: var(--ay-tenue);
    }
    .chip--suno {
      color: var(--ay-pago);
      border-color: var(--ay-pago);
    }
    .opciones {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin: 0;
      padding: 0;
      list-style: none;
      li {
        display: grid;
        grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.3rem 0.5rem;
        border-radius: var(--ay-radio-peq);
      }
      li.elegida {
        background: var(--ay-pago-suave);
      }
      app-onda-audio {
        width: 100%;
        max-width: none;
      }
    }
    .opcion__nombre {
      font-size: 0.9rem;
    }
    .usada {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0 0.75rem;
      font-size: 0.85rem;
      color: var(--ay-pago);
      mat-icon {
        font-size: 1.1rem;
        width: 1.1rem;
        height: 1.1rem;
      }
    }
    .prompt {
      summary {
        cursor: pointer;
        font-size: 0.85rem;
        color: var(--ay-tenue);
      }
      textarea {
        width: 100%;
        margin-top: 0.4rem;
        padding: 0.5rem 0.65rem;
        border: 1px solid var(--ay-borde-fuerte);
        border-radius: var(--ay-radio-peq);
        background: var(--ay-superficie-2);
        color: var(--ay-tinta);
        font: 0.85rem/1.45 var(--ay-mono);
        resize: vertical;
        box-sizing: border-box;
      }
    }
    .prompt__pie {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.25rem 0.5rem;
      font-size: 0.78rem;
      .largo {
        color: var(--ay-error);
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
    .boton-pago {
      color: var(--ay-pago);
      border-color: var(--ay-pago);
    }
    .nota {
      display: flex;
      gap: 0.4rem;
      margin: 0;
      font-size: 0.8rem;
      mat-icon {
        flex: none;
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }
    }
    .secundario {
      color: var(--ay-tenue);
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
      color: var(--ay-error);
    }
    .girando {
      animation: girar 1.2s linear infinite;
    }
    @keyframes girar {
      to {
        transform: rotate(360deg);
      }
    }
    @media (max-width: 40rem) {
      .opciones li {
        grid-template-columns: 1fr auto;
        app-onda-audio {
          grid-column: 1 / -1;
          grid-row: 2;
        }
      }
    }
  `,
})
export class MusicaAi33 {
  protected readonly miles = miles;
  readonly video = input.required<VideoDetalle>();

  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly tareas = inject(TareasService);
  private readonly confirmar = inject(ConfirmarService);

  private readonly recurso = httpResource<MusicaVideo>(() => {
    this.eventos.version();
    return `/api/videos/${this.video().id}/musica`;
  });
  protected readonly datos = conservar(this.recurso);
  protected readonly error = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  /** Límite de caracteres del prompt: lo da el backend (Ajustes → proveedores → suno.max_prompt). */
  protected readonly maxPrompt = computed(() => this.datos()?.max_prompt ?? 500);
  /** Prompts editados y aún sin guardar, por ambiente. */
  private readonly borradores = signal<Record<string, string>>({});

  private readonly tareasMusica = computed(() =>
    this.tareas.tareas().filter((t) => t.herramienta === 'musica_ai33' && t.video_id === this.video().id &&
      !TERMINADAS.includes(t.estado)),
  );
  protected readonly encargando = computed(() => this.tareasMusica().length > 0);

  protected enMarcha(ambiente: string): boolean {
    return this.tareasMusica().some((t) => t.argumentos['ambiente'] === ambiente);
  }

  protected borrador(a: AmbienteMusica): string {
    return this.borradores()[a.ambiente] ?? a.prompt;
  }

  protected cambiado(a: AmbienteMusica): boolean {
    const b = this.borradores()[a.ambiente];
    return b !== undefined && b.trim() !== a.prompt;
  }

  protected editar(a: AmbienteMusica, texto: string): void {
    this.borradores.update((x) => ({ ...x, [a.ambiente]: texto }));
  }

  protected urlPropia(ambiente: string, picos?: number): string {
    const base = `/api/videos/${this.video().id}/musica/${ambiente}/propia`;
    return picos ? `${base}?picos=${picos}` : base;
  }

  protected rangos(n: number[]): string {
    const partes: string[] = [];
    for (let i = 0; i < n.length; i++) {
      let j = i;
      while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
      partes.push(j > i ? `${n[i]}–${n[j]}` : `${n[i]}`);
      i = j;
    }
    return partes.join(', ');
  }

  protected minutos(s: number): string {
    return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  }

  protected euros(e: number): string {
    return eurosLlano(e);
  }

  protected async elegir(a: AmbienteMusica, n: number): Promise<void> {
    await this.pedir(() => this.http.post(`/api/videos/${this.video().id}/musica/${a.ambiente}/elegir`, { n }));
  }

  protected async guardarPrompt(a: AmbienteMusica): Promise<boolean> {
    const ok = await this.pedir(() =>
      this.http.put(`/api/videos/${this.video().id}/musica/${a.ambiente}/prompt`, { prompt: this.borrador(a) }));
    if (ok) this.olvidarBorrador(a);
    return ok;
  }

  protected async restaurarPrompt(a: AmbienteMusica): Promise<void> {
    if (await this.pedir(() => this.http.put(`/api/videos/${this.video().id}/musica/${a.ambiente}/prompt`, { prompt: '' }))) {
      this.olvidarBorrador(a);
    }
  }

  /** DE PAGO: guarda el prompt si se ha editado, pide el coste en ese momento y confirma exactamente esa cifra. */
  protected async encargar(a: AmbienteMusica): Promise<void> {
    this.error.set(null);
    if (this.cambiado(a) && !(await this.guardarPrompt(a))) return;
    let d: MusicaVideo;
    try {
      d = await firstValueFrom(this.http.get<MusicaVideo>(`/api/videos/${this.video().id}/musica`));
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo calcular el coste'));
      return;
    }
    const actual = d.ambientes.find((x) => x.ambiente === a.ambiente);
    const ok = await this.confirmar.pedir({
      titulo: `Encargar «${a.ambiente}» a Suno`,
      tono: 'pago',
      creditos: d.creditos_por_encargo,
      coste: `≈ ${miles(d.creditos_por_encargo)} créditos (${this.euros(d.euros_por_encargo)})`,
      mensaje: 'Música instrumental a medida para las escenas ' + this.rangos(a.escenas) + ', con la descripción de la tarjeta.',
      detalles: [
        'Llegan 2 versiones de unos 3 minutos, igualadas al volumen de la música del canal; suele tardar menos de un minuto.',
        ...(a.versiones.length ? ['Sustituye las versiones que tienes ahora de este ambiente (y la elección).'] : []),
        actual?.prompt_propio ? 'Descripción propia de este vídeo.' : 'Descripción por defecto del canal.',
      ],
      aviso: 'Cada encargo se paga, también si luego no te gusta ninguna de las dos versiones.',
      aceptar: 'Encargar (de pago)',
      icono: 'music_note',
    });
    if (!ok) return;
    this.error.set(await this.tareas.lanzar('musica_ai33', this.video().id,
      { ambiente: a.ambiente, confirmado: true, previsto: d.creditos_por_encargo }));
  }

  private olvidarBorrador(a: AmbienteMusica): void {
    this.borradores.update((x) => {
      const { [a.ambiente]: _, ...resto } = x;
      return resto;
    });
  }

  private async pedir(peticion: () => import('rxjs').Observable<unknown>): Promise<boolean> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(peticion());
      return true;
    } catch (e) {
      this.error.set(this.mensaje(e, 'No se pudo guardar'));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  private mensaje(e: unknown, defecto: string): string {
    return mensajeError(e, defecto);
  }
}
