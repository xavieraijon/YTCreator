# Contrato: pantallas del guion

**Feature**: `005-script-and-outline` | Decisiones en [research.md](../research.md) R14, R15 y R19

Todo con `@ytcreator/ui`, sin componentes nuevos. Textos en `apps/web/src/strings/script.es.ts`, con el test de glosario.
El aspecto se revisa en la pasada final con el modo Design: aquí cuenta que funcione y sea accesible.

**La palabra «escaleta»**: se usa porque es el nombre del oficio, y la primera vez se explica: «La escaleta es el esquema
de tu vídeo: qué cuentas y en qué orden.»

## Entrada

- **Cola del banco** (`IdeaQueue`): la nota «El guion de la primera llegará en la próxima versión» desaparece. La primera
  idea lleva «Preparar el guion» como acción principal y las demás como secundaria. Con guion ya empezado, «Seguir con el
  guion»; aprobado, la etiqueta «Guion listo» y «Ver el guion».
- **Pantalla del canal**: enlace «Mis guiones», junto al banco.

## Lista (`/canal/guiones`)

- **Por qué importa**: «Aquí tienes los guiones de tus vídeos, en el punto en que los dejaste.»
- Una `Card` por guion: título de la idea, formato, estado, último cambio y «Abrir».
- Sin guiones ni cola: `EmptyState` que explica que primero hay que elegir una idea, con «Ir al banco de ideas».
- «Descargar todos» y «Voz del canal».

## Guion (`/canal/guiones/:id`)

`Stepper`: **Hechos → Escaleta → Guion → Revisar**. En un Short: **Hechos → Guion → Revisar**. Cada paso tiene una acción
principal, que cambia según el estado.

### Hechos

- **Por qué importa**: «Un dato falso se paga caro: la gente deja de fiarse del canal.»
- `TextField` de duración, con su valor por defecto y lo que equivale en palabras.
- `TextArea` «Tus apuntes», con aviso: «Si pides investigar, tus apuntes se usan para buscar.»
- Lista de hechos: texto, etiqueta (`Badge`), enlaces con la fecha, y si un enlace no abre o no se pudo comprobar.
- Aviso de texto: «La app comprueba que el enlace abre, no que diga lo que se afirma.» (decisión 36). Cada hecho de la
  IA, y cada veredicto y propuesta al comprobar, llevan `DataSource` «Opinión de la IA».
- Si la investigación no encuentra nada fiable, una frase lo dice y la lista se queda como estaba.
- Acciones: «Investigar el tema · {coste}», «Añadir un hecho o una fuente», «Quitar», «Cambiar».
- Sin internet en la conexión: una frase que lo explica, sin botón de investigar.
- **Principal**: «Proponer escaleta · {coste}» (largo) o «Escribir el guion · {coste}» (Short; ya escrito, «Ir al guion», decisión 28).

### Escaleta

- **Por qué importa**: «La estructura decide si la gente se queda. Cambiar el orden aquí cuesta un minuto.»
- Un bloque por `Card`: tipo, título, para qué está, pregunta, recompensa, enganche y duración, con «Subir», «Bajar»,
  «Cambiar» y «Quitar». «Añadir bloque».
- Duración total frente al objetivo. «Pedir otra escaleta», con indicaciones.
- Todo lo que propone la IA va marcado con `DataSource` «Opinión de la IA».
- **Principal**: «Aprobar la escaleta»; aprobada, «Escribir el guion · {coste}».

### Guion

- **Por qué importa**: «Esto es lo que vas a decir. Léelo en voz alta: si te trabas, cámbialo.»
- Un bloque por `Card`: texto con las marcas (`<mark>`), «qué se ve», duración, «Cambiar» y «Pedir de nuevo este bloque ·
  {coste}».
- Cada marca abre `Dialog` con «Es correcto», «Corregir», «No es un dato» y «Quitar del guion», y si se comprobó,
  veredicto, enlaces y «Usar esta redacción».
- Contador «{n} afirmaciones por comprobar» y «Comprobar con internet · {coste}».
- «Pedir otro guion · {coste}», con indicaciones.
- Guion aprobado: antes del primer cambio, «Si lo cambias, dejará de estar aprobado».
- «Voz del canal»: «tú y cercano, por defecto» y enlace para cambiarla.
- **Principal**: «Revisar el guion».

### Revisar

- **Por qué importa**: «Lo que se ve aquí se arregla gratis antes de grabar.»
- Lista de avisos: motivo y «Ir al bloque».
- **Principal**: «Aprobar el guion». Con pendientes, `Dialog`: «Quedan {n} afirmaciones sin comprobar», con «Revisarlas» y
  «Aprobar igualmente».
- Con guion, aprobado o no (US3, escenario 4): «Descargar» (`.md` y `.json`).
- Aprobado: en un vídeo largo, «Sacar un Short · {coste}».
- Con enfoques: «Pedir otros enfoques · {coste}», con indicaciones; se suman a los que había.
- Enfoques del Short: una `Card` por enfoque vigente (2 o 3 por petición) con gancho, momento del guion, y «Elegir este». Al
  elegir, se abre el guion del Short con «Escribir el guion · {coste}» como acción principal. Uno ya elegido dice «Ya has
  sacado un Short de este enfoque» con «Abrir su guion» (decisión 43). Si se quitó alguna cifra, un aviso lo dice.

### En todos los pasos

- «Historial» (`Disclosure`): versiones con fecha y origen («La IA», «Tu edición», «Bloque pedido de nuevo», «Recuperada»,
  «Comprobaciones», «Marcas revisadas», «Del vídeo largo»); al abrir una, bloques iguales, cambiados, nuevos y quitados, y
  «Volver a esta versión». En un guion aprobado, recuperar avisa antes de que dejará de estarlo.
- Avisos de la tabla de [data-model](../data-model.md), con la acción que corresponda.
- Trabajo en curso: `AiWorking`; al volver a la pantalla, sigue visible.
- Semáforo de la idea, si está quemada o competida.
- Errores con `ErrorMessage` y los textos de la 002.

## Voz del canal (`/canal/guiones/voz`)

`RadioGroup` de trato y registro, `TextArea` de muestra con su explicación, y en «Más opciones», las palabras por minuto,
marcadas como estimación.

## Accesibilidad

Todo con teclado; cada marca es un botón con nombre accesible; 375 px y zoom al 200 %; axe en claro y oscuro.
