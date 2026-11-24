import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { URL } from "node:url";
import mysql from "mysql2/promise";
import { HttpError } from "./errors.js";
import { createPlanService } from "./plans.js";
import { createCatalogService } from "./catalog.js";
import { createMilestoneService } from "./milestones.js";

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "public");
const dbConfig = process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER
  ? { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, waitForConnections: true, connectionLimit: 5 }
  : null;
const pool = dbConfig ? mysql.createPool(dbConfig) : null;
const demoPatients = [
  { id: 1, full_name: "Benjamín Rojas", birth_date: "2018-05-14", sex: "Masculino", weight_kg: 29.4, height_cm: 128, status: "Plan en curso" },
  { id: 2, full_name: "Isidora Pérez", birth_date: "2017-09-02", sex: "Femenino", weight_kg: 25.1, height_cm: 121, status: "Seguimiento" },
];

const json = (response, status, value) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};
const body = async (request) => {
  let content = "";
  for await (const chunk of request) content += chunk;
  try {
    return JSON.parse(content || "{}");
  } catch {
    throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido.");
  }
};
const plans = createPlanService(pool, demoPatients);
const catalog = createCatalogService(pool);
const milestones = createMilestoneService(pool, demoPatients);
// Último peso y última talla registrados en controles (pueden venir de controles distintos).
const LATEST_COLUMNS = `(SELECT weight_kg FROM patient_milestones m WHERE m.patient_id = p.id AND m.archived_at IS NULL AND m.weight_kg IS NOT NULL ORDER BY m.measured_at DESC, m.id DESC LIMIT 1) AS last_weight_kg,
  (SELECT DATE_FORMAT(m.measured_at, '%Y-%m-%d') FROM patient_milestones m WHERE m.patient_id = p.id AND m.archived_at IS NULL AND m.weight_kg IS NOT NULL ORDER BY m.measured_at DESC, m.id DESC LIMIT 1) AS last_weight_at,
  (SELECT height_cm FROM patient_milestones m WHERE m.patient_id = p.id AND m.archived_at IS NULL AND m.height_cm IS NOT NULL ORDER BY m.measured_at DESC, m.id DESC LIMIT 1) AS last_height_cm,
  (SELECT DATE_FORMAT(m.measured_at, '%Y-%m-%d') FROM patient_milestones m WHERE m.patient_id = p.id AND m.archived_at IS NULL AND m.height_cm IS NOT NULL ORDER BY m.measured_at DESC, m.id DESC LIMIT 1) AS last_height_at,
  (SELECT COUNT(*) FROM patient_milestones m WHERE m.patient_id = p.id AND m.archived_at IS NULL) AS milestone_count`;
