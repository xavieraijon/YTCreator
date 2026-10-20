import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, inject, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import type WaveSurfer from 'wavesurfer.js';

import { urlMedio, urlPicos as urlPicosDirecta } from '../core/medios';

/**
 * Reproductor de audio con su onda (bloque D de docs/plan-mejoras-usuario.md). Los picos se piden ya
 * calculados al backend (`?picos=N`, caché en data/picos/) y se dibujan con wavesurfer.js en un
 * `<canvas>`: una pantalla con muchos audios no descarga ni decodifica cada archivo entero para pintarlos.
 * Un solo componente para voz, música y efectos («se construye una vez», dice el plan). Lleva su propio
 * botón de play/pausa (la onda sola no deja ver que se puede escuchar) dentro de una píldora con fondo
 * suave, para que cada pista se note separada de la siguiente.
 */
@Component({
  selector: 'app-onda-audio',
  imports: [MatIconButton, MatIcon],
  template: `
    <div class="reproductor">
      <button
        mat-icon-button
        type="button"
        class="reproductor__boton"
        [attr.aria-label]="reproduciendo() ? 'Pausar' : 'Reproducir'"
        (click)="alternar()"
      >
        <mat-icon>{{ reproduciendo() ? 'pause' : 'play_arrow' }}</mat-icon>
      </button>
      <div #contenedor class="onda"></div>
    </div>
  `,
  styles: `
    .reproductor {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      width: 100%;
      max-width: 32rem;
      padding: 0.25rem 0.9rem 0.25rem 0.25rem;
      border-radius: 99px;
      background: var(--ay-superficie-2);
      border: 1px solid var(--ay-borde);
    }
    .reproductor__boton {
      flex: none;
      color: var(--ay-acento-fuerte);
    }
    .onda {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class OndaAudio implements AfterViewInit, OnDestroy {
  /** Modo normal: archivo de canales/ (lo resuelve /api/medios). */
  readonly canal = input<string>();
  readonly ruta = input<string>();
  /** Modo URL directa: para audio que no vive bajo canales/ (p. ej. música incluida en el kit) y ya
   * tiene su propia ruta de backend con soporte de `?picos=N`. Si se da, manda sobre `canal`/`ruta`. */
  readonly url = input<string>();
  readonly urlPicos = input<string>();
  /** Nº de picos a pedir: de sobra para el ancho normal del reproductor, sin pasarse de tamaño. */
  readonly numPicos = input(200);

  /** Tiempo actual (s), igual que el `timeupdate` de un <audio>. */
  readonly tiempo = output<number>();
  /** Al pausar (clic, fin del audio o clic en la onda). */
  readonly pausa = output<void>();

  protected readonly reproduciendo = signal(false);

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly http = inject(HttpClient);
  private ws: WaveSurfer | null = null;

  async ngAfterViewInit(): Promise<void> {
    const directa = this.url();
    const url = directa ?? urlMedio(this.canal()!, this.ruta()!);
    const picosUrl = directa ? this.urlPicos() : urlPicosDirecta(this.canal()!, this.ruta()!, this.numPicos());
    let picos: number[] | undefined;
    if (picosUrl) {
      try {
        const r = await firstValueFrom(this.http.get<{ picos: number[] }>(picosUrl));
        picos = r.picos;
      } catch {
        // Sin picos precalculados (audio no permitido o fallo de ffmpeg): wavesurfer los decodifica él mismo.
      }
    }
    const { default: WaveSurfer } = await import('wavesurfer.js');
    this.ws = WaveSurfer.create({
      container: this.contenedor().nativeElement,
      url,
      peaks: picos ? [picos] : undefined,
      height: 36,
      cursorWidth: 1,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      // Las variables de color del tema usan light-dark(): un <style> inline las resuelve bien, pero
      // leídas con getPropertyValue() llegan sin resolver («light-dark(#a, #b)» tal cual) y wavesurfer
      // las descarta, pintando con su negro por defecto. this.color() las resuelve de verdad.
      waveColor: this.color('--ay-borde-fuerte', '#d0d5dd'),
      progressColor: this.color('--ay-acento', '#2b4cf2'),
      cursorColor: this.color('--ay-acento-fuerte', '#2038c4'),
    });
    this.ws.on('timeupdate', (t: number) => this.tiempo.emit(t));
    this.ws.on('play', () => this.reproduciendo.set(true));
    this.ws.on('pause', () => {
      this.reproduciendo.set(false);
      this.pausa.emit();
    });
    this.ws.on('finish', () => this.reproduciendo.set(false));
  }

  ngOnDestroy(): void {
    this.ws?.destroy();
    this.ws = null;
  }

  /** Salta a un momento y reproduce desde ahí (clic en una palabra del karaoke). */
  saltar(segundos: number): void {
    if (!this.ws) return;
    this.ws.setTime(segundos);
    this.ws.play();
  }

  protected alternar(): void {
    this.ws?.playPause();
  }

  /** Resuelve una variable CSS del tema a un color real: un <span> sondaba, con color: var(--x), ya
   * computado por el navegador (incluido light-dark()), es la forma estándar de leerlas desde JS. */
  private color(variable: string, alternativa: string): string {
    const sonda = document.createElement('span');
    sonda.style.display = 'none';
    sonda.style.color = `var(${variable}, ${alternativa})`;
    this.contenedor().nativeElement.appendChild(sonda);
    const resuelto = getComputedStyle(sonda).color;
    sonda.remove();
    return resuelto || alternativa;
  }
}
