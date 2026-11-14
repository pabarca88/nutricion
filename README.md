# NutriPediátrica

Aplicación de fichas médico-nutricionales pediátricas y preparación de pautas para revisión profesional.

La aplicación ejecutable está en [`cpanel-deploy/`](cpanel-deploy/).

## Empezar

Sigue [la guía de instalación](cpanel-deploy/INSTALACION.md) para levantar MySQL local y ejecutar la aplicación.

Para continuar el desarrollo con una IA, entrega primero [AI_HANDOFF.md](AI_HANDOFF.md).

## Estructura

```text
cpanel-deploy/       Aplicación Node.js para local y cPanel
  database/           Migraciones MySQL
  public/             Interfaz web
AI_HANDOFF.md         Contexto técnico para continuar el desarrollo
```

No subir archivos `.env`, `node_modules`, exportaciones de MySQL ni datos reales de pacientes.
