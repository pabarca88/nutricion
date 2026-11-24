// PDF del plan de alimentación para entregar a la familia (no incluye las notas profesionales internas).
import PDFDocument from "pdfkit";
import { amountText } from "./catalog.js";

// Familias por macronutriente principal y colores (iguales a la interfaz).
const FAMILIES = [
  { key: "carbs", title: "Carbohidratos", hint: "cereales, verduras, frutas y azúcares", codes: ["cereales", "verduras", "frutas", "azucares"], bg: "#fbf1dd", ink: "#8a5a14" },
  { key: "protein", title: "Proteínas", hint: "carnes, pescados, huevos, lácteos y leguminosas", codes: ["proteinas", "lacteos", "leguminosas"], bg: "#fbe9e3", ink: "#9c4a33" },
  { key: "fat", title: "Grasas", hint: "aceites y alimentos ricos en lípidos", codes: ["grasas", "lipidos"], bg: "#e3f3ee", ink: "#1d6d59" },
  { key: "other", title: "Otros", hint: "", codes: [], bg: "#eef2f1", ink: "#54726a" },
];
const familyOf = (code) => (FAMILIES.find((f) => f.codes.includes(code)) || FAMILIES[3]).key;
// Alimento de referencia del grupo para expresar porciones en tazas o cucharadas (prefiere los preferidos).
const measureFood = (group) => {
  const list = [...(group.suggestions || [])].sort((a, b) => Number(b.preferred) - Number(a.preferred));
  return list.find((food) => /taza|cuchar/i.test(food.portion_label)) || list[0] || null;
};
const lowerFirst = (text) => String(text || "").charAt(0).toLowerCase() + String(text || "").slice(1);

const GREEN = "#1f705d";
const INK = "#173d36";
const MUTED = "#6c837b";
const LINE = "#dce9e4";
const SOFT = "#eef7f3";
const WARN_BG = "#fff1d9";
const WARN_INK = "#8a5a14";

// Las fuentes estándar del PDF usan WinAnsi: se reemplazan los caracteres que no contiene.
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const clean = (value) => String(value ?? "")
  .replace(/★/g, "*").replace(/→/g, "->").replace(/−/g, "-").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/×/g, "x")
  .split("").filter((ch) => ch.charCodeAt(0) <= 255 || WINANSI_EXTRA.includes(ch)).join("");
