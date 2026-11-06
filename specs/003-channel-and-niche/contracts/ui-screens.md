# Contrato: pantallas

**Feature**: `003-channel-and-niche` | Decisiones en [research.md](../research.md) R14, R16

Pantallas nuevas en `apps/web/src/screens/channel/`, con los componentes de `packages/ui` y los textos en `strings/`.

## Reglas generales (principio I)

- Una acción principal por pantalla (botón primario); el resto son secundarias o enlaces.
- Cada paso explica en una o dos frases por qué importa, antes de pedir nada.
- Sin jerga: «nicho» se explica la primera vez; nada de «RPM», «CTR» o «handle» sin traducir («la @ de tu canal»).
- Todo dato de YouTube va con `DataSource` («Dato de YouTube · 31 oct 2026»); toda opinión con «Opinión de la IA».
  Nunca se mezclan en la misma frase.
- Toda propuesta de la IA tiene «Aprobar», «Editar» y «Proponer otra» (con un campo opcional «¿Qué cambiarías?»).
  Con algo escrito en «¿Qué cambiarías?», «Aprobar» se apaga y un texto dice que se usa con «Proponer otra» o se borra;
  el campo se vacía con cada propuesta nueva (decisión 140).
- Tras elegir una opción (nicho, idea o nombre), el botón para seguir va dentro de su tarjeta, no al final (decisión
  138).
- En «Editar» de «Tu canal», salir con cambios sin guardar (dentro de la app, con la flecha atrás del navegador o
  cerrando la pestaña) pregunta antes (decisiones 138 y 146). Los otros editores (`Cambiar algo`, el enfoque, «Editar
  antes de guardar», el nicho y el nombre propios) aún no preguntan: queda para la pasada de interfaz.
- Los botones que gastan muestran el importe ([cost](./cost.md)).
- Esperas largas: progreso por elemento («Midiendo 2 de 5 nichos»), se puede salir y volver.
- Accesible: axe sin fallos, todo con teclado, semáforos con texto e icono.

## Test de glosario (FR-034)

Los textos nuevos de `apps/web/src/strings/` pasan el test de glosario que ya existe
(`apps/web/test/glossary.test.ts`, con la lista de `packages/ui/test/forbidden-terms.ts`). Esta feature amplía la
lista de términos prohibidos en la web con `RPM`, `YPP`, `CTR`, `handle` y `yt-dlp`. Se nombran así:

| Término técnico | Texto en pantalla |
|---|---|
| RPM | «lo que ganas por cada 1.000 visitas» |
| YPP | «programa de socios de YouTube» |
| handle | «la @ de tu canal» |
| yt-dlp | «el lector de YouTube» |
| Multiplicador, outlier | «veces lo normal en su canal» |
| YouTube Data API | «clave de YouTube» (en «Modo experto») |
| URL | «enlace» |
| JSON / Markdown | «Descargar como documento» (`.md`) y «Descargar como datos» (`.json`). El formato solo se ve en la extensión del fichero |

«Nicho» sí se puede usar, pero la primera pantalla que lo muestra lo explica en una frase. Esto lo comprueba una prueba
de la pantalla Intereses, no el test de glosario. «YouTube» es una marca permitida.

## Componentes nuevos (catálogo)

| Componente | Uso |
|---|---|
| `Semaphore` | Verde, ámbar, rojo y «sin comprobar», con icono y etiqueta |
| `DataSource` | Marca de origen: dato de YouTube con fecha, conocimiento con fecha de revisión, opinión de la IA |

## Pantallas

