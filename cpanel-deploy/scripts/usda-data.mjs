// Lectura de los CSV de USDA FoodData Central (SR Legacy) y utilidades compartidas por los scripts.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...data] = rows;
  return data.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const NUTRIENTS = { 1008: "kcal", 1003: "protein_g", 1004: "fat_g", 1005: "carbs_g", 1079: "fiber_g", 2000: "sugars_g", 1093: "sodium_mg" };

// Devuelve Map fdc_id -> { fdc_id, description, category, kcal, protein_g, ..., portions: [{ label, grams }] }
export function loadUsda(dir) {
  const read = (name) => parseCsv(readFileSync(join(dir, name), "utf8"));
  const categories = Object.fromEntries(read("food_category.csv").map((c) => [c.id, c.description]));
  const units = Object.fromEntries(read("measure_unit.csv").map((u) => [u.id, u.name]));
  const foods = new Map();
  for (const f of read("food.csv")) {
    foods.set(Number(f.fdc_id), { fdc_id: Number(f.fdc_id), description: f.description.slice(0, 255), category: categories[f.food_category_id] || null, kcal: null, protein_g: null, fat_g: null, carbs_g: null, fiber_g: null, sugars_g: null, sodium_mg: null, portions: [] });
  }
  for (const n of read("food_nutrient.csv")) {
    const key = NUTRIENTS[n.nutrient_id];
    const food = key && foods.get(Number(n.fdc_id));
    if (food && n.amount !== "") food[key] = Number(n.amount);
  }
  for (const p of read("food_portion.csv")) {
    const food = foods.get(Number(p.fdc_id));
    if (!food || !p.gram_weight) continue;
    const unit = units[p.measure_unit_id];
    const label = [p.amount, unit && unit !== "undetermined" ? unit : "", p.modifier, p.portion_description].filter(Boolean).join(" ").trim();
    food.portions.push({ label, grams: Number(p.gram_weight) });
  }
  return foods;
}

export const sqlValue = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
};

export function writeSql(path, statements) {
  writeFileSync(path, `SET NAMES utf8mb4;\n${statements.join(";\n")};\n`, "utf8");
}

export function argValue(name) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
}
