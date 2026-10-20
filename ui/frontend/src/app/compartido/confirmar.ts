import { Component, Injectable, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { CuotasService } from '../core/cuotas.service';
import { miles } from '../core/formato';

/** Lo que pregunta el modal de confirmación (en lugar del confirm() del navegador). */
export interface Confirmacion {
  titulo: string;
  /** Texto principal; los párrafos se separan con una línea en blanco. */
  mensaje?: string;
  /** Puntos concretos (qué se hace, qué no se toca…). */
  detalles?: string[];
  /** Si es de pago: la cifra destacada (p. ej. «≈ 482 créditos (≈ 0,2 céntimos)»). */
  coste?: string;
  /** Riesgo o condición que conviene leer (cola lenta, no se puede cancelar…). */
  aviso?: string;
  /** Créditos de ai33 que gasta: el modal calcula solo el saldo, lo que quedaría y si alcanza. */
  creditos?: number;
  /** Desglose del gasto (coste, saldo, lo que quedaría). */
  filas?: { etiqueta: string; valor: string; fuerte?: boolean; malo?: boolean }[];
  /** Si no se puede seguir (p. ej. faltan créditos): se desactiva «Aceptar». */
  bloquear?: boolean;
  aceptar?: string;
  cancelar?: string;
  /** «pago» (violeta, con el coste), «peligro» (rojo: cancelar, deshacer) o normal. */
  tono?: 'normal' | 'pago' | 'peligro';
  icono?: string;
}

@Component({
  selector: 'app-dialogo-confirmar',
  imports: [MatDialogModule, MatButton, MatIcon],
  template: `
    <div class="confirmar" [class]="'confirmar confirmar--' + (d.tono ?? 'normal')">
      <header>
        <span class="icono"><mat-icon>{{ d.icono ?? icono() }}</mat-icon></span>
        <h2 mat-dialog-title>{{ d.titulo }}</h2>
      </header>
      <mat-dialog-content>
        @if (d.coste) {
          <p class="coste"><span class="coste__etiqueta">Esto gasta créditos</span>{{ d.coste }}</p>
        }
        @if (d.filas?.length) {
          <dl class="filas">
            @for (f of d.filas; track f.etiqueta) {
              <div [class.fuerte]="f.fuerte" [class.malo]="f.malo"><dt>{{ f.etiqueta }}</dt><dd>{{ f.valor }}</dd></div>
            }
          </dl>
        }
        @for (p of parrafos(); track $index) {
          <p>{{ p }}</p>
        }
        @if (d.detalles?.length) {
          <ul>
            @for (x of d.detalles; track $index) {
              <li>{{ x }}</li>
            }
          </ul>
        }
        @if (d.aviso) {
          <p class="aviso"><mat-icon>info</mat-icon><span>{{ d.aviso }}</span></p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">{{ d.cancelar ?? 'Cancelar' }}</button>
        <button mat-flat-button type="button" [mat-dialog-close]="true" [disabled]="d.bloquear">
          {{ d.aceptar ?? 'Aceptar' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: `
    .confirmar {
      --tono: var(--ay-acento);
      --tono-suave: var(--ay-acento-suave);
      padding: 0.25rem 0.25rem 0;
    }
    .confirmar--pago {
      --tono: var(--ay-pago);
      --tono-suave: var(--ay-pago-suave);
    }
    .confirmar--peligro {
      --tono: var(--ay-error);
      --tono-suave: var(--ay-aviso-suave);
    }
    header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem 0;
      h2 {
        margin: 0;
        padding: 0;
        font-family: var(--ay-serif);
        letter-spacing: -0.03em;
        font-size: 1.35rem;
        line-height: 1.3;
      }
      h2::before {
        display: none;
      }
    }
    .icono {
      display: grid;
      place-items: center;
      flex: none;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      background: var(--tono-suave);
      color: var(--tono);
    }
    mat-dialog-content {
      color: var(--ay-tinta);
      p {
        margin: 0 0 0.75rem;
        line-height: 1.55;
      }
      ul {
        margin: 0 0 0.75rem;
        padding-left: 1.2rem;
        li {
          margin-bottom: 0.25rem;
        }
      }
    }
    .coste {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.6rem;
      padding: 0.7rem 0.9rem;
      border-radius: var(--ay-radio-peq);
      background: var(--ay-pago-suave);
      color: var(--ay-pago);
      font-weight: 600;
      font-size: 1.05rem;
    }
    .coste__etiqueta {
      padding: 0.1rem 0.5rem;
      border-radius: 99px;
      background: var(--ay-pago);
      color: var(--ay-superficie);
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .filas {
      margin: 0 0 0.75rem;
      padding: 0.25rem 1rem;
      border: 1px solid var(--ay-borde);
      border-radius: var(--ay-radio-peq);
    }
    .filas div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 0;
      border-top: 1px solid var(--ay-borde);
    }
    .filas div:first-child {
      border-top: 0;
    }
    .filas dt {
      color: var(--ay-tenue);
    }
    .filas dd {
      margin: 0;
    }
    .filas .fuerte dd {
      font-weight: 700;
    }
    .filas .malo dd {
      color: var(--ay-error);
    }
    .aviso {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      padding: 0.6rem 0.8rem;
      border-radius: var(--ay-radio-peq);
      background: var(--ay-aviso-suave);
      color: var(--ay-tinta);
      font-size: 0.9rem;
      mat-icon {
        flex: none;
        color: var(--ay-aviso);
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
        margin-top: 0.15rem;
      }
    }
    mat-dialog-actions {
      padding: 0.5rem 1.5rem 1.25rem;
      gap: 0.5rem;
      button {
        border-radius: 99px;
      }
      button[mat-flat-button] {
        background: var(--tono);
        color: var(--ay-superficie);
      }
    }
  `,
})
export class DialogoConfirmar {
  protected readonly d = inject<Confirmacion>(MAT_DIALOG_DATA);

  protected parrafos(): string[] {
    return (this.d.mensaje ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }

  protected icono(): string {
    return this.d.tono === 'pago' ? 'payments' : this.d.tono === 'peligro' ? 'warning' : 'help';
  }
}

/** Modal de confirmación de la app: `await confirmar.pedir({...})` → true si acepta. */
@Injectable({ providedIn: 'root' })
export class ConfirmarService {
  private readonly dialog = inject(MatDialog);

  private readonly cuotas = inject(CuotasService);

  pedir(c: Confirmacion): Promise<boolean> {
    const saldo = this.cuotas.cuotas()?.datos?.ai33.saldo;
    if (c.creditos !== undefined && saldo != null) {
      const porMillon = this.cuotas.cuotas()?.datos?.ai33.euros_por_millon;
      const eur = (n: number) =>
        porMillon ? ` (≈ ${((n * porMillon) / 1_000_000).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)` : '';
      const fmt = (n: number) => `${miles(n)} créditos${eur(n)}`;
      const falta = c.creditos - saldo;
      c = {
        ...c,
        filas: [
          { etiqueta: 'Coste', valor: fmt(c.creditos), fuerte: true },
          { etiqueta: 'Ahora tienes', valor: fmt(saldo) },
          falta > 0
            ? { etiqueta: 'Te quedarían', valor: `Faltan ${fmt(falta)}`, fuerte: true, malo: true }
            : { etiqueta: 'Te quedarían', valor: fmt(saldo - c.creditos), fuerte: true },
        ],
        bloquear: falta > 0,
        aviso: falta > 0 ? 'No hay créditos suficientes. Recarga el servicio de pago o usa la alternativa gratis.' : c.aviso,
      };
    }
    const ref = this.dialog.open<DialogoConfirmar, Confirmacion, boolean>(DialogoConfirmar, {
      data: c,
      width: '540px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'panel-confirmar',
    });
    return firstValueFrom(ref.afterClosed()).then((r) => r === true);
  }
}
