import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AjustesGasto } from './gasto';
import { ConectarServicio } from './conectar-servicio';
import { AjustesIA } from './ia';
import { AjustesServicios } from './servicios';

const clave = (c: string, rellena = false) => ({ clave: c, texto: c, ayuda: 'dónde', rellena });

describe('Ajustes: claves, IA y gasto', () => {
  beforeEach(() => {
    // El servicio de tareas abre un EventSource al crearse; en las pruebas no hay servidor.
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; addEventListener() {} close() {} });
  });

  function crear(componente: any = AjustesServicios): any {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return TestBed.createComponent(componente).componentInstance;
  }

  it('los niveles de la IA se reconocen por sus perfiles; lo demás es «personalizado»', () => {
    const a = crear(AjustesIA);
    const equilibrado = a.niveles.find((n: any) => n.clave === 'equilibrado').perfiles;
    expect(a.nivelActual({ perfiles: equilibrado })).toBe('equilibrado');
    expect(a.nivelActual({ perfiles: { ...equilibrado, produccion: { modelo: 'haiku', esfuerzo: 'low' } } })).toBe('propio');
  });

  // --- Lo que guarda (con el backend de mentira): qué se manda, cuándo no se manda nada y qué ve el usuario si falla.

  const tick = () => new Promise((ok) => setTimeout(ok));

  function conHttp(componente: any = AjustesServicios): { a: any; http: HttpTestingController } {
    const a = crear(componente);
    return { a, http: TestBed.inject(HttpTestingController) };
  }

  it('guardar una clave la manda sin espacios y vacía el campo (nunca se vuelve a enseñar)', async () => {
    const { a, http } = conHttp();
    a.valores['CF_API_TOKEN'] = '  abc123  ';
    const guardando = a.guardar(clave('CF_API_TOKEN'));
    const put = http.expectOne('/api/ajustes/clave');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ clave: 'CF_API_TOKEN', valor: 'abc123' });
    put.flush({ ok: true });
    await guardando;
    expect(a.valores['CF_API_TOKEN']).toBe('');
  });

  it('si guardar la clave falla, se dice junto a esa clave y se conserva lo escrito', async () => {
    const { a, http } = conHttp();
    a.valores['CF_API_TOKEN'] = 'abc123';
    const guardando = a.guardar(clave('CF_API_TOKEN'));
    http.expectOne('/api/ajustes/clave').flush({ detail: 'La clave no es válida' }, { status: 422, statusText: 'Unprocessable' });
    await guardando;
    expect(a.errores()['CF_API_TOKEN']).toContain('La clave no es válida');
    expect(a.valores['CF_API_TOKEN']).toBe('abc123');
  });

  it('el tope de gasto acepta coma decimal, se quita vacío y rechaza lo que no es un número', async () => {
    const { a, http } = conHttp(AjustesGasto);
    a.tope.set('2,50');
    let guardando = a.guardarTope();
    let put = http.expectOne('/api/ajustes/presupuesto');
    expect(put.request.body).toEqual({ tope_euros_video: 2.5 });
    put.flush({ ok: true });
    await guardando;
    a.tope.set('');
    guardando = a.guardarTope();
    put = http.expectOne('/api/ajustes/presupuesto');
    expect(put.request.body).toEqual({ tope_euros_video: null });
    put.flush({ ok: true });
    await guardando;
    a.tope.set('mucho');
    await a.guardarTope();
    http.expectNone('/api/ajustes/presupuesto');
    expect(a.errorTope()).toContain('Escribe un número');
  });

  it('un límite tiene que ser mayor que 0; uno válido se manda con punto decimal', async () => {
    const { a, http } = conHttp(AjustesGasto);
    const limite = { clave: 'cloudflare.neuronas_imagen', texto: 'Neuronas por imagen', valor: 110 };
    a.editados[limite.clave] = '0';
    await a.guardarLimite(limite);
    http.expectNone('/api/ajustes/proveedores');
    expect(a.errorLimite()).toContain('mayor que 0');
    a.editados[limite.clave] = '1,5';
    const guardando = a.guardarLimite(limite);
    const put = http.expectOne('/api/ajustes/proveedores');
    expect(put.request.body).toEqual({ clave: limite.clave, valor: 1.5 });
    put.flush({ ok: true });
    await guardando;
  });

  it('usar o dejar de usar un servicio lo manda y enseña la lista que devuelve el backend', async () => {
    const { a, http } = conHttp();
    const servicio = { id: 'cloudflare', nombre: 'Cloudflare' };
    const nuevos = { servicios: [], capacidades: {}, resumen: {} };
    const eligiendo = a.elegir(servicio, false);
    expect(a.eligiendo()).toBe('cloudflare');
    const put = http.expectOne('/api/servicios/cloudflare');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ activo: false });
    put.flush(nuevos);
    await eligiendo;
    expect(a.datos.value()).toEqual(nuevos);
    expect(a.eligiendo()).toBeNull();
  });

  it('si elegir falla, se dice y se vuelve a leer la lista (el interruptor no miente)', async () => {
    const { a, http } = conHttp();
    const eligiendo = a.elegir({ id: 'ai33', nombre: 'ai33' }, true);
    http.expectOne('/api/servicios/ai33').flush({ detail: 'No se pudo guardar' }, { status: 500, statusText: 'Error' });
    await eligiendo;
    expect(a.errorEleccion()).toContain('No se pudo guardar');
  });

  it('elegir un nivel de IA manda los perfiles de ese nivel', async () => {
    const { a, http } = conHttp(AjustesIA);
    const rapido = a.niveles[0];
    const guardando = a.elegirNivel(rapido.clave);
    const put = http.expectOne('/api/ajustes/ia');
    expect(put.request.body).toEqual({ perfiles: rapido.perfiles });
    put.flush({ ok: true });
    await guardando;
  });

  it('probar un servicio que falla deja el motivo en su tarjeta', async () => {
    const { a, http } = conHttp();
    const probando = a.probarServicio('cloudflare');
    expect(a.probandoServicio()).toBe('cloudflare');
    http.expectOne('/api/ajustes/probar/cloudflare').flush({ detail: 'Sin conexión' }, { status: 502, statusText: 'Bad Gateway' });
    await probando;
    await tick();
    expect(a.pruebas()['cloudflare']).toMatchObject({ ok: false });
    expect(a.pruebas()['cloudflare'].mensaje).toContain('Sin conexión');
    expect(a.probandoServicio()).toBeNull();
  });

  it('conectar un servicio: valida, guarda y, si es de pago, no gasta sin aceptar el coste', async () => {
    const { a, http } = conHttp(ConectarServicio);
    a.abrir('manual');
    a.f.nombre = 'Mi Servicio';
    a.f.base = 'https://api.ejemplo.com';
    a.f.clave_env = 'MI_API_KEY';
    a.f.ruta = '/v1/img';
    a.f.donde = 'data.0.url';
    a.f.coste = 0.04;
    const guardando = a.guardar();
    const validar = http.expectOne('/api/conectores/validar');
    expect(validar.request.body.spec).toMatchObject({ id: 'mi-servicio', capacidad: 'imagen', coste: { cantidad: 0.04, unidad: 'USD' } });
    validar.flush({ problemas: [] });
    await tick();
    http.expectOne('/api/conectores').flush({ ok: true });
    await guardando;
    expect(a.guardado().de_pago).toBe(true);
    const probando = a.probar('mi-servicio', true);        // sin aceptar el coste
    const post = http.expectOne('/api/conectores/mi-servicio/probar');
    expect(post.request.body).toEqual({ gastar: false });
    post.flush({ ok: false, mensaje: 'Acepta el coste' });
    await probando;
  });

  it('conectar un servicio: los problemas de la validación se enseñan y no se guarda nada', async () => {
    const { a, http } = conHttp(ConectarServicio);
    a.abrir('manual');
    a.f.nombre = 'X';
    const guardando = a.guardar();
    http.expectOne('/api/conectores/validar').flush({ problemas: ['base: debe ser https'] });
    await guardando;
    expect(a.problemas()).toEqual(['base: debe ser https']);
    http.expectNone('/api/conectores');
  });
});
