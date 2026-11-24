// Planes de alimentación persistentes: borrador → aprobado, con historial por paciente.
// Depende de $, esc, patients, load, patientAge, readFoodList y normalizeFood (nutri.js) y estimateRequirements (requirements.js).
(() => {
  const planModal = $("#planModal");
  const planBody = $("#planBody");
  const state = { patient: null, plans: [], current: null, message: "", messageType: "", requirements: null, exampleDay: 0, exampleOffset: 0, examplesStale: false };
  const STATUS_CLASS = { Borrador: "draft", Aprobado: "approved", Reemplazado: "replaced" };

  const num = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
  const val = (value) => (value === null || value === undefined ? "" : esc(value));
  const formatDate = (value) => (value ? new Date(value).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : "—");
  const formatDateTime = (value) => (value ? new Date(value).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  const storage = {
    get(key) { try { return localStorage.getItem(key) || ""; } catch { return ""; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento local */ } },
  };

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo completar la acción.");
    return payload.data;
  }

  function patientData(patient) {
    return {
      // Estado actual: ficha inicial + cambios registrados en los hitos de seguimiento.
      ...(patient.current_data || patient.intake_data || {}),
      full_name: patient.full_name,
      birth_date: patient.birth_date ? String(patient.birth_date).slice(0, 10) : "",
      sex: patient.sex || "",
      // Se usa la medición más reciente (control de seguimiento) y, si no hay, la de la ficha inicial.
      weight_kg: patient.last_weight_kg ?? patient.weight_kg ?? "",
      height_cm: patient.last_height_cm ?? patient.height_cm ?? "",
    };
  }

  function snapshot() {
    const data = patientData(state.patient);
    const weight = num(data.weight_kg);
    const height = num(data.height_cm);
    return {
      age_years: patientAge(data.birth_date),
      sex: data.sex || null,
      weight_kg: weight,
      height_cm: height,
      bmi: weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null,
    };
  }

  const blankPlan = () => ({ id: null, version: null, status: "Borrador", formula: "", calculation_inputs: {}, energy_kcal: null, carbs_pct: null, protein_pct: null, fat_pct: null, meal_distribution: [], excluded_foods: [], preferred_foods: [], rejected_foods: [], indications: "", professional_notes: "" });

  // Listas de alimentos del plan y el campo de la ficha del que provienen.
  const FOOD_KEYS = { excluded_foods: "food_allergens", preferred_foods: "favorite_foods", rejected_foods: "rejected_foods" };
  const patientFoods = () => Object.fromEntries(Object.entries(FOOD_KEYS).map(([planKey, intakeKey]) => [planKey, readFoodList((state.patient?.current_data || state.patient?.intake_data)?.[intakeKey])]));
  // Un borrador siempre usa las listas vigentes de la ficha; un plan aprobado conserva las que tenía al aprobarse.
  const planFoods = (plan) => (plan.status === "Borrador" ? patientFoods() : Object.fromEntries(Object.keys(FOOD_KEYS).map((key) => [key, plan[key] || []])));

  // Misma regla que el servidor (plans.js): sin tildes ni mayúsculas, admite plural simple.
  const planTexts = (plan) => [
    ...(plan.meal_distribution || []).map((meal, index) => ({ where: meal.meal || `Tiempo de comida ${index + 1}`, index, text: `${meal.meal || ""} ${meal.notes || ""}` })),
    { where: "Indicaciones", index: null, text: plan.indications || "" },
  ];
  function mentionsOf(list, texts) {
    return (list || []).flatMap((item) => {
      const food = normalizeFood(item.food);
      if (!food) return [];
      const pattern = new RegExp(`(^|[^a-z0-9])${food.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?(?![a-z0-9])`);
      const hits = texts.filter((entry) => pattern.test(normalizeFood(entry.text)));
      return hits.length ? [{ food: item.food, places: hits.map((hit) => hit.where), rows: hits.map((hit) => hit.index).filter((i) => i !== null) }] : [];
    });
  }
  // Menciones que requieren revisión: alimentos excluidos y rechazados.
  function exclusionMentions(plan) {
    const texts = planTexts(plan);
    return [
      ...mentionsOf(plan.excluded_foods, texts).map((m) => ({ ...m, kind: "excluido" })),
      ...mentionsOf(plan.rejected_foods, texts).map((m) => ({ ...m, kind: "rechazado" })),
    ];
  }

  function foodsBlock(plan) {
    const foods = planFoods(plan);
    const editable = plan.status === "Borrador";
    const chip = (item, attrs = "") => {
      const detail = [item.type, item.note].filter(Boolean).join(" · ");
      return `<li${attrs}><b>${esc(item.food)}</b>${detail ? `<span>${esc(detail)}</span>` : ""}</li>`;
    };
    const group = (cls, title, empty, items, attrs = () => "") => `<div class="food-group ${cls}${items.length ? "" : " empty"}"><h4>${title}</h4>${items.length ? `<ul>${items.map((item) => chip(item, attrs(item))).join("")}</ul>` : `<p>${empty}</p>`}</div>`;
    return `<section class="patient-foods">
      ${group("excluded", foods.excluded_foods.length ? "⚠ Alimentos excluidos: no incluir" : "Alimentos excluidos", "La ficha no registra alimentos que deban excluirse.", foods.excluded_foods)}
      ${group("rejected", "Alimentos que rechaza: evitar o adaptar", "La ficha no registra alimentos rechazados.", foods.rejected_foods)}
      ${group("preferred", `Alimentos preferidos: incluir cuando sea posible <em id="preferredCount"></em>`, "La ficha no registra alimentos preferidos.", foods.preferred_foods, (item) => ` data-pref="${esc(normalizeFood(item.food))}"`)}
      <small>${editable ? "Estas listas se toman de la ficha del paciente. Para cambiarlas, edita la ficha." : "Listas registradas en este plan al guardarlo."}</small>
      <div id="exclusionWarnings" role="alert"></div>
    </section>`;
  }

  // Requerimientos desde peso, talla, edad, sexo y actividad (public/requirements.js). Requiere validación profesional.
  function proposal(options = {}) {
    const data = patientData(state.patient);
    const r = estimateRequirements(data, options);
    if (r.error) return { error: r.error };
    const meals = list(data.meal_times).length ? list(data.meal_times) : ["Desayuno", "Almuerzo", "Once", "Cena"];
    return {
      formula: r.formula,
      calculation_inputs: { ...snapshot(), bmr_kcal: r.bmr, activity_factor: r.factor, activity_label: data.physical_activity || "Sin registro (factor por defecto)", calc_weight_kg: r.calc_weight_kg, protein_g_per_kg: r.protein_g_per_kg },
      energy_kcal: r.kcal,
      carbs_pct: r.carbs_pct,
      protein_pct: r.protein_pct,
      fat_pct: r.fat_pct,
      meals,
      requirements: r,
    };
  }

  function requirementsBox(r) {
    return `<div class="requirements-box">
      <h4>Requerimientos estimados</h4>
      <dl>
        <dt>Gasto basal</dt><dd>${r.bmr} kcal/día <small>Schofield con peso ${r.calc_weight_kg} kg y talla</small></dd>
        <dt>Energía</dt><dd>${r.bmr} × ${r.factor} = <b>${r.kcal} kcal/día</b></dd>
        <dt>Proteína</dt><dd>${r.protein_g_per_kg} g/kg × ${r.calc_weight_kg} kg = ${r.protein_rda_g} g (RDA) → <b>${r.protein_pct}% = ${r.protein_g} g</b> <small>AMDR ${r.ranges.protein.join("–")}%</small></dd>
        <dt>Grasas</dt><dd><b>${r.fat_pct}% = ${r.fat_g} g</b> <small>AMDR ${r.ranges.fat.join("–")}%</small></dd>
        <dt>Carbohidratos</dt><dd><b>${r.carbs_pct}% = ${r.carbs_g} g</b> <small>AMDR ${r.ranges.carbs.join("–")}%</small></dd>
      </dl>
      <ul>${r.notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>
      <small class="sources">${r.sources.map(esc).join(" ")}</small>
    </div>`;
  }

  function setMessage(text, type = "") {
    state.message = text;
    state.messageType = type;
    const node = $("#planMessage");
    if (node) {
      node.textContent = text;
      node.className = type;
    }
  }

  // ---------- Render ----------

  function historyList() {
    if (!state.plans.length) return `<p class="plan-empty">Aún no hay planes guardados para este paciente.</p>`;
    return `<ol class="plan-history-list">${state.plans.map((plan) => `
      <li><button type="button" data-action="select" data-id="${plan.id}" class="${state.current?.id === plan.id ? "active" : ""}">
        <span><b>Versión ${plan.version}</b><span class="status-badge ${STATUS_CLASS[plan.status] || ""}">${esc(plan.status)}</span></span>
        <small>${plan.energy_kcal ? `${plan.energy_kcal} kcal/día · ` : ""}${plan.status === "Borrador" ? "Editado" : plan.approved_at ? "Aprobado" : "Actualizado"} ${formatDate(plan.approved_at || plan.updated_at)}</small>
      </button></li>`).join("")}</ol>`;
  }

  function context() {
    const data = patientData(state.patient);
    const rows = [
      ["Objetivos", list(data.intervention_goals).join(", ")],
      ["Condiciones", list(data.conditions).join(", ")],
      ["Alergias / intolerancias", [list(data.allergies).join(", "), data.allergies_detail].filter(Boolean).join(" — ")],
      ["Dieta actual y restricciones", [list(data.current_diet).join(", "), data.diet_restrictions].filter(Boolean).join(" — ")],
      ["Grupos o texturas que rechaza", list(data.rejected_groups).join(", ")],
      ["Tiempos de comida actuales", list(data.meal_times).join(", ")],
      ["Actividad física", data.physical_activity],
    ].filter(([, value]) => value);
    return `<details class="plan-context" open><summary>Antecedentes de la ficha a considerar</summary>${rows.length ? `<dl>${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl>` : `<p>La ficha no registra objetivos, restricciones ni preferencias.</p>`}</details>`;
  }

  function mealRow(meal, index, editable) {
    return `<div class="meal-row" data-index="${index}">
      <label>Tiempo de comida<input data-meal="meal" value="${val(meal.meal)}" maxlength="80" placeholder="Ej.: Desayuno"></label>
      <label>% energía<input data-meal="pct" type="number" min="0" max="100" step="1" value="${val(meal.pct)}" placeholder="—"></label>
      <label class="meal-notes">Indicaciones y ejemplos<textarea data-meal="notes" rows="2" maxlength="1000">${val(meal.notes)}</textarea></label>
      ${editable ? `<button type="button" class="meal-remove" data-action="remove-meal" data-index="${index}" aria-label="Quitar tiempo de comida">×</button>` : ""}
    </div>`;
  }

  function editor(plan) {
    const editable = plan.status === "Borrador";
    const inputs = plan.calculation_inputs || {};
    const variables = [
      inputs.age_years !== null && inputs.age_years !== undefined ? `${inputs.age_years} años` : null,
      inputs.sex,
      inputs.weight_kg ? `${inputs.weight_kg} kg` : null,
      inputs.height_cm ? `${inputs.height_cm} cm` : null,
      inputs.bmi ? `IMC ${inputs.bmi} kg/m²` : null,
      inputs.activity_label ? `Actividad: ${inputs.activity_label}` : null,
    ].filter((item) => item !== null && item !== undefined && item !== "");
    const disabled = editable ? "" : "disabled";
    const meals = plan.meal_distribution || [];
    return `<form id="planForm" class="plan-form" novalidate>
      <div class="plan-title">
        <div><small>${plan.version ? `VERSIÓN ${plan.version}` : "NUEVO PLAN · SIN GUARDAR"}</small><h3>${editable ? "Borrador en edición" : plan.status === "Aprobado" ? "Plan aprobado vigente" : "Plan reemplazado"}</h3></div>
        <span class="status-badge ${STATUS_CLASS[plan.status] || ""}">${esc(plan.status)}${editable ? " · requiere revisión" : ""}</span>
      </div>
      ${plan.approved_by ? `<p class="plan-approval">Aprobado por <b>${esc(plan.approved_by)}</b> el ${esc(formatDateTime(plan.approved_at))}.${plan.status === "Reemplazado" ? " Fue reemplazado por una versión aprobada posterior." : ""}</p>` : ""}
      ${editable ? `<div class="quick-plan"><button type="button" class="save" data-action="full-plan">Calcular requerimientos y generar pauta con ejemplos</button><small>Usa peso, talla, edad, sexo y actividad física de la ficha; luego reparte porciones por grupo y arma menús de ejemplo para cada comida, respetando exclusiones y preferencias. Todo queda como borrador para tu revisión.</small></div>` : ""}
      ${foodsBlock(plan)}
      ${context()}
      <fieldset ${disabled}>
        <legend>Cálculo energético</legend>
        <div class="field-grid">
          <label class="wide">Fórmula o criterio utilizado<input name="formula" maxlength="180" value="${val(plan.formula)}" placeholder="Ej.: fórmula aprobada por la profesional"></label>
          <label>Gasto energético basal (kcal/día)<input name="bmr_kcal" type="number" min="0" step="1" value="${val(inputs.bmr_kcal)}"></label>
          <label>Factor de actividad<input name="activity_factor" type="number" min="0.5" max="3" step="0.05" value="${val(inputs.activity_factor)}"></label>
          <label>Energía indicada (kcal/día)<input name="energy_kcal" type="number" min="1" step="10" value="${val(plan.energy_kcal)}"></label>
          <label>Peso para el cálculo (kg)<input name="calc_weight_kg" type="number" min="1" step="0.1" value="${val(inputs.calc_weight_kg ?? inputs.weight_kg)}"><small class="hint">Peso actual por defecto; usa el peso ideal para la talla si corresponde.</small></label>
          <p class="calc-variables">${variables.length ? `Variables registradas: ${esc(variables.join(" · "))}` : "Las variables del paciente se registran al guardar."}${inputs.protein_g_per_kg ? ` · Proteína ${esc(inputs.protein_g_per_kg)} g/kg sobre ${esc(inputs.calc_weight_kg ?? inputs.weight_kg)} kg` : ""}</p>
        </div>
        ${editable && state.requirements ? requirementsBox(state.requirements) : ""}
        ${editable ? `<button type="button" class="plain" data-action="propose">Calcular requerimientos (peso y talla)</button>` : ""}
      </fieldset>
      <fieldset ${disabled}>
        <legend>Macronutrientes</legend>
        <div class="macro-grid">
          <label>Carbohidratos (%)<input name="carbs_pct" type="number" min="0" max="100" step="1" value="${val(plan.carbs_pct)}"><output id="carbsG">—</output></label>
          <label>Proteínas (%)<input name="protein_pct" type="number" min="0" max="100" step="1" value="${val(plan.protein_pct)}"><output id="proteinG">—</output></label>
          <label>Grasas (%)<input name="fat_pct" type="number" min="0" max="100" step="1" value="${val(plan.fat_pct)}"><output id="fatG">—</output></label>
        </div>
        <p class="sum-check" id="macroSum"></p>
      </fieldset>
      <fieldset ${disabled}>
        <legend>Distribución por tiempo de comida</legend>
        <div class="meal-rows">${meals.map((meal, index) => mealRow(meal, index, editable)).join("") || `<p class="plan-empty">Sin tiempos de comida registrados.</p>`}</div>
        <p class="sum-check" id="mealSum"></p>
        ${editable ? `<button type="button" class="plain" data-action="add-meal">＋ Agregar tiempo de comida</button>` : ""}
      </fieldset>
      ${portionSection(plan, editable)}
      <fieldset ${disabled}>
        <legend>Indicaciones</legend>
        <label>Indicaciones para el paciente y su familia<textarea name="indications" rows="5" maxlength="10000">${val(plan.indications)}</textarea></label>
        <label>Notas profesionales internas<textarea name="professional_notes" rows="3" maxlength="10000">${val(plan.professional_notes)}</textarea></label>
      </fieldset>
      ${editable ? `<div class="plan-actions">
        <label class="approver">Nombre de la profesional que aprueba<input name="approved_by" maxlength="180" value="${val(storage.get("nutri.approvedBy"))}"></label>
        <div class="plan-buttons">
          ${plan.id ? `<button type="button" class="danger" data-action="discard">Descartar borrador</button>` : ""}
          <button type="button" class="secondary" data-action="save">Guardar borrador</button>
          <button type="button" class="save" data-action="approve">Aprobar plan</button>
        </div>
      </div>` : `<div class="plan-actions"><div class="plan-buttons"><button type="button" class="save" data-action="copy">Crear nueva versión a partir de este plan</button></div></div>`}
      <p id="planMessage" role="status" class="${state.messageType}">${esc(state.message)}</p>
      <p class="plan-disclaimer">Los valores propuestos por el sistema son estimaciones provisionales. La nutricionista responsable debe validar requerimientos, curvas de crecimiento, diagnóstico, porciones e indicaciones antes de aprobar y entregar el plan.</p>
    </form>`;
  }

  function render() {
    const data = patientData(state.patient);
    const age = patientAge(data.birth_date);
    const summary = [age !== null ? `${age} años` : null, data.sex || null, data.weight_kg ? `${data.weight_kg} kg` : null, data.height_cm ? `${data.height_cm} cm` : null].filter(Boolean);
    planBody.innerHTML = `
      <button class="close" type="button" data-action="close" aria-label="Cerrar planes">×</button>
      <small class="eyebrow">PLANES DE ALIMENTACIÓN</small>
      <h2>${esc(state.patient.full_name)}</h2>
      <p class="form-intro">${esc(summary.join(" · ") || "Sin datos antropométricos registrados en la ficha.")}${state.patient.last_weight_at || state.patient.last_height_at ? ` <small class="measure-source">Peso y talla del último control (${esc([state.patient.last_weight_at, state.patient.last_height_at].filter(Boolean).sort().pop().split("-").reverse().join("-"))}).</small>` : ` <small class="measure-source">Peso y talla de la ficha inicial.</small>`}</p>
      <div class="plan-layout">
        <section class="plan-history">
          <div class="plan-history-head"><h3>Historial</h3><button type="button" class="plain" data-action="new">＋ Nuevo borrador</button></div>
          ${historyList()}
        </section>
        <section class="plan-editor">${state.current ? editor(state.current) : `<p class="plan-empty">Selecciona un plan del historial o crea un nuevo borrador.</p>`}</section>
      </div>`;
    if (state.current) updateTotals();
  }

  // ---------- Pauta por porciones ----------

  const MACRO_KEYS = ["kcal", "protein_g", "fat_g", "carbs_g"];
  const MACRO_LABELS = { kcal: "Energía", protein_g: "Proteínas", fat_g: "Grasas", carbs_g: "Carbohidratos" };
  const fmt1 = (value) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("es-CL", { maximumFractionDigits: 1 }));
  const portionTotals = (groups) => Object.fromEntries(MACRO_KEYS.map((key) => [key, Math.round(groups.reduce((a, g) => a + (g.daily || 0) * (g.ref?.[key] || 0), 0) * 10) / 10]));

  function portionSection(plan, editable) {
    const pp = plan.portion_plan;
    return `<fieldset class="portion-plan" ${editable ? "" : "disabled"}>
      <legend>Pauta por porciones de intercambio</legend>
      ${editable ? `<div class="portion-actions"><button type="button" class="secondary" data-action="generate-portions">${pp ? "Volver a generar" : "Generar pauta por porciones"}</button>${pp ? `<button type="button" class="plain" data-action="clear-portions">Quitar pauta por porciones</button>` : ""}<small>Usa la energía, los macronutrientes y los tiempos de comida de este plan, el catálogo de alimentos y las reglas por edad. Si cambias esos datos, vuelve a generarla.</small></div>` : ""}
      ${pp ? portionTable(pp, editable) : `<p class="plan-empty">${editable ? "Aún no se ha generado." : "Este plan no tiene pauta por porciones."}</p>`}
    </fieldset>`;
  }

  function portionTable(pp, editable) {
    const visible = pp.groups.filter((g) => editable || g.daily > 0);
    return `${pp.warnings?.length ? `<ul class="portion-warnings">${pp.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      <p class="calc-variables">${esc(pp.method || "")}${pp.rule_range ? ` · Reglas aplicadas: ${esc(pp.rule_range)}` : " · Sin reglas por edad"}${pp.generated_at ? ` · Generada ${esc(formatDateTime(pp.generated_at))}` : ""}</p>
      <div class="table-scroll"><table class="portion-table">
        <thead><tr><th>Grupo</th>${pp.meals.map((meal) => `<th>${esc(meal)}</th>`).join("")}<th>Total día</th><th>kcal</th></tr></thead>
        <tbody>${visible.map((g) => {
          const gi = pp.groups.indexOf(g);
          return `<tr data-group-index="${gi}">
          <td><b>${esc(g.name)}</b><small>1 porción: ${fmt1(g.ref.kcal)} kcal · P ${fmt1(g.ref.protein_g)} · G ${fmt1(g.ref.fat_g)} · C ${fmt1(g.ref.carbs_g)}${g.min || g.max ? ` · regla ${fmt1(g.min)}–${fmt1(g.max)}` : ""}</small></td>
          ${pp.meals.map((_, mi) => `<td><input type="number" min="0" max="30" step="0.5" data-portion="${gi}:${mi}" value="${g.per_meal[mi] ?? 0}" aria-label="${esc(g.name)} en ${esc(pp.meals[mi])}"></td>`).join("")}
          <td class="portion-daily" data-daily="${gi}">${fmt1(g.daily)}</td><td data-kcal="${gi}">${fmt1(g.daily * g.ref.kcal)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
      <div class="portion-totals" id="portionTotals"></div>
      ${examplesBlock(pp, editable)}
      <details class="portion-foods"><summary>Alimentos sugeridos por grupo (sin alergias ni intolerancias; omite rechazados; ★ preferidos)</summary>
        ${pp.groups.filter((g) => g.daily > 0 || g.excluded_foods?.length || g.rejected_foods?.length).map((g) => `<div class="portion-group-foods"><h5>${esc(g.name)}</h5>
          ${g.suggestions?.length ? `<ul>${g.suggestions.map((item) => `<li class="${item.preferred ? "preferred" : ""}"><b>${item.preferred ? "★ " : ""}${esc(item.name)}</b><span>${esc(item.portion_label)} · ${fmt1(item.portion_grams)} g · ${fmt1(item.kcal)} kcal</span></li>`).join("")}</ul>` : `<p class="plan-empty">Sin alimentos disponibles para este paciente.</p>`}
          ${g.excluded_foods?.length ? `<small class="removed">Excluidos: ${esc(g.excluded_foods.join(", "))}</small>` : ""}
          ${g.rejected_foods?.length ? `<small class="removed">Rechazados (omitidos): ${esc(g.rejected_foods.join(", "))}</small>` : ""}
        </div>`).join("")}
      </details>`;
  }

  async function refreshExamples(offset) {
    const pp = readPortionPlan();
    if (!pp) return;
    const examples = await api("api/portion-plan/examples", { method: "POST", body: JSON.stringify({ portion_plan: pp, offset }) });
    state.current = { ...state.current, ...collect(), portion_plan: { ...pp, examples } };
    Object.assign(state, { exampleOffset: offset, exampleDay: 0, examplesStale: false });
    setMessage("Ejemplos de menú actualizados.", "info");
    render();
    planBody.querySelector(".menu-examples")?.scrollIntoView({ block: "nearest" });
  }

  function examplesBlock(pp, editable) {
    const head = (extra = "") => `<div class="examples-head"><h4>Ejemplos de menú por comida</h4>${extra}</div>`;
    if (!pp.examples?.length) return editable ? `<section class="menu-examples">${head(`<button type="button" class="plain" data-action="refresh-examples">Generar ejemplos</button>`)}</section>` : "";
    const index = Math.min(state.exampleDay || 0, pp.examples.length - 1);
    const example = pp.examples[index];
    const tabs = `<div class="day-tabs">${pp.examples.map((day, i) => `<button type="button" data-action="example-day" data-index="${i}" class="${i === index ? "active" : ""}">Día ${day.day}</button>`).join("")}</div>`;
    const buttons = editable ? `<button type="button" class="plain" data-action="refresh-examples">Actualizar ejemplos</button><button type="button" class="plain" data-action="more-examples">Otros ejemplos</button>` : "";
    return `<section class="menu-examples">${head(tabs + buttons)}
      <p id="examplesStale" class="sum-check warn" ${state.examplesStale ? "" : "hidden"}>Cambiaste porciones: pulsa "Actualizar ejemplos" para recalcularlos.</p>
      <div class="example-meals">${example.meals.map((meal) => `<article><h5>${esc(meal.meal)}<span>${fmt1(meal.kcal)} kcal</span></h5>
        ${meal.items.length ? `<ul>${meal.items.map((item) => `<li class="${item.unusual ? "unusual" : ""}"><b>${esc(item.amount)}</b> ${esc(item.name)}${item.preferred ? " ★" : ""}<span>${fmt1(item.grams)} g · ${fmt1(item.kcal)} kcal${item.unusual ? " · poco habitual en este horario: revisar" : ""}</span></li>`).join("")}</ul>` : `<p class="plan-empty">Sin porciones asignadas.</p>`}
      </article>`).join("")}</div>
      <p class="calc-variables">Total del día de ejemplo: ${fmt1(example.kcal)} kcal (objetivo ${fmt1(pp.target?.kcal)} kcal). Cada ejemplo usa las kcal reales de los alimentos elegidos, por eso difiere levemente de la pauta por grupos.</p>
    </section>`;
  }

  // Lee la tabla editable y recalcula los totales diarios.
  function readPortionPlan() {
    const pp = state.current?.portion_plan;
    if (!pp) return null;
    const groups = pp.groups.map((g, gi) => {
      const perMeal = pp.meals.map((_, mi) => {
        const input = planBody.querySelector(`[data-portion="${gi}:${mi}"]`);
        return input ? Math.max(0, num(input.value) || 0) : g.per_meal[mi] || 0;
      });
      return { ...g, per_meal: perMeal, daily: Math.round(perMeal.reduce((a, b) => a + b, 0) * 10) / 10 };
    });
    return { ...pp, groups, totals: portionTotals(groups) };
  }

  function updatePortionTotals() {
    const pp = readPortionPlan();
    const box = $("#portionTotals");
    if (!pp || !box) return;
    pp.groups.forEach((g, gi) => {
      const daily = planBody.querySelector(`[data-daily="${gi}"]`);
      const kcal = planBody.querySelector(`[data-kcal="${gi}"]`);
      if (daily) daily.textContent = fmt1(g.daily);
      if (kcal) kcal.textContent = fmt1(g.daily * g.ref.kcal);
    });
    box.innerHTML = MACRO_KEYS.map((key) => {
      const total = pp.totals[key];
      const target = pp.target?.[key];
      const diff = target ? ((total - target) / target) * 100 : null;
      const cls = diff === null ? "" : Math.abs(diff) <= 5 ? "ok" : Math.abs(diff) <= 10 ? "near" : "off";
      return `<article class="${cls}"><small>${MACRO_LABELS[key]}</small><b>${fmt1(total)}${key === "kcal" ? " kcal" : " g"}</b><em>objetivo ${fmt1(target)}${diff === null ? "" : ` · ${diff > 0 ? "+" : ""}${fmt1(diff)}%`}</em></article>`;
    }).join("");
  }


  function updateTotals() {
    const form = $("#planForm");
    if (!form) return;
    const energy = num(form.elements.energy_kcal.value);
    const pcts = ["carbs", "protein", "fat"].map((key) => num(form.elements[`${key}_pct`].value));
    const divisors = [4, 4, 9];
    ["carbsG", "proteinG", "fatG"].forEach((id, i) => {
      $(`#${id}`).textContent = energy && pcts[i] !== null ? `${Math.round(((energy * pcts[i]) / 100 / divisors[i]) * 10) / 10} g/día` : "—";
    });
    const macroSum = $("#macroSum");
    const given = pcts.filter((value) => value !== null);
    const total = given.reduce((a, b) => a + b, 0);
    macroSum.textContent = given.length ? `Suma: ${total}%${Math.abs(total - 100) > 0.5 ? " — debe ser 100%" : " ✓"}` : "";
    macroSum.classList.toggle("warn", given.length > 0 && Math.abs(total - 100) > 0.5);

    const mealPcts = [...form.querySelectorAll('[data-meal="pct"]')].map((input) => num(input.value)).filter((value) => value !== null);
    const mealTotal = mealPcts.reduce((a, b) => a + b, 0);
    const mealSum = $("#mealSum");
    mealSum.textContent = mealPcts.length ? `Suma de la distribución: ${mealTotal}%${Math.abs(mealTotal - 100) > 1 ? " — debe ser 100% si se completa en todos los tiempos" : " ✓"}` : "Porcentaje por tiempo de comida opcional: defínelo según tu criterio.";
    mealSum.classList.toggle("warn", mealPcts.length > 0 && Math.abs(mealTotal - 100) > 1);
    updateExclusionWarnings();
    updatePortionTotals();
  }

  function updateExclusionWarnings() {
    const box = $("#exclusionWarnings");
    if (!box) return;
    const editable = state.current.status === "Borrador";
    const plan = editable ? collect() : state.current;
    const mentions = exclusionMentions(plan);
    box.innerHTML = mentions.length
      ? `<p><b>Revisa el plan:</b> se mencionan alimentos excluidos o rechazados. Si es solo para indicar que se eviten (por ejemplo, "sin maní"), puedes mantenerlo.</p><ul>${mentions.map((m) => `<li><b>${esc(m.food)}</b> (${m.kind}) en ${esc(m.places.join(", "))}</li>`).join("")}</ul>`
      : "";
    const preferred = planFoods(state.current).preferred_foods;
    const included = new Set(mentionsOf(preferred, planTexts(plan)).map((m) => normalizeFood(m.food)));
    document.querySelectorAll("#planForm [data-pref]").forEach((chip) => chip.classList.toggle("included", included.has(chip.dataset.pref)));
    const count = $("#preferredCount");
    if (count) count.textContent = preferred.length ? `(${included.size} de ${preferred.length} incluidos en el plan)` : "";
    const flagged = new Set(mentions.flatMap((m) => m.rows));
    document.querySelectorAll("#planForm .meal-row").forEach((row, index) => row.classList.toggle("has-excluded", flagged.has(index)));
    $("#planForm").elements.indications?.classList.toggle("has-excluded", mentions.some((m) => m.places.includes("Indicaciones")));
  }

  // Lee el formulario actual sin perder datos no guardados.
  function collect() {
    const form = $("#planForm");
    const value = (name) => form.elements[name]?.value ?? "";
    return {
      formula: value("formula"),
      energy_kcal: num(value("energy_kcal")),
      carbs_pct: num(value("carbs_pct")),
      protein_pct: num(value("protein_pct")),
      fat_pct: num(value("fat_pct")),
      calculation_inputs: { ...(state.current.calculation_inputs || {}), ...snapshot(), bmr_kcal: num(value("bmr_kcal")), activity_factor: num(value("activity_factor")), calc_weight_kg: num(value("calc_weight_kg")) },
      meal_distribution: [...form.querySelectorAll(".meal-row")].map((row) => ({
        meal: row.querySelector('[data-meal="meal"]').value,
        pct: num(row.querySelector('[data-meal="pct"]').value),
        notes: row.querySelector('[data-meal="notes"]').value,
      })),
      ...patientFoods(),
      portion_plan: readPortionPlan(),
      indications: value("indications"),
      professional_notes: value("professional_notes"),
    };
  }

  // ---------- Acciones ----------

  async function refreshPlans() {
    state.plans = await api(`api/patients/${state.patient.id}/plans`);
    load().catch(() => {});
  }

  function newDraft() {
    const draft = blankPlan();
    const proposed = proposal();
    state.current = draft;
    if (proposed.error) {
      draft.calculation_inputs = snapshot();
      setMessage(`No se pudo calcular una propuesta automática: ${proposed.error}`, "warn");
    } else {
      Object.assign(draft, proposed, { meal_distribution: proposed.meals.map((meal) => ({ meal, pct: null, notes: "" })) });
      delete draft.meals;
      delete draft.requirements;
      state.requirements = proposed.requirements;
      setMessage("Borrador nuevo con los requerimientos estimados desde peso y talla. Revisa y ajusta antes de guardar.", "info");
    }
    render();
  }

  async function save() {
    const payload = collect();
    const saved = state.current.id
      ? await api(`api/plans/${state.current.id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api(`api/patients/${state.patient.id}/plans`, { method: "POST", body: JSON.stringify(payload) });
    state.current = saved;
    await refreshPlans();
    return saved;
  }

  const actions = {
    async "generate-portions"() {
      const current = collect();
      if (!current.energy_kcal || [current.carbs_pct, current.protein_pct, current.fat_pct].some((v) => v === null)) {
        return setMessage("Para generar la pauta por porciones completa la energía y los tres porcentajes de macronutrientes.", "warn");
      }
      const result = await api("api/portion-plan", { method: "POST", body: JSON.stringify({
        energy_kcal: current.energy_kcal, carbs_pct: current.carbs_pct, protein_pct: current.protein_pct, fat_pct: current.fat_pct,
        age_years: current.calculation_inputs.age_years,
        meals: current.meal_distribution.map((meal) => ({ meal: meal.meal, pct: meal.pct })),
        excluded_foods: current.excluded_foods, rejected_foods: current.rejected_foods, preferred_foods: current.preferred_foods,
      }) });
      state.current = { ...state.current, ...current, portion_plan: result };
      Object.assign(state, { exampleDay: 0, exampleOffset: 0, examplesStale: false });
      setMessage("Pauta por porciones generada. Revisa las porciones y ajústalas si es necesario; se guardará con el borrador.", "info");
      render();
    },
    "clear-portions"() {
      state.current = { ...state.current, ...collect(), portion_plan: null };
      setMessage("Se quitó la pauta por porciones (se aplicará al guardar el borrador).", "info");
      render();
    },
    close: () => planModal.close(),
    new: () => newDraft(),
    select(button) {
      state.current = state.plans.find((plan) => plan.id === Number(button.dataset.id)) || null;
      setMessage("");
      render();
    },
    propose() {
      const form = $("#planForm");
      const proposed = proposal({ calcWeightKg: num(form.elements.calc_weight_kg?.value), activityFactor: num(form.elements.activity_factor?.value) });
      if (proposed.error) { setMessage(proposed.error, "warn"); return false; }
      state.requirements = proposed.requirements;
      const current = { ...state.current, ...collect() };
      state.current = {
        ...current,
        formula: proposed.formula,
        calculation_inputs: proposed.calculation_inputs,
        energy_kcal: proposed.energy_kcal,
        carbs_pct: proposed.carbs_pct,
        protein_pct: proposed.protein_pct,
        fat_pct: proposed.fat_pct,
        meal_distribution: current.meal_distribution.length ? current.meal_distribution : proposed.meals.map((meal) => ({ meal, pct: null, notes: "" })),
      };
      setMessage("Se calcularon los requerimientos desde peso y talla. Valídalos antes de aprobar.", "info");
      render();
      return true;
    },
    async "full-plan"() {
      if (!actions.propose()) return;
      await actions["generate-portions"]();
      if (state.current.portion_plan) {
        setMessage("Requerimientos calculados y pauta generada con ejemplos de menú. Revisa cada valor antes de guardar y aprobar.", "ok");
        planBody.querySelector(".portion-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    "example-day"(button) {
      state.current = { ...state.current, ...collect() };
      state.exampleDay = Number(button.dataset.index);
      render();
      planBody.querySelector(".menu-examples")?.scrollIntoView({ block: "nearest" });
    },
    async "refresh-examples"() { await refreshExamples(state.exampleOffset); },
    async "more-examples"() { await refreshExamples(state.exampleOffset + 3); },
    "add-meal"() {
      state.current = { ...state.current, ...collect() };
      state.current.meal_distribution = [...state.current.meal_distribution, { meal: "", pct: null, notes: "" }];
      render();
      const inputs = planBody.querySelectorAll('[data-meal="meal"]');
      inputs[inputs.length - 1]?.focus();
    },
    "remove-meal"(button) {
      state.current = { ...state.current, ...collect() };
      state.current.meal_distribution = state.current.meal_distribution.filter((_, index) => index !== Number(button.dataset.index));
      render();
    },
    async save() {
      await save();
      setMessage("Borrador guardado.", "ok");
      render();
    },
    async approve() {
      const approver = $("#planForm").elements.approved_by.value.trim();
      if (!approver) return setMessage("Escribe el nombre de la profesional que aprueba el plan.", "warn");
      const mentions = exclusionMentions(collect());
      if (mentions.length && !confirm(`ATENCIÓN: el plan menciona alimentos excluidos o rechazados por el paciente:\n\n${mentions.map((m) => `• ${m.food} (${m.kind}): ${m.places.join(", ")}`).join("\n")}\n\n¿Confirmas que esas menciones son correctas (por ejemplo, para indicar que se eviten)?`)) return;
      if (!confirm("¿Aprobar este plan? Una vez aprobado no podrá editarse; los cambios posteriores se harán en una nueva versión.")) return;
      storage.set("nutri.approvedBy", approver);
      const saved = await save();
      state.current = await api(`api/plans/${saved.id}/approve`, { method: "POST", body: JSON.stringify({ approved_by: approver, confirm_exclusions: mentions.length > 0 }) });
      await refreshPlans();
      setMessage("Plan aprobado. Es ahora el plan vigente del paciente.", "ok");
      render();
    },
    async discard() {
      if (!confirm("¿Descartar este borrador? Dejará de aparecer en el historial.")) return;
      await api(`api/plans/${state.current.id}/discard`, { method: "POST" });
      await refreshPlans();
      state.current = state.plans[0] || null;
      setMessage("");
      render();
    },
    copy() {
      const source = state.current;
      state.current = { ...source, id: null, version: null, status: "Borrador", approved_by: null, approved_at: null, calculation_inputs: { ...(source.calculation_inputs || {}), ...snapshot() } };
      setMessage(`Nueva versión basada en la versión ${source.version}. Guarda el borrador para registrarla.`, "info");
      render();
    },
  };

  planBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !actions[button.dataset.action]) return;
    const busy = ["save", "approve", "discard"].includes(button.dataset.action);
    if (busy) planBody.querySelectorAll("button").forEach((item) => { item.disabled = true; });
    try {
      await actions[button.dataset.action](button);
    } catch (error) {
      setMessage(error.message || "No se pudo completar la acción.", "error");
    } finally {
      if (busy) planBody.querySelectorAll("button").forEach((item) => { item.disabled = false; });
    }
  });

  planBody.addEventListener("input", (event) => {
    const form = $("#planForm");
    if (!form || !form.contains(event.target)) return;
    if (["bmr_kcal", "activity_factor"].includes(event.target.name)) {
      const bmr = num(form.elements.bmr_kcal.value);
      const factor = num(form.elements.activity_factor.value);
      if (bmr && factor) form.elements.energy_kcal.value = Math.round((bmr * factor) / 10) * 10;
    }
    updateTotals();
  });

  planBody.addEventListener("submit", (event) => event.preventDefault());
  planBody.addEventListener("input", (event) => {
    if (!event.target.dataset.portion) return;
    state.examplesStale = true;
    const note = $("#examplesStale");
    if (note) note.hidden = false;
  });

  async function openPlans(patientId, { newDraft: startNew = false } = {}) {
    Object.assign(state, { message: "", messageType: "", requirements: null, exampleDay: 0, exampleOffset: 0, examplesStale: false });
    const [patient, plans] = await Promise.all([api(`api/patients/${patientId}`), api(`api/patients/${patientId}/plans`)]);
    state.patient = patient;
    state.plans = plans;
    state.current = plans.find((plan) => plan.status === "Borrador") || plans[0] || null;
    if (startNew || !plans.length) newDraft();
    else render();
    if (!planModal.open) planModal.showModal();
  }

  patients.addEventListener("click", async (event) => {
    const button = event.target.closest(".open-plans");
    if (!button) return;
    button.disabled = true;
    button.textContent = "Abriendo…";
    try {
      await openPlans(Number(button.dataset.id));
      button.textContent = "Planes";
    } catch (error) {
      button.textContent = "No disponible";
      button.title = error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("#planPreview").addEventListener("click", async (event) => {
    const button = event.target.closest(".save-plan-draft");
    if (!button) return;
    if (!lastSavedPatientId) {
      button.textContent = "Espera a que la ficha termine de guardarse";
      setTimeout(() => { if (button.isConnected) button.textContent = "Guardar como borrador de plan"; }, 1800);
      return;
    }
    try {
      await openPlans(lastSavedPatientId, { newDraft: true });
    } catch (error) {
      button.textContent = error.message;
    }
  });
})();
