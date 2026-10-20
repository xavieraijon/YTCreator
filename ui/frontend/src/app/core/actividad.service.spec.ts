import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActividadService } from './actividad.service';
import { AvisosService } from './avisos.service';
import { Tarea } from './modelos';

/** EventSource falso: la prueba decide qué mensajes llegan. */
class FuenteFalsa {
  static ultima: FuenteFalsa;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() {
    FuenteFalsa.ultima = this;
  }
  close(): void {}
  emitir(datos: object): void {
    this.onmessage?.({ data: JSON.stringify(datos) });
  }
}

const tarea = (id: number, estado: Tarea['estado']): Tarea =>
  ({ id, herramienta: 'montar', titulo: 'Montar el vídeo', canal: 'c', video_id: 3, argumentos: {}, pesada: true, estado,
     codigo: null, progreso: null, creada: '', empezada: null, terminada: null }) as Tarea;

const esperar = () => new Promise((r) => setTimeout(r));

describe('Actividad y avisos (bloque 4 del recorrido profano)', () => {
  let http: HttpTestingController;
  let actividad: ActividadService;
  let avisos: AvisosService;

  beforeEach(async () => {
    vi.stubGlobal('EventSource', FuenteFalsa);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    actividad = TestBed.inject(ActividadService);
    avisos = TestBed.inject(AvisosService);
    http.expectOne('/api/herramientas').flush([]);
    http.expectOne((r) => r.url === '/api/tareas').flush([tarea(7, 'en_curso')]);
    http.expectOne('/api/actividad/claude').flush([
      { conversacion: 2, video_id: 5, titulo: 'Los gatos', estado: 'pensando', desde: '2026-10-06T10:00:00', accion: null }]);
    await esperar();
    TestBed.tick();
  });

  it('cuenta juntas las tareas y los turnos de Claude', () => {
    expect(actividad.enMarcha()).toBe(2);
  });

  it('avisa cuando termina una tarea que estaba en marcha', async () => {
    FuenteFalsa.ultima.emitir({ tipo: 'tarea', id: 7, estado: 'hecha', codigo: 0 });
    expect(avisos.avisos().map((a) => [a.texto, a.enlace])).toEqual([['«Montar el vídeo» ha terminado.', '/videos/3']]);
  });

  it('avisa cuando Claude termina, con enlace a su vídeo, y enseña lo que hace en vivo', async () => {
    FuenteFalsa.ultima.emitir({ tipo: 'claude', conversacion: 2, evento: 'entrada',
                                entrada: { t: 'herramienta', resumen: 'Busca en la web' } });
    expect(actividad.claudeTrabajando()[0].accion).toBe('Busca en la web');
    FuenteFalsa.ultima.emitir({ tipo: 'claude', conversacion: 2, evento: 'estado', estado: 'libre', video_id: 5 });
    http.expectOne('/api/actividad/claude').flush([
      { conversacion: 2, video_id: 5, titulo: 'Los gatos', estado: 'libre', desde: '2026-10-06T10:01:00', accion: null }]);
    await esperar();
    expect(avisos.avisos().map((a) => a.texto)).toEqual(['Claude ha terminado en «Los gatos».']);
    expect(actividad.enMarcha()).toBe(1);
  });
});
