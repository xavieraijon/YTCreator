import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmarService } from '../../compartido/confirmar';
import { FaseTramos as DatosFase, TramoActual, VideoDetalle } from '../../core/modelos';
import { FaseTramos } from './fase-tramos';

/**
 * Una fase por tramos: el botón principal encarga a Claude, aprobar manda la elección, «Pedir cambios» manda el texto,
 * «Continuar» cierra la fase y rehacer un paso ya hecho pide confirmación. Lo que falla en el backend se dice al usuario.
 */
const VIDEO = { id: 5, canal: 'c', carpeta: '005-gatos', fase: 'D', tipo: 'largo', escenas: [], medios: { videos: [] } } as unknown as VideoDetalle;

const tramo = (cambios: Partial<TramoActual> = {}): TramoActual => ({
  id: 'd-guion', titulo: 'Escribe el guion', ayuda: 'Claude escribe el guion.', vista: 'doc', boton: 'Escribir el guion',
  tarda: '10 minutos', job: true, producido: false, aprobable: false, completable: false, aprobacion: 'd-aprobar-guion',
  cambios_pendientes: [], luces: [], datos: {}, docs: [], ...cambios,
});

const fase = (actual: TramoActual | null, cambios: Partial<DatosFase> = {}): DatosFase => ({
  letra: 'D', fase: 'D', completa: actual === null, actual,
  tramos: [{ id: 'd-escaleta', titulo: 'Lee la historia', estado: 'hecho', detalle: tramo({ id: 'd-escaleta', titulo: 'Lee la historia', producido: true }) },
           { id: 'd-guion', titulo: actual?.titulo ?? 'Lee el guion', estado: actual ? 'actual' : 'hecho' }],
  trabajo: { estado: 'libre', accion: null, conversacion: null }, ...cambios,
});

describe('FaseTramos: los botones de cada paso', () => {
  let http: HttpTestingController;
  let pedir: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<FaseTramos>;

  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    pedir = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ConfirmarService, useValue: { pedir } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(datos: DatosFase): Promise<any> {
    fixture = TestBed.createComponent(FaseTramos);
    fixture.componentRef.setInput('video', VIDEO);
    fixture.componentRef.setInput('letra', 'D');
    fixture.detectChanges();
    http.match('/api/herramientas').forEach((r) => r.flush([]));
    http.match((r) => r.url === '/api/tareas').forEach((r) => r.flush([]));
    http.match('/api/servicios').forEach((r) => r.flush({ servicios: [], capacidades: {}, resumen: {} }));
    http.expectOne('/api/videos/5/fase/D').flush(datos);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const tick = () => new Promise((ok) => setTimeout(ok));
  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const boton = (t: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes(t));

  it('un paso por hacer enseña su botón y lo encarga a Claude sin preguntar', async () => {
    const c = await crear(fase(tramo()));
    expect(texto()).toContain('Escribe el guion');
    boton('Escribir el guion')!.click();
    const post = http.expectOne('/api/videos/5/tramo/d-guion/producir');
    expect(post.request.method).toBe('POST');
    post.flush({ ok: true });
    await tick();                                       // al encargarlo, la pantalla vuelve a pedir su estado
    http.expectOne('/api/videos/5/fase/D').flush(fase(tramo(), { trabajo: { estado: 'pensando', accion: 'Leyendo', conversacion: 3 } }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(pedir).not.toHaveBeenCalled();
    expect(texto()).toContain('Claude está trabajando');
    expect(c).toBeTruthy();
  });

  it('si todavía no se puede aprobar, lo dice y no hay botón de aprobar', async () => {
    await crear(fase(tramo({ producido: true, aprobable: false })));
    expect(texto()).toContain('Cuando esté listo, podrás aprobarlo aquí');
    expect(boton('Aprobar')).toBeUndefined();
  });

  it('aprobar el título manda el elegido o, si no se ha tocado, el recomendado', async () => {
    const titulos = [{ n: 1, texto: 'Uno' }, { n: 2, texto: 'Dos', recomendado: true }, { n: 3, texto: 'Tres' }];
    const datos = fase(tramo({ id: 'd-empaquetado', vista: 'empaquetado', producido: true, aprobable: true,
                               datos: { titulos, miniatura: null } }));
    const c = await crear(datos);
    let aprobando = c.aprobar();
    let post = http.expectOne('/api/videos/5/tramo/d-empaquetado/aprobar');
    expect(post.request.body).toEqual({ eleccion: 2 });
    post.flush({ ok: true });
    await aprobando;
    await tick();                                       // tras aprobar, la pantalla vuelve a leer la fase
    http.expectOne('/api/videos/5/fase/D').flush(datos);
    await fixture.whenStable();
    c.eleccion.set(3);
    aprobando = c.aprobar();
    post = http.expectOne('/api/videos/5/tramo/d-empaquetado/aprobar');
    expect(post.request.body).toEqual({ eleccion: 3 });
    post.flush({ ok: true });
    await aprobando;
  });

  it('«Pedir cambios» manda el texto y cierra el cuadro', async () => {
    const c = await crear(fase(tramo({ producido: true, aprobable: true })));
    boton('Pedir cambios')!.click();
    expect(c.cambiosAbiertos()).toBe(true);
    c.textoCambios.set('Más corto el gancho');
    const enviando = c.enviarCambios();
    const post = http.expectOne('/api/videos/5/tramo/d-guion/cambios');
    expect(post.request.body).toEqual({ texto: 'Más corto el gancho' });
    post.flush({ ok: true });
    await enviando;
    expect(c.cambiosAbiertos()).toBe(false);
    expect(c.textoCambios()).toBe('');
  });

  it('un error del backend se enseña con su explicación', async () => {
    const c = await crear(fase(tramo({ producido: true, aprobable: true })));
    const aprobando = c.aprobar();
    http.expectOne('/api/videos/5/tramo/d-guion/aprobar')
      .flush({ detail: 'Todavía no se puede aprobar: falta lo que hay que aprobar.' }, { status: 422, statusText: 'Unprocessable' });
    await aprobando;
    fixture.detectChanges();
    expect(texto()).toContain('Todavía no se puede aprobar');
  });

  it('volver a generar un paso ya hecho pide confirmación; si se cancela, no se encarga', async () => {
    const c = await crear(fase(tramo()));
    c.verHecho.set('d-escaleta');
    fixture.detectChanges();
    http.expectOne('/api/videos/5/fase/D?revision=true').flush(fase(tramo()));   // mirar un paso hecho pide su detalle
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto()).toContain('Estás mirando');
    pedir.mockResolvedValue(false);
    await c.producir();
    expect(pedir.mock.calls[0][0].titulo).toContain('Volver a generar «Lee la historia»');
    http.expectNone('/api/videos/5/tramo/d-escaleta/producir');
  });

  it('con la fase completa, «Continuar» la cierra', async () => {
    await crear(fase(null));
    expect(texto()).toContain('Fase completa');
    boton('Continuar')!.click();
    const post = http.expectOne('/api/videos/5/fase/D/cerrar');
    expect(post.request.method).toBe('POST');
    post.flush({ ok: true });
  });
});
