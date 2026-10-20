import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../core/errores';
import { Imagen } from '../core/modelos';

export const TIPOS_IMAGEN = 'image/png,image/jpeg,image/webp';

/** Sube una imagen propia a un hueco del guion (PUT /api/videos/:id/imagenes/:ident/propia). Devuelve el error o null. */
export async function subirImagen(http: HttpClient, videoId: number, ident: string, archivo: File): Promise<string | null> {
  try {
    await firstValueFrom(http.put(`/api/videos/${videoId}/imagenes/${ident}/propia`, archivo, { params: { nombre: archivo.name } }));
    return null;
  } catch (e) {
    return mensajeError(e);
  }
}

/** En el visor de una imagen: ponerle una propia en su lugar o, si ya es propia, volver a generarla (bloque B). */
@Component({
  selector: 'app-subir-imagen',
  imports: [MatButton, MatIcon],
  template: `
    @let img = imagen();
    @if (img.origen === 'prompt' || img.origen === 'imagen') {
      <div class="subir">
        <input #archivo type="file" [accept]="tipos" hidden (change)="subir($any($event.target))" />
        <button mat-stroked-button type="button" [disabled]="ocupado()" (click)="archivo.click()">
          <mat-icon>{{ ocupado() ? 'sync' : 'upload' }}</mat-icon>{{ img.origen === 'imagen' ? 'Cambiar por otra mía' : 'Subir la mía en su lugar' }}
        </button>
        @if (img.origen === 'imagen' && img.prompt) {
          <button mat-button type="button" [disabled]="ocupado()" (click)="quitar()"><mat-icon>undo</mat-icon>Volver a generarla</button>
        }
      </div>
      @if (error(); as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
    }
  `,
  styles: `
    .subir { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.75rem 0; }
    .error { display: flex; gap: 0.4rem; align-items: center; color: var(--ay-error); margin: 0; }
  `,
})
export class SubirImagen {
  readonly videoId = input.required<number>();
  readonly imagen = input.required<Imagen>();
  readonly cambiado = output<void>();
  private readonly http = inject(HttpClient);
  protected readonly tipos = TIPOS_IMAGEN;
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async subir(campo: HTMLInputElement): Promise<void> {
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    this.ocupado.set(true);
    this.error.set(await subirImagen(this.http, this.videoId(), this.imagen().ident, archivo));
    this.ocupado.set(false);
    if (!this.error()) this.cambiado.emit();
  }

  protected async quitar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.delete(`/api/videos/${this.videoId()}/imagenes/${this.imagen().ident}/propia`));
      this.cambiado.emit();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}

/**
 * Subir varias imágenes de golpe: se colocan, por orden de nombre de archivo, en los huecos del guion que aún no tienen
 * imagen (los que se generarían desde su descripción). Para producir sin servicio de imágenes.
 */
@Component({
  selector: 'app-subir-imagenes',
  imports: [MatButton, MatIcon],
  template: `
    @if (huecos().length || resultado()) {
    <section class="lote tarjeta">
      <div>
        <strong>¿Tienes tus propias imágenes?</strong>
        <p class="secundario">
          Elige varias a la vez: se colocan por orden de nombre en los huecos que faltan
          ({{ huecos().length === 1 ? 'queda 1' : 'quedan ' + huecos().length }}). Para cambiar una concreta, ábrela y pulsa «Subir la mía en su lugar».
        </p>
      </div>
      <input #archivos type="file" [accept]="tipos" multiple hidden (change)="subir($any($event.target))" />
      <button mat-stroked-button type="button" [disabled]="!huecos().length || progreso() !== null" (click)="archivos.click()">
        <mat-icon>{{ progreso() !== null ? 'sync' : 'upload' }}</mat-icon>
        {{ progreso() !== null ? 'Subiendo ' + progreso() + ' de ' + total() + '…' : 'Subir varias' }}
      </button>
      @if (resultado(); as r) { <p class="secundario" role="status">{{ r }}</p> }
      @for (e of errores(); track e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
    </section>
    }
  `,
  styles: `
    .lote { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.15rem; }
    .lote p { margin: 0.2rem 0 0; }
    .lote button { align-self: flex-start; }
    .error { display: flex; gap: 0.4rem; align-items: center; color: var(--ay-error); margin: 0; }
  `,
})
export class SubirImagenes {
  readonly videoId = input.required<number>();
  readonly imagenes = input.required<Imagen[]>();
  readonly cambiado = output<void>();
  private readonly http = inject(HttpClient);
  protected readonly tipos = TIPOS_IMAGEN;
  /** Huecos que se generarían y aún no existen, en el orden del vídeo. */
  protected readonly huecos = computed(() => this.imagenes().filter((i) => i.origen === 'prompt' && !i.existe && !i.ident.startsWith('v')));
  protected readonly progreso = signal<number | null>(null);
  protected readonly total = signal(0);
  protected readonly resultado = signal<string | null>(null);
  protected readonly errores = signal<string[]>([]);

  protected async subir(campo: HTMLInputElement): Promise<void> {
    const archivos = [...(campo.files ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    campo.value = '';
    const huecos = this.huecos();
    const pares = archivos.slice(0, huecos.length).map((a, i) => ({ archivo: a, ident: huecos[i].ident }));
    if (!pares.length) return;
    this.errores.set([]);
    this.total.set(pares.length);
    let bien = 0;
    for (const [i, p] of pares.entries()) {
      this.progreso.set(i + 1);
      const error = await subirImagen(this.http, this.videoId(), p.ident, p.archivo);
      if (error) this.errores.update((e) => [...e, `${p.archivo.name} → ${p.ident}: ${error}`]);
      else bien++;
    }
    this.progreso.set(null);
    const sobran = archivos.length - pares.length;
    this.resultado.set(`${bien === 1 ? '1 imagen colocada' : bien + ' imágenes colocadas'} (de ${pares[0].ident} a ${pares[pares.length - 1].ident})`
      + (sobran ? `; ${sobran === 1 ? 'sobra 1' : 'sobran ' + sobran}: no quedaban huecos` : '') + '.');
    this.cambiado.emit();
  }
}
