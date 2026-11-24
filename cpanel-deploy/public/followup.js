// Seguimiento clínico por hitos. La ficha inicial es la versión base (editable); cada hito registra
// mediciones, la evolución, los datos propios de la atención y solo los datos de la ficha que cambiaron.
// Depende de nutri.js ($, esc, patients, load, sections, field, readFoodList, renderFoodLists, addFood, readMedList, renderMedLists, addMed, removeMed, medText, fillForm)
// y de requirements.js (ageInYears).
(() => {
  const modal = $("#followModal");
  const body = $("#followBody");
  const state = { patient: null, items: [], editing: null, baseline: {}, message: "", messageType: "" };
  // Color de las series: validado con el validador de dataviz (luminosidad, croma y contraste sobre blanco).
  const SERIES_COLOR = "#0f8a6a";
  const TYPES = ["Control nutricional", "Control telefónico / remoto", "Resultado de exámenes", "Interconsulta", "Otro"];

  // Secciones de la ficha que un hito puede actualizar (estado) y datos propios de cada atención.
  const STATE_SECTIONS = [
    ["Antecedentes médicos y alergias", "Antecedentes médicos y familiares", null],
    ["Hábitos alimentarios y preferencias", "Hábitos alimentarios, frecuencia y preferencias", null],
    ["Conducta, hidratación, actividad y sueño", "Conducta, hidratación, actividad y sueño", null],
    ["Diagnóstico nutricional", "Evaluación antropométrica y clínica", ["growth_curve", "nutritional_diagnosis"]],
    ["Objetivos y tipo de pauta", "Plan de intervención y seguimiento", ["intervention_goals", "diet_plan_type", "indicated_meal_times", "snacks_needed", "supplementation_needed", "restriction_needed", "consistency_needed", "weekly_menu_needed", "school_guidance_needed", "plan_considerations"]],
  ];
  const VISIT_SECTIONS = [
    ["Recordatorio de 24 horas", "Recordatorio de 24 horas", null],
    ["Examen físico y exámenes", "Evaluación antropométrica y clínica", ["physical_exam", "recent_tests", "tests"]],
    ["Indicaciones y próximo control", "Plan de intervención y seguimiento", ["clinical_indications", "education", "agreements", "next_control_goals", "reevaluate", "next_control_date"]],
  ];
  const fieldsOf = (title, keys) => {
    const section = sections.find(([name]) => name === title);
    const list = section ? section[1] : [];
    return keys ? list.filter((f) => keys.includes(f.key)) : list;
  };
  const FIELDS = Object.fromEntries(sections.flatMap(([, list]) => list.map((f) => [f.key, f])));
  FIELDS.evolution = { key: "evolution", label: "Evolución desde el último control", type: "textarea" };
  const STATE_KEYS = STATE_SECTIONS.flatMap(([, title, keys]) => fieldsOf(title, keys).map((f) => f.key));
  const VISIT_KEYS = ["evolution", ...VISIT_SECTIONS.flatMap(([, title, keys]) => fieldsOf(title, keys).map((f) => f.key))];

  const num = (value) => (value === "" || value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value));
  const fmt = (value, digits = 1) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("es-CL", { maximumFractionDigits: digits }));
  const signed = (value, digits = 1) => (value === null || value === undefined ? "" : `${value > 0 ? "+" : value < 0 ? "−" : "±"}${fmt(Math.abs(value), digits)}`);
  const fmtDate = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("-") : "—");
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const days = (a, b) => (new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000;
  const bmiOf = (w, h) => (w && h ? Math.round((w / (h / 100) ** 2) * 10) / 10 : null);
  const ageAt = (iso) => (state.patient?.birth_date && iso ? ageInYears(String(state.patient.birth_date).slice(0, 10), new Date(`${iso}T00:00:00`)) : null);
  const fmtAge = (years) => {
    if (years === null || years === undefined) return "—";
    const months = Math.floor(years * 12 + 1e-6);
    return `${Math.floor(months / 12)} a ${months % 12} m`;
  };
  const storage = {
    get(key) { try { return localStorage.getItem(key) || ""; } catch { return ""; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento local */ } },
  };
  const sortedItems = () => [...state.items].sort((a, b) => a.measured_at.localeCompare(b.measured_at) || a.id - b.id);

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo completar la acción.");
    return payload.data;
  }

  // ---------- Valores de la ficha ----------

  // Forma canónica para comparar valores (texto, opciones múltiples o lista de alimentos).
  function canonical(key, value) {
    const type = FIELDS[key]?.type;
    if (type === "foodlist") return JSON.stringify(readFoodList(value).map((i) => ({ food: i.food.trim(), type: i.type || "", note: i.note || "" })));
    if (type === "medlist") return JSON.stringify(readMedList(value).map((i) => ({ name: i.name.trim(), dose: i.dose.trim(), frequency: i.frequency.trim(), reason: i.reason.trim() })));
    if (type === "multi") return JSON.stringify((Array.isArray(value) ? value : value ? [value] : []).map(String).sort());
    return String(value ?? "").trim();
  }
  function display(key, value) {
    const type = FIELDS[key]?.type;
    if (type === "foodlist") return readFoodList(value).map((i) => [i.food, [i.type, i.note].filter(Boolean).join(", ")].filter(Boolean).join(" (") + ([i.type, i.note].filter(Boolean).length ? ")" : "")).join("; ");
    if (type === "medlist") return readMedList(value).map(medText).join("; ");
    if (Array.isArray(value)) return value.join(", ");
    if (type === "date" && value) return fmtDate(value);
    return String(value ?? "").trim();
  }
  // Estado de la ficha vigente en una fecha: ficha inicial + cambios de hitos anteriores (excluye el hito en edición).
  function stateAt(date, excludeId = null) {
    const data = { ...(state.patient.intake_data || {}) };
    for (const m of sortedItems()) {
      if (m.id === excludeId) continue;
      if (m.measured_at > date) continue;
      if (excludeId && m.measured_at === date && m.id > excludeId) continue;
      Object.assign(data, m.updates || {});
    }
    return data;
  }

  // ---------- Mediciones y gráficos ----------

  const KIND_ORDER = { base: 0, control: 1 };
  function timeline() {
    const p = state.patient;
    const d = p.intake_data || {};
    const points = [];
    points.push({ kind: "base", label: "Ficha inicial", measured_at: d.appointment_date || p.created_on, weight_kg: num(p.weight_kg), height_cm: num(p.height_cm), waist_cm: num(d.waist_circumference), head_cm: num(d.head_circumference), blood_pressure: d.blood_pressure || null });
    state.items.forEach((m) => points.push({ ...m, kind: "control", label: m.milestone_type }));
    let lastWeight = null;
    const heights = [];
    return points.filter((pt) => pt.measured_at)
      .sort((a, b) => a.measured_at.localeCompare(b.measured_at) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id || 0) - (b.id || 0))
      .map((pt) => {
        const row = { ...pt, age: ageAt(pt.measured_at), bmi: bmiOf(pt.weight_kg, pt.height_cm), weight_delta: null, height_delta: null, height_velocity: null };
        if (pt.weight_kg !== null && pt.weight_kg !== undefined) {
          if (lastWeight) row.weight_delta = pt.weight_kg - lastWeight.weight_kg;
          lastWeight = pt;
        }
        if (pt.height_cm !== null && pt.height_cm !== undefined) {
          if (heights.length) {
            row.height_delta = pt.height_cm - heights[heights.length - 1].height_cm;
            // Velocidad de talla contra la medición más reciente separada por al menos 3 meses.
            const reference = [...heights].reverse().find((h) => days(h.measured_at, pt.measured_at) >= 90);
            if (reference) {
              const interval = days(reference.measured_at, pt.measured_at);
              row.height_velocity = ((pt.height_cm - reference.height_cm) / interval) * 365.25;
              row.height_velocity_note = `desde ${fmtDate(reference.measured_at)} (${Math.round(interval / 30.44)} meses)`;
            } else {
              row.height_velocity_note = "sin medición previa de al menos 3 meses";
            }
          }
          heights.push(pt);
        }
        return row;
      });
  }

  function niceStep(raw) {
    const power = 10 ** Math.floor(Math.log10(raw));
    const n = raw / power;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * power;
  }

  function lineChart(title, unit, points, digits = 1) {
    if (!points.length) return `<figure class="trend-chart"><figcaption>${esc(title)} <span>(${esc(unit)})</span></figcaption><p class="plan-empty">Sin mediciones.</p></figure>`;
    const W = 320;
    const H = 170;
    const m = { l: 40, r: 44, t: 12, b: 26 };
    const xs = points.map((p) => new Date(`${p.date}T00:00:00`).getTime());
    let x0 = Math.min(...xs);
    let x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 30 * 86400000; x1 += 30 * 86400000; }
    const ys = points.map((p) => p.value);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    const pad = (y1 - y0) * 0.2 || Math.max(0.5, y1 * 0.04);
    y0 -= pad;
    y1 += pad;
    const step = niceStep((y1 - y0) / 4);
    const ticks = [];
    for (let v = Math.ceil(y0 / step) * step; v <= y1 + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    const X = (t) => m.l + ((t - x0) / (x1 - x0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const coords = points.map((p, i) => ({ ...p, x: X(xs[i]), y: Y(p.value) }));
    const path = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const last = coords[coords.length - 1];
    const shortDate = (iso) => fmtDate(iso).replace(/-(\d{2})(\d{2})$/, "-$2");
    const label = `${title}: ${points.map((p) => `${fmtDate(p.date)} ${fmt(p.value, digits)} ${unit}`).join("; ")}`;
    return `<figure class="trend-chart"><figcaption>${esc(title)} <span>(${esc(unit)})</span></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
        ${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${m.l - 6}" y="${(Y(v) + 3.5).toFixed(1)}" class="tick" text-anchor="end">${fmt(v, step < 1 ? 1 : 0)}</text>`).join("")}
        <line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" class="axis"/>
        <text x="${m.l}" y="${H - 8}" class="tick">${esc(shortDate(points[0].date))}</text>
        ${points.length > 1 ? `<text x="${W - m.r}" y="${H - 8}" class="tick" text-anchor="end">${esc(shortDate(last.date))}</text>` : ""}
        ${coords.length > 1 ? `<path d="${path}" fill="none" stroke="${SERIES_COLOR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
        ${coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="${SERIES_COLOR}" stroke="#fff" stroke-width="2"/>`).join("")}
        <text x="${(last.x + 8).toFixed(1)}" y="${(last.y + 4).toFixed(1)}" class="end-label">${fmt(last.value, digits)}</text>
        ${coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="12" class="hit" data-tip="${esc(`${c.kindLabel} · ${fmtDate(c.date)}${c.age !== null ? ` · ${fmtAge(c.age)}` : ""}|${fmt(c.value, digits)} ${unit}`)}"/>`).join("")}
      </svg><div class="chart-tip" role="status" hidden></div></figure>`;
  }

  // ---------- Render ----------

  function summary(rows) {
    const base = rows.find((r) => r.kind === "base");
    const lastWith = (key) => [...rows].reverse().find((r) => r[key] !== null && r[key] !== undefined);
    const tile = (label, key, unit) => {
      const latest = lastWith(key);
      const delta = latest && base && base[key] !== null && base[key] !== undefined && latest !== base ? latest[key] - base[key] : null;
      return `<article><small>${label}</small><b>${latest ? `${fmt(latest[key])} ${unit}` : "—"}</b><em>${latest ? `${latest.kind === "base" ? "Ficha inicial" : fmtDate(latest.measured_at)}${delta !== null ? ` · ${signed(delta)} ${unit} vs ficha inicial` : ""}` : "Sin registro"}</em></article>`;
    };
    const next = state.patient.next_control;
    return `<div class="follow-summary">
      ${tile("Peso", "weight_kg", "kg")}
      ${tile("Talla", "height_cm", "cm")}
      ${tile("IMC", "bmi", "kg/m²")}
      <article><small>Hitos</small><b>${state.items.length}</b><em>${next ? `Próximo control: ${fmtDate(next.date)}` : state.items.length ? `Último: ${fmtDate(sortedItems().pop().measured_at)}` : "Aún no hay hitos"}</em></article>
    </div>`;
  }

  function charts(rows) {
    const series = (key) => rows.filter((r) => r[key] !== null && r[key] !== undefined).map((r) => ({ date: r.measured_at, value: r[key], age: r.age, kindLabel: r.kind === "base" ? "Ficha inicial" : r.label }));
    return `<div class="follow-charts">${lineChart("Peso", "kg", series("weight_kg"))}${lineChart("Talla", "cm", series("height_cm"))}${lineChart("IMC", "kg/m²", series("bmi"))}</div>
      <details class="measure-table"><summary>Tabla de mediciones</summary>${measureTable(rows)}</details>`;
  }

  function measureTable(rows) {
    return `<div class="table-scroll"><table class="catalog-table follow-table">
      <thead><tr><th>Fecha</th><th>Edad</th><th>Registro</th><th>Peso (kg)</th><th>Talla (cm)</th><th>Vel. talla</th><th>IMC</th><th>P. abd.</th><th>P. cran.</th><th>PA</th></tr></thead>
      <tbody>${[...rows].reverse().filter((r) => r.kind !== "control" || r.weight_kg !== null || r.height_cm !== null || r.waist_cm !== null || r.head_cm !== null || r.blood_pressure).map((r) => `<tr class="${r.kind}">
        <td>${fmtDate(r.measured_at)}</td><td>${fmtAge(r.age)}</td><td>${esc(r.label)}</td>
        <td>${fmt(r.weight_kg)}${r.weight_delta !== null ? `<small>${signed(r.weight_delta)} kg</small>` : ""}</td>
        <td>${fmt(r.height_cm)}${r.height_delta !== null ? `<small>${signed(r.height_delta)} cm</small>` : ""}</td>
        <td>${r.height_velocity !== null ? `${fmt(r.height_velocity)} cm/año<small>${esc(r.height_velocity_note)}</small>` : r.height_velocity_note ? `<small>${esc(r.height_velocity_note)}</small>` : "—"}</td>
        <td>${fmt(r.bmi)}</td><td>${fmt(r.waist_cm)}</td><td>${fmt(r.head_cm)}</td><td>${esc(r.blood_pressure || "—")}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  // Estado actual: datos clave de la ficha vigente, indicando el hito que los actualizó.
  function currentPanel() {
    const data = state.patient.current_data || state.patient.intake_data || {};
    const sources = state.patient.current_sources || {};
    const keys = ["food_allergens", "rejected_foods", "favorite_foods", "conditions", "medications", "physical_activity", "nutritional_diagnosis", "intervention_goals", "meal_times"];
    const rows = keys.map((key) => [key, display(key, data[key])]).filter(([, value]) => value);
    return `<section class="current-state"><h4>Estado actual de la ficha</h4>
      ${rows.length ? `<dl>${rows.map(([key, value]) => `<dt>${esc(FIELDS[key]?.label || key)}</dt><dd>${esc(value)}<small>${sources[key] ? `actualizado en hito ${fmtDate(sources[key].date)}` : "ficha inicial"}</small></dd>`).join("")}</dl>` : `<p class="plan-empty">La ficha no registra estos datos.</p>`}
      <small class="hint">Incluye la ficha inicial y los cambios registrados en cada hito. Los planes de alimentación usan este estado.</small>
    </section>`;
  }

  function milestoneForm() {
    const editing = state.editing.item;
    const date = editing?.measured_at || todayIso();
    const v = (key) => (editing?.[key] === null || editing?.[key] === undefined ? "" : esc(editing[key]));
    const group = (title, fields, open = false, cls = "") => `<details class="ms-section ${cls}" ${open ? "open" : ""}><summary>${esc(title)}<span class="ms-count" data-count-for="${esc(title)}"></span></summary><div class="field-grid">${fields.map(field).join("")}</div></details>`;
    return `<form id="milestoneForm" class="measure-form milestone-form" novalidate>
      <h4>${editing ? `Editar hito del ${fmtDate(editing.measured_at)}` : "Nuevo hito de seguimiento"}</h4>
      <div class="measure-grid">
        <label>Fecha<input name="measured_at" type="date" max="${todayIso()}" value="${esc(date)}"></label>
        <label>Tipo de atención<select name="milestone_type">${TYPES.map((t) => `<option ${t === (editing?.milestone_type || TYPES[0]) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <label>Profesional que atiende<input name="attended_by" maxlength="180" value="${editing ? v("attended_by") : esc(storage.get("nutri.attendedBy") || storage.get("nutri.approvedBy"))}"></label>
      </div>
      <fieldset class="ms-measures"><legend>Mediciones</legend><div class="measure-grid">
        <label>Peso (kg)<input name="weight_kg" type="number" min="0.5" max="250" step="0.1" value="${v("weight_kg")}"></label>
        <label>Talla (cm)<input name="height_cm" type="number" min="30" max="230" step="0.1" value="${v("height_cm")}"></label>
        <label>Perímetro abdominal (cm)<input name="waist_cm" type="number" min="20" max="200" step="0.1" value="${v("waist_cm")}"></label>
        <label>Perímetro craneano (cm)<input name="head_cm" type="number" min="20" max="70" step="0.1" value="${v("head_cm")}"></label>
        <label>Presión arterial (mmHg)<input name="blood_pressure" maxlength="20" placeholder="Ej.: 100/65" value="${v("blood_pressure")}"></label>
      </div><p class="calc-variables" id="measurePreview"></p></fieldset>
      <div class="field-grid">${field(FIELDS.evolution)}</div>
      <section class="ms-state">
        <h5>Actualizar la ficha <span id="changeCount" class="change-count"></span></h5>
        <p class="hint">Los campos muestran los datos vigentes a la fecha del hito. Modifica solo lo que cambió: se guardará como un cambio de este hito y la ficha inicial no se altera.</p>
        ${STATE_SECTIONS.map(([title, sectionTitle, keys]) => group(title, fieldsOf(sectionTitle, keys))).join("")}
      </section>
      <section class="ms-visit"><h5>Registro de la atención</h5>
        ${VISIT_SECTIONS.map(([title, sectionTitle, keys], i) => group(title, fieldsOf(sectionTitle, keys), i === 2)).join("")}
      </section>
      <label>Observaciones<textarea name="notes" rows="2" maxlength="5000">${v("notes")}</textarea></label>
      <div class="form-buttons"><button type="button" class="plain" data-action="cancel-edit">Cancelar</button><button type="button" class="save" data-action="save-milestone">${editing ? "Guardar cambios del hito" : "Guardar hito"}</button></div>
    </form>`;
  }

  // Completa el formulario: estado vigente a la fecha (+ cambios del hito en edición) y registro de la atención.
  function fillMilestoneForm() {
    const formEl = $("#milestoneForm");
    const editing = state.editing.item;
    const date = formEl.elements.measured_at.value || todayIso();
    state.baseline = stateAt(date, editing?.id ?? null);
    const values = { ...state.baseline, ...(editing?.updates || {}) };
    VISIT_KEYS.forEach((key) => { values[key] = editing?.record?.[key] ?? ""; });
    for (const key of [...STATE_KEYS, ...VISIT_KEYS]) {
      const controls = [...formEl.querySelectorAll(`[name="${key}"]`)];
      const value = values[key];
      controls.forEach((control) => {
        if (control.type === "checkbox") control.checked = (Array.isArray(value) ? value : value ? [value] : []).includes(control.value);
        else if (control.closest("[data-foodlist]")) control.value = JSON.stringify(readFoodList(value));
        else if (control.closest("[data-medlist]")) control.value = JSON.stringify(readMedList(value));
        else control.value = value ?? "";
      });
    }
    renderFoodLists();
    renderMedLists();
    applyConditions(formEl);
    refreshChanges();
  }

  function applyConditions(formEl) {
    formEl.querySelectorAll("[data-when]").forEach((node) => {
      const all = [...formEl.querySelectorAll(`[name="${node.dataset.when}"]`)];
      node.hidden = !all.some((el) => el.value === node.dataset.value && (el.type !== "checkbox" || el.checked));
    });
  }

  function readValue(formEl, key) {
    const controls = [...formEl.querySelectorAll(`[name="${key}"]`)];
    if (!controls.length) return undefined;
    if (FIELDS[key]?.type === "multi") return controls.filter((c) => c.checked).map((c) => c.value);
    if (FIELDS[key]?.type === "foodlist") return readFoodList(controls[0].value);
    if (FIELDS[key]?.type === "medlist") return readMedList(controls[0].value);
    return controls[0].value.trim();
  }

  function changedKeys(formEl) {
    return STATE_KEYS.filter((key) => {
      const value = readValue(formEl, key);
      return value !== undefined && canonical(key, value) !== canonical(key, state.baseline[key]);
    });
  }

  function refreshChanges() {
    const formEl = $("#milestoneForm");
    if (!formEl) return;
    const changed = new Set(changedKeys(formEl));
    formEl.querySelectorAll(".ms-state .field").forEach((node) => {
      const control = node.querySelector("[name]");
      node.classList.toggle("changed", Boolean(control && changed.has(control.name)));
    });
    formEl.querySelectorAll(".ms-state details").forEach((details) => {
      const n = details.querySelectorAll(".field.changed").length;
      details.querySelector(".ms-count").textContent = n ? ` · ${n} cambio${n > 1 ? "s" : ""}` : "";
    });
    $("#changeCount").textContent = changed.size ? `${changed.size} dato${changed.size > 1 ? "s" : ""} modificado${changed.size > 1 ? "s" : ""}` : "sin cambios";
    updatePreview();
  }

  function updatePreview() {
    const formEl = $("#milestoneForm");
    const node = $("#measurePreview");
    if (!formEl || !node) return;
    const date = formEl.elements.measured_at.value;
    const w = num(formEl.elements.weight_kg.value);
    const h = num(formEl.elements.height_cm.value);
    const rows = timeline().filter((r) => !(state.editing.item && r.id === state.editing.item.id && r.kind === "control") && r.measured_at <= (date || "9999"));
    const prevW = [...rows].reverse().find((r) => r.weight_kg !== null && r.weight_kg !== undefined);
    const prevH = [...rows].reverse().find((r) => r.height_cm !== null && r.height_cm !== undefined);
    const parts = [];
    const age = ageAt(date);
    if (age !== null) parts.push(`Edad a la fecha: ${fmtAge(age)}`);
    if (w && prevW) parts.push(`Peso ${signed(w - prevW.weight_kg)} kg desde ${fmtDate(prevW.measured_at)}`);
    if (h && prevH) parts.push(`Talla ${signed(h - prevH.height_cm)} cm desde ${fmtDate(prevH.measured_at)}`);
    const bmi = bmiOf(w, h || prevH?.height_cm);
    if (bmi) parts.push(`IMC ${fmt(bmi)} kg/m²${!h && prevH ? " (con la última talla)" : ""}`);
    node.textContent = parts.join(" · ");
  }

  // Listas (alimentos u opciones múltiples): se muestra lo agregado y lo quitado; otros campos: antes → después.
  function changeText(key, before, after) {
    const type = FIELDS[key]?.type;
    if (type === "foodlist" || type === "multi" || type === "medlist") {
      const items = (value) => (type === "foodlist" ? readFoodList(value).map((i) => ({ id: i.food.trim().toLowerCase(), text: display(key, [i]) }))
        : type === "medlist" ? readMedList(value).map((i) => ({ id: i.name.trim().toLowerCase(), text: medText(i) }))
        : (Array.isArray(value) ? value : value ? [value] : []).map((v) => ({ id: String(v), text: String(v) })));
      const a = items(before);
      const b = items(after);
      const added = b.filter((x) => !a.some((y) => y.id === x.id));
      const removed = a.filter((x) => !b.some((y) => y.id === x.id));
      const edited = b.filter((x) => a.some((y) => y.id === x.id && y.text !== x.text));
      const parts = [
        added.length ? `<span class="after">se agregó ${esc(added.map((x) => x.text).join("; "))}</span>` : "",
        removed.length ? `<span class="removed-item">se quitó ${esc(removed.map((x) => x.text).join("; "))}</span>` : "",
        edited.length ? `<span class="after">se modificó ${esc(edited.map((x) => x.text).join("; "))}</span>` : "",
      ].filter(Boolean);
      return parts.join(" · ") || "sin cambios";
    }
    return `<span class="before">${esc(display(key, before) || "sin dato")}</span> → <span class="after">${esc(display(key, after) || "sin dato")}</span>`;
  }

  function milestoneCard(m, rowsById) {
    const row = rowsById.get(m.id) || {};
    const before = stateAt(m.measured_at, m.id);
    const measures = [
      m.weight_kg !== null ? `Peso ${fmt(m.weight_kg)} kg${row.weight_delta !== null && row.weight_delta !== undefined ? ` (${signed(row.weight_delta)})` : ""}` : null,
      m.height_cm !== null ? `Talla ${fmt(m.height_cm)} cm${row.height_delta !== null && row.height_delta !== undefined ? ` (${signed(row.height_delta)})` : ""}` : null,
      row.bmi ? `IMC ${fmt(row.bmi)}` : null,
      row.height_velocity !== null && row.height_velocity !== undefined ? `Vel. talla ${fmt(row.height_velocity)} cm/año` : null,
      m.waist_cm !== null ? `P. abdominal ${fmt(m.waist_cm)} cm` : null,
      m.head_cm !== null ? `P. craneano ${fmt(m.head_cm)} cm` : null,
      m.blood_pressure ? `PA ${m.blood_pressure}` : null,
    ].filter(Boolean);
    const changes = Object.entries(m.updates || {});
    const visit = VISIT_KEYS.filter((key) => key !== "evolution" && display(key, m.record?.[key]));
    return `<article class="milestone">
      <header><div><b>${fmtDate(m.measured_at)}</b> · ${esc(m.milestone_type)} · ${fmtAge(ageAt(m.measured_at))}${m.attended_by ? `<small>Atendió: ${esc(m.attended_by)}</small>` : ""}</div>
        <div class="row-actions"><button type="button" class="plain" data-action="edit-milestone" data-id="${m.id}">Editar</button><button type="button" class="danger" data-action="delete-milestone" data-id="${m.id}">Eliminar</button></div></header>
      ${measures.length ? `<p class="ms-line">${esc(measures.join(" · "))}</p>` : ""}
      ${m.record?.evolution ? `<p><b>Evolución:</b> ${esc(m.record.evolution)}</p>` : ""}
      ${changes.length ? `<div class="ms-changes"><h5>Cambios en la ficha</h5><ul>${changes.map(([key, value]) => `<li><b>${esc(FIELDS[key]?.label || key)}:</b> ${changeText(key, before[key], value)}</li>`).join("")}</ul></div>` : ""}
      ${visit.length ? `<dl class="ms-record">${visit.map((key) => `<dt>${esc(FIELDS[key]?.label || key)}</dt><dd>${esc(display(key, m.record[key]))}</dd>`).join("")}</dl>` : ""}
      ${m.notes ? `<p class="ms-notes"><b>Observaciones:</b> ${esc(m.notes)}</p>` : ""}
    </article>`;
  }

  function baseCard() {
    const p = state.patient;
    const d = p.intake_data || {};
    return `<article class="milestone base"><header><div><b>${fmtDate(d.appointment_date || p.created_on)}</b> · Ficha inicial (línea base) · ${fmtAge(ageAt(d.appointment_date || p.created_on))}</div>
      <div class="row-actions"><button type="button" class="plain" data-action="open-intake">Ver o editar ficha inicial</button></div></header>
      <p class="ms-line">${esc([p.weight_kg ? `Peso ${fmt(num(p.weight_kg))} kg` : null, p.height_cm ? `Talla ${fmt(num(p.height_cm))} cm` : null, bmiOf(num(p.weight_kg), num(p.height_cm)) ? `IMC ${fmt(bmiOf(num(p.weight_kg), num(p.height_cm)))}` : null].filter(Boolean).join(" · ") || "Sin mediciones")}</p>
      ${d.nutritional_diagnosis ? `<p><b>Diagnóstico nutricional inicial:</b> ${esc(d.nutritional_diagnosis)}</p>` : ""}
      ${d.consultation_reason ? `<p><b>Motivo de consulta:</b> ${esc(display("consultation_reason", d.consultation_reason))}</p>` : ""}
    </article>`;
  }

  function render() {
    const p = state.patient;
    const rows = timeline();
    const rowsById = new Map(rows.filter((r) => r.kind === "control").map((r) => [r.id, r]));
    body.innerHTML = `<button class="close" type="button" data-action="close" aria-label="Cerrar seguimiento">×</button>
      <small class="eyebrow">SEGUIMIENTO CLÍNICO</small>
      <h2>${esc(p.full_name)}</h2>
      <p class="form-intro">La ficha inicial es la versión base. Cada hito registra la atención y solo los datos que cambiaron; el estado actual combina ambos.</p>
      ${summary(rows)}
      ${charts(rows)}
      ${currentPanel()}
      ${state.editing ? milestoneForm() : `<div class="form-buttons start"><button type="button" class="save" data-action="new-milestone">＋ Nuevo hito</button></div>`}
      <p id="followMessage" class="catalog-message ${state.messageType}" role="status">${esc(state.message)}</p>
      <h4 class="follow-title">Registro clínico</h4>
      <div class="milestones">${sortedItems().reverse().map((m) => milestoneCard(m, rowsById)).join("")}${baseCard()}</div>`;
    if (state.editing) fillMilestoneForm();
  }

  function setMessage(text, type = "") {
    state.message = text;
    state.messageType = type;
    const node = $("#followMessage");
    if (node) { node.textContent = text; node.className = `catalog-message ${type}`; }
  }

  async function reload() {
    const [patient, items] = await Promise.all([api(`api/patients/${state.patient.id}`), api(`api/patients/${state.patient.id}/milestones`)]);
    state.patient = patient;
    state.items = items;
    load().catch(() => {});
  }

  // ---------- Acciones ----------

  const actions = {
    close: () => modal.close(),
    "new-milestone"() {
      state.editing = { item: null };
      state.message = "";
      render();
      $("#milestoneForm").scrollIntoView({ behavior: "smooth", block: "start" });
    },
    "edit-milestone"(button) {
      state.editing = { item: structuredClone(state.items.find((m) => m.id === Number(button.dataset.id))) };
      state.message = "";
      render();
      $("#milestoneForm").scrollIntoView({ behavior: "smooth", block: "start" });
    },
    "cancel-edit"() { state.editing = null; state.message = ""; render(); },
    async "save-milestone"() {
      const formEl = $("#milestoneForm");
      formEl.querySelectorAll("[data-foodlist]").forEach((box) => { if (box.querySelector('[data-food="food"]').value.trim()) addFood(box); });
      formEl.querySelectorAll("[data-medlist]").forEach((box) => { if (box.querySelector('[data-med="name"]').value.trim()) addMed(box); });
      const updates = Object.fromEntries(changedKeys(formEl).map((key) => [key, readValue(formEl, key)]));
      const record = Object.fromEntries(VISIT_KEYS.map((key) => [key, readValue(formEl, key)]).filter(([, value]) => (Array.isArray(value) ? value.length : value)));
      const el = formEl.elements;
      const payload = {
        measured_at: el.measured_at.value, milestone_type: el.milestone_type.value, attended_by: el.attended_by.value.trim(),
        weight_kg: num(el.weight_kg.value), height_cm: num(el.height_cm.value), waist_cm: num(el.waist_cm.value), head_cm: num(el.head_cm.value),
        blood_pressure: el.blood_pressure.value.trim(), notes: el.notes.value.trim(), updates, record,
      };
      const editingId = state.editing.item?.id;
      if (editingId) await api(`api/milestones/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api(`api/patients/${state.patient.id}/milestones`, { method: "POST", body: JSON.stringify(payload) });
      if (payload.attended_by) storage.set("nutri.attendedBy", payload.attended_by);
      state.editing = null;
      await reload();
      const n = Object.keys(updates).length;
      state.message = `${editingId ? "Hito actualizado" : `Hito del ${fmtDate(payload.measured_at)} guardado`}${n ? ` con ${n} cambio${n > 1 ? "s" : ""} en la ficha` : ""}.`;
      state.messageType = "ok";
      render();
    },
    async "delete-milestone"(button) {
      const item = state.items.find((m) => m.id === Number(button.dataset.id));
      if (!confirm(`¿Eliminar el hito del ${fmtDate(item?.measured_at)}? Sus cambios en la ficha dejarán de aplicarse.`)) return;
      await api(`api/milestones/${button.dataset.id}`, { method: "DELETE" });
      if (state.editing?.item?.id === item?.id) state.editing = null;
      await reload();
      state.message = "Hito eliminado.";
      state.messageType = "ok";
      render();
    },
    "open-intake"() {
      modal.close();
      fillForm(state.patient);
    },
  };

  body.addEventListener("click", async (event) => {
    const medAdd = event.target.closest("#milestoneForm [data-med-add]");
    if (medAdd) { addMed(medAdd.closest("[data-medlist]")); refreshChanges(); return; }
    const medRemove = event.target.closest("#milestoneForm [data-med-remove]");
    if (medRemove) { removeMed(medRemove); refreshChanges(); return; }
    const add = event.target.closest("#milestoneForm [data-food-add]");
    if (add) { addFood(add.closest("[data-foodlist]")); refreshChanges(); return; }
    const remove = event.target.closest("#milestoneForm [data-food-remove]");
    if (remove) {
      const hidden = remove.closest("[data-foodlist]").querySelector("input[type=hidden]");
      const items = readFoodList(hidden.value);
      items.splice(Number(remove.dataset.foodRemove), 1);
      hidden.value = JSON.stringify(items);
      renderFoodLists();
      refreshChanges();
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button || !actions[button.dataset.action]) return;
    button.disabled = true;
    try { await actions[button.dataset.action](button); } catch (error) { setMessage(error.message, "error"); } finally { if (button.isConnected) button.disabled = false; }
  });
  body.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.closest("#milestoneForm .food-add")) { event.preventDefault(); addFood(event.target.closest("[data-foodlist]")); refreshChanges(); }
    if (event.key === "Enter" && event.target.closest("#milestoneForm .med-add")) { event.preventDefault(); addMed(event.target.closest("[data-medlist]")); refreshChanges(); }
  });
  body.addEventListener("change", (event) => {
    const formEl = event.target.closest("#milestoneForm");
    if (!formEl) return;
    // Al cambiar la fecha se recalcula el estado vigente a esa fecha, conservando lo que ya se escribió.
    if (event.target.name === "measured_at") {
      const changed = Object.fromEntries(changedKeys(formEl).map((key) => [key, readValue(formEl, key)]));
      const visit = Object.fromEntries(VISIT_KEYS.map((key) => [key, readValue(formEl, key)]));
      state.editing = { item: { ...(state.editing.item || {}), measured_at: formEl.elements.measured_at.value, updates: changed, record: visit } };
      const keep = ["milestone_type", "attended_by", "weight_kg", "height_cm", "waist_cm", "head_cm", "blood_pressure", "notes"].map((name) => [name, formEl.elements[name].value]);
      fillMilestoneForm();
      keep.forEach(([name, value]) => { formEl.elements[name].value = value; });
    }
    applyConditions(formEl);
    refreshChanges();
  });
  body.addEventListener("input", (event) => { if (event.target.closest("#milestoneForm")) refreshChanges(); });
  body.addEventListener("submit", (event) => event.preventDefault());

  // Tooltip de los gráficos (el área de detección es mayor que el punto).
  body.addEventListener("pointerover", (event) => {
    const hit = event.target.closest("[data-tip]");
    if (!hit) return;
    const figure = hit.closest(".trend-chart");
    const tip = figure.querySelector(".chart-tip");
    const [title, value] = hit.dataset.tip.split("|");
    tip.innerHTML = `<b>${esc(value)}</b><span>${esc(title)}</span>`;
    tip.hidden = false;
    const box = figure.getBoundingClientRect();
    const dot = hit.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(dot.left - box.left + dot.width / 2, 70), box.width - 70)}px`;
    tip.style.top = `${dot.top - box.top - 6}px`;
  });
  body.addEventListener("pointerout", (event) => {
    const hit = event.target.closest("[data-tip]");
    if (hit) hit.closest(".trend-chart").querySelector(".chart-tip").hidden = true;
  });

  async function openFollowup(patientId) {
    const [patient, items] = await Promise.all([api(`api/patients/${patientId}`), api(`api/patients/${patientId}/milestones`)]);
    Object.assign(state, { patient, items, editing: null, message: "", messageType: "" });
    render();
    if (!modal.open) modal.showModal();
  }

  patients.addEventListener("click", async (event) => {
    const button = event.target.closest(".open-followup");
    if (!button) return;
    button.disabled = true;
    button.textContent = "Abriendo…";
    try {
      await openFollowup(Number(button.dataset.id));
      button.textContent = "Seguimiento";
    } catch (error) {
      button.textContent = "No disponible";
      button.title = error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
