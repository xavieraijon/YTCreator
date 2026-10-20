import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../../core/errores';
import { miles } from '../../core/formato';
import { ConexionIA, ESTADO_IA, NIVELES_IA, PerfilIA, SaludIA, USO_IA } from './modelos';

/** Ajustes → IA: conectar Claude, probar que contesta, modo (suscripción o API) y calidad (modelo y esfuerzo por uso). */
@Component({
  selector: 'app-ajustes-ia',
  imports: [FormsModule, MatButton, MatIcon],
  template: `
      <section class="bloque">
        <h2>Inteligencia artificial</h2>
        <p class="secundario">La que escribe guiones, investiga y revisa. Usa tu propia suscripción: ninguna clave de pago heredada del entorno se usa salvo que elijas el modo API.</p>
        @if (conexion.value(); as c) {
          <div class="tarjeta ia">
            <div class="clave__cabeza">
              <strong>Conectar Claude</strong>
              <span class="etiqueta" [class.etiqueta--ok]="c.instalado && c.con_sesion" [class.etiqueta--aviso]="!(c.instalado && c.con_sesion)">
                {{ c.instalado && c.con_sesion ? 'Conectado' : 'Faltan pasos' }}
              </span>
            </div>
            <ol class="pasos">
              <li [class.hecho]="c.instalado">
                <mat-icon>{{ c.instalado ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                <span><strong>1. Instalar Claude Code</strong>
                  @if (c.instalado) { <small class="secundario">Instalado (versión {{ c.version }}).</small> }
                  @else { <small class="secundario">En una terminal: <code>curl -fsSL https://claude.ai/install.sh | bash</code>. Luego reinicia YTCreator.</small> }
                </span>
              </li>
              <li [class.hecho]="c.con_sesion">
                <mat-icon>{{ c.con_sesion ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                <span><strong>2. Iniciar sesión con tu cuenta</strong>
                  @if (c.con_sesion) { <small class="secundario">Sesión iniciada{{ c.suscripcion ? ' (plan ' + c.suscripcion + ')' : '' }}.</small> }
                  @else { <small class="secundario">En una terminal: <code>claude auth login</code> y entra con tu cuenta de Claude (Pro o Max).</small> }
                </span>
              </li>
              <li>
                <mat-icon>bolt</mat-icon>
                <span><strong>3. Probar que contesta</strong>
                  <small class="secundario">Con el botón de abajo. Una palabra de prueba con el modelo más pequeño: gasta casi nada de tu cupo.</small>
                </span>
              </li>
            </ol>
            @if (c.con_sesion && c.por_uso) {
              <p class="error"><mat-icon>warning</mat-icon>Esta sesión usa una clave de API (pago por uso) y no una suscripción. Cada llamada se cobra. Para usar tu suscripción: <code>claude auth logout</code> y <code>claude auth login</code>.</p>
            }
            <div class="acciones">
              <button mat-stroked-button type="button" (click)="conexion.reload()"><mat-icon>refresh</mat-icon>Comprobar de nuevo</button>
            </div>
          </div>
        }
        @if (ia.value(); as s) {
          <div class="tarjeta ia">
            <div class="clave__cabeza">
              <strong>{{ s.etiqueta }}</strong>
              <span class="etiqueta" [class.etiqueta--ok]="s.estado === 'ok'" [class.etiqueta--aviso]="s.estado !== 'ok' && s.estado !== 'desconocido'">
                {{ !s.disponible ? 'No instalada' : estadoIA[s.estado] ?? s.estado }}
              </span>
            </div>
            @if (s.mensaje) { <p class="error"><mat-icon>warning</mat-icon>{{ s.mensaje }}</p> }
            @if (s.cuando) { <small class="secundario">Última comprobación: {{ s.cuando.replace('T', ' ') }}</small> }
            <div class="acciones">
              <button mat-flat-button type="button" [disabled]="probandoIA()" (click)="probarIA()">
                <mat-icon>{{ probandoIA() ? 'sync' : 'bolt' }}</mat-icon>{{ probandoIA() ? 'Probando…' : 'Probar que contesta' }}
              </button>
              <label class="modo">
                <span>Modo</span>
                <select [ngModel]="s.modo" (ngModelChange)="cambiarModo($event)" name="modo" aria-label="Modo de uso de la IA">
                  <option value="suscripcion">Suscripción (recomendado)</option>
                  <option value="api">Clave de API (de pago por uso)</option>
                </select>
              </label>
            </div>
            @if (s.perfiles) {
              <fieldset class="niveles">
                <legend>Calidad de la IA</legend>
                @for (n of niveles; track n.clave) {
                  <label class="nivel" [class.nivel--activo]="nivelActual(s) === n.clave">
                    <input type="radio" name="nivel" [value]="n.clave" [checked]="nivelActual(s) === n.clave" (change)="elegirNivel(n.clave)" />
                    <span><strong>{{ n.nombre }}</strong><small class="secundario">{{ n.texto }}</small></span>
                  </label>
                }
                @if (nivelActual(s) === 'propio') { <small class="secundario">Ahora: ajuste personalizado (en «Avanzado»).</small> }
              </fieldset>
              <details class="avanzado">
                <summary>Avanzado: modelo y esfuerzo para cada uso</summary>
              <table class="perfiles">
                <caption class="secundario">Modelo y esfuerzo según el uso. Más esfuerzo = mejor y más lento.</caption>
                <thead><tr><th>Uso</th><th>Modelo</th><th>Esfuerzo</th></tr></thead>
                <tbody>
                  @for (u of usos(s); track u) {
                    <tr>
                      <td>{{ nombreUso(u) }}</td>
                      <td>
                        <select [ngModel]="s.perfiles[u].modelo" (ngModelChange)="cambiarPerfil(u, { modelo: $event })" [name]="'m-' + u" [attr.aria-label]="'Modelo para ' + nombreUso(u)">
                          @for (m of modelos; track m) { <option [value]="m">{{ m }}</option> }
                          @if (!modelos.includes(s.perfiles[u].modelo)) { <option [value]="s.perfiles[u].modelo">{{ s.perfiles[u].modelo }}</option> }
                        </select>
                      </td>
                      <td>
                        <select [ngModel]="s.perfiles[u].esfuerzo" (ngModelChange)="cambiarPerfil(u, { esfuerzo: $event })" [name]="'e-' + u" [attr.aria-label]="'Esfuerzo para ' + nombreUso(u)">
                          @for (e of esfuerzos; track e) { <option [value]="e">{{ e }}</option> }
                        </select>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              </details>
            }
            @if (resultadoIA(); as r) {
              <p class="resultado" [class.resultado--mal]="!r.ok" role="status">
                <mat-icon>{{ r.ok ? 'check_circle' : 'warning' }}</mat-icon>{{ r.texto }}
              </p>
            }
            @if (errorIA()) { <p class="error"><mat-icon>warning</mat-icon>{{ errorIA() }}</p> }
          </div>
        }
      </section>

  `,
  styleUrl: './ajustes.scss',
})
export class AjustesIA {
  private readonly http = inject(HttpClient);
  protected readonly ia = httpResource<SaludIA>(() => '/api/ia/salud');
  protected readonly conexion = httpResource<ConexionIA>(() => '/api/ia/conexion');
  protected readonly estadoIA = ESTADO_IA;
  protected readonly modelos = ['haiku', 'sonnet', 'opus'];
  protected readonly esfuerzos = ['low', 'medium', 'high', 'xhigh', 'max'];
  protected readonly probandoIA = signal(false);
  protected readonly errorIA = signal<string | null>(null);
  protected readonly resultadoIA = signal<{ ok: boolean; texto: string } | null>(null);

