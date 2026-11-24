# Contexto de trabajo para IA — NutriPediátrica

Este archivo permite que una IA (o una persona) continúe el desarrollo desde cualquier computador después de clonar el repositorio. **Léelo completo antes de modificar el proyecto.**

Orden de lectura recomendado:

1. Este archivo (reglas, instalación, estado y decisiones pendientes; luego el detalle técnico por módulo).
2. `cpanel-deploy/INSTALACION.md` (guía de instalación para personas).
3. El código en `cpanel-deploy/` (la única aplicación activa).

## Reglas obligatorias

**Seguridad clínica**

- La app propone; la nutricionista decide. Ningún cálculo, pauta o menú se presenta como indicación definitiva sin revisión y aprobación de la profesional responsable.
- **No inventar fórmulas, valores nutricionales ni reglas clínicas.** Todo número debe venir de una fuente citable (y citarse en el código y en este archivo) o ser ingresado por la profesional. Si falta un dato clínico, pregúntalo o déjalo configurable y advertido en la interfaz.
- Las reglas de porciones por edad, los factores de actividad y la distribución de energía por comida son decisiones de la nutricionista (ver "Decisiones pendientes").

**Datos y privacidad**

- Nunca subir a GitHub `.env`, contraseñas, respaldos/dumps de MySQL ni datos de pacientes reales.
- Sí se suben: código, migraciones, `database/seeds/` (catálogo de alimentos con datos públicos de USDA) y el script del caso ficticio `scripts/seed-demo.mjs`.
- Para probar, usa solo pacientes ficticios (nombre que empiece con "CASO DE PRUEBA" o "PRUEBA"). No borres ni modifiques pacientes que no hayas creado tú.

**Base de datos**

- Nunca editar una migración ya aplicada en un ambiente compartido. Para cambiar el esquema, crear un nuevo archivo numerado en `cpanel-deploy/database/` (el siguiente es `010_...sql`) y documentarlo aquí y en `INSTALACION.md`.
- Comenzar cada migración con `SET NAMES utf8mb4;` si contiene textos con tildes.

**Git**

- Revisar `git status` antes de cada commit; no borrar cambios ajenos.
- Los archivos se guardan con fin de línea LF (`.gitattributes`).

## Objetivo del producto

NutriPediátrica es una aplicación web para nutricionistas pediátricas:

1. Ficha clínica inicial del paciente (antecedentes médico-nutricionales, hábitos, preferencias, alergias, antropometría).
2. Seguimiento clínico por hitos: cada control registra mediciones, evolución y solo los datos de la ficha que cambiaron.
3. Cálculo de requerimientos (energía y macronutrientes) desde peso, talla, edad, sexo y actividad.
4. Pauta por porciones de intercambio con ejemplos de menú por comida, respetando alergias, rechazos y preferencias.
5. Planes de alimentación versionados: borrador → aprobado por la profesional.

## Estructura

La aplicación activa está en `cpanel-deploy/` (Node.js sin framework + MySQL, desplegable en cPanel/Passenger):

```text
cpanel-deploy/app.js                 Servidor HTTP y rutas de la API; pacientes
cpanel-deploy/errors.js              HttpError compartido
cpanel-deploy/plans.js               Planes de alimentación (validación, versiones, aprobación, exclusiones)
cpanel-deploy/catalog.js             Base de alimentos, reglas por edad, generador de porciones y ejemplos de menú
cpanel-deploy/milestones.js          Hitos de seguimiento y cálculo del estado actual de la ficha
cpanel-deploy/public/index.html      Interfaz (una sola página)
cpanel-deploy/public/requirements.js Cálculo de energía y macronutrientes (Schofield peso y talla, DRI/AMDR)
cpanel-deploy/public/nutri.js        Ficha clínica, lista de pacientes, listas de alimentos
cpanel-deploy/public/plans.js        Editor e historial de planes, pauta por porciones, ejemplos de menú
cpanel-deploy/public/catalog.js      Pantalla "Base de alimentos" (grupos, alimentos, reglas por edad)
cpanel-deploy/public/followup.js     Pantalla "Seguimiento" (estado actual, gráficos, registro clínico)
cpanel-deploy/public/nutri.css       Estilos
cpanel-deploy/database/              Migraciones 001–009 (aplicar en orden)
cpanel-deploy/database/seeds/        usda_foods.sql y catalogo.sql (datos públicos USDA) + catalog-seed.json
cpanel-deploy/scripts/               import-usda.mjs, seed-catalog.mjs (regenerar seeds), seed-demo.mjs (caso ficticio)
cpanel-deploy/.env.example           Variables de entorno de ejemplo
cpanel-deploy/INSTALACION.md         Guía de instalación para personas
```

