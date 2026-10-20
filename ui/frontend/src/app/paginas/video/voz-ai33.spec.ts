import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmarService } from '../../compartido/confirmar';
import { Tarea, VideoDetalle, VozPrevista } from '../../core/modelos';
import { miles } from '../../core/formato';
import { TareasService } from '../../core/tareas.service';
import { VozAi33 } from './voz-ai33';

/**
 * La voz de pago: lo que se cobra sale del backend EN EL MOMENTO de pulsar, se confirma esa cifra exacta y la tarea
 * lleva el coste previsto (el backend no la lanza si ha cambiado). Sin confirmación, o sin coste, no se lanza nada.
 */
const VIDEO = { id: 5, canal: 'c', escenas: [{ numero: 1, audio: 'videos/001/voz/01.wav' }] } as unknown as VideoDetalle;

/** Como lo escribe la app: «1.725», igual que el backend (core/formato.ts). */
const n = miles;

const previsto = (cambios: Partial<VozPrevista> = {}): VozPrevista => ({
  bloques: [{ escenas: [1, 2], hecho: true, caracteres: 900 }, { escenas: [3, 4], hecho: false, caracteres: 1000 },
            { escenas: [5], hecho: false, caracteres: 500 }] as VozPrevista['bloques'],
  pendientes: 2, caracteres_de_pago: 1500, creditos: 1725, euros: 0.01, voz: 'ai33:elevenlabs_x', nombre_voz: 'Juanjo',
  prueba: { creditos: 1150, euros: 0.005, caracteres_de_pago: 1000, escenas: [3, 4] }, externa: null, ...cambios,
});

