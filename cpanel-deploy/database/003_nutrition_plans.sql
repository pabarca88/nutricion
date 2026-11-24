-- Planes de alimentación persistentes, versionados por paciente.
-- Estados: Borrador (editable), Aprobado (vigente, de solo lectura),
-- Reemplazado (aprobado anterior) y Descartado (borrador archivado).
CREATE TABLE IF NOT EXISTS nutrition_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Borrador',
  formula VARCHAR(180) NULL,
  calculation_inputs JSON NULL,
  energy_kcal INT UNSIGNED NULL,
  carbs_pct DECIMAL(5,2) NULL,
  protein_pct DECIMAL(5,2) NULL,
  fat_pct DECIMAL(5,2) NULL,
  carbs_g DECIMAL(6,1) NULL,
  protein_g DECIMAL(6,1) NULL,
  fat_g DECIMAL(6,1) NULL,
  meal_distribution JSON NULL,
  indications TEXT NULL,
  professional_notes TEXT NULL,
  approved_by VARCHAR(180) NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  UNIQUE KEY uq_nutrition_plans_version (patient_id, version),
  KEY idx_nutrition_plans_status (patient_id, status),
  CONSTRAINT fk_nutrition_plans_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
