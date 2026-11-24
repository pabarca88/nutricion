// Hitos de seguimiento: registro clínico complementario a la ficha inicial.
// Cada hito guarda mediciones, solo los datos de estado que cambiaron (updates) y los datos de la atención (record).
// Estado actual = ficha inicial + updates de los hitos en orden cronológico.
import { HttpError } from "./errors.js";

const bad = (message) => new HttpError(400, message);

export const MILESTONE_TYPES = ["Control nutricional", "Control telefónico / remoto", "Resultado de exámenes", "Interconsulta", "Otro"];

// Datos de estado de la ficha que un hito puede actualizar (persisten hasta un nuevo cambio).
export const STATE_KEYS = [
  "conditions", "conditions_detail", "gi_symptoms", "gi_notes", "medication_use", "medications", "supplement_use", "supplements",
  "allergies", "food_allergens", "allergies_detail", "hospitalizations", "family_history", "family_notes",
  "meals_per_day", "meal_times", "meal_locations", "food_preparer", "frequency", "rejected_groups", "favorite_foods", "rejected_foods", "current_diet", "diet_restrictions",
  "appetite", "meal_behavior", "hunger_satiety", "water_ml", "other_liquids", "physical_activity", "activity_type", "activity_days", "sleep_hours", "screen_time",
  "growth_curve", "nutritional_diagnosis",
  "intervention_goals", "diet_plan_type", "indicated_meal_times", "snacks_needed", "supplementation_needed", "restriction_needed", "consistency_needed", "weekly_menu_needed", "school_guidance_needed", "plan_considerations",
];
// Datos propios de cada atención (se registran nuevos en cada hito).
export const VISIT_KEYS = [
  "evolution", "breakfast", "morning_snack", "lunch", "afternoon_snack", "once", "dinner", "night_snack", "added_foods",
  "physical_exam", "recent_tests", "tests", "clinical_indications", "education", "agreements", "next_control_goals", "reevaluate", "next_control_date",
];

const COLUMNS = "id, patient_id, DATE_FORMAT(measured_at, '%Y-%m-%d') AS measured_at, milestone_type, attended_by, weight_kg, height_cm, waist_cm, head_cm, blood_pressure, notes, updates, record, created_at, updated_at";
const NUMERIC = ["weight_kg", "height_cm", "waist_cm", "head_cm"];

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
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateOnly = (value) => (value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
  : value ? String(value).slice(0, 10) : null);
const parseJson = (value) => (typeof value === "string" ? JSON.parse(value) : value ?? null);

// Valores de la ficha: texto, lista de opciones o lista de alimentos [{ food, type, note }].
function cleanValue(key, value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (value.length > 60) throw bad(`El campo ${key} tiene demasiados elementos.`);
    return value
      .map((item) => (item && typeof item === "object"
        ? { food: optionalText(item.food, "El alimento", 80), type: optionalText(item.type, "El tipo", 40) || "", note: optionalText(item.note ?? item.reaction, "La observación", 200) || "" }
        : optionalText(item, `Un valor de ${key}`, 200)))
      .filter((item) => (item && typeof item === "object" ? item.food : item));
  }
  if (typeof value === "object") throw bad(`El campo ${key} no tiene un formato válido.`);
  return optionalText(value, `El campo ${key}`, 5000) || "";
}
function cleanSection(input, allowed, label) {
  if (input === null || input === undefined) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw bad(`${label} no tiene un formato válido.`);
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key)) throw bad(`El campo "${key}" no se puede registrar en ${label.toLowerCase()}.`);
    out[key] = cleanValue(key, value);
  }
  return out;
}

export function normalizeMilestone(input = {}, birthDate = null) {
  const measuredAt = String(input.measured_at || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredAt) || Number.isNaN(new Date(`${measuredAt}T00:00:00`).getTime())) throw bad("Indica una fecha válida para el hito.");
  if (measuredAt > localToday()) throw bad("La fecha del hito no puede ser futura.");
  const birth = dateOnly(birthDate);
  if (birth && measuredAt < birth) throw bad("La fecha del hito no puede ser anterior a la fecha de nacimiento.");
  const type = String(input.milestone_type || MILESTONE_TYPES[0]);
  if (!MILESTONE_TYPES.includes(type)) throw bad(`Tipo de hito no válido. Usa: ${MILESTONE_TYPES.join(", ")}.`);
  const updates = cleanSection(input.updates, STATE_KEYS, "Los cambios de la ficha");
  const record = cleanSection(input.record, VISIT_KEYS, "El registro de la atención");
  const nextControl = record.next_control_date;
  if (nextControl && (!/^\d{4}-\d{2}-\d{2}$/.test(nextControl) || nextControl < measuredAt)) throw bad("La fecha del próximo control debe ser igual o posterior a la fecha del hito.");
  const data = {
    measured_at: measuredAt,
    milestone_type: type,
    attended_by: optionalText(input.attended_by, "El nombre de la profesional", 180),
    weight_kg: optionalNumber(input.weight_kg, "El peso (kg)", 0.5, 250),
    height_cm: optionalNumber(input.height_cm, "La talla (cm)", 30, 230),
    waist_cm: optionalNumber(input.waist_cm, "El perímetro abdominal (cm)", 20, 200),
    head_cm: optionalNumber(input.head_cm, "El perímetro craneano (cm)", 20, 70),
    blood_pressure: optionalText(input.blood_pressure, "La presión arterial", 20),
    notes: optionalText(input.notes, "Las observaciones", 5000),
    updates,
    record: Object.fromEntries(Object.entries(record).filter(([, value]) => (Array.isArray(value) ? value.length : value))),
  };
  const hasContent = ["weight_kg", "height_cm", "waist_cm", "head_cm", "blood_pressure", "notes"].some((key) => data[key] !== null)
    || Object.keys(data.updates).length || Object.keys(data.record).length;
  if (!hasContent) throw bad("El hito está vacío: registra mediciones, la evolución, cambios en la ficha u observaciones.");
  return data;
}

