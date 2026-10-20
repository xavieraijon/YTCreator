import { Component, computed, inject } from '@angular/core';
import { MatAnchor, MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { CanalesService } from '../../core/canales.service';
import { Canal } from '../../core/modelos';

/** Los canales como tarjetas: estado dicho para el usuario y una acción clara por canal (hallazgo 46 del recorrido profano). */
@Component({
  selector: 'app-canales',
  imports: [MatAnchor, MatButton, MatIcon, MatProgressBar, RouterLink],
  templateUrl: './canales.html',
  styleUrl: './canales.scss',
})
export class Canales {
  protected readonly canales = inject(CanalesService);
  private readonly avisos = inject(MatSnackBar);

  /** El canal con el que se trabaja primero; luego los demás y, al final, los archivados. */
  protected readonly visibles = computed(() =>
    [...this.canales.canales()].sort((a, b) => Number(b.activo) - Number(a.activo) || Number(a.archivado) - Number(b.archivado)),
  );

  protected async activar(canal: Canal): Promise<void> {
    try {
      await this.canales.activar(canal.slug);
      this.avisos.open(`Ahora trabajas con ${canal.nombre}`, undefined, { duration: 3000 });
    } catch {
      this.avisos.open(`No se pudo cambiar a ${canal.nombre}`, 'Cerrar');
    }
  }
}
