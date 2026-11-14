# Instalación local

Esta guía permite descargar el proyecto desde GitHub y levantar una copia local con MySQL.

## Requisitos

- Node.js 22 o superior
- MySQL 8 o superior en ejecución
- Git

En macOS, MySQL puede instalarse con Homebrew:

```sh
brew install mysql
brew services start mysql
```

## 1. Descargar el proyecto

```sh
git clone URL_DEL_REPOSITORIO
cd nutricion-pediatrica/cpanel-deploy
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
```

La contraseña de ejemplo es `nutricion_dev_local`.

## 4. Configurar el entorno local

```sh
cp .env.example .env
```

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

Sube el contenido de `cpanel-deploy` a la raíz configurada para la aplicación Node.js. Crea la base y ejecuta las mismas migraciones desde phpMyAdmin. Configura las variables de entorno reales en cPanel, usa `app.js` como archivo de inicio, ejecuta **NPM Install** y reinicia la aplicación.