Los scripts del navegador son clásicos (no módulos) y comparten globales en este orden: `requirements.js` → `nutri.js` → `plans.js` → `catalog.js` → `followup.js`.

## Instalación desde cero

Requisitos: Git, Node.js 22 o superior, MySQL 8 o superior.

### 1. Código y dependencias

```sh
git clone https://github.com/pabarca88/nutricion.git
cd nutricion/cpanel-deploy
npm install
```

### 2. MySQL: base y usuario

- **Windows:** instalar con MySQL Installer. El cliente queda en `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe` (agregarlo al PATH o usar la ruta completa). Usar siempre `--default-character-set=utf8mb4` al importar archivos `.sql`.
- **macOS:** `brew install mysql` y `brew services start mysql`.

Como administrador (`mysql -u root -p -h 127.0.0.1`):

```sql
CREATE DATABASE nutripediatrica_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nutricion_dev'@'localhost' IDENTIFIED BY 'nutricion_dev_local';
GRANT ALL PRIVILEGES ON nutripediatrica_dev.* TO 'nutricion_dev'@'localhost';
FLUSH PRIVILEGES;
```

La contraseña de root es del dueño del computador: pídela, no la adivines ni la cambies.

### 3. Migraciones (una vez, en orden)

Desde `cpanel-deploy` (contraseña `nutricion_dev_local`):

```sh
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/001_patients.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/002_patient_intake.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/003_nutrition_plans.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/004_plan_excluded_foods.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/005_plan_food_preferences.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/006_food_catalog.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/007_food_meal_types.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/008_patient_measurements.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/009_patient_milestones.sql
```

En una base nueva, la 002 termina con `ERROR 1060: Duplicate column name 'intake_data'`. Es esperado (la 001 actual ya crea esa columna); continúa con la 003.

### 4. Datos de alimentos (incluidos en el repositorio)

```sh
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/seeds/usda_foods.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/seeds/catalogo.sql
```

Cargan la referencia USDA (7.793 alimentos) y el catálogo inicial en español (80 alimentos). Se pueden repetir sin duplicar. Para regenerarlos desde los CSV de USDA, ver `scripts/import-usda.mjs` y `scripts/seed-catalog.mjs`.

### 5. Entorno y arranque

```sh
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
```

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=nutripediatrica_dev
DB_USER=nutricion_dev
DB_PASSWORD=nutricion_dev_local
APP_BASE_PATH=/nutricion
```

```sh
node --env-file=.env app.js
```

Abrir `http://localhost:3000/nutricion/`. `http://localhost:3000/nutricion/health` debe responder `"database":"configured"`.

### 6. Caso ficticio para probar (opcional)

Con la app en ejecución:

```sh
node scripts/seed-demo.mjs
```

Crea "CASO DE PRUEBA - Sofía Ficticia" (8 años, alergia a maní y nueces, rechaza pescado y brócoli) con ficha inicial de hace un año y 4 hitos trimestrales. Si ya existe, no hace nada.

### 7. Verificación rápida

```sh
for f in app.js plans.js catalog.js milestones.js errors.js public/*.js scripts/*.mjs; do node --check "$f"; done
curl http://localhost:3000/nutricion/api/patients
curl http://localhost:3000/nutricion/api/food-groups
```

## Estado actual (qué está construido)

