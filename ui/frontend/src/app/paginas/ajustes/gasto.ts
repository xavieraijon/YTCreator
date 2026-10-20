import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../../core/errores';
import { DatosAjustes, Limite } from './modelos';

/** Ajustes → Gasto: modo sin gasto, tope por vídeo y los límites y precios de cada servicio. */
@Component({
  selector: 'app-ajustes-gasto',
  imports: [FormsModule, MatButton, MatIcon],
  template: `
    @if (datos.value(); as d) {
      <section class="bloque">
        <h2>Modo sin gasto</h2>
        <label class="tarjeta interruptor">
          <input type="checkbox" [ngModel]="d.sin_gasto" (ngModelChange)="cambiarSinGasto($event)" name="sin-gasto" />
          <span>
            <strong>Bloquear todo lo que gaste créditos de pago</strong>
            <small class="secundario">Voz, imágenes y música de ai33 no se envían: salen versiones falsas (imágenes con la leyenda «SIMULADO», voz de zumbido, música sintetizada). Lo gratuito al que le falte la clave también sale falso. Tu suscripción de IA sigue funcionando. Al desactivarlo, las falsas se rehacen de verdad en el siguiente montaje.</small>
            @if (d.sin_gasto_activo && !d.sin_gasto) { <small class="secundario">Ahora mismo lo fuerza el entorno del servidor.</small> }
          </span>
        </label>
      </section>

      <section class="bloque">
        <h2>Presupuesto</h2>
        <form class="tarjeta presupuesto" (ngSubmit)="guardarTope()">
          <label for="tope">Tope de gasto de pago por vídeo (€)</label>
          <div class="clave__fila">
            <input id="tope" type="text" inputmode="decimal" name="tope" [(ngModel)]="tope" placeholder="Sin tope" autocomplete="off" />
            <button mat-stroked-button type="submit">Guardar</button>
          </div>
          <small class="secundario">Si un vídeo lo supera, se avisa en su pantalla. Los gastos siempre se confirman antes.</small>
          @if (errorTope()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorTope() }}</p> }
        </form>
      </section>

      <section class="bloque">
        <details class="avanzado">
        <summary><h2>Límites y precios de cada servicio</h2></summary>
        <p class="secundario">Lo que cuesta o permite cada servicio. Cámbialo solo si compras a otro precio o el servicio cambia su plan. Se aplica en el momento.</p>
        @if (limites.value(); as ls) {
          <div class="tarjeta limites">
            @for (l of ls; track l.clave) {
              <div class="limite">
                <label [for]="'l-' + l.clave">{{ l.texto }}<small class="secundario">{{ l.origen }}</small></label>
                <input [id]="'l-' + l.clave" type="text" inputmode="decimal" [name]="l.clave" [ngModel]="textoLimite(l)"
                       (ngModelChange)="editados[l.clave] = $event" (change)="guardarLimite(l)" autocomplete="off" />
                <span class="secundario">{{ l.unidad }}</span>
                <button mat-button type="button" [disabled]="!l.cambiado" (click)="restaurarLimite(l)">Original ({{ l.defecto }})</button>
              </div>
            }
            @if (errorLimite()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorLimite() }}</p> }
          </div>
        }
        </details>
      </section>

    } @else {
      <p class="secundario">Cargando…</p>
    }
  `,
  styleUrl: './ajustes.scss',
})
export class AjustesGasto {
  private readonly http = inject(HttpClient);
  protected readonly datos = httpResource<DatosAjustes>(() => '/api/ajustes');
  protected readonly limites = httpResource<Limite[]>(() => '/api/ajustes/proveedores');
  protected readonly errorLimite = signal<string | null>(null);
  protected editados: Record<string, string> = {};
  /** El tope guardado, hasta que el usuario lo edita (y otra vez el guardado si se recarga). */
  protected readonly tope = linkedSignal(() => {
    const t = this.datos.value()?.tope_euros_video;
    return t ? String(t) : '';
  });
  protected readonly errorTope = signal<string | null>(null);

  protected textoLimite(l: Limite): string {
    return this.editados[l.clave] ?? String(l.valor).replace('.', ',');
  }

  protected async guardarLimite(l: Limite): Promise<void> {
    const texto = (this.editados[l.clave] ?? '').trim().replace(',', '.');
    if (texto === '') return;
    this.errorLimite.set(null);
    const valor = Number(texto);
    if (Number.isNaN(valor) || valor <= 0) {
      this.errorLimite.set(`«${l.texto}»: escribe un número mayor que 0`);
      return;
    }
    await this.enviarLimite(l, valor);
  }

  protected async restaurarLimite(l: Limite): Promise<void> {
    await this.enviarLimite(l, null);
  }

  private async enviarLimite(l: Limite, valor: number | null): Promise<void> {
    try {
      await firstValueFrom(this.http.put('/api/ajustes/proveedores', { clave: l.clave, valor }));
      delete this.editados[l.clave];
      this.limites.reload();
    } catch (e) {
      this.errorLimite.set(mensajeError(e));
    }
  }

  protected async guardarTope(): Promise<void> {
    this.errorTope.set(null);
    const texto = this.tope().trim().replace(',', '.');
    const valor = texto === '' ? null : Number(texto);
    if (valor !== null && Number.isNaN(valor)) {
      this.errorTope.set('Escribe un número (por ejemplo 2,50) o déjalo vacío para quitar el tope');
      return;
    }
    try {
      await firstValueFrom(this.http.put('/api/ajustes/presupuesto', { tope_euros_video: valor }));
      this.datos.reload();
    } catch (e) {
      this.errorTope.set(mensajeError(e));
    }
  }

  protected async cambiarSinGasto(activo: boolean): Promise<void> {
    try {
      await firstValueFrom(this.http.put('/api/ajustes/sin-gasto', { activo }));
    } finally {
      this.datos.reload();
    }
  }
}
