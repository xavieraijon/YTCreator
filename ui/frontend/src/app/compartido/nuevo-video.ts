import { HttpClient } from '@angular/common/http';
import { Component, Injectable, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { Router } from '@angular/router';

import { firstValueFrom } from 'rxjs';

import { VideoResumen } from '../core/modelos';
import { mensajeError } from '../core/errores';

interface DatosDialogo {
  slug: string;
  nombre: string;
  largos: VideoResumen[];
}

const DURACIONES = [10, 12, 14];

/** Formulario de «Nuevo vídeo / Short»: crea la carpeta con su estado.json y abre el vídeo con Claude arrancando. */
@Component({
  selector: 'app-dialogo-nuevo-video',
  imports: [MatDialogModule, MatButton, MatButtonToggle, MatButtonToggleGroup, MatFormField, MatHint, MatIcon, MatInput,
    MatLabel, MatOption, MatSelect],
  template: `
    <h2 mat-dialog-title>Nuevo en «{{ d.nombre }}»</h2>
    <mat-dialog-content>
      <mat-button-toggle-group [value]="tipo()" (change)="tipo.set($event.value)" aria-label="Vídeo largo o Short">
        <mat-button-toggle value="largo"><mat-icon>movie</mat-icon>Vídeo largo</mat-button-toggle>
        <mat-button-toggle value="short"><mat-icon>smartphone</mat-icon>Short</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline">
        <mat-label>Tema o idea</mat-label>
        <input matInput [value]="tema()" (input)="tema.set($any($event.target).value)" maxlength="150"
               placeholder="p. ej. ¿Cuánto tarda la luz en cruzar la Vía Láctea?" />
        <mat-hint>Aunque sea provisional: Claude mide si el tema está muy contado en YouTube y te propone enfoques.</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Vídeo de referencia (opcional)</mat-label>
        <input matInput type="url" [value]="referencia()" (input)="referencia.set($any($event.target).value)"
               placeholder="https://www.youtube.com/watch?v=…" />
        <mat-hint>Se analiza su estructura, nunca su texto.</mat-hint>
      </mat-form-field>

      @if (tipo() === 'largo') {
        <mat-form-field appearance="outline">
          <mat-label>Duración</mat-label>
          <mat-select [value]="duracion()" (selectionChange)="duracion.set($event.value)">
            <mat-option [value]="0">Que lo decida Claude conmigo</mat-option>
            @for (m of duraciones; track m) {
              <mat-option [value]="m">{{ m }} min</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <mat-form-field appearance="outline">
          <mat-label>Vídeo largo al que apoya</mat-label>
          <mat-select [value]="apoya()" (selectionChange)="apoya.set($event.value)">
            <mat-option [value]="''">Ninguno todavía (Claude te avisará)</mat-option>
            @for (v of d.largos; track v.id) {
              <mat-option [value]="v.carpeta">{{ v.titulo || v.carpeta }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      @if (error()) {
        <p class="error"><mat-icon>warning</mat-icon>{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="tema().trim().length < 3 || creando()" (click)="crear()">
        <mat-icon>{{ creando() ? 'sync' : 'add' }}</mat-icon>{{ creando() ? 'Creando…' : 'Crear y empezar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: min(34rem, 80vw);
      padding-top: 0.5rem;
    }
    mat-button-toggle-group {
      align-self: flex-start;
      margin-bottom: 0.75rem;
    }
    .error {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--mat-sys-error);
    }
  `,
})
export class DialogoNuevoVideo {
  protected readonly d = inject<DatosDialogo>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DialogoNuevoVideo>>(MatDialogRef);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly duraciones = DURACIONES;
  protected readonly tipo = signal<'largo' | 'short'>('largo');
  protected readonly tema = signal('');
  protected readonly referencia = signal('');
  protected readonly duracion = signal(0);
  protected readonly apoya = signal('');
  protected readonly creando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async crear(): Promise<void> {
    this.creando.set(true);
    this.error.set(null);
    try {
      const largo = this.tipo() === 'largo';
      const r = await firstValueFrom(this.http.post<{ id: number }>(`/api/canales/${this.d.slug}/videos`, {
        tipo: this.tipo(),
        tema: this.tema().trim(),
        referencia: this.referencia().trim() || null,
        duracion: largo && this.duracion() ? this.duracion() : null,
        apoya: largo ? null : this.apoya() || null,
      }));
      this.ref.close(true);
      void this.router.navigate(['/videos', r.id]);
    } catch (e) {
      this.error.set(mensajeError(e, 'No se pudo crear. Revisa los campos.'));
      this.creando.set(false);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class NuevoVideoService {
  private readonly dialogo = inject(MatDialog);
  private readonly http = inject(HttpClient);

  async abrir(slug: string, nombre: string): Promise<void> {
    const videos = await firstValueFrom(this.http.get<VideoResumen[]>('/api/videos', { params: { canal: slug } }));
    this.dialogo.open(DialogoNuevoVideo, {
      data: { slug, nombre, largos: videos.filter((v) => v.tipo === 'largo') } satisfies DatosDialogo,
      autoFocus: 'input',
    });
  }
}