- **Pacientes:** lista con último peso/talla; botones **Ficha inicial**, **Seguimiento** y **Planes**.
- **Ficha inicial** (versión base, editable): entrevista clínica completa en `patients.intake_data`; fecha de atención = hoy por defecto; listas estructuradas de alimentos a excluir (alergia/intolerancia), preferidos y rechazados, con sugerencias del catálogo.
- **Seguimiento clínico por hitos:** mediciones, evolución, registro de la atención y solo los cambios de la ficha; estado actual = ficha + cambios; gráficos de peso, talla e IMC; velocidad de talla.
- **Requerimientos:** Schofield con peso y talla, proteína RDA por g/kg, distribución dentro de AMDR; peso de cálculo editable.
- **Base de alimentos:** referencia USDA, catálogo en español con etiquetas de exclusión y tiempos de comida habituales, porción de referencia por grupo (mediana o valor manual), reglas de porciones por edad.
- **Planes:** borrador → aprobado (inmutable) → reemplazado; pauta por porciones generada y editable; 3+ días de menú de ejemplo; avisos y confirmación si se mencionan alimentos excluidos o rechazados.

## Decisiones pendientes de la nutricionista

Estos valores no deben inventarse; hay que pedírselos a la profesional:

1. **Reglas de porciones por edad** (Base de alimentos → Reglas por edad). Hoy están vacías: sin ellas la pauta solo cuadra calorías y macros y puede omitir carnes o huevo.
2. **Factores de actividad** (hoy 1,25 / 1,4 / 1,6, provisionales del código original).
3. **Porcentaje de proteína** (la RDA por g/kg suele quedar bajo el 10% y se sube al mínimo AMDR).
4. **Distribución de energía por tiempo de comida** (sin % se reparte en partes iguales).
5. **Porción de referencia de cada grupo** y revisión de los 80 alimentos iniciales.

## Advertencias técnicas conocidas

- **Tildes y MySQL en Windows:** importar `.sql` sin `--default-character-set=utf8mb4` guarda textos mal codificados ("L├ícteos").
- **`curl` en la terminal de Windows** puede enviar mal las tildes en JSON; para probar la API con textos acentuados usa `fetch` desde Node.
- **Rangos Unicode en el código:** algunas herramientas de edición convierten `\u0300-\u036f` en caracteres invisibles. Después de editar `normalize`/`normalizeFood`, verifica con `grep -n "u0300" *.js public/*.js`.
- **`mysql2` y `affectedRows`:** con `ON DUPLICATE KEY UPDATE` informa 1 aunque la fila no cambie; cuenta filas antes y después si necesitas saber qué se insertó.
- **Fechas DATE:** se devuelven con `DATE_FORMAT(..., '%Y-%m-%d')` para evitar desfases de zona horaria.
- **Coincidencia de alimentos:** un grupo completo solo se excluye con su nombre exacto ("Lácteos"); "Pescado" o "Huevo" excluyen por nombre, alias o etiqueta, no todo "Carnes, pescados y huevos".

# Detalle técnico por módulo

## Planes de alimentación (migración 003)

Tabla `nutrition_plans`, asociada a `patients.id` y versionada por paciente (`UNIQUE (patient_id, version)`). Guarda fórmula o criterio, `calculation_inputs` (JSON: edad, sexo, peso, talla, IMC, gasto basal, factor de actividad), energía, porcentajes y gramos de macronutrientes (los gramos se calculan en el servidor con 4/4/9 kcal/g), `meal_distribution` (JSON: tiempo de comida, % opcional, indicaciones), indicaciones, notas profesionales y datos de aprobación.

Estados y reglas (aplicadas en `plans.js`):

- `Borrador`: editable; puede estar incompleto. Puede descartarse (`Descartado`, queda archivado y fuera del historial).
- `Aprobado`: requiere nombre de quien aprueba, energía, macros y al menos un tiempo de comida. Es de solo lectura; los cambios se hacen creando una nueva versión a partir de él.
- Al aprobar un plan, el aprobado anterior del mismo paciente pasa a `Reemplazado`. Solo hay un plan vigente por paciente.
- El estado del paciente cambia a `Plan en borrador` (si estaba en `Borrador`) y a `Plan aprobado` al aprobar.
- Los macros deben sumar 100%; la distribución por comida, si se completa en todos los tiempos, también.

La propuesta automática reutiliza la estimación provisional existente (Schofield × factor de actividad, macros 50/20/30) y deja los porcentajes por tiempo de comida vacíos para que los defina la profesional. Todo valor propuesto debe validarse antes de aprobar.

