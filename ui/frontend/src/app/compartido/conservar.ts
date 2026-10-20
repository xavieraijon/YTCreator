import { HttpResourceRef } from '@angular/common/http';
import { Signal, linkedSignal } from '@angular/core';

/**
 * El último valor de un httpResource, que se conserva mientras se vuelve a pedir (tras un aviso de cambio).
 * Sin esto, cada recarga deja la página vacía un instante: con un lote de imágenes llegando, parpadea.
 */
export function conservar<T>(recurso: HttpResourceRef<T | undefined>): Signal<T | undefined> {
  return linkedSignal<T | undefined, T | undefined>({
    source: () => (recurso.hasValue() ? recurso.value() : undefined),
    computation: (nuevo, previo) => nuevo ?? previo?.value,
  });
}
