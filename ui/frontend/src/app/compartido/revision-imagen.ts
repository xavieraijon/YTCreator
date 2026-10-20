import { ConfirmarService } from './confirmar';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { CuotasService } from '../core/cuotas.service';
import { ColaAi33, Imagen } from '../core/modelos';
import { TERMINADAS, TareasService } from '../core/tareas.service';
import { mensajeError } from '../core/errores';
import { miles } from '../core/formato';

type Servicio = 'cloudflare' | 'local' | 'ai33';

/** Problemas típicos: un clic y quedan escritos en el motivo. */
const ATAJOS = [
  'Anatomía: brazos, manos o dedos de más o de menos',
  'Anacronismo (objeto o ropa de otra época)',
  'Texto o letras deformadas',
  'No cuenta lo que dice la voz',
  'Fuera de estilo o de paleta',
  'El personaje no se parece',
  'Encuadre o composición',
];

/**
 * Revisión de una imagen: marcarla bien o mal (con el motivo, que Claude y el director de arte leen para
 * corregir el prompt), ajustar su prompt y rehacerla eligiendo el servicio. Ver la versión anterior.
 */
@Component({
  selector: 'app-revision-imagen',
  imports: [DatePipe, DecimalPipe, MatButton, MatIcon],
  templateUrl: './revision-imagen.html',
  styleUrl: './revision-imagen.scss',
})
export class RevisionImagen {
  readonly videoId = input.required<number>();
  readonly imagen = input.required<Imagen>();
  /** Se ha guardado algo: el visor vuelve a pedir el vídeo. */
  readonly cambiado = output<void>();
  /** Ver una versión anterior en grande (ruta relativa al canal) o volver a la actual (null). */
  readonly verAnterior = output<string | null>();

  private readonly http = inject(HttpClient);
  private readonly tareas = inject(TareasService);
  private readonly cuotas = inject(CuotasService);
  private readonly confirmar = inject(ConfirmarService);

  protected readonly atajos = ATAJOS;
  protected readonly abierto = signal(false);
  protected readonly motivo = signal('');
  protected readonly editarPrompt = signal(false);
  protected readonly prompt = signal('');
  protected readonly servicio = signal<Servicio>('cloudflare');
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly anteriorVista = signal<string | null>(null);
  /** Sugerencia de Claude (director de arte): el prompt va al cuadro; aquí, la explicación y el servicio. */
  protected readonly sugiriendo = signal(false);
  protected readonly segundos = signal(0);
  protected readonly sugerencia = signal<{ explicacion: string; servicio: 'klein' | 'ai33' | null; segundos: number } | null>(null);

  protected readonly revision = computed(() => this.imagen().revision);
  protected readonly generable = computed(() => this.imagen().origen === 'prompt');

  /** Imágenes que caben hoy en Cloudflare (≈ 110 neuronas cada una). */
  protected readonly cabenCloudflare = computed(() =>
    Math.floor((this.cuotas.cuotas()?.datos?.cloudflare.libres ?? 0) / 110),
  );
  protected readonly creditosAi33 = signal(1720);

  /** Tarea de rehacer esta imagen que sigue en marcha. */
  protected readonly rehaciendo = computed(() =>
    this.tareas.tareas().find((t) =>
      t.herramienta.startsWith('rehacer_imagen') && t.video_id === this.videoId() &&
      String(t.argumentos['ids'] ?? '').split(',').includes(this.imagen().ident) && !TERMINADAS.includes(t.estado),
    ) ?? null,
  );

  constructor() {
    // Al pasar de imagen: formulario cerrado y valores de esa imagen.
    effect(() => {
      const img = this.imagen();
      this.abierto.set(false);
      this.editarPrompt.set(false);
      this.error.set(null);
      this.anteriorVista.set(null);
      this.sugerencia.set(null);
      this.motivo.set(img.revision?.estado === 'mal' || img.revision?.estado === 'rehecha' ? (img.revision.motivo ?? '') : '');
      this.prompt.set(img.prompt ?? '');
      this.servicio.set(img.motor === 'ai33' ? 'ai33' : this.cabenCloudflare() > 0 ? 'cloudflare' : 'local');
    });
    // El precio real por imagen de ai33 (el del vídeo: con o sin referencia de estilo).
    effect(() => {
      void firstValueFrom(this.http.get<ColaAi33>(`/api/videos/${this.videoId()}/ai33`, { params: { vivo: false } }))
        .then((c) => this.creditosAi33.set(c.creditos_por_imagen))
        .catch(() => undefined);
    });
  }

  protected atajo(texto: string): void {
    const actual = this.motivo().trim();
    this.motivo.set(actual ? `${actual}. ${texto}` : texto);
  }

