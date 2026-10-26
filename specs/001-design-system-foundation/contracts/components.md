# Contrato: componentes (`@ytcreator/ui`)

API pública del primer conjunto (FR-007). Todos los componentes:

- reenvían `ref` y aceptan `className` (solo para colocarlos dentro de un layout, nunca para cambiar su aspecto);
- aceptan los atributos nativos del elemento base;
- no llevan textos de contenido incrustados: los textos internos salen de `UiStrings` y los de contenido llegan por
  *props*.

Los tipos exactos se fijan al implementar. Lo que este contrato fija son los nombres, las variantes y las
garantías.

## Acciones

| Componente | Props clave | Garantías |
|---|---|---|
| `Button` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'` (por defecto `secondary`), `size: 'sm' \| 'md' \| 'lg'`, `loading?`, `iconStart?`, `iconEnd?`, `disabled?` | Con `loading`: `aria-busy`, spinner y texto visible conservado (el ancho no salta) y no responde a clics. Deshabilitado con `disabled` nativo, salvo en `loading`, que usa `aria-disabled` para no perder el foco |
| `IconButton` | `label: string` (**obligatoria**), `icon`, `variant`, `size` | El nombre accesible sale de `label`; el tooltip muestra el mismo texto. Zona táctil de al menos 24 px (44 px con puntero grueso) |

## Formularios

Todos aceptan `label` (obligatoria), `description?`, `error?`, `required?` y `optional?`. La etiqueta, la ayuda y el
error se asocian con `useId` mediante `aria-describedby`. El error añade `aria-invalid`, icono y texto (FR-010).

| Componente | Base | Extra |
|---|---|---|
| `TextField` | `<input>` | `type` (text, email, url, search, number, password), `iconStart?` |
| `TextArea` | `<textarea>` | `rows`, `autoResize?` (con `field-sizing: content` cuando esté soportado) |
| `Select` | `<select>` | `options: { value; label; disabled? }[]` o `children` |
| `Switch` | `<input type="checkbox" role="switch">` | `checked`, `onCheckedChange` |
| `Checkbox` | `<input type="checkbox">` | `indeterminate?` |
| `RadioGroup` | `<fieldset>` + `<input type="radio">` | `appearance: 'list' \| 'cards'`; las tarjetas admiten `title`, `description` e `icon` (las usa la página de muestra) |

## Contenedores

| Componente | Props clave | Garantías |
|---|---|---|
| `Card` | `as?`, `interactive?` | Superficie sólida. Nunca cristal |
| `GlassPanel` | `as?`, `elevation?: 2 \| 3` | Usa los tokens de cristal y cae a sólido (FR-015). La documentación prohíbe usarlo en lectura larga (FR-013) |
| `Dialog` | `open`, `onOpenChange`, `title` (obligatorio), `description?`, `footer?`, `size?: 'sm' \| 'md'` | `<dialog>` modal con cristal. Escape y el botón de cerrar lo cierran, el foco vuelve al disparador y no se escapa del diálogo (escenario 2.3) |
| `Tabs` | `items: { id; label; content }[]`, `value?`, `onValueChange?` | Radix Tabs: flechas, Inicio y Fin |
| `Disclosure` | `summary: ReactNode`, `defaultOpen?`, `open?`, `onOpenChange?` | `<details>`. Cerrado, su contenido no recibe foco. «Modo experto» es un uso de este componente, no un componente aparte |

## Comunicación

| Componente | Props clave | Garantías |
|---|---|---|
| `ToastProvider` + `useToast()` | `toast({ title, description?, tone?: 'neutral' \| 'success' \| 'warning' \| 'danger', action?: { label; onClick } })` | Radix Toast arriba (ver research R15), 3 visibles como mucho. Con `action` no se cierra solo. Siempre lleva botón de cerrar |
| `Badge` | `tone`, `children` | Una línea. Si el texto es largo se recorta con elipsis y el texto completo va en `title` y en el nombre accesible |
| `Tooltip` | `content: string`, `children` (disparador enfocable) | Aparece con el ratón encima y con el foco; en táctil, con un toque. Nunca lleva información esencial |
| `EmptyState` | `icon?`, `title`, `description`, `action?` | Una sola acción principal |
| `ErrorMessage` | `title` (qué ha pasado), `description` (qué se puede hacer), `action: { label; onClick }` | `role="alert"` si aparece después de una acción del usuario. Lenguaje llano (escenario 2.6) |

## Progreso

| Componente | Props clave | Garantías |
|---|---|---|
| `Stepper` | `steps: { id; label }[]`, `current: number` | `<ol>` con `aria-current="step"`. Los pasos hechos llevan check y el texto oculto «completado»; los pendientes, «pendiente». No depende solo del color (escenario 2.4) |
| `ProgressBar` | `value?: number` (0–100; sin valor = indeterminada), `label` | `role="progressbar"` con `aria-valuenow`. El ancho va por la custom property `--progress` |
| `Spinner` | `label?`, `size` | Con `label`: `role="status"`. Sin él: decorativo. Con movimiento reducido pasa a pulso de opacidad |
| `Skeleton` | `shape: 'text' \| 'rect' \| 'circle'`, `lines?` | `aria-hidden`. El contenedor pone `aria-busy` |
| `AiWorking` | `label: string` (p. ej. «Escribiendo tu guion…»), `progress?: number`, `variant?: 'inline' \| 'panel'` | La firma de la IA: aurora con el degradado `gradient-ai` y el texto visible dentro de `role="status"` (FR-011). Con movimiento reducido, degradado estático (escenario 3.2) |

## Marca e iconos

| Export | Garantías |
|---|---|
| `Icon` | Envuelve un icono de Lucide. `aria-hidden` salvo que se pase `label`. Tamaño por token |
| `Logo` | Pinta `brand/logo.svg` (provisional). Se cambia sustituyendo el fichero (FR-023) |

## Textos

```ts
<UiStringsProvider strings={Partial<UiStrings>}>…</UiStringsProvider>
function useUiStrings(): UiStrings
function format(template: string, values: Record<string, string | number>): string
```
