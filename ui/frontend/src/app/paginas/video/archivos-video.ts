import { JsonPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';

import { VideoDetalle } from '../../core/modelos';
import { VisorDocs } from './fase-tramos';

/**
 * Archivos y notas del vídeo (menú ⋮ de la pantalla del vídeo): todos sus documentos, también los que no pertenecen a
 * ningún paso, y lo que guarda estado.json (notas, lo pendiente y el resto de campos). Lo que antes estaba en «Avanzado».
 */
@Component({
  selector: 'app-archivos-video',
  imports: [MatDialogModule, MatButton, JsonPipe, VisorDocs],
  template: `
    @let v = video;
    <h2 mat-dialog-title>Archivos y notas del vídeo</h2>
    <mat-dialog-content>
      <h3>Documentos</h3>
      @if (v.documentos.length) {
        <app-visor-docs [videoId]="v.id" [docs]="v.documentos" />
      } @else {
        <p class="secundario">Este vídeo todavía no tiene documentos.</p>
      }

      <h3>Notas del vídeo</h3>
      @if (v.notas.length) {
        <ol class="notas">@for (n of v.notas; track $index) { <li>{{ n }}</li> }</ol>
      } @else {
        <p class="secundario">Sin notas en estado.json.</p>
      }

      @if (v.pendiente) {
        <h3>Pendiente</h3>
        <pre>{{ v.pendiente | json }}</pre>
      }

      <h3>Estado</h3>
      <dl class="extra">
        @for (c of extra(); track c.clave) { <div><dt>{{ c.clave }}</dt><dd>{{ c.valor }}</dd></div> }
        <div><dt>final.mp4</dt><dd>{{ v.tiene_final ? 'Montado' : 'Sin montar' }}</dd></div>
      </dl>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    h2 { font-family: var(--ay-serif); letter-spacing: -0.03em; }
    h3 { font-size: 1rem; font-weight: 650; margin: 1.25rem 0 0.5rem; }
    h3:first-child { margin-top: 0; }
    .secundario { color: var(--ay-tenue); }
    .notas { margin: 0; padding-left: 1.25rem; }
    .notas li { margin-bottom: 0.35rem; }
    pre { margin: 0; padding: 0.75rem; overflow: auto; font-family: var(--ay-mono); font-size: 0.8rem;
      background: var(--ay-superficie); border: 1px solid var(--ay-borde); border-radius: var(--ay-radio); }
    .extra { margin: 0; display: grid; gap: 0.35rem; }
    .extra div { display: grid; grid-template-columns: minmax(8rem, 12rem) 1fr; gap: 0.75rem; }
    dt { font-family: var(--ay-mono); font-size: 0.8rem; color: var(--ay-tenue); }
    dd { margin: 0; overflow-wrap: anywhere; }
  `,
})
export class ArchivosVideo {
  protected readonly video = inject<VideoDetalle>(MAT_DIALOG_DATA);

  /** Otros campos de estado.json, como texto (los objetos, en JSON compacto). */
  protected readonly extra = computed(() =>
    Object.entries(this.video.extra ?? {}).map(([clave, valor]) => ({
      clave,
      valor: typeof valor === 'string' ? valor : JSON.stringify(valor),
    })),
  );

  static abrir(dialogo: MatDialog, video: VideoDetalle) {
    return dialogo.open(ArchivosVideo, { data: video, width: '56rem', maxWidth: '94vw', maxHeight: '88vh', autoFocus: 'dialog' });
  }
}
