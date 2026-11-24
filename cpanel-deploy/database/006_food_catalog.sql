-- Base de alimentos para la pauta por porciones de intercambio.
-- Fuente de nutrientes: USDA FoodData Central, SR Legacy (abril 2018), dominio público (CC0).
-- Los datos se cargan con scripts/import-usda.mjs y scripts/seed-catalog.mjs (ver INSTALACION.md).
SET NAMES utf8mb4;

-- Referencia completa de USDA (inglés), valores por 100 g. Se usa para buscar y agregar alimentos al catálogo.
CREATE TABLE IF NOT EXISTS usda_foods (
  fdc_id INT UNSIGNED PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  category VARCHAR(120) NULL,
  kcal DECIMAL(7,2) NULL,
  protein_g DECIMAL(7,2) NULL,
  fat_g DECIMAL(7,2) NULL,
  carbs_g DECIMAL(7,2) NULL,
  fiber_g DECIMAL(7,2) NULL,
  sugars_g DECIMAL(7,2) NULL,
  sodium_mg DECIMAL(8,2) NULL,
  portions JSON NULL,
  KEY idx_usda_foods_description (description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Grupos de intercambio. ref_* son valores por porción definidos por la profesional;
-- si quedan vacíos, la porción de referencia se calcula como la mediana de los alimentos activos del grupo.
CREATE TABLE IF NOT EXISTS food_groups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  ref_kcal DECIMAL(6,1) NULL,
  ref_protein_g DECIMAL(5,1) NULL,
  ref_fat_g DECIMAL(5,1) NULL,
  ref_carbs_g DECIMAL(5,1) NULL,
  notes TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_food_groups_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO food_groups (code, name, sort_order) VALUES
  ('cereales', 'Cereales, papas y legumbres frescas', 10),
  ('verduras', 'Verduras', 20),
  ('frutas', 'Frutas', 30),
  ('lacteos', 'Lácteos', 40),
  ('proteinas', 'Carnes, pescados y huevos', 50),
  ('leguminosas', 'Leguminosas secas', 60),
  ('grasas', 'Aceites y grasas', 70),
  ('lipidos', 'Alimentos ricos en lípidos', 80),
  ('azucares', 'Azúcares', 90);

-- Catálogo en español. Los nutrientes por 100 g se copian desde USDA al agregar el alimento y pueden corregirse.
-- tags: palabras clave separadas por coma para exclusiones (ej.: "leche, lactosa", "gluten, trigo").
CREATE TABLE IF NOT EXISTS foods (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  aliases VARCHAR(500) NULL,
  tags VARCHAR(300) NULL,
  fdc_id INT UNSIGNED NULL,
  source VARCHAR(160) NULL,
  kcal_100g DECIMAL(7,2) NOT NULL,
  protein_100g DECIMAL(7,2) NOT NULL,
  fat_100g DECIMAL(7,2) NOT NULL,
  carbs_100g DECIMAL(7,2) NOT NULL,
  fiber_100g DECIMAL(7,2) NULL,
  portion_label VARCHAR(120) NOT NULL,
  portion_grams DECIMAL(7,1) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_foods_name (name),
  KEY idx_foods_group (group_id, active),
  CONSTRAINT fk_foods_group FOREIGN KEY (group_id) REFERENCES food_groups (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reglas de porciones diarias por grupo y tramo de edad (años, inclusive). Las define la profesional.
CREATE TABLE IF NOT EXISTS portion_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  age_min_years DECIMAL(4,1) NOT NULL,
  age_max_years DECIMAL(4,1) NOT NULL,
  group_id INT UNSIGNED NOT NULL,
  min_portions DECIMAL(4,1) NULL,
  max_portions DECIMAL(4,1) NULL,
  notes VARCHAR(300) NULL,
  UNIQUE KEY uq_portion_rules (age_min_years, age_max_years, group_id),
  CONSTRAINT fk_portion_rules_group FOREIGN KEY (group_id) REFERENCES food_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pauta por porciones generada/editada en el plan.
ALTER TABLE nutrition_plans ADD COLUMN portion_plan JSON NULL AFTER meal_distribution;
