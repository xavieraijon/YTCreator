import { Injectable, signal } from '@angular/core';

import { GuiaManual } from '../core/modelos';

const CLAVE = 'canalyt.prompts.instruccion';

/** Si los prompts finales se copian con la instrucción de estilo delante (para pegarlos en Gemini con la
 *  imagen de referencia adjunta). Se recuerda en este navegador; por defecto, sí. */
@Injectable({ providedIn: 'root' })
export class PreferenciasPrompts {
  readonly conInstruccion = signal(leer());

  cambiar(valor: boolean): void {
    this.conInstruccion.set(valor);
    try {
      localStorage.setItem(CLAVE, valor ? 'si' : 'no');
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }

  /** El prompt final listo para pegar: con la instrucción delante si toca y el vídeo tiene referencia. */
  preparar(prompt: string, guia: GuiaManual | undefined): string {
    return this.conInstruccion() && guia?.instruccion ? guia.instruccion + prompt : prompt;
  }

  /** Líneas para la cabecera de un lote: qué adjuntar y en qué formato. */
  cabecera(guia: GuiaManual | undefined): string[] {
    if (!guia) return [];
    const lineas = [`Formato: ${guia.aspecto}.`];
    if (guia.referencias.length) {
      const refs = guia.referencias.map((r) => r.nombre).join(', ');
      lineas.unshift(`En cada petición, adjunta PRIMERO la imagen de referencia de estilo: ${refs}.`);
      if (this.conInstruccion() && guia.instruccion)
        lineas.push('Cada prompt ya lleva delante la instrucción de estilo (se refiere a esa primera imagen adjunta).');
    }
    lineas.push('Una imagen por petición: pega cada prompt por separado.');
    lineas.push('Guarda cada imagen como img/EE-N.png y avisa a Claude para conectarla al guion.');
    return lineas;
  }
}

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== 'no';
  } catch {
    return true;
  }
}
