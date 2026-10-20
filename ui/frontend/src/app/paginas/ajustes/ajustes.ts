import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Pestañas de Ajustes. Cada una tiene su dirección (/ajustes/servicios…), así se puede enlazar y recargar sin perderla. */
const PESTANAS = [
  { ruta: 'servicios', texto: 'Servicios' },
  { ruta: 'ia', texto: 'IA (Claude)' },
  { ruta: 'gasto', texto: 'Gasto y presupuesto' },
  { ruta: 'equipo', texto: 'Este equipo' },
];

@Component({
  selector: 'app-ajustes',
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <span class="antetitulo">Configuración</span>
    <h1>Ajustes</h1>
    <p class="secundario intro">Todo se guarda en este ordenador. Las claves no se enseñan después de guardarlas.</p>
    <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Secciones de Ajustes">
      @for (p of pestanas; track p.ruta) {
        <a mat-tab-link [routerLink]="p.ruta" routerLinkActive #activa="routerLinkActive" [active]="activa.isActive">{{ p.texto }}</a>
      }
    </nav>
    <mat-tab-nav-panel #panel>
      <router-outlet />
    </mat-tab-nav-panel>
  `,
  styles: `
    .intro { max-width: 40rem; margin: 0 0 1rem; }
    nav { max-width: 46rem; }
  `,
})
export class Ajustes {
  protected readonly pestanas = PESTANAS;
}