| Pantalla | Paso | Acción principal | Notas |
|---|---|---|---|
| Inicio | — | «Crear mi canal» / «Ya tengo un canal» / «Seguir donde lo dejaste» | Sin canal: «Crear mi canal» principal y «Ya tengo un canal» secundaria, cada una con su frase, y que por ahora hay un solo canal (decisión 137); con un recorrido a medias: «Seguir donde lo dejaste»; con el canal listo: siguiente paso y recordatorio del nombre provisional |
| Intereses | `intereses` | «Seguir» | Campo libre con ejemplos |
| Preguntas | `preguntas` | «Seguir» | 0–3 preguntas; «Saltar» secundaria |
| Nichos | `nichos` | «Elegir este nicho» | Tarjeta por nicho con indicadores, veredicto y razón, y los Shorts como cifra aparte; cuántos canales ocultan la cifra o no se miraron, y si las fechas son parciales; canales de referencia con «veces lo normal en su canal»; «Escribir mi propio nicho» |
| Ritmo | `ritmo` | «Seguir» | Horas por semana, cara/voz/ninguna, región del público. Sale en los dos recorridos. Las horas son siempre las del creador (decisión 136) |
| Conceptos | `conceptos` | «Elegir esta idea» | Promesa, pilares, público, formato, ritmo, monetización en rangos con su fiabilidad, avisos; aviso si se escribieron con otras respuestas. El ritmo dice las horas que pide («Este ritmo pide unas X horas»), marcadas como estimación nuestra (decisión 142), aparte de las que tiene el creador; elegir una idea que no cabe pregunta antes («Cambiarlo antes» o «Quedarme con él igualmente») |
| Nombres | `nombres` | «Quedarme con este nombre» | Semáforo y razones por nombre; «Escribir el mío»; «Decidir más tarde» mientras no hay nombre elegido |
| Enlace | `enlace` | «Buscar mi canal» | Acepta el enlace del canal, su @, el enlace de un vídeo y los antiguos `/c/…` y `/user/…` (decisión 144); «¿Dónde veo mi @?» con los pasos en YouTube |
| Confirmar | `confirmar` | «Sí, es mi canal» | Foto, nombre, @ y suscriptores |
| Lectura | `lectura` | «Ver mi perfil actual», y después «Aprobar» | Progreso de lectura; cifras por formato, y mejores y peores vídeos según «veces lo normal en su canal»; el perfil actual propuesto, que se aprueba para seguir; con menos de 5 vídeos, ofrece el recorrido de canal nuevo |
| Posicionamiento | `posicionamiento` | «Aprobar» | Perfil actual (con vídeos citados; se puede seguir cambiando, y otro hay que aprobarlo) y propuesta de cambios; «Aprobar» es del enfoque, y si su ritmo no cabe pregunta antes |
| Perfil | `hecho` | «Descargar como documento» | Perfil vigente, versiones, restaurar, editar textos, respuestas y supuestos; «Reescribir con la IA» la promesa, los temas o el público (aprobar, editar antes de guardar o descartar); «Cambiar el nombre» en un canal nuevo, en un panel dentro de la misma pantalla con los nombres, «Escribir el mío», «Usar este nombre» y «Cancelar» (decisión 136); el aviso de ritmo se calcula con las horas de ahora; avisos al guardar, cambiar el nombre o descargar; que por ahora hay un solo canal; con datos de más de 90 días, «Volver a medir» o «Volver a leer tu canal»; siguiente paso: banco de ideas (próximamente) |
| Ajustes → YouTube | — | «Guardar» | Fuente, clave opcional (solo `hint`), cupo, actualizar el lector |
| Ajustes → Consumo | — | — | Lista de llamadas y totales |

## Estados que toda pantalla con datos cubre

| Estado | Qué se ve |
|---|---|
| Cargando | Esqueleto y texto de lo que se está haciendo |
| Sin datos (`sin_datos`) | «No hemos encontrado datos suficientes para medir este tema.» Sin cifras inventadas |
| Bloqueado / tiempo agotado | Explicación llana y «Volver a intentarlo» |
| Sin lector (`no_disponible`) | Enlace a Ajustes → YouTube |
| Fallo de IA | Mensaje de la 002 por código; `limite_de_gasto` enlaza a Ajustes → Límites |
| Datos viejos (> 90 días) | Aviso y «Volver a medir» (o «Volver a leer tu canal» en un canal que ya existía) |
