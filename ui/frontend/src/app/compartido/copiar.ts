import { Clipboard } from '@angular/cdk/clipboard';
import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Copia al portapapeles con aviso; `reciente()` dice qué clave se acaba de copiar (para marcar el botón). */
@Injectable({ providedIn: 'root' })
export class Copiar {
  private readonly portapapeles = inject(Clipboard);
  private readonly aviso = inject(MatSnackBar);
  readonly reciente = signal<string | null>(null);
  private reloj?: ReturnType<typeof setTimeout>;

  copiar(texto: string, clave: string, mensaje = 'Copiado'): void {
    if (!this.portapapeles.copy(texto)) {
      this.aviso.open('No se pudo copiar', undefined, { duration: 2500 });
      return;
    }
    this.aviso.open(mensaje, undefined, { duration: 1800 });
    this.reciente.set(clave);
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => this.reciente.set(null), 1800);
  }
}