  /** Tres niveles con nombre humano; el detalle (modelo y esfuerzo por uso), en «Avanzado». */
  protected readonly niveles = NIVELES_IA;

  protected nivelActual(s: SaludIA): string {
    const actual = s.perfiles ?? {};
    const igual = (n: (typeof NIVELES_IA)[number]) =>
      Object.entries(n.perfiles).every(([u, p]) => actual[u]?.modelo === p.modelo && actual[u]?.esfuerzo === p.esfuerzo);
    return NIVELES_IA.find(igual)?.clave ?? 'propio';
  }

  protected async elegirNivel(clave: string): Promise<void> {
    const n = NIVELES_IA.find((x) => x.clave === clave);
    if (n) await this.guardarIA({ perfiles: n.perfiles });
  }

  protected usos(s: SaludIA): string[] {
    return Object.keys(s.perfiles ?? {});
  }

  protected nombreUso(u: string): string {
    return USO_IA[u] ?? u;
  }

  protected async probarIA(): Promise<void> {
    this.probandoIA.set(true);
    this.errorIA.set(null);
    this.resultadoIA.set(null);
    try {
      const r = await firstValueFrom(
        this.http.post<{ ok: boolean; estado: string; mensaje: string; segundos: number }>('/api/ia/probar', {}),
      );
      this.resultadoIA.set(
        r.ok
          ? { ok: true, texto: `La IA contesta correctamente (${miles(r.segundos, 1)} s).` }
          : { ok: false, texto: `No contesta: ${ESTADO_IA[r.estado] ?? r.estado}. ${r.mensaje}` },
      );
      this.ia.reload();
    } catch (e) {
      this.errorIA.set(mensajeError(e));
    } finally {
      this.probandoIA.set(false);
    }
  }

  protected async cambiarModo(modo: string): Promise<void> {
    await this.guardarIA({ modo });
  }

  protected async cambiarPerfil(uso: string, cambio: Partial<PerfilIA>): Promise<void> {
    await this.guardarIA({ perfiles: { [uso]: cambio } });
  }

  private async guardarIA(cuerpo: object): Promise<void> {
    this.errorIA.set(null);
    try {
      await firstValueFrom(this.http.put('/api/ajustes/ia', cuerpo));
      this.ia.reload();
    } catch (e) {
      this.errorIA.set(mensajeError(e));
      this.ia.reload();
    }
  }
}
