// Base de alimentos (grupos de intercambio, catálogo, referencia USDA, reglas por edad)
// y generador de la pauta por porciones. Todo valor generado es una propuesta para revisión profesional.
import { HttpError } from "./errors.js";

const bad = (message) => new HttpError(400, message);
const round1 = (value) => Math.round(value * 10) / 10;
const STEP = 0.5;
const DEFAULT_MAX_PORTIONS = 10;
const MACROS = ["kcal", "protein_g", "fat_g", "carbs_g"];
const OBJECTIVE_WEIGHTS = { kcal: 4, protein_g: 1, fat_g: 1, carbs_g: 1 };

const num = (value, label, min, max, { required = false } = {}) => {
  if (value === null || value === undefined || value === "") {
    if (required) throw bad(`${label} es obligatorio.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${label} debe ser un número entre ${min} y ${max}.`);
  return n;
};
const text = (value, label, max, { required = false } = {}) => {
  const s = String(value ?? "").trim();
  if (required && !s) throw bad(`${label} es obligatorio.`);
  if (s.length > max) throw bad(`${label} no puede superar ${max} caracteres.`);
  return s || null;
};
const parseJson = (value) => (typeof value === "string" ? JSON.parse(value) : value ?? null);
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

// ---------- Coincidencia de alimentos (exclusiones, rechazos y preferencias) ----------

export const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const wordPattern = (term) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalize(term))}(s|es)?(?![a-z0-9])`);
const splitList = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

// Un elemento de la ficha ("Leche", "Maní") coincide con un alimento del catálogo si aparece como palabra
// en su nombre, alias o etiquetas (sin tildes ni mayúsculas, plural simple). Un grupo completo solo coincide
// si se escribe su nombre exacto ("Lácteos"), para que "Pescado" o "Huevo" no excluyan todo
// "Carnes, pescados y huevos".
export function foodMatches(food, entry) {
  const term = normalize(entry?.food);
  if (!term) return false;
  if (term === normalize(food.group_name) || term === normalize(food.group_code)) return true;
  const pattern = wordPattern(term);
  return [food.name, ...splitList(food.aliases), ...splitList(food.tags)].some((candidate) => pattern.test(normalize(candidate)));
}

// ---------- Cálculos de porciones ----------

const portionValues = (food) => {
  const factor = Number(food.portion_grams) / 100;
  return {
    kcal: Number(food.kcal_100g) * factor,
    protein_g: Number(food.protein_100g) * factor,
    fat_g: Number(food.fat_100g) * factor,
    carbs_g: Number(food.carbs_100g) * factor,
  };
};
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Porción de referencia del grupo: valores manuales de la profesional o, si faltan, mediana de los alimentos activos.
function groupReference(group, foods) {
  const portions = foods.map(portionValues);
  const computed = Object.fromEntries(MACROS.map((key) => [key, portions.length ? round1(median(portions.map((p) => p[key]))) : null]));
  const manual = { kcal: toNumber(group.ref_kcal), protein_g: toNumber(group.ref_protein_g), fat_g: toNumber(group.ref_fat_g), carbs_g: toNumber(group.ref_carbs_g) };
  const hasManual = MACROS.every((key) => manual[key] !== null);
  return { ref: hasManual ? manual : computed, ref_source: hasManual ? "manual" : portions.length ? "mediana" : "sin datos", computed, manual };
}

const objective = (x, refs, target) => {
  const totals = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  x.forEach((portions, i) => MACROS.forEach((key) => { totals[key] += portions * refs[i][key]; }));
  // La energía es el objetivo principal; la proteína actúa como mínimo (superarla se penaliza poco,
  // por ejemplo cuando las reglas exigen lácteos y carnes).
  let score = 0;
  for (const key of MACROS) {
    let error = (totals[key] - target[key]) / target[key];
    if (key === "protein_g" && error > 0) error *= 0.3;
    score += OBJECTIVE_WEIGHTS[key] * error ** 2;
  }
  // Regularización leve: ante empates, prefiere repartir entre grupos en vez de concentrar porciones.
  return score + 0.0005 * x.reduce((a, v) => a + v * v, 0);
};

// Búsqueda local en pasos de 0,5 porciones dentro de [min, max] de cada grupo.
export function solvePortions(refs, bounds, target) {
  const x = bounds.map((b) => b.min);
  let current = objective(x, refs, target);
  for (let iteration = 0; iteration < 2000; iteration++) {
    let best = null;
    const tryMove = (changes) => {
      if (changes.some(([i, d]) => x[i] + d < bounds[i].min - 1e-9 || x[i] + d > bounds[i].max + 1e-9)) return;
      changes.forEach(([i, d]) => { x[i] += d; });
      const score = objective(x, refs, target);
      changes.forEach(([i, d]) => { x[i] -= d; });
      if (score < current - 1e-12 && (!best || score < best.score)) best = { score, changes };
    };
    for (let i = 0; i < x.length; i++) {
      tryMove([[i, STEP]]);
      tryMove([[i, -STEP]]);
      for (let j = 0; j < x.length; j++) if (i !== j) tryMove([[i, STEP], [j, -STEP]]);
    }
    if (!best) break;
    best.changes.forEach(([i, d]) => { x[i] += d; });
    current = best.score;
  }
  return x.map((value) => Math.round(value * 2) / 2);
}

// Reparte las porciones diarias de un grupo entre los tiempos de comida según su %:
// porciones enteras por resto mayor y, si sobra media porción, al tiempo de comida con mayor déficit.
export function splitByMeals(daily, shares) {
  const whole = Math.floor(daily + 1e-9);
  const half = daily - whole >= STEP - 1e-9;
  const raw = shares.map((share) => whole * share);
  const result = raw.map((value) => Math.floor(value + 1e-9));
  let remaining = whole - result.reduce((a, b) => a + b, 0);
  raw.map((value, index) => ({ index, rest: value - Math.floor(value + 1e-9) }))
    .filter(({ index }) => shares[index] > 0)
    .sort((a, b) => b.rest - a.rest || shares[b.index] - shares[a.index] || a.index - b.index)
    .forEach(({ index }) => { if (remaining > 0) { result[index] += 1; remaining -= 1; } });
  if (half) {
    let best = -1;
    shares.forEach((share, index) => {
      if (share > 0 && (best < 0 || share * daily - result[index] > shares[best] * daily - result[best])) best = index;
    });
    if (best >= 0) result[best] += STEP;
  }
  return result;
}

export function totalsOf(groups) {
  const totals = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  for (const group of groups) MACROS.forEach((key) => { totals[key] += (group.daily || 0) * (group.ref?.[key] || 0); });
  return Object.fromEntries(MACROS.map((key) => [key, round1(totals[key])]));
}

// ---------- Ejemplos de menú ----------

const MEAL_KEYS = ["desayuno", "colacion", "almuerzo", "once", "cena"];
// Tipo de tiempo de comida a partir del nombre libre ("Colación de mañana" → colacion).
export function mealKey(name) {
  const n = normalize(name);
  if (n.includes("desayuno")) return "desayuno";
  if (n.includes("colacion")) return "colacion";
  if (n.includes("almuerzo")) return "almuerzo";
  if (n.includes("once") || n.includes("merienda")) return "once";
  if (n.includes("cena")) return "cena";
  return null;
}
const fitsMeal = (food, key) => !key || !food.meal_types || splitList(food.meal_types).map(normalize).includes(key);

const FRACTIONS = [[0.125, "1/8"], [1 / 6, "1/6"], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"]];
function formatQty(q) {
  const whole = Math.floor(q + 1e-9);
  const rest = q - whole;
  if (rest < 0.02) return String(whole);
  const fraction = FRACTIONS.find(([value]) => Math.abs(value - rest) < 0.02);
  if (fraction) return whole ? `${whole} ${fraction[1]}` : fraction[1];
  return (Math.round(q * 10) / 10).toLocaleString("es-CL");
}
const PLURALS = { taza: "tazas", unidad: "unidades", rebanada: "rebanadas", cucharadita: "cucharaditas", cucharada: "cucharadas", pote: "potes", lamina: "láminas", mitad: "mitades", chica: "chicas", mediana: "medianas", grande: "grandes" };
// "1/2 taza" × 3 porciones → "1 1/2 tazas"
export function amountText(label, portions) {
  const text = String(label || "").trim();
  const match = text.match(/^(\d+)\/(\d+)\s+(.*)$/) || text.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/);
  if (!match) return portions === 1 ? text : `${formatQty(portions)} × ${text}`;
  const base = match.length === 4 ? Number(match[1]) / Number(match[2]) : Number(match[1].replace(",", "."));
  let rest = match.length === 4 ? match[3] : match[2];
  const qty = base * portions;
  if (Math.abs(portions - 1) > 1e-9) rest = rest.replace(/\s*\([^)]*\)/g, "");
  if (qty > 1 + 1e-9) rest = rest.split(" ").map((word, i) => (i < 2 && PLURALS[normalize(word)] ? PLURALS[normalize(word)] : word)).join(" ");
  return `${formatQty(qty)} ${rest}`;
}

// Arma `days` días de ejemplo a partir de las porciones por comida y los alimentos sugeridos de cada grupo.
export function buildExamples(groups, meals, { days = 3, offset = 0 } = {}) {
  const keys = meals.map(mealKey);
  return Array.from({ length: days }, (_, d) => {
    const usedToday = new Set();
    const dayMeals = meals.map((meal, mi) => {
      const items = [];
      groups.forEach((group, gi) => {
        const total = group.per_meal?.[mi] || 0;
        if (total <= 0 || !group.suggestions?.length) return;
        let candidates = group.suggestions.filter((food) => fitsMeal(food, keys[mi]));
        const unusual = !candidates.length;
        if (unusual) candidates = group.suggestions;
        const preferred = candidates.filter((food) => food.preferred);
        const others = candidates.filter((food) => !food.preferred);
        const start = (d + offset) * 3 + mi + gi;
        const pickFrom = (list, taken) => {
          for (let k = 0; k < list.length; k++) {
            const food = list[(start + k) % list.length];
            if (!usedToday.has(food.id) && !taken.has(food.id)) return food;
          }
          return null;
        };
        const choose = (taken) => pickFrom(preferred, taken) || pickFrom(others, taken) || candidates.find((food) => !taken.has(food.id)) || candidates[0];
        const parts = total >= 2 && candidates.length > 1 ? [Math.ceil(total) / 2, total - Math.ceil(total) / 2] : [total];
        const taken = new Set();
        for (const portions of parts) {
          const food = choose(taken);
          taken.add(food.id);
          usedToday.add(food.id);
          items.push({ group: group.name, food_id: food.id, name: food.name, portions, amount: amountText(food.portion_label, portions), grams: round1(portions * (food.portion_grams || 0)), kcal: round1(portions * (food.kcal || 0)), preferred: Boolean(food.preferred), unusual });
        }
      });
      return { meal, items, kcal: round1(items.reduce((a, item) => a + item.kcal, 0)) };
    });
    return { day: d + 1 + offset, meals: dayMeals, kcal: round1(dayMeals.reduce((a, meal) => a + meal.kcal, 0)) };
  });
}

// Reparto por comida considerando solo los tiempos de comida donde el grupo tiene alimentos habituales.
function groupShares(group, meals, shares) {
  const keys = meals.map(mealKey);
  const mask = keys.map((key) => group.suggestions.some((food) => fitsMeal(food, key)));
  const masked = shares.map((share, i) => (mask[i] ? share : 0));
  const total = masked.reduce((a, b) => a + b, 0);
  return total > 0 ? masked.map((share) => share / total) : shares;
}

// ---------- Servicio ----------

export function createCatalogService(pool) {
  const requireDb = () => {
    if (!pool) throw new HttpError(503, "La base de alimentos requiere MySQL configurado.");
  };

  const allGroups = async () => {
    const [rows] = await pool.query("SELECT id, code, name, sort_order, ref_kcal, ref_protein_g, ref_fat_g, ref_carbs_g, notes, active FROM food_groups ORDER BY sort_order, name");
    return rows;
  };
  const allFoods = async ({ includeInactive = false } = {}) => {
    const [rows] = await pool.query(`SELECT f.id, f.group_id, g.name AS group_name, g.code AS group_code, f.name, f.aliases, f.tags, f.meal_types, f.fdc_id, f.source, f.kcal_100g, f.protein_100g, f.fat_100g, f.carbs_100g, f.fiber_100g, f.portion_label, f.portion_grams, f.active, f.updated_at FROM foods f JOIN food_groups g ON g.id = f.group_id ${includeInactive ? "" : "WHERE f.active = 1"} ORDER BY g.sort_order, f.name`);
    return rows.map((row) => {
      const food = { ...row, active: Boolean(row.active) };
      for (const key of ["kcal_100g", "protein_100g", "fat_100g", "carbs_100g", "fiber_100g", "portion_grams"]) food[key] = toNumber(food[key]);
      const portion = portionValues(food);
      food.portion = Object.fromEntries(MACROS.map((key) => [key, round1(portion[key])]));
      return food;
    });
  };

  async function listGroups() {
    requireDb();
    const [groups, foods] = await Promise.all([allGroups(), allFoods()]);
    return groups.map((group) => {
      const own = foods.filter((food) => food.group_id === group.id);
      return { id: group.id, code: group.code, name: group.name, sort_order: group.sort_order, notes: group.notes, active: Boolean(group.active), food_count: own.length, ...groupReference(group, own) };
    });
  }

  async function updateGroup(id, input) {
    requireDb();
    const values = ["ref_kcal", "ref_protein_g", "ref_fat_g", "ref_carbs_g"].map((key) => num(input[key], "El valor de referencia", 0, 2000));
    const given = values.filter((v) => v !== null).length;
    if (given && given < 4) throw bad("Completa kcal, proteínas, grasas y carbohidratos de la porción de referencia, o déjalos todos vacíos para usar la mediana.");
    const name = text(input.name, "El nombre del grupo", 120, { required: true });
    const [result] = await pool.execute("UPDATE food_groups SET name = ?, ref_kcal = ?, ref_protein_g = ?, ref_fat_g = ?, ref_carbs_g = ?, notes = ? WHERE id = ?", [name, ...values, text(input.notes, "Las notas", 2000), id]);
    if (!result.affectedRows) throw new HttpError(404, "Grupo no encontrado.");
    return (await listGroups()).find((group) => group.id === id);
  }

  async function listFoods({ includeInactive = false } = {}) {
    requireDb();
    return allFoods({ includeInactive });
  }

  function mealTypesInput(value) {
    const list = (Array.isArray(value) ? value : splitList(value)).map(normalize).filter(Boolean);
    const invalid = list.filter((item) => !MEAL_KEYS.includes(item));
    if (invalid.length) throw bad(`Tiempos de comida no válidos: ${invalid.join(", ")}. Usa: ${MEAL_KEYS.join(", ")}.`);
    return list.length ? [...new Set(list)].join(", ") : null;
  }

  function foodInput(input) {
    return {
      group_id: num(input.group_id, "El grupo", 1, 1e9, { required: true }),
      name: text(input.name, "El nombre", 160, { required: true }),
      aliases: text(input.aliases, "Los alias", 500),
      tags: text(input.tags, "Las etiquetas", 300),
      meal_types: mealTypesInput(input.meal_types),
      fdc_id: num(input.fdc_id, "El código USDA", 1, 1e9),
      source: text(input.source, "La fuente", 160),
      kcal_100g: num(input.kcal_100g, "Las kcal por 100 g", 0, 1000, { required: true }),
      protein_100g: num(input.protein_100g, "Las proteínas por 100 g", 0, 100, { required: true }),
      fat_100g: num(input.fat_100g, "Las grasas por 100 g", 0, 100, { required: true }),
      carbs_100g: num(input.carbs_100g, "Los carbohidratos por 100 g", 0, 100, { required: true }),
      fiber_100g: num(input.fiber_100g, "La fibra por 100 g", 0, 100),
      portion_label: text(input.portion_label, "La medida casera", 120, { required: true }),
      portion_grams: num(input.portion_grams, "Los gramos de la porción", 0.1, 2000, { required: true }),
      active: input.active === false || input.active === 0 || input.active === "0" ? 0 : 1,
    };
  }
  const FOOD_COLUMNS = ["group_id", "name", "aliases", "tags", "meal_types", "fdc_id", "source", "kcal_100g", "protein_100g", "fat_100g", "carbs_100g", "fiber_100g", "portion_label", "portion_grams", "active"];
  const duplicate = (error) => {
    if (error?.code === "ER_DUP_ENTRY") throw new HttpError(409, "Ya existe un alimento con ese nombre.");
    if (error?.code === "ER_NO_REFERENCED_ROW_2") throw bad("El grupo indicado no existe.");
    throw error;
  };

  async function createFood(input) {
    requireDb();
    const data = foodInput(input);
    const [result] = await pool.execute(`INSERT INTO foods (${FOOD_COLUMNS.join(", ")}) VALUES (${FOOD_COLUMNS.map(() => "?").join(", ")})`, FOOD_COLUMNS.map((key) => data[key])).catch(duplicate);
    return (await allFoods({ includeInactive: true })).find((food) => food.id === result.insertId);
  }

  async function updateFood(id, input) {
    requireDb();
    const data = foodInput(input);
    const [result] = await pool.execute(`UPDATE foods SET ${FOOD_COLUMNS.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`, [...FOOD_COLUMNS.map((key) => data[key]), id]).catch(duplicate);
    if (!result.affectedRows) throw new HttpError(404, "Alimento no encontrado.");
    return (await allFoods({ includeInactive: true })).find((food) => food.id === id);
  }

  async function searchUsda(query) {
    requireDb();
    const words = String(query || "").trim().split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
    if (!words.length) return [];
    const [rows] = await pool.query(
      `SELECT fdc_id, description, category, kcal, protein_g, fat_g, carbs_g, fiber_g, portions FROM usda_foods WHERE ${words.map(() => "description LIKE ?").join(" AND ")} ORDER BY CHAR_LENGTH(description) LIMIT 40`,
      words.map((w) => `%${w}%`),
    );
    return rows.map((row) => ({ ...row, kcal: toNumber(row.kcal), protein_g: toNumber(row.protein_g), fat_g: toNumber(row.fat_g), carbs_g: toNumber(row.carbs_g), fiber_g: toNumber(row.fiber_g), portions: parseJson(row.portions) || [] }));
  }

  async function listRules() {
    requireDb();
    const [rows] = await pool.query("SELECT r.id, r.age_min_years, r.age_max_years, r.group_id, g.code AS group_code, r.min_portions, r.max_portions, r.notes FROM portion_rules r JOIN food_groups g ON g.id = r.group_id ORDER BY r.age_min_years, r.age_max_years, g.sort_order");
    return rows.map((row) => ({ ...row, age_min_years: Number(row.age_min_years), age_max_years: Number(row.age_max_years), min_portions: toNumber(row.min_portions), max_portions: toNumber(row.max_portions) }));
  }

  // Reemplaza todas las reglas (la pantalla las edita como una tabla completa).
  async function saveRules(input) {
    requireDb();
    const rules = (Array.isArray(input?.rules) ? input.rules : []).map((rule) => {
      const ageMin = num(rule.age_min_years, "La edad mínima", 0, 25, { required: true });
      const ageMax = num(rule.age_max_years, "La edad máxima", 0, 25, { required: true });
      if (ageMax < ageMin) throw bad("La edad máxima debe ser mayor o igual que la mínima.");
      const min = num(rule.min_portions, "El mínimo de porciones", 0, 30);
      const max = num(rule.max_portions, "El máximo de porciones", 0, 30);
      if (min !== null && max !== null && max < min) throw bad("El máximo de porciones debe ser mayor o igual que el mínimo.");
      return [ageMin, ageMax, num(rule.group_id, "El grupo", 1, 1e9, { required: true }), min, max, text(rule.notes, "Las notas", 300)];
    }).filter(([, , , min, max]) => min !== null || max !== null);
    const ranges = new Map();
    for (const [min, max] of rules) ranges.set(`${min}-${max}`, [min, max]);
    const list = [...ranges.values()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < list.length; i++) if (list[i][0] <= list[i - 1][1]) throw bad(`Los tramos de edad ${list[i - 1][0]}–${list[i - 1][1]} y ${list[i][0]}–${list[i][1]} se superponen.`);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM portion_rules");
      if (rules.length) await conn.query("INSERT INTO portion_rules (age_min_years, age_max_years, group_id, min_portions, max_portions, notes) VALUES ?", [rules]);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    return listRules();
  }

  // Genera la pauta por porciones: porciones diarias por grupo, reparto por tiempo de comida y alimentos sugeridos.
  async function generatePortionPlan(input) {
    requireDb();
    const energy = num(input.energy_kcal, "La energía (kcal/día)", 100, 10000, { required: true });
    const pcts = ["carbs_pct", "protein_pct", "fat_pct"].map((key, i) => num(input[key], ["El % de carbohidratos", "El % de proteínas", "El % de grasas"][i], 0, 100, { required: true }));
    if (Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) > 0.5) throw bad("Los porcentajes de macronutrientes deben sumar 100%.");
    const target = { kcal: energy, carbs_g: (energy * pcts[0]) / 100 / 4, protein_g: (energy * pcts[1]) / 100 / 4, fat_g: (energy * pcts[2]) / 100 / 9 };
    const age = num(input.age_years, "La edad", 0, 25);
    const lists = (key) => (Array.isArray(input[key]) ? input[key] : []).filter((item) => item && item.food);
    const excluded = lists("excluded_foods");
    const rejected = lists("rejected_foods");
    const preferred = lists("preferred_foods");

    const mealsInput = (Array.isArray(input.meals) ? input.meals : []).map((meal) => ({ meal: String(meal?.meal || "").trim().slice(0, 80), pct: meal?.pct === null || meal?.pct === "" || meal?.pct === undefined ? null : Number(meal.pct) })).filter((meal) => meal.meal);
    const meals = mealsInput.length ? mealsInput : [{ meal: "Total diario", pct: 100 }];
    const pctsGiven = meals.every((meal) => Number.isFinite(meal.pct) && meal.pct >= 0) && Math.abs(meals.reduce((a, m) => a + m.pct, 0) - 100) <= 1;
    const shares = pctsGiven ? meals.map((meal) => meal.pct / 100) : meals.map(() => 1 / meals.length);

    const [groups, foods, rules] = await Promise.all([listGroups(), allFoods(), listRules()]);
    const ageRules = age === null ? [] : rules.filter((rule) => age >= rule.age_min_years && age <= rule.age_max_years);
    const warnings = [];
    if (age === null) warnings.push("No se conoce la edad del paciente: no se aplicaron reglas de porciones por edad.");
    else if (!ageRules.length) warnings.push(`No hay reglas de porciones para ${age} años. La distribución es solo matemática: configura mínimos y máximos por grupo en Base de alimentos → Reglas por edad.`);
    if (!pctsGiven) warnings.push("Los tiempos de comida no tienen % de energía que sumen 100%: las porciones se repartieron en partes iguales.");

    const usable = [];
    for (const group of groups.filter((g) => g.active)) {
      const own = foods.filter((food) => food.group_id === group.id);
      const isExcluded = (food) => excluded.some((entry) => foodMatches(food, entry));
      const isRejected = (food) => rejected.some((entry) => foodMatches(food, entry));
      const allowed = own.filter((food) => !isExcluded(food));
      const suggestions = allowed.filter((food) => !isRejected(food))
        .map((food) => ({ id: food.id, name: food.name, portion_label: food.portion_label, portion_grams: food.portion_grams, kcal: food.portion.kcal, meal_types: food.meal_types, preferred: preferred.some((entry) => foodMatches(food, entry)) }))
        .sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name, "es"));
      const rule = ageRules.find((r) => r.group_id === group.id);
      let min = rule?.min_portions ?? 0;
      let max = rule?.max_portions ?? DEFAULT_MAX_PORTIONS;
      if (group.ref_source === "sin datos") {
        if (min > 0) warnings.push(`${group.name}: la regla pide ${min} porciones pero el grupo no tiene alimentos en el catálogo.`);
        continue;
      }
      if (!suggestions.length) {
        if (min > 0) warnings.push(`${group.name}: todos sus alimentos están excluidos o rechazados para este paciente, pero la regla pide un mínimo de ${min} porciones. Revisa el reemplazo.`);
        else if (own.length) warnings.push(`${group.name}: se omitió porque todos sus alimentos están excluidos o rechazados para este paciente.`);
        min = 0;
        max = 0;
      }
      usable.push({
        group_id: group.id, code: group.code, name: group.name, ref: group.ref, ref_source: group.ref_source, min, max,
        suggestions,
        excluded_foods: own.filter(isExcluded).map((food) => food.name),
        rejected_foods: allowed.filter(isRejected).map((food) => food.name),
      });
    }
    if (!usable.length) throw bad("El catálogo no tiene alimentos activos. Carga la base de alimentos antes de generar la pauta.");

    const daily = solvePortions(usable.map((g) => g.ref), usable.map((g) => ({ min: g.min, max: g.max })), target);
    const planGroups = usable.map((group, i) => ({ ...group, daily: daily[i], per_meal: splitByMeals(daily[i], groupShares(group, meals.map((m) => m.meal), shares)) }));
    const totals = totalsOf(planGroups);
    const deviation = Math.abs(totals.kcal - energy) / energy;
    if (deviation > 0.1) warnings.push(`La energía de la pauta (${totals.kcal} kcal) difiere más de 10% del objetivo (${energy} kcal) con las reglas actuales.`);
    if (groups.some((g) => g.active && g.ref_source === "mediana")) warnings.push("Las porciones de referencia de los grupos se calcularon como mediana de los alimentos del catálogo (USDA). Revísalas en Base de alimentos.");

    return {
      method: "Porciones de intercambio por grupo · catálogo USDA FoodData Central",
      generated_at: new Date().toISOString(),
      age_years: age,
      rule_range: ageRules.length ? `${ageRules[0].age_min_years}–${ageRules[0].age_max_years} años` : null,
      target: Object.fromEntries(MACROS.map((key) => [key, round1(target[key])])),
      meals: meals.map((meal) => meal.meal),
      groups: planGroups,
      totals,
      warnings,
      examples: buildExamples(planGroups, meals.map((meal) => meal.meal)),
    };
  }

  // Recalcula los ejemplos de una pauta ya editada (no requiere base de datos).
  function generateExamples(input) {
    const plan = normalizePortionPlan(input?.portion_plan);
    if (!plan || !plan.groups.length) throw bad("Primero genera la pauta por porciones.");
    const offset = num(input.offset, "El desplazamiento", 0, 1000) ?? 0;
    return buildExamples(plan.groups, plan.meals, { offset });
  }

  return { listGroups, updateGroup, listFoods, createFood, updateFood, searchUsda, listRules, saveRules, generatePortionPlan, generateExamples };
}

// Valida la pauta por porciones guardada en un plan (estructura generada arriba y editada en la interfaz).
export function normalizePortionPlan(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) throw bad("La pauta por porciones no tiene un formato válido.");
  const meals = (Array.isArray(value.meals) ? value.meals : []).slice(0, 12).map((meal) => String(meal ?? "").slice(0, 80));
  const refOf = (ref) => Object.fromEntries(MACROS.map((key) => [key, num(ref?.[key], "El valor de referencia", 0, 5000) ?? 0]));
  const groups = (Array.isArray(value.groups) ? value.groups : []).slice(0, 30).map((group) => {
    const perMeal = meals.map((_, i) => num(group?.per_meal?.[i], "Las porciones por comida", 0, 30) ?? 0);
    return {
      group_id: num(group?.group_id, "El grupo", 0, 1e9),
      code: String(group?.code ?? "").slice(0, 40),
      name: String(group?.name ?? "").slice(0, 120),
      ref: refOf(group?.ref),
      ref_source: String(group?.ref_source ?? "").slice(0, 20),
      min: num(group?.min, "El mínimo", 0, 30) ?? 0,
      max: num(group?.max, "El máximo", 0, 30) ?? 0,
      daily: round1(perMeal.reduce((a, b) => a + b, 0)),
      per_meal: perMeal,
      suggestions: (Array.isArray(group?.suggestions) ? group.suggestions : []).slice(0, 60).map((s) => ({ id: num(s?.id, "El alimento", 0, 1e9), name: String(s?.name ?? "").slice(0, 160), portion_label: String(s?.portion_label ?? "").slice(0, 120), portion_grams: num(s?.portion_grams, "Los gramos", 0, 5000), kcal: num(s?.kcal, "Las kcal", 0, 5000), meal_types: s?.meal_types ? String(s.meal_types).slice(0, 120) : null, preferred: Boolean(s?.preferred) })),
      excluded_foods: (Array.isArray(group?.excluded_foods) ? group.excluded_foods : []).slice(0, 60).map((s) => String(s).slice(0, 160)),
      rejected_foods: (Array.isArray(group?.rejected_foods) ? group.rejected_foods : []).slice(0, 60).map((s) => String(s).slice(0, 160)),
    };
  });
  return {
    method: String(value.method ?? "").slice(0, 200),
    generated_at: String(value.generated_at ?? "").slice(0, 40),
    age_years: num(value.age_years, "La edad", 0, 25),
    rule_range: value.rule_range ? String(value.rule_range).slice(0, 40) : null,
    target: refOf(value.target),
    meals,
    groups,
    totals: totalsOf(groups),
    warnings: (Array.isArray(value.warnings) ? value.warnings : []).slice(0, 20).map((w) => String(w).slice(0, 400)),
    examples: (Array.isArray(value.examples) ? value.examples : []).slice(0, 7).map((day) => ({
      day: num(day?.day, "El día", 0, 1000) ?? 0,
      kcal: num(day?.kcal, "Las kcal", 0, 20000) ?? 0,
      meals: (Array.isArray(day?.meals) ? day.meals : []).slice(0, 12).map((meal) => ({
        meal: String(meal?.meal ?? "").slice(0, 80),
        kcal: num(meal?.kcal, "Las kcal", 0, 20000) ?? 0,
        items: (Array.isArray(meal?.items) ? meal.items : []).slice(0, 40).map((item) => ({
          group: String(item?.group ?? "").slice(0, 120),
          food_id: num(item?.food_id, "El alimento", 0, 1e9),
          name: String(item?.name ?? "").slice(0, 160),
          portions: num(item?.portions, "Las porciones", 0, 30) ?? 0,
          amount: String(item?.amount ?? "").slice(0, 160),
          grams: num(item?.grams, "Los gramos", 0, 20000) ?? 0,
          kcal: num(item?.kcal, "Las kcal", 0, 20000) ?? 0,
          preferred: Boolean(item?.preferred),
          unusual: Boolean(item?.unusual),
        })),
      })),
    })),
  };
}
