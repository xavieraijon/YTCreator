import { MOTOR } from '../core/glosario';
import { Component, computed, input, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

import { Imagen } from '../core/modelos';
import { ESTADOS, EstadoImagen, Motor, desglose, recuento } from './estado-imagen';

/** Qué imágenes se enseñan: por estado ('generar' = nuevas + a rehacer) y por motor. */
export interface FiltroImagenes {
  estado: EstadoImagen | 'generar' | null;
  motor: Motor | null;
}

export const SIN_FILTRO: FiltroImagenes = { estado: null, motor: null };

/** Cumple el filtro. */
export function cumple(f: FiltroImagenes, estado: EstadoImagen, motor: Motor | null): boolean {
  if (f.motor && (estado === 'fija' || motor !== f.motor)) return false;
  if (f.estado === 'generar') return estado === 'nueva' || estado === 'rehacer';
  if (f.estado === 'lista' && !f.motor) return estado === 'lista' || estado === 'fija';   // como en la fila Total
  return !f.estado || f.estado === estado;
}

/** Texto corto de un filtro: «Por generar · gratis». */
export function nombreFiltro(f: FiltroImagenes): string {
  const estado = f.estado === 'generar' ? 'Por generar' : f.estado ? ESTADOS[f.estado].etiqueta : 'Todas';
  return f.motor ? `${estado} · ${MOTOR[f.motor].corto}` : estado;
}

/**
 * Cuadro de estado de las imágenes de un vídeo: una frase con lo que falta y una tabla motor × estado.
 * Cada cifra filtra la lista de abajo.
 */
@Component({
  selector: 'app-resumen-imagenes',
  imports: [MatIcon, MatTooltip],
  template: `
    @let t = total();
    <section class="resumen tarjeta">
      <div class="titular">
        @if (t.nueva + t.rehacer) {
          <mat-icon class="titular__icono titular__icono--pendiente">pending</mat-icon>
          <div>
            <button type="button" class="titular__boton" [class.cifra--activa]="filtro().estado === 'generar' && !filtro().motor"
                    (click)="elegirGenerar()" matTooltip="Ver solo las que hay que generar (nuevas y a rehacer)">
              Faltan {{ t.nueva + t.rehacer }} imágenes por generar
            </button>
            <span>
              {{ desglose(t) }}
              @if (klein().nueva + klein().rehacer && ai33().nueva + ai33().rehacer) {
                · {{ klein().nueva + klein().rehacer }} gratis y {{ ai33().nueva + ai33().rehacer }} de pago
              } @else if (klein().nueva + klein().rehacer) {
                · todas gratis
              } @else {
                · todas de pago
              }
              @if (t.cola) { · además, {{ t.cola }} de pago en espera }
            </span>
          </div>
        } @else if (t.cola) {
          <mat-icon class="titular__icono">schedule</mat-icon>
          <div>
            <strong>{{ t.cola }} imágenes de pago en espera</strong>
            <span>Ya están pagadas y llegan solas; el resto está listo.</span>
          </div>
        } @else {
          <mat-icon class="titular__icono titular__icono--ok">task_alt</mat-icon>
          <div>
            <strong>Todas las imágenes están listas</strong>
            <span>{{ t.lista }} generadas y al día{{ fijas().fija ? ' + ' + fijas().fija + ' que no se generan' : '' }}.</span>
          </div>
        }
      </div>

      <table>
        <thead>
          <tr>
            <th></th>
            <th [matTooltip]="ayuda.lista">Listas</th>
            <th class="grupo" [matTooltip]="ayuda.nueva">Nuevas</th>
            <th class="grupo" [matTooltip]="ayuda.rehacer">A rehacer</th>
            <th [matTooltip]="ayuda.cola">En espera</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          @for (fila of filas(); track fila.clave) {
            <tr>
              <th scope="row">
                <span class="motor" [class]="'motor motor--' + fila.clave">{{ fila.nombre }}</span>
                <small>{{ fila.nota }}</small>
              </th>
              @for (c of columnas; track c) {
                <td [class.grupo]="c === 'nueva' || c === 'rehacer'">
                  @if (fila.r[c]) {
                    <button type="button" [class]="'cifra cifra--' + c" [class.cifra--activa]="activa(fila.estado ?? c, fila.motor)"
                            (click)="elegir(fila.estado ?? c, fila.motor)">
                      {{ fila.r[c] }}
                    </button>
                  } @else {
                    <span class="cero">—</span>
                  }
                </td>
              }
              <td>
                <button type="button" class="cifra" [class.cifra--activa]="activa(fila.estado, fila.motor)"
                        (click)="elegir(fila.estado, fila.motor)">{{ fila.r.total }}</button>
              </td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            @for (c of columnas; track c) {
              <td [class.grupo]="c === 'nueva' || c === 'rehacer'">
                @if (pie()[c]) {
                  <button type="button" [class]="'cifra cifra--' + c" [class.cifra--activa]="activa(c, null)" (click)="elegir(c, null)">
                    {{ pie()[c] }}
                  </button>
                } @else {
                  <span class="cero">—</span>
                }
              </td>
            }
            <td><button type="button" class="cifra" [class.cifra--activa]="activa(null, null)" (click)="elegir(null, null)">{{ t.total }}</button></td>
          </tr>
        </tfoot>
      </table>

      <p class="leyenda">
        <b>Nuevas</b>: aún no existen. <b>A rehacer</b>: existen, pero su descripción ha cambiado y se sustituirán.
        Las dos juntas son las <b>por generar</b>. Pulsa una cifra para ver solo esas.
      </p>
    </section>
  `,
  styles: `
    .resumen {
      padding: 1.1rem 1.25rem 0.9rem;
      margin-bottom: 1rem;
    }
    .titular {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      margin-bottom: 0.9rem;
    }
    .titular div {
      display: flex;
      flex-direction: column;
    }
    .titular strong {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-size: 1.25rem;
      font-weight: 600;
    }
    .titular__boton {
      width: fit-content;
      padding: 0 0.3rem;
      margin-left: -0.3rem;
      border: 1px solid transparent;
      border-radius: 8px;
      background: none;
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--ay-tinta);
      cursor: pointer;
      text-align: left;
    }
    .titular__boton:hover {
      color: var(--ay-acento);
    }
    .titular span {
      font-size: 0.85rem;
      color: var(--ay-tenue);
    }
    .titular__icono {
      font-size: 2rem;
      width: 2rem;
      height: 2rem;
      color: var(--ay-pago);
    }
    .titular__icono--pendiente {
      color: var(--ay-aviso);
    }
    .titular__icono--ok {
      color: var(--ay-ok);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    th,
    td {
      padding: 0.35rem 0.5rem;
      text-align: center;
      border-bottom: 1px solid var(--ay-borde);
    }
    thead th {
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ay-tenue);
      cursor: help;
    }
    tbody th,
    tfoot th {
      text-align: left;
      font-weight: 600;
    }
    tbody th small {
      display: block;
      font-weight: 400;
      font-size: 0.75rem;
      color: var(--ay-tenue);
    }
    tfoot th,
    tfoot td {
      border-bottom: 0;
    }
    .grupo {
      background: color-mix(in srgb, var(--ay-aviso) 6%, transparent);
    }
    .motor {
      display: inline-block;
      padding: 0.05rem 0.5rem;
      border-radius: 99px;
      font-size: 0.78rem;
      background: var(--ay-superficie-3);
    }
    .motor--ai33 {
      color: var(--ay-pago);
      background: var(--ay-pago-suave);
    }
    .motor--klein {
      color: var(--ay-ok);
      background: var(--ay-ok-suave);
    }
    .cifra {
      min-width: 2.4rem;
      padding: 0.2rem 0.5rem;
      border: 1px solid transparent;
      border-radius: 8px;
      background: none;
      font: inherit;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
      color: var(--ay-tinta);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .cifra:hover {
      background: var(--ay-superficie-3);
    }
    .cifra--lista {
      color: var(--ay-ok);
    }
    .cifra--nueva,
    .cifra--rehacer {
      color: var(--ay-aviso);
    }
    .cifra--cola {
      color: var(--ay-pago);
    }
    .cifra--activa {
      border-color: var(--ay-acento);
      background: var(--ay-acento-suave);
    }
    .cero {
      color: var(--ay-borde-fuerte);
    }
    .leyenda {
      margin: 0.75rem 0 0;
      font-size: 0.76rem;
      line-height: 1.5;
      color: var(--ay-tenue);
    }
  `,
})
export class ResumenImagenes {
  readonly imagenes = input.required<Imagen[]>();
  readonly filtro = input<FiltroImagenes>(SIN_FILTRO);
  readonly cambiar = output<FiltroImagenes>();

  protected readonly columnas = ['lista', 'nueva', 'rehacer', 'cola'] as const;
  protected readonly ayuda = Object.fromEntries(Object.entries(ESTADOS).map(([k, v]) => [k, v.ayuda])) as Record<EstadoImagen, string>;
  protected readonly desglose = desglose;

  protected readonly total = computed(() => recuento(this.imagenes()));
  /** Fila «Total»: las fijas, dentro de «Listas» (igual que el anillo de la cabecera). */
  protected readonly pie = computed(() => ({ ...this.total(), lista: this.total().lista + this.total().fija }));
  protected readonly klein = computed(() => recuento(this.imagenes(), 'klein'));
  protected readonly ai33 = computed(() => recuento(this.imagenes(), 'ai33'));
  protected readonly fijas = computed(() => ({ fija: this.total().fija }));

  protected readonly filas = computed(() => {
    const t = this.total();
    // Las que no se generan (reutilizan otra, clips…) cuentan como listas: ya están.
    const fijas = { lista: t.fija, nueva: 0, rehacer: 0, cola: 0, fija: t.fija, total: t.fija };
    return [
      { clave: 'klein', motor: 'klein' as Motor | null, estado: null as EstadoImagen | null, nombre: MOTOR.klein.largo,
        nota: MOTOR.klein.nota, r: this.klein() },
      { clave: 'ai33', motor: 'ai33' as Motor | null, estado: null as EstadoImagen | null, nombre: MOTOR.ai33.largo,
        nota: MOTOR.ai33.nota, r: this.ai33() },
      { clave: 'fija', motor: null, estado: 'fija' as EstadoImagen | null, nombre: 'No se generan',
        nota: 'reutilizan otra, clips o archivos propios', r: fijas },
    ].filter((f) => f.r.total);
  });

  protected activa(estado: EstadoImagen | null, motor: Motor | null): boolean {
    const f = this.filtro();
    return f.estado === estado && f.motor === motor;
  }

  protected elegirGenerar(): void {
    const f = this.filtro();
    this.cambiar.emit(f.estado === 'generar' && !f.motor ? SIN_FILTRO : { estado: 'generar', motor: null });
  }

  protected elegir(estado: EstadoImagen | null, motor: Motor | null): void {
    // Pulsar la cifra activa quita el filtro.
    this.cambiar.emit(this.activa(estado, motor) ? SIN_FILTRO : { estado, motor });
  }
}
