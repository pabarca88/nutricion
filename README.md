# NutriPediátrica

Aplicación web para nutricionistas pediátricas: ficha clínica inicial, seguimiento clínico por hitos, cálculo de requerimientos, pauta por porciones de intercambio con ejemplos de menú y planes de alimentación revisados y aprobados por la profesional.

La aplicación ejecutable está en [`cpanel-deploy/`](cpanel-deploy/) (Node.js + MySQL, desplegable en cPanel).

## Empezar

Sigue [la guía de instalación](cpanel-deploy/INSTALACION.md) para levantar MySQL local, aplicar las migraciones, cargar la base de alimentos y ejecutar la aplicación.

Para continuar el desarrollo con una IA, pídele que lea primero [CLAUDE.md](CLAUDE.md) y [AI_HANDOFF.md](AI_HANDOFF.md).

## Estructura

```text
cpanel-deploy/            Aplicación Node.js para local y cPanel
  database/               Migraciones MySQL (001–009)
  database/seeds/         Base de alimentos (datos públicos de USDA) y catálogo inicial
  public/                 Interfaz web
  scripts/                Importación de alimentos y caso de prueba ficticio
AI_HANDOFF.md             Contexto técnico completo para continuar el desarrollo
CLAUDE.md / AGENTS.md     Instrucciones breves para asistentes de IA
```

No subir archivos `.env`, `node_modules`, respaldos de MySQL ni datos reales de pacientes.

Datos de alimentos: USDA FoodData Central, SR Legacy (2018), dominio público (CC0).
