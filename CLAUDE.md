# Instrucciones para la IA — NutriPediátrica

Antes de modificar cualquier archivo, **lee completo [AI_HANDOFF.md](AI_HANDOFF.md)**: contiene las reglas, la instalación paso a paso, el estado actual, las decisiones clínicas pendientes y el detalle técnico de cada módulo.

## Resumen de reglas (el detalle está en AI_HANDOFF.md)

1. La única aplicación activa está en `cpanel-deploy/` (Node.js sin framework + MySQL). No crear ni reinstalar otros frameworks o starters.
2. **No inventar fórmulas, valores nutricionales ni reglas clínicas.** Usar fuentes citables o pedírselas a la nutricionista. Toda pauta o cálculo es una propuesta para revisión profesional.
3. **Nunca subir** `.env`, contraseñas, dumps/respaldos de MySQL ni datos de pacientes reales. Probar solo con pacientes ficticios ("CASO DE PRUEBA…"; `node scripts/seed-demo.mjs`) y no tocar pacientes que no creaste.
4. Cambios de esquema: nueva migración numerada en `cpanel-deploy/database/` (la próxima es `010_...sql`); nunca editar una ya aplicada en un ambiente compartido. Documentarla en `AI_HANDOFF.md` y `cpanel-deploy/INSTALACION.md`.
5. Pedir la contraseña de root de MySQL al usuario si se necesita; no adivinarla ni cambiarla.
6. Verificar antes de entregar: `node --check` de cada archivo JS, prueba de la API y, para cambios de interfaz, prueba en el navegador.
7. Mantener `AI_HANDOFF.md` actualizado con cada cambio relevante.

## Arranque rápido

```sh
cd cpanel-deploy
npm install
cp .env.example .env    # completar con los datos de la base local
node --env-file=.env app.js
```

Abrir `http://localhost:3000/nutricion/`. La instalación completa (MySQL, migraciones 001–009 y datos de alimentos) está en `AI_HANDOFF.md`, sección "Instalación desde cero".
