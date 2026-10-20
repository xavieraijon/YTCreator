import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Confirmacion, ConfirmarService } from '../compartido/confirmar';
import { ApagadoService } from './apagado.service';
import { AvisosService } from './avisos.service';
import { TareasService } from './tareas.service';

const esperar = () => new Promise((r) => setTimeout(r));

describe('Cerrar y reiniciar YTCreator', () => {
  let http: HttpTestingController;
  let apagado: ApagadoService;
  let acepta: boolean;
  let pedido: Confirmacion | null;
  const activas = signal<unknown[]>([]);

  beforeEach(() => {
    acepta = true;
    pedido = null;
    activas.set([]);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfirmarService, useValue: { pedir: async (c: Confirmacion) => ((pedido = c), acepta) } },
        { provide: TareasService, useValue: { activas } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    apagado = TestBed.inject(ApagadoService);
    apagado.salud({ apagable: true, arranque: 100 });
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('cerrar: confirma, avisa de los trabajos en marcha y deja la pantalla de cerrado', async () => {
    activas.set([{}, {}]);
    const fin = apagado.cerrar();
    await esperar();
    expect(pedido?.aviso).toContain('2 trabajos en marcha');
    http.expectOne({ method: 'POST', url: '/api/cerrar' }).flush({ ok: true });
    await fin;
    expect(apagado.estado()).toBe('cerrado');
  });

  it('si no acepta, no pide nada', async () => {
    acepta = false;
    await apagado.cerrar();
    expect(apagado.estado()).toBeNull();
  });

  it('si el servidor no deja (no se abrió con arrancar.py), lo dice y sigue en marcha', async () => {
    const avisos = TestBed.inject(AvisosService);
    const fin = apagado.reiniciar();
    await esperar();
    http.expectOne('/api/reiniciar').flush({ detail: 'ciérralo en la ventana (Ctrl+C)' }, { status: 409, statusText: 'Conflict' });
    await fin;
    expect(apagado.estado()).toBeNull();
    expect(avisos.avisos()[0].texto).toContain('Ctrl+C');
  });

  it('reiniciar: espera a que el servidor vuelva con otro arranque y no se rinde si tarda', async () => {
    vi.useFakeTimers();
    const fin = apagado.reiniciar();
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne('/api/reiniciar').flush({ ok: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(apagado.estado()).toBe('reiniciando');
    http.expectOne('/api/salud').flush(null, { status: 0, statusText: 'parado' });
    await vi.advanceTimersByTimeAsync(1000);
    let terminado = false;
    void fin.then(() => (terminado = true));
    for (let i = 0; i < 100 && !terminado; i++) {                    // siempre el arranque viejo: no ha vuelto
      for (const r of http.match('/api/salud')) r.flush({ arranque: 100 });
      await vi.advanceTimersByTimeAsync(1000);
    }
    await fin;
    expect(apagado.estado()).toBe('sin_volver');
  });
});
