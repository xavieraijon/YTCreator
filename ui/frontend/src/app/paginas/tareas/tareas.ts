import { Component, computed, inject } from '@angular/core';

import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { TERMINADAS, TareasService } from '../../core/tareas.service';

/** Cola e historial de las herramientas lanzadas desde la UI. */
@Component({
  selector: 'app-tareas',
  imports: [TarjetaTarea],
  template: `
    <span class="antetitulo">Cola de trabajo</span>
    <h1>Tareas</h1>
    <p class="secundario">
      Trabajos gratis lanzados desde la interfaz. Los pesados (imágenes, boceto, fotogramas, comprobar que todo funciona)
      van de uno en uno; los ligeros, a la vez. Se lanzan desde la página de cada vídeo.
    </p>
    <h2>En curso y en cola ({{ servicio.activas().length }})</h2>
    @for (t of servicio.activas(); track t.id) {
      <app-tarjeta-tarea [tarea]="t" [enlaceVideo]="true" />
    } @empty {
      <p class="secundario">Nada en marcha.</p>
    }
    <h2>Historial</h2>
    @for (t of historial(); track t.id) {
      <app-tarjeta-tarea [tarea]="t" [enlaceVideo]="true" />
    } @empty {
      <p class="secundario">Todavía no se ha lanzado ninguna.</p>
    }
  `,
  styles: `
    .secundario {
      color: var(--mat-sys-on-surface-variant);
    }
    p.secundario {
      max-width: 50rem;
    }
  `,
})
export class TareasPagina {
  protected readonly servicio = inject(TareasService);
  protected readonly historial = computed(() => this.servicio.tareas().filter((t) => TERMINADAS.includes(t.estado)));
}
