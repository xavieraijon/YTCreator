import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Imagen } from '../core/modelos';
import { SubirImagenes } from './subir-imagen';

/** Subir varias imágenes propias (bloque B): van por orden de nombre a los huecos que faltan; lo que sobra se dice. */
const img = (ident: string, cambios: Partial<Imagen> = {}) => ({ ident, origen: 'prompt', existe: false, ...cambios }) as Imagen;

describe('SubirImagenes', () => {
  function crear(imagenes: Imagen[]) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const f = TestBed.createComponent(SubirImagenes);
    f.componentRef.setInput('videoId', 4);
    f.componentRef.setInput('imagenes', imagenes);
    f.detectChanges();
    return { a: f.componentInstance as any, http: TestBed.inject(HttpTestingController) };
  }
  const archivo = (nombre: string) => new File(['x'], nombre, { type: 'image/png' });
  const tick = () => new Promise((ok) => setTimeout(ok));

  it('solo cuentan como huecos los que se generarían y aún no existen (ni hechas, ni propias, ni verticales)', () => {
    const { a } = crear([img('01-1', { existe: true }), img('02-1'), img('02-2', { origen: 'imagen' }), img('v01-1'), img('03-1')]);
    expect(a.huecos().map((i: Imagen) => i.ident)).toEqual(['02-1', '03-1']);
  });

  it('coloca por orden de nombre (2 antes que 10), se salta lo que sobra y lo dice', async () => {
    const { a, http } = crear([img('02-1'), img('03-1')]);
    const campo = { files: [archivo('foto10.png'), archivo('foto2.png'), archivo('foto3.png')], value: 'x' };
    const subiendo = a.subir(campo);
    for (const [ident, nombre] of [['02-1', 'foto2.png'], ['03-1', 'foto3.png']]) {
      await tick();
      const put = http.expectOne((r) => r.url === `/api/videos/4/imagenes/${ident}/propia`);
      expect(put.request.params.get('nombre')).toBe(nombre);
      put.flush({ ok: true });
    }
    await subiendo;
    http.verify();                                            // foto10.png no se manda: no quedaban huecos
    expect(a.resultado()).toBe('2 imágenes colocadas (de 02-1 a 03-1); sobra 1: no quedaban huecos.');
    expect(campo.value).toBe('');
  });

  it('un archivo que falla se dice con su nombre y el resto sigue', async () => {
    const { a, http } = crear([img('02-1'), img('03-1')]);
    const subiendo = a.subir({ files: [archivo('a.png'), archivo('b.png')], value: '' });
    await tick();
    http.expectOne('/api/videos/4/imagenes/02-1/propia?nombre=a.png')
      .flush({ detail: 'No es una imagen que se pueda leer' }, { status: 422, statusText: 'Unprocessable' });
    await tick();
    http.expectOne('/api/videos/4/imagenes/03-1/propia?nombre=b.png').flush({ ok: true });
    await subiendo;
    expect(a.errores()[0]).toContain('a.png → 02-1: No es una imagen');
    expect(a.resultado()).toContain('1 imagen colocada');
  });
});
