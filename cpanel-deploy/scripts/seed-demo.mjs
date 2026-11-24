// Crea un paciente FICTICIO de demostración con un año de seguimiento, usando la API de la app.
// No contiene datos reales. Requiere la app en ejecución y las migraciones aplicadas.
//
// Uso: node scripts/seed-demo.mjs [URL_BASE]
//      URL_BASE por defecto: http://localhost:3000/nutricion
const BASE = (process.argv[2] || "http://localhost:3000/nutricion").replace(/\/$/, "");
const NAME = "CASO DE PRUEBA - Sofía Ficticia";

async function call(path, method = "GET", body) {
  const response = await fetch(`${BASE}/api${path}`, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${payload.error || ""}`);
  return payload.data;
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return iso(d); };
const birth = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 8); d.setMonth(d.getMonth() - 4); return iso(d); })();

const existing = (await call("/patients")).find((p) => p.full_name === NAME);
if (existing) {
  console.log(`Ya existe "${NAME}" (id ${existing.id}). No se creó nada. Elimínalo de la base si quieres recrearlo.`);
  process.exit(0);
}

// Ficha inicial (línea base) de hace 12 meses.
const intake = {
  full_name: NAME, birth_date: birth, sex: "Femenino", caregiver: "Madre (ficticia)", relationship: "Madre",
  school: "Escuela de prueba", grade: "3° básico", appointment_date: monthsAgo(12), referrer: "Pediatra (ficticio)",
  referral_reason: "Caso ficticio para probar el sistema: selectividad alimentaria y alergia a maní y nueces.",
  consultation_reason: ["Selectividad alimentaria", "Evaluación preventiva"], requestor: "Pediatra", previous_treatment: "No",
  gestational_classification: "Término", birth_weight_g: "3300", birth_height_cm: "50", birth_type: "Vaginal", perinatal_complications: "No",
  initial_milk: "Lactancia materna exclusiva", breastfeeding_months: "8", complementary_months: "6", early_difficulties: "No",
  growth_alterations: ["Ninguna"], conditions: ["Alergia alimentaria"], conditions_detail: "Alergia a maní y nueces (caso ficticio).",
  gi_symptoms: ["Ninguno"], medication_use: "No", supplement_use: "No", allergies: ["Alimentarias"],
  food_allergens: [{ food: "Maní", type: "Alergia", note: "Urticaria" }, { food: "Nueces", type: "Alergia", note: "Urticaria" }],
  allergies_detail: "Evitar maní, nueces y productos que los contengan.", family_history: ["Ninguno"],
  meals_per_day: "5", meal_times: ["Desayuno", "Colación de mañana", "Almuerzo", "Once", "Cena"], meal_locations: ["Hogar", "Establecimiento educacional"],
  food_preparer: ["Madre"], frequency: "Frutas a diario, verduras 3 veces por semana, pescado casi nunca.", rejected_groups: ["Pescados", "Texturas específicas"],
  favorite_foods: [{ food: "Plátano" }, { food: "Pollo" }, { food: "Arroz" }, { food: "Frutillas" }],
  rejected_foods: [{ food: "Brócoli cocido", note: "Textura" }, { food: "Pescado", note: "Sabor" }],
  current_diet: ["Habitual"], appetite: "Normal", meal_behavior: ["Rechaza alimentos nuevos", "Come frente a pantallas"], hunger_satiety: "Reconoce ambas",
  water_ml: "800", other_liquids: ["Leche", "Jugos envasados"], physical_activity: "Ocasional", activity_type: ["Juegos recreativos"], activity_days: "2-3 días",
  sleep_hours: "8-10", screen_time: "2-4 horas", breakfast: "Leche con cereal", lunch: "Arroz con pollo", once: "Pan con mantequilla y leche", dinner: "Fideos",
  weight_kg: "31", height_cm: "130", waist_circumference: "58", growth_curve: "No evaluado", recent_tests: "No",
  intervention_goals: ["Mejorar calidad alimentaria", "Favorecer crecimiento"], diet_plan_type: ["Alimentación saludable habitual"],
  indicated_meal_times: "5", snacks_needed: "Sí", final_notes: "PACIENTE FICTICIO de demostración. Puede borrarse.",
};
const patient = await call("/patients", "POST", { full_name: NAME, birth_date: birth, sex: "Femenino", weight_kg: 31, height_cm: 130, intake_data: intake });

// Hitos trimestrales; el último registra evolución, cambios de ficha e indicaciones.
const milestones = [
  { measured_at: monthsAgo(9), weight_kg: 31.6, height_cm: 131.6, notes: "Control 1 (ficticio)." },
  { measured_at: monthsAgo(6), weight_kg: 32.1, height_cm: 133.2, waist_cm: 59 },
  { measured_at: monthsAgo(3), weight_kg: 32.9, height_cm: 134.9, blood_pressure: "98/62" },
  {
    measured_at: iso(new Date()), attended_by: "Profesional de prueba", weight_kg: 33.4, height_cm: 136.3, waist_cm: 60,
    updates: { physical_activity: "Regular", food_allergens: [...intake.food_allergens, { food: "Kiwi", type: "Intolerancia", note: "" }] },
    record: { evolution: "Buena adherencia; aumentó actividad física (caso ficticio).", clinical_indications: "Mantener colaciones saludables.", next_control_date: monthsAgo(-3) },
  },
];
for (const m of milestones) await call(`/patients/${patient.id}/milestones`, "POST", { milestone_type: "Control nutricional", ...m });
console.log(`Creado "${NAME}" (id ${patient.id}) con ficha inicial y ${milestones.length} hitos de seguimiento.`);
