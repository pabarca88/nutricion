# Contexto de trabajo para IA — NutriPediátrica

Lee este archivo completo antes de modificar el proyecto. Su objetivo es permitir continuar el desarrollo desde otro computador después de clonar el repositorio.

## Objetivo del producto

NutriPediátrica es una aplicación web para nutricionistas pediátricas. El flujo actual es:

1. Crear una ficha clínica de un paciente.
2. Registrar antecedentes médico-nutricionales, hábitos, preferencias, exclusiones y antropometría.
3. Consultar o editar posteriormente la ficha.
4. Generar una propuesta inicial de pauta para revisión profesional.

La pauta nunca debe presentarse como una indicación médica definitiva sin revisión de la profesional responsable.

## Aplicación que se debe desarrollar

La aplicación activa para MySQL y cPanel está dentro de:

```text
cpanel-deploy/
```

Archivos principales:

```text
cpanel-deploy/app.js                 API Node.js + conexión MySQL
cpanel-deploy/public/index.html      Interfaz
cpanel-deploy/public/nutri.js        Lógica del formulario y la UI
cpanel-deploy/public/nutri.css       Estilos
cpanel-deploy/database/              Migraciones MySQL ordenadas
cpanel-deploy/.env.example           Variables de entorno de ejemplo
cpanel-deploy/INSTALACION.md         Guía humana de instalación
```

No reemplazar esta aplicación por el starter de Vite/Vinext ubicado fuera de `cpanel-deploy/` sin autorización explícita.

## Instalación desde cero

Requisitos: Git, Node.js 22 o superior y MySQL 8 o superior.

```sh
git clone URL_DEL_REPOSITORIO
cd nutricion-pediatrica/cpanel-deploy
npm install
```

Iniciar MySQL local en macOS con Homebrew, si fuera necesario:

```sh
brew install mysql
brew services start mysql
```

Crear base y usuario local:

```sh
mysql -u root -h 127.0.0.1 -P 3306
```

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

Aplicar todas las migraciones, una vez y en orden:

```sh
mysql -u nutricion_dev -p nutripediatrica_dev < database/001_patients.sql
mysql -u nutricion_dev -p nutripediatrica_dev < database/002_patient_intake.sql
```

Crear el entorno local:

```sh
cp .env.example .env
```

Contenido esperado de `.env` para la instalación de ejemplo:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=nutripediatrica_dev
DB_USER=nutricion_dev
DB_PASSWORD=nutricion_dev_local
APP_BASE_PATH=/nutricion
```

Iniciar la app:

```sh
node --env-file=.env app.js
```

Abrir `http://localhost:3000/nutricion/`.

## Estado actual

- La tabla `patients` guarda identificación, fecha de nacimiento, sexo, peso, talla y estado.
- La columna JSON `intake_data` almacena el resto de las respuestas de la entrevista clínica.
- La interfaz permite crear una ficha y editarla mediante el botón **Abrir ficha** de cada paciente.
- El menú lateral solo contiene funciones disponibles: Inicio y Pacientes.
- El botón Actualizar consulta nuevamente la API de pacientes.
- La propuesta de pauta se genera en el navegador tras guardar la ficha. Es una estimación inicial y todavía no se guarda como una entidad independiente.

## Cálculo de pauta actual

La propuesta actual usa una estimación temporal basada en Schofield por peso para pacientes de 3 a 17 años, sexo, fecha de nacimiento y un factor de actividad provisional. Muestra IMC, energía estimada y una distribución provisional de macros 50% carbohidratos, 20% proteínas y 30% grasas.

No tratar estos parámetros como protocolo clínico definitivo. Antes de producción, la nutricionista debe definir y aprobar:

- Fórmulas y rangos por edad y condición clínica.
- Factores de actividad.
- Reglas de macronutrientes y porciones.
- Curvas de crecimiento y diagnóstico nutricional.
- Manejo de alergias, patologías, suplementos y exclusiones.

## Próximo desarrollo recomendado

Construir un módulo de planes persistentes:

1. Crear una migración nueva, por ejemplo `003_nutrition_plans.sql`.
2. Asociar cada plan a `patients.id`.
3. Guardar fórmula, variables de cálculo, macros, distribución de comidas, indicaciones y estado de revisión.
4. Permitir editar, guardar borrador y aprobar el plan.
5. Mostrar historial de planes por paciente.

No inventar fórmulas médicas ni ocultar que un cálculo requiere validación profesional.

## Convenciones de base de datos

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
node --check public/nutri.js
```

```sh
curl http://localhost:3000/nutricion/health
curl http://localhost:3000/nutricion/api/patients
```

En MySQL:

```sql
SELECT id, full_name, status FROM patients ORDER BY created_at DESC;
SELECT JSON_PRETTY(intake_data) FROM patients WHERE id = 1;
```

## cPanel

Subir el contenido de `cpanel-deploy/` a la raíz de la aplicación Node.js de cPanel. Configurar las credenciales reales como variables de entorno de cPanel, usar `app.js` como archivo de inicio, ejecutar **NPM Install**, aplicar las migraciones por phpMyAdmin y reiniciar la aplicación.