const withLatest = (row) => ({
  ...row,
  last_weight_kg: row.last_weight_kg === null || row.last_weight_kg === undefined ? null : Number(row.last_weight_kg),
  last_height_cm: row.last_height_cm === null || row.last_height_cm === undefined ? null : Number(row.last_height_cm),
  milestone_count: Number(row.milestone_count || 0),
});
// Si aún no se aplicó la migración 008, se responde sin datos de seguimiento.
const missingTable = (error) => error?.code === "ER_NO_SUCH_TABLE";
const patients = async () => {
  if (!pool) return { source: "demo", data: demoPatients };
  try {
    const [rows] = await pool.query(`SELECT p.id, p.full_name, p.birth_date, p.sex, p.weight_kg, p.height_cm, p.status, ${LATEST_COLUMNS} FROM patients p WHERE p.archived_at IS NULL ORDER BY p.created_at DESC`);
    return { source: "mysql", data: rows.map(withLatest) };
  } catch (error) {
    if (!missingTable(error)) throw error;
    const [rows] = await pool.query("SELECT id, full_name, birth_date, sex, weight_kg, height_cm, status FROM patients WHERE archived_at IS NULL ORDER BY created_at DESC");
    return { source: "mysql", data: rows };
  }
};
const patient = async (id) => {
  if (!pool) {
    const found = demoPatients.find((item) => item.id === id);
    if (!found) return null;
    const state = await milestones.stateFor(id, found.intake_data || {});
    return { ...found, current_data: state.data, current_sources: state.sources, next_control: state.next_control };
  }
  let rows;
  try {
    [rows] = await pool.execute(`SELECT p.id, p.full_name, p.birth_date, p.sex, p.weight_kg, p.height_cm, p.status, p.intake_data, DATE_FORMAT(p.created_at, '%Y-%m-%d') AS created_on, ${LATEST_COLUMNS} FROM patients p WHERE p.id = ? AND p.archived_at IS NULL`, [id]);
  } catch (error) {
    if (!missingTable(error)) throw error;
    [rows] = await pool.execute("SELECT id, full_name, birth_date, sex, weight_kg, height_cm, status, intake_data, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_on FROM patients WHERE id = ? AND archived_at IS NULL", [id]);
  }
  if (!rows[0]) return null;
  const item = rows[0];
  const intake = typeof item.intake_data === "string" ? JSON.parse(item.intake_data) : item.intake_data;
  // Estado actual = ficha inicial + cambios registrados en los hitos de seguimiento.
  let state = { data: intake || {}, sources: {}, next_control: null };
  try {
    state = await milestones.stateFor(id, intake);
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  return withLatest({ ...item, intake_data: intake, current_data: state.data, current_sources: state.sources, next_control: state.next_control });
};
const createPatient = async (input) => {
  const fullName = String(input.full_name || "").trim();
  if (!fullName) throw new HttpError(400, "El nombre del paciente es obligatorio.");
  const record = { full_name: fullName, birth_date: input.birth_date || null, sex: input.sex || null, weight_kg: Number(input.weight_kg) || null, height_cm: Number(input.height_cm) || null, status: "Borrador" };
  const existingId = Number(input.intake_data?.patient_id || 0);
  if (!pool) {
    if (existingId) {
      const index = demoPatients.findIndex((item) => item.id === existingId);
      if (index === -1) throw new HttpError(404, "Paciente no encontrado.");
      demoPatients[index] = { ...demoPatients[index], ...record, intake_data: input.intake_data };
      return demoPatients[index];
    }
    const patient = { id: Date.now(), ...record };
    demoPatients.unshift(patient);
    return patient;
  }
  const intakeData = input.intake_data ? JSON.stringify(input.intake_data) : null;
  if (existingId) {
    const [result] = await pool.execute("UPDATE patients SET full_name = ?, birth_date = ?, sex = ?, weight_kg = ?, height_cm = ?, intake_data = ? WHERE id = ? AND archived_at IS NULL", [record.full_name, record.birth_date, record.sex, record.weight_kg, record.height_cm, intakeData, existingId]);
    if (!result.affectedRows) throw new HttpError(404, "Paciente no encontrado.");
    return { id: existingId, ...record };
  }
  const [result] = await pool.execute("INSERT INTO patients (full_name, birth_date, sex, weight_kg, height_cm, status, intake_data) VALUES (?, ?, ?, ?, ?, ?, ?)", [record.full_name, record.birth_date, record.sex, record.weight_kg, record.height_cm, record.status, intakeData]);
  return { id: result.insertId, ...record };
};
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8" };
const staticFile = async (pathname, response) => {
  const clean = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(publicDir, clean));
  if (!file.startsWith(publicDir)) return false;
  try {
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    response.end(content);
    return true;
  } catch { return false; }
};

