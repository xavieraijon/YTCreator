import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { CanalesService } from '../../core/canales.service';
import { ConfirmarService } from '../../compartido/confirmar';
import { mensajeError } from '../../core/errores';
import { conservar } from '../../compartido/conservar';
import { EventosService } from '../../core/eventos.service';
import { VideoDetalle } from '../../core/modelos';
import { ArchivosVideo } from './archivos-video';
import { FaseGuiada } from './fase-guiada';
import { PanelClaude } from './panel-claude';

@Component({
  selector: 'app-video',
  imports: [RouterLink, MatButton, MatIcon, MatIconButton, MatMenuModule, MatProgressBar, PanelClaude, FaseGuiada],
  templateUrl: './video.html',
  styleUrl: './video.scss',
  host: { '[class.con-claude]': 'claudeVisible()' },
})
export class VideoPagina {
  readonly id = input.required<string>();
  private readonly eventos = inject(EventosService);

  protected readonly video = httpResource<VideoDetalle>(() => {
    this.eventos.version();
    return `/api/videos/${this.id()}`;
  });
  /** Lo que se enseña: el último vídeo leído, también mientras se vuelve a pedir. */
  protected readonly datos = conservar(this.video);

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly confirmar = inject(ConfirmarService);
  private readonly canales = inject(CanalesService);
  private readonly dialogo = inject(MatDialog);
  protected readonly errorGestion = signal<string | null>(null);

  /** Archivar (reversible): el vídeo sigue en su sitio, pero sale de «en marcha». */
  protected async archivar(archivado: boolean): Promise<void> {
    this.errorGestion.set(null);
    try {
      await firstValueFrom(this.http.post(`/api/videos/${this.id()}/archivar`, { archivado }));
      this.eventos.refrescar();
    } catch (e) {
      this.errorGestion.set(mensajeError(e));
    }
  }

  /** A la papelera del canal: se puede restaurar desde la página del canal. */
  protected async aPapelera(): Promise<void> {
    const v = this.datos();
    if (!v) return;
    const ok = await this.confirmar.pedir({
      titulo: `Mover «${v.titulo || v.carpeta}» a la papelera`,
      mensaje: 'Desaparece de las listas, pero no se borra: puedes restaurarlo desde la página del canal, en «Papelera».',
      aceptar: 'Mover a la papelera', icono: 'delete',
    });
    if (!ok) return;
    this.errorGestion.set(null);
    try {
      await firstValueFrom(this.http.delete(`/api/videos/${this.id()}`));
      void this.router.navigate(['/canales', v.canal]);
    } catch (e) {
      this.errorGestion.set(mensajeError(e));
    }
  }

  /** Todos los documentos y las notas de estado.json (lo que antes enseñaba la vista «Avanzado»). */
  protected verArchivos(): void {
    const v = this.datos();
    if (v) ArchivosVideo.abrir(this.dialogo, v);
  }

  private readonly panelClaude = viewChild(PanelClaude);
  /** El chat está cerrado; se abre desde «Preguntar algo a Claude» o con su botón. */
  protected readonly claudeVisible = signal(false);
  protected readonly claudeTrabajando = computed(() => this.panelClaude()?.estado() === 'pensando');

  constructor() {
    // Al cambiar de vídeo, el chat se cierra.
    effect(() => {
      this.id();
      this.claudeVisible.set(false);
    });
  }

  protected alternarClaude(abierto = !this.claudeVisible()): void {
    this.claudeVisible.set(abierto);
  }

  /** El nombre del canal (hallazgo 49); si aún no ha llegado la lista, el identificador sin «_archivo/». */
  protected nombreCanal(slug: string): string {
    return this.canales.canales().find((c) => c.slug === slug)?.nombre ?? slug.replace(/^_archivo\//, '');
  }
}
