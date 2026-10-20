import { formatNumber, registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { describe, expect, it } from 'vitest';

import { euros, miles } from './formato';

describe('formato de cifras', () => {
  it('agrupa también los números de 4 cifras, como el backend («1.030 créditos»)', () => {
    expect((1725).toLocaleString('es')).toBe('1725'); // el motivo de este archivo
    expect(miles(1725)).toBe('1.725');
    expect(miles(3_300_000)).toBe('3.300.000');
    expect(miles(999)).toBe('999');
    expect(miles(10.25, 1)).toBe('10,3');
  });

  it('coincide con el pipe number de Angular (las plantillas usan los dos)', () => {
    registerLocaleData(localeEs);
    expect(formatNumber(1725, 'es')).toBe(miles(1725));
  });

  it('euros', () => {
    expect(euros(0.004)).toBe('menos de 1 céntimo');
    expect(euros(0.456)).toBe('≈ 0,46 €');
    expect(euros(1250)).toBe('≈ 1.250,00 €');
  });
});
