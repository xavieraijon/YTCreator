import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmarService } from '../../compartido/confirmar';
import { ConceptoPropuesto, DatosCrearCanal, EstilosCanal, NichoPropuesto, MarcasCanal, NombrePropuesto, VocesCanal } from '../../core/modelos';
import { CrearCanal } from './crear-canal';

/**
 * Paso 1 de la creación del canal: Claude propone temas, la herramienta los mide y el usuario elige con un clic. Las
 * cifras salen de la medida (sin jerga), lo que falta por medir se mide solo y sin datos de YouTube no se inventan ceros.
 */
const PASOS = ['Mercado', 'Concepto', 'Nombre', 'Estilo'].map((nombre, i) => ({
  letra: 'ABCD'[i], nombre, guiado: i < 3, estado: (i === 0 ? 'actual' : 'pendiente') as 'actual' | 'pendiente',
}));

const nicho = (id: number, cambios: Partial<NichoPropuesto> = {}): NichoPropuesto => ({
  id, nicho: `Tema ${id}`, porque: 'tiene público', publico: 'adultos', busquedas: ['a'], categoria: 'educacion',
  recomendado: id === 1, medida: null, midiendo: false, ...cambios,
});

const concepto = (id: number): ConceptoPropuesto => ({
  id, nombre: `Concepto ${id}`, promesa: 'la historia detrás del dinero', pilares: ['estafas', 'quiebras'],
  publico: 'adultos', para_ninos: false, formato: '10 min', narrador: 'voz en off', ritmo: 'pausado',
  monetizacion: 'anuncios', recomendado: id === 2,
});

const nombre = (id: number, cambios: Partial<NombrePropuesto> = {}): NombrePropuesto => ({
  id, nombre: `Nombre ${id}`, arroba: null, porque: 'suena bien', recomendado: id === 1, propio: false,
  medida: null, midiendo: false, ...cambios,
});

const enPaso = (letra: string): Partial<DatosCrearCanal> => {
  const i = 'ABCD'.indexOf(letra);
  return {
    actual: letra, mercado: null,
    pasos: PASOS.map((p, j) => ({ ...p, estado: j < i ? 'hecho' : j === i ? 'actual' : 'pendiente' })),
  };
};

const datos = (cambios: Partial<DatosCrearCanal> = {}): DatosCrearCanal => ({
  pasos: PASOS, actual: 'A', creacion: null, nicho: null, concepto: null, conceptos: null, nombres: null, estilos: null, voces: null, marcas: null, reglas: null, equipo: null, alta: null, ideas: null, cierre: null, tarea: null,
  mercado: { intereses: null, propuestas: [], error: null, elegido: null, por_medir: [] },
  trabajo: { estado: 'libre', accion: null, conversacion: null }, ...cambios,
});

