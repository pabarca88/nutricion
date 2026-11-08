const $ = (s) => document.querySelector(s);
const patients = $("#patients"), modal = $("#modal"), form = $("#patientForm");
async function loadPatients() {
  patients.textContent = "Cargando pacientes…";
  const result = await fetch("api/patients").then(r => r.json());
  $("#patientCount").textContent = result.data.length;
  $("#mode").textContent = result.source === "mysql" ? "MySQL" : "Demo";
  patients.innerHTML = result.data.map(p => `<article><span class="avatar">${p.full_name.split(" ").map(n=>n[0]).slice(0,2).join("")}</span><div><b>${p.full_name}</b><small>${p.sex || "Sin información"} · ${p.status}</small></div><div><small>Peso</small><b>${p.weight_kg || "—"} kg</b></div><div><small>Talla</small><b>${p.height_cm || "—"} cm</b></div></article>`).join("");
}
$("#newPatient").onclick = () => modal.showModal();
$("#refresh").onclick = loadPatients;
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#formMessage"); message.textContent = "Guardando…";
  const data = Object.fromEntries(new FormData(form));
  const response = await fetch("api/patients", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data) });
  if (!response.ok) { message.textContent = "No se pudo guardar."; return; }
  modal.close(); form.reset(); loadPatients();
});
loadPatients();
