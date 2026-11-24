// Importa USDA FoodData Central (SR Legacy, CSV) a la tabla usda_foods.
//
// Local (usa las variables de .env):
//   node --env-file=.env scripts/import-usda.mjs <carpeta-csv>
// Para cPanel/phpMyAdmin (genera un archivo SQL en vez de conectarse):
//   node scripts/import-usda.mjs <carpeta-csv> --sql usda_foods.sql
//
// Descarga: https://fdc.nal.usda.gov/download-datasets → "SR Legacy" (CSV). Datos de dominio público (CC0).
import mysql from "mysql2/promise";
import { argValue, loadUsda, sqlValue, writeSql } from "./usda-data.mjs";

const dir = process.argv[2];
if (!dir || dir.startsWith("--")) {
  console.error("Uso: node scripts/import-usda.mjs <carpeta-csv> [--sql archivo.sql]");
  process.exit(1);
}
const foods = [...loadUsda(dir).values()];
const columns = ["fdc_id", "description", "category", "kcal", "protein_g", "fat_g", "carbs_g", "fiber_g", "sugars_g", "sodium_mg", "portions"];
const row = (f) => [f.fdc_id, f.description, f.category, f.kcal, f.protein_g, f.fat_g, f.carbs_g, f.fiber_g, f.sugars_g, f.sodium_mg, JSON.stringify(f.portions)];
const update = columns.slice(1).map((c) => `${c} = VALUES(${c})`).join(", ");
const BATCH = 400;

const sqlPath = argValue("--sql");
if (sqlPath) {
  const statements = [];
  for (let i = 0; i < foods.length; i += BATCH) {
    const values = foods.slice(i, i + BATCH).map((f) => `(${row(f).map(sqlValue).join(", ")})`).join(",\n");
    statements.push(`INSERT INTO usda_foods (${columns.join(", ")}) VALUES\n${values}\nON DUPLICATE KEY UPDATE ${update}`);
  }
  writeSql(sqlPath, statements);
  console.log(`Archivo SQL generado: ${sqlPath} (${foods.length} alimentos).`);
} else {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) {
    console.error("Faltan variables DB_* (ejecuta con node --env-file=.env) o usa --sql.");
    process.exit(1);
  }
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  for (let i = 0; i < foods.length; i += BATCH) {
    const batch = foods.slice(i, i + BATCH);
    await conn.query(`INSERT INTO usda_foods (${columns.join(", ")}) VALUES ? ON DUPLICATE KEY UPDATE ${update}`, [batch.map(row)]);
  }
  await conn.end();
  console.log(`Importados ${foods.length} alimentos de USDA en usda_foods.`);
}