describe('CrearCanal: paso 1, elegir el tema con datos', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CrearCanal>;

  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(d: DatosCrearCanal): Promise<CrearCanal> {
    fixture = TestBed.createComponent(CrearCanal);
    fixture.detectChanges();
    http.expectOne('/api/asistente/canal').flush(d);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (t: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes(t))!;

  it('sin propuestas pide los intereses y los manda a Claude', async () => {
    await crear(datos());
    expect(texto()).toContain('¿Qué te interesa?');
    (fixture.componentInstance as any).intereses = 'historia';
    boton('Buscar temas').click();
    const r = http.expectOne('/api/asistente/canal/mercado/proponer');
    expect(r.request.body).toEqual({ intereses: 'historia', otros: false });
  });

  it('mientras Claude trabaja lo dice, sin formulario', async () => {
    await crear(datos({ trabajo: { estado: 'pensando', accion: 'Leyendo docs/mercado.md', conversacion: 3 } }));
    expect(texto()).toContain('Estamos buscando temas');
    expect(texto()).not.toContain('¿Qué te interesa?');
  });

  it('mide solo lo que falta y enseña las cifras en frases; sin datos de YouTube, «sin datos»', async () => {
    const medida = {
      ok: true, semaforo: 'ambar' as const, motivo: 'faltan datos', incompleto: true,
      demanda: { nivel: 'alta', mediana: 83952 }, puerta: { nivel: 'baja', n_evidencias: 0 },
      concentracion: { nivel: 'baja', top3: 0.283 }, ingresos_mes: null, canales: [{ nombre: 'Un Video Más', subs: 1 }],
    };
    await crear(datos({
      mercado: { intereses: 'dinero', propuestas: [nicho(1, { medida }), nicho(2)], error: null, elegido: null, por_medir: [2] },
    }));
    http.expectOne('/api/asistente/canal/mercado/medir');
    expect(texto()).toContain('Se puede, con matices');
    expect(texto()).toContain('83.952 visitas');
    expect(texto()).toContain('ninguno a la vista');
    expect(texto()).toContain('el 28 % de las visitas');
    expect(texto()).toContain('Ingresos: sin datos');
    expect(texto()).toContain('Midiendo en YouTube');
    expect(texto()).not.toMatch(/mercado\.py|YPP|puerta/);
  });

  it('elegir manda el tema marcado (por defecto, el recomendado)', async () => {
    const medida = { ok: true, semaforo: 'verde' as const, motivo: 'hay sitio' };
    await crear(datos({
      mercado: { intereses: null, propuestas: [nicho(1, { medida }), nicho(2, { medida })], error: null, elegido: null, por_medir: [] },
    }));
    boton('Elegir este tema').click();
    const r = http.expectOne('/api/asistente/canal/mercado/elegir');
    expect(r.request.body).toEqual({ propuesta: 1 });
    r.flush({ ok: true });
    await fixture.whenStable();
    // Elegido el tema, se encargan los conceptos sin que el usuario lo pida
    expect(http.expectOne('/api/asistente/canal/concepto/proponer').request.body).toEqual({ indicaciones: '', otros: false });
  });

  it('paso 2: enseña los conceptos y elige el recomendado', async () => {
    await crear(datos({
      ...enPaso('B'), nicho: { nicho: 'Desastres financieros', semaforo: 'ambar' },
      conceptos: { indicaciones: null, propuestas: [concepto(1), concepto(2)], error: null },
    }));
    expect(texto()).toContain('¿Cómo va a ser tu canal?');
    expect(texto()).toContain('Temas: estafas · quiebras');
    boton('Elegir este concepto').click();
    expect(http.expectOne('/api/asistente/canal/concepto/elegir').request.body).toEqual({ propuesta: 2 });
  });

  it('paso 3: mide los nombres que faltan y no deja elegir una @ ocupada', async () => {
    const ocupada = { ok: true, semaforo: 'rojo' as const, motivo: 'La @Nombre1 ya es de otro canal.', id: 'Nombre1', arroba_libre: false };
    await crear(datos({
      ...enPaso('C'), concepto: { nombre: 'Concepto 2', promesa: 'la historia' },
      nombres: { propuestas: [nombre(1, { medida: ocupada }), nombre(2)], error: null, por_medir: [2] },
    }));
    http.expectOne('/api/asistente/canal/nombre/medir');
    expect(texto()).toContain('@Nombre1');
    expect(texto()).toContain('Buscándolo en YouTube');
    expect(texto()).toContain('ya es de otro canal');
    expect(boton('Elegir este nombre').disabled).toBe(true);
  });

  it('paso 3: añade un nombre propio y lo deja marcado', async () => {
    const c = await crear(datos({
      ...enPaso('C'), nombres: { propuestas: [nombre(1, { medida: { ok: true, semaforo: 'verde', motivo: 'libre' } })], error: null, por_medir: [] },
    }));
    (c as any).nombrePropio = 'Mi Canal';
    (c as any).arrobaPropia = 'MiCanal';
    const hecho = (c as any).anadirNombre();
    const r = http.expectOne('/api/asistente/canal/nombre/anadir');
    expect(r.request.body).toEqual({ nombre: 'Mi Canal', arroba: 'MiCanal' });
    r.flush({ ok: true, id: 101 });
    await hecho;
    expect((c as any).propia()).toBe(101);
    expect((c as any).nombrePropio).toBe('');
  });

  it('en un paso sin pantalla propia avisa de que sigue en el chat', async () => {
    const c = await crear(datos({
      ...enPaso('D'), nicho: { nicho: 'Desastres financieros', semaforo: 'ambar' },
      concepto: { nombre: 'Desastres de Dinero', promesa: 'la historia' },
    }));
    expect(c.guiado()).toBe(false);
    expect(texto()).toContain('Paso 4 de 4');
    expect(texto()).toContain('Desastres de Dinero: la historia');
    expect(texto()).toContain('Tema elegido: Desastres financieros');
  });
});

