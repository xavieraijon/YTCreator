import { HttpClient, httpResource } from '@angular/common/http';
import { Component, HostListener, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { EventosService } from '../core/eventos.service';
import { urlMedio } from '../core/medios';
import { Imagen, VideoDetalle } from '../core/modelos';
import { TERMINADAS, TareasService, porcentajeTarea } from '../core/tareas.service';
import { conservar } from './conservar';
import { ConfirmarService } from './confirmar';
import { mensajeError } from '../core/errores';
import { miles } from '../core/formato';

/** Fallos frecuentes (teclas 1-7). Los que klein no sabe arreglar hacen que se proponga ai33. */
const TITULOS_TAREA: Record<string, string> = {
  rehacer_imagen: 'Rehaciendo (gratis)',
  rehacer_imagen_ai33: 'Rehaciendo con el servicio de pago (su cola tarda de minutos a horas)',
  corregir_prompts: 'Claude corrige las descripciones',
  imagenes: 'Generando imágenes',
  montar: 'Montando el vídeo',
};

export const ETIQUETAS = [
  { clave: 'anatomia', texto: 'Anatomía / manos', ai33: true },
  { clave: 'cantidad', texto: 'Cantidad incorrecta', ai33: true },
  { clave: 'guion', texto: 'No cuenta lo del guion', ai33: false },
  { clave: 'personaje', texto: 'Personaje distinto al de antes', ai33: true },
  { clave: 'deforme', texto: 'Objeto deformado', ai33: false },
  { clave: 'anacronismo', texto: 'Anacronismo', ai33: false },
  { clave: 'estilo', texto: 'Fuera de estilo', ai33: false },
] as const;

type Filtro = 'rehechas' | 'sin_revisar' | 'mal' | 'todas';
type Servicio = 'klein' | 'ai33';
interface Correccion {
  prompt: string;
  explicacion: string;
  servicio: Servicio | null;
  usar: boolean;
}

export interface DatosModoRevision {
  videoId: number;
  canal: string;
}

/**
 * Modo revisión (01/10): pasar las imágenes con el teclado (→/B bien, M mal, ← atrás, A me quedo con la
 * anterior), marcar con etiquetas en dos segundos, y rehacer todas las marcadas de una vez: Claude corrige los
 * prompts en lote, el servicio se propone por el tipo de fallo y se lanza un rehacer por servicio.
 */
@Component({
  selector: 'app-modo-revision',
  imports: [MatButton, MatIconButton, MatIcon, MatProgressBar],
  templateUrl: './modo-revision.html',
  styleUrl: './modo-revision.scss',
})
export class ModoRevision {
  protected readonly miles = miles;
  private readonly datos = inject<DatosModoRevision>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ModoRevision>);
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  private readonly tareas = inject(TareasService);
  private readonly confirmar = inject(ConfirmarService);
  private readonly campoTexto = viewChild<ElementRef<HTMLInputElement>>('campo');

  private readonly recurso = httpResource<VideoDetalle>(() => {
    this.eventos.version();
    return `/api/videos/${this.datos.videoId}`;
  });
  protected readonly video = conservar(this.recurso);
  protected readonly etiquetas = ETIQUETAS;

  protected readonly vista = signal<'revisar' | 'lote'>('revisar');
  protected readonly filtro = signal<Filtro>('rehechas');
  /** Las imágenes de la pasada, fijas al elegir el filtro: marcar una no la saca de la lista. */
  private readonly pasada = signal<string[]>([]);
  protected readonly indice = signal(0);
  protected readonly marcando = signal(false);
  protected readonly elegidas = signal<Set<string>>(new Set());
  protected readonly texto = signal('');
  protected readonly ocupado = signal(false);
  protected readonly aviso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  // --- Lote
  protected readonly servicios = signal<Record<string, Servicio>>({});
  /** Propuestas de Claude guardadas en el vídeo (tarea «corregir_prompts»): sobreviven a cerrar la ventana. */
  private readonly propuestasRes = httpResource<Record<string, Omit<Correccion, 'usar'>>>(() => {
    this.eventos.version();
    return `/api/videos/${this.datos.videoId}/revision/propuestas`;
  });
  private readonly propuestas = conservar(this.propuestasRes);
  /** Lo que el usuario cambia encima de cada propuesta (usarla o no, editar el prompt). */
  private readonly ajustes = signal<Record<string, { usar?: boolean; prompt?: string }>>({});
  protected readonly correcciones = computed<Record<string, Correccion>>(() => {
    const salida: Record<string, Correccion> = {};
    for (const [id, p] of Object.entries(this.propuestas() ?? {})) {
      salida[id] = { ...p, usar: true, ...this.ajustes()[id] } as Correccion;
    }
    return salida;
  });
  /** La tarea de Claude en marcha para este vídeo (se ve también en el panel de Tareas). */
  protected readonly tareaClaude = computed(() =>
    this.tareas.tareas().find((t) => t.herramienta === 'corregir_prompts' && t.video_id === this.datos.videoId &&
      !TERMINADAS.includes(t.estado)) ?? null,
  );
  protected readonly corrigiendo = computed(() => !!this.tareaClaude());
  protected readonly avanceClaude = computed(() => {
    const t = this.tareaClaude();
    return t ? { porcentaje: porcentajeTarea(t), etapa: t.progreso?.etapa ?? 'En cola…' } : null;
  });
  protected readonly creditosAi33 = signal(1720);

  /** Tareas de este vídeo que siguen en marcha (rehacer, Claude, imágenes, montar): se ven arriba con su barra. */
  protected readonly tareasEnMarcha = computed(() =>
    this.tareas.tareas()
      .filter((t) => t.video_id === this.datos.videoId && !TERMINADAS.includes(t.estado) &&
        (t.herramienta.startsWith('rehacer_imagen') || ['corregir_prompts', 'imagenes', 'montar'].includes(t.herramienta)))
      .map((t) => ({
        id: t.id,
        titulo: TITULOS_TAREA[t.herramienta] ?? t.titulo,
        cuantas: String(t.argumentos['ids'] ?? '').split(',').filter(Boolean).length,
        porcentaje: porcentajeTarea(t),
        detalle: t.estado === 'en_cola' ? 'En cola…'
          : [t.progreso?.total ? `${t.progreso.hecho ?? 0} de ${t.progreso.total} hechas` : null,
            t.progreso?.etapa ?? t.progreso?.texto?.trim() ?? null].filter(Boolean).join(' · '),
      })),
  );

  private readonly revisables = computed<Imagen[]>(() =>
    (this.video()?.imagenes ?? []).filter((i) => i.origen === 'prompt' && i.existe),
  );
  /** Imágenes que se están rehaciendo y aún no han llegado: no se pueden volver a mandar (se pagaría dos veces). */
  protected readonly rehaciendose = computed(() => {
    const llegadas = new Set(this.revisables().filter((i) => i.revision?.estado !== 'mal').map((i) => i.ident));
    return new Set(
      this.tareas.tareas()
        .filter((t) => t.herramienta.startsWith('rehacer_imagen') && t.video_id === this.datos.videoId &&
          !TERMINADAS.includes(t.estado))
        .flatMap((t) => String(t.argumentos['ids'] ?? '').split(',').filter((id) => id && !llegadas.has(id))),
    );
  });
  protected readonly cuentas = computed(() => {
    const r = this.revisables();
    return {
      rehechas: r.filter((i) => i.revision?.estado === 'rehecha').length,
      sin_revisar: r.filter((i) => !i.revision).length,
      mal: r.filter((i) => i.revision?.estado === 'mal').length,
      todas: r.length,
    };
  });
  protected readonly actual = computed<Imagen | null>(() => {
    const id = this.pasada()[this.indice()];
    return this.revisables().find((i) => i.ident === id) ?? null;
  });
  protected readonly total = computed(() => this.pasada().length);
  /** La versión anterior, al lado de la actual, para comparar (si se guardó al rehacerla). */
  protected readonly anterior = computed(() => this.actual()?.revision?.anteriores?.at(-1) ?? null);
  /** Bandeja: las marcadas como mal que aún no se han rehecho ni se están rehaciendo (de todo el vídeo). */
  protected readonly bandeja = computed(() =>
    this.revisables().filter((i) => i.revision?.estado === 'mal' && !this.rehaciendose().has(i.ident)));
  protected readonly hechas = computed(() =>
    this.pasada().filter((id) => {
      const i = this.revisables().find((x) => x.ident === id);
      return i?.revision?.estado === 'bien' || i?.revision?.estado === 'mal';
    }).length,
  );
  protected readonly resumenLote = computed(() => {
    const s = this.servicios();
    const ids = this.bandeja().map((i) => i.ident);
    const ai33 = ids.filter((id) => s[id] === 'ai33');
    return { klein: ids.length - ai33.length, ai33: ai33.length, creditos: ai33.length * this.creditosAi33() };
  });

  constructor() {
    // Primera carga: empieza por las rehechas (si hay) o por las que nadie ha revisado.
    let iniciado = false;
    effect(() => {
      const c = this.cuentas();
      if (iniciado || !this.video()) return;
      iniciado = true;
      this.elegirFiltro(c.rehechas ? 'rehechas' : c.sin_revisar ? 'sin_revisar' : c.mal ? 'mal' : 'todas');
    });
    // Servicio propuesto para cada marcada: el que tenga, o ai33 si el fallo es de los que klein no arregla.
    effect(() => {
      const actual = this.servicios();
      const nuevo = { ...actual };
      for (const i of this.bandeja()) {
        if (nuevo[i.ident]) continue;
        const etiquetas = i.revision?.motivo?.toLowerCase() ?? '';
        const pideAi33 = ETIQUETAS.some((e) => e.ai33 && etiquetas.includes(e.texto.toLowerCase()));
        nuevo[i.ident] = i.motor === 'ai33' || pideAi33 ? 'ai33' : 'klein';
      }
      if (Object.keys(nuevo).length !== Object.keys(actual).length) this.servicios.set(nuevo);
    });
    // Cuando llegan propuestas que recomiendan ai33 donde la regla decía klein, se acepta ai33.
    effect(() => {
      const p = this.propuestas() ?? {};
      const s = this.servicios();
      const cambios = Object.entries(p).filter(([id, c]) => c.servicio === 'ai33' && s[id] && s[id] !== 'ai33');
      if (cambios.length) this.servicios.update((x) => ({ ...x, ...Object.fromEntries(cambios.map(([id]) => [id, 'ai33'])) }));
    });
    void firstValueFrom(this.http.get<{ creditos_por_imagen: number }>(`/api/videos/${this.datos.videoId}/ai33`,
      { params: { vivo: false } })).then((c) => this.creditosAi33.set(c.creditos_por_imagen)).catch(() => undefined);
  }

  static abrir(dialogo: MatDialog, datos: DatosModoRevision) {
    return dialogo.open(ModoRevision, {
      data: datos, width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh',
      panelClass: 'panel-modo-revision', disableClose: true, autoFocus: false,
    });
  }

  protected url(ruta: string | null): string {
    return ruta ? urlMedio(this.datos.canal, ruta) : '';
  }

  protected elegirFiltro(f: Filtro): void {
    this.filtro.set(f);
    const r = this.revisables();
    const ids = r.filter((i) =>
      f === 'todas' ? true : f === 'sin_revisar' ? !i.revision
        : f === 'rehechas' ? i.revision?.estado === 'rehecha' : i.revision?.estado === 'mal',
    ).map((i) => i.ident);
    this.pasada.set(ids);
    this.indice.set(0);
    this.cerrarMarca();
  }

  protected mover(d: number): void {
    const n = this.total();
    if (!n) return;
    this.indice.set(Math.min(n - 1, Math.max(0, this.indice() + d)));
    this.cerrarMarca();
  }

  // --- Marcar

  protected async bien(): Promise<void> {
    const img = this.actual();
    if (!img || this.ocupado()) return;
    if (img.revision?.estado !== 'bien') {
      if (!(await this.enviar(img.ident, { estado: 'bien' }))) return;
    }
    this.siguiente();
  }

  protected abrirMarca(): void {
    const img = this.actual();
    if (!img) return;
    this.marcando.set(true);
    this.elegidas.set(new Set());
    this.texto.set('');
    setTimeout(() => this.campoTexto()?.nativeElement.focus(), 30);   // el campo aparece en el siguiente pintado
  }

  protected cerrarMarca(): void {
    this.marcando.set(false);
  }

  protected alternarEtiqueta(clave: string): void {
    const s = new Set(this.elegidas());
    if (s.has(clave)) s.delete(clave);
    else s.add(clave);
    this.elegidas.set(s);
  }

  protected async guardarMal(): Promise<void> {
    const img = this.actual();
    const elegidas = ETIQUETAS.filter((e) => this.elegidas().has(e.clave));
    const texto = this.texto().trim();
    if (!img || (!elegidas.length && !texto)) {
      this.error.set('Elige al menos un fallo o escribe qué está mal');
      return;
    }
    const motivo = [elegidas.map((e) => e.texto).join(', '), texto].filter(Boolean).join(': ');
    const ok = await this.enviar(img.ident, { estado: 'mal', motivo, etiquetas: elegidas.map((e) => e.clave) });
    if (!ok) return;
    // Servicio propuesto para el lote según el fallo.
    const ai33 = img.motor === 'ai33' || elegidas.some((e) => e.ai33);
    this.servicios.update((s) => ({ ...s, [img.ident]: ai33 ? 'ai33' : 'klein' }));
    this.cerrarMarca();
    this.siguiente();
  }

  protected async quedarmeAnterior(): Promise<void> {
    const img = this.actual();
    if (!img || !this.anterior() || this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.datos.videoId}/imagenes/${img.ident}/restaurar`, {}));
      this.avisar(`${img.ident}: te quedas con la anterior`);
      this.siguiente();
    } catch (e) {
      this.error.set(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  private siguiente(): void {
    if (this.indice() < this.total() - 1) this.indice.update((i) => i + 1);
    else this.avisar('Has llegado al final de esta pasada');
  }

  private async enviar(ident: string, cuerpo: object): Promise<boolean> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.datos.videoId}/imagenes/${ident}/revision`, cuerpo));
      return true;
    } catch (e) {
      this.error.set(this.mensaje(e));
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  private avisar(texto: string): void {
    this.aviso.set(texto);
    setTimeout(() => this.aviso() === texto && this.aviso.set(null), 2500);
  }

  private mensaje(e: unknown): string {
    return mensajeError(e, 'No se pudo guardar');
  }

  // --- Lote

  protected abrirLote(): void {
    this.cerrarMarca();
    this.vista.set('lote');
  }

  protected cambiarServicio(ident: string, s: Servicio): void {
    this.servicios.update((x) => ({ ...x, [ident]: s }));
  }

  protected alternarUso(ident: string): void {
    const usar = !this.correcciones()[ident]?.usar;
    this.ajustes.update((a) => ({ ...a, [ident]: { ...a[ident], usar } }));
  }

  protected editarPrompt(ident: string, prompt: string): void {
    this.ajustes.update((a) => ({ ...a, [ident]: { ...a[ident], prompt } }));
  }

  /** Lanza la tarea «corregir_prompts» (en segundo plano: puedes cerrar la revisión; el resultado se guarda). */
  protected async corregirConClaude(): Promise<void> {
    const ids = this.bandeja().map((i) => i.ident);
    if (!ids.length || this.corrigiendo()) return;
    this.error.set(null);
    const e = await this.tareas.lanzar('corregir_prompts', this.datos.videoId, { ids: ids.join(',') });
    if (e) this.error.set(e);
    else this.avisar('Claude está corrigiendo las descripciones: puedes cerrar; la barra sigue en el panel de Tareas.');
  }

  protected async rehacerLote(): Promise<void> {
    const marcadas = this.bandeja();
    if (!marcadas.length || this.corrigiendo()) return;
    const s = this.servicios();
    const corr = this.correcciones();
    const klein = marcadas.filter((i) => s[i.ident] !== 'ai33').map((i) => i.ident);
    const ai33 = marcadas.filter((i) => s[i.ident] === 'ai33').map((i) => i.ident);
    const conClaude = marcadas.filter((i) => corr[i.ident]?.usar).length;
    const sinCorregir = marcadas.length - marcadas.filter((i) => corr[i.ident]).length;
    const r = this.resumenLote();
    const ok = await this.confirmar.pedir({
      titulo: `Rehacer ${marcadas.length} ${marcadas.length === 1 ? 'imagen' : 'imágenes'}`,
      tono: ai33.length ? 'pago' : 'normal',
      coste: ai33.length ? `≈ ${miles(r.creditos)} créditos (${ai33.length} de pago)` : undefined,
      mensaje: conClaude
        ? `${conClaude} con la descripción corregida por Claude; el resto, con la actual.`
        : 'Con la descripción actual (no has pedido a Claude que las corrija).',
      detalles: [
        ...(klein.length ? [`${klein.length} gratis: ${klein.join(', ')}.`] : []),
        ...(ai33.length ? [`${ai33.length} de pago: ${ai33.join(', ')}.`] : []),
        'Las actuales se guardan: al revisarlas podrás quedarte con la anterior (tecla A).',
      ],
      aviso: sinCorregir && ai33.length
        ? `${sinCorregir} sin descripción corregida: si quieres que Claude las corrija, cancela, pulsa «Corregir las descripciones con ` +
          'Claude», revisa las propuestas y rehaz después. Una vez mandadas al servicio de pago no se pueden cambiar ni cancelar sin perder los créditos.'
        : ai33.length ? 'Las de pago tardan de minutos a horas (su cola) y no se pueden cancelar sin perder los créditos.'
        : undefined,
      aceptar: ai33.length ? 'Rehacer (de pago)' : 'Rehacer',
      icono: 'autorenew',
    });
    if (!ok) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const cambios = marcadas.map((i) => ({
        ident: i.ident,
        prompt: corr[i.ident]?.usar ? corr[i.ident].prompt : null,
        motor: s[i.ident] ?? (i.motor === 'ai33' ? 'ai33' : 'klein'),
      }));
      await firstValueFrom(this.http.post(`/api/videos/${this.datos.videoId}/revision/lote/aplicar`, { cambios }));
      const errores: string[] = [];
      if (klein.length) {
        const e = await this.tareas.lanzar('rehacer_imagen', this.datos.videoId,
          { ids: klein.join(','), motor: 'cloudflare' });
        if (e) errores.push(e);
      }
      if (ai33.length) {
        const e = await this.tareas.lanzar('rehacer_imagen_ai33', this.datos.videoId,
          { ids: ai33.join(','), confirmado: true, previsto: ai33.length });
        if (e) errores.push(e);
      }
      if (errores.length) {
        this.error.set(errores.join(' · '));
        return;
      }
      this.ajustes.set({});
      this.vista.set('revisar');
      this.avisar('Rehaciendo: sigue la barra en el panel de Tareas (arriba). Al terminar, revísalas aquí.');
    } catch (e) {
      this.error.set(this.mensaje(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected cerrar(): void {
    this.ref.close();
  }

  // --- Teclado

  @HostListener('document:keydown', ['$event'])
  protected tecla(e: KeyboardEvent): void {
    const enCampo = (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/);
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.marcando()) this.cerrarMarca();
      else if (this.vista() === 'lote') this.vista.set('revisar');
      else this.cerrar();
      return;
    }
    if (this.vista() !== 'revisar') return;
    if (this.marcando()) {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.guardarMal();
      } else if (!enCampo || e.altKey || !this.texto()) {
        const n = Number(e.key);
        if (n >= 1 && n <= ETIQUETAS.length) {
          e.preventDefault();
          this.alternarEtiqueta(ETIQUETAS[n - 1].clave);
        }
      }
      return;
    }
    if (enCampo) return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight' || k === 'b') {
      e.preventDefault();
      void this.bien();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.mover(-1);
    } else if (k === 'm') {
      e.preventDefault();
      this.abrirMarca();
    } else if (k === 'a' && this.anterior()) {
      e.preventDefault();
      void this.quedarmeAnterior();
    } else if (k === 's') {
      e.preventDefault();
      this.mover(1);
    }
  }
}
