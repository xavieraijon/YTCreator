# Alta del canal en YouTube: "{{nombre}}"

Lo prepara `/nuevo-canal` en la fase I con los textos del canal ya puestos; el usuario lo hace en
**YouTube Studio** (studio.youtube.com), mejor desde el ordenador, marcando las casillas. ≈ 20 minutos.

> **Lo que conviene saber** (ayuda de YouTube; puede cambiar):
> - El nombre y el identificador (@) se pueden cambiar **como mucho 2 veces cada 14 días**.
> - Un canal nuevo de una cuenta de Google: youtube.com → foto de perfil → **Crear un canal** (o, para
>   separarlo de la cuenta personal, **Configuración → Añadir o gestionar canales → Crear un canal**, que
>   crea una "cuenta de marca").
> - @ comprobado libre el <<RELLENAR: fecha>>: si ya no lo está, prueba <<RELLENAR: 2 alternativas>> y avisa
>   para actualizar `canal.json`.

## 1. Crear el canal, nombre e identificador
- [ ] Crea el canal (ver arriba) o, si ya existe, Studio → **Personalización** → **Información básica**.
- [ ] **Nombre:** `{{nombre}}`
- [ ] **Identificador:** `<<RELLENAR: identificador sin @>>` (espera al tic verde de "disponible")

## 2. Descripción (misma pestaña)
- [ ] Pega esta (límite 1.000 caracteres):

```
<<RELLENAR: descripción del canal: promesa en la primera línea (es lo que se ve en la búsqueda), 2-3 ejemplos concretos de vídeos, los pilares y una razón para suscribirse>>
```

- [ ] **Enlaces** y **correo de contacto** (opcional, mejor uno que no sea el personal).
- [ ] Pulsa **Publicar**.

## 3. Imagen del canal
Studio → **Personalización** → **Imagen**. Archivos en `<canal>/marca/` (se regeneran con
`.venv/bin/python herramientas/marca.py`, textos en `canal.json` → `marca`).
- [ ] **Foto de perfil** → `<canal>/marca/avatar.png` (800×800), centrada en el círculo.
- [ ] **Banner** → `<canal>/marca/banner.png` (2048×1152): en la vista previa "Móvil" el nombre y el lema
      deben verse enteros.
- [ ] **Marca de agua del vídeo** (opcional): el avatar.
- [ ] Pulsa **Publicar**.

## 4. Configuración
Studio → **Configuración** (engranaje abajo a la izquierda; se abre una ventana emergente):
- [ ] **Canal → Información básica → Palabras clave:**
      `<<RELLENAR: 10-15 palabras clave separadas por comas>>`
- [ ] **Canal → Configuración avanzada → Audiencia:** <<RELLENAR: "No, establecer este canal como no creado para niños" o lo decidido en el concepto>>.
- [ ] **Ajustes de subida predeterminados → Configuración avanzada:** idioma del vídeo
      *Español (España)* y categoría *<<RELLENAR: Educación / Entretenimiento…>>*.
- [ ] **Guardar**.

## 5. Comprobar (2 minutos)
- [ ] Abre `youtube.com/@<<RELLENAR: identificador>>` en una ventana privada y en el móvil.
- [ ] Di **"hecho"** (y el @ final): Claude comprueba el canal con yt-dlp, pone la `url` en `canal.json`
      y sigue con la fase J de `/nuevo-canal`.
