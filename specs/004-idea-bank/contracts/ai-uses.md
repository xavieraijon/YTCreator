# Contrato: usos de IA del banco de ideas

**Feature**: `004-idea-bank` | Decisiones en [research.md](../research.md) R6, R7 y R9

Hay tres usos nuevos en `AI_USES`. Cada uno tiene su prompt versionado, que vale para cualquier modelo, en
`packages/knowledge/prompts/<uso>/v1.md`, con su suma en `lock.json`. Su salida se valida con Zod en
`packages/core/src/ideas/outputs.ts`, y tiene un perfil por proveedor en `registry.ts`, como los usos de la 003. Los
tres incluyen `writing/human.md`.

## Reglas comunes

- El `input` es JSON con los datos de la llamada; el prompt es fijo (`AiRequest.input` de la 003).
- **Reintento reservado:** una salida que no valida se repite una vez, y el presupuesto cuenta dos llamadas (entrada
  152 de la 003).
- **Cifras:** la IA no da cifras de mercado. `claims.ts` de la 003 se aplica solo a `hook` y a `why` (`CLAIM_FIELDS` en `ai-run.ts`): un título o una búsqueda pueden nombrar una cifra como tema, como «llegar a 1.000 suscriptores». Si quita algo, la
  respuesta lleva `claimsTrimmed: true` y la pantalla lo dice.
- **Pilar:** `pillar` tiene que coincidir, sin distinguir mayúsculas, con uno de los pilares del perfil que se envía.
  Si no coincide, la salida no valida.
- **Búsquedas:** `query`, `broadQuery` y `queryEn` son textos de búsqueda, no frases: de 1 a 120 caracteres, sin
  comillas ni operadores (`-palabra`, `+palabra`, `OR`, `|`, `campo:valor`). `queryEn` es la misma búsqueda que `query`, en inglés.

## `ideas`

- **Entrada:**
  - `profile`: `{niche, promise, pillars, audience, format, rhythm}`, del perfil actual;
  - `avoid`: `{title, query}[]`, hasta 200 (R9);
  - `instructions`: puede ser nulo;
  - `count`: 8.
- **Salida:** `{ideas: IdeaDraft[]}`, de 6 a 10. Cada `IdeaDraft` es `{title, hook, pillar, format, query, broadQuery,
  queryEn}`.
- **Formato:** respeta el del perfil. Si el canal es solo de Shorts, todas son `short`; si mezcla, hay de las dos.
- **Tope de salida:** 3.000 tokens. **Tiempo:** 90 s.

## `otro_enfoque`

- **Entrada:**
  - `idea`: `{title, hook, pillar, format, query}`;
  - `measure`: `{verdict, similarTitles: string[] (≤ 12)}`;
  - `profile`.
- **Salida:** `{angles: (IdeaDraft & {why})[]}`, de 2 a 3. `why` es una opinión, de 1 a 300 caracteres, y no puede
  decir que la variante «tiene hueco».
- **Tope:** 1.500 tokens. **Tiempo:** 60 s.

## `busquedas_idea`

- **Entrada:** `{idea: {title, hook, pillar, format}, profile: {niche, pillars}}`.
- **Salida:** `{query, broadQuery, queryEn}`.
- **Tope:** 300 tokens. **Tiempo:** 30 s.

## Proveedor falso

`fakeAi: 'ok'` devuelve salidas fijas y válidas para los tres usos, con pilares tomados del perfil de prueba. Hay
escenarios para probar los fallos y las salidas raras:

- `ideas_repetidas`: dos candidatas repiten ideas del banco (R9);
- `pilar_invalido`: la primera salida no valida y la segunda sí;
- `cifra_inventada` (el de la 003): la IA mete cifras que se tienen que quitar;
- y los fallos tipados de la 002 (`sin_sesion`, `cupo_agotado`, `tiempo_agotado`, `contenido_filtrado`,
  `no_disponible`).
