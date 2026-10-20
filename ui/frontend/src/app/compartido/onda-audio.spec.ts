import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

/** Las instancias que ha creado el WaveSurfer falso, en orden (para mirar con qué opciones se llamó). */
const creadas: { opciones: any; on: ReturnType<typeof vi.fn>; setTime: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }[] = [];

vi.mock('wavesurfer.js', () => ({
  default: {
    create: vi.fn((opciones: any) => {
      const instancia = { opciones, on: vi.fn(), setTime: vi.fn(), play: vi.fn(), destroy: vi.fn() };
      creadas.push(instancia);
      return instancia;
    }),
  },
}));

import { OndaAudio } from './onda-audio';

/** Bloque D: la onda pide los picos ya calculados al backend y, con ellos, crea wavesurfer sin decodificar nada
 * en el navegador; «saltar» (clic en una palabra del karaoke) mueve la cabeza y reproduce. */
describe('OndaAudio', () => {
  function crear(canal: string, ruta: string) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const f = TestBed.createComponent(OndaAudio);
    f.componentRef.setInput('canal', canal);
    f.componentRef.setInput('ruta', ruta);
    f.detectChanges();
    return { a: f.componentInstance, http: TestBed.inject(HttpTestingController) };
  }
  const tick = () => new Promise((ok) => setTimeout(ok));

  it('pide los picos precalculados (?picos=200) y se los pasa a wavesurfer', async () => {
    creadas.length = 0;
    const { http } = crear('mi-canal', 'videos/001/voz/01.wav');
    await tick();
    http.expectOne('/api/medios/mi-canal/videos/001/voz/01.wav?picos=200').flush({ picos: [0.1, 0.2, 0.3] });
    await tick();
    expect(creadas[0].opciones.peaks).toEqual([[0.1, 0.2, 0.3]]);
    expect(creadas[0].opciones.url).toBe('/api/medios/mi-canal/videos/001/voz/01.wav');
  });

  it('sin picos (falla la petición), igualmente crea wavesurfer para que decodifique él mismo', async () => {
    creadas.length = 0;
    const { http } = crear('mi-canal', 'a.wav');
    await tick();
    http.expectOne(() => true).flush('no hay picos', { status: 500, statusText: 'Error' });
    await tick();
    expect(creadas[0].opciones.peaks).toBeUndefined();
  });

  it('saltar() mueve la cabeza al tiempo pedido y reproduce', async () => {
    creadas.length = 0;
    const { a, http } = crear('mi-canal', 'a.wav');
    await tick();
    http.expectOne(() => true).flush({ picos: [] });
    await tick();
    a.saltar(12.5);
    expect(creadas[0].setTime).toHaveBeenCalledWith(12.5);
    expect(creadas[0].play).toHaveBeenCalled();
  });
});
