import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import { ETIQUETAS } from './modo-revision';

export interface MarcaVarias {
  etiquetas: string[];
  motivo: string;
}

/** Marcar varias imágenes como mal de golpe (los mismos fallos y el mismo comentario para todas). */
@Component({
  selector: 'app-marcar-varias',
  imports: [MatDialogModule, MatButton, MatIcon],
  template: `
    <h2 mat-dialog-title>Marcar {{ ids.length }} como mal</h2>
    <mat-dialog-content>
      <p class="ids">{{ ids.join(', ') }}</p>
      <p class="pregunta">¿Qué falla en todas?</p>
      <div class="etiquetas">
        @for (e of etiquetas; track e.clave) {
          <button type="button" class="etiqueta" [class.etiqueta--activa]="elegidas().has(e.clave)" (click)="alternar(e.clave)">
            {{ e.texto }}
          </button>
        }
      </div>
      <textarea rows="3" placeholder="Por ejemplo: la diligencia debe ser como en 14-1, con los 6 caballos delante"
                [value]="texto()" (input)="texto.set($any($event.target).value)"></textarea>
      <p class="nota"><mat-icon>inbox</mat-icon>Van a la bandeja del modo revisión: desde allí se rehacen todas a la vez.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="!elegidas().size && !texto().trim()" (click)="aceptar()">
        Marcar {{ ids.length }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h2 {
      font-family: var(--ay-serif);
      letter-spacing: -0.03em;
    }
    .ids {
      margin: 0 0 0.75rem;
      font-family: var(--ay-mono);
      font-size: 0.85rem;
      color: var(--ay-tenue);
    }
    .pregunta {
      margin: 0 0 0.5rem;
      font-weight: 600;
    }
    .etiquetas {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 0.75rem;
    }
    .etiqueta {
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--ay-borde-fuerte);
      border-radius: 99px;
      background: transparent;
      color: var(--ay-tinta);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .etiqueta--activa {
      border-color: var(--ay-error);
      background: var(--ay-aviso-suave);
      color: var(--ay-error);
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--ay-borde-fuerte);
      border-radius: var(--ay-radio-peq);
      background: var(--ay-superficie);
      color: var(--ay-tinta);
      font: inherit;
    }
    .nota {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0.75rem 0 0;
      font-size: 0.85rem;
      color: var(--ay-tenue);
      mat-icon {
        font-size: 1.1rem;
        width: 1.1rem;
        height: 1.1rem;
      }
    }
    mat-dialog-actions button {
      border-radius: 99px;
    }
  `,
})
export class MarcarVarias {
  protected readonly ids = inject<string[]>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<MarcarVarias, MarcaVarias>);
  protected readonly etiquetas = ETIQUETAS;
  protected readonly elegidas = signal<Set<string>>(new Set());
  protected readonly texto = signal('');

  static pedir(dialogo: MatDialog, ids: string[]): Promise<MarcaVarias | undefined> {
    return firstValueFrom(dialogo.open<MarcarVarias, string[], MarcaVarias>(MarcarVarias, {
      data: ids, width: '520px', maxWidth: 'calc(100vw - 32px)', panelClass: 'panel-confirmar',
    }).afterClosed());
  }

  protected alternar(clave: string): void {
    const s = new Set(this.elegidas());
    if (s.has(clave)) s.delete(clave);
    else s.add(clave);
    this.elegidas.set(s);
  }

  protected aceptar(): void {
    const elegidas = ETIQUETAS.filter((e) => this.elegidas().has(e.clave));
    const motivo = [elegidas.map((e) => e.texto).join(', '), this.texto().trim()].filter(Boolean).join(': ');
    this.ref.close({ etiquetas: elegidas.map((e) => e.clave), motivo });
  }
}
