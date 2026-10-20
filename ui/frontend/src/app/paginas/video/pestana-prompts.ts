import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';

import { conservar } from '../../compartido/conservar';
import { Copiar } from '../../compartido/copiar';
import { GrupoLote, textoLote } from '../../compartido/lote-prompts';
import { PreferenciasPrompts } from '../../compartido/preferencias-prompts';
import { GuiaManual } from './guia-manual';
import { VisorImagen } from '../../compartido/visor-imagen';
import { EventosService } from '../../core/eventos.service';
import { urlMedio } from '../../core/medios';
import { Imagen, PromptImagen, Prompts, VideoDetalle } from '../../core/modelos';
import { EstadoImagen, Motor, estadoImagen, recuento } from '../../compartido/estado-imagen';
import { FiltroImagenes, SIN_FILTRO, cumple, nombreFiltro } from '../../compartido/resumen-imagenes';

type Version = 'guion' | 'final';
const CLAVE_VERSION = 'canalyt.prompts.version';

function leerVersion(): Version {
  try {
    return localStorage.getItem(CLAVE_VERSION) === 'guion' ? 'guion' : 'final';
  } catch {
    return 'final';
  }
}

/** Un prompt listo para enseñar: el del guion o el final, y los datos de su imagen en disco. */
interface Fila {
  p: PromptImagen;
  img: Imagen | undefined;
  texto: string | null;
  /** El prompt del guion partido en texto y {personajes}, para resaltarlos. */
  trozos: { texto: string; personaje: boolean }[];
}

const PERSONAJE = /(\{[a-z0-9_]+\})/i;
const ES_PERSONAJE = /^\{[a-z0-9_]+\}$/i;

/** Todos los prompts del vídeo por escenas: buscar, filtrar y copiar uno, una escena o todos. */
@Component({
  selector: 'app-pestana-prompts',
  imports: [MatButton, MatIconButton, MatButtonToggleModule, MatIcon, MatProgressBar, MatTooltip, GuiaManual],
  templateUrl: './pestana-prompts.html',
  styleUrl: './pestana-prompts.scss',
})
export class PestanaPrompts {
  readonly video = input.required<VideoDetalle>();
  private readonly eventos = inject(EventosService);
  private readonly dialogo = inject(MatDialog);
  protected readonly copia = inject(Copiar);
  private readonly prefs = inject(PreferenciasPrompts);

  /** «Final» por defecto: es el que sirve para generarlas a mano. Se recuerda en este navegador. */
  protected readonly version = signal<Version>(leerVersion());
  protected readonly filtro = signal<FiltroImagenes>(SIN_FILTRO);
  protected readonly buscar = signal('');
  protected readonly verEstilo = signal(false);

  private readonly recurso = httpResource<Prompts>(() => {
    this.eventos.version();
    return `/api/videos/${this.video().id}/prompts`;
  });
  protected readonly datos = conservar(this.recurso);
  protected readonly cargando = computed(() => this.recurso.isLoading() && !this.datos());
  protected readonly error = computed(() => !!this.recurso.error() && !this.datos());

  private readonly imagenes = computed(() => new Map(this.video().imagenes.map((i) => [i.ident, i])));

  protected readonly personajes = computed(() =>
    Object.entries(this.datos()?.personajes ?? {}).map(([nombre, descripcion]) => ({ nombre, descripcion })),
  );

  /** Escenas con sus filas, ya filtradas; las escenas sin filas no salen. */
  protected readonly escenas = computed(() => {
    const d = this.datos();
    if (!d) return [];
    const q = this.buscar().trim().toLowerCase();
    const filtro = this.filtro();
    const final = this.version() === 'final';
    return d.escenas
      .map((e) => {
        const filas: Fila[] = e.imagenes
          .map((p) => {
            const img = this.imagenes().get(p.ident);
            const texto = final ? (p.prompt_final ?? p.prompt) : p.prompt;
            return { p, img, texto, trozos: this.trozos(p.prompt) };
          })
          .filter(({ p, img, texto }) => {
            if (!cumple(filtro, this.estado(p, img), p.origen === 'prompt' ? p.motor : null)) return false;
            if (!q) return true;
            return [p.ident, texto, p.rotulo, e.capitulo, e.texto].some((t) => t?.toLowerCase().includes(q));
          });
        return { ...e, filas, titulo: e.capitulo ?? this.inicio(e.texto) };
      })
      .filter((e) => e.filas.length);
  });

  /** Recuento por estado (el mismo que el cuadro de la pestaña Imágenes). */
  protected readonly cuenta = computed(() => {
    const r = recuento(this.video().imagenes);
    const motor = (m: Motor) => recuento(this.video().imagenes, m).total;
    return {
      ...r,
      klein: motor('klein'),
      ai33: motor('ai33'),
      visibles: this.escenas().reduce((s, e) => s + e.filas.filter((f) => f.texto).length, 0),
    };
  });

