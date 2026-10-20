import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Imagen, Tarea, VideoDetalle } from '../core/modelos';
import { ConfirmarService } from './confirmar';
import { ModoRevision } from './modo-revision';

/**
 * Modo revisión: marcar como mal guarda el motivo y propone el servicio según el fallo (los que klein no arregla, de
 * pago); rehacer el lote confirma los créditos de las de pago y lanza una tarea por servicio; lo que ya se está
 * rehaciendo no se vuelve a mandar (se pagaría dos veces).
 */
const img = (ident: string, revision: Imagen['revision'] = null, motor: Imagen['motor'] = 'klein'): Imagen =>
  ({ ident, escena: 1, origen: 'prompt', prompt: `prompt ${ident}`, fuente: null, ruta: `videos/005/img/${ident}.png`,
     existe: true, desactualizada: false, motor, prompt_final: null, en_cola: false, revision }) as Imagen;

const mal = (motivo = 'Anatomía / manos'): Imagen['revision'] => ({ estado: 'mal', motivo } as Imagen['revision']);

describe('ModoRevision: marcar y rehacer imágenes', () => {
  let http: HttpTestingController;
  let pedir: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<ModoRevision>;

  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    pedir = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ConfirmarService, useValue: { pedir } },
        { provide: MAT_DIALOG_DATA, useValue: { videoId: 5, canal: 'c' } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(imagenes: Imagen[], tareas: Tarea[] = [], propuestas: object = {}): Promise<any> {
    fixture = TestBed.createComponent(ModoRevision);
    fixture.detectChanges();
    http.match('/api/herramientas').forEach((r) => r.flush([]));
    http.match((r) => r.url === '/api/tareas').forEach((r) => r.flush(tareas));
    http.expectOne((r) => r.url === '/api/videos/5/ai33').flush({ creditos_por_imagen: 1720 });
    http.expectOne('/api/videos/5').flush({ id: 5, canal: 'c', imagenes } as unknown as VideoDetalle);
    http.expectOne('/api/videos/5/revision/propuestas').flush(propuestas);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const tick = () => new Promise((ok) => setTimeout(ok));
  const tecla = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key }));

  it('empieza por las que nadie ha revisado y marca como mal con su motivo; manos → servicio de pago', async () => {
    const c = await crear([img('01-1'), img('01-2')]);
    expect(c.actual()?.ident).toBe('01-1');
    tecla('m');                                     // M abre la marca, 1 = «Anatomía / manos», Intro guarda
    tecla('1');
    tecla('Enter');
    const post = http.expectOne('/api/videos/5/imagenes/01-1/revision');
    expect(post.request.body).toEqual({ estado: 'mal', motivo: 'Anatomía / manos', etiquetas: ['anatomia'] });
    post.flush({ ok: true });
    await tick();
    expect(c.servicios()['01-1']).toBe('ai33');
    expect(c.actual()?.ident).toBe('01-2');         // pasa a la siguiente
  });

  it('un fallo que se arregla con la descripción propone el servicio gratis', async () => {
    const c = await crear([img('01-1')]);
    c.abrirMarca();
    c.alternarEtiqueta('guion');
    c.texto.set('sale un perro y es un gato');
    const guardando = c.guardarMal();
    const post = http.expectOne('/api/videos/5/imagenes/01-1/revision');
    expect(post.request.body.motivo).toBe('No cuenta lo del guion: sale un perro y es un gato');
    post.flush({ ok: true });
    await guardando;
    expect(c.servicios()['01-1']).toBe('klein');
  });

  it('marcar como mal sin decir qué falla no guarda nada', async () => {
    const c = await crear([img('01-1')]);
    c.abrirMarca();
    await c.guardarMal();
    http.expectNone('/api/videos/5/imagenes/01-1/revision');
    expect(c.error()).toContain('Elige al menos un fallo');
  });

  it('rehacer el lote confirma los créditos de las de pago y lanza una tarea por servicio', async () => {
    const c = await crear([img('01-1', mal()), img('01-2', mal('Fuera de estilo')), img('01-3', mal())], [],
                          { '01-2': { prompt: 'prompt corregido', explicacion: 'más estilo', servicio: 'klein' } });
    c.cambiarServicio('01-1', 'ai33');
    c.cambiarServicio('01-2', 'klein');
    c.cambiarServicio('01-3', 'ai33');
    pedir.mockResolvedValue(true);
    const rehaciendo = c.rehacerLote();
    await tick();
    const confirmacion = pedir.mock.calls[0][0];
    expect(confirmacion).toMatchObject({ tono: 'pago', aceptar: 'Rehacer (de pago)' });
    expect(confirmacion.coste).toContain('3.440 créditos (2 de pago)');   // 2 × 1.720, con punto como en el backend
    const aplicar = http.expectOne('/api/videos/5/revision/lote/aplicar');
    expect(aplicar.request.body.cambios).toEqual([
      { ident: '01-1', prompt: null, motor: 'ai33' },
      { ident: '01-2', prompt: 'prompt corregido', motor: 'klein' },     // con la descripción corregida por Claude
      { ident: '01-3', prompt: null, motor: 'ai33' },
    ]);
    aplicar.flush({ ok: true });
    await tick();
    const gratis = http.expectOne('/api/tareas');
    expect(gratis.request.body).toEqual({ herramienta: 'rehacer_imagen', video_id: 5, argumentos: { ids: '01-2', motor: 'cloudflare' } });
    gratis.flush({ id: 1, herramienta: 'rehacer_imagen' });
    await tick();
    const pago = http.expectOne('/api/tareas');
    expect(pago.request.body.argumentos).toEqual({ ids: '01-1,01-3', confirmado: true, previsto: 2 });
    pago.flush({ id: 2, herramienta: 'rehacer_imagen_ai33' });
    await rehaciendo;
  });

  it('si no se confirma, no se aplica ni se lanza nada', async () => {
    const c = await crear([img('01-1', mal())]);
    pedir.mockResolvedValue(false);
    await c.rehacerLote();
    http.expectNone('/api/videos/5/revision/lote/aplicar');
    http.expectNone('/api/tareas');
  });

  it('una imagen que ya se está rehaciendo no vuelve a la bandeja (no se paga dos veces)', async () => {
    const enCurso = { id: 9, herramienta: 'rehacer_imagen_ai33', video_id: 5, estado: 'en_curso',
                      argumentos: { ids: '01-1' } } as unknown as Tarea;
    const c = await crear([img('01-1', mal()), img('01-2', mal())], [enCurso]);
    expect(c.bandeja().map((i: Imagen) => i.ident)).toEqual(['01-2']);
  });
});