  protected async bien(): Promise<void> {
    await this.guardar({ estado: 'bien' });
  }

  /** Guarda la marca (y el prompt o el servicio si han cambiado); si `rehacer`, lanza la tarea. */
  protected async mal(rehacer: boolean): Promise<void> {
    const img = this.imagen();
    const servicio = this.servicio();
    const motor = servicio === 'ai33' ? 'ai33' : 'klein';
    if (rehacer && servicio === 'ai33') {
      const c = this.creditosAi33();
      const ok = await this.confirmar.pedir({
        titulo: `Rehacer ${img.ident} con el servicio de pago`,
        tono: 'pago',
        coste: `≈ ${miles(c)} créditos ` +
          `(≈ ${((c / 1_000_000) * (15 / 3.3)).toLocaleString('es', { maximumFractionDigits: 3 })} €)`,
        mensaje: 'Más calidad, sobre todo con personas y manos. La imagen actual se guarda: podrás volver a ella.',
        aviso: 'Tarda de minutos a horas (su cola) y NO se puede cancelar sin perder los créditos.',
        aceptar: 'Rehacer (de pago)',
      });
      if (!ok) return;
    } else if (rehacer && servicio === 'local') {
      const ok = await this.confirmar.pedir({
        titulo: `Rehacer ${img.ident} en este ordenador`,
        mensaje: 'Gratis, en este ordenador.',
        aviso: 'Tarda unos 2 minutos y el ordenador estará ocupado mientras tanto.',
        aceptar: 'Rehacer', icono: 'laptop_mac',
      });
      if (!ok) return;
    }
    const cambios: Record<string, unknown> = { estado: 'mal', motivo: this.motivo() };
    if (this.editarPrompt() && this.prompt().trim() !== (img.prompt ?? '').trim()) cambios['prompt'] = this.prompt();
    if (motor !== (img.motor === 'ai33' ? 'ai33' : 'klein')) cambios['motor'] = motor;
    if (!(await this.guardar(cambios))) return;
    if (!rehacer) return;
    const argumentos: Record<string, unknown> =
      servicio === 'ai33' ? { ids: img.ident, confirmado: true, previsto: 1 } : { ids: img.ident, motor: servicio };
    const error = await this.tareas.lanzar(servicio === 'ai33' ? 'rehacer_imagen_ai33' : 'rehacer_imagen', this.videoId(), argumentos);
    this.error.set(error);
    if (!error) this.abierto.set(false);
    this.cambiado.emit();
  }

  /** Claude mira la imagen, el prompt y el motivo, y propone un prompt corregido (≈ 30 s). */
  protected async sugerir(): Promise<void> {
    const ident = this.imagen().ident;
    this.sugiriendo.set(true);
    this.error.set(null);
    this.segundos.set(0);
    const reloj = setInterval(() => this.segundos.update((s) => s + 1), 1000);
    try {
      const r = await firstValueFrom(
        this.http.post<{ prompt: string; explicacion: string; servicio: 'klein' | 'ai33' | null; segundos: number }>(
          `/api/videos/${this.videoId()}/imagenes/${ident}/sugerir`,
          { motivo: this.motivo() },
        ),
      );
      if (this.imagen().ident !== ident) return; // se ha pasado a otra imagen mientras pensaba
      this.prompt.set(r.prompt);
      this.editarPrompt.set(true);
      this.sugerencia.set({ explicacion: r.explicacion, servicio: r.servicio, segundos: r.segundos });
    } catch (e: unknown) {
      this.error.set(mensajeError(e, 'No se pudo consultar a Claude'));
    } finally {
      clearInterval(reloj);
      this.sugiriendo.set(false);
    }
  }

  /** Vuelve al prompt que había antes de la sugerencia. */
  protected descartarSugerencia(): void {
    this.prompt.set(this.imagen().prompt ?? '');
    this.sugerencia.set(null);
  }

  protected usarServicio(motor: 'klein' | 'ai33'): void {
    this.servicio.set(motor === 'ai33' ? 'ai33' : this.cabenCloudflare() > 0 ? 'cloudflare' : 'local');
  }

  protected alternarAnterior(ruta: string): void {
    const nueva = this.anteriorVista() === ruta ? null : ruta;
    this.anteriorVista.set(nueva);
    this.verAnterior.emit(nueva);
  }

  private async guardar(datos: Record<string, unknown>): Promise<boolean> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.videoId()}/imagenes/${this.imagen().ident}/revision`, datos));
      this.cambiado.emit();
      return true;
    } catch (e: unknown) {
      this.error.set(mensajeError(e, 'No se pudo guardar'));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }
}
