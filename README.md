# Juega con Jorgito — MVP

Aplicación estática con HTML, CSS, JavaScript y Supabase. Preparada para GitHub Pages.

## Incluye
- Inicio de sesión con cuentas creadas mediante invitación.
- Ranking compartido calculado desde resultados guardados en Supabase.
- Registro de puntos de prueba.
- Envío y seguimiento de propuestas.
- Panel básico del propietario para aprobar propuestas, publicar y eliminar contenido.
- Políticas Row Level Security (RLS) en las tablas.

## 1. Crear Supabase
1. Crea un proyecto en https://supabase.com/.
2. En SQL Editor, pega y ejecuta `database/schema.sql`.
3. En Project Settings / API, copia la Project URL y la publishable key (o anon key heredada).
4. Pega esos valores en `assets/js/config.js`.
5. En Authentication > URL Configuration, añade la URL de GitHub Pages a Site URL y Redirect URLs. Por ejemplo: `https://TU-USUARIO.github.io/juega-con-jorgito/`.

## 2. Invitar al propietario y a los miembros
1. En Authentication > Users, usa Add user / Send invitation para invitar el correo del propietario.
2. Acepta la invitación. En Table Editor > profiles, localiza el perfil del propietario y copia su UUID.
3. En SQL Editor ejecuta, sustituyendo el UUID:
   ```sql
   update public.profiles
   set role = 'owner', display_name = 'Jorgito'
   where id = 'UUID_DEL_PROPIETARIO';
   ```
4. Invita a cada miembro desde Authentication > Users. Las nuevas cuentas reciben rol `member`.
5. Desactiva el registro público si estuviera habilitado. No compartas claves de administrador.

## 3. Probar localmente
Puedes abrir `index.html` directamente en algunos navegadores, pero es preferible servirlo desde un servidor local (por ejemplo, extensión Live Server de VS Code). Asegúrate de añadir la URL local a Authentication > URL Configuration si el flujo de autenticación la requiere.

## 4. Publicar en GitHub Pages
1. Crea un repositorio llamado `juega-con-jorgito`.
2. Sube todos los archivos de esta carpeta a la raíz del repositorio.
3. Abre Settings > Pages.
4. En Build and deployment, selecciona Deploy from a branch, branch `main`, folder `/ (root)`, y guarda.
5. Espera a que termine el despliegue. La URL tendrá el formato `https://TU-USUARIO.github.io/juega-con-jorgito/`.
6. Añade esa URL en Supabase > Authentication > URL Configuration.
7. Abre la URL en una ventana privada e inicia sesión con una cuenta invitada.

GitHub Pages publica archivos estáticos y el sitio publicado es accesible públicamente; los datos privados se protegen mediante autenticación y RLS en Supabase. No publiques fotografías ni anécdotas sensibles sin permiso.

## Seguridad y límites del MVP
- `config.js` solo contiene la URL y la clave pública/publishable. Es normal que sean visibles en el navegador; la seguridad depende de RLS.
- Nunca pongas `service_role` ni una secret key en archivos HTML/JS.
- El botón de puntos (+10) es SOLO una prueba de sincronización: un usuario técnico podría falsificar resultados desde el navegador. Antes de convertirlo en competición real, implementa una Edge Function o RPC con validación de partidas, límites por juego y protección contra repetición.
- Para producción, configura correo SMTP propio, límites de intentos, recuperación de contraseña, moderación y copias de seguridad.
- No se incluyen fotos reales. Usa contenido con autorización de las personas representadas.


### Audio MP3 para frases de personajes

Crea la carpeta `assets/audio/` y guarda allí los MP3. Cada personaje puede incluir el campo `audio`, con una ruta relativa como `assets/audio/jorgito-frase.mp3`. La tarjeta mostrará un reproductor de audio HTML cuando exista esa ruta. Incluye los archivos de audio en el repositorio cuando publiques el sitio.

## Galería: subir imágenes desde el dispositivo

La galería permite publicar memes y stickers desde el computador o celular, además de pegar una URL pública. Para habilitar la carga directa:

1. En Supabase abre **SQL Editor**.
2. Abre el archivo `database/storage-gallery.sql` de este proyecto, copia su contenido y ejecútalo. El script también corrige la restricción de tipos de `content_items` para aceptar `imagen` y `sticker`.
3. Confirma que tu perfil tenga `role = 'owner'` en `public.profiles`.
4. Inicia sesión en la web, entra a **Administración**, selecciona **Imagen graciosa / meme** o **Sticker**, elige una imagen de hasta 5 MB y pulsa **Publicar**.

El script crea el bucket público `jorgito-gallery` con límite de 5 MB y formatos JPG, PNG, WEBP y GIF. La lectura es pública para que la galería se vea sin iniciar sesión; la carga, actualización y eliminación de archivos se limita a perfiles cuyo rol en la base de datos sea `owner`. No uses una clave `service_role` en el navegador.

## Personaje añadido

Se agregó la tarjeta de **Moncayo — “Carro Loco”** a la galería de personajes. El reproductor apunta a `assets/audio/Moncayo.mp3`; el MP3 real debe estar en esa ruta y añadirse al repositorio al publicar. Consulta `CONFIGURACION-SUPABASE-AUDIO.md` para comprobar la ruta y completar Supabase.

### Asociación obligatoria por personaje

Antes de usar esta versión, ejecuta una sola vez `database/character-association.sql` en Supabase SQL Editor. El formulario de publicación y el de propuestas requieren seleccionar un personaje. La galería se filtra por personaje asociado; no se debe publicar contenido sin personaje.


## Piloto en GitHub Pages

Esta versión elimina la pestaña «Juegos» y los minijuegos «Ruleta del caos», «Generador de equipos» y «Duelo absurdo». Se conservan «¿Quién es el personaje?» y «¿Qué haría este personaje?».

En «¿Quién es el personaje?», cada respuesta correcta intenta guardar 1 punto en `public.game_results`; el ranking lee la vista `public.leaderboard` de Supabase. Antes de publicar, verifica que `assets/js/config.js` tenga la URL del proyecto y la clave pública/publishable, nunca la `service_role`.

**Nota para el piloto:** el esquema actual permite insertar resultados desde el cliente autenticado. Es adecuado solo para una prueba informal; no es un sistema antitrampas. Antes de usar el ranking para competencias importantes, mueve la validación y el registro de puntuaciones a una función de servidor/RPC con validación de cada partida.