/** Paso 4: los estilos se comparan con las imágenes delante; se pintan con una tarea gratuita y se elige con un clic. */
describe('CrearCanal: paso 4, elegir el estilo mirando las imágenes', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CrearCanal>;

  const estilos = (cambios: Partial<EstilosCanal> = {}): EstilosCanal => ({
    indicaciones: null, error: null, faltan: 0, referencias: [],
    escenas: [{ id: 'banco', texto: 'Un banco que quiebra' }, { id: 'oro', texto: 'Lingotes de oro' }],
    estilos: [
      { id: 'grabado', nombre: 'Grabado', porque: 'serio', recomendado: false,
        imagenes: { banco: 'ruina/videos/_pruebas/estilo/grabado_klein_banco.png?v=1' }, pedidos: { banco: 'un banco, grabado' } },
      { id: 'acuarela', nombre: 'Acuarela', porque: 'cálido', recomendado: true, imagenes: {}, pedidos: { banco: 'un banco, acuarela' } },
    ],
    ...cambios,
  });

  const enEstilo = (e: EstilosCanal, cambios: Partial<DatosCrearCanal> = {}): DatosCrearCanal => datos({
    ...enPaso('D'), estilos: e, concepto: { nombre: 'Ruina', promesa: 'la historia' },
    creacion: { slug: 'ruina', nombre: 'Ruina', fase: 'D', completadas: ['A', 'B', 'C'], carpeta: true }, ...cambios,
  });

  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(d: DatosCrearCanal, tareas: unknown[] = []): Promise<void> {
    fixture = TestBed.createComponent(CrearCanal);
    fixture.detectChanges();
    http.expectOne('/api/asistente/canal').flush(d);
    await fixture.whenStable();
    fixture.detectChanges();
    http.match((r) => r.url === '/api/tareas').forEach((r) => r.flush(tareas));
    http.match('/api/herramientas').forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (t: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes(t))!;

  it('sin estilos pide indicaciones y encarga la propuesta a Claude', async () => {
    await crear(enEstilo(estilos({ estilos: [], escenas: [] })));
    expect(texto()).toContain('Paso 4 de 4');
    expect(texto()).toContain('¿Cómo se van a ver tus vídeos?');
    boton('Proponer estilos').click();
    expect(http.expectOne('/api/asistente/canal/estilo/proponer').request.body).toEqual({ indicaciones: '', otros: false });
  });

  it('enseña la rejilla, dice cuántas faltan y lanza la tarea gratuita', async () => {
    await crear(enEstilo(estilos({ faltan: 3 })));
    const imgs = (fixture.nativeElement as HTMLElement).querySelectorAll('.celda img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('src')).toBe('/api/medios/ruina/videos/_pruebas/estilo/grabado_klein_banco.png?v=1&ancho=480');
    expect(texto()).toContain('Faltan 3 imágenes');
    boton('Hacer las imágenes').click();
    const r = http.expectOne('/api/tareas');
    expect(r.request.body).toEqual({ herramienta: 'estilo_canal', video_id: null, argumentos: { canal: 'ruina' } });
  });

  it('con estilos ya propuestos se puede pedir uno propio con texto libre', async () => {
    await crear(enEstilo(estilos()));
    const caja = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('textarea[name="estilo-propio"]')!;
    caja.value = 'acuarela suave';
    caja.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    boton('Probar mi estilo').click();
    expect(http.expectOne('/api/asistente/canal/estilo/proponer').request.body).toEqual({ indicaciones: 'acuarela suave', otros: true });
  });

  it('el recomendado sin imágenes no se puede elegir; uno con imagen, sí', async () => {
    await crear(enEstilo(estilos()));
    expect(boton('Faltan sus imágenes').disabled).toBe(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.estilo__cabecera')!.click();
    fixture.detectChanges();
    boton('Elegir este estilo').click();
    expect(http.expectOne('/api/asistente/canal/estilo/elegir').request.body).toEqual({ estilo: 'grabado' });
  });

  it('quita un estilo concreto tras confirmarlo', async () => {
    await crear(enEstilo(estilos()));
    boton('Quitar este estilo').click();
    fixture.detectChanges();
    expect(texto()).toContain('¿Quitar «Grabado» y sus imágenes?');
    http.expectNone('/api/asistente/canal/estilo/grabado');
    boton('Sí, quitarlo').click();
    expect(http.expectOne('/api/asistente/canal/estilo/grabado').request.method).toBe('DELETE');
  });

  it('guarda la descripción de una imagen de ejemplo al salir de la caja', async () => {
    await crear(enEstilo(estilos({ referencias: [{ nombre: 'ref-1.png', url: 'ruina/a.png', descripcion: '' }] })));
    const caja = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>('.ref__nota')!;
    caja.value = 'solo el trazo';
    caja.dispatchEvent(new Event('blur'));
    const r = http.expectOne('/api/asistente/canal/estilo/referencia/ref-1.png/descripcion');
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ descripcion: 'solo el trazo' });
  });

  it('empezar de cero pide confirmar y quita todos los estilos', async () => {
    await crear(enEstilo(estilos()));
    boton('Empezar de cero').click();
    fixture.detectChanges();
    http.expectNone('/api/asistente/canal/estilos');
    boton('Sí, empezar de cero').click();
    expect(http.expectOne('/api/asistente/canal/estilos').request.method).toBe('DELETE');
  });

  it('con la tarea en marcha no deja quitar estilos', async () => {
    const tarea = { id: 7, herramienta: 'estilo_canal', titulo: 'Imágenes de los estilos', canal: 'ruina', video_id: null,
      argumentos: {}, pesada: true, estado: 'en_curso', codigo: null, progreso: null, creada: '', empezada: '', terminada: null };
    await crear(enEstilo(estilos({ faltan: 3 }), { tarea: { id: 7, estado: 'en_curso', herramienta: 'estilo_canal' } }), [tarea]);
    expect(boton('Empezar de cero').disabled).toBe(true);
    expect(boton('Quitar este estilo').disabled).toBe(true);
  });

  it('con la tarea en marcha enseña su barra y no deja elegir', async () => {
    const tarea = { id: 7, herramienta: 'estilo_canal', titulo: 'Imágenes de los estilos', canal: 'ruina', video_id: null,
      argumentos: {}, pesada: true, estado: 'en_curso', codigo: null, progreso: null, creada: '', empezada: '', terminada: null };
    await crear(enEstilo(estilos({ faltan: 3 }), { tarea: { id: 7, estado: 'en_curso', herramienta: 'estilo_canal' } }), [tarea]);
    expect(texto()).toContain('Imágenes de los estilos');
    expect(texto()).not.toContain('Hacer las imágenes');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.estilo__cabecera')!.click();
    fixture.detectChanges();
    expect(boton('Elegir este estilo').disabled).toBe(true);
  });
});

