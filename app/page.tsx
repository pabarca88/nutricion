"use client";
import { useState } from "react";
import { Bell, CalendarDays, ChevronDown, ChevronRight, ClipboardList, FileDown, HeartPulse, Home, Leaf, Menu, MoreHorizontal, Plus, Settings, ShoppingBasket, Sparkles, Users, X } from "lucide-react";

const meals = [["Desayuno","Avena cocida con leche + plátano","328 kcal"],["Colación","Yogur natural con frutillas","146 kcal"],["Almuerzo","Pollo al horno, arroz integral y ensalada","524 kcal"],["Once","Pan integral con palta y tomate","267 kcal"],["Cena","Crema de verduras + tortilla de huevo","302 kcal"]];
const nav = [[Home,"Resumen"],[Users,"Pacientes"],[ClipboardList,"Planes nutricionales"],[ShoppingBasket,"Alimentos y recetas"],[Sparkles,"Plantillas clínicas"]];

export default function HomePage() {
  const [active,setActive]=useState("Resumen"),[sidebar,setSidebar]=useState(false),[day,setDay]=useState(0),[notice,setNotice]=useState(""),[showMore,setShowMore]=useState(false);
  const action=(message:string)=>{setNotice(message);window.setTimeout(()=>setNotice(""),2800)};
  return <main className="min-h-screen bg-[#f7faf8] text-[#173d36]">
    {notice&&<div className="fixed right-5 top-5 z-50 rounded-xl bg-[#173d36] px-4 py-3 text-sm font-medium text-white shadow-xl">{notice}</div>}
    <aside className={`sidebar ${sidebar?"open":""}`}>
      <div className="brand"><span className="brand-mark"><Leaf size={21}/></span><span>nutri<span>pediátrica</span></span><button className="mobile-close" onClick={()=>setSidebar(false)}><X/></button></div>
      <div className="professional"><div className="avatar">MS</div><div><b>María Soto</b><small>Nutricionista</small></div><ChevronDown size={15}/></div>
      <nav><p>PRINCIPAL</p>{nav.map(([Icon,label])=>{const I=Icon as typeof Home;return <button key={label as string} className={active===label?"selected":""} onClick={()=>{setActive(label as string);setSidebar(false)}}><I size={19}/>{label as string}</button>})}<p>CONFIGURACIÓN</p><button onClick={()=>action("Configuración disponible en la siguiente etapa.")}><Settings size={19}/>Configuración</button></nav>
      <div className="help"><HeartPulse size={20}/><div><b>¿Necesitas ayuda?</b><small>Revisa la guía clínica</small></div></div>
    </aside>
    <section className="app-content">
      <header className="topbar"><button className="menu-btn" onClick={()=>setSidebar(true)}><Menu/></button><div className="breadcrumbs">Inicio <ChevronRight size={14}/> <b>{active}</b></div><div className="top-actions"><button aria-label="Notificaciones"><Bell size={20}/><i/></button><div className="avatar small">MS</div></div></header>
      <div className="page">
        <div className="welcome"><div><p>Hola, María <span>👋</span></p><h1>Tu consulta, más simple.</h1><small>Administra tus planes y acompaña a tus pacientes.</small></div><button className="primary" onClick={()=>action("Se creó un borrador de plan nutricional.")}><Plus size={18}/> Nuevo plan</button></div>
        <section className="stats"><article><span className="stat-icon peach"><Users size={22}/></span><div><small>Pacientes activos</small><b>42</b><em>+4 este mes</em></div></article><article><span className="stat-icon lavender"><ClipboardList size={22}/></span><div><small>Planes este mes</small><b>18</b><em>+12% vs. mes anterior</em></div></article><article><span className="stat-icon mint"><CalendarDays size={22}/></span><div><small>Próximas consultas</small><b>6</b><em>Esta semana</em></div></article></section>
        <section className="grid-main">
          <article className="panel patient-card"><div className="section-title"><div><small>PACIENTE SELECCIONADO</small><h2>Benjamín Rojas</h2><p>8 años · Masculino</p></div><button className="dots" onClick={()=>setShowMore(!showMore)}><MoreHorizontal size={22}/></button>{showMore&&<div className="context-menu"><button onClick={()=>action("Ficha clínica abierta.")}>Ver ficha clínica</button><button onClick={()=>action("Paciente archivado.")}>Archivar paciente</button></div>}</div><div className="patient-info"><div className="child-avatar">BR</div><div><b>Control nutricional</b><p>Última consulta: 4 Jun 2026</p><span>Plan en curso</span></div></div><div className="measurements"><div><small>Peso</small><b>29.4 <span>kg</span></b></div><div><small>Talla</small><b>128 <span>cm</span></b></div><div><small>IMC</small><b>17.9 <span>kg/m²</span></b></div></div><button className="outline" onClick={()=>action("Abriendo ficha de Benjamín Rojas.")}>Ver ficha completa <ChevronRight size={17}/></button></article>
          <article className="panel tasks"><div className="section-title"><div><small>PARA HOY</small><h2>Próximas tareas</h2></div><button className="text-btn" onClick={()=>action("Mostrando todas las tareas.")}>Ver todas</button></div>{[["coral","Revisar minuta semanal","Benjamín Rojas · Hoy, 10:30","Completar"],["yellow","Enviar plan nutricional","Isidora Pérez · Hoy, 12:00","Enviar"],["blue","Consulta de seguimiento","Tomás Silva · Hoy, 16:00","Ver agenda"]].map(([color,title,description,button])=><div className="task" key={title}><span className={`task-dot ${color}`}/><div><b>{title}</b><p>{description}</p></div><button onClick={()=>action(`${title}: acción registrada.`)}>{button}</button></div>)}</article>
        </section>
        <section className="panel plan"><div className="plan-head"><div><small>PLAN NUTRICIONAL</small><h2>Minuta semanal · Benjamín Rojas</h2><p>Objetivo: Alimentación equilibrada y saludable</p></div><div className="nutrient-pill"><b>1.567</b><span>kcal/día</span><i/></div></div><div className="days">{["Lun 12","Mar 13","Mié 14","Jue 15","Vie 16","Sáb 17","Dom 18"].map((label,i)=><button key={label} className={day===i?"current":""} onClick={()=>setDay(i)}><b>{label.split(" ")[0]}</b><span>{label.split(" ")[1]}</span></button>)}</div><div className="meal-list">{meals.map(([type,food,kcal])=><div className="meal" key={type}><span className="meal-dot"/><b>{type}</b><p>{food}</p><small>{kcal}</small></div>)}</div><div className="plan-footer"><div><span className="progress"><i/></span><small>Plan equilibrado · Requiere validación profesional</small></div><button className="download" onClick={()=>action("El PDF se preparará al aprobar el plan.")}><FileDown size={17}/> Exportar PDF</button></div></section>
        <p className="clinical-note">Prototipo clínico: los cálculos y menús son borradores. Toda pauta debe ser revisada, validada y firmada por un profesional habilitado.</p>
      </div>
    </section>
  </main>
}
