import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { TarjetaTarea } from '../../compartido/tarjeta-tarea';
import { ApagadoService } from '../../core/apagado.service';
import { TERMINADAS, TareasService } from '../../core/tareas.service';
import { AjustesCopia } from './copia';
import { DatosAjustes } from './modelos';

/** Ajustes → Este equipo: programas instalados, dónde están el kit y el espacio de trabajo, la prueba de todo el kit, cerrar o reiniciar y la copia de seguridad. */
@Component({
  selector: 'app-ajustes-equipo',
  imports: [AjustesCopia, MatButton, MatIcon, TarjetaTarea],
  template: `
    @if (datos.value(); as d) {
      <section class="bloque">
        <h2>Este equipo</h2>
        <dl class="entorno tarjeta">
          @for (e of d.entorno; track e.texto) {
            <div><dt>{{ e.texto }}</dt><dd [class.falta]="e.valor === 'falta'">{{ e.valor }}</dd></div>
          }
        </dl>
        <dl class="entorno tarjeta">
          <div><dt>Kit (el código)</dt><dd><code>{{ d.espacio.kit }}</code></dd></div>
          <div>
            <dt>Espacio de trabajo</dt>
            <dd><code>{{ d.espacio.espacio }}</code> <small class="secundario">{{ d.espacio.separado ? '' : '(el mismo que el kit)' }}</small></dd>
          </div>
        </dl>
        @if (d.espacio.enlaces_que_faltan.length || d.espacio.carpetas_que_faltan.length) {
          <p class="error">
            <mat-icon>warning</mat-icon>
            <span>Al espacio le falta {{ d.espacio.enlaces_que_faltan.concat(d.espacio.carpetas_que_faltan).join(', ') }}. Repáralo en una terminal:
              <code>.venv/bin/python herramientas/espacio.py preparar</code> desde la carpeta del kit.</span>
          </p>
        }
        <div class="acciones">
          <button mat-flat-button type="button" [disabled]="probando()" (click)="probar()">
            <mat-icon>{{ probando() ? 'sync' : 'science' }}</mat-icon>{{ probando() ? 'Probando…' : 'Probar que todo funciona (1-2 min)' }}
          </button>
          <span class="secundario">Gratis: no gasta créditos de pago.</span>
        </div>
        @if (errorPrueba()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorPrueba() }}</p> }
        @for (t of tareaKit(); track t.id) { <app-tarjeta-tarea [tarea]="t" /> }
      </section>
      <section class="bloque">
        <h2>Cerrar o reiniciar</h2>
        @if (apagado.apagable()) {
          <p class="secundario">Reiniciar carga lo nuevo del programa (tarda unos segundos). Cerrar lo apaga en este ordenador. En los dos casos no se pierde nada.</p>
          <div class="acciones">
            <button mat-stroked-button type="button" (click)="apagado.reiniciar()"><mat-icon>restart_alt</mat-icon>Reiniciar YTCreator</button>
            <button mat-stroked-button type="button" (click)="apagado.cerrar()"><mat-icon>power_settings_new</mat-icon>Cerrar YTCreator</button>
          </div>
        } @else {
          <p class="secundario">Este YTCreator no se abrió con «Abrir YTCreator»: ciérralo en la ventana donde se arrancó (Ctrl+C).</p>
        }
      </section>
      <app-ajustes-copia />
    } @else {
      <p class="secundario">Cargando…</p>
    }
  `,
  styleUrl: './ajustes.scss',
})
export class AjustesEquipo {
  private readonly tareas = inject(TareasService);
  protected readonly apagado = inject(ApagadoService);
  protected readonly datos = httpResource<DatosAjustes>(() => '/api/ajustes');
  protected readonly errorPrueba = signal<string | null>(null);
  protected readonly tareaKit = computed(() => this.tareas.tareas().filter((t) => t.herramienta === 'probar_kit').slice(0, 1));
  protected readonly probando = computed(() => this.tareas.tareas().some((t) => t.herramienta === 'probar_kit' && !TERMINADAS.includes(t.estado)));

  protected async probar(): Promise<void> {
    this.errorPrueba.set(await this.tareas.lanzar('probar_kit'));
  }
}