  protected readonly estados: { clave: EstadoImagen | 'generar' | null; texto: string }[] = [
    { clave: null, texto: 'Todas' },
    { clave: 'generar', texto: 'Por generar' },
    { clave: 'nueva', texto: 'Nuevas' },
    { clave: 'rehacer', texto: 'A rehacer' },
    { clave: 'cola', texto: 'En cola ai33' },
    { clave: 'lista', texto: 'Listas' },
  ];

  protected numero(clave: EstadoImagen | 'generar' | null): number {
    const c = this.cuenta();
    if (clave === null) return c.total;
    if (clave === 'generar') return c.nueva + c.rehacer;
    return clave === 'lista' ? c.lista + c.fija : c[clave];     // las reutilizadas ya están: cuentan como listas
  }

  protected cambiarEstado(estado: EstadoImagen | 'generar' | null): void {
    this.filtro.update((f) => ({ ...f, estado }));
  }

  protected cambiarMotor(motor: Motor | null): void {
    this.filtro.update((f) => ({ ...f, motor: f.motor === motor ? null : motor }));
  }

  /** El estado de una imagen del guion (sin datos en disco, se trata como nueva). */
  private estado(p: PromptImagen, img: Imagen | undefined): EstadoImagen {
    if (p.origen !== 'prompt') return 'fija';
    return img ? estadoImagen(img) : 'nueva';
  }

  protected url(ruta: string): string {
    return urlMedio(this.video().canal, ruta, 480);
  }

  protected copiarUno(f: Fila): void {
    if (f.texto) this.copia.copiar(this.paraCopiar(f.texto), f.p.ident, `Prompt ${f.p.ident} copiado`);
  }

  protected cambiarVersion(v: Version): void {
    this.version.set(v);
    try {
      localStorage.setItem(CLAVE_VERSION, v);
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }

  protected copiarEscena(e: { numero: number; titulo: string; filas: Fila[] }): void {
    const n = e.filas.filter((f) => f.texto).length;
    this.copia.copiar(this.lote([e]), 'escena-' + e.numero, `Escena ${e.numero}: ${n} prompts copiados`);
  }

  /** Lo que se ve (con el filtro y la búsqueda), agrupado por escenas. */
  protected copiarTodo(): void {
    this.copia.copiar(this.lote(this.escenas()), 'todo', `${this.cuenta().visibles} prompts copiados, por escenas`);
  }

  protected copiarTexto(texto: string, clave: string, mensaje: string): void {
    this.copia.copiar(texto, clave, mensaje);
  }

  protected miniaturaTexto(m: { prompt: string | null; prompt_final: string | null }): string | null {
    return this.version() === 'final' ? (m.prompt_final ?? m.prompt) : m.prompt;
  }

  protected abrir(f: Fila): void {
    if (!f.img) return;
    const imagenes = this.video().imagenes;
    VisorImagen.abrir(this.dialogo, { canal: this.video().canal, imagenes, indice: imagenes.indexOf(f.img), videoId: this.video().id });
  }

  protected irA(numero: number): void {
    document.getElementById('escena-' + numero)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Las reutilizadas, clips y archivos propios no llevan prompt: textoLote las salta. */
  private lote(escenas: { numero: number; titulo: string; filas: Fila[] }[]): string {
    const version = this.version() === 'final' ? 'versión final' : 'versión del guion';
    const grupos: GrupoLote[] = escenas.map((e) => ({
      escena: e.numero,
      titulo: e.titulo,
      items: e.filas.map((f) => ({ ident: f.p.ident, motor: f.p.motor, texto: f.texto ? this.paraCopiar(f.texto) : '' })),
    }));
    const titulo = `${this.video().titulo || this.video().carpeta} · ${nombreFiltro(this.filtro()).toLowerCase()} (${version})`;
    return textoLote(titulo, grupos, this.version() === 'final' ? this.prefs.cabecera(this.video().guia) : []);
  }

  /** En la versión final, con la instrucción de estilo delante si está activada (para pegar en Gemini). */
  private paraCopiar(texto: string): string {
    return this.version() === 'final' ? this.prefs.preparar(texto, this.video().guia) : texto;
  }

  /** Las primeras palabras de la voz, para las escenas sin capítulo. */
  private inicio(texto: string): string {
    const palabras = texto.split(' ');
    return palabras.length > 9 ? palabras.slice(0, 9).join(' ') + '…' : texto;
  }

  private trozos(prompt: string | null): Fila['trozos'] {
    if (!prompt) return [];
    return prompt
      .split(PERSONAJE)
      .filter(Boolean)
      .map((texto) => ({ texto, personaje: ES_PERSONAJE.test(texto) }));
  }
}