API:

```text
GET  /api/patients/:id/plans     Historial (sin descartados), versión más reciente primero
POST /api/patients/:id/plans     Crear borrador
GET  /api/plans/:id              Obtener plan
PUT  /api/plans/:id              Editar borrador (409 si no es borrador)
POST /api/plans/:id/approve      Aprobar { approved_by }
POST /api/plans/:id/discard      Descartar borrador
```

### Listas de alimentos (migraciones 004 y 005)

- La ficha tiene tres listas estructuradas en `intake_data`, cada una `[{ food, type, note }]`, ingresadas con el componente de chips de `nutri.js` (`FOOD_LISTS`, `readFoodList`, `addFood`, `renderFoodLists`):
  - `food_allergens`: alimentos a excluir; `type` es `Alergia`, `Intolerancia` u `Otra exclusión`.
  - `favorite_foods`: alimentos preferidos.
  - `rejected_foods`: alimentos que rechaza.
- `favorite_foods` y `rejected_foods` eran texto libre en fichas antiguas. `readFoodList` convierte ese texto (separado por comas, punto y coma o saltos de línea) en lista al abrir la ficha; queda guardado como lista al volver a guardarla.
- `nutrition_plans` guarda copias en `excluded_foods`, `preferred_foods` y `rejected_foods` (JSON). Un borrador toma siempre las listas vigentes de la ficha al guardarse; un plan aprobado conserva las suyas.
- El editor de planes muestra las tres listas: excluidos (rojo, no incluir), rechazados (ámbar, evitar o adaptar) y preferidos (verde; marca con ✓ los que ya aparecen en el plan y cuenta cuántos se incluyeron).
- Avisos en vivo y en el servidor (`findExclusionMentions` en `plans.js`) cuando un alimento excluido o rechazado aparece en los tiempos de comida o las indicaciones (comparación sin tildes ni mayúsculas, plural simple). Aprobar con menciones responde 409, salvo que se envíe `confirm_exclusions: true`; la interfaz pide esa confirmación explícita.
- El sistema aún no tiene un catálogo de alimentos ni menús generados automáticamente; cuando exista, debe excluir `excluded_foods`, evitar `rejected_foods` y priorizar `preferred_foods`.

Errores de validación responden 400/404/409 con `{ error }`; si falta una migración, 503. Sin MySQL configurado, los planes funcionan en memoria (modo demo).

## Cálculo de pauta actual

La propuesta usa Schofield con peso y talla, proteína por g/kg (DRI) y distribución dentro de rangos AMDR (ver "Cálculo de requerimientos" más abajo), con un factor de actividad provisional. Muestra IMC, energía estimada y macronutrientes en g y %.

No tratar estos parámetros como protocolo clínico definitivo. Antes de producción, la nutricionista debe definir y aprobar:

- Fórmulas y rangos por edad y condición clínica.
- Factores de actividad.
- Reglas de macronutrientes y porciones.
- Curvas de crecimiento y diagnóstico nutricional.
- Manejo de alergias, patologías, suplementos y exclusiones.

## Seguimiento clínico por hitos (migraciones 008 y 009)

Modelo de ficha clínica: la **ficha inicial** es la versión base (editable desde "Ficha inicial"; `patients.weight_kg`, `height_cm`, `intake_data`) y **no se modifica** al registrar seguimiento. Cada **hito** es un registro complementario:

- Tabla `patient_milestones` (la 008 creó `patient_measurements`; la 009 la renombra y agrega columnas): `measured_at`, `milestone_type` (Control nutricional, Control telefónico / remoto, Resultado de exámenes, Interconsulta, Otro), `attended_by`, mediciones (peso, talla, perímetros, PA), `notes`, y dos JSON:
  - `updates`: **solo los datos de estado de la ficha que cambiaron** en ese hito (alergias y listas de alimentos, condiciones, medicamentos, hábitos, actividad, diagnóstico nutricional, objetivos y tipo de pauta). Claves permitidas: `STATE_KEYS` en `milestones.js`.
  - `record`: datos propios de la atención (evolución, recordatorio 24 h, examen físico, exámenes, indicaciones, educación, acuerdos, objetivos y fecha del próximo control). Claves: `VISIT_KEYS`.