const fmt = (value, digits = 1) => (value === null || value === undefined || value === "" ? "-" : Number(value).toLocaleString("es-CL", { maximumFractionDigits: digits }));
const fmtDate = (value) => {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const foodText = (item) => [item.food, [item.type, item.note].filter(Boolean).join(", ")].filter(Boolean).join(" (") + ([item.type, item.note].filter(Boolean).length ? ")" : "");

export function planPdf(plan, patient) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 60, left: 50, right: 50 }, bufferPages: true, info: { Title: clean(`Plan de alimentación - ${patient.full_name}`), Author: "NutriPediátrica" } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const ensure = (height) => { if (doc.y + height > bottom()) doc.addPage(); };
    const text = (value, options = {}) => doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(options.size || 10).fillColor(options.color || INK).text(clean(value), options.x ?? left, options.y, { width: options.width ?? width, align: options.align || "left", continued: options.continued, lineGap: 2 });
    const heading = (value) => { ensure(40); doc.moveDown(0.8); text(value, { bold: true, size: 13, color: GREEN }); doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).strokeColor(LINE).lineWidth(1).stroke(); doc.moveDown(0.5); };
    const box = (lines, bg, ink) => {
      const h = lines.reduce((acc, l) => acc + doc.font(l.bold ? "Helvetica-Bold" : "Helvetica").fontSize(l.size || 10).heightOfString(clean(l.text), { width: width - 20, lineGap: 2 }) + 2, 12);
      ensure(h + 6);
      const y = doc.y;
      doc.roundedRect(left, y, width, h, 6).fill(bg);
      doc.y = y + 7;
      for (const l of lines) text(l.text, { bold: l.bold, size: l.size, color: ink, x: left + 10, width: width - 20 });
      doc.y = y + h + 6;
    };
    // Tabla simple con salto de página y encabezado repetido.
    const table = (columns, rows) => {
      const pad = 5;
      const totalW = columns.reduce((a, c) => a + c.width, 0);
      const scale = width / totalW;
      const cols = columns.map((c) => ({ ...c, w: c.width * scale }));
      const fullWidth = [{ w: width, align: "left" }];
      const rowHeight = (cells, bold, layout) => Math.max(...cells.map((cell, i) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(clean(cell), { width: layout[i].w - pad * 2 }))) + pad * 2;
      // span: la fila ocupa todo el ancho (títulos de sección dentro de la tabla).
      const drawRow = (cells, { header = false, fill = null, bold = false, color = null, span = false } = {}) => {
        const layout = span ? fullWidth : cols;
        if (span) cells = [cells[0]];
        const h = rowHeight(cells, header || bold, layout);
        // Un título de sección (span) no queda solo al pie de la página: exige espacio para al menos una fila más.
        if (doc.y + h + (span ? 45 : 0) > bottom()) { doc.addPage(); if (!header) drawRow(cols.map((c) => c.title), { header: true }); }
        const y = doc.y;
        if (header || fill) doc.rect(left, y, width, h).fill(header ? SOFT : fill);
        let x = left;
        cells.forEach((cell, i) => {
          doc.font(header || bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(color || (header ? GREEN : INK)).text(clean(cell), x + pad, y + pad, { width: layout[i].w - pad * 2, align: layout[i].align || "left" });
          x += layout[i].w;
        });
        doc.moveTo(left, y + h).lineTo(left + width, y + h).strokeColor(LINE).lineWidth(0.7).stroke();
        doc.y = y + h;
      };
      ensure(40);
      drawRow(cols.map((c) => c.title), { header: true });
      // Cada fila es un arreglo de celdas (ojo: un arreglo tiene el método .fill, no confundir con un color de fondo).
      rows.forEach((row) => (Array.isArray(row) ? drawRow(row) : drawRow(row.cells, { fill: row.fill, bold: row.bold, color: row.color, span: row.span })));
      doc.moveDown(0.6);
    };

    const ci = plan.calculation_inputs || {};
    const bmi = ci.bmi || (ci.weight_kg && ci.height_cm ? Math.round((ci.weight_kg / (ci.height_cm / 100) ** 2) * 10) / 10 : null);

    // ---------- Encabezado ----------
    text("NutriPediátrica", { bold: true, size: 11, color: GREEN });
    text("Plan de alimentación", { bold: true, size: 20 });
    text(patient.full_name, { bold: true, size: 14 });
    text([ci.age_years !== null && ci.age_years !== undefined ? `${ci.age_years} años` : null, ci.sex || patient.sex, ci.weight_kg ? `Peso ${fmt(ci.weight_kg)} kg` : null, ci.height_cm ? `Talla ${fmt(ci.height_cm)} cm` : null, bmi ? `IMC ${fmt(bmi)} kg/m²` : null].filter(Boolean).join("  ·  "), { color: MUTED });
    text(`Versión ${plan.version} · ${plan.status} · ${plan.status === "Borrador" ? `Actualizado ${fmtDate(plan.updated_at)}` : `Aprobado ${fmtDate(plan.approved_at)}`}`, { color: MUTED });
    doc.moveDown(0.6);
    if (plan.status === "Aprobado" || plan.status === "Reemplazado") {
      box([{ text: `Plan aprobado por ${plan.approved_by || "-"} el ${fmtDate(plan.approved_at)}.${plan.status === "Reemplazado" ? " Este plan fue reemplazado por una versión posterior." : ""}`, bold: true }], SOFT, GREEN);
    } else {
      box([{ text: "BORRADOR - No entregar sin revisión y aprobación de la nutricionista responsable.", bold: true }, { text: "Los valores son propuestas generadas por el sistema y deben validarse." }], WARN_BG, WARN_INK);
    }

    // ---------- Requerimientos ----------
    heading("Requerimientos diarios");
    table(
      [{ title: "Energía", width: 1.2 }, { title: "Carbohidratos", width: 1, align: "right" }, { title: "Proteínas", width: 1, align: "right" }, { title: "Grasas", width: 1, align: "right" }],
      [[plan.energy_kcal ? `${fmt(plan.energy_kcal, 0)} kcal/día` : "-",
        plan.carbs_g !== null && plan.carbs_g !== undefined ? `${fmt(plan.carbs_g)} g (${fmt(plan.carbs_pct, 0)}%)` : "-",
        plan.protein_g !== null && plan.protein_g !== undefined ? `${fmt(plan.protein_g)} g (${fmt(plan.protein_pct, 0)}%)` : "-",
        plan.fat_g !== null && plan.fat_g !== undefined ? `${fmt(plan.fat_g)} g (${fmt(plan.fat_pct, 0)}%)` : "-"]],
    );
    if (plan.formula) text(`Criterio de cálculo: ${plan.formula}`, { size: 8.5, color: MUTED });

    // ---------- Alimentos ----------
    const excluded = plan.excluded_foods || [];
    const rejected = plan.rejected_foods || [];
    const preferred = plan.preferred_foods || [];
    if (excluded.length || rejected.length || preferred.length) {
      heading("Alimentos a considerar");
      if (excluded.length) box([{ text: "No incluir (alergias, intolerancias u otra indicación)", bold: true }, { text: excluded.map(foodText).join("; ") }], "#fbe9e3", "#8a3f2b");
      if (rejected.length) box([{ text: "Rechaza: evitar o adaptar", bold: true }, { text: rejected.map(foodText).join("; ") }], WARN_BG, WARN_INK);
      if (preferred.length) box([{ text: "Preferidos: incluir cuando sea posible", bold: true }, { text: preferred.map(foodText).join("; ") }], SOFT, GREEN);
    }

    // ---------- Pauta por porciones (por macronutriente, en medidas caseras) ----------
    const pp = plan.portion_plan;
    if (pp?.groups?.length) {
      heading("Porciones por tiempo de comida");
      text("Cantidades en medidas caseras del alimento de referencia de cada grupo. Puede reemplazarse por otro alimento del mismo grupo en la misma cantidad de porciones.", { size: 8.5, color: MUTED });
      doc.moveDown(0.3);
      const groups = pp.groups.filter((g) => g.daily > 0);
      const household = (g, portions) => {
        if (!portions) return "-";
        const food = measureFood(g);
        return food ? amountText(food.portion_label, portions) : `${fmt(portions)} porc.`;
      };
      const rows = [];
      for (const family of FAMILIES) {
        const members = groups.filter((g) => familyOf(g.code) === family.key);
        if (!members.length) continue;
        rows.push({ cells: [`${family.title.toUpperCase()}  ·  ${family.hint}`, ...pp.meals.map(() => ""), ""], fill: family.bg, bold: true, color: family.ink, span: true });
        for (const g of members) {
          const ref = measureFood(g);
          rows.push([
            `${g.name}\n1 porción = ${ref ? `${ref.portion_label} de ${lowerFirst(ref.name)}` : "-"}`,
            ...pp.meals.map((_, mi) => household(g, g.per_meal[mi])),
            `${household(g, g.daily)}\n(${fmt(g.daily)} porc.)`,
          ]);
        }
      }
      table([{ title: "Grupo y medida de referencia", width: 2.6 }, ...pp.meals.map((meal) => ({ title: meal, width: 1, align: "center" })), { title: "Total día", width: 1.1, align: "center" }], rows);
      heading("Equivalencias: alimentos que cuentan como 1 porción");
      for (const g of groups) {
        const options = (g.suggestions || []).slice(0, 12).map((item) => `${item.preferred ? "* " : ""}${item.name} (${item.portion_label}, ${fmt(item.portion_grams)} g)`);
        if (!options.length) continue;
        ensure(36);
        text(`${g.name}: `, { bold: true, size: 9, continued: true });
        text(options.join("; "), { size: 9 });
        doc.moveDown(0.25);
      }
    }

    // ---------- Menús de ejemplo ----------
    if (pp?.examples?.length) {
      heading("Menús de ejemplo");
      for (const day of pp.examples) {
        ensure(60);
        text(`Día ${day.day}`, { bold: true, size: 11, color: GREEN });
        table(
          [{ title: "Comida", width: 1.1 }, { title: "Alimentos y cantidades", width: 4 }],
          day.meals.filter((m) => m.items.length).map((m) => [m.meal, m.items.map((i) => `${i.amount} ${i.name} (${fmt(i.grams)} g)${i.preferred ? " *" : ""}`).join("\n")]),
        );
      }
      text("* Alimento preferido por el paciente. Los menús son ejemplos: se pueden intercambiar alimentos del mismo grupo en la misma cantidad de porciones.", { size: 8.5, color: MUTED });
    }

    // ---------- Distribución e indicaciones ----------
    const meals = (plan.meal_distribution || []).filter((m) => m.meal);
    if (meals.some((m) => m.pct !== null && m.pct !== undefined || m.notes)) {
      heading("Tiempos de comida");
      table([{ title: "Tiempo de comida", width: 1.4 }, { title: "% energía", width: 0.7, align: "center" }, { title: "Indicaciones", width: 3.5 }],
        meals.map((m) => [m.meal, m.pct !== null && m.pct !== undefined ? `${fmt(m.pct, 0)}%` : "-", m.notes || "-"]));
    }
    if (plan.indications) {
      heading("Indicaciones para el paciente y la familia");
      text(plan.indications);
    }

    // ---------- Pie de página ----------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // permite escribir el pie bajo el margen sin crear páginas nuevas
      const y = doc.page.height - 40;
      doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
        clean(`NutriPediátrica · ${patient.full_name} · Plan versión ${plan.version} (${plan.status}) · Página ${i - range.start + 1} de ${range.count}`),
        left, y, { width, align: "center", lineBreak: false },
      );
    }
    doc.end();
  });
}
