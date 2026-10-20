# Renombrar el canal: @losviajesdetok → Asombroso y Real (@AsombrosoYReal)

Preparado el 2026-09-28. Todo se hace en **YouTube Studio** (studio.youtube.com) con la cuenta del canal,
mejor desde el ordenador. Tiempo: unos 15 minutos. Ve marcando las casillas.

> **Antes de empezar, lo que conviene saber** (según la ayuda de YouTube; puede cambiar):
> - El nombre y el identificador (@) se pueden cambiar **como mucho 2 veces cada 14 días**: revisa bien
>   antes de guardar.
> - Los suscriptores, vídeos y estadísticas **no se pierden**: es el mismo canal con otro nombre.
> - El enlace antiguo `youtube.com/@losviajesdetok` **deja de funcionar** (el @ antiguo queda reservado
>   unos 14 días y después se libera). Cambia los enlaces que hayas puesto en otras redes.
> - @AsombrosoYReal estaba libre el 27-09-2026; si ya no lo está, prueba `@AsombrosoyReal.es` o
>   `@AsombrosoYRealTV` y avísame para actualizar `canal.json`.

## 1. Nombre e identificador
Studio → **Personalización** → pestaña **Información básica**.
- [ ] **Nombre:** `Asombroso y Real`
- [ ] **Identificador:** `AsombrosoYReal` (espera al tic verde de "disponible")
- [ ] Todavía no pulses Publicar: sigue en esta pestaña.

## 2. Descripción (misma pestaña)
- [ ] Borra la de Tok y pega esta (≈ 600 caracteres; el límite es 1.000):

```
Historias que parecen inventadas… y son reales.

Una epidemia de baile que duró semanas. Un hombre que siguió hablando con una barra de hierro que le había atravesado la cabeza. Una roca que llegó de otra estrella. En Asombroso y Real contamos casos y fenómenos que cuesta creer, con rigor (cada dato, con sus fuentes en la descripción del vídeo) y sin perder la gracia.

Cuatro temas y una misma pregunta: ¿de verdad pasó esto?
🏺 Historia insólita
🐙 Naturaleza y animales
🌌 Universo
🧠 Cuerpo y ciencia

Si te gusta que lo increíble te lo cuenten bien, suscríbete: hay mucho más.
```

- [ ] **Enlaces:** quita los de Tok. Si tienes TikTok o Instagram del canal con el nombre nuevo, añádelos;
      si no, déjalo vacío por ahora.
- [ ] **Correo de contacto** (opcional): uno que no sea el personal si quieres recibir propuestas.
- [ ] Pulsa **Publicar** (arriba a la derecha).

## 3. Imagen del canal
Studio → **Personalización** → pestaña **Imagen** (en algunas versiones, "Branding"). Archivos en
`<canal>/marca/` del proyecto (se regeneran con `.venv/bin/python herramientas/marca.py`, textos en `canal.json` → `marca`).
- [ ] **Foto de perfil** → Cambiar → `<canal>/marca/avatar.png` (800×800). Ajusta el círculo para que
      "AR" quede centrado.
- [ ] **Imagen del banner** → Cambiar → `<canal>/marca/banner.png` (2048×1152). En la vista previa, el
      nombre y el lema deben verse enteros en "Móvil" (la franja central).
- [ ] **Marca de agua del vídeo:** si tenías la de Tok, **Quitar** (o sube el avatar nuevo; opcional).
- [ ] Pulsa **Publicar**.

## 4. Ajustes que dependen del concepto nuevo
Studio → **Configuración** (el engranaje, abajo del todo en el menú de la izquierda; se abre una
**ventana emergente**, no está en "Personalización"):
- [ ] En la ventana: **Canal** (lista de la izquierda) → pestaña **Información básica** → campo
      **Palabras clave**, debajo de "País de residencia". Paso secundario: si no aparece, sáltalo.
      Borra las de Tok y pega:
      `curiosidades, historias reales, historia insólita, datos increíbles, misterios resueltos, naturaleza, animales, universo, espacio, ciencia, cuerpo humano, documental, divulgación, asombroso y real`
- [ ] **Canal → Configuración avanzada → Audiencia:** marca **"No, establecer este canal como no creado
      para niños"**. Es la razón principal del cambio de concepto (`docs/mercado.md` §1.4).
- [ ] En la misma ventana: **Ajustes de subida predeterminados** (en español de Latinoamérica,
      "Configuración predeterminada de carga") → pestaña **Configuración avanzada** → **Idioma del vídeo:**
      *Español (España)* y **Categoría:** *Educación*. (Solo se aplica al subir desde el navegador del
      ordenador. Lo de "no creado para niños" NO está aquí: es el ajuste de Audiencia del paso anterior.)
- [ ] **Guardar**.

## 5. Los Shorts de Tok (S001 Venus y S002 los 10 días de 1582)
- **Si aún no los has subido:** no los subas a este canal; no encajan con el concepto nuevo (robot
  infantil) y confundirían a YouTube sobre a quién enseñarlo.
- **Si ya están subidos:** pásalos a **Privado** (Studio → Contenido → Visibilidad), no los borres: así
  conservas sus datos y no se pierde nada si algún día quieres recuperarlos.

## 6. Comprobar (2 minutos)
- [ ] Abre `youtube.com/@AsombrosoYReal` en una ventana privada: nombre, avatar, banner y descripción
      nuevos.
- [ ] Mira el canal en el móvil: el banner debe leerse entero.
- [ ] Dime **"hecho"** (y el @ final si no fue @AsombrosoYReal): actualizo `canal.json`, `CLAUDE.md` y
      `docs/progreso.md`, y el canal queda listo para el primer `/nuevo-video`.
