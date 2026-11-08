# NutriPediátrica · Despliegue cPanel

1. Descomprima este paquete directamente en la Raíz de aplicación configurada en Node.js Selector: nutricion.
2. Use Node.js 22.23.4, modo Production y archivo de inicio app.js.
3. Ejecute NPM Install, guarde y reinicie la aplicación.
4. Abra /nutricion/ y confirme que aparezcan los pacientes de demostración.

## Base de datos

Antes de usar datos reales, cree una base MySQL y ejecute database/001_patients.sql desde phpMyAdmin. Agregue las variables de .env.example en Environment variables de cPanel; no suba contraseñas como archivos.

La ruta /nutricion/health muestra si la aplicación opera en modo demo o con MySQL configurado.
