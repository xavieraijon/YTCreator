import { Component, computed, input } from '@angular/core';

import { VideoResumen } from '../core/modelos';

/** Etiqueta con el estado de un vídeo (el real: si algo ya hecho ha cambiado, lo dice): publicado, archivado o la fase. */
@Component({
  selector: 'app-estado-video',
  template: `<span class="etiqueta" [class]="clase()">{{ texto() }}</span>`,
})
export class EstadoVideo {
  readonly video = input.required<VideoResumen>();

  protected readonly texto = computed(() => {
    const v = this.video();
    const e = v.estado_real;
    if (e?.publicado) return 'Publicado';
    if (v.fase === 'cerrado') return 'Cerrado';
    if (e?.avisos.length && !v.aparcado) return `Por poner al día · ${e.vista_nombre ?? ''}`;
    if (e?.listo_para_subir) return 'Listo para subir';
    const fase = v.fase ? (e?.vista_nombre ?? v.fase_nombre ?? '') : 'Sin estado';
    return v.aparcado ? `Archivado (${fase})` : fase;
  });

  protected readonly clase = computed(() => {
    const v = this.video();
    if (v.fase === 'cerrado' || v.estado_real?.publicado || v.estado_real?.listo_para_subir) return 'etiqueta etiqueta--ok';
    if (v.aparcado || !v.fase) return 'etiqueta';
    return 'etiqueta etiqueta--aviso';
  });
}