const hydrate = (row) => {
  if (!row) return null;
  const item = { ...row, updates: parseJson(row.updates) || {}, record: parseJson(row.record) || {} };
  for (const key of NUMERIC) item[key] = item[key] === null || item[key] === undefined ? null : Number(item[key]);
  return item;
};
const byDate = (a, b) => a.measured_at.localeCompare(b.measured_at) || a.id - b.id;

// Estado actual: ficha inicial + cambios de cada hito en orden cronológico, indicando el hito que actualizó cada dato.
export function currentState(intake, milestones) {
  const data = { ...(intake || {}) };
  const sources = {};
  for (const m of [...milestones].sort(byDate)) {
    for (const [key, value] of Object.entries(m.updates || {})) {
      data[key] = value;
      sources[key] = { date: m.measured_at, milestone_id: m.id, type: m.milestone_type };
    }
  }
  const withNext = [...milestones].sort(byDate).reverse().find((m) => m.record?.next_control_date);
  return { data, sources, next_control: withNext ? { date: withNext.record.next_control_date, goals: withNext.record.next_control_goals || "", from: withNext.measured_at } : null };
}

export function createMilestoneService(pool, demoPatients = []) {
  return pool ? mysqlService(pool) : demoService(demoPatients);
}

function mysqlService(pool) {
  const patientRow = async (patientId) => {
    const [rows] = await pool.execute("SELECT id, birth_date FROM patients WHERE id = ? AND archived_at IS NULL", [patientId]);
    if (!rows[0]) throw new HttpError(404, "Paciente no encontrado.");
    return rows[0];
  };
  const get = async (id) => {
    const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM patient_milestones WHERE id = ? AND archived_at IS NULL`, [id]);
    return hydrate(rows[0]);
  };
  const values = (d) => [d.measured_at, d.milestone_type, d.attended_by, d.weight_kg, d.height_cm, d.waist_cm, d.head_cm, d.blood_pressure, d.notes, JSON.stringify(d.updates), JSON.stringify(d.record)];
  const list = async (patientId) => {
    const [rows] = await pool.execute(`SELECT ${COLUMNS} FROM patient_milestones WHERE patient_id = ? AND archived_at IS NULL ORDER BY measured_at, id`, [patientId]);
    return rows.map(hydrate);
  };

  return {
    async list(patientId) { await patientRow(patientId); return list(patientId); },
    // Para GET /api/patients/:id (si la tabla aún no existe, el llamador lo maneja).
    async stateFor(patientId, intake) { return currentState(intake, await list(patientId)); },
    async create(patientId, input) {
      const patient = await patientRow(patientId);
      const data = normalizeMilestone(input, patient.birth_date);
      const [result] = await pool.execute("INSERT INTO patient_milestones (patient_id, measured_at, milestone_type, attended_by, weight_kg, height_cm, waist_cm, head_cm, blood_pressure, notes, updates, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [patientId, ...values(data)]);
      await pool.execute("UPDATE patients SET status = 'En seguimiento' WHERE id = ? AND status IN ('Borrador', 'Plan en borrador')", [patientId]);
      return get(result.insertId);
    },
    async update(id, input) {
      const current = await get(id);
      if (!current) throw new HttpError(404, "Hito no encontrado.");
      const patient = await patientRow(current.patient_id);
      const data = normalizeMilestone(input, patient.birth_date);
      await pool.execute("UPDATE patient_milestones SET measured_at = ?, milestone_type = ?, attended_by = ?, weight_kg = ?, height_cm = ?, waist_cm = ?, head_cm = ?, blood_pressure = ?, notes = ?, updates = ?, record = ? WHERE id = ? AND archived_at IS NULL", [...values(data), id]);
      return get(id);
    },
    async remove(id) {
      const [result] = await pool.execute("UPDATE patient_milestones SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND archived_at IS NULL", [id]);
      if (!result.affectedRows) throw new HttpError(404, "Hito no encontrado.");
      return { id, archived: true };
    },
  };
}

// Modo demostración (sin MySQL): los hitos viven en memoria y se pierden al reiniciar.
function demoService(demoPatients) {
  const items = [];
  let nextId = 1;
  const patient = (id) => {
    const found = demoPatients.find((item) => item.id === id);
    if (!found) throw new HttpError(404, "Paciente no encontrado.");
    return found;
  };
  const list = (patientId) => items.filter((m) => m.patient_id === patientId && !m.archived).sort(byDate).map((m) => structuredClone(m));
  return {
    async list(patientId) { patient(patientId); return list(patientId); },
    async stateFor(patientId, intake) { return currentState(intake, list(patientId)); },
    async create(patientId, input) {
      const owner = patient(patientId);
      const item = { id: nextId++, patient_id: patientId, ...normalizeMilestone(input, owner.birth_date), archived: false };
      items.push(item);
      return structuredClone(item);
    },
    async update(id, input) {
      const item = items.find((m) => m.id === id && !m.archived);
      if (!item) throw new HttpError(404, "Hito no encontrado.");
      Object.assign(item, normalizeMilestone(input, patient(item.patient_id).birth_date));
      return structuredClone(item);
    },
    async remove(id) {
      const item = items.find((m) => m.id === id && !m.archived);
      if (!item) throw new HttpError(404, "Hito no encontrado.");
      item.archived = true;
      return { id, archived: true };
    },
  };
}