- **Estado actual** (`currentState` en `milestones.js`): ficha inicial + `updates` de los hitos en orden cronológico. `GET /api/patients/:id` devuelve `intake_data` (base), `current_data` (estado actual), `current_sources` (qué hito cambió cada dato) y `next_control`. **Los planes usan `current_data`** (factor de actividad, alimentos excluidos/preferidos/rechazados, tiempos de comida) y el peso/talla más recientes.
- Pantalla **Seguimiento** (`public/followup.js`): resumen y gráficos de peso, talla e IMC (color `#0f8a6a` validado con dataviz; tooltip; tabla de mediciones como vista de datos); panel de estado actual con el origen de cada dato; formulario de hito que reutiliza las definiciones de campos de la ficha (`sections`/`field` de `nutri.js`), precarga el estado vigente **a la fecha del hito**, marca los campos modificados y guarda solo las diferencias; registro clínico con tarjetas por hito ("antes → después"; en listas, "se agregó / se quitó") y la ficha inicial como primera entrada. Editar un hito antiguo recalcula el estado vigente a esa fecha; eliminarlo (archivar) deja de aplicar sus cambios.
- Velocidad de talla: contra la medición más reciente separada por al menos 3 meses.
- Validación: fecha no futura ni anterior al nacimiento; tipo válido; solo claves permitidas; próximo control no anterior al hito; el hito no puede estar vacío.

API:

```text
GET    /api/patients/:id/milestones   Hitos del paciente (orden cronológico)
POST   /api/patients/:id/milestones   Registrar hito
PUT    /api/milestones/:id            Editar hito
DELETE /api/milestones/:id            Eliminar (archivar) hito
```

Pendiente recomendado: curvas de crecimiento OMS (z-score/percentil) y, si se requiere trazabilidad legal, bloquear la edición de hitos pasado un plazo y registrar auditoría de cambios.

## Cálculo de requerimientos (public/requirements.js)

Reemplaza la estimación anterior (que usaba en realidad ecuaciones OMS 1985 por peso, etiquetadas como Schofield, y macros fijos 50/20/30). `estimateRequirements(data, options)` se usa en la vista previa de la ficha y en el editor de planes:

- **Gasto basal:** Schofield (1985) con peso (kg) y talla (m), kcal/día, por sexo y tramo 0–3, 3–10 y 10–18 años. Coeficientes verificados en ESPGHAN/ESPEN, *Guidelines on Paediatric Parenteral Nutrition* (2005), cap. 2, Tablas 2.1–2.3.
- **Energía:** gasto basal × factor de actividad. Los factores (1,25 / 1,4 / 1,6 según la actividad registrada; 1,4 si no hay registro) son **provisionales del sistema**, no de una guía; la profesional debe definirlos.
- **Proteína:** RDA de las DRI (IOM/National Academies 2005): 1,05 g/kg (1–3 años), 0,95 (4–13), 0,85 (14–18), sobre el "peso para el cálculo" (peso actual por defecto; editable para usar peso ideal). Si queda fuera del rango AMDR se ajusta al límite y se informa (habitualmente queda bajo el mínimo de 10% y se sube a 10%).
- **Grasas:** punto medio del rango AMDR (35% en 1–3 años; 30% en 4–18). **Carbohidratos:** el resto, verificando 45–65%.
- Menores de 1 año y 18 años o más: no se calcula; se pide ingreso manual.

`calculation_inputs` guarda además `calc_weight_kg` y `protein_g_per_kg`.

## Ejemplos de menú (migración 007)