describe('VozAi33: la voz de pago se confirma con el coste del momento', () => {
  let http: HttpTestingController;
  let pedir: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<VozAi33>;

  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    pedir = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ConfirmarService, useValue: { pedir } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(datos: VozPrevista, tareas: Tarea[] = []): Promise<VozAi33> {
    fixture = TestBed.createComponent(VozAi33);
    fixture.componentRef.setInput('video', VIDEO);
    fixture.detectChanges();
    http.match('/api/herramientas').forEach((r) => r.flush([]));
    http.match((r) => r.url === '/api/tareas').forEach((r) => r.flush(tareas));
    http.expectOne('/api/videos/5/voz').flush(datos);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const botones = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) => b.textContent ?? '');
  const esperar = () => new Promise((r) => setTimeout(r));

  it('enseña lo que falta y cuánto cuesta, con los dos botones de pago', async () => {
    await crear(previsto());
    expect(texto()).toContain('1 de 3 bloques locutados');
    expect(texto()).toContain('1.725 créditos');
    expect(botones().some((b) => b.includes('de prueba') && b.includes(`${n(1150)} créditos`))).toBe(true);
    expect(botones().some((b) => b.includes('Locutar los 2 bloques') && b.includes(`${n(1725)} créditos`))).toBe(true);
  });

  it('confirma el coste que da el backend al pulsar (no el de la pantalla) y lo manda como previsto', async () => {
    const c = await crear(previsto());
    pedir.mockResolvedValue(true);
    const lanzar = (c as any).lanzar(false);
    http.expectOne('/api/videos/5/voz').flush(previsto({ creditos: 2000, caracteres_de_pago: 1740 }));   // ha cambiado
    await esperar();
    expect(pedir).toHaveBeenCalledOnce();
    expect(pedir.mock.calls[0][0]).toMatchObject({ tono: 'pago', coste: expect.stringContaining(`${n(2000)} créditos`) });
    const post = http.expectOne('/api/tareas');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ herramienta: 'voz_ai33', video_id: 5,
                                        argumentos: { confirmado: true, previsto: 2000, solo_primero: false } });
    post.flush({ id: 1, herramienta: 'voz_ai33', video_id: 5, estado: 'en_cola' });
    await lanzar;
  });

  it('el bloque de prueba confirma y manda solo su coste', async () => {
    const c = await crear(previsto());
    pedir.mockResolvedValue(true);
    const lanzar = (c as any).lanzar(true);
    http.expectOne('/api/videos/5/voz').flush(previsto());
    await esperar();
    expect(pedir.mock.calls[0][0].titulo).toContain('bloque de prueba (escenas 3–4)');
    const post = http.expectOne('/api/tareas');
    expect(post.request.body.argumentos).toEqual({ confirmado: true, previsto: 1150, solo_primero: true });
    post.flush({ id: 1 });
    await lanzar;
  });

  it('si se cancela la confirmación, no se lanza nada', async () => {
    const c = await crear(previsto());
    pedir.mockResolvedValue(false);
    const lanzar = (c as any).lanzar(false);
    http.expectOne('/api/videos/5/voz').flush(previsto());
    await lanzar;
    http.expectNone('/api/tareas');
  });

  it('si no se puede calcular el coste, ni se pregunta ni se lanza', async () => {
    const c = await crear(previsto());
    const lanzar = (c as any).lanzar(false);
    http.expectOne('/api/videos/5/voz').flush({ detail: 'caído' }, { status: 500, statusText: 'Error' });
    await lanzar;
    expect(pedir).not.toHaveBeenCalled();
    http.expectNone('/api/tareas');
    fixture.detectChanges();
    expect(texto()).toContain('No se pudo calcular el coste de la voz');
  });

  it('repetir una escena pide su coste aparte y lanza solo esa escena', async () => {
    const c = await crear(previsto());
    pedir.mockResolvedValue(true);
    const repetir = (c as any).repetirEscena(1);
    const coste = http.expectOne((r) => r.url === '/api/videos/5/voz' && r.params.get('escena') === '1');
    coste.flush({ creditos: 300, euros: 0.001, caracteres_de_pago: 260, escenas: [1] });
    await esperar();
    expect(pedir.mock.calls[0][0]).toMatchObject({ creditos: 300, aceptar: 'Repetir (de pago)' });
    const post = http.expectOne('/api/tareas');
    expect(post.request.body.argumentos).toEqual({ confirmado: true, previsto: 300, escena_sola: 1 });
    post.flush({ id: 1 });
    await repetir;
  });

  it('con una locución en marcha no se ofrece volver a locutar', async () => {
    await crear(previsto(), [{ id: 9, herramienta: 'voz_ai33', video_id: 5, estado: 'en_curso' } as Tarea]);
    expect(TestBed.inject(TareasService).tareas().length).toBe(1);
    expect(botones().some((b) => b.includes('Locutar'))).toBe(false);
    expect(texto()).toContain('Locutando con la voz profesional');
  });

  it('con la voz gratis no hay botones de pago', async () => {
    await crear(previsto({ voz: 'azure:es-ES-AlvaroNeural', nombre_voz: null }));
    expect(botones().some((b) => b.includes('Locutar'))).toBe(false);
    expect(texto()).not.toContain('voz de pago');
    expect(texto()).toContain('Faltan 2: con esta voz no cuesta nada');   // antes: «1.500 caracteres ≈ 0 créditos»
  });

  it('con una locución propia no hay botones de pago y se prepara gratis', async () => {
    const c = await crear(previsto({
      bloques: [{ escenas: [1, 2, 3, 4, 5], hecho: false, caracteres: 2400 }] as VozPrevista['bloques'],
      pendientes: 1, caracteres_de_pago: 0, creditos: 0, prueba: null,
      externa: { archivo: 'externa.mp3', existe: true, duracion: 192 },
    }));
    expect(texto()).toContain('Locución propia (hecha fuera)');
    expect(texto()).toContain('externa.mp3 · 3:12 min');
    expect(botones().some((b) => b.includes('Locutar'))).toBe(false);
    expect(botones().some((b) => b.includes('Volver a la voz del canal'))).toBe(true);
    const preparar = (c as any).preparar();
    const post = http.expectOne('/api/tareas');
    expect(post.request.body).toEqual({ herramienta: 'voz_externa', video_id: 5, argumentos: {} });
    post.flush({ id: 2 });
    await preparar;
  });

  it('subir una locución manda el archivo tal cual, con su nombre', async () => {
    const c = await crear(previsto());
    expect(botones().some((b) => b.includes('Subir una locución propia'))).toBe(true);
    const archivo = new File([new Uint8Array([1, 2, 3])], 'mi toma.mp3', { type: 'audio/mpeg' });
    const entrada = { files: [archivo], value: 'x' } as unknown as HTMLInputElement;
    const subir = (c as any).subir(entrada);
    const put = http.expectOne((r) => r.url === '/api/videos/5/voz/archivo');
    expect(put.request.method).toBe('PUT');
    expect(put.request.params.get('nombre')).toBe('mi toma.mp3');
    expect(put.request.body).toBe(archivo);
    put.flush({ archivo: 'externa.mp3', existe: true, duracion: 3 });
    await subir;
    http.match('/api/videos/5/voz').forEach((r) => r.flush(previsto()));   // vuelve a leer el estado de la voz
  });
});
