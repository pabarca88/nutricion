// Carga el catálogo inicial (database/seeds/catalog-seed.json) en la tabla foods,
// tomando los nutrientes por 100 g desde los CSV de USDA. No sobrescribe alimentos ya existentes (mismo nombre);
// solo completa meal_types si está vacío.
//
// Local:  node --env-file=.env scripts/seed-catalog.mjs <carpeta-csv-usda>
// cPanel: node scripts/seed-catalog.mjs <carpeta-csv-usda> --sql catalogo.sql
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { argValue, loadUsda, sqlValue, writeSql } from "./usda-data.mjs";

const dir = process.argv[2];
if (!dir || dir.startsWith("--")) {
  console.error("Uso: node scripts/seed-catalog.mjs <carpeta-csv-usda> [--sql archivo.sql]");
  process.exit(1);
}
const seed = JSON.parse(readFileSync(new URL("../database/seeds/catalog-seed.json", import.meta.url), "utf8"));
const usda = loadUsda(dir);

const rows = seed.foods.map((item) => {
  const ref = usda.get(item.fdc_id);
  if (!ref) throw new Error(`No se encontró fdc_id ${item.fdc_id} (${item.name}) en los CSV de USDA.`);
  for (const key of ["kcal", "protein_g", "fat_g", "carbs_g"]) {
    if (ref[key] === null) throw new Error(`USDA ${item.fdc_id} (${item.name}) no tiene ${key}.`);
  }
  return {
    group: item.group,
    values: [item.name, item.aliases || null, item.tags || null, item.meals || null, item.fdc_id, `USDA FDC SR Legacy ${item.fdc_id}: ${ref.description}`.slice(0, 160), ref.kcal, ref.protein_g, ref.fat_g, ref.carbs_g, ref.fiber_g, item.portion_label, item.portion_grams],
  };
});
const insert = "INSERT INTO foods (group_id, name, aliases, tags, meal_types, fdc_id, source, kcal_100g, protein_100g, fat_100g, carbs_100g, fiber_100g, portion_label, portion_grams) SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM food_groups WHERE code = ? ON DUPLICATE KEY UPDATE meal_types = COALESCE(foods.meal_types, VALUES(meal_types))";

const sqlPath = argValue("--sql");
if (sqlPath) {
  const statements = rows.map((r) => {
    let i = 0;
    const params = [...r.values, r.group];
    return insert.replace(/\?/g, () => sqlValue(params[i++]));
  });
  writeSql(sqlPath, statements);
  console.log(`Archivo SQL generado: ${sqlPath} (${rows.length} alimentos).`);
} else {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) {
    console.error("Faltan variables DB_* (ejecuta con node --env-file=.env) o usa --sql.");
    process.exit(1);
  }
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const counts = async () => (await conn.query("SELECT COUNT(*) AS total, SUM(meal_types IS NULL) AS pending FROM foods"))[0][0];
  const before = await counts();
  for (const r of rows) await conn.execute(insert, [...r.values, r.group]);
  const after = await counts();
  await conn.end();
  const added = Number(after.total) - Number(before.total);
  console.log(`Catálogo: ${added} alimentos agregados, ${rows.length - added} ya existían; ${Math.max(0, Number(before.pending || 0) - Number(after.pending || 0))} con tiempos de comida completados.`);
}