- `foods.meal_types`: tiempos de comida habituales de cada alimento (`desayuno, colacion, almuerzo, once, cena`; vacío = cualquiera). Valores iniciales en `catalog-seed.json` (campo `meals`), editables en la base de alimentos.
- Las porciones de cada grupo se reparten solo entre los tiempos de comida donde el grupo tiene alimentos habituales, en porciones enteras (media porción solo si sobra). El nombre libre del tiempo de comida se clasifica con `mealKey` ("Colación de mañana" → colacion; "Merienda" → once).
- `buildExamples` arma 3 días de ejemplo: por cada grupo y comida elige un alimento sugerido que calce con el horario (preferidos primero, sin repetir en el día si hay alternativas; si la porción es ≥ 2 la reparte en dos alimentos). Cantidades en medida casera (`amountText`: "1/2 taza" × 3 → "1 1/2 tazas") y gramos. Si ningún alimento calza con el horario, usa otro y lo marca "poco habitual: revisar".
- `POST /api/portion-plan/examples { portion_plan, offset }` recalcula los ejemplos tras editar porciones ("Actualizar ejemplos") o genera otros días ("Otros ejemplos").
- El generador prioriza la energía (peso 4) y trata la proteína como mínimo (exceso penalizado ×0,3), porque las reglas de lácteos/carnes suelen superar el objetivo proteico mínimo.
- Sin reglas por edad, el resultado puede no incluir carnes ni huevo (la proteína mínima se cubre con lácteos y cereales). **Las reglas por edad son necesarias para menús clínicamente razonables.**

En el editor de planes, el botón **Calcular requerimientos y generar pauta con ejemplos** ejecuta todo el flujo (requerimientos → porciones → ejemplos) como borrador.

## Base de alimentos y pauta por porciones (migración 006)

Fuente de nutrientes: **USDA FoodData Central, SR Legacy (2018-04)**, dominio público. Se decidió no transcribir la tabla chilena de intercambios (INTA 1999) porque no hay una versión digital pública verificable. No inventar valores nutricionales: todo número del catálogo proviene de USDA o lo ingresa/valida la profesional.

Tablas:

- `usda_foods`: referencia USDA completa en inglés (por 100 g, con medidas caseras en `portions` JSON). Se usa para buscar y agregar alimentos.
- `food_groups`: 9 grupos de intercambio (cereales, verduras, frutas, lácteos, carnes/pescados/huevos, leguminosas, aceites y grasas, alimentos ricos en lípidos, azúcares). `ref_*` son valores por porción definidos por la profesional; si están vacíos, la porción de referencia se calcula como **mediana** de los alimentos activos del grupo y se marca "Mediana USDA · revisar".
- `foods`: catálogo en español (nombre, alias, etiquetas de exclusión, grupo, nutrientes por 100 g copiados de USDA, medida casera y gramos). Etiquetas como `leche, lactosa`, `gluten, trigo`, `huevo`, `pescado`, `mani`, `frutos secos` permiten excluir por alergia o intolerancia.
- `portion_rules`: mínimo/máximo de porciones diarias por grupo y tramo de edad. **Vacía por defecto: la definen las profesionales.** Sin reglas, el generador solo cuadra kcal y macronutrientes y lo advierte.
- `nutrition_plans.portion_plan` (JSON): pauta por porciones guardada con el plan.

Carga de datos: `scripts/import-usda.mjs` y `scripts/seed-catalog.mjs` (ver INSTALACION.md). Ambos aceptan `--sql archivo.sql`. Los SQL resultantes están versionados en `database/seeds/usda_foods.sql` y `database/seeds/catalogo.sql` (datos públicos); si cambias `catalog-seed.json`, regenera `catalogo.sql` con `node scripts/seed-catalog.mjs RUTA_CSV --sql database/seeds/catalogo.sql`. Los CSV de USDA no se suben.

Generador (`catalog.js`, `generatePortionPlan`):

1. Objetivo: kcal del plan y gramos de macronutrientes según sus porcentajes (4/4/9 kcal/g).
2. Límites por grupo: reglas del tramo de edad del paciente; sin regla, 0–10 porciones. Un grupo sin alimentos disponibles (todos excluidos o rechazados) queda en 0 y se advierte.
3. Búsqueda local en pasos de 0,5 porciones que minimiza el error relativo de kcal, proteínas, grasas y carbohidratos (con leve regularización para repartir entre grupos).
4. Reparto por tiempo de comida según el % de energía de cada uno (si no suman 100%, partes iguales).
5. Alimentos sugeridos por grupo: excluye los que coinciden con `excluded_foods`, omite los de `rejected_foods` y prioriza `preferred_foods` (coincidencia por palabra en nombre, alias o etiquetas; un grupo completo solo con su nombre exacto, para que "Pescado" o "Huevo" no excluyan todo "Carnes, pescados y huevos"; `foodMatches`).

