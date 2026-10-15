# Gestor documental AFAL

Aplicación estática para GitHub Pages, conectada a Supabase Database, Auth y Storage. El repositorio contiene únicamente el código; el catálogo y los documentos se consultan después de iniciar sesión con el acceso compartido del equipo.

## Flujo

1. Capturar nombre y revisar coincidencias de palabras clave en todos los macroprocesos.
2. Confirmar documento nuevo y seleccionar macroproceso y tipo.
3. La base de datos asigna primero el menor número libre del mismo macroproceso y tipo; al agotarlos, continúa el consecutivo. La reserva es transaccional y los reintentos de creación usan una identidad de petición para evitar duplicados.
4. El registro queda en **Carga de documento pendiente**.
5. Cargar el original desde la ficha. Se calcula SHA-256 y se bloquean archivos idénticos ya registrados o con carga en curso.
6. Solo después de verificar el objeto cargado y su tamaño se vincula el archivo y se muestra **Registro completo**.

La cancelación conserva el registro, sus archivos y su historial; libera el número para otra alta. Las versiones se conservan separadas. No hay etapas de aprobación.

## Publicación

Publicar la rama `main`, carpeta raíz, en Settings → Pages. No se necesita compilar. Los archivos `index.html`, `app.js`, `core.js`, `config.js`, `styles.css` y `vendor/` deben conservar sus rutas.

En Supabase → Authentication → URL Configuration, configurar la URL del sitio y permitir el mismo destino de retorno del enlace de acceso. El acceso usa correo y contraseña mediante Supabase Auth. No requiere SMTP ni envío de enlaces para iniciar sesión. La contraseña la establece el propietario en Supabase → Authentication → Users → Add user → Create new user; no se incluye en el repositorio. El usuario de la aplicación debe estar confirmado y habilitado en `gd_members`. No cambiar la contraseña del dashboard de Supabase ni de GitHub.

## Acceso y archivos

- `config.js` contiene únicamente la URL del proyecto y una clave **publishable**, diseñada para el navegador. No colocar claves secretas o `service_role` en el código.
- El catálogo y el bucket `gd-documentos` son privados. Las políticas de acceso requieren sesión y un correo habilitado en `gd_members`.
- Se utiliza un único usuario de la aplicación, compartido por las personas que trabajan en el catálogo. El historial identifica esa cuenta común. La sesión del dashboard de Supabase no sustituye el inicio de sesión en esta aplicación.
- Las tablas expuestas permiten lectura a miembros; las operaciones de escritura pasan por funciones con comprobación de acceso. El código se reserva en PostgreSQL con bloqueo por macroproceso y tipo.
- Los originales se guardan por identidad interna del registro y del archivo; nunca por un código que pueda reutilizarse.
- Un fallo o cancelación de carga no marca el registro completo. La ficha permite verificar una carga interrumpida o descartar el intento para volver a cargarla.

## Alcance actual

Buscador de nombres, códigos, responsables y notas, con normalización de acentos y equivalencias comunes. No es búsqueda semántica mediante IA ni indexación del contenido completo de los documentos.

Vista integrada de PDF, imágenes PNG/JPEG/GIF/WebP y archivos de texto. Word, Excel y PowerPoint conservan el original descargable; su visualización integrada requiere un visor o una conversión adicional. La exportación CSV contiene metadatos y nombres de archivos, no es una copia de seguridad de los binarios.

Esta configuración limita cada carga a 50 MiB, según la configuración del bucket. El Excel de aproximadamente 60.7 MiB requiere reducir su tamaño o ampliar el límite con un plan compatible; no dividirlo o renombrarlo simula soporte.

Los pendientes heredados del Excel se conservan en una lista separada para revisión de identidad; no se les asignan códigos automáticamente. Los archivos originales de SharePoint no se han importado masivamente: se cargan desde cada registro.

## Dependencia

SDK oficial `@supabase/supabase-js` 2.118.0, incluido en `vendor/`, con licencia y archivo de integridad npm. No se descargan librerías en ejecución desde un CDN.
