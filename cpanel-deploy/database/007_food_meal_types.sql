-- Tiempos de comida en que se usa habitualmente cada alimento (para armar ejemplos de menú).
-- Valores separados por coma: desayuno, colacion, almuerzo, once, cena. Vacío = cualquier tiempo de comida.
-- Los valores iniciales se cargan con scripts/seed-catalog.mjs (no sobrescribe los editados).
SET NAMES utf8mb4;
ALTER TABLE foods ADD COLUMN meal_types VARCHAR(120) NULL AFTER tags;
