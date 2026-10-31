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
- Los botones que gastan muestran el importe ([cost](./cost.md)).
- Esperas largas: progreso por elemento («Midiendo 2 de 5 nichos»), se puede salir y volver.
- Accesible: axe sin fallos, todo con teclado, semáforos con texto e icono.

## Componentes nuevos (catálogo)

| Componente | Uso |
|---|---|
| `Semaphore` | Verde, ámbar, rojo y «sin comprobar», con icono y etiqueta |
| `DataSource` | Marca de origen: dato de YouTube con fecha, conocimiento con fecha de revisión, opinión de la IA |

## Pantallas

| Pantalla | Paso | Acción principal | Notas |
|---|---|---|---|
| Inicio | — | «Crear mi canal» / «Ya tengo un canal» / «Seguir donde lo dejaste» | Solo una visible según el estado |
| Intereses | `intereses` | «Seguir» | Campo libre con ejemplos |
| Preguntas | `preguntas` | «Seguir» | 0–3 preguntas; «Saltar» secundaria |
| Nichos | `nichos` | «Elegir este nicho» | Tarjeta por nicho con indicadores, veredicto y razón; «Escribir mi propio nicho» |
| Ritmo | `ritmo` | «Seguir» | Horas por semana, cara/voz/ninguna, región del público |
| Conceptos | `conceptos` | «Elegir este concepto» | Promesa, pilares, público, formato, ritmo, monetización en rangos, avisos |
| Nombres | `nombres` | «Quedarme con este nombre» | Semáforo y razones por nombre; «Escribir el mío»; «Decidir más tarde» |
| Enlace | `enlace` | «Buscar mi canal» | Acepta URL, @ o enlace de un vídeo |
| Confirmar | `confirmar` | «Sí, es mi canal» | Foto, nombre, @ y suscriptores |
| Lectura | `lectura` | «Ver mi perfil actual» | Progreso de lectura; con menos de 5 vídeos, ofrece el recorrido de canal nuevo |
| Posicionamiento | `posicionamiento` | «Aprobar» | Perfil actual (con vídeos citados) y propuesta de cambios |
| Perfil | `hecho` | «Exportar» | Perfil vigente, versiones, restaurar, editar; siguiente paso: banco de ideas (próximamente) |
| Ajustes → YouTube | — | «Guardar» | Fuente, clave opcional (solo `hint`), cupo, actualizar el lector |
| Ajustes → Consumo | — | — | Lista de llamadas y totales |

## Estados que toda pantalla con datos cubre

| Estado | Qué se ve |
|---|---|
| Cargando | Esqueleto y texto de lo que se está haciendo |
| Sin datos (`sin_datos`) | «No hemos encontrado suficientes vídeos para medir este nicho.» Sin cifras inventadas |
| Bloqueado / tiempo agotado | Explicación llana y «Volver a intentarlo» |
| Sin lector (`no_disponible`) | Enlace a Ajustes → YouTube |
| Fallo de IA | Mensaje de la 002 por código; `limite_de_gasto` enlaza a Ajustes → Límites |
| Datos viejos (> 90 días) | Aviso y «Volver a medir» |
