# Contrato: pantallas del banco de ideas

**Feature**: `004-idea-bank` | Decisiones en [research.md](../research.md) R10, R13 y R14

Todo se compone con `@ytcreator/ui`, sin componentes nuevos. Los textos van en `apps/web/src/strings/ideas.es.ts` y
pasan el test de glosario de la 003, que prohíbe «RPM», «CTR», «handle», «yt-dlp», «clon» y «tema amplio». El
aspecto se revisa en la pasada final con el modo Design: aquí cuenta que funcione y sea accesible.

## Entrada

- **Pantalla del canal** (`channel/start/Start.tsx`): la frase «Lo siguiente será llenar tu banco de ideas. Llega muy
  pronto.» (`channel.es.ts`, `nextStep`) pasa a ser el botón «Ir al banco de ideas», que es la acción principal cuando
  el perfil está aprobado.
- **Ruta:** `/canal/ideas`.
- **Sin perfil aprobado:** la pantalla dice «Primero termina el perfil de tu canal: las ideas se escriben para él.» y
  lleva a él (US1 AS5).

## Banco (`/canal/ideas`)

- **Título:** «Banco de ideas».
- **Por qué importa:** «Junta aquí tus próximos vídeos. Antes de hacer uno, mira si tiene hueco: así no gastas horas
  en un tema que ya está quemado.»
- **Acción principal:** «Proponer ideas de vídeo · {coste}» con el banco vacío. Se dice «de vídeo» para no confundirla
  con «Proponer ideas» de los conceptos de canal (003). Si hay ideas sin medir, «Medir todas». Si no,
  «Proponer más ideas de vídeo».
- **Próximos vídeos** (la cola): las elegidas en su orden, cada una con «Subir», «Bajar» y «Quitar de la cola». Si la
  cola tiene ideas, una nota: «El guion de la primera llegará en la próxima versión.»
- **Filtros:** `Select` de estado, formato y semáforo, y «Quitar filtros».
- **Lista de ideas:** una `Card` por idea, con:
  - el título, el gancho, el pilar, el formato y el origen («Propuesta por la IA», «Tuya», «Otro enfoque de …»);
  - el `Semaphore` con su frase, o «Sin medir»;
  - el `DataSource` con la fuente, la fecha y el sello de supuesto;
  - las acciones «¿Tiene hueco?» o «Volver a medir», «Cambiar algo», «Elegir para guion», «Marcar como hecha»,
    «Archivar», «Subir» y «Bajar»;
  - «Ver los vídeos parecidos», plegado (`Disclosure`): título, canal, visitas y fecha de cada uno, y la oportunidad
    en inglés con sus vídeos si la hay;
  - «Buscar otro enfoque», solo con `quemado` o `competido` de la versión actual de la idea; al pulsarlo salen las
    indicaciones opcionales y «Buscar otro enfoque · {coste}» (decisión 49). Las variantes esperan dentro de la
    tarjeta, con su motivo como «Opinión de la IA» y «Proponer otras variantes», que vuelve a ese paso (decisión 48);
  - los avisos que toquen: «Medida antigua (de hace {n} días)», «Medida de una versión anterior de la idea»,
    «Propuesta con una versión anterior de tu perfil».
- **Escribir una idea:** `Disclosure` «Escribir una idea mía», con título, formato y, si se quiere, gancho y pilar. Las
  búsquedas van en «Modo experto», junto a «Preparar la medida · {coste}» al cambiar una idea guardada (decisión 42). En
  la tarjeta de una idea sin búsquedas, «¿Tiene hueco?» abre «Preparar la medida · {coste}» (decisión 41).
- **Archivadas:** `Disclosure`, con «Recuperar» en cada una.
- **Descargar:** «Descargar como documento» y «Descargar como datos».

## Tanda propuesta

- Se enseña encima de la lista, en una región con nombre «Ideas propuestas».
- Cada candidata tiene «Me la quedo» y «No me interesa». Al final, «Quedarme con todas» y «Proponer otras», con un
  campo de indicaciones.
- Mensajes que pueden salir:
  - repetidas: «La IA repitió {n} ideas que ya tenías; las hemos quitado.»;
  - cifras: el aviso `claimsTrimmed` de la 003.

## Medida en curso

- `ProgressBar` con «Midiendo {hecho} de {total} ideas» y la nota «Puedes seguir usando la app: la medida sigue
  aunque cierres esta pestaña.»
- Tras un reinicio, «La medida se cortó. Puedes seguir donde se quedó.» con «Seguir midiendo».

## Teclado y lectores de pantalla

- Cada botón de orden lleva en su nombre accesible la idea: «Subir "Cómo se hizo…"».
- Después de mover una idea, el foco se queda en el mismo botón de esa idea, y una región `aria-live` dice «Movida a
  la posición {n}».
- Los cambios de semáforo que llegan por SSE se anuncian en una región `aria-live` educada, una vez por idea.
