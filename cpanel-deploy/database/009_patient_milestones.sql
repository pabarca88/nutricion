-- Hitos de seguimiento (registro clínico complementario a la ficha inicial).
-- Los controles de medición pasan a ser hitos: además de las mediciones, cada hito guarda
--   updates: solo los datos de estado de la ficha que cambiaron (alergias, hábitos, diagnóstico, etc.)
--   record:  datos propios de la atención (evolución, recordatorio 24 h, indicaciones, acuerdos, próximo control).
-- El estado actual del paciente = ficha inicial + updates de los hitos en orden cronológico.
SET NAMES utf8mb4;
RENAME TABLE patient_measurements TO patient_milestones;
ALTER TABLE patient_milestones
  ADD COLUMN milestone_type VARCHAR(40) NOT NULL DEFAULT 'Control nutricional' AFTER measured_at,
  ADD COLUMN attended_by VARCHAR(180) NULL AFTER milestone_type,
  ADD COLUMN updates JSON NULL AFTER notes,
  ADD COLUMN record JSON NULL AFTER updates;
