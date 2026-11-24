// Estimación de requerimientos de energía y macronutrientes a partir de peso, talla, edad y sexo.
// Es una propuesta inicial: la nutricionista debe validar el resultado antes de aprobar un plan.
//
// Fuentes:
// - Gasto energético basal: ecuaciones de Schofield (1985) con peso (kg) y talla (m), kcal/día,
//   según ESPGHAN/ESPEN, Guidelines on Paediatric Parenteral Nutrition (2005), cap. 2 Energía, Tablas 2.1–2.3.
// - Proteína: RDA de las Dietary Reference Intakes (IOM/National Academies, 2005), g/kg/día por edad.
// - Distribución: rangos aceptables de macronutrientes (AMDR, IOM 2005).

const REQUIREMENT_SOURCES = [
  "Gasto basal: Schofield (1985) con peso y talla; ESPGHAN/ESPEN 2005, Tablas 2.1–2.3.",
  "Proteína: RDA en g/kg/día de las DRI (IOM/National Academies 2005).",
  "Grasas y carbohidratos: rangos AMDR (IOM 2005); grasas en el punto medio del rango.",
];

// [coef. peso (kg), coef. talla (m), constante] → kcal/día
const SCHOFIELD_WH = {
  "0-3": { Masculino: [0.167, 1517.4, -617.6], Femenino: [16.25, 1023.2, -413.5] },
  "3-10": { Masculino: [19.6, 130.3, 414.9], Femenino: [16.97, 161.8, 371.2] },
  "10-18": { Masculino: [16.25, 137.2, 515.5], Femenino: [8.365, 465, 200] },
};

// [edad desde (incl.), edad hasta (excl.), g/kg/día]
const PROTEIN_RDA = [[1, 4, 1.05], [4, 14, 0.95], [14, 19, 0.85]];

const AMDR_RANGES = {
  "1-3": { protein: [5, 20], fat: [30, 40], carbs: [45, 65] },
  "4-18": { protein: [10, 30], fat: [25, 35], carbs: [45, 65] },
};

// Factores de actividad provisionales del sistema (no provienen de una guía): la profesional debe ajustarlos.
const ACTIVITY_FACTORS = { "No realiza": 1.25, "Ocasional": 1.4, "Regular": 1.6 };
const DEFAULT_ACTIVITY_FACTOR = 1.4;

function ageInYears(birthDate, reference = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > reference) return null;
  let months = (reference.getFullYear() - birth.getFullYear()) * 12 + (reference.getMonth() - birth.getMonth());
  if (reference.getDate() < birth.getDate()) months -= 1;
  return months / 12;
}

// data: { birth_date, sex, weight_kg, height_cm, physical_activity }
// options: { calcWeightKg, activityFactor, fatPct }
function estimateRequirements(data, options = {}) {
  const age = ageInYears(data.birth_date);
  const weight = Number(data.weight_kg);
  const height = Number(data.height_cm);
  const sex = data.sex;
  const missing = [];
  if (age === null) missing.push("fecha de nacimiento");
  if (!["Femenino", "Masculino"].includes(sex)) missing.push("sexo femenino o masculino");
  if (!(weight > 0)) missing.push("peso");
  if (!(height > 0)) missing.push("talla");
  if (missing.length) return { error: `Para calcular los requerimientos falta: ${missing.join(", ")}.` };
  if (age < 1) return { error: "En menores de 1 año el requerimiento depende de lactancia o fórmula y requiere criterio profesional específico; ingrésalo manualmente." };
  if (age >= 18) return { error: "Las ecuaciones pediátricas cubren hasta los 17 años; para 18 años o más ingresa el requerimiento manualmente." };

  const calcWeight = Number(options.calcWeightKg) > 0 ? Number(options.calcWeightKg) : weight;
  const heightM = height / 100;
  const band = age < 3 ? "0-3" : age < 10 ? "3-10" : "10-18";
  const [cw, ch, c0] = SCHOFIELD_WH[band][sex];
  const bmr = cw * calcWeight + ch * heightM + c0;
  const factor = Number(options.activityFactor) > 0 ? Number(options.activityFactor) : ACTIVITY_FACTORS[data.physical_activity] || DEFAULT_ACTIVITY_FACTOR;
  const kcal = Math.round((bmr * factor) / 10) * 10;
  const bmi = Math.round((weight / heightM ** 2) * 10) / 10;

  const amdrKey = age < 4 ? "1-3" : "4-18";
  const ranges = AMDR_RANGES[amdrKey];
  const proteinPerKg = PROTEIN_RDA.find(([from, to]) => age >= from && age < to)[2];
  const proteinRdaG = Math.round(proteinPerKg * calcWeight * 10) / 10;
  const notes = [];

  let proteinPct = Math.round(((proteinRdaG * 4) / kcal) * 100);
  if (proteinPct < ranges.protein[0]) {
    notes.push(`La proteína por g/kg (${proteinRdaG} g = ${proteinPct}% de la energía) queda bajo el rango AMDR; se usó el mínimo del rango (${ranges.protein[0]}%).`);
    proteinPct = ranges.protein[0];
  } else if (proteinPct > ranges.protein[1]) {
    notes.push(`La proteína por g/kg supera el rango AMDR; se usó el máximo del rango (${ranges.protein[1]}%).`);
    proteinPct = ranges.protein[1];
  }
  const fatPct = Number(options.fatPct) > 0 ? Math.round(Number(options.fatPct)) : Math.round((ranges.fat[0] + ranges.fat[1]) / 2);
  const carbsPct = 100 - proteinPct - fatPct;
  if (carbsPct < ranges.carbs[0] || carbsPct > ranges.carbs[1]) {
    notes.push(`Los carbohidratos (${carbsPct}%) quedan fuera del rango AMDR ${ranges.carbs[0]}–${ranges.carbs[1]}%: ajusta la distribución.`);
  }
  if (!ACTIVITY_FACTORS[data.physical_activity] && !(Number(options.activityFactor) > 0)) notes.push(`Sin actividad física registrada: se usó un factor de actividad ${DEFAULT_ACTIVITY_FACTOR}.`);
  notes.push("Los factores de actividad del sistema son provisionales: ajústalos según tu criterio.");
  if (calcWeight === weight) notes.push("Se usó el peso actual. Si hay exceso o déficit de peso, considera usar el peso ideal para la talla.");
  else notes.push(`Se usó un peso de cálculo de ${calcWeight} kg (peso actual ${weight} kg).`);

  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    age: round1(age),
    age_years: Math.floor(age),
    bmi,
    calc_weight_kg: calcWeight,
    bmr: Math.round(bmr),
    factor,
    activity_label: data.physical_activity || "Sin registro",
    kcal,
    protein_g_per_kg: proteinPerKg,
    protein_rda_g: proteinRdaG,
    protein_pct: proteinPct,
    fat_pct: fatPct,
    carbs_pct: carbsPct,
    protein_g: round1((kcal * proteinPct) / 100 / 4),
    fat_g: round1((kcal * fatPct) / 100 / 9),
    carbs_g: round1((kcal * carbsPct) / 100 / 4),
    ranges,
    formula: `Schofield peso y talla (${band} años) × factor de actividad ${factor}; proteína ${proteinPerKg} g/kg; grasas punto medio AMDR`,
    notes,
    sources: REQUIREMENT_SOURCES,
  };
}
