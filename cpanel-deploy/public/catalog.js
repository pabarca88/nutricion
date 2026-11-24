// Base de alimentos: grupos de intercambio, catálogo (USDA), reglas de porciones por edad.
// Depende de $ y esc definidos en nutri.js.
(() => {
  const views = { inicio: $("#inicio"), alimentos: $("#alimentos") };
  const panel = $("#catalogPanel");
  const foodModal = $("#foodModal");
  const foodBody = $("#foodBody");
  const state = { tab: "groups", groups: [], foods: [], rules: [], ranges: [], loaded: false, filterGroup: "", query: "", showInactive: false, editingGroup: null, message: "", messageType: "", food: null, usdaResults: [], usdaPortions: [] };
  const MEAL_TYPES = [["desayuno", "Desayuno"], ["colacion", "Colación"], ["almuerzo", "Almuerzo"], ["once", "Once"], ["cena", "Cena"]];
  const GROUP_FIELDS = [["ref_kcal", "kcal", "kcal"], ["ref_protein_g", "protein_g", "Proteínas (g)"], ["ref_fat_g", "fat_g", "Grasas (g)"], ["ref_carbs_g", "carbs_g", "Carbohidratos (g)"]];

  const num = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
  const fmt = (value, digits = 1) => (value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString("es-CL", { maximumFractionDigits: digits }));
  const macros = (r) => `${fmt(r.kcal, 0)} kcal · P ${fmt(r.protein_g)} g · G ${fmt(r.fat_g)} g · C ${fmt(r.carbs_g)} g`;
  const norm = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tags = (value) => String(value || "").split(",").map((t) => t.trim()).filter(Boolean);

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo completar la acción.");
    return payload.data;
  }

  async function loadCatalog() {
    const [groups, foods, rules] = await Promise.all([api("api/food-groups"), api("api/foods?inactive=1"), api("api/portion-rules")]);
    Object.assign(state, { groups, foods, rules, loaded: true });
    state.ranges = rangesFromRules(rules);
    fillSuggestions();
  }

  // Sugerencias para los campos de alimentos de la ficha: nombres, etiquetas y grupos del catálogo.
  function fillSuggestions() {
    const terms = new Set();
    state.foods.filter((food) => food.active).forEach((food) => { terms.add(food.name); tags(food.tags).forEach((tag) => terms.add(tag)); });
    state.groups.forEach((group) => terms.add(group.name));
    $("#foodSuggestions").innerHTML = [...terms].sort((a, b) => a.localeCompare(b, "es")).map((term) => `<option value="${esc(term)}"></option>`).join("");
  }

  function setMessage(text, type = "") {
    state.message = text;
    state.messageType = type;
    const node = $("#catalogMessage");
    if (node) { node.textContent = text; node.className = `catalog-message ${type}`; }
  }

  // ---------- Vistas ----------

  function showView(name) {
    Object.entries(views).forEach(([key, node]) => { node.hidden = key !== name; });
    $("#breadcrumb").innerHTML = name === "alimentos" ? "Inicio / <b>Base de alimentos</b>" : "Inicio / <b>Pacientes</b>";
    ["navHome", "navPatients", "navFoods"].forEach((id) => $(`#${id}`).classList.toggle("active", name === "alimentos" ? id === "navFoods" : id === "navHome"));
  }
  const wrapNav = (id) => {
    const previous = $(`#${id}`).onclick;
    $(`#${id}`).onclick = (event) => { showView("inicio"); previous?.(event); };
  };
  wrapNav("navHome");
  wrapNav("navPatients");
  $("#navFoods").onclick = async (event) => {
    event.preventDefault();
    showView("alimentos");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!state.loaded) {
      try { await loadCatalog(); } catch (error) { panel.innerHTML = `<p class="catalog-message error">${esc(error.message)}</p>`; return; }
    }
    render();
  };

  document.querySelectorAll("#alimentos [data-tab]").forEach((tab) => {
    tab.onclick = () => {
      state.tab = tab.dataset.tab;
      document.querySelectorAll("#alimentos [data-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      setMessage("");
      render();
    };
  });

  function render() {
    panel.innerHTML = { groups: renderGroups, foods: renderFoods, rules: renderRules }[state.tab]() + `<p id="catalogMessage" class="catalog-message ${state.messageType}" role="status">${esc(state.message)}</p>`;
    if (state.tab === "foods") renderFoodRows();
  }

  // ---------- Grupos ----------

  function renderGroups() {
    return `<div class="title"><div><small>GRUPOS DE INTERCAMBIO</small><h2>Porción de referencia por grupo</h2><p>El generador de la pauta usa estos valores por porción. Si no defines valores propios, se usa la mediana de los alimentos activos del grupo (datos USDA). Revísalos antes de usar la pauta en pacientes.</p></div></div>
      <div class="table-scroll"><table class="catalog-table"><thead><tr><th>Grupo</th><th>Alimentos</th><th>Porción de referencia</th><th>Origen</th><th></th></tr></thead><tbody>
      ${state.groups.map((group) => (state.editingGroup === group.id ? groupForm(group) : `<tr>
        <td><b>${esc(group.name)}</b>${group.notes ? `<small>${esc(group.notes)}</small>` : ""}</td>
        <td>${group.food_count}</td>
        <td>${group.ref.kcal === null ? "Sin alimentos" : macros(group.ref)}</td>
        <td><span class="source-badge ${group.ref_source === "manual" ? "manual" : ""}">${group.ref_source === "manual" ? "Definida por la profesional" : group.ref_source === "mediana" ? "Mediana USDA · revisar" : "Sin datos"}</span></td>
        <td><button type="button" class="plain" data-action="edit-group" data-id="${group.id}">Editar</button></td></tr>`)).join("")}
      </tbody></table></div>`;
  }

  function groupForm(group) {
    return `<tr class="editing"><td colspan="5"><form class="group-form" data-id="${group.id}">
      <label class="wide">Nombre del grupo<input name="name" maxlength="120" value="${esc(group.name)}"></label>
      ${GROUP_FIELDS.map(([name, key, label]) => `<label>${label}<input name="${name}" type="number" min="0" step="0.1" value="${group.manual[key] ?? ""}" placeholder="${group.computed[key] ?? ""}"><small>Mediana: ${fmt(group.computed[key])}</small></label>`).join("")}
      <label class="wide">Notas (fuente o criterio)<input name="notes" maxlength="2000" value="${esc(group.notes || "")}"></label>
      <div class="form-buttons wide"><button type="button" class="plain" data-action="clear-group">Usar mediana USDA</button><button type="button" class="plain" data-action="cancel-group">Cancelar</button><button type="button" class="save" data-action="save-group">Guardar grupo</button></div>
    </form></td></tr>`;
  }

  // ---------- Alimentos ----------

  function renderFoods() {
    return `<div class="title"><div><small>CATÁLOGO</small><h2>Alimentos</h2><p>Valores por 100 g desde USDA; la porción es la medida casera usada como intercambio. Las etiquetas (por ejemplo "leche, lactosa" o "gluten") permiten excluir alimentos por alergia o intolerancia.</p></div></div>
      <div class="catalog-filters">
        <label>Buscar<input id="foodSearch" type="search" value="${esc(state.query)}" placeholder="Nombre, alias o etiqueta"></label>
        <label>Grupo<select id="foodGroupFilter"><option value="">Todos</option>${state.groups.map((g) => `<option value="${g.id}" ${String(g.id) === state.filterGroup ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
        <label class="inline-check"><input id="foodInactive" type="checkbox" ${state.showInactive ? "checked" : ""}> Mostrar inactivos</label>
      </div>
      <div class="table-scroll"><table class="catalog-table"><thead><tr><th>Alimento</th><th>Grupo</th><th>Porción</th><th>Por porción</th><th>Fuente</th><th></th></tr></thead><tbody id="foodRows"></tbody></table></div>`;
  }

  function renderFoodRows() {
    const q = norm(state.query);
    const rows = state.foods.filter((food) => (state.showInactive || food.active)
      && (!state.filterGroup || String(food.group_id) === state.filterGroup)
      && (!q || norm(`${food.name} ${food.aliases || ""} ${food.tags || ""}`).includes(q)));
    $("#foodRows").innerHTML = rows.map((food) => `<tr class="${food.active ? "" : "inactive"}">
      <td><b>${esc(food.name)}</b>${food.aliases ? `<small>${esc(food.aliases)}</small>` : ""}${tags(food.tags).length ? `<div class="tag-list">${tags(food.tags).map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}</td>
      <td>${esc(food.group_name)}</td>
      <td>${esc(food.portion_label)}<small>${fmt(food.portion_grams)} g</small>${food.meal_types ? `<small>${esc(food.meal_types)}</small>` : ""}</td>
      <td>${macros(food.portion)}</td>
      <td><small>${food.fdc_id ? `USDA ${food.fdc_id}` : esc(food.source || "Manual")}</small></td>
      <td><button type="button" class="plain" data-action="edit-food" data-id="${food.id}">${food.active ? "Editar" : "Editar (inactivo)"}</button></td>
    </tr>`).join("") || `<tr><td colspan="6">No hay alimentos que coincidan.</td></tr>`;
  }

  // ---------- Reglas por edad ----------

  function rangesFromRules(rules) {
    const map = new Map();
    for (const rule of rules) {
      const key = `${rule.age_min_years}-${rule.age_max_years}`;
      if (!map.has(key)) map.set(key, { age_min: rule.age_min_years, age_max: rule.age_max_years, values: {} });
      map.get(key).values[rule.group_id] = { min: rule.min_portions, max: rule.max_portions };
    }
    return [...map.values()];
  }

  function renderRules() {
    return `<div class="title"><div><small>REGLAS POR EDAD</small><h2>Porciones diarias por grupo</h2><p>Define el mínimo y máximo de porciones diarias de cada grupo según el tramo de edad (años, inclusive). El generador no inventa reglas: sin ellas, la distribución solo cuadra las kcal y los macronutrientes. Deja en blanco lo que no quieras limitar.</p></div></div>
      <div id="ruleRanges">${state.ranges.map((range, index) => `<section class="rule-range" data-index="${index}">
        <div class="rule-head"><label>Desde (años)<input data-age="min" type="number" min="0" max="25" step="0.5" value="${range.age_min ?? ""}"></label><label>Hasta (años)<input data-age="max" type="number" min="0" max="25" step="0.5" value="${range.age_max ?? ""}"></label><button type="button" class="danger" data-action="remove-range" data-index="${index}">Quitar tramo</button></div>
        <div class="table-scroll"><table class="catalog-table rule-table"><thead><tr><th>Grupo</th><th>Mínimo</th><th>Máximo</th></tr></thead><tbody>
        ${state.groups.map((group) => `<tr data-group="${group.id}"><td>${esc(group.name)}</td><td><input data-limit="min" type="number" min="0" max="30" step="0.5" value="${range.values[group.id]?.min ?? ""}"></td><td><input data-limit="max" type="number" min="0" max="30" step="0.5" value="${range.values[group.id]?.max ?? ""}"></td></tr>`).join("")}
        </tbody></table></div></section>`).join("") || `<p class="plan-empty">No hay reglas definidas. Agrega un tramo de edad para empezar.</p>`}</div>
      <div class="form-buttons"><button type="button" class="plain" data-action="add-range">＋ Agregar tramo de edad</button><button type="button" class="save" data-action="save-rules">Guardar reglas</button></div>`;
  }

  function collectRanges() {
    return [...panel.querySelectorAll(".rule-range")].map((section) => ({
      age_min: num(section.querySelector('[data-age="min"]').value),
      age_max: num(section.querySelector('[data-age="max"]').value),
      values: Object.fromEntries([...section.querySelectorAll("tr[data-group]")].map((row) => [row.dataset.group, { min: num(row.querySelector('[data-limit="min"]').value), max: num(row.querySelector('[data-limit="max"]').value) }])),
    }));
  }

  // ---------- Diálogo de alimento ----------

  function openFood(food) {
    state.food = food ? { ...food } : { id: null, group_id: state.filterGroup ? Number(state.filterGroup) : state.groups[0]?.id, name: "", aliases: "", tags: "", meal_types: "", fdc_id: null, source: "", kcal_100g: "", protein_100g: "", fat_100g: "", carbs_100g: "", fiber_100g: "", portion_label: "", portion_grams: "", active: true };
    state.usdaResults = [];
    state.usdaPortions = [];
    renderFoodModal();
    foodModal.showModal();
  }

  function renderFoodModal(message = "", type = "") {
    const f = state.food;
    foodBody.innerHTML = `<button class="close" type="button" data-action="close-food" aria-label="Cerrar">×</button>
      <small class="eyebrow">${f.id ? "EDITAR ALIMENTO" : "NUEVO ALIMENTO"}</small><h2>${f.id ? esc(f.name) : "Agregar alimento al catálogo"}</h2>
      ${f.id ? "" : `<section class="usda-search"><label>Buscar en USDA (en inglés, ej.: "yogurt greek plain")<span class="search-row"><input id="usdaQuery" type="search" placeholder="Descripción en inglés"><button type="button" class="plain" data-action="usda-search">Buscar</button></span></label><div id="usdaResults">${usdaList()}</div></section>`}
      <form id="foodForm" class="food-form" novalidate>
        <label class="wide">Nombre en español<input name="name" maxlength="160" value="${esc(f.name)}" required></label>
        <label>Grupo<select name="group_id">${state.groups.map((g) => `<option value="${g.id}" ${g.id === Number(f.group_id) ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
        <label class="inline-check"><input name="active" type="checkbox" ${f.active ? "checked" : ""}> Activo (disponible para pautas)</label>
        <label class="wide">Alias o sinónimos (separados por coma)<input name="aliases" maxlength="500" value="${esc(f.aliases || "")}"></label>
        <label class="wide">Etiquetas para exclusiones (separadas por coma; ej.: leche, lactosa, gluten)<input name="tags" maxlength="300" value="${esc(f.tags || "")}"></label>
        <div class="wide"><span class="field-label">Tiempos de comida habituales (para los ejemplos de menú; ninguno = cualquiera)</span><div class="checks">${MEAL_TYPES.map(([key, label]) => `<label><input type="checkbox" name="meal_types" value="${key}" ${tags(f.meal_types).includes(key) ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></div>
        <fieldset class="wide"><legend>Porción de intercambio</legend><div class="field-grid">
          ${state.usdaPortions.length ? `<label class="wide">Medidas USDA<select data-action="usda-portion"><option value="">Elegir medida…</option>${state.usdaPortions.map((p, i) => `<option value="${i}">${esc(p.label)} = ${fmt(p.grams)} g</option>`).join("")}</select></label>` : ""}
          <label>Medida casera<input name="portion_label" maxlength="120" value="${esc(f.portion_label || "")}" placeholder="Ej.: 1 taza"></label>
          <label>Gramos<input name="portion_grams" type="number" min="0.1" step="0.1" value="${f.portion_grams ?? ""}"></label>
        </div></fieldset>
        <fieldset class="wide"><legend>Nutrientes por 100 g</legend><div class="macro-grid four">
          <label>kcal<input name="kcal_100g" type="number" min="0" step="0.01" value="${f.kcal_100g ?? ""}"></label>
          <label>Proteínas (g)<input name="protein_100g" type="number" min="0" step="0.01" value="${f.protein_100g ?? ""}"></label>
          <label>Grasas (g)<input name="fat_100g" type="number" min="0" step="0.01" value="${f.fat_100g ?? ""}"></label>
          <label>Carbohidratos (g)<input name="carbs_100g" type="number" min="0" step="0.01" value="${f.carbs_100g ?? ""}"></label>
          <label>Fibra (g)<input name="fiber_100g" type="number" min="0" step="0.01" value="${f.fiber_100g ?? ""}"></label>
        </div><p class="calc-variables" id="portionPreview"></p></fieldset>
        <p class="calc-variables wide">Fuente: ${esc(f.source || (f.fdc_id ? `USDA ${f.fdc_id}` : "ingreso manual"))}</p>
        <p id="foodMessage" class="catalog-message ${type} wide" role="status">${esc(message)}</p>
        <div class="form-buttons wide"><button type="button" class="plain" data-action="close-food">Cancelar</button><button type="button" class="save" data-action="save-food">Guardar alimento</button></div>
      </form>`;
    updatePortionPreview();
  }

  function usdaList() {
    return state.usdaResults.length ? `<ul class="usda-results">${state.usdaResults.map((item, i) => `<li><button type="button" data-action="usda-pick" data-index="${i}"><b>${esc(item.description)}</b><small>${esc(item.category || "")} · por 100 g: ${fmt(item.kcal, 0)} kcal · P ${fmt(item.protein_g)} · G ${fmt(item.fat_g)} · C ${fmt(item.carbs_g)}</small></button></li>`).join("")}</ul>` : "";
  }

  function readFoodForm() {
    const form = $("#foodForm");
    const v = (name) => form.elements[name].value;
    return { ...state.food, name: v("name"), group_id: Number(v("group_id")), aliases: v("aliases"), tags: v("tags"), meal_types: [...form.querySelectorAll('input[name="meal_types"]:checked')].map((input) => input.value).join(", "), portion_label: v("portion_label"), portion_grams: num(v("portion_grams")), kcal_100g: num(v("kcal_100g")), protein_100g: num(v("protein_100g")), fat_100g: num(v("fat_100g")), carbs_100g: num(v("carbs_100g")), fiber_100g: num(v("fiber_100g")), active: form.elements.active.checked };
  }

  function updatePortionPreview() {
    const node = $("#portionPreview");
    if (!node) return;
    const f = readFoodForm();
    if (!f.portion_grams || f.kcal_100g === null) { node.textContent = "Completa gramos y nutrientes para ver el aporte de una porción."; return; }
    const k = f.portion_grams / 100;
    node.textContent = `Una porción (${f.portion_grams} g) aporta ${macros({ kcal: f.kcal_100g * k, protein_g: (f.protein_100g || 0) * k, fat_g: (f.fat_100g || 0) * k, carbs_g: (f.carbs_100g || 0) * k })}.`;
  }

  const foodActions = {
    "close-food": () => foodModal.close(),
    async "usda-search"() {
      const query = $("#usdaQuery").value.trim();
      if (query.length < 2) return;
      state.food = readFoodForm();
      state.usdaResults = await api(`api/usda/search?q=${encodeURIComponent(query)}`);
      $("#usdaResults").innerHTML = usdaList() || `<p class="plan-empty">Sin resultados. Prueba con otras palabras en inglés.</p>`;
    },
    "usda-pick"(button) {
      const item = state.usdaResults[Number(button.dataset.index)];
      state.food = { ...readFoodForm(), fdc_id: item.fdc_id, source: `USDA FDC SR Legacy ${item.fdc_id}: ${item.description}`.slice(0, 160), kcal_100g: item.kcal, protein_100g: item.protein_g, fat_100g: item.fat_g, carbs_100g: item.carbs_g, fiber_100g: item.fiber_g };
      state.usdaPortions = item.portions || [];
      renderFoodModal(`Datos cargados desde USDA: ${item.description}. Escribe el nombre en español y elige la porción.`, "info");
    },
    async "save-food"() {
      const food = readFoodForm();
      const saved = food.id ? await api(`api/foods/${food.id}`, { method: "PUT", body: JSON.stringify(food) }) : await api("api/foods", { method: "POST", body: JSON.stringify(food) });
      await loadCatalog();
      foodModal.close();
      setMessage(`Alimento "${saved.name}" guardado.`, "ok");
      render();
    },
  };

  foodBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !foodActions[button.dataset.action] || button.tagName === "SELECT") return;
    try { await foodActions[button.dataset.action](button); } catch (error) { const node = $("#foodMessage"); if (node) { node.textContent = error.message; node.className = "catalog-message error wide"; } }
  });
  foodBody.addEventListener("change", (event) => {
    if (event.target.dataset.action !== "usda-portion" || event.target.value === "") return;
    const portion = state.usdaPortions[Number(event.target.value)];
    const form = $("#foodForm");
    form.elements.portion_label.value = portion.label;
    form.elements.portion_grams.value = portion.grams;
    updatePortionPreview();
  });
  foodBody.addEventListener("input", updatePortionPreview);
  foodBody.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.id === "usdaQuery") { event.preventDefault(); foodActions["usda-search"]().catch(() => {}); }
  });
  foodBody.addEventListener("submit", (event) => event.preventDefault());

  // ---------- Acciones del panel ----------

  const actions = {
    "edit-group"(button) { state.editingGroup = Number(button.dataset.id); render(); },
    "cancel-group"() { state.editingGroup = null; render(); },
    "clear-group"(button) { button.closest("form").querySelectorAll('input[type="number"]').forEach((input) => { input.value = ""; }); },
    async "save-group"(button) {
      const form = button.closest("form");
      const data = Object.fromEntries([...form.elements].filter((el) => el.name).map((el) => [el.name, el.type === "number" ? num(el.value) : el.value]));
      await api(`api/food-groups/${form.dataset.id}`, { method: "PUT", body: JSON.stringify(data) });
      state.editingGroup = null;
      await loadCatalog();
      setMessage("Grupo actualizado.", "ok");
      render();
    },
    "edit-food"(button) { openFood(state.foods.find((food) => food.id === Number(button.dataset.id))); },
    "add-range"() { state.ranges = [...collectRanges(), { age_min: null, age_max: null, values: {} }]; render(); },
    "remove-range"(button) { state.ranges = collectRanges().filter((_, i) => i !== Number(button.dataset.index)); render(); },
    async "save-rules"() {
      state.ranges = collectRanges();
      const rules = state.ranges.flatMap((range) => Object.entries(range.values).filter(([, v]) => v.min !== null || v.max !== null).map(([groupId, v]) => ({ age_min_years: range.age_min, age_max_years: range.age_max, group_id: Number(groupId), min_portions: v.min, max_portions: v.max })));
      if (state.ranges.some((range) => range.age_min === null || range.age_max === null)) throw new Error("Completa las edades de cada tramo.");
      state.rules = await api("api/portion-rules", { method: "PUT", body: JSON.stringify({ rules }) });
      state.ranges = rangesFromRules(state.rules);
      setMessage("Reglas guardadas.", "ok");
      render();
    },
  };

  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !actions[button.dataset.action]) return;
    try { await actions[button.dataset.action](button); } catch (error) { setMessage(error.message, "error"); }
  });
  panel.addEventListener("input", (event) => {
    if (event.target.id === "foodSearch") { state.query = event.target.value; renderFoodRows(); }
  });
  panel.addEventListener("change", (event) => {
    if (event.target.id === "foodGroupFilter") { state.filterGroup = event.target.value; renderFoodRows(); }
    if (event.target.id === "foodInactive") { state.showInactive = event.target.checked; renderFoodRows(); }
  });
  $("#addFood").onclick = async () => {
    try { if (!state.loaded) await loadCatalog(); openFood(null); } catch (error) { setMessage(error.message, "error"); }
  };

  // Carga silenciosa para las sugerencias de la ficha (si no hay MySQL, la ficha sigue funcionando).
  loadCatalog().catch(() => {});
  window.foodCatalog = { load: loadCatalog };
})();
