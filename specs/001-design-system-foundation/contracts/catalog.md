# Contrato: catálogo y página de muestra (`apps/catalog`)

## Rutas

| Ruta | Contenido |
|---|---|
| `#/` | Portada: qué es el design system, cómo usar cada nivel de token (US5, escenario 2) y la regla de la mesura del cristal |
| `#/fundamentos/<categoría>` | `color`, `tipografia`, `espaciado`, `radios`, `elevacion`, `cristal`, `bordes`, `capas`, `movimiento`, `puntos-de-ruptura`, `iconos` |
| `#/componentes/<id>` | Ficha generada desde el `ComponentDoc` |
| `#/muestra` | Página de muestra «Elige el enfoque de tu vídeo» (US4, FR-020) |

El selector de tema está siempre visible en la cabecera.

## Ficha de fundamento de color

Cada semántico aparece con:

- su nombre;
- su descripción;
- una muestra a la vez en tema claro y en oscuro: se pintan los dos lados forzando `color-scheme` en cada uno;
- el primitivo del que deriva;
- la tabla de `ContrastPair` con los ratios y si cumple (escenario 1.4).

## `ComponentDoc`

```ts
interface ComponentDoc {
  id: string
  name: string
  summary: string
  group: 'actions' | 'forms' | 'containers' | 'communication' | 'progress'
  variants: { title: string; render: () => ReactNode }[]
  states: { state: string; render: () => ReactNode }[]
  dos: { text: string; render?: () => ReactNode }[]
  donts: { text: string; render?: () => ReactNode }[]
  a11y: string[]
  tokens: string[]
}
```

- Los estados «encima», «foco» y «pulsado» se muestran **forzados** con el atributo `data-force-state`. Para ello,
  los selectores de estado de cada componente lo incluyen, p. ej. `:is(:hover, [data-force-state='hover'])`. Ninguna
  pantalla real debe usar ese atributo.
- Cada sección marca su raíz con `data-testid="doc-<id>"` para los e2e.

## Página de muestra (FR-020)

Composición fija, con datos simulados:

1. `Stepper` (paso 3 de 5).
2. Titular, frase de «por qué importa» (principio I) y `RadioGroup appearance="cards"` con 3 enfoques.
3. `TextField` «¿A quién va dirigido?».
4. `Disclosure` «Modo experto» con un `Select` y un `Switch`.
5. Acción principal «Generar propuesta»:
   - en móvil, fija abajo;
   - al pulsarla, pasa a `AiWorking` en un `GlassPanel` durante unos 3 s (con un temporizador simulado);
   - después aparece el resultado en una `Card` sólida y un `toast` de éxito.
6. Botón flotante del asistente (`IconButton` con cristal), abajo a la derecha.

La página no hace ninguna llamada de red. Los textos viven en `apps/catalog/src/strings/sample.es.ts` y pasan el
test de glosario.
