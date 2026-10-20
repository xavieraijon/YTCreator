import { HttpClient } from '@angular/common/http';
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

import { firstValueFrom } from 'rxjs';

import { mensajeError } from '../../core/errores';

type CapacidadConectable = 'imagen' | 'voz' | 'musica';
const CAPACIDADES: Record<CapacidadConectable, string> = { imagen: 'Imágenes', voz: 'Voz', musica: 'Música' };
const DATOS: Record<CapacidadConectable, string> = {
  imagen: 'prompt, ancho, alto, n', voz: 'texto, voz', musica: 'prompt',
};

interface Formulario {
  nombre: string;
  capacidad: CapacidadConectable;
  base: string;
  clave_env: string;
  auth: 'bearer' | 'cabecera' | 'query';
  ruta: string;
  cuerpo: string;
  formato: 'url' | 'base64' | 'binario' | 'texto';
  donde: string;
  coste: number | null;
}

const VACIO: Formulario = {
  nombre: '', capacidad: 'imagen', base: 'https://', clave_env: '', auth: 'bearer', ruta: '/', cuerpo: '{\n  "prompt": "{prompt}"\n}',
  formato: 'url', donde: '', coste: null,
};

/** «Conectar un servicio»: el usuario trae el suyo (imágenes, voz o música) sin que YTCreator le imponga ninguno. Lo describe
 *  él o deja que Claude lo redacte con la documentación; la clave se guarda aparte y la prueba enseña el coste antes de gastar. */
