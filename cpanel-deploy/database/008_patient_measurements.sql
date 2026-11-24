-- Controles de medición (seguimiento). La ficha inicial (patients.weight_kg / height_cm e intake_data)
-- queda como línea base; cada control agrega una medición fechada.
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS patient_measurements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL,
  measured_at DATE NOT NULL,
  weight_kg DECIMAL(5,2) NULL,
  height_cm DECIMAL(5,2) NULL,
  waist_cm DECIMAL(5,1) NULL,
  head_cm DECIMAL(5,1) NULL,
  blood_pressure VARCHAR(20) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  KEY idx_patient_measurements (patient_id, measured_at),
  CONSTRAINT fk_patient_measurements_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
