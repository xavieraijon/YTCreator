# Quickstart: comprobar el banco de ideas

Todo se hace con la IA y YouTube falsos y la carpeta `.dev-home`. Nunca se tocan `~/YTCreator`, `~/ytc-prueba` ni el
puerto 4310.

## Requisitos

- Node 24 (`fnm exec --using=24 --`) y las dependencias instaladas (`pnpm install`).
- Un canal con el perfil aprobado: el e2e lo prepara con el recorrido de la 003. A mano, recorre «Crear mi canal» con
  `YTCREATOR_FAKE_AI=ok` y `YTCREATOR_FAKE_YOUTUBE=1`.

## 1. Controles

```bash
fnm exec --using=24 -- pnpm lint
fnm exec --using=24 -- pnpm typecheck
fnm exec --using=24 -- pnpm test
fnm exec --using=24 -- pnpm test:e2e
```

Lo esperado es que todo termine con código 0. Los e2e del banco recorren este quickstart (los tres primeros, con axe en claro y oscuro):
`ideas.spec.ts` (US1), `ideas-measure.spec.ts` (US2 y US3), `ideas-queue.spec.ts` (US4) e `ideas-quickstart.spec.ts`
(lo que no recorren los otros: la tanda con repetidas, la medida sin lector y el filtro por semáforo).

## 2. Llenar el banco (US1)

1. En la pantalla del canal, pulsa «Ir al banco de ideas».
2. Pulsa «Proponer ideas de vídeo». El botón enseña el coste, o «Incluido en tu suscripción».
3. Debe salir una tanda de 8 ideas, cada una con título, gancho, pilar y formato.
4. Quédate con 2 y descarta el resto: en el banco quedan 2.
5. En «Escribir una idea mía», escribe un título y elige «Short»: queda marcada como «Tuya».
6. Pide otra tanda con el escenario `ideas_repetidas`. Debe salir «La IA repitió 2 ideas que ya tenías; las hemos
   quitado.»

## 3. Medir (US2)

El YouTube falso tiene preparadas búsquedas para cada semáforo. Escribe ideas propias con estas búsquedas en «Modo
experto» (las dos en castellano hacen falta: sin el tema general la idea no se mide, decisión 37) y pulsa «¿Tiene
hueco?» en cada una. Como tema general (`broadQuery`) usa `pan con publico`, salvo en la fría:

| Búsqueda (`query`) | Tema general (`broadQuery`) | Resultado |
|---|---|---|
| `pan idea hueco` | `pan con publico` | verde, «Hay hueco» |
| `pan idea competida` | `pan con publico` | ámbar, «Competido» |
| `pan idea quemada` | `pan con publico` | rojo, «Quemado», con «ahora mismo lo está contando mucha gente» |
| `pan idea fria` | `pan casero` | gris, «Frío» (decisión 29) |
| `pan idea bloqueado` | `pan con publico` | «Sin medir», con el fallo y «¿Tiene hueco?» para medirla otra vez |
| `pan sin lector` | `pan con publico` | «Sin medir», con «Ir a Ajustes» y «¿Tiene hueco?» (entrada 153 de la 003) |
| `pan idea oportunidad` (con `queryEn` `bread opportunity`) | `pan con publico` | verde con el aviso de oportunidad y los vídeos en inglés |

En cada medida deben verse la frase, «Ver los vídeos parecidos», la fecha, la fuente y el sello «un supuesto nuestro».
Antes de «Medir todas» se ve cuántas ideas se medirán (y, con la Data API, las unidades). Si cierras la pestaña a media
«Medir todas» y vuelves, el progreso sigue. Una idea sin búsquedas ofrece «¿Tiene hueco?», que abre «Preparar la medida
· {coste}», y «Medir con el título», sin IA.

## 4. Otro enfoque (US3)

En la idea quemada, pulsa «Buscar otro enfoque». Deben salir 3 variantes con su motivo. Quédate una: entra «sin medir»,
como «Otro enfoque de …».

## 5. Ordenar y elegir (US4)

1. Con el teclado, mueve una idea dos puestos con «Subir»: el foco se queda en el botón y se anuncia la posición.
2. Filtra por «Hay hueco».
3. Elige dos ideas para guion: salen en «Próximos vídeos» en ese orden.
4. Archiva una y recupérala desde «Archivadas».
5. Recarga la página: todo sigue igual.
6. Descarga el banco como documento y como datos, y abre los dos ficheros.
