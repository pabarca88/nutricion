import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { URL } from "node:url";
import mysql from "mysql2/promise";

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
  return JSON.parse(content || "{}");
};
const patients = async () => {
  if (!pool) return { source: "demo", data: demoPatients };
  const [rows] = await pool.query("SELECT id, full_name, birth_date, sex, weight_kg, height_cm, status FROM patients WHERE archived_at IS NULL ORDER BY created_at DESC");
  return { source: "mysql", data: rows };
};
const createPatient = async (input) => {
  const fullName = String(input.full_name || "").trim();
  if (!fullName) throw new Error("El nombre del paciente es obligatorio.");
  const record = { full_name: fullName, birth_date: input.birth_date || null, sex: input.sex || null, weight_kg: Number(input.weight_kg) || null, height_cm: Number(input.height_cm) || null, status: "Borrador" };
  if (!pool) {
    const patient = { id: Date.now(), ...record };
    demoPatients.unshift(patient);
    return patient;
  }
  const [result] = await pool.execute("INSERT INTO patients (full_name, birth_date, sex, weight_kg, height_cm, status) VALUES (?, ?, ?, ?, ?, ?)", [record.full_name, record.birth_date, record.sex, record.weight_kg, record.height_cm, record.status]);
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
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === "GET" && pathname === "/health") return json(response, 200, { status: "ok", app: "NutriPediátrica", node: process.version, database: pool ? "configured" : "demo" });
    if (request.method === "GET" && pathname === "/api/patients") return json(response, 200, await patients());
    if (request.method === "POST" && pathname === "/api/patients") return json(response, 201, { data: await createPatient(await body(request)) });
    if (request.method === "GET" && await staticFile(pathname, response)) return;
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Página no encontrada");
  } catch (error) {
    console.error(error);
    json(response, 500, { error: error instanceof Error ? error.message : "Error interno" });
  }
}).listen(port, () => console.log(`NutriPediátrica listening on port ${port}`));
