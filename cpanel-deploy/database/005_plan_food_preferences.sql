-- Alimentos preferidos y rechazados del paciente, copiados desde la ficha al plan.
-- Igual que excluded_foods: un borrador usa la lista vigente de la ficha; un plan aprobado conserva la suya.
ALTER TABLE nutrition_plans
  ADD COLUMN preferred_foods JSON NULL AFTER excluded_foods,
  ADD COLUMN rejected_foods JSON NULL AFTER preferred_foods;
