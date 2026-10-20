import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventosService } from './eventos.service';
import { Tarea } from './modelos';
import { TareasService, porcentajeTarea } from './tareas.service';

/** EventSource falso: la prueba decide cuándo se abre la conexión y qué mensajes llegan. */
class FuenteFalsa {
  static ultima: FuenteFalsa;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() {
    FuenteFalsa.ultima = this;
  }
  close(): void {}
  abrir(): void {
    this.onopen?.();
  }
  cortar(): void {
    this.onerror?.();
  }
  emitir(datos: object): void {
    this.onmessage?.({ data: JSON.stringify(datos) });
  }
}

const tarea = (id: number, estado: Tarea['estado']): Tarea =>
  ({ id, herramienta: 'montar', titulo: 'Montar', canal: 'c', video_id: 1, argumentos: {}, pesada: true, estado,
     codigo: null, progreso: null, creada: '', empezada: null, terminada: null }) as Tarea;

describe('TareasService y la conexión SSE', () => {
  let http: HttpTestingController;
  let tareas: TareasService;
  let eventos: EventosService;

  beforeEach(() => {
    vi.stubGlobal('EventSource', FuenteFalsa);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    tareas = TestBed.inject(TareasService);
    eventos = TestBed.inject(EventosService);
    http.expectOne('/api/herramientas').flush([]);
    http.expectOne((r) => r.url === '/api/tareas').flush([tarea(7, 'en_curso')]);
  });

  async function esperar(): Promise<void> {
    await new Promise((r) => setTimeout(r));
  }

  it('el progreso que llega por SSE actualiza la tarea y guarda sus líneas', async () => {
    await esperar();
    FuenteFalsa.ultima.abrir();
    FuenteFalsa.ultima.emitir({ tipo: 'tarea', id: 7, estado: 'en_curso', lineas: ['imagen 01-1: generada'],
                                progreso: { hecho: 1, total: 4 } });
    expect(tareas.tareas()[0].progreso?.hecho).toBe(1);
    expect(tareas.lineas()[7]).toEqual(['imagen 01-1: generada']);
    http.verify();
  });

  it('la primera conexión no relee nada; al reconectar tras un corte, sí (lo que terminó entretanto)', async () => {
    await esperar();
    const version = eventos.version();
    FuenteFalsa.ultima.abrir();
    http.expectNone((r) => r.url === '/api/tareas');
    expect(eventos.version()).toBe(version);

    FuenteFalsa.ultima.cortar();
    expect(eventos.conectado()).toBe(false);
    FuenteFalsa.ultima.abrir();
    expect(eventos.version()).toBe(version + 1);
    http.expectOne((r) => r.url === '/api/tareas').flush([tarea(7, 'hecha')]);
    await esperar();
    expect(tareas.activas()).toEqual([]);
  });
});

describe('porcentajeTarea', () => {
  it('prefiere los pasos de la herramienta; si no, las imágenes; sin cifra, null; nunca más de 100', () => {
    expect(porcentajeTarea(tarea(1, 'en_curso'))).toBeNull();
    expect(porcentajeTarea({ ...tarea(1, 'en_curso'), progreso: { paso: 3, pasos: 4, hecho: 1, total: 10 } })).toBe(75);
    expect(porcentajeTarea({ ...tarea(1, 'en_curso'), progreso: { hecho: 1, total: 3 } })).toBe(33);
    expect(porcentajeTarea({ ...tarea(1, 'en_curso'), progreso: { hecho: 9, total: 3 } })).toBe(100);
  });
});
