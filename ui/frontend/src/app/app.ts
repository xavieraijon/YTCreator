import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import { BarraCuotas } from './compartido/barra-cuotas';
import { PanelTareas } from './compartido/panel-tareas';
import { Avisos } from './compartido/avisos';
import { ActividadService } from './core/actividad.service';
import { ApagadoService, Salud } from './core/apagado.service';
import { CanalesService } from './core/canales.service';
import { EventosService } from './core/eventos.service';
import { urlMedio } from './core/medios';
import { TareasService } from './core/tareas.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIcon, MatButton, MatIconButton, MatMenuModule, MatTooltip, BarraCuotas, PanelTareas, Avisos],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  /** «Saltar al contenido» (hallazgo 38): el foco va al contenido sin pasar por el menú ni la cabecera. */
  protected saltar(e: Event): void {
    e.preventDefault();
    document.getElementById('contenido')?.focus();
  }

  protected readonly canales = inject(CanalesService);
  private readonly http = inject(HttpClient);
  private readonly eventos = inject(EventosService);
  protected readonly tareas = inject(TareasService);
  /** Se crea al arrancar: vigila tareas y turnos de Claude y avisa al terminar, en cualquier pantalla. */
  protected readonly actividad = inject(ActividadService);
  protected readonly apagado = inject(ApagadoService);
  /** El canal no tiene marca/avatar.png: se enseña su inicial. */
  protected readonly sinAvatar = signal(false);
  protected readonly actualizando = signal(false);
  protected readonly actualizado = signal<string | null>(null);
  /** Archivos del servidor cambiados después de arrancarlo (entonces hay que reiniciarlo). */
  protected readonly reiniciar = signal<string[]>([]);

  protected readonly menu = [
    { ruta: '/', icono: 'home', texto: 'Inicio', exacta: true },
    { ruta: '/asistente', icono: 'auto_awesome', texto: 'Asistente', exacta: false },
    { ruta: '/canales', icono: 'video_library', texto: 'Canales', exacta: false },
    { ruta: '/ajustes', icono: 'settings', texto: 'Ajustes', exacta: false },
  ];

  protected avatar(slug: string): string {
    return urlMedio(slug, 'marca/avatar.png', 240);
  }

  ngOnInit(): void {
    void this.canales.cargar();
    void this.comprobarServidor();
    setInterval(() => void this.comprobarServidor(), 60_000);
  }

  private async comprobarServidor(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.get<Salud>('/api/salud'));
      this.reiniciar.set(r.cambiados ?? []);
      this.apagado.salud(r);
    } catch {
      /* servidor parado: ya se nota en lo demás */
    }
  }

  protected recargar(): void {
    location.reload();
  }

  /** Reindexa todo, consulta las cuotas reales y la cola de ai33; todas las pantallas se vuelven a pedir. */
  protected async actualizar(): Promise<void> {
    this.actualizando.set(true);
    try {
      const r = await firstValueFrom(this.http.post<{ segundos: number; cuotas_error: string | null }>('/api/actualizar', {}));
      await Promise.all([this.canales.cargar(false), this.tareas.cargar()]);
      // Las cuotas ya han llegado por SSE (el backend las acaba de consultar).
      this.eventos.refrescar();
      const hora = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      this.actualizado.set(r.cuotas_error ? `Actualizado ${hora} (cuotas: error)` : `Actualizado ${hora}`);
    } catch {
      this.actualizado.set('No se pudo actualizar (¿backend parado?)');
    } finally {
      this.actualizando.set(false);
    }
  }
}