http.createServer(async (request, response) => {
  const rawPathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  // Passenger conserva el prefijo de la URL configurada en cPanel (por ejemplo, /nutricion).
  // Se puede reemplazar mediante APP_BASE_PATH si la instalación usa otro subdirectorio.
  const basePath = String(process.env.APP_BASE_PATH || "/nutricion").replace(/\/$/, "");
  const pathname = rawPathname === basePath
    ? "/"
    : rawPathname.startsWith(`${basePath}/`)
      ? rawPathname.slice(basePath.length)
      : rawPathname;
  try {
    if (request.method === "GET" && pathname === "/health") return json(response, 200, { status: "ok", app: "NutriPediátrica", node: process.version, database: pool ? "configured" : "demo" });
    if (request.method === "GET" && pathname === "/api/patients") return json(response, 200, await patients());
    if (request.method === "GET" && /^\/api\/patients\/\d+$/.test(pathname)) {
      const item = await patient(Number(pathname.split("/").pop()));
      return item ? json(response, 200, { data: item }) : json(response, 404, { error: "Paciente no encontrado." });
    }
    if (request.method === "POST" && pathname === "/api/patients") return json(response, 201, { data: await createPatient(await body(request)) });
    const patientPlans = pathname.match(/^\/api\/patients\/(\d+)\/plans$/);
    if (patientPlans && request.method === "GET") return json(response, 200, { data: await plans.list(Number(patientPlans[1])) });
    if (patientPlans && request.method === "POST") return json(response, 201, { data: await plans.create(Number(patientPlans[1]), await body(request)) });
    const planRoute = pathname.match(/^\/api\/plans\/(\d+)(?:\/(approve|discard))?$/);
    if (planRoute) {
      const planId = Number(planRoute[1]);
      const action = planRoute[2];
      if (!action && request.method === "GET") {
        const plan = await plans.get(planId);
        return plan ? json(response, 200, { data: plan }) : json(response, 404, { error: "Plan no encontrado." });
      }
      if (!action && request.method === "PUT") return json(response, 200, { data: await plans.update(planId, await body(request)) });
      if (action === "approve" && request.method === "POST") return json(response, 200, { data: await plans.approve(planId, await body(request)) });
      if (action === "discard" && request.method === "POST") return json(response, 200, { data: await plans.discard(planId) });
      return json(response, 405, { error: "Método no permitido." });
    }
    // Seguimiento: hitos (registro clínico complementario a la ficha inicial)
    const patientMilestones = pathname.match(/^\/api\/patients\/(\d+)\/milestones$/);
    if (patientMilestones && request.method === "GET") return json(response, 200, { data: await milestones.list(Number(patientMilestones[1])) });
    if (patientMilestones && request.method === "POST") return json(response, 201, { data: await milestones.create(Number(patientMilestones[1]), await body(request)) });
    const milestoneRoute = pathname.match(/^\/api\/milestones\/(\d+)$/);
    if (milestoneRoute && request.method === "PUT") return json(response, 200, { data: await milestones.update(Number(milestoneRoute[1]), await body(request)) });
    if (milestoneRoute && request.method === "DELETE") return json(response, 200, { data: await milestones.remove(Number(milestoneRoute[1])) });
    // Base de alimentos y pauta por porciones
    if (pathname === "/api/food-groups" && request.method === "GET") return json(response, 200, { data: await catalog.listGroups() });
    const groupRoute = pathname.match(/^\/api\/food-groups\/(\d+)$/);
    if (groupRoute && request.method === "PUT") return json(response, 200, { data: await catalog.updateGroup(Number(groupRoute[1]), await body(request)) });
    if (pathname === "/api/foods" && request.method === "GET") {
      const query = new URL(request.url, "http://localhost").searchParams;
      return json(response, 200, { data: await catalog.listFoods({ includeInactive: query.get("inactive") === "1" }) });
    }
    if (pathname === "/api/foods" && request.method === "POST") return json(response, 201, { data: await catalog.createFood(await body(request)) });
    const foodRoute = pathname.match(/^\/api\/foods\/(\d+)$/);
    if (foodRoute && request.method === "PUT") return json(response, 200, { data: await catalog.updateFood(Number(foodRoute[1]), await body(request)) });
    if (pathname === "/api/usda/search" && request.method === "GET") {
      return json(response, 200, { data: await catalog.searchUsda(new URL(request.url, "http://localhost").searchParams.get("q")) });
    }
    if (pathname === "/api/portion-rules" && request.method === "GET") return json(response, 200, { data: await catalog.listRules() });
    if (pathname === "/api/portion-rules" && request.method === "PUT") return json(response, 200, { data: await catalog.saveRules(await body(request)) });
    if (pathname === "/api/portion-plan/examples" && request.method === "POST") return json(response, 200, { data: catalog.generateExamples(await body(request)) });
    if (pathname === "/api/portion-plan" && request.method === "POST") return json(response, 200, { data: await catalog.generatePortionPlan(await body(request)) });
    if (request.method === "GET" && await staticFile(pathname, response)) return;
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Página no encontrada");
  } catch (error) {
    if (error instanceof HttpError) return json(response, error.status, { error: error.message });
    if (error?.code === "ER_NO_SUCH_TABLE" || error?.code === "ER_BAD_FIELD_ERROR") {
      console.error(error);
      return json(response, 503, { error: "La base de datos no tiene la estructura esperada. Aplica las migraciones pendientes de database/." });
    }
    console.error(error);
    json(response, 500, { error: "Error interno del servidor." });
  }
}).listen(port, () => console.log(`NutriPediátrica listening on port ${port}`));
