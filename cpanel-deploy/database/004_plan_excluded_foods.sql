-- Alimentos excluidos del plan (alergias, intolerancias u otras indicaciones).
-- Se copia desde la ficha del paciente al guardar el borrador y queda fijo al aprobar.
ALTER TABLE nutrition_plans ADD COLUMN excluded_foods JSON NULL AFTER meal_distribution;
