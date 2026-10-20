import { Component, ViewEncapsulation, computed, input } from '@angular/core';
import { marked } from 'marked';

/**
 * Muestra un texto Markdown del kit (Angular sanea el HTML resultante).
 * Estilos SIN encapsular (pero acotados a `app-markdown`): el HTML entra por innerHTML y no lleva los atributos del
 * encapsulado, así que con el encapsulado por defecto estas reglas no se aplicaban (código, tablas, títulos).
 * Quien lo use puede cambiar el ancho con `--markdown-ancho` (sin ::ng-deep).
 */
@Component({
  selector: 'app-markdown',
  template: `<div class="markdown" [innerHTML]="html()"></div>`,
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-markdown .markdown {
      line-height: 1.55;
      max-width: var(--markdown-ancho, 60rem);
      overflow-wrap: anywhere;
    }
    app-markdown .markdown > :first-child {
      margin-top: 0;
    }
    app-markdown .markdown > :last-child {
      margin-bottom: 0;
    }
    app-markdown .markdown :is(h1, h2, h3) {
      margin: 1.2em 0 0.4em;
    }
    app-markdown .markdown table {
      border-collapse: collapse;
    }
    app-markdown .markdown :is(th, td) {
      border: 1px solid var(--ay-borde);
      padding: 0.3rem 0.5rem;
    }
    app-markdown .markdown code {
      font-family: var(--ay-mono);
      font-size: 0.9em;
      background: var(--ay-superficie-3);
      padding: 0 0.25rem;
      border-radius: 4px;
    }
  `,
})
export class Markdown {
  readonly texto = input.required<string>();
  protected readonly html = computed(() => marked.parse(this.texto(), { async: false }));
}
