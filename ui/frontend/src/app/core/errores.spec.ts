import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { mensajeError } from './errores';

const http = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('mensajeError', () => {
  it('usa el detalle del backend cuando es texto', () => {
    expect(mensajeError(http(409, { detail: 'La tarea ya está hecha' }), 'otro')).toBe('La tarea ya está hecha');
  });

  it('une los mensajes de validación de FastAPI (422 con una lista) en vez de enseñar [object Object]', () => {
    const e = http(422, { detail: [{ msg: 'String should match pattern' }, { msg: 'Field required' }] });
    expect(mensajeError(e)).toBe('Datos no válidos: String should match pattern · Field required');
  });

  it('sin conexión dice cómo arrancar el backend', () => {
    expect(mensajeError(http(0, null), 'No se pudo guardar')).toContain('comprueba que está en marcha');
  });

  it('sin detalle, el texto por defecto o el código', () => {
    expect(mensajeError(http(500, 'Internal Server Error'), 'No se pudo guardar')).toBe('No se pudo guardar');
    expect(mensajeError(http(500, null))).toBe('Error 500');
    expect(mensajeError(new Error('raro'))).toBe('Error: raro');
  });
});
