/** Una imagen de un lote de prompts para copiar. */
export interface ItemLote {
  ident: string;
  motor: 'klein' | 'ai33';
  texto: string;
}

export interface GrupoLote {
  escena: number;
  titulo: string | null;
  items: ItemLote[];
}

/**
 * El lote como texto para pegar o guardar: un encabezado por escena y, en cada imagen, su id (el nombre de
 * archivo que espera montar.py: img/EE-N.png) y el prompt.
 */
export function textoLote(titulo: string, grupos: GrupoLote[], cabecera: string[] = []): string {
  const conTexto = grupos.map((g) => ({ ...g, items: g.items.filter((i) => i.texto) })).filter((g) => g.items.length);
  const total = conTexto.reduce((s, g) => s + g.items.length, 0);
  const partes = [`# ${titulo} · ${total} ${total === 1 ? 'imagen' : 'imágenes'}`];
  if (cabecera.length) partes.push(cabecera.map((l) => `- ${l}`).join('\n'));
  for (const g of conTexto) {
    partes.push(`## Escena ${g.escena}${g.titulo ? ' · ' + g.titulo : ''}`);
    for (const i of g.items) partes.push(`### ${i.ident} (img/${i.ident}.png${i.motor === 'ai33' ? ', ai33' : ''})\n${i.texto}`);
  }
  return partes.join('\n\n');
}
