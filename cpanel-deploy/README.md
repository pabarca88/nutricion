# NutriPediátrica · Despliegue cPanel

Para instalar una copia local desde GitHub, consulta [INSTALACION.md](INSTALACION.md). Para continuar el desarrollo con una IA desde otro computador, lee primero [AI_HANDOFF.md](../AI_HANDOFF.md).

1. Descomprima este paquete directamente en la Raíz de aplicación configurada en Node.js Selector: nutricion.
2. Use Node.js 22.23.4, modo Production y archivo de inicio app.js.
3. Ejecute NPM Install, guarde y reinicie la aplicación.
4. Abra /nutricion/ y confirme que aparezcan las fichas clínicas.

## Base de datos

Antes de usar datos reales, cree una base MySQL y ejecute, en orden, `database/001_patients.sql` y `database/002_patient_intake.sql` desde phpMyAdmin. Agregue las variables de `.env.example` en Environment variables de cPanel; no suba contraseñas como archivos.

La ruta /nutricion/health muestra si la aplicación opera en modo demo o con MySQL configurado.
