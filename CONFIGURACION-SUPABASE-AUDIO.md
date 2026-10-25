# Configuración final de Supabase, galería y audio

## A. Supabase (una sola vez)

1. Abre el proyecto correcto en https://supabase.com/dashboard.
2. Si ya ejecutaste `database/schema.sql` y la web permite iniciar sesión, **no lo vuelvas a ejecutar**.
3. Abre `database/storage-gallery.sql`, copia todo el contenido y ejecútalo en **SQL Editor → New query → Run**. Esta migración habilita los tipos `imagen` y `sticker` en `content_items`, crea el bucket público `jorgito-gallery` (5 MB por imagen) y restringe la escritura al perfil con `role = 'owner'`.
4. Ve a **Table Editor → profiles** y confirma que tu fila tenga tu UUID y `role = owner`. No cambies el rol de otros usuarios.
5. Ve a **Storage** y confirma que exista `jorgito-gallery`. No es necesario crearla manualmente si el SQL terminó sin errores.
6. En la web, inicia sesión como propietario, entra a Administración, selecciona `Imagen graciosa / meme` o `Sticker`, elige un archivo JPG/PNG/WEBP/GIF de máximo 5 MB y pulsa Publicar.

## B. Audio de Moncayo

El audio está configurado como archivo estático del sitio, no como registro de Supabase. El JSON/código apunta a `assets/audio/Moncayo.mp3`.

1. En VS Code, dentro del proyecto que realmente publicas, abre `assets/audio/`.
2. Copia ahí la grabación real y asegúrate de que el nombre sea exactamente `Moncayo.mp3` (incluyendo mayúsculas y extensión).
3. Prueba la ruta directa en el navegador mientras Live Server está activo: `http://127.0.0.1:5500/assets/audio/Moncayo.mp3`. Debe reproducirse o descargarse, no mostrar 404.
4. Si la ruta funciona pero el reproductor sigue en `0:00`, vuelve a exportar/conseguir el archivo como MP3 válido y prueba de nuevo. El archivo debe contener la grabación; crear un archivo vacío con ese nombre no sirve.
5. Guarda los cambios y, al publicar en GitHub Pages, asegúrate de incluir `assets/audio/Moncayo.mp3` en el repositorio. Si no subes el archivo, funcionará localmente pero no en la web publicada.

## C. Prueba de extremo a extremo

- Publica un sticker llamado `Moncayo - Carro Loco prueba`.
- Abre la pestaña Galería y confirma que aparezca.
- En la tarjeta de Moncayo pulsa **Ver galería de Moncayo** y confirma que el filtro lo encuentre.
- Prueba el audio desde la tarjeta del personaje.

## Si algo falla

- `violates check constraint content_items_kind_check`: vuelve a ejecutar el SQL de `storage-gallery.sql`.
- `Bucket not found`: revisa Storage y confirma que el SQL se ejecutó en el proyecto correcto.
- `row-level security policy`: confirma `profiles.role = 'owner'` para tu usuario autenticado.
- `Moncayo.mp3` devuelve 404: corrige la ruta/nombre o copia el archivo al proyecto que está ejecutando Live Server.

**Seguridad:** nunca pegues una `service_role` o secret key en `assets/js/config.js`. Usa solamente la publishable key (o anon key heredada) junto con las políticas RLS.

## Asociación obligatoria de contenido a personajes

Después de ejecutar `database/schema.sql` y `database/storage-gallery.sql`, ejecuta una sola vez `database/character-association.sql` en Supabase > SQL Editor. Esta migración agrega `character_name` a publicaciones y propuestas y hace obligatorio el campo. Para conservar registros antiguos, los que no tengan personaje se asignan a Jorgito; luego puedes revisar y corregirlos si corresponde.

En Administración, selecciona el personaje antes de publicar. Las propuestas también requieren personaje y la aprobación conserva esa asociación. La galería filtra por personaje.
