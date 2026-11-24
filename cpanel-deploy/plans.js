// Planes de alimentación persistentes y versionados por paciente.
// Los valores calculados son propuestas: solo la profesional responsable puede aprobarlos.

import { HttpError } from "./errors.js";
import { normalizePortionPlan } from "./catalog.js";

export { HttpError };

export const PLAN_STATUS = { draft: "Borrador", approved: "Aprobado", replaced: "Reemplazado", discarded: "Descartado" };

const COLUMNS = "id, patient_id, version, status, formula, calculation_inputs, energy_kcal, carbs_pct, protein_pct, fat_pct, carbs_g, protein_g, fat_g, meal_distribution, portion_plan, excluded_foods, preferred_foods, rejected_foods, indications, professional_notes, approved_by, approved_at, created_at, updated_at";
const DECIMALS = ["carbs_pct", "protein_pct", "fat_pct", "carbs_g", "protein_g", "fat_g"];
const MAX_MEALS = 12;
const MAX_FOODS = 50;

const bad = (message) => new HttpError(400, message);
const round1 = (value) => Math.round(value * 10) / 10;

const optionalNumber = (value, label, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${label} debe ser un número entre ${min} y ${max}.`);
  return n;
};

const optionalText = (value, label, max) => {
  const text = String(value ?? "").trim();
  if (text.length > max) throw bad(`${label} no puede superar ${max} caracteres.`);
  return text || null;
};

const parseJson = (value) => (typeof value === "string" ? JSON.parse(value) : value ?? null);

const hydrate = (row) => {
  if (!row) return null;
  const plan = { ...row, calculation_inputs: parseJson(row.calculation_inputs), meal_distribution: parseJson(row.meal_distribution) || [], portion_plan: parseJson(row.portion_plan), excluded_foods: parseJson(row.excluded_foods) || [], preferred_foods: parseJson(row.preferred_foods) || [], rejected_foods: parseJson(row.rejected_foods) || [] };
  for (const key of DECIMALS) plan[key] = plan[key] === null || plan[key] === undefined ? null : Number(plan[key]);
  if (plan.energy_kcal !== null && plan.energy_kcal !== undefined) plan.energy_kcal = Number(plan.energy_kcal);
  return plan;
};

// Lista de alimentos [{ food, type, note }] copiada desde la ficha (acepta `reaction` como alias de `note`).
function normalizeFoodList(raw, label) {
  const items = (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      food: optionalText(item?.food, `Un alimento de ${label}`, 80),
      type: optionalText(item?.type, `El tipo en ${label}`, 40),
      note: optionalText(item?.note ?? item?.reaction, `La observación en ${label}`, 200),
    }))
    .filter((item) => item.food);
  if (items.length > MAX_FOODS) throw bad(`Se permiten como máximo ${MAX_FOODS} ${label}.`);
  return items;
}

// Valida y normaliza los datos editables de un plan. Un borrador puede estar incompleto.
export function normalizePlanInput(input = {}) {
  const energy = optionalNumber(input.energy_kcal, "La energía (kcal/día)", 1, 10000);
  const energyKcal = energy === null ? null : Math.round(energy);

  const pcts = {
    carbs_pct: optionalNumber(input.carbs_pct, "El porcentaje de carbohidratos", 0, 100),
    protein_pct: optionalNumber(input.protein_pct, "El porcentaje de proteínas", 0, 100),
    fat_pct: optionalNumber(input.fat_pct, "El porcentaje de grasas", 0, 100),
  };
  const given = Object.values(pcts).filter((v) => v !== null);
  if (given.length && given.length < 3) throw bad("Completa los tres porcentajes de macronutrientes o déjalos todos vacíos.");
  if (given.length === 3) {
    const sum = given.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.5) throw bad(`Los porcentajes de macronutrientes deben sumar 100% (suman ${round1(sum)}%).`);
  }
  const grams = energyKcal !== null && given.length === 3
    ? { carbs_g: round1((energyKcal * pcts.carbs_pct) / 100 / 4), protein_g: round1((energyKcal * pcts.protein_pct) / 100 / 4), fat_g: round1((energyKcal * pcts.fat_pct) / 100 / 9) }
    : { carbs_g: null, protein_g: null, fat_g: null };

  const rawMeals = Array.isArray(input.meal_distribution) ? input.meal_distribution : [];
  const meals = rawMeals
    .map((meal, index) => ({
      meal: optionalText(meal?.meal, `El nombre del tiempo de comida ${index + 1}`, 80),
      pct: optionalNumber(meal?.pct, `El porcentaje de ${meal?.meal || `la comida ${index + 1}`}`, 0, 100),
      notes: optionalText(meal?.notes, `Las indicaciones de ${meal?.meal || `la comida ${index + 1}`}`, 1000),
    }))
    .filter((meal) => meal.meal || meal.notes);
  if (meals.length > MAX_MEALS) throw bad(`Se permiten como máximo ${MAX_MEALS} tiempos de comida.`);
  if (meals.some((meal) => !meal.meal)) throw bad("Cada tiempo de comida necesita un nombre.");
  if (meals.length && meals.every((meal) => meal.pct !== null)) {
    const sum = meals.reduce((a, meal) => a + meal.pct, 0);
    if (Math.abs(sum - 100) > 1) throw bad(`La distribución por tiempo de comida debe sumar 100% (suma ${round1(sum)}%).`);
  }

  const excludedFoods = normalizeFoodList(input.excluded_foods, "alimentos excluidos");
  const preferredFoods = normalizeFoodList(input.preferred_foods, "alimentos preferidos");
  const rejectedFoods = normalizeFoodList(input.rejected_foods, "alimentos rechazados");

  const ci = input.calculation_inputs && typeof input.calculation_inputs === "object" ? input.calculation_inputs : {};
  const calculationInputs = {
    age_years: optionalNumber(ci.age_years, "La edad", 0, 25),
    sex: optionalText(ci.sex, "El sexo", 40),
    weight_kg: optionalNumber(ci.weight_kg, "El peso", 0, 300),
    height_cm: optionalNumber(ci.height_cm, "La talla", 0, 250),
    bmi: optionalNumber(ci.bmi, "El IMC", 0, 100),
    bmr_kcal: optionalNumber(ci.bmr_kcal, "El gasto energético basal", 0, 10000),
    activity_factor: optionalNumber(ci.activity_factor, "El factor de actividad", 0.5, 3),
    activity_label: optionalText(ci.activity_label, "La actividad física", 80),
    calc_weight_kg: optionalNumber(ci.calc_weight_kg, "El peso para el cálculo", 0, 300),
    protein_g_per_kg: optionalNumber(ci.protein_g_per_kg, "La proteína por kg", 0, 5),
  };

  return {
    formula: optionalText(input.formula, "La fórmula", 180),
    calculation_inputs: calculationInputs,
    energy_kcal: energyKcal,
    ...pcts,
    ...grams,
    meal_distribution: meals,
    portion_plan: normalizePortionPlan(input.portion_plan),
    excluded_foods: excludedFoods,
    preferred_foods: preferredFoods,
    rejected_foods: rejectedFoods,
    indications: optionalText(input.indications, "Las indicaciones", 10000),
    professional_notes: optionalText(input.professional_notes, "Las notas profesionales", 10000),
  };
}

// Busca menciones de alimentos excluidos o rechazados en las indicaciones del plan (sin tildes ni
// mayúsculas, admite plural simple). Una mención puede ser legítima ("sin maní"), por eso solo exige confirmación.
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function findExclusionMentions(plan) {
  const texts = [
    ...(plan.meal_distribution || []).map((meal) => ({ where: meal.meal || "Tiempo de comida", text: `${meal.meal || ""} ${meal.notes || ""}` })),
    { where: "Indicaciones", text: plan.indications || "" },
  ];
  const mentions = [];
  const lists = [["excluido", plan.excluded_foods], ["rechazado", plan.rejected_foods]];
  for (const [kind, list] of lists) {
    for (const item of list || []) {
      const food = normalize(item.food).trim();
      if (!food) continue;
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(food)}(s|es)?(?![a-z0-9])`);
      const places = texts.filter((entry) => pattern.test(normalize(entry.text))).map((entry) => entry.where);
      if (places.length) mentions.push({ food: item.food, kind, places });
    }
  }
  return mentions;
}