@Component({
  selector: 'app-conectar-servicio',
  imports: [FormsModule, MatButton, MatIcon],
  template: `
    <section class="bloque conectar">
      <h3>Conectar un servicio</h3>
      <p class="secundario">
        Si usas otro servicio de imágenes, voz o música, conéctalo aquí. Pega su documentación y Claude lo prepara, o descríbelo tú.
        La clave se guarda solo en este ordenador.
      </p>
      <div class="acciones">
        <button mat-stroked-button type="button" (click)="abrir('claude')"><mat-icon>auto_awesome</mat-icon>Que lo prepare Claude</button>
        <button mat-stroked-button type="button" (click)="abrir('manual')"><mat-icon>edit</mat-icon>Lo describo yo</button>
      </div>

      @if (modo()) {
        <form class="tarjeta formulario" (ngSubmit)="guardar()">
          <label for="cs-cap">Qué hace</label>
          <select id="cs-cap" name="capacidad" [(ngModel)]="f.capacidad">
            @for (c of capacidades; track c.id) { <option [value]="c.id">{{ c.nombre }}</option> }
          </select>

          @if (modo() === 'claude') {
            <label for="cs-doc">Documentación del servicio (pégala tal cual)</label>
            <textarea id="cs-doc" name="doc" rows="8" [(ngModel)]="documentacion" placeholder="Cómo se llama a su API: dirección, cabeceras, ejemplo de petición y de respuesta"></textarea>
            <div class="acciones">
              <button mat-flat-button type="button" [disabled]="!documentacion.trim() || pensando()" (click)="integrar()">
                <mat-icon>{{ pensando() ? 'sync' : 'auto_awesome' }}</mat-icon>{{ pensando() ? 'Claude está leyendo…' : 'Prepararlo' }}
              </button>
              <span class="secundario">Gratis: usa tu suscripción de Claude. No llama al servicio.</span>
            </div>
          }

          @if (modo() === 'manual' || propuesta()) {
            <label for="cs-nom">Nombre</label>
            <input id="cs-nom" name="nombre" [(ngModel)]="f.nombre" />
            <label for="cs-base">Dirección base (https://…)</label>
            <input id="cs-base" name="base" [(ngModel)]="f.base" />
            <label for="cs-env">Nombre de la variable de la clave (MAYÚSCULAS)</label>
            <input id="cs-env" name="clave_env" [(ngModel)]="f.clave_env" placeholder="MI_SERVICIO_API_KEY" />
            <label for="cs-auth">Cómo se envía la clave</label>
            <select id="cs-auth" name="auth" [(ngModel)]="f.auth">
              <option value="bearer">Authorization: Bearer</option>
              <option value="cabecera">Una cabecera propia</option>
              <option value="query">En la dirección (?clave=)</option>
            </select>
            @if (f.auth !== 'bearer') { <p class="secundario">Para este método, completa «cabecera» o «parámetro» en el texto avanzado de abajo.</p> }
            <label for="cs-ruta">Ruta de la petición (POST)</label>
            <input id="cs-ruta" name="ruta" [(ngModel)]="f.ruta" />
            <label for="cs-cuerpo">Cuerpo (JSON). Datos disponibles: {{ datos[f.capacidad] }}, escritos así: {{ '{' }}dato{{ '}' }}</label>
            <textarea id="cs-cuerpo" name="cuerpo" rows="5" [(ngModel)]="f.cuerpo"></textarea>
            <label for="cs-fmt">Qué devuelve</label>
            <select id="cs-fmt" name="formato" [(ngModel)]="f.formato">
              <option value="url">Una dirección del archivo</option>
              <option value="base64">El archivo en base64</option>
              <option value="binario">El archivo directamente</option>
              <option value="texto">Texto</option>
            </select>
            @if (f.formato !== 'binario') {
              <label for="cs-donde">Dónde está en la respuesta (p. ej. data.0.url)</label>
              <input id="cs-donde" name="donde" [(ngModel)]="f.donde" />
            }
            <label for="cs-coste">Coste por llamada en dólares (vacío = gratis)</label>
            <input id="cs-coste" name="coste" type="number" min="0" step="0.001" [(ngModel)]="f.coste" />
            @if (propuestaAvanzada(); as extra) { <p class="secundario">Claude ha añadido ajustes avanzados (cola, cabeceras…): se conservan al guardar. {{ extra }}</p> }

            <div class="acciones">
              <button mat-flat-button type="submit" [disabled]="guardando()">Guardar servicio</button>
            </div>
          }
          @for (p of problemas(); track p) { <p class="error"><mat-icon>warning</mat-icon>{{ p }}</p> }
          @if (error(); as e) { <p class="error"><mat-icon>warning</mat-icon>{{ e }}</p> }
        </form>
      }

      @if (guardado(); as g) {
        <div class="tarjeta formulario" role="status">
          <p><mat-icon>check_circle</mat-icon> «{{ g.nombre }}» guardado. Ahora pega su clave en su tarjeta de arriba y pruébalo.</p>
          @if (g.de_pago) {
            <p class="aviso"><mat-icon>info</mat-icon>Es de pago: probarlo cuesta unos {{ g.coste }} {{ g.unidad }} por llamada.</p>
            <label class="casilla"><input type="checkbox" name="acepto" [(ngModel)]="acepto" /> Acepto ese coste para la prueba</label>
          }
          <div class="acciones">
            <button mat-stroked-button type="button" [disabled]="probando() || (g.de_pago && !acepto)" (click)="probar(g.id, g.de_pago)">
              <mat-icon>{{ probando() ? 'sync' : 'bolt' }}</mat-icon>Probar
            </button>
          </div>
          @if (resultado(); as r) { <p class="resultado" [class.resultado--mal]="!r.ok" role="status"><mat-icon>{{ r.ok ? 'check_circle' : 'warning' }}</mat-icon>{{ r.mensaje }}</p> }
        </div>
      }
    </section>
  `,
  styleUrl: './ajustes.scss',
  styles: `
    .conectar { margin-top: 1.5rem; }
    .formulario { display: grid; gap: 0.4rem; margin-top: 0.85rem; padding: 1rem 1.15rem; }
    .formulario input, .formulario select, .formulario textarea { width: 100%; box-sizing: border-box; font: inherit; }
    .casilla input { width: auto; }
  `,
})
export class ConectarServicio {
  private readonly http = inject(HttpClient);
  /** Avisa de que se guardó o borró algo para que la lista de servicios se relea. */
  readonly cambiado = output<void>();

  protected readonly capacidades = (Object.keys(CAPACIDADES) as CapacidadConectable[]).map((id) => ({ id, nombre: CAPACIDADES[id] }));
  protected readonly datos = DATOS;
  protected readonly modo = signal<'claude' | 'manual' | null>(null);
  protected readonly pensando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly probando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly problemas = signal<string[]>([]);
  protected readonly propuesta = signal<Record<string, unknown> | null>(null);
  protected readonly guardado = signal<{ id: string; nombre: string; de_pago: boolean; coste: number; unidad: string } | null>(null);
  protected readonly resultado = signal<{ ok: boolean; mensaje: string } | null>(null);
  protected f: Formulario = { ...VACIO };
  protected documentacion = '';
  protected acepto = false;