/** Paso 5: las voces se eligen escuchándolas; las muestras gratis son una tarea y la de pago pide aceptar su coste. */
describe('CrearCanal: paso 5, elegir la voz escuchándola', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CrearCanal>;
  const pedir = vi.fn();

  const voz = (id: string, cambios: object = {}) => ({
    id, voz: `gemini:${id}`, nombre: id, porque: 'encaja', motor: 'gemini' as const, de_pago: false, estilo: null,
    velocidad: null, recomendado: false, muestra: null, oficial: null, ppm: null, duracion: null, avisos: [],
    error: null, ...cambios,
  });

  const voces = (cambios: Partial<VocesCanal> = {}): VocesCanal => ({
    indicaciones: null, texto: 'En 1929 todo el mundo quería acciones.', error: null, faltan: 1,
    coste_ai33: { creditos: 141, euros: 0.01 },
    voces: [
      voz('rachel', { voz: 'ai33:elevenlabs_x', motor: 'ai33', de_pago: true, recomendado: true,
        oficial: 'ruina/videos/_pruebas/voz/rachel_oficial.mp3?v=2' }),
      voz('Puck', { muestra: 'ruina/videos/_pruebas/voz/Puck.mp3?v=3', ppm: 150, avisos: ['1.2 s «acciones»: sube'] }),
      voz('Kore'),
    ],
    ...cambios,
  });

  const enVoz = (v: VocesCanal, cambios: Partial<DatosCrearCanal> = {}): DatosCrearCanal => datos({
    ...enPaso('D'), actual: 'E', voces: v, concepto: { nombre: 'Ruina', promesa: 'la historia' },
    creacion: { slug: 'ruina', nombre: 'Ruina', fase: 'E', completadas: ['A', 'B', 'C', 'D'], carpeta: true }, ...cambios,
  });

  beforeEach(() => {
    pedir.mockReset();
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ConfirmarService, useValue: { pedir } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(d: DatosCrearCanal, tareas: unknown[] = []): Promise<void> {
    fixture = TestBed.createComponent(CrearCanal);
    fixture.detectChanges();
    http.expectOne('/api/asistente/canal').flush(d);
    await fixture.whenStable();
    fixture.detectChanges();
    http.match((r) => r.url === '/api/tareas').forEach((r) => r.flush(tareas));
    http.match('/api/herramientas').forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (t: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes(t))!;
  const cabecera = (i: number) =>
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.voz__cabecera')[i];

  it('sin voces pide cómo se la imagina y encarga la propuesta a Claude', async () => {
    await crear(enVoz(voces({ voces: [], texto: null })));
    expect(texto()).toContain('¿Con qué voz se van a contar tus vídeos?');
    boton('Proponer voces').click();
    expect(http.expectOne('/api/asistente/canal/voz/proponer').request.body).toEqual({ indicaciones: '', otros: false });
  });

  it('enseña el párrafo y las muestras, y lanza la tarea gratuita', async () => {
    await crear(enVoz(voces()));
    expect(texto()).toContain('En 1929 todo el mundo quería acciones.');
    const audios = [...(fixture.nativeElement as HTMLElement).querySelectorAll('audio')].map((a) => a.getAttribute('src'));
    expect(audios).toEqual(['/api/medios/ruina/videos/_pruebas/voz/rachel_oficial.mp3?v=2',
      '/api/medios/ruina/videos/_pruebas/voz/Puck.mp3?v=3']);
    expect(texto()).toContain('150 palabras por minuto');
    expect(texto()).toContain('1 cosa que escuchar con atención');
    expect(texto()).toContain('Falta 1 muestra');
    boton('Hacer las muestras').click();
    expect(http.expectOne('/api/tareas').request.body).toEqual({ herramienta: 'voz_canal', video_id: null, argumentos: { canal: 'ruina' } });
  });

  it('la de pago con su muestra oficial se puede elegir; una sin muestra, no', async () => {
    await crear(enVoz(voces()));
    cabecera(2).click();
    fixture.detectChanges();
    expect(boton('Falta su muestra').disabled).toBe(true);
    cabecera(0).click();
    fixture.detectChanges();
    boton('Elegir esta voz').click();
    expect(http.expectOne('/api/asistente/canal/voz/elegir').request.body).toEqual({ voz: 'rachel' });
  });

  it('la muestra de pago pide confirmar el coste y no lanza nada si se cancela', async () => {
    await crear(enVoz(voces()));
    pedir.mockResolvedValue(false);
    boton('Oírla con tu párrafo').click();
    await fixture.whenStable();
    expect(pedir).toHaveBeenCalledWith(expect.objectContaining({ tono: 'pago', creditos: 141 }));
    http.expectNone('/api/tareas');
    pedir.mockResolvedValue(true);
    boton('Oírla con tu párrafo').click();
    await fixture.whenStable();
    expect(http.expectOne('/api/tareas').request.body).toEqual({ herramienta: 'voz_canal_ai33', video_id: null,
      argumentos: { canal: 'ruina', voz: 'rachel', confirmado: true, previsto: 141 } });
  });
});

describe('CrearCanal: paso 6, elegir la marca viéndola y oyéndola', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CrearCanal>;

  const marca = (id: string, cambios: object = {}) => ({
    id, nombre: id, porque: 'encaja', fuente: 'Anton', fuente_nombre: 'Anton', musica: 'misterio',
    colores: { acento: '#aa0000', resaltado: '#ffcc00', texto: '#ffffff', fondo: '#111111' },
    recomendada: false, miniaturas: [] as string[], audio: null as string | null, ...cambios,
  });

  const marcas = (cambios: Partial<MarcasCanal> = {}): MarcasCanal => ({
    indicaciones: null, titulo: 'LA RUINA', error: null, faltan: 1,
    propuestas: [
      marca('dura', { recomendada: true, miniaturas: ['ruina/videos/_pruebas/marca/dura-1.jpg?v=1'],
        audio: 'ruina/videos/_pruebas/marca/musica_misterio.mp3?v=1' }),
      marca('suave'),
    ],
    ...cambios,
  });

  const enMarca = (m: MarcasCanal): DatosCrearCanal => datos({
    ...enPaso('E'), actual: 'F', marcas: m, concepto: { nombre: 'Ruina', promesa: 'la historia' },
    creacion: { slug: 'ruina', nombre: 'Ruina', fase: 'F', completadas: ['A', 'B', 'C', 'D', 'E'], carpeta: true },
  });

  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ConfirmarService, useValue: { pedir: vi.fn() } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(d: DatosCrearCanal): Promise<void> {
    fixture = TestBed.createComponent(CrearCanal);
    fixture.detectChanges();
    http.expectOne('/api/asistente/canal').flush(d);
    await fixture.whenStable();
    fixture.detectChanges();
    http.match((r) => r.url === '/api/tareas').forEach((r) => r.flush([]));
    http.match('/api/herramientas').forEach((r) => r.flush([]));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (t: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes(t))!;

  it('sin propuestas pide cómo se imagina la marca y la encarga a Claude', async () => {
    await crear(enMarca(marcas({ propuestas: [], titulo: undefined })));
    expect(texto()).toContain('¿Cómo se va a ver y a oír tu canal?');
    boton('Proponer marca').click();
    expect(http.expectOne('/api/asistente/canal/marca/proponer').request.body).toEqual({ indicaciones: '', otros: false });
  });

  it('enseña miniaturas y música, y lanza la tarea gratuita', async () => {
    await crear(enMarca(marcas()));
    const el = fixture.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('img')].map((i) => i.getAttribute('src')))
      .toEqual(['/api/medios/ruina/videos/_pruebas/marca/dura-1.jpg?v=1']);
    expect([...el.querySelectorAll('audio')].map((a) => a.getAttribute('src')))
      .toEqual(['/api/medios/ruina/videos/_pruebas/marca/musica_misterio.mp3?v=1']);
    expect(texto()).toContain('Falta 1 muestra');
    boton('Hacer las muestras').click();
    expect(http.expectOne('/api/tareas').request.body).toEqual({ herramienta: 'marca_canal', video_id: null, argumentos: { canal: 'ruina' } });
  });

  it('elige la recomendada; una sin miniatura no se puede elegir', async () => {
    await crear(enMarca(marcas()));
    boton('Elegir esta marca').click();
    expect(http.expectOne('/api/asistente/canal/marca/elegir').request.body).toEqual({ marca: 'dura' });
  });

  it('una marca sin miniatura no deja elegir', async () => {
    await crear(enMarca(marcas()));
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.marca__cabecera')[1].click();
    fixture.detectChanges();
    expect(boton('Falta su miniatura').disabled).toBe(true);
  });

  const enFase = (cambios: Partial<DatosCrearCanal>): DatosCrearCanal => datos({
    ...enPaso('E'), concepto: { nombre: 'Ruina', promesa: 'la historia' },
    creacion: { slug: 'ruina', nombre: 'Ruina', fase: 'G', completadas: [], carpeta: true }, ...cambios,
  });

  it('paso 7: sin prueba pide las reglas; con prueba manda las dos respuestas', async () => {
    await crear(enFase({ reglas: { indicaciones: null, prueba: null, error: null, pendientes: [] } }));
    boton('Escribir las reglas').click();
    expect(http.expectOne('/api/asistente/canal/reglas/proponer').request.body).toEqual({ indicaciones: '', otros: false });
  });

  it('paso 7: confirma las reglas con lo que Claude recomienda', async () => {
    await crear(enFase({ reglas: {
      indicaciones: null, error: null, pendientes: [],
      prueba: { resumen: ['Sin cifras largas'], licencias: 'música propia',
        sintetico: { respuesta: true, motivo: 'voz de IA' }, afiliacion: { respuesta: false, motivo: 'sin enlaces' } },
    } }));
    expect(texto()).toContain('Sin cifras largas');
    boton('Confirmar reglas').click();
    expect(http.expectOne('/api/asistente/canal/reglas/elegir').request.body).toEqual({ sintetico: true, afiliacion: false });
  });

  it('paso 8: los opcionales recomendados vienen marcados', async () => {
    const rol = (id: string, base: boolean, recomendado: boolean) =>
      ({ id, nombre: id, base, porque: '', recomendado, ficha: true, rellena: true });
    await crear(enFase({ equipo: { indicaciones: null, error: null, pruebas: [],
      roles: [rol('guionista', true, false), rol('verificador', false, true), rol('asesor-tematico', false, false)] } }));
    boton('Quedarme con este equipo').click();
    expect(http.expectOne('/api/asistente/canal/equipo/elegir').request.body).toEqual({ opcionales: ['verificador'] });
  });

  it('paso 9: enseña los textos y permite dejarlo para más tarde', async () => {
    await crear(enFase({ alta: { indicaciones: null, error: null, avatar: null, banner: null, previas: [],
      prueba: { nombre: 'Ruina', arroba: 'ruina', descripcion: 'La historia', palabras_clave: ['a', 'b'], categoria: 'Educación', audiencia: 'No es para niños' } } }));
    expect(texto()).toContain('@ruina');
    boton('Lo haré más tarde').click();
    http.expectOne('/api/asistente/canal/alta/saltar');
  });

  it('paso 10: elige la recomendada y las medidas se piden solas', async () => {
    const idea = (id: number, rec: boolean) => ({ id, titulo: `Idea ${id}`, dato: 'dato', amplio: '', en: '', pilar: 'P', enfoque: '',
      recomendada: rec, medida: { semaforo: 'verde' as const, motivo: 'hay hueco', fecha: '2026-10-15' }, midiendo: false });
    await crear(enFase({ ideas: { indicaciones: null, error: null, por_medir: [], minimo: 2, ideas: [idea(1, false), idea(2, true), idea(3, false)] } }));
    boton('Quedarme con estas ideas').click();
    expect(http.expectOne('/api/asistente/canal/ideas/elegir').request.body).toEqual({ candidata: 2, descartadas: [] });
  });

  it('paso 11: no se termina sin la prueba hecha', async () => {
    await crear(enFase({ cierre: { indicaciones: null, pendientes: [], candidata: null, activo: false }, tarea: null }));
    expect(boton('Terminar el canal').disabled).toBe(true);
    boton('Hacer la prueba').click();
    expect(http.expectOne('/api/tareas').request.body).toEqual({ herramienta: 'probar_kit', video_id: null, argumentos: { canal: 'ruina' } });
  });
});
