import { separarOpciones } from './opciones';

describe('separarOpciones', () => {
  it('quita el bloque del texto y devuelve las opciones con la recomendada marcada', () => {
    const r = separarOpciones('¿Qué nombre te gusta?\n\n```opciones\n★ Desastres de Dinero\n- Dinero en Llamas\n\n```');
    expect(r.texto).toBe('¿Qué nombre te gusta?');
    expect(r.opciones).toEqual([
      { texto: 'Desastres de Dinero', recomendada: true },
      { texto: 'Dinero en Llamas', recomendada: false },
    ]);
  });

  it('sin bloque, el texto queda igual y no hay opciones', () => {
    expect(separarOpciones('Hola **mundo**')).toEqual({ texto: 'Hola **mundo**', opciones: [] });
  });

  it('un bloque a medio escribir no se ve en el texto', () => {
    expect(separarOpciones('Elige:\n```opciones\nUna').texto).toBe('Elige:');
  });

  it('como mucho seis opciones y se queda con el último bloque', () => {
    const lineas = Array.from({ length: 9 }, (_, i) => `O${i}`).join('\n');
    const r = separarOpciones('```opciones\nVieja\n```\nTexto\n```opciones\n' + lineas + '\n```');
    expect(r.texto).toBe('Texto');
    expect(r.opciones.map((o) => o.texto)).toEqual(['O0', 'O1', 'O2', 'O3', 'O4', 'O5']);
  });
});
