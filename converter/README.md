# Convertidor PDF AFAL — prueba gratuita

Este servicio convierte archivos Office en PDF. No contiene documentos, catálogos ni credenciales de Supabase. No modifica la web del gestor.

## Creación

1. Crear una cuenta en https://dashboard.render.com/ usando GitHub.
2. Crear un Blueprint desde el repositorio gestor-documental-afal y seleccionar `render.yaml`.
3. Comprobar que el servicio `afal-convertidor-pdf` usa el plan Free antes de desplegar.
4. Render genera una contraseña en `GOTENBERG_API_BASIC_AUTH_PASSWORD`. Mantenerla privada; posteriormente se configurará como secreto en Supabase, nunca en GitHub ni en el navegador.

## Límites de esta prueba

- Peticiones de hasta 12 MB incluyendo el multipart. Empezar con Excel de menos de 10 MB.
- Solo una conversión activa; cola pequeña para evitar agotar la memoria del plan gratuito.
- Sin disco persistente. El PDF debe guardarse en Supabase después de cada conversión.
- El servicio se suspende por inactividad y el primer inicio puede tardar.
- Macros desactivadas por el convertidor; no se descargan recursos externos.
- Las fuentes y las opciones de impresión del libro afectan la presentación. LibreOffice puede presentar diferencias respecto de Excel.

## Comprobación antes de conectar documentos

1. Sin autenticación, una petición a `/forms/libreoffice/convert` debe ser rechazada.
2. Con autenticación, convertir primero un Excel sintético sin información privada.
3. Verificar que el resultado es un PDF legible, con todas las hojas imprimibles y el formato adecuado.
4. Probar procedimientos reales pequeños y revisar las páginas.
5. Conectar la carga de originales y la vista PDF por versión en Supabase.

El backend de conversión está preparado para despliegue. La cola, el almacenamiento de vistas PDF y su integración automática con el gestor aún requieren implementación y pruebas después de disponer del servicio.

Referencias: https://gotenberg.dev/docs/configuration y https://render.com/docs/free
