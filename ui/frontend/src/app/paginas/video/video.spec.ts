import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VideoDetalle } from '../../core/modelos';
import { DetallesFase } from './detalles-fase';
import { VideoPagina } from './video';

/**
 * La pantalla del vídeo es solo el paso a paso (bloque A de docs/plan-mejoras-usuario.md): no hay vista «Avanzado» aparte.
 * Antes, un vídeo en la fase J (publicado y resultados) o sin fase caía siempre en esa vista.
 */
const video = (cambios: Partial<VideoDetalle> = {}): VideoDetalle => ({
  id: 7, canal: 'c', carpeta: '007-gatos', titulo: 'Gatos', tipo: 'largo', fase: 'J', aparcado: false, estado_real: null,
  fases: [{ letra: 'I', nombre: 'Cierre', estado: 'hecha' }, { letra: 'J', nombre: 'Publicado y resultados', estado: 'actual' }],
  escenas: [], imagenes: [], documentos: ['guion.md'], notas: ['Montado el 3'], pendiente: null, extra: null,
  medios: { videos: [], audio: [], miniaturas: [], subtitulos: [] }, ...cambios,
} as unknown as VideoDetalle);

describe('VideoPagina: solo el paso a paso', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<VideoPagina>;

  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  async function crear(v: VideoDetalle): Promise<HTMLElement> {
    fixture = TestBed.createComponent(VideoPagina);
    fixture.componentRef.setInput('id', '7');
    fixture.detectChanges();
    http.expectOne('/api/videos/7').flush(v);
    await new Promise((ok) => setTimeout(ok));      // no whenStable: los pasos hijos dejan peticiones sin atender
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  for (const fase of ['J', null, 'cerrado']) {
    it(`un vídeo con fase ${fase} se ve en el paso a paso`, async () => {
      const el = await crear(video({ fase }));
      expect(el.querySelector('app-fase-guiada')).not.toBeNull();
      expect(el.textContent).not.toContain('Avanzado');
    });
  }

  it('un vídeo archivado enseña cómo recuperarlo, sin el paso a paso', async () => {
    const el = await crear(video({ aparcado: true }));
    expect(el.querySelector('app-fase-guiada')).toBeNull();
    expect(el.textContent).toContain('Recuperar del archivo');
  });
});

describe('DetallesFase: el detalle técnico de cada paso', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', class { onmessage = null; onerror = null; onopen = null; close() {} });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  function crear(vista: string): ComponentFixture<DetallesFase> {
    const fixture = TestBed.createComponent(DetallesFase);
    fixture.componentRef.setInput('video', video());
    fixture.componentRef.setInput('vista', vista);
    fixture.detectChanges();
    return fixture;
  }
  const el = (f: ComponentFixture<DetallesFase>) => f.nativeElement as HTMLElement;

  it('los pasos sin detalle técnico no pintan nada', () => {
    expect(el(crear('doc')).querySelector('details')).toBeNull();
    expect(el(crear('empaquetado')).querySelector('details')).toBeNull();
  });

  it('el detalle sale plegado y solo se pinta al abrirlo', () => {
    const f = crear('voz');
    const detalles = el(f).querySelector('details')!;
    expect(detalles.open).toBe(false);
    expect(el(f).textContent).not.toContain('Todavía no hay archivos de locución');

    detalles.open = true;
    detalles.dispatchEvent(new Event('toggle'));
    f.detectChanges();
    expect(el(f).textContent).toContain('Todavía no hay archivos de locución');
  });
});