const assertApprovable = (plan, approvedBy, confirmExclusions = false) => {
  if (plan.status !== PLAN_STATUS.draft) throw new HttpError(409, "Solo se puede aprobar un plan en borrador.");
  if (!approvedBy) throw bad("Indica el nombre de la profesional que aprueba el plan.");
  if (!plan.energy_kcal) throw bad("Para aprobar el plan registra la energía diaria (kcal/día).");
  if ([plan.carbs_pct, plan.protein_pct, plan.fat_pct].some((v) => v === null || v === undefined)) throw bad("Para aprobar el plan registra la distribución de macronutrientes.");
  if (!plan.meal_distribution?.length) throw bad("Para aprobar el plan registra al menos un tiempo de comida.");
  const mentions = findExclusionMentions(plan);
  if (mentions.length && !confirmExclusions) {
    throw new HttpError(409, `El plan menciona alimentos excluidos o rechazados: ${mentions.map((m) => `${m.food} [${m.kind}] (${m.places.join(", ")})`).join("; ")}. Revisa y confirma antes de aprobar.`);
  }
};

export function createPlanService(pool, demoPatients = []) {
  return pool ? mysqlService(pool) : demoService(demoPatients);
}

function mysqlService(pool) {
  const values = (data) => [data.formula, JSON.stringify(data.calculation_inputs), data.energy_kcal, data.carbs_pct, data.protein_pct, data.fat_pct, data.carbs_g, data.protein_g, data.fat_g, JSON.stringify(data.meal_distribution), data.portion_plan ? JSON.stringify(data.portion_plan) : null, JSON.stringify(data.excluded_foods), JSON.stringify(data.preferred_foods), JSON.stringify(data.rejected_foods), data.indications, data.professional_notes];

  const get = async (id, conn = pool, lock = false) => {
    const [rows] = await conn.execute(`SELECT ${COLUMNS} FROM nutrition_plans WHERE id = ? AND archived_at IS NULL${lock ? " FOR UPDATE" : ""}`, [id]);
    return hydrate(rows[0]);
  };

  const transaction = async (work) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  };

  return {
    async list(patientId) {
      const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM nutrition_plans WHERE patient_id = ? AND archived_at IS NULL ORDER BY version DESC`, [patientId]);
      return rows.map(hydrate);
    },
    get: (id) => get(id),
    async create(patientId, input) {
      const data = normalizePlanInput(input);
      const id = await transaction(async (conn) => {
        const [patients] = await conn.execute("SELECT id FROM patients WHERE id = ? AND archived_at IS NULL FOR UPDATE", [patientId]);
        if (!patients[0]) throw new HttpError(404, "Paciente no encontrado.");
        const [[{ next }]] = await conn.execute("SELECT COALESCE(MAX(version), 0) + 1 AS next FROM nutrition_plans WHERE patient_id = ?", [patientId]);
        const [result] = await conn.execute(
          "INSERT INTO nutrition_plans (patient_id, version, status, formula, calculation_inputs, energy_kcal, carbs_pct, protein_pct, fat_pct, carbs_g, protein_g, fat_g, meal_distribution, portion_plan, excluded_foods, preferred_foods, rejected_foods, indications, professional_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [patientId, next, PLAN_STATUS.draft, ...values(data)],
        );
        await conn.execute("UPDATE patients SET status = 'Plan en borrador' WHERE id = ? AND status = 'Borrador'", [patientId]);
        return result.insertId;
      });
      return get(id);
    },
    async update(id, input) {
      const data = normalizePlanInput(input);
      const current = await get(id);
      if (!current) throw new HttpError(404, "Plan no encontrado.");
      if (current.status !== PLAN_STATUS.draft) throw new HttpError(409, "Solo se pueden editar planes en borrador. Crea una nueva versión a partir de este plan.");
      await pool.execute(
        "UPDATE nutrition_plans SET formula = ?, calculation_inputs = ?, energy_kcal = ?, carbs_pct = ?, protein_pct = ?, fat_pct = ?, carbs_g = ?, protein_g = ?, fat_g = ?, meal_distribution = ?, portion_plan = ?, excluded_foods = ?, preferred_foods = ?, rejected_foods = ?, indications = ?, professional_notes = ? WHERE id = ? AND status = ? AND archived_at IS NULL",
        [...values(data), id, PLAN_STATUS.draft],
      );
      return get(id);
    },
    async approve(id, input) {
      const approvedBy = optionalText(input?.approved_by, "El nombre de quien aprueba", 180);
      await transaction(async (conn) => {
        const plan = await get(id, conn, true);
        if (!plan) throw new HttpError(404, "Plan no encontrado.");
        assertApprovable(plan, approvedBy, input?.confirm_exclusions === true);
        await conn.execute("UPDATE nutrition_plans SET status = ? WHERE patient_id = ? AND status = ? AND id <> ?", [PLAN_STATUS.replaced, plan.patient_id, PLAN_STATUS.approved, id]);
        await conn.execute("UPDATE nutrition_plans SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?", [PLAN_STATUS.approved, approvedBy, id]);
        await conn.execute("UPDATE patients SET status = 'Plan aprobado' WHERE id = ?", [plan.patient_id]);
      });
      return get(id);
    },
    async discard(id) {
      const plan = await get(id);
      if (!plan) throw new HttpError(404, "Plan no encontrado.");
      if (plan.status !== PLAN_STATUS.draft) throw new HttpError(409, "Solo se pueden descartar planes en borrador.");
      await pool.execute("UPDATE nutrition_plans SET status = ?, archived_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?", [PLAN_STATUS.discarded, id, PLAN_STATUS.draft]);
      return { id, status: PLAN_STATUS.discarded };
    },
  };
}

// Modo demostración (sin MySQL): los planes viven en memoria y se pierden al reiniciar.
function demoService(demoPatients) {
  const plans = [];
  let nextId = 1;
  const find = (id) => plans.find((plan) => plan.id === id && !plan.archived_at) || null;
  const copy = (plan) => (plan ? structuredClone(plan) : null);
  const patient = (id) => demoPatients.find((item) => item.id === id) || null;

  return {
    async list(patientId) {
      return plans.filter((plan) => plan.patient_id === patientId && !plan.archived_at).sort((a, b) => b.version - a.version).map(copy);
    },
    async get(id) {
      return copy(find(id));
    },
    async create(patientId, input) {
      const data = normalizePlanInput(input);
      const owner = patient(patientId);
      if (!owner) throw new HttpError(404, "Paciente no encontrado.");
      const version = plans.filter((plan) => plan.patient_id === patientId).reduce((max, plan) => Math.max(max, plan.version), 0) + 1;
      const now = new Date().toISOString();
      const plan = { id: nextId++, patient_id: patientId, version, status: PLAN_STATUS.draft, ...data, approved_by: null, approved_at: null, created_at: now, updated_at: now, archived_at: null };
      plans.push(plan);
      if (owner.status === "Borrador") owner.status = "Plan en borrador";
      return copy(plan);
    },
    async update(id, input) {
      const data = normalizePlanInput(input);
      const plan = find(id);
      if (!plan) throw new HttpError(404, "Plan no encontrado.");
      if (plan.status !== PLAN_STATUS.draft) throw new HttpError(409, "Solo se pueden editar planes en borrador. Crea una nueva versión a partir de este plan.");
      Object.assign(plan, data, { updated_at: new Date().toISOString() });
      return copy(plan);
    },
    async approve(id, input) {
      const approvedBy = optionalText(input?.approved_by, "El nombre de quien aprueba", 180);
      const plan = find(id);
      if (!plan) throw new HttpError(404, "Plan no encontrado.");
      assertApprovable(plan, approvedBy, input?.confirm_exclusions === true);
      plans.filter((other) => other.patient_id === plan.patient_id && other.status === PLAN_STATUS.approved).forEach((other) => { other.status = PLAN_STATUS.replaced; });
      Object.assign(plan, { status: PLAN_STATUS.approved, approved_by: approvedBy, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      const owner = patient(plan.patient_id);
      if (owner) owner.status = "Plan aprobado";
      return copy(plan);
    },
    async discard(id) {
      const plan = find(id);
      if (!plan) throw new HttpError(404, "Plan no encontrado.");
      if (plan.status !== PLAN_STATUS.draft) throw new HttpError(409, "Solo se pueden descartar planes en borrador.");
      Object.assign(plan, { status: PLAN_STATUS.discarded, archived_at: new Date().toISOString() });
      return { id, status: PLAN_STATUS.discarded };
    },
  };
}
