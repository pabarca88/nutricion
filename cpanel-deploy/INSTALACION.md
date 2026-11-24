# Instalación local

Esta guía permite descargar el proyecto desde GitHub y levantar una copia local con MySQL.

## Requisitos

- Node.js 22 o superior
- MySQL 8 o superior en ejecución
- Git

En Windows, usa el instalador oficial de MySQL (MySQL Installer); el cliente queda en `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`. En macOS, MySQL puede instalarse con Homebrew:

```sh
brew install mysql
brew services start mysql
```

## 1. Descargar el proyecto

```sh
git clone URL_DEL_REPOSITORIO
cd nutricion/cpanel-deploy
npm install
```

## 2. Crear la base de datos local

Abre MySQL con un usuario administrador:

```sh
mysql -u root -h 127.0.0.1 -P 3306
```

Ejecuta lo siguiente. Cambia la contraseña si el equipo se usará por más de una persona.

```sql
CREATE DATABASE nutripediatrica_dev
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'nutricion_dev'@'localhost'
  IDENTIFIED BY 'nutricion_dev_local';

GRANT ALL PRIVILEGES ON nutripediatrica_dev.* TO 'nutricion_dev'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3. Aplicar la estructura de la base de datos

Desde la carpeta `cpanel-deploy`, ejecuta las migraciones en orden:

```sh
mysql -u nutricion_dev -p nutripediatrica_dev < database/001_patients.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/002_patient_intake.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/003_nutrition_plans.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/004_plan_excluded_foods.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/005_plan_food_preferences.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/006_food_catalog.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/007_food_meal_types.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/008_patient_measurements.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/009_patient_milestones.sql
```

En una base nueva, `002_patient_intake.sql` termina con `ERROR 1060: Duplicate column name 'intake_data'`. Es esperado: la versión actual de `001_patients.sql` ya crea esa columna; la 002 solo existe para bases creadas con la versión antigua de la 001. Continúa con las siguientes (003 en adelante).

La contraseña de ejemplo es `nutricion_dev_local`.

## 3b. Cargar la base de alimentos

La pauta por porciones usa un catálogo de alimentos con nutrientes de **USDA FoodData Central, SR Legacy** (dominio público, CC0). Los datos ya vienen en el repositorio; impórtalos después de las migraciones:

```sh
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/seeds/usda_foods.sql
mysql --default-character-set=utf8mb4 -u nutricion_dev -p nutripediatrica_dev < database/seeds/catalogo.sql
```

Se pueden repetir sin duplicar datos (el catálogo no sobrescribe alimentos ya editados). En Windows usa siempre `--default-character-set=utf8mb4` para que las tildes se guarden bien.

Para regenerarlos desde los CSV oficiales (https://fdc.nal.usda.gov/download-datasets, archivo `FoodData_Central_sr_legacy_food_csv_2018-04.zip`), usa `scripts/import-usda.mjs` y `scripts/seed-catalog.mjs` con la opción `--sql`, o sin ella para cargar directo con `node --env-file=.env`.

## 4. Configurar el entorno local

```sh
cp .env.example .env
```

En PowerShell: `Copy-Item .env.example .env`.

El archivo `.env` queda solo en el computador local. No debe subirse a GitHub. Para la configuración anterior, usa:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=nutripediatrica_dev
DB_USER=nutricion_dev
DB_PASSWORD=nutricion_dev_local
APP_BASE_PATH=/nutricion
```

## 5. Iniciar la aplicación

```sh
node --env-file=.env app.js
```

Abre `http://localhost:3000/nutricion/`.

Para comprobar la conexión, abre `http://localhost:3000/nutricion/health`. Debe indicar que la base de datos está configurada.

## Agregar cambios de base de datos

No se sube una copia de la base de datos ni fichas de pacientes al repositorio. Cuando cambie la estructura, crea un nuevo archivo SQL numerado en `database/`, por ejemplo `003_plans.sql`, y aplícalo una sola vez en cada ambiente.

Los archivos `database/*.sql` sí se suben a GitHub. Los archivos `.env`, `node_modules` y cualquier respaldo o exportación con datos reales no.

## Despliegue en cPanel

Sube el contenido de `cpanel-deploy` a la raíz configurada para la aplicación Node.js. Crea la base y ejecuta las mismas migraciones desde phpMyAdmin (Importar). Para la base de alimentos, importa los archivos de `database/seeds/`. Importa primero `database/seeds/usda_foods.sql` y luego `database/seeds/catalogo.sql`. Configura las variables de entorno reales en cPanel, usa `app.js` como archivo de inicio, ejecuta **NPM Install** y reinicia la aplicación.

## Caso de prueba ficticio

Con la app en ejecución, `node scripts/seed-demo.mjs` crea el paciente ficticio "CASO DE PRUEBA - Sofía Ficticia" con ficha inicial y un año de hitos de seguimiento. No contiene datos reales.