  protected abrir(m: 'claude' | 'manual'): void {
    this.modo.set(m);
    this.propuesta.set(null);
    this.guardado.set(null);
    this.resultado.set(null);
    this.error.set(null);
    this.problemas.set([]);
    this.f = { ...VACIO };
  }

  protected propuestaAvanzada(): string {
    const p = this.propuesta();
    return p && p['cola'] ? 'Este servicio trabaja en cola.' : '';
  }

  private identificador(): string {
    const base = this.f.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (base || 'servicio').slice(0, 41);
  }

  /** La descripción que entiende herramientas/conector_ia.py: parte de lo que propuso Claude (si lo hubo) y aplica el formulario. */
  protected descripcion(): Record<string, unknown> {
    const previa = (this.propuesta() ?? {}) as Record<string, any>;
    const f = this.f;
    let cuerpo: unknown = {};
    try { cuerpo = JSON.parse(f.cuerpo || '{}'); } catch { throw new Error('El cuerpo no es un JSON válido.'); }
    const spec: Record<string, any> = {
      ...previa, id: previa['id'] || this.identificador(), nombre: f.nombre.trim(), capacidad: f.capacidad, base: f.base.trim(),
      clave_env: f.clave_env.trim() || null,
      auth: { ...(previa['auth'] ?? {}), tipo: f.auth },
      peticion: { ...(previa['peticion'] ?? {}), metodo: previa['peticion']?.metodo ?? 'POST', ruta: f.ruta.trim(), cuerpo },
      respuesta: { ...(previa['respuesta'] ?? {}), formato: f.formato, ...(f.formato === 'binario' ? {} : { donde: f.donde.trim() }) },
    };
    if (f.coste && f.coste > 0) spec['coste'] = { ...(previa['coste'] ?? {}), cantidad: f.coste, unidad: previa['coste']?.unidad ?? 'USD' };
    else delete spec['coste'];
    if (!spec['clave_env']) delete spec['clave_env'];
    return spec;
  }

  protected async integrar(): Promise<void> {
    this.pensando.set(true);
    this.error.set(null);
    this.problemas.set([]);
    try {
      const r = await firstValueFrom(this.http.post<{ spec: Record<string, any>; problemas: string[] }>('/api/conectores/integrar', {
        capacidad: this.f.capacidad, documentacion: this.documentacion, nombre: this.f.nombre || null,
      }));
      const s = r.spec;
      this.propuesta.set(s);
      this.f = {
        nombre: s['nombre'] ?? '', capacidad: this.f.capacidad, base: s['base'] ?? 'https://', clave_env: s['clave_env'] ?? '',
        auth: s['auth']?.tipo ?? 'bearer', ruta: s['peticion']?.ruta ?? '/', cuerpo: JSON.stringify(s['peticion']?.cuerpo ?? {}, null, 2),
        formato: s['respuesta']?.formato ?? 'url', donde: s['respuesta']?.donde ?? '', coste: s['coste']?.cantidad ?? null,
      };
      this.problemas.set(r.problemas);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.pensando.set(false);
    }
  }

  protected async guardar(): Promise<void> {
    this.error.set(null);
    this.problemas.set([]);
    this.guardando.set(true);
    try {
      const spec = this.descripcion();
      const v = await firstValueFrom(this.http.post<{ problemas: string[] }>('/api/conectores/validar', { spec }));
      if (v.problemas.length) { this.problemas.set(v.problemas); return; }
      await firstValueFrom(this.http.put('/api/conectores', { spec }));
      const coste = (spec['coste'] as { cantidad: number; unidad: string } | undefined);
      this.guardado.set({ id: String(spec['id']), nombre: String(spec['nombre']), de_pago: !!coste, coste: coste?.cantidad ?? 0, unidad: coste?.unidad ?? '' });
      this.acepto = false;
      this.resultado.set(null);
      this.modo.set(null);
      this.cambiado.emit();
    } catch (e) {
      this.error.set(e instanceof Error && !('status' in e) ? e.message : mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async probar(id: string, dePago: boolean): Promise<void> {
    this.probando.set(true);
    try {
      this.resultado.set(await firstValueFrom(this.http.post<{ ok: boolean; mensaje: string }>(`/api/conectores/${id}/probar`, { gastar: dePago && this.acepto })));
    } catch (e) {
      this.resultado.set({ ok: false, mensaje: mensajeError(e) });
    } finally {
      this.probando.set(false);
    }
  }
}