La interfaz permite ajustar las porciones a mano (los totales se recalculan) y muestra la diferencia con el objetivo. Las kcal de USDA usan factores específicos por alimento, por lo que pueden diferir algunos puntos de la suma 4/4/9.

API:

```text
GET  /api/food-groups            Grupos con porción de referencia (manual o mediana)
PUT  /api/food-groups/:id        Nombre, valores de referencia y notas
GET  /api/foods[?inactive=1]     Catálogo
POST /api/foods                  Agregar alimento
PUT  /api/foods/:id              Editar alimento (active=false lo desactiva)
GET  /api/usda/search?q=         Buscar en usda_foods (inglés)
GET  /api/portion-rules          Reglas por edad
PUT  /api/portion-rules          Reemplazar todas las reglas { rules: [...] }
POST /api/portion-plan           Generar pauta por porciones con ejemplos (no guarda; se guarda con el plan)
POST /api/portion-plan/examples  Recalcular ejemplos de menú de una pauta editada
```

Pendiente y recomendado:

- Que la nutricionista revise los 80 alimentos iniciales (nombres, porciones y etiquetas), defina la porción de referencia de cada grupo y cargue las reglas por edad.
- Considerar dividir lácteos y carnes por contenido graso (como las listas de intercambio clásicas), agregando grupos desde la base.
- Vista imprimible del plan aprobado con la pauta por porciones y los alimentos sugeridos.

## Próximo desarrollo recomendado

El módulo de planes persistentes ya está implementado (ver arriba). Siguientes pasos posibles:

1. Vista imprimible / PDF del plan aprobado para entregar a la familia.
1b. Curvas de crecimiento OMS (z-score/percentil) en el seguimiento.
2. Autenticación de usuarias, para registrar quién aprueba sin escribir el nombre a mano.
3. ~~Registro de controles de seguimiento y gráfico de evolución~~ (implementado como hitos, ver Seguimiento clínico).
4. Reemplazar la estimación provisional por las fórmulas, factores y reglas que defina y apruebe la nutricionista.
5. Completar la base de alimentos y las reglas de porciones por edad (ver sección anterior).

No inventar fórmulas médicas ni ocultar que un cálculo requiere validación profesional.

## Convenciones de base de datos (resumen)

- Nunca editar una migración ya usada en un ambiente compartido.
- Para cambios de esquema, crear un nuevo archivo SQL numerado en `cpanel-deploy/database/`.
- Aplicar cada migración una sola vez y en orden.
- No subir dumps de MySQL ni fichas con datos reales de pacientes.

## Seguridad y Git

- No subir `.env`, contraseñas reales, bases de datos, respaldos ni información de pacientes.
- Sí subir código, `package.json`, `package-lock.json`, `.env.example`, migraciones SQL y documentación.
- `node_modules` está ignorado y se reconstruye con `npm install`.
- Verificar cambios con `git status` antes de hacer commit. No borrar cambios ajenos del usuario.

## Comprobaciones útiles

```sh
node --check app.js
node --check plans.js
node --check public/nutri.js
node --check public/plans.js
node --check catalog.js
node --check public/catalog.js
node --check public/requirements.js
node --check public/followup.js
node --check milestones.js
```

```sh
curl http://localhost:3000/nutricion/health
curl http://localhost:3000/nutricion/api/patients
```

En MySQL:

```sql
SELECT id, full_name, status FROM patients ORDER BY created_at DESC;
SELECT JSON_PRETTY(intake_data) FROM patients WHERE id = 1;
SELECT id, patient_id, version, status, energy_kcal, approved_by FROM nutrition_plans ORDER BY patient_id, version;
```

## cPanel

Subir el contenido de `cpanel-deploy/` a la raíz de la aplicación Node.js de cPanel. Configurar las credenciales reales como variables de entorno de cPanel, usar `app.js` como archivo de inicio, ejecutar **NPM Install**, aplicar las migraciones por phpMyAdmin y reiniciar la aplicación.
