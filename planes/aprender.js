// Aprender: vista de Planes para organizar habilidades en diagramas (cards semántico / procedimental,
// niveles bronce → diamante con criterio, líneas de distintas formas y estilos y notas adhesivas).
// Se dibuja dentro de un shadow root para que sus estilos e ids no choquen con los de Planes.
// Los datos viven en el estado de Planes (state.aprender) y se guardan/sincronizan con él.
(function(){
"use strict";

// ---------- datos ----------
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function newSkillObj(name){ return { id: uid(), name: name, updated: Date.now(), nodes: [], deps: [], route: [], stickies: [], view: { x: 60, y: 120, z: 1 } }; }
// Completa lo que falte (datos guardados con versiones anteriores o importados).
function normSkill(s){
  s.id = s.id || uid(); s.name = s.name || "Sin nombre"; s.updated = s.updated || Date.now();
  s.nodes = Array.isArray(s.nodes) ? s.nodes : [];
  s.deps = Array.isArray(s.deps) ? s.deps : [];
  migrate(s);
  normRoute(s);
  s.stickies = Array.isArray(s.stickies) ? s.stickies : [];
  s.view = s.view || { x: 60, y: 120, z: 1 };
  return s;
}

// Datos guardados con otras versiones: se pasan a este formato.
// Tipos: concepto → semántico, acción → procedimental, nodo → sin tipo. El objetivo pasa al principio
// de las notas. Requisitos y líneas «links» → líneas comunes (los requisitos, con guiones).
var OLD_TYPE = { semantico: "semantico", procedimental: "procedimental", concepto: "semantico", accion: "procedimental" };
var SIDES = { t: 1, r: 1, b: 1, l: 1 }, SHAPES = { curva: 1, recta: 1, escalon: 1 }, STYLES = { continua: 1, guiones: 1, puntos: 1 };
function migrate(s){
  s.nodes.forEach(function(n){
    if(!n) return;
    if(n.type){ if(OLD_TYPE[n.type]) n.type = OLD_TYPE[n.type]; else delete n.type; }
    if(typeof n.heart === "string" && n.heart.trim())
      n.notes = "Objetivo: " + n.heart.trim() + (n.notes && String(n.notes).trim() ? "\n\n" + n.notes : "");
    delete n.heart; delete n.pruned; delete n.order; delete n.technique;
  });
  var extra = [];
  (Array.isArray(s.reqs) ? s.reqs : []).forEach(function(r){ if(r) extra.push({ from: r.from, to: r.to, style: "guiones" }); });
  (Array.isArray(s.links) ? s.links : []).forEach(function(l){ if(l) extra.push(l.kind === "requiere" ? { from: l.from, to: l.to, style: "guiones" } : { from: l.from, to: l.to }); });
  delete s.reqs; delete s.links;
  function has(a, b){ return s.deps.some(function(d){ return (d.from === a && d.to === b) || (d.from === b && d.to === a); }); }
  function reaches(a, b){
    var seen = {}, stack = [a];
    while(stack.length){ var x = stack.pop(); if(x === b) return true; if(seen[x]) continue; seen[x] = 1;
      s.deps.forEach(function(d){ if(d.from === x) stack.push(d.to); }); }
    return false;
  }
  s.deps = s.deps.filter(function(d){ return d && d.from && d.to && d.from !== d.to; });
  extra.forEach(function(d){ if(d.from && d.to && d.from !== d.to && !has(d.from, d.to) && !reaches(d.to, d.from)) s.deps.push(d); });
  s.deps.forEach(function(d){
    if(!SIDES[d.fs]) delete d.fs; if(!SIDES[d.ts]) delete d.ts;
    if(!SHAPES[d.shape] || d.shape === "curva") delete d.shape;
    if(!STYLES[d.style] || d.style === "continua") delete d.style;
  });
}

// Ruta de aprendizaje: la secuencia en que se van a aprender las cards. Va aparte de las líneas (s.deps)
// porque no es un requisito: puede ir entre dos cards que ya tienen otra línea y no sigue las dependencias.
// A una card pueden llegar o salir varias flechas de ruta (caminos que se juntan o se abren); solo no puede haber círculos.
function normRoute(s){
  var ok = [];
  function reach(a, b){
    var seen = {}, st = [a];
    while(st.length){ var x = st.pop(); if(x === b) return true; if(seen[x]) continue; seen[x] = 1;
      ok.forEach(function(r){ if(r.from === x) st.push(r.to); }); }
    return false;
  }
  (Array.isArray(s.route) ? s.route : []).forEach(function(r){
    if(!r || !r.from || !r.to || r.from === r.to) return;
    if(ok.some(function(o){ return o.from === r.from && o.to === r.to; }) || reach(r.to, r.from)) return;
    if(!SIDES[r.fs]) delete r.fs; if(!SIDES[r.ts]) delete r.ts;
    if(!SHAPES[r.shape] || r.shape === "curva") delete r.shape;
    delete r.style;
    ok.push(r);
  });
  s.route = ok;
}

function demo(){
  // list: [clave, título, x, y, tipo, nivel] · links: [desde, hasta, extra] · extra: notes {clave: texto}, stickies
  function sk(name, list, links, extra){
    var s = newSkillObj(name), by = {};
    extra = extra || {};
    list.forEach(function(x){
      var n = { id: uid(), title: x[1], x: x[2], y: x[3] };
      if(x[4]) n.type = x[4]; if(x[5]) n.level = x[5];
      if(extra.notes && extra.notes[x[0]]) n.notes = extra.notes[x[0]];
      s.nodes.push(n); by[x[0]] = n;
    });
    links.forEach(function(l){ s.deps.push(Object.assign({ from: by[l[0]].id, to: by[l[1]].id }, l[2] || {})); });
    (extra.stickies || []).forEach(function(n){ s.stickies.push(Object.assign({ id: uid() }, n)); });
    (extra.route || []).forEach(function(r){ s.route.push(Object.assign({ from: by[r[0]].id, to: by[r[1]].id }, r[2] || {})); });
    return s;
  }
  var latte = sk("Latte art", [
    ["la", "Latte art: corazón simétrico", 0, 140],
    ["le", "Leche", 290, 40], ["ve", "Vertido", 290, 260],
    ["te", "Textura (microespuma)", 580, 0, "procedimental", "plata"], ["tp", "Temperatura 55–65 °C", 580, 100, "semantico", "oro"],
    ["al", "Altura y velocidad", 580, 260, "procedimental", "bronce"], ["co", "Corte final", 580, 380, "procedimental"]
  ], [["la","le"],["la","ve"],["le","te"],["le","tp"],["ve","al"],["ve","co"],
      ["le","ve",{ fs: "b", ts: "t", shape: "escalon" }], ["al","co",{ fs: "b", ts: "t", style: "guiones" }]], {
    notes: { la: "Objetivo: corazón simétrico 8 de 10",
             tp: "Arriba de 65 °C la leche pierde dulzor y la espuma se rompe.\nTermómetro de clip en la jarra hasta que salga de memoria." },
    stickies: [{ color: "rosa", text: "cuello: el chorro se corta", x: 840, y: 250, w: 170, h: 90 }],
    route: [["tp","te",{ fs: "r", ts: "r" }], ["te","al",{ fs: "r", ts: "r" }], ["al","co",{ fs: "r", ts: "r" }]]
  });
  var dec = sk("Decidir con registro", [
    ["d", "Decidir con registro", 0, 60],
    ["de", "Detectar decisiones importantes", 290, 0, "procedimental", "bronce"], ["fo", "Formato de la predicción", 290, 110, "semantico", "diamante"],
    ["re", "Revisión mensual", 580, 50, "procedimental"]
  ], [["d","de"],["d","fo"],["de","re"],["fo","re"]], {
    notes: { d: "Objetivo: predicción escrita en 9 de cada 10 decisiones importantes" }
  });
  return [latte, dec];
}

function normalize(d){
  if(!d || typeof d !== "object" || !Array.isArray(d.skills)) return null;
  d.skills = d.skills.filter(function(s){ return s && Array.isArray(s.nodes); }).map(normSkill);
  if(!d.skills.some(function(s){ return s.id === d.current; })) d.current = d.skills[0] ? d.skills[0].id : null;
  return d;
}
// Primera vez: lo que haya quedado de la app Aprender suelta (/aprender/, mismo sitio) o los ejemplos.
function initialData(){
  try {
    var old = normalize(JSON.parse(localStorage.getItem("aprender-v2")));
    if(old) return { skills: old.skills, current: old.current };
  } catch(e){}
  var skills = demo();
  return { skills: skills, current: skills[0].id };
}

var CSS = `
:host {
  --bg: #0d1117; --panel: #10151c; --panel-2: #161c24; --card: #151a21; --input: #0b0f14;
  --line: #262e39; --line-2: #323c49; --text: #d6dde6; --muted: #7d8896; --faint: #4b5563;
  --accent: #58a6ff; --teal: #56d4c4; --danger: #f47067;
  --semantico: #c297ff; --procedimental: #f0883e;
  --bronce: #c98a5a; --plata: #c3ccd6; --oro: #e8c547; --diamante: #7fd8f5;
  --ruta: #7ee787;
  --s-rosa: #f8b6cd; --s-amarillo: #fde68a; --s-azul: #a9d3ff; --s-verde: #b6ebc2; --s-ink: #1f2328;
  --card-w: 230px; --card-h: 56px;
  color-scheme: dark;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
:host { display: block; background: var(--bg); color: var(--text); font: 12px/1.4 "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; overflow: hidden; }
button, select, input, textarea { font: inherit; color: inherit; }
[hidden] { display: none !important; }

.layout { display: flex; height: 100%; }

/* ---------- panel lateral ---------- */
.side { width: 300px; flex: none; background: var(--panel); border-right: 1px solid var(--line); padding: 12px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px)); display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.layout.side-collapsed .side { display: none; }
.side-head { display: flex; align-items: center; gap: 6px; }
.side-head .grow { flex: 1; }
.side-head .sec { margin-top: 0; }
.side-head .add { width: 26px; height: 26px; font-size: 16px; line-height: 1; }
.btn { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; cursor: pointer; text-align: center; white-space: nowrap; }
.btn:hover { border-color: var(--line-2); background: #1b222c; }
.btn:disabled { opacity: .4; cursor: default; }
.btn.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
.btn.primary.danger { background: #b62324; border-color: #b62324; }
.btn.sq { width: 34px; padding: 7px 0; }
.icon-btn { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; width: 32px; height: 32px; cursor: pointer; font-size: 16px; flex: none; }
.sec { color: var(--muted); font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-top: 4px; }

.skills { display: flex; flex-direction: column; gap: 4px; min-height: 80px; flex: 1; overflow-y: auto; }
.side:has(.pnotes:not([hidden])) .skills { flex: 0 1 auto; max-height: 34%; }
/* notas del nodo elegido, en el panel */
.pnotes { flex: 1; min-height: 120px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 10px; }
.pn-head { display: flex; align-items: center; gap: 8px; }
.pn-title { flex: 1; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn.sm { padding: 4px 9px; font-size: 11px; }
.pn-meta { color: var(--faint); font-size: 10.5px; margin-top: -4px; }
.pn-meta:empty { display: none; }
.pn-view { flex: 1; min-height: 0; overflow-y: auto; cursor: text; }
.pn-edit { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.pn-edit textarea { flex: 1; min-height: 120px; resize: none; background: var(--input); border: 1px solid var(--line-2); border-radius: 6px; padding: 10px;
  font-size: 12.5px; line-height: 1.5; color: var(--text); width: 100%; }
.pn-edit textarea:focus { outline: none; border-color: var(--accent); }
/* formato de notas (igual que en Planes) */
.nt-body { font-size: 12.5px; line-height: 1.6; overflow-wrap: anywhere; }
.nt-body p { margin: 0; }
.nt-body ul, .nt-body ol { margin: 2px 0; padding-left: 20px; }
.nt-body li::marker { color: var(--muted); }
.nt-body code { background: var(--input); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
.nt-body a { color: var(--accent); }
.nt-body b { color: #fff; }
.nt-body > :first-child { margin-top: 0; }
.nt-gap { height: 10px; }
.nt-h1, .nt-h2, .nt-h3 { display: flex; align-items: center; gap: 8px; font-weight: 700; margin: 10px 0 4px; }
.nt-h1 { font-size: 14px; }
.nt-h2, .nt-h3 { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.nt-h2::after, .nt-h3::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.nt-nobody { color: var(--faint); }
.nt-tools { display: flex; gap: 5px; flex-wrap: wrap; }
.nt-tools button { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; cursor: pointer; color: var(--muted); font-size: 11px; }
.nt-tools button:hover { color: var(--text); border-color: var(--line-2); }
.nt-check { list-style: none; margin: 2px 0; padding: 0; }
.nt-check li { display: flex; align-items: flex-start; gap: 8px; padding: 2px 0; }
.nt-check .nt-box { flex: none; width: 16px; height: 16px; margin-top: 2px; border: 1.5px solid var(--muted); border-radius: 4px; background: none;
  color: #fff; font-size: 10.5px; line-height: 13px; text-align: center; padding: 0; cursor: pointer; }
.nt-check li.done .nt-box { background: #3fb950; border-color: #3fb950; }
.nt-check li.done > span:last-child { color: var(--muted); text-decoration: line-through; }
.skill { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
.skill:hover { background: var(--panel-2); }
.skill.active { background: #132a2e; border-color: #2c6b6b; }
.skill .txt { min-width: 0; flex: 1; }
.skill .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill .sub { color: var(--muted); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.skill .x { opacity: .55; background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 13px; padding: 2px 4px; flex: none; }
.skill:hover .x { opacity: 1; }
.skill .x:hover { color: var(--text); }
.skill .del:hover { color: var(--danger); }
.no-skills { color: var(--muted); padding: 8px 2px; line-height: 1.6; }

/* ---------- lienzo ---------- */
.stage { position: relative; flex: 1; overflow: hidden; }
.canvas { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab;
  background-color: var(--bg); background-image: radial-gradient(circle, #1c232c 1px, transparent 1.2px); }
.canvas.panning { cursor: grabbing; }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.cards, .stickies { position: absolute; left: 0; top: 0; }
.wires { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }

.topbar { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; align-items: center; gap: 8px; z-index: 6; pointer-events: none; }
.topbar > * { pointer-events: auto; }
.topbar .help-btn { margin-left: auto; font-weight: 700; font-size: 14px; }
/* cambiar entre el diagrama y la vista foco */
.vseg { display: flex; background: rgba(20,26,34,.94); border: 1px solid var(--line); border-radius: 7px; padding: 2px; gap: 2px; }
.vseg button { background: none; border: 0; border-radius: 5px; padding: 5px 10px; cursor: pointer; color: var(--muted); white-space: nowrap; }
.vseg button.on { background: var(--panel-2); color: var(--text); }
/* capas del diagrama: mostrar u ocultar cada tipo de línea */
.layers { display: flex; background: rgba(20,26,34,.94); border: 1px solid var(--line); border-radius: 7px; padding: 2px; gap: 2px; }
.layers button { display: flex; align-items: center; gap: 6px; background: none; border: 0; border-radius: 5px; padding: 5px 9px; cursor: pointer; color: var(--faint); white-space: nowrap; }
.layers button svg { display: block; flex: none; opacity: .45; }
.layers button.on { color: var(--text); background: var(--panel-2); }
.layers button.on svg { opacity: 1; }
/* visor de rutas: los pasos de la ruta en orden */
.rv { position: absolute; inset: 0; z-index: 5; background: var(--bg); overflow-y: auto; padding: 64px 16px 40px; }
.rv-wrap { max-width: 980px; margin: 0 auto; }
.rv-head { display: flex; align-items: baseline; gap: 12px; margin: 6px 0 18px; }
.rv-title { flex: 1; min-width: 0; font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-sub { color: var(--muted); font-size: 11px; white-space: nowrap; }
.rv-bar { height: 4px; border-radius: 2px; background: var(--line); margin: -10px 0 22px; overflow: hidden; }
.rv-bar i { display: block; height: 100%; background: var(--ruta); border-radius: 2px; }
.rv-chain { color: var(--muted); font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin: 22px 0 10px; }
/* la ruta como diagrama de flujo: inicio, cards con flechas, fin */
.rv-scroll { overflow-x: auto; padding-bottom: 6px; }
.rv-flow { position: relative; margin: 0 auto; }
.rv-flow svg { position: absolute; left: 0; top: 0; overflow: visible; }
.rf-edge { fill: none; stroke: var(--line-2); stroke-width: 2; }
.rf-edge.done { stroke: var(--ruta); }
.rf-arrow { fill: var(--line-2); }
.rf-arrow.done { fill: var(--ruta); }
.rf-term { position: absolute; display: grid; place-items: center; border: 1.5px solid var(--line-2); border-radius: 999px; color: var(--muted);
  font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; background: var(--bg); }
.rf-term.done { border-color: var(--ruta); color: var(--ruta); }
.rv-card { position: absolute; display: flex; flex-direction: column; justify-content: center; gap: 4px; background: var(--card); border: 1px solid var(--line);
  border-left: 3px solid var(--teal); border-radius: 8px; padding: 8px 10px 8px 11px; cursor: pointer; overflow: hidden; }
.rv-card:hover { border-color: var(--line-2); }
.rv-card.actual { border-color: rgba(126,231,135,.6); background: #121c17; box-shadow: 0 0 0 3px rgba(126,231,135,.12); }
.rv-card.hecho { opacity: .78; }
.rv-card.sel { border-color: var(--accent); }
.rv-top { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--faint); }
.rv-num { font-weight: 700; }
.rv-st { margin-left: auto; white-space: nowrap; }
.rv-card.hecho .rv-st { color: var(--ruta); }
.rv-card.actual .rv-st { color: var(--ruta); font-weight: 700; }
.rv-t { font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.rv-card.hecho .rv-t { color: var(--muted); }
.rv-m { color: var(--muted); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-empty { color: var(--muted); line-height: 1.7; max-width: 440px; margin: 12vh auto 0; text-align: center; }
.rv-empty b { color: var(--text); }
.rv-empty .btn { margin-top: 14px; }
/* vista foco: lienzo 3D encima del diagrama */
.foco { position: absolute; inset: 0; z-index: 5; background: #141518; overflow: hidden; }
.fc-canvas { position: absolute; inset: 0; display: block; touch-action: none; cursor: grab; }
.fc-bar { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; }
.fc-btn { background: rgba(28,29,34,.94); border: 1px solid rgba(255,255,255,.1); border-radius: 6px; padding: 7px 12px; cursor: pointer; color: #e6e7ea; font: inherit; }
.fc-btn:hover { border-color: rgba(233,168,242,.55); }
.fc-hint { position: absolute; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); color: #6f727b; font-size: 11px; white-space: nowrap; pointer-events: none; }

.wire .line { fill: none; stroke: #3a4452; stroke-width: 1.6; }
.wire .hit { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; }
.wire:hover .line { stroke: #6b7788; }
.wire.selected .line { stroke: var(--accent); stroke-width: 2.4; }
.wire.s-guiones .line { stroke-dasharray: 7 5; }
.wire.s-puntos .line { stroke-dasharray: 0.1 5; stroke-linecap: round; stroke-width: 2.2; }
.wire.s-puntos.selected .line { stroke-width: 3; }
/* ruta de aprendizaje: punteado grande con flecha */
.wire.s-ruta .line { stroke: var(--ruta); stroke-width: 4; stroke-dasharray: 0.1 11; stroke-linecap: round; opacity: .85; }
.wire.s-ruta .arrow { fill: var(--ruta); opacity: .9; }
.wire.s-ruta:hover .line { opacity: 1; }
.wire.s-ruta.selected .line { stroke: var(--accent); stroke-width: 5; opacity: 1; }
.wire.s-ruta.selected .arrow { fill: var(--accent); }
.temp.ruta { stroke: var(--ruta); stroke-width: 4; stroke-dasharray: 0.1 11; stroke-linecap: round; }
/* barra de la línea elegida: forma y estilo */
.toolbar .lk { padding: 6px 9px; }
.toolbar .lk svg { display: block; }
.toolbar .lk.on { border-color: var(--accent); background: #142033; }
.route-btn.on { border-color: var(--ruta); color: var(--ruta); background: #13221a; }
.toolbar .sep { width: 1px; align-self: stretch; background: var(--line); margin: 2px 2px; }
.temp { fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-dasharray: 5 4; }

.card { position: absolute; width: var(--card-w); min-height: var(--card-h); background: var(--card); border: 1px solid var(--line);
  border-left: 3px solid var(--teal); border-radius: 6px; padding: 8px 12px 6px 12px; cursor: default; user-select: none; -webkit-user-select: none; }
.card:hover { border-color: var(--line-2); border-left-color: var(--teal); }
.card.root { border-left-color: var(--accent); background: #131c27; }
.card.selected { border-color: var(--accent) !important; box-shadow: 0 0 0 2px rgba(88,166,255,.45) !important; opacity: 1; }
.card.drop { border-color: var(--accent) !important; box-shadow: 0 0 0 2px var(--accent) !important; }
.card.dragging { cursor: grabbing; z-index: 5; }
.title { display: block; font-weight: 600; font-size: 12px; line-height: 1.4; min-width: 0; outline: none; overflow-wrap: anywhere; }
.title[contenteditable="true"] { background: var(--input); border-radius: 3px; padding: 0 3px; margin: 0 -3px; box-shadow: 0 0 0 1px var(--accent); cursor: text; user-select: text; -webkit-user-select: text; }
.meta { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 5px; font-size: 10.5px; color: var(--muted); height: 16px; }
.meta .kids { margin-right: auto; color: var(--faint); }
.tools { display: flex; gap: 2px; opacity: 0; transition: opacity .1s; }
.card:hover .tools, .card.selected .tools { opacity: 1; }
.tools button { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0 3px; font-size: 12px; }
.tools button:hover { color: var(--text); }
.tools button[data-act="del"]:hover { color: var(--danger); }
/* puntos para conectar, en los cuatro lados (arriba y abajo aparecen al pasar o con la card elegida) */
.port { position: absolute; width: 11px; height: 11px; border-radius: 50%; background: var(--bg); border: 1.5px solid #4b5563; cursor: crosshair; }
.port::after { content: ""; position: absolute; inset: -8px; border-radius: 50%; }
.port.p-r { right: -6.5px; top: 50%; margin-top: -5.5px; }
.port.p-l { left: -8px; top: 50%; margin-top: -5.5px; }
.port.p-t { top: -6.5px; left: 50%; margin-left: -5.5px; }
.port.p-b { bottom: -6.5px; left: 50%; margin-left: -5.5px; }
.port.p-t, .port.p-b { opacity: 0; transition: opacity .1s; }
.card:hover .port, .card.selected .port, .card.drop .port { opacity: 1; }
.port:hover { border-color: var(--accent); background: var(--accent); }

/* tipos */
.card.t-semantico, .card.t-semantico:hover { border-left-color: var(--semantico); border-radius: 22px; padding-left: 16px; padding-right: 16px;
  background: color-mix(in srgb, var(--semantico) 11%, var(--card)); border-color: color-mix(in srgb, var(--semantico) 28%, var(--line)); }
.card.t-procedimental, .card.t-procedimental:hover { border-left-color: var(--procedimental);
  background: color-mix(in srgb, var(--procedimental) 10%, var(--card)); border-color: color-mix(in srgb, var(--procedimental) 26%, var(--line)); }
/* estado: botón al inicio de la card, como el círculo de estado de Planes (toque = siguiente estado) */
.card .head { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
.card .head .title { flex: 1; }
.st { width: 16px; height: 16px; flex: none; display: grid; place-items: center; border: 0; background: none; padding: 0; margin-top: 1px;
  cursor: pointer; font-size: 11px; line-height: 1; color: var(--faint); }
.st:hover { transform: scale(1.2); }
.medal { display: block; width: 11px; height: 11px; border-radius: 50%; background: var(--m);
  box-shadow: inset 0 -2px 0 rgba(0,0,0,.28), inset 0 2px 0 rgba(255,255,255,.35), 0 0 0 2px color-mix(in srgb, var(--m) 30%, transparent); }
.medal.m-diamante { border-radius: 2px; transform: rotate(45deg) scale(.85); }
.card.lv-oro { box-shadow: 0 0 12px rgba(232,197,71,.10); }
.card.lv-diamante { box-shadow: 0 0 14px rgba(127,216,245,.14); }

/* notas (como en Planes): puntito en la card, lleno si tiene notas */
.note-dot { flex: none; width: 10px; height: 10px; padding: 0; border-radius: 50%; background: none; border: 1.5px solid var(--line-2); cursor: pointer; position: relative; opacity: .7; }
.note-dot::after { content: ""; position: absolute; inset: -8px; border-radius: 50%; }
.note-dot:hover { border-color: var(--text); opacity: 1; }
.note-dot.has { background: var(--text); border-color: var(--text); opacity: 1; }
.card .note-dot { margin-right: -4px; }
.note-prog { font-size: 10px; color: var(--muted); margin-right: -2px; }
.note-prog.all { color: #3fb950; }
.card .note-dot:not(.has) { opacity: 0; }
.card:hover .note-dot, .card.selected .note-dot { opacity: .7; }
.card .note-dot.has { opacity: 1; }
.notes-box { width: min(520px, 100%); }
.notes-head { display: flex; align-items: center; gap: 10px; }
.notes-title { flex: 1; font-weight: 700; overflow-wrap: anywhere; }
.notes-box textarea { min-height: 220px; max-height: 60vh; resize: vertical; line-height: 1.5; background: var(--input); border: 1px solid var(--line-2);
  border-radius: 6px; padding: 10px; font-size: 14px; color: var(--text); width: 100%; }
.notes-box textarea:focus { outline: none; border-color: var(--accent); }

/* notas adhesivas sueltas en el lienzo (estilo Miro) */
.sticky { position: absolute; border-radius: 3px; padding: 10px 12px; color: var(--s-ink); font-size: 12.5px; line-height: 1.4; font-weight: 500;
  box-shadow: 0 8px 18px rgba(0,0,0,.35); cursor: default; user-select: none; -webkit-user-select: none; }
.sticky.c-rosa { background: var(--s-rosa); } .sticky.c-amarillo { background: var(--s-amarillo); }
.sticky.c-azul { background: var(--s-azul); } .sticky.c-verde { background: var(--s-verde); }
.sticky .stx { height: 100%; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; outline: none; }
.sticky .stx:empty::before { content: "Doble toque para escribir"; opacity: .45; }
.sticky .stx.editing { overflow: auto; cursor: text; user-select: text; -webkit-user-select: text; }
.sticky .stx.editing:empty::before { content: ""; }
.sticky.selected { outline: 2px solid var(--accent); outline-offset: 2px; }
.sticky.dragging { z-index: 4; }
.sticky .sdel, .sticky .sz { display: none; }
.sticky.selected .sdel, .sticky.selected .sz, .sticky:hover .sdel, .sticky:hover .sz { display: block; }
.sticky .sdel { position: absolute; top: -11px; right: -11px; width: 22px; height: 22px; border-radius: 50%; padding: 0; line-height: 18px;
  background: #1f2630; color: var(--text); border: 1px solid var(--line-2); cursor: pointer; font-size: 13px; }
.sticky .sdel:hover { color: var(--danger); }
.sticky .sz { position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 55%, rgba(0,0,0,.28) 55%); border-bottom-right-radius: 3px; }
.sticky .sz::after { content: ""; position: absolute; inset: -8px; }

/* progreso de la habilidad en el panel (anillo, como en Planes) */
.ring { width: 18px; height: 18px; border-radius: 50%; flex: none; background: conic-gradient(var(--oro) calc(var(--p) * 1%), var(--line-2) 0);
  -webkit-mask: radial-gradient(circle, transparent 4px, #000 5px); mask: radial-gradient(circle, transparent 4px, #000 5px); }

/* menú del nodo: botones uno al lado del otro, debajo de la card */
.nmenu { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 4; }
.nm-item { position: absolute; display: flex; align-items: center; gap: 8px; white-space: nowrap;
  background: #1a222d; border: 1px solid var(--line-2); border-radius: 999px; padding: 7px 14px 7px 10px; cursor: pointer;
  box-shadow: 0 6px 18px rgba(0,0,0,.45); font-weight: 600; transform-origin: left center;
  animation: nm-in .16s ease-out both; animation-delay: calc(var(--i) * 40ms); }
.nm-item:hover { border-color: var(--accent); }
.nm-item .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c, var(--faint)); flex: none; }
.nm-item.on { border-color: var(--c, var(--accent)); background: color-mix(in srgb, var(--c, var(--accent)) 16%, #1a222d); }
.nm-item.tool .dot { background: none; border: 1.5px solid var(--c, var(--faint)); }
@keyframes nm-in { from { opacity: 0; translate: 0 -6px; } to { opacity: 1; translate: 0 0; } }
@media (prefers-reduced-motion: reduce) { .nm-item { animation: none; } }

.empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--faint); pointer-events: none; text-align: center; padding: 16px; line-height: 1.7; }
.toolbar { position: absolute; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 3; align-items: center; }
.toolbar .btn { background: #141a22; }
.toolbar .btn.primary { background: #b62324; }
.toolbar.pick { background: #141a22; border: 1px solid var(--accent); border-radius: 8px; padding: 6px 6px 6px 12px; max-width: calc(100% - 20px); }
.sel-box { position: absolute; z-index: 4; border: 1px solid var(--accent); background: rgba(88, 166, 255, .10); border-radius: 3px; pointer-events: none; }
.sel-box[hidden] { display: none; }
.toolbar.pick span { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette { position: absolute; bottom: calc(62px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%); z-index: 3;
  display: flex; gap: 6px; background: #141a22; border: 1px solid var(--line-2); border-radius: 8px; padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.45); }
.swatch { border: 0; border-radius: 4px; padding: 8px 10px; cursor: pointer; color: var(--s-ink); font-weight: 600; font-size: 11px; white-space: nowrap; }
.swatch[data-color="rosa"] { background: var(--s-rosa); } .swatch[data-color="amarillo"] { background: var(--s-amarillo); }
.swatch[data-color="azul"] { background: var(--s-azul); } .swatch[data-color="verde"] { background: var(--s-verde); }
.swatch:hover { filter: brightness(1.06); transform: translateY(-1px); }
.toast { position: absolute; top: 56px; left: 50%; transform: translate(-50%, -8px); background: #1f2630; border: 1px solid var(--line-2); border-radius: 6px;
  padding: 7px 12px; opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; z-index: 7; max-width: calc(100% - 32px); }
.toast.show { opacity: 1; transform: translate(-50%, 0); }

/* ---------- ventanas ---------- */
.ask { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.55); display: flex; align-items: flex-start; justify-content: center; padding: 18vh 16px 16px; }
.ask-box { width: min(400px, 100%); max-height: 76vh; overflow-y: auto; background: var(--panel); border: 1px solid var(--line-2); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.ask-box.wide { width: min(520px, 100%); }
.ask-title { font-weight: 600; line-height: 1.5; }
.ask-text { color: var(--muted); line-height: 1.6; }
.ask input, .ask textarea { background: var(--input); border: 1px solid var(--line-2); border-radius: 6px; padding: 10px; font-size: 16px; width: 100%; }
.ask #askArea { min-height: 200px; font-size: 11px; resize: vertical; }
.ask input:focus, .ask textarea:focus { outline: none; border-color: var(--accent); }
.ask-btns { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.help { margin: 0; padding-left: 0; list-style: none; color: var(--muted); line-height: 1.6; font-size: 11.5px; display: grid; gap: 4px; }
.help b { color: var(--text); }
.help-h { color: var(--muted); font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-top: 2px; }
.lv-tab { display: grid; grid-template-columns: auto 1fr 1fr; gap: 3px 10px; font-size: 11px; color: var(--muted); line-height: 1.45; }
.lv-tab b { color: var(--text); }
.lv-tab .h { color: var(--faint); font-weight: 700; }
.legend { display: grid; grid-template-columns: auto 1fr; gap: 5px 10px; font-size: 11.5px; color: var(--muted); align-items: center; }
.legend i { display: block; width: 18px; height: 14px; border-radius: 2px; }

.only-mobile { display: none; }
@media (max-width: 800px) {
  .only-mobile { display: inline-block; }
  .side { position: fixed; inset: 0; z-index: 10; width: 100%; padding: 14px 16px; padding-top: calc(14px + env(safe-area-inset-top, 0px));
    transform: translateX(-100%); transition: transform .2s; box-shadow: 0 0 40px rgba(0,0,0,.5); }
  .layout.side-collapsed .side { display: flex; }
  .side.open { transform: none; }
  .tools { opacity: 1; }
  .port.p-t, .port.p-b { opacity: .7; }
  .toolbar .lk { padding: 9px 9px; }
  #wireBar { flex-wrap: wrap; justify-content: center; width: calc(100% - 16px); }
  #wireBar .sep { display: none; }
  .fc-bar { top: 64px; }
  .topbar { flex-wrap: wrap; }
  .layers .lbl { display: none; }
  .layers button { padding: 8px 11px; }
  .rv { padding-top: 64px; }
  .fc-hint { white-space: normal; width: calc(100% - 32px); text-align: center; }
  .skill .x { opacity: 1; font-size: 15px; padding: 4px 6px; }
  .skill { padding: 11px 10px; }
  .btn { padding: 10px 12px; }
  .btn.sq { width: 42px; }
  .toolbar .lbl { display: none; }
  .icon-btn { width: 40px; height: 40px; }
  .tools button { font-size: 15px; padding: 0 6px; }
  .nm-item { padding: 10px 16px 10px 12px; font-size: 13px; }
  .ask:has(.notes-box), .ask:has(.wide) { padding-top: 8vh; }
  .notes-box textarea { font-size: 16px; }
  .card .note-dot:not(.has) { opacity: .7; }
  .palette { flex-wrap: wrap; justify-content: center; width: calc(100% - 24px); }
  .swatch { padding: 11px 12px; font-size: 12px; }
  .sticky .sdel, .sticky .sz { display: none; }
  .sticky.selected .sdel, .sticky.selected .sz { display: block; }
}
`;
var HTML = `<div class="layout" id="layoutEl">
  <aside class="side" id="side">
    <div class="side-head">
      <span class="sec">Habilidades</span>
      <button class="icon-btn add" id="newSkill" aria-label="Nueva habilidad" title="Nueva habilidad">+</button>
      <span class="grow"></span>
      <button class="icon-btn" id="exportBtn" aria-label="Exportar" title="Exportar: guardar una copia de todas las habilidades en JSON">⇩</button>
      <button class="icon-btn" id="importBtn" aria-label="Importar" title="Importar: cargar habilidades desde un JSON">⇧</button>
      <button class="icon-btn" data-help aria-label="Ayuda" title="Ayuda">?</button>
      <button class="icon-btn only-mobile" id="closeSide" aria-label="Cerrar panel">×</button>
    </div>
    <div class="skills" id="skills"></div>
    <div class="pnotes" id="pnotes" hidden>
      <div class="pn-head"><span class="pn-title" id="pnTitle">Notas</span><button class="btn sm" id="pnMode" hidden>✎ editar</button></div>
      <div class="pn-meta" id="pnMeta"></div>
      <div class="nt-body pn-view" id="pnView"></div>
      <div class="pn-edit" id="pnEdit" hidden>
        <div class="nt-tools" id="pnTools"></div>
        <textarea id="pnText" placeholder="Notas, links, pasos… (- [ ] para una tarea que se tilda)"></textarea>
      </div>
    </div>
  </aside>
  <div class="stage">
    <div class="topbar">
      <button class="icon-btn" id="openSide" aria-label="Mostrar u ocultar el panel" title="Mostrar / ocultar panel">☰</button>
      <div class="vseg" role="tablist" aria-label="Vista">
        <button type="button" id="vMap" class="on" title="Diagrama para editar">Diagrama</button>
        <button type="button" id="vFoco" title="Vista foco: una card y sus conexiones, en 3D">◉ Foco</button>
        <button type="button" id="vRuta" title="Visor de rutas: los pasos de la ruta, en orden">➜ Ruta</button>
      </div>
      <div class="layers" id="layers" aria-label="Capas">
        <button type="button" data-layer="comp" title="Composición: líneas continuas (es parte de)"><svg width="22" height="10" viewBox="0 0 22 10"><path d="M1 5 H21" fill="none" stroke="#9aa6b5" stroke-width="2"/></svg><span class="lbl">Composición</span></button>
        <button type="button" data-layer="dep" title="Dependencia: líneas con guiones (requisito)"><svg width="22" height="10" viewBox="0 0 22 10"><path d="M1 5 H21" fill="none" stroke="#9aa6b5" stroke-width="2" stroke-dasharray="5 3"/></svg><span class="lbl">Dependencia</span></button>
        <button type="button" data-layer="ruta" title="Ruta: punteado grande con flecha (secuencia de aprendizaje)"><svg width="22" height="10" viewBox="0 0 22 10"><path d="M2 5 H14" fill="none" stroke="#7ee787" stroke-width="3" stroke-dasharray="0.1 6" stroke-linecap="round"/><path d="M15 1.5 L21 5 L15 8.5 Z" fill="#7ee787"/></svg><span class="lbl">Ruta</span></button>
      </div>
      <button class="icon-btn help-btn only-mobile" data-help aria-label="Ayuda">?</button>
    </div>
    <div class="foco" id="foco" hidden></div>
    <div class="rv" id="rv" hidden></div>
    <main class="canvas" id="canvas">
      <div class="world" id="world">
        <svg class="wires" id="wires" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="cards" id="cards"></div>
        <div class="stickies" id="stickies"></div>
      </div>
      <div class="nmenu" id="nmenu" hidden></div>
      <div class="empty" id="empty" hidden><p></p></div>
      <div class="palette" id="palette" hidden>
        <button class="swatch" data-color="rosa" title="Traba / cuello de botella">traba</button>
        <button class="swatch" data-color="amarillo" title="Idea">idea</button>
        <button class="swatch" data-color="azul" title="Pregunta / investigar">pregunta</button>
        <button class="swatch" data-color="verde" title="Recurso">recurso</button>
      </div>
      <div class="toolbar" id="toolbar">
        <button class="btn sq" id="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer">↶</button>
        <button class="btn sq" id="redo" title="Rehacer (Ctrl+Y)" aria-label="Rehacer">↷</button>
        <button class="btn" id="fit" title="Ver todo">⤢<span class="lbl"> centrar</span></button>
        <button class="btn" id="noteBtn" title="Nota adhesiva">▣ nota</button>
        <button class="btn route-btn" id="routeBtn" title="Dibujar ruta: las líneas nuevas salen como flechas de ruta">➜<span class="lbl"> ruta</span></button>
      </div>
      <div class="sel-box" id="selBox" hidden></div>
      <div class="toolbar" id="wireBar" hidden>
        <button class="btn lk" data-shape="recta" title="Recta" aria-label="Recta"><svg width="26" height="14" viewBox="0 0 26 14"><path d="M3 11 L23 3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
        <button class="btn lk" data-shape="escalon" title="Escalonada" aria-label="Escalonada"><svg width="26" height="14" viewBox="0 0 26 14"><path d="M3 11 H13 V3 H23" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
        <button class="btn lk" data-shape="curva" title="Curva" aria-label="Curva"><svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 9 C7 1 11 1 13 7 S19 13 24 5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
        <span class="sep"></span>
        <button class="btn lk" data-style="continua" title="Continua" aria-label="Continua"><svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 7 H24" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
        <button class="btn lk" data-style="guiones" title="Guiones" aria-label="Guiones"><svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 7 H24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="4.5 3"/></svg></button>
        <button class="btn lk" data-style="puntos" title="Puntos" aria-label="Puntos"><svg width="26" height="14" viewBox="0 0 26 14"><path d="M3 7 H24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="0.1 4" stroke-linecap="round" stroke-width="2.4"/></svg></button>
        <button class="btn lk" data-style="ruta" title="Ruta: secuencia de aprendizaje" aria-label="Ruta"><svg width="26" height="14" viewBox="0 0 26 14"><path d="M3 7 H16" fill="none" stroke="#7ee787" stroke-width="3.2" stroke-dasharray="0.1 6.5" stroke-linecap="round"/><path d="M17 3 L24 7 L17 11 Z" fill="#7ee787"/></svg></button>
        <span class="sep"></span>
        <button class="btn primary" id="wireDel" title="Borrar la línea">× borrar</button>
        <button class="btn" id="wireCancel">listo</button>
      </div>
    </main>
    <div class="toast" id="toast"></div>
  </div>
</div>

<div class="ask" id="ask" hidden>
  <div class="ask-box" id="askBox" role="dialog" aria-modal="true" aria-labelledby="askTitle">
    <div class="ask-title" id="askTitle"></div>
    <div class="ask-text" id="askText" hidden></div>
    <input type="text" id="askInput" maxlength="160">
    <textarea id="askArea" readonly hidden></textarea>
    <div class="ask-btns">
      <button type="button" class="btn" id="askCancel">cancelar</button>
      <button type="button" class="btn primary" id="askOk">aceptar</button>
    </div>
  </div>
</div>

<div class="ask" id="notesDlg" hidden>
  <div class="ask-box notes-box" role="dialog" aria-modal="true" aria-labelledby="notesTitle">
    <div class="notes-head">
      <span class="notes-title" id="notesTitle"></span>
      <button type="button" class="icon-btn" id="notesClose" aria-label="Cerrar">×</button>
    </div>
    <textarea id="notesText" placeholder="Notas, links, detalles…"></textarea>
    <div class="ask-btns"><button type="button" class="btn primary" id="notesOk">listo</button></div>
  </div>
</div>

<div class="ask" id="helpDlg" hidden>
  <div class="ask-box wide">
    <div class="ask-title">Cómo se usa</div>
    <ul class="help">
      <li>Cada <b>habilidad</b> del panel izquierdo es un diagrama. Tocala para verla.</li>
      <li><b>Líneas</b>: arrastrá un <b>●</b> de cualquiera de los cuatro lados de la card hasta otra card = conectarlas (llega al lado más cercano) · a un lugar vacío = nuevo nodo.</li>
      <li>Tocá una <b>línea</b> = elegir su forma (recta, escalonada, curva) y su estilo (continua, guiones, puntos, ruta), o borrarla. Las líneas nuevas salen con la última forma y estilo que elegiste.</li>
      <li>Qué significa cada línea: <b>continua</b> = es parte de (composición) · <b>guiones</b> = requisito (dependencia) · <b style="color:var(--ruta)">punteado grande con flecha</b> = <b>ruta</b>, el orden en que vas a aprender. La ruta es una secuencia, no un requisito: va por su lado y no tiene que seguir las dependencias. A una card pueden llegar varias flechas de ruta (dos caminos que se juntan) o salir varias (un camino que se abre); lo único que no se puede es cerrar un círculo.</li>
      <li><b>➜ ruta</b> (abajo): prendido, las líneas que arrastres salen como flechas de ruta; apagado, como líneas comunes.</li>
      <li><b>Capas</b> (arriba): prendé o apagá Composición, Dependencia y Ruta para ver solo lo que te interesa.</li>
      <li><b>➜ Ruta</b> (arriba): la ruta como diagrama de flujo, de <b>Inicio</b> a <b>Fin</b>, con su estado: <b>hecho</b> (oro o diamante), <b>ahora</b> (sin terminar y con todo lo anterior hecho) y pendiente. Las cards a las que llegan varios caminos van después de todos ellos; las del mismo paso salen juntas, en paralelo. Tocá un paso para ver sus notas.</li>
      <li><b>◉ Foco</b> (arriba): las cards como bolitas en 3D. Se ve una card en el centro y solo sus conexiones directas; tocá otra bolita para centrarla. <b>Ver mapa completo</b> muestra todo; tocando una bolita volvés al foco. Arrastrá para girar, rueda o dos dedos para el zoom. <b>Diagrama</b> vuelve a editar.</li>
      <li>Tocá una <b>card</b> = menú debajo para elegir <b style="color:var(--semantico)">semántico</b> / <b style="color:var(--procedimental)">procedimental</b>.</li>
      <li><b>Estado</b>: tocá el círculo al inicio de la card para subirlo. El nivel de cada card es independiente del de sus partes.</li>
      <li><b>Notas</b>: el <b>puntito</b> de la card (lleno si tiene notas).</li>
      <li>Arrastrá la <b>card</b> = moverla · <b>Shift + arrastrar</b> = mover con todas sus partes.</li>
      <li><b>Doble clic</b> = crear nodo / renombrar · <b>✎</b> renombrar · <b>+</b> nueva parte · <b>×</b> borrar.</li>
      <li>Arrastrá el fondo = mover · rueda o dos dedos = zoom · <b>⤢</b> centrar.</li>
      <li>Teclado: <b>Tab</b> nueva parte · <b>Supr</b> borrar · <b>Enter</b> renombrar · <b>Ctrl+Z / Ctrl+Y</b>.</li>
    </ul>
    <div class="help-h">Niveles</div>
    <div class="lv-tab">
      <span></span><span class="h">Procedimental</span><span class="h">Semántico</span>
      <b style="color:var(--bronce)">Bronce</b><span>lo entiendo o lo hice una vez</span><span>lo leí</span>
      <b style="color:var(--plata)">Plata</b><span>me sale con atención deliberada</span><span>lo recuerdo con ayuda</span>
      <b style="color:var(--oro)">Oro</b><span>me sale de forma consistente</span><span>lo explico sin mirar</span>
      <b style="color:var(--diamante)">Diamante</b><span>automatizado, me sale mientras pienso en otra cosa</span><span>lo uso sin pensarlo</span>
    </div>
    <div class="help-h">Notas adhesivas <span style="font-weight:400;text-transform:none;letter-spacing:0">(botón ▣ nota)</span></div>
    <div class="legend">
      <i style="background:var(--s-rosa)"></i><span><b>Rosa</b>: traba / cuello de botella</span>
      <i style="background:var(--s-amarillo)"></i><span><b>Amarillo</b>: idea</span>
      <i style="background:var(--s-azul)"></i><span><b>Azul</b>: pregunta / investigar</span>
      <i style="background:var(--s-verde)"></i><span><b>Verde</b>: recurso</span>
    </div>
    <ul class="help"><li>Arrastrala para moverla · <b>doble toque</b> para escribir · esquina de abajo a la derecha para cambiar el tamaño · <b>×</b> para borrarla.</li>
      <li>Se guarda en tu cuenta junto con Planes. <b>Exportar</b> guarda una copia en JSON.</li></ul>
    <div class="ask-btns"><button type="button" class="btn primary" id="helpClose">entendido</button></div>
  </div>
</div>
<input type="file" id="fileIn" accept="application/json,.json" hidden>

`;

var ctl = null;
window.PlanesAprender = {
  normalize: normalize,
  initialData: initialData,
  // api: { state() → objeto de datos, save(), visible() }
  mount: function(host, api){
    if(ctl) return;
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<style>" + CSS + "</style>" + HTML;
    ctl = engine(root, api);
  },
  show: function(){ if(ctl) ctl.show(); },
  reload: function(){ if(ctl) ctl.reload(); },
  busy: function(){ return !!(ctl && ctl.busy()); }
};

function engine(root, api){

  var W = 230, H = 56;      // tamaño de la card (igual que --card-w / --card-h)
  var GX = 60, GY = 18;     // separación entre columnas / filas de las cards nuevas
  var GRID = 10;
  var LEVEL_ORDER = ["", "bronce", "plata", "oro", "diamante"];
  var PLATA = 2, ORO = 3;   // posiciones en LEVEL_ORDER
  var LEVELS = {
    bronce:   { label: "Bronce",   color: "var(--bronce)" },
    plata:    { label: "Plata",    color: "var(--plata)" },
    oro:      { label: "Oro",      color: "var(--oro)" },
    diamante: { label: "Diamante", color: "var(--diamante)" }
  };
  // Criterio de cada nivel según el tipo (una card sin tipo usa los de procedimental).
  var CRITERIA = {
    procedimental: { bronce: "lo entiendo o lo hice una vez", plata: "me sale con atención deliberada",
                     oro: "me sale de forma consistente", diamante: "automatizado, me sale mientras pienso en otra cosa" },
    semantico:     { bronce: "lo leí", plata: "lo recuerdo con ayuda", oro: "lo explico sin mirar", diamante: "lo uso sin pensarlo" }
  };
  var TYPES = {
    semantico:     { label: "Semántico",     color: "var(--semantico)" },
    procedimental: { label: "Procedimental", color: "var(--procedimental)" }
  };
  var STICKY_COLORS = ["rosa", "amarillo", "azul", "verde"];

  var $ = function(id){ return root.getElementById(id); };
  var canvas = $("canvas"), world = $("world"), wiresEl = $("wires"), cardsEl = $("cards"), stickiesEl = $("stickies");

  var state = api.state();
  var hist = [], fut = [];
  var sel = null;          // {node: id} | {dep: {from, to}} | {sticky: id}
  var els = {};            // id de nodo → elemento de la card
  var sEls = {};           // id de nota adhesiva → elemento
  var drag = null, pinch = null, pointers = {}, tempWire = null, editing = null;
  var menu = null;         // {id} menú abierto sobre un nodo

  // Guardar = lo guarda Planes (en el navegador y, con cuenta, en la nube).
  function save(){ api.save(); }

  function cur(){
    for(var i = 0; i < state.skills.length; i++) if(state.skills[i].id === state.current) return state.skills[i];
    return null;
  }
  function byId(p, id){
    for(var i = 0; i < p.nodes.length; i++) if(p.nodes[i].id === id) return p.nodes[i];
    return null;
  }
  function stickyById(p, id){
    for(var i = 0; i < p.stickies.length; i++) if(p.stickies[i].id === id) return p.stickies[i];
    return null;
  }
  function prereqs(p, id){ return p.deps.filter(function(d){ return d.to === id; }).map(function(d){ return d.from; }); }
  function dependents(p, id){ return p.deps.filter(function(d){ return d.from === id; }).map(function(d){ return d.to; }); }

  function reachesIn(list, a, b){
    var seen = {}, stack = [a];
    while(stack.length){
      var n = stack.pop();
      if(n === b) return true;
      if(seen[n]) continue;
      seen[n] = 1;
      list.forEach(function(d){ if(d.from === n) stack.push(d.to); });
    }
    return false;
  }
  function reaches(p, a, b){ return reachesIn(p.deps, a, b); }
  function descendants(p, id){
    var out = {}, stack = [id];
    while(stack.length){
      var n = stack.pop();
      if(out[n]) continue;
      out[n] = 1;
      dependents(p, n).forEach(function(x){ stack.push(x); });
    }
    return Object.keys(out);
  }
  // Entre dos cards puede haber todas las líneas que quieras (se dibujan corridas para que no se tapen).
  // Lo único que se rechaza es un círculo de requisitos (guiones): A necesita B y B necesita A.
  function lineErr(p, from, to, style, skip){
    if(style !== "guiones") return "";
    if(reachesIn(p.deps.filter(function(d){ return d !== skip && d.style === "guiones"; }), to, from)) return "Eso crearía un círculo de requisitos";
    return "";
  }
  function addDep(p, from, to){
    if(from === to) return false;
    var nd = lineFor({ from: from, to: to }), err = lineErr(p, from, to, nd.style || "continua");
    if(err){ toast(err); return false; }
    p.deps.push(nd);
    return nd;
  }
  function removeDep(p, from, to, style){ var d = findDep(p, from, to, style); p.deps = p.deps.filter(function(x){ return x !== d; }); }

  // style: si se da, solo una línea de ese estilo («continua» = sin estilo) · skip: una línea a ignorar
  function findDep(p, from, to, style, skip){
    return p.deps.filter(function(d){ return d !== skip && d.from === from && d.to === to && (!style || (d.style || "continua") === style); })[0] || null;
  }
  // Forma y estilo de las líneas nuevas: los últimos que se eligieron.
  function lineFor(d){
    var ld = state.lineDefault || {};
    if(ld.shape && ld.shape !== "curva") d.shape = ld.shape;
    if(ld.style && ld.style !== "continua" && ld.style !== "ruta") d.style = ld.style;
    return d;
  }
  function routeMode(){ return (state.lineDefault || {}).style === "ruta"; }

  // ---------- ruta (secuencia de aprendizaje, aparte de las líneas) ----------
  function findRoute(p, from, to){ return (p.route || []).filter(function(r){ return r.from === from && r.to === to; })[0] || null; }
  // Nueva flecha de ruta. Se pueden juntar o abrir caminos; lo único que no se puede es cerrar un círculo.
  function addRoute(p, from, to, extra){
    if(from === to) return false;
    p.route = p.route || [];
    if(findRoute(p, from, to)){ toast("Esa flecha de ruta ya existe"); return false; }
    if(reachesIn(p.route, to, from)){ toast("Eso cerraría la ruta en un círculo"); return false; }
    var r = { from: from, to: to }, ld = state.lineDefault || {};
    if(ld.shape && ld.shape !== "curva") r.shape = ld.shape;
    Object.assign(r, extra || {});
    p.route.push(r);
    return true;
  }
  function removeRoute(p, from, to){ p.route = (p.route || []).filter(function(r){ return !(r.from === from && r.to === to); }); }
  // Al borrar cards que estaban en la ruta, la ruta sigue: las anteriores pasan a apuntar a las siguientes.
  function dropFromRoute(p, ids){
    var gone = {}; ids.forEach(function(id){ gone[id] = 1; });
    var R = p.route || [], bridges = [];
    R.forEach(function(r){
      if(gone[r.from] || !gone[r.to]) return;
      var seen = {}, st = [r.to];
      while(st.length){
        var x = st.pop(); if(seen[x]) continue; seen[x] = 1;
        R.forEach(function(q){
          if(q.from !== x) return;
          if(gone[q.to]) st.push(q.to);
          else bridges.push({ from: r.from, to: q.to, fs: r.fs, ts: q.ts, shape: r.shape });
        });
      }
    });
    p.route = R.filter(function(r){ return !gone[r.from] && !gone[r.to]; });
    bridges.forEach(function(b){
      if(b.from === b.to || findRoute(p, b.from, b.to) || reachesIn(p.route, b.to, b.from)) return;
      if(!b.fs) delete b.fs; if(!b.ts) delete b.ts; if(!b.shape) delete b.shape;
      p.route.push(b);
    });
  }

  // ---------- capas: mostrar u ocultar cada tipo de línea ----------
  function layerOn(k){ var L = state.layers || {}; return L[k] !== false; }
  function depLayer(d){ return d.style === "guiones" ? "dep" : "comp"; }
  function showLayer(k){ if(layerOn(k)) return; state.layers = state.layers || {}; state.layers[k] = true; renderLayers(); }
  function renderLayers(){
    Array.prototype.forEach.call(root.querySelectorAll("#layers [data-layer]"), function(b){ b.classList.toggle("on", layerOn(b.dataset.layer)); });
  }

  function rank(l){ return Math.max(0, LEVEL_ORDER.indexOf(l || "")); }
  function criterion(t, l){ return CRITERIA[t.type === "semantico" ? "semantico" : "procedimental"][l]; }

  function overlaps(p, x, y, skip){ return p.nodes.some(function(t){ return t.id !== skip && Math.abs(t.x - x) < W && Math.abs(t.y - y) < H + 4; }); }
  function freeSpot(p, x, y){ var i = 0; while(overlaps(p, x, y) && i++ < 200) y += H + GY; return { x: x, y: y }; }
  function snap(v){ return Math.round(v / GRID) * GRID; }
  function makeNode(p, x, y, title){
    var s = freeSpot(p, snap(x), snap(y));
    var t = { id: uid(), title: title || "Nuevo nodo", x: s.x, y: s.y };
    p.nodes.push(t);
    return t;
  }
  function cardH(id){ var el = els[id]; return (el && el.offsetHeight) || H; }

  // ---------- historial ----------
  function snapshot(){ return JSON.stringify({ skills: state.skills, current: state.current }); }
  function pushHist(s){ hist.push(s || snapshot()); if(hist.length > 200) hist.shift(); fut = []; }
  function restore(s){ var o = JSON.parse(s); state.skills = o.skills; state.current = o.current; sel = null; save(); renderAll(); }
  function undo(){ if(!hist.length) return; fut.push(snapshot()); restore(hist.pop()); }
  function redo(){ if(!fut.length) return; hist.push(snapshot()); restore(fut.pop()); }
  // Cambio con deshacer.
  function change(fn){
    var before = snapshot(), p = cur();
    if(fn(p) === false) return;
    pushHist(before);
    p = cur();
    if(p) p.updated = Date.now();
    save();
    renderAll();
  }

  // ---------- vista ----------
  function view(){ var p = cur(); return p ? p.view : { x: 0, y: 0, z: 1 }; }
  function applyView(){
    var v = view();
    world.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.z + ")";
    var g = 22 * v.z;
    canvas.style.backgroundSize = g + "px " + g + "px";
    canvas.style.backgroundPosition = v.x + "px " + v.y + "px";
    placeMenu();
  }
  function toWorld(cx, cy){ var r = canvas.getBoundingClientRect(), v = view(); return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; }
  function zoomAt(cx, cy, factor){
    var p = cur(); if(!p) return;
    var v = p.view, r = canvas.getBoundingClientRect();
    var nz = Math.min(2.5, Math.max(0.2, v.z * factor));
    var sx = cx - r.left, sy = cy - r.top;
    v.x = sx - (sx - v.x) * nz / v.z;
    v.y = sy - (sy - v.y) * nz / v.z;
    v.z = nz;
    applyView();
    saveSoon();
  }
  var saveTimer;
  function saveSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }
  function fit(){
    var p = cur(); if(!p || (!p.nodes.length && !p.stickies.length)) return;
    var r = canvas.getBoundingClientRect();
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function box(x, y, w, h){ minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); }
    p.nodes.forEach(function(t){ box(t.x, t.y, W, cardH(t.id)); });
    p.stickies.forEach(function(s){ box(s.x, s.y, s.w, s.h); });
    var pad = 40;
    var z = Math.min(1.2, (r.width - pad * 2) / (maxX - minX), (r.height - pad * 2 - 110) / (maxY - minY));
    z = Math.max(0.45, z);   // en pantallas chicas mejor legible que completo
    p.view.z = z;
    // si no entra a lo ancho, arranca desde la izquierda (donde empieza el diagrama)
    p.view.x = Math.max(pad - minX * z, (r.width - (maxX - minX) * z) / 2 - minX * z);
    p.view.y = (r.height - (maxY - minY) * z) / 2 - minY * z;
    applyView();
    save();
  }

  // ---------- dibujo ----------
  var multi = [];          // selección múltiple de nodos (recuadro o Ctrl+click)
  function isSelNode(id){ return (sel && sel.node === id) || multi.indexOf(id) >= 0; }
  // La línea elegida: una flecha de ruta, o una de s.deps por su posición (puede haber varias iguales).
  function selLine(p){
    if(!sel || !sel.dep || !p) return null;
    if(sel.dep.route) return findRoute(p, sel.dep.from, sel.dep.to);
    var d = p.deps[sel.dep.i];
    return d && d.from === sel.dep.from && d.to === sel.dep.to ? d : null;
  }
  function isSelDep(d, route){
    if(!sel || !sel.dep || !!sel.dep.route !== !!route) return false;
    return route ? sel.dep.from === d.from && sel.dep.to === d.to : selLine(cur()) === d;
  }
  function selectDep(p, d){ sel = { dep: { from: d.from, to: d.to, i: p.deps.indexOf(d) } }; }

  function renderAll(){
    renderSkills();
    renderStickies();
    renderCards();
    renderWires();
    applyView();
    var p = cur();
    $("undo").disabled = !hist.length;
    $("redo").disabled = !fut.length;
    $("noteBtn").disabled = !p;
    $("fit").disabled = !p || (!p.nodes.length && !p.stickies.length);
    renderBars();
    renderMenu();
    renderPanel();
    if(focoOn) syncFoco();
    if(rutaOn) renderRoute();
    renderLayers();
  }

  // ---------- vista foco (3D, solo lectura) ----------
  var focoOn = false, foco = null;
  // Colores de las bolitas: los mismos de los tipos en el diagrama (sin tipo = turquesa, como el borde de las cards).
  var FOCO_COLOR = { semantico: "#c297ff", procedimental: "#f0883e", none: "#56d4c4" };
  function focoGraph(p){
    return {
      nodes: p.nodes.map(function(t){
        return { id: t.id, title: t.title, x: t.x, y: t.y, color: FOCO_COLOR[t.type] || FOCO_COLOR.none,
                 typeLabel: TYPES[t.type] ? TYPES[t.type].label : "", levelLabel: LEVELS[t.level] ? LEVELS[t.level].label : "" };
      }),
      edges: p.deps.map(function(d){ return { from: d.from, to: d.to }; })
    };
  }
  function setFoco(on){
    var p = cur();
    if(on && (!p || !p.nodes.length)){ toast("Esta habilidad todavía no tiene nodos"); on = false; }
    if(!window.AprenderFoco) on = false;
    focoOn = on;
    if(on && rutaOn){ rutaOn = false; $("rv").hidden = true; }
    markView();
    $("foco").hidden = !on;
    if(!on){ if(foco) foco.close(); return; }
    // centro: la card elegida, la de las notas o la primera
    var start = (sel && sel.node) || panelId || multi[0] || p.nodes[0].id;
    closeMenu(); select(null); $("palette").hidden = true;
    if(!foco) foco = window.AprenderFoco.create($("foco"), { onCenter: function(id){ if(sideNotesOn()) showPanel(id, false); } });
    foco.open(focoGraph(p), start);
    if(sideNotesOn()) showPanel(foco.center(), false);
  }
  function syncFoco(){
    var p = cur();
    if(!p || !p.nodes.length){ setFoco(false); return; }
    foco.update(focoGraph(p), panelId);
  }
  // Botón de la vista actual prendido; las capas solo tienen sentido en el diagrama.
  function markView(){
    $("vMap").classList.toggle("on", !focoOn && !rutaOn);
    $("vFoco").classList.toggle("on", focoOn);
    $("vRuta").classList.toggle("on", rutaOn);
    $("layers").hidden = focoOn || rutaOn;
  }
  $("vMap").addEventListener("click", function(){ setFoco(false); setRuta(false); });
  $("vFoco").addEventListener("click", function(){ if(!focoOn) setFoco(true); });
  $("vRuta").addEventListener("click", function(){ if(!rutaOn) setRuta(true); });

  // ---------- visor de rutas (solo lectura) ----------
  var rutaOn = false;
  function setRuta(on){
    if(on && focoOn) setFoco(false);
    rutaOn = on;
    $("rv").hidden = !on;
    markView();
    if(on){ closeMenu(); select(null); $("palette").hidden = true; renderRoute(); $("rv").scrollTop = 0; }
  }
  // Rutas: cada grupo de cards unidas por flechas de ruta. Dentro de cada una, los pasos en orden:
  // el paso de una card es uno más que el de su anterior más lejana (si dos caminos se juntan, va después de los dos).
  function routeGroups(p){
    var R = (p.route || []).filter(function(r){ return byId(p, r.from) && byId(p, r.to); });
    var ids = {}, prev = {}, next = {};
    R.forEach(function(r){ ids[r.from] = ids[r.to] = 1; (next[r.from] = next[r.from] || []).push(r.to); (prev[r.to] = prev[r.to] || []).push(r.from); });
    // grupos conectados
    var comp = {}, groups = [];
    Object.keys(ids).forEach(function(id){
      if(comp[id] !== undefined) return;
      var g = [], st = [id]; comp[id] = groups.length;
      while(st.length){ var x = st.pop(); g.push(x);
        (next[x] || []).concat(prev[x] || []).forEach(function(y){ if(comp[y] === undefined){ comp[y] = groups.length; st.push(y); } }); }
      groups.push(g);
    });
    // paso de cada card (camino más largo desde un comienzo)
    var depth = {};
    function d(id){ if(depth[id] !== undefined) return depth[id]; depth[id] = 0;
      var m = 0; (prev[id] || []).forEach(function(q){ m = Math.max(m, d(q) + 1); }); return (depth[id] = m); }
    function pos(a, b){ var A = byId(p, a), B = byId(p, b); return (A.y - B.y) || (A.x - B.x); }
    return groups.map(function(g){
      var steps = [];
      g.forEach(function(id){ var k = d(id); (steps[k] = steps[k] || []).push(id); });
      steps = steps.filter(Boolean).map(function(st){ return st.sort(pos); });
      return { steps: steps, prev: prev };
    }).sort(function(a, b){ return pos(a.steps[0][0], b.steps[0][0]); });
  }
  function renderRoute(){
    var box = $("rv"), p = cur();
    if(!rutaOn) return;
    if(!p){ box.innerHTML = '<div class="rv-empty">Todavía no hay habilidades.</div>'; return; }
    var groups = routeGroups(p);
    if(!groups.length){
      box.innerHTML = '<div class="rv-empty">Esta habilidad todavía no tiene ruta.<br>' +
        'En el <b>Diagrama</b>, prendé <b style="color:var(--ruta)">➜ ruta</b> (abajo) y arrastrá el <b>●</b> de cada card a la que sigue, ' +
        'en el orden en que las vas a aprender. También podés tocar una línea y elegir el estilo ruta.<br>' +
        '<button type="button" class="btn" data-rv="map">ir al diagrama</button></div>';
      return;
    }
    function isDone(id){ return rank(byId(p, id).level) >= ORO; }
    var total = 0, done = 0;
    groups.forEach(function(g){ g.steps.forEach(function(st){ st.forEach(function(id){ total++; if(isDone(id)) done++; }); }); });
    var html = '<div class="rv-wrap"><div class="rv-head"><div class="rv-title"></div><div class="rv-sub">' + done + " de " + total + " card" + (total === 1 ? "" : "s") + " hecha" + (total === 1 ? "" : "s") + '</div></div>' +
      '<div class="rv-bar"><i style="width:' + (total ? Math.round(done / total * 100) : 0) + '%"></i></div>';
    groups.forEach(function(g, gi){
      if(groups.length > 1) html += '<div class="rv-chain">Ruta ' + (gi + 1) + "</div>";
      html += '<div class="rv-scroll">' + flowHTML(p, g, isDone) + "</div>";
    });
    box.innerHTML = html + "</div>";
    box.querySelector(".rv-title").textContent = "Ruta · " + p.name;
  }
  // Diagrama de flujo de un grupo: de arriba hacia abajo, un paso por fila, inicio y fin como terminales.
  function flowHTML(p, g, isDone){
    var mob = isMobile(), CW = mob ? 170 : 210, CH = 92, GX = mob ? 14 : 22, GY = 46, TH = 28, TW = 92;
    var rows = g.steps.map(function(r){ return r.slice(); }), next = {}, pos = {};
    Object.keys(g.prev).forEach(function(to){ g.prev[to].forEach(function(f){ (next[f] = next[f] || []).push(to); }); });
    var maxN = Math.max.apply(null, rows.map(function(r){ return r.length; }));
    var W = Math.max(TW, maxN * CW + (maxN - 1) * GX);
    // Cada fila se ordena según dónde quedaron sus anteriores, para que las flechas se crucen lo menos posible.
    rows.forEach(function(r, ri){
      if(ri) r.sort(function(a, b){
        function bar(id){ var ps = (g.prev[id] || []).filter(function(q){ return pos[q]; }); return ps.length ? ps.reduce(function(s, q){ return s + pos[q].x; }, 0) / ps.length : W / 2; }
        return bar(a) - bar(b);
      });
      var rw = r.length * CW + (r.length - 1) * GX, x0 = (W - rw) / 2, y = TH + GY + ri * (CH + GY);
      r.forEach(function(id, i){ pos[id] = { x: x0 + i * (CW + GX), y: y }; });
    });
    var endY = TH + GY + rows.length * (CH + GY), H = endY + TH;
    var svg = "", cards = "";
    function edge(ax, ay, bx, by, ok){
      var k = Math.max(18, (by - ay) / 2), tip = by - 1;
      svg += '<path class="rf-edge' + (ok ? " done" : "") + '" d="M' + ax + "," + ay + " C" + ax + "," + (ay + k) + " " + bx + "," + (tip - 8 - k) + " " + bx + "," + (tip - 8) + '"/>' +
        '<path class="rf-arrow' + (ok ? " done" : "") + '" d="M' + (bx - 6) + "," + (tip - 9) + " L" + (bx + 6) + "," + (tip - 9) + " L" + bx + "," + tip + ' Z"/>';
    }
    var cx = W / 2, allDone = true;
    rows[0].forEach(function(id){ edge(cx, TH, pos[id].x + CW / 2, pos[id].y, true); });
    rows.forEach(function(r){ r.forEach(function(id){
      var a = pos[id];
      (next[id] || []).forEach(function(to){ var b = pos[to]; if(b) edge(a.x + CW / 2, a.y + CH, b.x + CW / 2, b.y, isDone(id)); });
      if(!(next[id] || []).length) edge(a.x + CW / 2, a.y + CH, cx, endY, isDone(id));
      if(!isDone(id)) allDone = false;
    }); });
    rows.forEach(function(r, ri){ r.forEach(function(id){
      var t = byId(p, id), a = pos[id], ready = (g.prev[id] || []).every(isDone);
      var cs = isDone(id) ? "hecho" : ready ? "actual" : "pendiente";
      var meta = [TYPES[t.type] ? TYPES[t.type].label : "Sin tipo", LEVELS[t.level] ? LEVELS[t.level].label : "Sin estado"].join(" · ");
      cards += '<div class="rv-card ' + cs + (panelId === id ? " sel" : "") + '" data-id="' + id + '" style="left:' + a.x + "px;top:" + a.y + "px;width:" + CW + "px;height:" + CH + "px" +
        (TYPES[t.type] ? ";border-left-color:" + TYPES[t.type].color : "") + '">' +
        '<div class="rv-top"><span class="rv-num">' + (ri + 1) + (r.length > 1 ? " · en paralelo" : "") + '</span><span class="rv-st">' +
        (cs === "hecho" ? "✓ hecho" : cs === "actual" ? "▶ ahora" : "pendiente") + "</span></div>" +
        '<div class="rv-t">' + esc(t.title) + '</div><div class="rv-m">' + meta + "</div></div>";
    }); });
    var term = function(y, txt, ok){ return '<div class="rf-term' + (ok ? " done" : "") + '" style="left:' + (cx - TW / 2) + "px;top:" + y + "px;width:" + TW + "px;height:" + TH + 'px">' + txt + "</div>"; };
    return '<div class="rv-flow" style="width:' + W + "px;height:" + H + 'px"><svg width="' + W + '" height="' + H + '">' + svg + "</svg>" +
      term(0, "Inicio", true) + cards + term(endY, "Fin", allDone) + "</div>";
  }
  $("rv").addEventListener("click", function(e){
    if(e.target.closest('[data-rv="map"]')){ setRuta(false); return; }
    var c = e.target.closest(".rv-card[data-id]"); if(!c) return;
    if(sideNotesOn()){ showPanel(c.dataset.id, false); renderRoute(); } else openNotes(c.dataset.id);
  });
  Array.prototype.forEach.call(root.querySelectorAll("#layers [data-layer]"), function(b){
    b.addEventListener("click", function(){
      state.layers = state.layers || {};
      state.layers[b.dataset.layer] = !layerOn(b.dataset.layer);
      if(sel && sel.dep){ sel = null; }
      save(); renderLayers(); renderWires(); renderBars();
    });
  });

  function levelTip(p, t, lv){
    var s = lv ? lv.label + ": " + criterion(t, t.level) : "Sin estado";
    var next = LEVEL_ORDER[rank(t.level) + 1];
    return s + (next ? " · tocá para subir a " + LEVELS[next].label + " (" + criterion(t, next) + ")" : " · tocá para volver a sin estado");
  }

  function renderCards(){
    var p = cur();
    cardsEl.innerHTML = "";
    els = {};
    $("empty").hidden = !!(p && (p.nodes.length || p.stickies.length));
    $("empty").firstElementChild.textContent = p
      ? "Doble clic (o doble toque) para crear el primer nodo."
      : "Creá una habilidad con el + de Habilidades.";
    if(!p) return;
    p.nodes.forEach(function(t){
      var kids = dependents(p, t.id).filter(function(x, i, a){ return a.indexOf(x) === i; }).length;   // cards distintas
      var c = document.createElement("div");
      var ty = TYPES[t.type], lv = LEVELS[t.level];
      c.className = "card" + (ty ? " t-" + t.type : !prereqs(p, t.id).length && kids ? " root" : "") + (lv ? " lv-" + t.level : "") +
        (isSelNode(t.id) ? " selected" : "");
      c.dataset.id = t.id;
      c.style.left = t.x + "px";
      c.style.top = t.y + "px";
      c.innerHTML =
        ["t", "r", "b", "l"].map(function(sd){ return '<span class="port p-' + sd + '" data-port="' + sd + '" title="Arrastrá para conectar"></span>'; }).join("") +
        '<div class="head"><button class="st" data-act="level"></button><span class="title"></span></div>' +
        '<div class="meta">' + (kids ? '<span class="kids" title="Partes">→ ' + kids + '</span>' : '') +
          noteDot(t) + '<span class="tools"><button data-act="edit" title="Renombrar">✎</button><button data-act="child" title="Nueva parte (Tab)">+</button><button data-act="del" title="Borrar (Supr)">×</button></span>' +
        '</div>';
      var st = c.querySelector(".st");
      st.innerHTML = lv ? '<span class="medal m-' + t.level + '" style="--m:' + lv.color + '"></span>' : "○";
      st.title = levelTip(p, t, lv);
      c.querySelector(".title").textContent = t.title;
      cardsEl.appendChild(c);
      els[t.id] = c;
    });
  }

  function renderStickies(){
    var p = cur();
    stickiesEl.innerHTML = "";
    sEls = {};
    if(!p) return;
    p.stickies.forEach(function(s){
      var el = document.createElement("div");
      el.className = "sticky c-" + s.color + (sel && sel.sticky === s.id ? " selected" : "");
      el.dataset.sid = s.id;
      el.style.left = s.x + "px"; el.style.top = s.y + "px";
      el.style.width = s.w + "px"; el.style.height = s.h + "px";
      el.innerHTML = '<div class="stx"></div><button class="sdel" data-sact="del" aria-label="Borrar nota" title="Borrar nota">×</button><span class="sz" data-sact="resize" title="Cambiar tamaño"></span>';
      el.querySelector(".stx").textContent = s.text || "";
      stickiesEl.appendChild(el);
      sEls[s.id] = el;
    });
  }

  // ---------- líneas: salen y llegan por cualquiera de los cuatro lados ----------
  var NORM = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] }, OPP = { t: "b", r: "l", b: "t", l: "r" };
  function anchor(t, side){
    var h = cardH(t.id);
    return side === "t" ? { x: t.x + W / 2, y: t.y } : side === "b" ? { x: t.x + W / 2, y: t.y + h }
         : side === "l" ? { x: t.x, y: t.y + h / 2 } : { x: t.x + W, y: t.y + h / 2 };
  }
  function pt(p){ return Math.round(p.x * 10) / 10 + "," + Math.round(p.y * 10) / 10; }
  // a, b: puntos · as, bs: lados (bs puede faltar mientras se arrastra) · shape: curva | recta | escalon
  function linePath(a, as, b, bs, shape){
    var na = NORM[as], nb = bs ? NORM[bs] : null;
    if(shape === "recta") return "M" + pt(a) + " L" + pt(b);
    if(shape === "escalon"){
      var a1 = { x: a.x + na[0] * 14, y: a.y + na[1] * 14 }, b1 = nb ? { x: b.x + nb[0] * 14, y: b.y + nb[1] * 14 } : b;
      var ah = !!na[0], bh = nb ? !!nb[0] : !ah, mid;
      if(ah && bh){ var mx = (a1.x + b1.x) / 2; mid = [{ x: mx, y: a1.y }, { x: mx, y: b1.y }]; }
      else if(!ah && !bh){ var my = (a1.y + b1.y) / 2; mid = [{ x: a1.x, y: my }, { x: b1.x, y: my }]; }
      else if(ah) mid = [{ x: b1.x, y: a1.y }];
      else mid = [{ x: a1.x, y: b1.y }];
      return "M" + [a, a1].concat(mid, [b1, b]).map(pt).join(" L");
    }
    var k = Math.max(30, Math.hypot(b.x - a.x, b.y - a.y) / 2.5);
    var c1 = { x: a.x + na[0] * k, y: a.y + na[1] * k }, c2 = nb ? { x: b.x + nb[0] * k, y: b.y + nb[1] * k } : b;
    return "M" + pt(a) + " C" + pt(c1) + " " + pt(c2) + " " + pt(b);
  }
  // off: corrimiento a lo largo del lado, para que dos líneas entre las mismas cards no se tapen.
  function anchorOff(t, side, off){
    var q = anchor(t, side);
    if(off){ if(side === "t" || side === "b") q.x += off; else q.y += off; }
    return q;
  }
  function depPath(p, d, off){
    var a = byId(p, d.from), b = byId(p, d.to);
    if(!a || !b) return null;
    var fs = d.fs || "r", ts = d.ts || "l";
    return linePath(anchorOff(a, fs, off), fs, anchorOff(b, ts, off), ts, d.shape);
  }
  // Punta de flecha de la ruta: en la card de llegada, mirando hacia adentro.
  function arrowPath(p, d, off){
    var a = byId(p, d.from), b = byId(p, d.to);
    if(!a || !b) return "";
    var fs = d.fs || "r", ts = d.ts || "l", tip = anchorOff(b, ts, off), ux, uy;
    if(d.shape === "recta"){
      var from = anchorOff(a, fs, off), len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
      ux = (tip.x - from.x) / len; uy = (tip.y - from.y) / len;
    } else { ux = -NORM[ts][0]; uy = -NORM[ts][1]; }
    var L = 13, Wd = 7, bx = tip.x - ux * L, by = tip.y - uy * L;
    return "M" + pt(tip) + " L" + pt({ x: bx - uy * Wd, y: by + ux * Wd }) + " L" + pt({ x: bx + uy * Wd, y: by - ux * Wd }) + " Z";
  }
  // Lado de la card más cercano al punto (para saber por dónde llega una línea).
  function sideAt(t, w){
    var h = cardH(t.id), dx = (w.x - (t.x + W / 2)) / W, dy = (w.y - (t.y + h / 2)) / h;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "b" : "t");
  }
  function renderWires(){
    var p = cur(), html = "";
    // Líneas que salen y llegan por los mismos lados de las mismas cards: cada una un poco corrida.
    var seen = {}, OFFS = [0, 14, -14, 28, -28];
    function offFor(d){
      var a = d.from + (d.fs || "r"), b = d.to + (d.ts || "l"), k = a < b ? a + "|" + b : b + "|" + a;
      var i = seen[k] || 0; seen[k] = i + 1;
      return OFFS[i % OFFS.length];
    }
    if(p){
      p.deps.forEach(function(d){
        if(!layerOn(depLayer(d))) return;
        var path = depPath(p, d, offFor(d)); if(!path) return;
        html += '<g class="wire' + (d.style ? " s-" + d.style : "") + (isSelDep(d) ? " selected" : "") + '" data-i="' + p.deps.indexOf(d) + '" data-from="' + d.from + '" data-to="' + d.to + '"><path class="hit" d="' + path + '"/><path class="line" d="' + path + '"/></g>';
      });
      if(layerOn("ruta")) (p.route || []).forEach(function(d){
        var off = offFor(d), path = depPath(p, d, off); if(!path) return;
        html += '<g class="wire s-ruta' + (isSelDep(d, true) ? " selected" : "") + '" data-route="1" data-from="' + d.from + '" data-to="' + d.to + '"><path class="hit" d="' + path + '"/><path class="line" d="' + path + '"/><path class="arrow" d="' + arrowPath(p, d, off) + '"/></g>';
      });
    }
    if(tempWire) html += '<path class="temp' + (drag && drag.route ? " ruta" : "") + '" d="' + tempWire + '"/>';
    wiresEl.innerHTML = html;
  }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return "&#" + c.charCodeAt(0) + ";"; }); }
  // Barra de abajo: normal · línea elegida (forma, estilo, borrar).
  function renderBars(){
    var p0 = cur(), d = selLine(p0);
    if(sel && sel.dep && !d) sel = null;
    if(p0) multi = multi.filter(function(id){ return byId(p0, id); });
    var line = !!d;
    $("routeBtn").classList.toggle("on", routeMode());
    $("wireBar").hidden = !line;
    $("toolbar").hidden = line;
    if(line) $("palette").hidden = true;
    if(d) Array.prototype.forEach.call(root.querySelectorAll("#wireBar .lk"), function(b){
      b.classList.toggle("on", b.dataset.shape ? (d.shape || "curva") === b.dataset.shape : (sel.dep.route ? "ruta" : d.style || "continua") === b.dataset.style);
    });
  }
  // Forma o estilo de la línea elegida; las próximas líneas salen igual.
  function setLine(key, val){
    var p = cur(), d = selLine(p); if(!d) return;
    var isRoute = !!sel.dep.route, def = key === "shape" ? "curva" : "continua";
    state.lineDefault = state.lineDefault || {};
    state.lineDefault[key] = val;
    if(key === "style" && (isRoute || val === "ruta")){
      if(isRoute && val === "ruta"){ save(); return; }
      // Pasar una línea a ruta o una flecha de ruta a línea: cambia de lista.
      var keep = {}; ["fs", "ts", "shape"].forEach(function(k){ if(d[k]) keep[k] = d[k]; });
      change(function(){
        if(val === "ruta"){
          if(!addRoute(p, d.from, d.to, keep)) return false;
          p.deps = p.deps.filter(function(x){ return x !== d; });
          sel = { dep: { from: d.from, to: d.to, route: true } };
          showLayer("ruta");
        } else {
          var err = lineErr(p, d.from, d.to, val);
          if(err){ toast(err); return false; }
          removeRoute(p, d.from, d.to);
          var nd = Object.assign({ from: d.from, to: d.to }, keep);
          if(val !== "continua") nd.style = val;
          p.deps.push(nd);
          selectDep(p, nd);
          showLayer(depLayer(nd));
        }
      });
      return;
    }
    if((d[key] || def) === val){ save(); return; }
    if(key === "style"){ var e2 = lineErr(p, d.from, d.to, val, d); if(e2){ toast(e2); return; } }
    change(function(){
      if(val === def) delete d[key]; else d[key] = val;
      if(key === "style" && !isRoute) showLayer(depLayer(d));
    });
  }
  Array.prototype.forEach.call(root.querySelectorAll("#wireBar .lk"), function(b){
    b.addEventListener("click", function(){ if(b.dataset.shape) setLine("shape", b.dataset.shape); else setLine("style", b.dataset.style); });
  });

  // ---------- menú del nodo: el tipo, en fila debajo de la card ----------
  function openMenu(id){ menu = { id: id }; renderMenu(); }
  function closeMenu(){ if(!menu) return; menu = null; renderMenu(); }
  function renderMenu(){
    var box = $("nmenu"), p = cur(), t = menu && p && byId(p, menu.id);
    if(!t || !els[menu.id]){ menu = null; box.hidden = true; box.innerHTML = ""; return; }
    var items = Object.keys(TYPES).map(function(k){
      return { act: "set", val: k, on: t.type === k, color: TYPES[k].color, html: '<span class="dot"></span>' + TYPES[k].label };
    }).concat([{ act: "set", val: "", on: !t.type, html: '<span class="dot"></span>Sin tipo' }]);
    box.innerHTML = items.map(function(it, i){
      return '<button type="button" class="nm-item' + (it.on ? " on" : "") + (it.cls ? " " + it.cls : "") + '" style="--i:' + i + (it.color ? ";--c:" + it.color : "") +
        '" data-menu="' + it.act + '" data-val="' + (it.val || "") + '">' + it.html + "</button>";
    }).join("");
    box.hidden = false;
    placeMenu();
  }
  // Los botones salen debajo de la card, uno al lado del otro.
  function placeMenu(){
    var box = $("nmenu");
    if(!menu || box.hidden || !els[menu.id]) return;
    var cr = canvas.getBoundingClientRect(), r = els[menu.id].getBoundingClientRect(), gap = 6;
    var kids = Array.prototype.slice.call(box.children);
    var total = kids.reduce(function(a, b){ return a + b.offsetWidth; }, 0) + gap * (kids.length - 1);
    var x = r.left - cr.left, y = r.bottom - cr.top + 8;
    x = Math.max(8, Math.min(x, cr.width - 8 - total));   // que no se salga por la derecha
    kids.forEach(function(b){ b.style.left = x + "px"; b.style.top = y + "px"; x += b.offsetWidth + gap; });
  }
  $("nmenu").addEventListener("pointerdown", function(e){ e.stopPropagation(); });
  $("nmenu").addEventListener("dblclick", function(e){ e.stopPropagation(); });
  $("nmenu").addEventListener("click", function(e){
    var b = e.target.closest("[data-menu]"); if(!b || !menu) return;
    var p = cur(), t = byId(p, menu.id); if(!t) return;
    var act = b.dataset.menu;
    menu = null;
    if(act === "set"){
      var v = b.dataset.val || null;
      if((t.type || null) !== v) change(function(){ if(v) t.type = v; else delete t.type; });
      else renderMenu();
    }
  });

  // ---------- estado (toque en el círculo = siguiente estado) ----------
  function setLevel(id, next){
    var t = byId(cur(), id); if(!t) return;
    change(function(){ if(next) t.level = next; else delete t.level; });
    toast(next ? "Estado: " + LEVELS[next].label : "Sin estado");
  }
  function cycleLevel(id){
    var t = byId(cur(), id); if(!t) return;
    setLevel(id, LEVEL_ORDER[(rank(t.level) + 1) % LEVEL_ORDER.length]);
  }
  // Progreso de la habilidad: bronce 25 %, plata 50 %, oro 75 %, diamante 100 % por nodo, promediado.
  function progress(p){
    if(!p.nodes.length) return 0;
    var sum = p.nodes.reduce(function(a, t){ return a + rank(t.level) * 25; }, 0);
    return Math.round(sum / p.nodes.length);
  }

  // ---------- notas de los nodos (como en Planes) ----------
  // La card solo muestra un puntito (lleno si tiene notas); al tocarlo se abren las notas.
  function noteDot(t){
    if(window.PlanesNotes) return window.PlanesNotes.dot(t.notes);
    var has = !!(t.notes && t.notes.trim());
    return '<button type="button" class="note-dot' + (has ? " has" : "") + '" data-act="notes" title="' + (has ? "Ver notas" : "Agregar notas") + '" aria-label="Notas"></button>';
  }
  var notesId = null;
  function openNotes(id){
    // Dentro de Planes: la misma ventana de notas con formato que las tareas.
    if(window.PlanesNotes){
      var tt = byId(cur(), id); if(!tt) return;
      window.PlanesNotes.open({ title: tt.title, text: tt.notes || "", at: tt.notesAt, save: function(v){
        change(function(){ if(v){ tt.notes = v; tt.notesAt = Date.now(); } else { delete tt.notes; delete tt.notesAt; } });
      } });
      return;
    }
    var p = cur(), t = p && byId(p, id); if(!t) return;
    notesId = id;
    $("notesTitle").textContent = t.title;
    var ta = $("notesText");
    ta.value = t.notes || "";
    $("notesDlg").hidden = false;
    // Con notas: se muestran sin abrir el teclado. Sin notas: listo para escribir.
    if(!ta.value) ta.focus(); else { ta.scrollTop = 0; ta.blur(); }
  }
  function closeNotes(){
    if(notesId === null) return;
    var id = notesId, v = $("notesText").value.replace(/\s+$/, "");
    notesId = null;
    $("notesDlg").hidden = true;
    var p = cur(), t = p && byId(p, id);
    if(t && v !== (t.notes || "")) change(function(){ if(v) t.notes = v; else delete t.notes; });
  }
  $("notesOk").addEventListener("click", closeNotes);
  $("notesClose").addEventListener("click", closeNotes);
  $("notesDlg").addEventListener("click", function(e){ if(e.target === e.currentTarget) closeNotes(); });
  document.addEventListener("keydown", function(e){ if(!api.visible()) return; if(e.key === "Escape" && !$("notesDlg").hidden){ e.preventDefault(); closeNotes(); } });

  // ---------- notas adhesivas ----------
  function createSticky(color){
    var p = cur(); if(!p) return;
    $("palette").hidden = true;
    var r = canvas.getBoundingClientRect();
    var c = toWorld(r.left + r.width / 2, r.top + r.height / 2), s;
    var n = p.stickies.length % 5;   // las nuevas se escalonan un poco para no taparse
    change(function(){
      s = { id: uid(), color: color, text: "", x: snap(c.x - 85 + n * 16), y: snap(c.y - 60 + n * 16), w: 170, h: 120 };
      p.stickies.push(s);
      sel = { sticky: s.id };
    });
    editSticky(s.id);
  }
  function editSticky(id){
    var el = sEls[id], p = cur(), s = p && stickyById(p, id);
    if(!el || !s) return;
    var tx = el.querySelector(".stx");
    editing = id;
    tx.classList.add("editing");
    try { tx.contentEditable = "plaintext-only"; } catch(e){ tx.contentEditable = "true"; }
    if(tx.contentEditable !== "plaintext-only") tx.contentEditable = "true";
    tx.focus();
    var r = document.createRange(); r.selectNodeContents(tx); r.collapse(false);
    try { var sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); } catch(e){}
    var done = false;
    function finish(){
      if(done) return; done = true;
      editing = null;
      var v = tx.innerText.replace(/\s+$/, "");
      tx.contentEditable = "false"; tx.classList.remove("editing");
      if(v !== (s.text || "")) change(function(){ s.text = v; });
      else renderStickies();
    }
    tx.addEventListener("keydown", function(e){ e.stopPropagation(); if(e.key === "Escape"){ e.preventDefault(); tx.blur(); } });
    tx.addEventListener("blur", finish);
  }
  $("noteBtn").addEventListener("click", function(){ closeMenu(); $("palette").hidden = !$("palette").hidden; });
  $("palette").addEventListener("click", function(e){ var b = e.target.closest("[data-color]"); if(b) createSticky(b.dataset.color); });

  // ---------- panel lateral: habilidades ----------
  function renderSkills(){
    var list = $("skills");
    list.innerHTML = "";
    if(!state.skills.length){ list.innerHTML = '<div class="no-skills">Todavía no hay habilidades.<br>Creá una con el <b>+</b>.</div>'; return; }
    state.skills.slice().sort(function(a, b){ return b.updated - a.updated; }).forEach(function(p){
      var el = document.createElement("div");
      el.className = "skill" + (p.id === state.current ? " active" : "");
      var pct = progress(p);
      el.innerHTML = '<span class="ring" style="--p:' + pct + '"></span><div class="txt"><div class="name"></div>' +
        '<div class="sub">' + p.nodes.length + " nodo" + (p.nodes.length === 1 ? "" : "s") + " · " + pct + "% · ed. " + new Date(p.updated).toISOString().slice(0, 10) + "</div></div>" +
        '<button class="x ren" title="Renombrar">✎</button><button class="x del" title="Borrar">×</button>';
      el.querySelector(".name").textContent = p.name;
      el.addEventListener("click", function(e){
        if(e.target.closest(".ren")){ renameSkill(p); return; }
        if(e.target.closest(".del")){
          ask({ title: "¿Borrar la habilidad «" + p.name + "» y todo su diagrama?", ok: "borrar", danger: true }, function(){
            change(function(){
              state.skills = state.skills.filter(function(x){ return x.id !== p.id; });
              if(state.current === p.id) state.current = state.skills[0] ? state.skills[0].id : null;
            });
          });
          return;
        }
        closeSideMobile();
        if(state.current !== p.id){ state.current = p.id; sel = null; menu = null; $("palette").hidden = true; save(); renderAll(); if(!p.fitted){ p.fitted = true; fit(); } }
      });
      el.addEventListener("dblclick", function(e){ if(!e.target.closest(".x")) renameSkill(p); });
      list.appendChild(el);
    });
  }
  function newSkill(){
    closeSideMobile();
    ask({ title: "Nueva habilidad", input: "", placeholder: "Ej. Latte art, Inglés oral, Dibujo", ok: "crear" }, function(name){
      change(function(){
        var p = newSkillObj(name);
        p.fitted = true;
        state.skills.push(p);
        state.current = p.id;
        var r = canvas.getBoundingClientRect(), v = p.view;
        var t = makeNode(p, (r.width / 2 - v.x) / v.z - W / 2, (r.height / 2 - v.y) / v.z - H / 2, name);
        sel = { node: t.id };
      });
    });
  }
  function renameSkill(p){
    ask({ title: "Renombrar habilidad", input: p.name, ok: "guardar" }, function(name){
      if(name !== p.name) change(function(){ p.name = name; });
    });
  }

  // ---------- edición del título ----------
  function startEdit(id){
    var c = els[id], span = c && c.querySelector(".title");
    if(!span) return;
    var p = cur(), t = byId(p, id);
    editing = id;
    span.contentEditable = "true";
    span.focus();
    var r = document.createRange(); r.selectNodeContents(span);
    try { var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch(e){}
    var done = false;
    function finish(ok){
      if(done) return; done = true;
      editing = null;
      var v = span.textContent.replace(/\s+/g, " ").trim();
      span.contentEditable = "false";
      if(ok && v && v !== t.title) change(function(){ t.title = v; });
      else { renderCards(); renderWires(); }
    }
    span.addEventListener("keydown", function(e){
      e.stopPropagation();
      if(e.key === "Enter"){ e.preventDefault(); finish(true); }
      else if(e.key === "Escape"){ e.preventDefault(); finish(false); }
    });
    span.addEventListener("blur", function(){ finish(true); });
  }

  // ---------- notas del nodo en el panel lateral ----------
  // En la compu, con el panel abierto, tocar un nodo muestra sus notas ahí (leer, tildar, escribir).
  // En el celular o con el panel plegado, las notas se abren en la ventana de siempre.
  var PN = window.PlanesNotes, panelId = null, panelEdit = false;
  function sideNotesOn(){ return !!PN && !isMobile() && !state.sideCollapsed; }
  function showPanel(id, edit){
    commitPanel();
    panelId = id; panelEdit = !!edit;
    renderPanel();
    if(panelEdit) focusPanel();
  }
  function focusPanel(){ setTimeout(function(){ var ta = $("pnText"); ta.focus(); var n = ta.value.length; ta.setSelectionRange(n, n); }, 20); }
  function commitPanel(){
    if(!panelId || !panelEdit) return;
    var t = byId(cur(), panelId); if(!t) return;
    var v = $("pnText").value.replace(/\s+$/, "");
    if(v !== (t.notes || "")) change(function(){ if(v){ t.notes = v; t.notesAt = Date.now(); } else { delete t.notes; delete t.notesAt; } });
  }
  function renderPanel(){
    var box = $("pnotes"); if(!box) return;
    var on = sideNotesOn();
    box.hidden = !on;
    if(!on) return;
    var p = cur(), t = p && panelId && byId(p, panelId);
    if(!t){
      panelId = null; panelEdit = false;
      $("pnTitle").textContent = "Notas"; $("pnMode").hidden = true; $("pnMeta").textContent = "";
      $("pnEdit").hidden = true; $("pnView").hidden = false;
      $("pnView").innerHTML = '<p class="nt-nobody">Tocá un nodo para ver y escribir sus notas acá.</p>';
      return;
    }
    $("pnTitle").textContent = t.title; $("pnTitle").title = t.title;
    var tk = PN.tasks(t.notes);
    $("pnMeta").textContent = [t.notesAt ? "editada " + PN.when(t.notesAt) : "", tk.total ? tk.done + " de " + tk.total + " tareas" : ""].filter(Boolean).join(" · ");
    $("pnMode").hidden = false;
    $("pnMode").textContent = panelEdit ? "👁 ver" : "✎ editar";
    $("pnView").hidden = panelEdit; $("pnEdit").hidden = !panelEdit;
    if(panelEdit){ if(root.activeElement !== $("pnText")) $("pnText").value = t.notes || ""; }
    else $("pnView").innerHTML = t.notes && t.notes.trim() ? PN.format(t.notes, true) : '<p class="nt-nobody">Sin notas. Tocá acá para escribir.</p>';
  }
  if(PN){
    PN.tools($("pnTools"), $("pnText"));
    PN.continueLists($("pnText"));
  }
  $("pnText").addEventListener("blur", commitPanel);
  $("pnText").addEventListener("keydown", function(e){ if(e.key === "Escape"){ e.preventDefault(); $("pnText").blur(); } });
  $("pnMode").addEventListener("click", function(){
    if(panelEdit){ commitPanel(); panelEdit = false; renderPanel(); }
    else { panelEdit = true; renderPanel(); focusPanel(); }
  });
  $("pnView").addEventListener("click", function(e){
    var t = panelId && byId(cur(), panelId); if(!t) return;
    var b = e.target.closest("[data-ln]");
    if(b){ change(function(){ t.notes = PN.toggle(t.notes, +b.dataset.ln); t.notesAt = Date.now(); }); return; }
    if(!e.target.closest("a") && !getSelection().toString()){ panelEdit = true; renderPanel(); focusPanel(); }
  });

  // ---------- acciones ----------
  function select(s){
    sel = s;
    multi = [];
    Object.keys(els).forEach(function(k){ els[k].classList.toggle("selected", isSelNode(k)); });
    Object.keys(sEls).forEach(function(k){ sEls[k].classList.toggle("selected", !!(sel && sel.sticky === k)); });
    renderWires();
    renderBars();
  }
  function newChild(id){
    var p = cur(), parent = byId(p, id); if(!parent) return;
    var t;
    change(function(){
      var ys = dependents(p, id).map(function(k){ return byId(p, k).y; });
      var y = ys.length ? Math.max.apply(null, ys) + H + GY : parent.y;
      t = makeNode(p, parent.x + W + GX, y);
      p.deps.push(lineFor({ from: id, to: t.id }));
      sel = { node: t.id };
    });
    if(t){ ensureVisible(t); startEdit(t.id); }
  }
  // Selección de varios nodos: con uno solo se comporta como la selección normal.
  function setMulti(ids){
    if(ids.length === 1){ select({ node: ids[0] }); return; }
    sel = null;
    multi = ids;
    Object.keys(els).forEach(function(k){ els[k].classList.toggle("selected", isSelNode(k)); });
    Object.keys(sEls).forEach(function(k){ sEls[k].classList.remove("selected"); });
    renderWires();
    renderBars();
  }
  function multiDelete(){
    var ids = multi.slice();
    change(function(p){
      p.nodes = p.nodes.filter(function(t){ return ids.indexOf(t.id) < 0; });
      p.deps = p.deps.filter(function(d){ return ids.indexOf(d.from) < 0 && ids.indexOf(d.to) < 0; });
      dropFromRoute(p, ids);
      multi = []; sel = null;
    });
    toast(ids.length + " cards borradas · Ctrl+Z para deshacer");
  }
  function moveDragIds(base, id, ids){
    var p = cur();
    return Object.assign(base, { kind: "move", id: id, items: ids.map(function(k){ return byId(p, k); }).filter(Boolean).map(function(t){ return { t: t, x: t.x, y: t.y }; }) });
  }
  function boxHits(d, cx, cy){
    var v = view(), p = cur();
    var x1 = Math.min(d.ox, cx), x2 = Math.max(d.ox, cx), y1 = Math.min(d.oy, cy), y2 = Math.max(d.oy, cy);
    return p.nodes.filter(function(t){
      var tx = t.x * v.z + v.x, ty = t.y * v.z + v.y, tw = W * v.z, th = cardH(t.id) * v.z;
      return tx < x2 && tx + tw > x1 && ty < y2 && ty + th > y1;
    }).map(function(t){ return t.id; });
  }

  function deleteSelected(){
    if(multi.length > 1){ multiDelete(); return; }
    if(!sel) return;
    if(sel.node){
      var id = sel.node;
      change(function(p){
        p.nodes = p.nodes.filter(function(t){ return t.id !== id; });
        p.deps = p.deps.filter(function(d){ return d.from !== id && d.to !== id; });
        dropFromRoute(p, [id]);
        sel = null;
      });
    } else if(sel.dep){
      var d = sel.dep, obj = selLine(cur());
      change(function(p){ if(d.route) removeRoute(p, d.from, d.to); else p.deps = p.deps.filter(function(x){ return x !== obj; }); sel = null; });
      toast(d.route ? "Flecha de ruta borrada" : "Línea borrada");
    } else if(sel.sticky){
      var sid = sel.sticky;
      change(function(p){ p.stickies = p.stickies.filter(function(s){ return s.id !== sid; }); sel = null; });
    }
  }
  function ensureVisible(t){
    var r = canvas.getBoundingClientRect(), v = view();
    var sx = t.x * v.z + v.x, sy = t.y * v.z + v.y, m = 40;
    if(sx < m) v.x += m - sx;
    if(sx + W * v.z > r.width - m) v.x -= sx + W * v.z - (r.width - m);
    if(sy < m + 50) v.y += m + 50 - sy;
    if(sy + H * v.z > r.height - 80) v.y -= sy + H * v.z - (r.height - 80);
    applyView();
  }
  var toastTimer;
  function toast(msg){
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.classList.remove("show"); }, 2600);
  }

  // ---------- puntero: mover, conectar, pan, pinch ----------
  var lastTap = null;   // doble toque en el celular (dblclick no siempre llega)
  function isDoubleTap(e, id){
    var now = Date.now();
    if(e.pointerType !== "mouse" && lastTap && lastTap.id === id && now - lastTap.t < 350){ lastTap = null; return true; }
    lastTap = { id: id, t: now };
    return false;
  }
  // Click derecho (o rueda apretada) y arrastrar = mover el lienzo, sin menú contextual.
  canvas.addEventListener("contextmenu", function(e){ if(!e.target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) e.preventDefault(); });
  canvas.addEventListener("pointerdown", function(e){
    var mouse = e.pointerType === "mouse";
    if(mouse && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    var p = cur(); if(!p) return;
    if(mouse && e.button !== 0){
      if(e.target.closest(".toolbar") || e.target.closest(".palette")) return;
      e.preventDefault();
      var v0 = view();
      drag = { sx: e.clientX, sy: e.clientY, moved: false, kind: "pan", vx: v0.x, vy: v0.y };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if(editing){
      if(e.target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
      if(root.activeElement) root.activeElement.blur();
    }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if(ids.length === 2){
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag = null; tempWire = null; renderWires();
      return;
    }
    var t = e.target;
    if(t.closest("[data-act]") || t.closest('[data-sact="del"]') || t.closest(".toolbar") || t.closest(".palette")) return;
    if(!$("palette").hidden) $("palette").hidden = true;
    var card = t.closest(".card"), port = t.closest(".port"), wire = t.closest(".wire"), stk = t.closest(".sticky");
    if(!card || card.dataset.id !== (menu && menu.id) || port) closeMenu();
    var base = { sx: e.clientX, sy: e.clientY, moved: false, before: snapshot() };
    if(stk){
      var s = stickyById(p, stk.dataset.sid); if(!s) return;
      if(t.closest('[data-sact="resize"]')) drag = Object.assign(base, { kind: "resize", s: s, w: s.w, h: s.h });
      else drag = Object.assign(base, { kind: "smove", s: s, x: s.x, y: s.y });
      if(!(sel && sel.sticky === s.id)) select({ sticky: s.id });
    } else if(port && card){
      drag = Object.assign(base, { kind: "wire", from: card.dataset.id, fs: port.dataset.port, route: routeMode() });
    } else if(card && (e.ctrlKey || e.metaKey)){
      // Ctrl/⌘ + click: sumar o sacar de la selección múltiple.
      var cid = card.dataset.id, cur0 = multi.length ? multi.slice() : (sel && sel.node ? [sel.node] : []);
      var i = cur0.indexOf(cid);
      if(i >= 0) cur0.splice(i, 1); else cur0.push(cid);
      closeMenu();
      if(cur0.length) setMulti(cur0); else select(null);
      return;
    } else if(card && multi.length > 1 && multi.indexOf(card.dataset.id) >= 0){
      drag = moveDragIds(base, card.dataset.id, multi);
    } else if(card){
      drag = moveDrag(base, card.dataset.id, e.shiftKey);
      if(!isSelNode(card.dataset.id) || multi.length) select({ node: card.dataset.id });
    } else if(wire){
      closeMenu();
      select({ dep: { from: wire.dataset.from, to: wire.dataset.to, route: wire.dataset.route === "1", i: +wire.dataset.i } });
      return;
    } else if(mouse){
      // Mantener click y arrastrar sobre el fondo = recuadro de selección.
      var r0 = canvas.getBoundingClientRect();
      drag = Object.assign(base, { kind: "box", ox: e.clientX - r0.left, oy: e.clientY - r0.top, add: e.ctrlKey || e.metaKey || e.shiftKey });
    } else {
      var v = view();
      drag = Object.assign(base, { kind: "pan", vx: v.x, vy: v.y });
    }
    canvas.setPointerCapture(e.pointerId);
  });
  function moveDrag(base, id, subtree){
    var p = cur();
    var ids = subtree ? descendants(p, id) : [id];
    return Object.assign(base, { kind: "move", id: id, items: ids.map(function(k){ var t = byId(p, k); return { t: t, x: t.x, y: t.y }; }) });
  }
  canvas.addEventListener("pointermove", function(e){
    if(pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if(pinch){
      var ids = Object.keys(pointers);
      if(ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if(pinch.d) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
      return;
    }
    if(!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if(!drag.moved){
      if(Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      if(drag.kind === "pan") canvas.classList.add("panning");
      if(drag.kind === "move"){ closeMenu(); drag.items.forEach(function(it){ var c = els[it.t.id]; if(c) c.classList.add("dragging"); }); }
      if(drag.kind === "smove" && sEls[drag.s.id]) sEls[drag.s.id].classList.add("dragging");
    }
    var v = view();
    if(drag.kind === "box"){
      var r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, bx = $("selBox");
      bx.hidden = false;
      bx.style.left = Math.min(drag.ox, cx) + "px"; bx.style.top = Math.min(drag.oy, cy) + "px";
      bx.style.width = Math.abs(cx - drag.ox) + "px"; bx.style.height = Math.abs(cy - drag.oy) + "px";
      var hits = boxHits(drag, cx, cy);
      if(drag.add && !drag.prev) drag.prev = multi.length ? multi.slice() : (sel && sel.node ? [sel.node] : []);
      var prev = drag.prev || [];
      Object.keys(els).forEach(function(k){ els[k].classList.toggle("selected", hits.indexOf(k) >= 0 || prev.indexOf(k) >= 0); });
      return;
    }
    if(drag.kind === "pan"){ v.x = drag.vx + dx; v.y = drag.vy + dy; applyView(); }
    else if(drag.kind === "move"){
      drag.items.forEach(function(it){
        it.t.x = snap(it.x + dx / v.z); it.t.y = snap(it.y + dy / v.z);
        var c = els[it.t.id]; if(c){ c.style.left = it.t.x + "px"; c.style.top = it.t.y + "px"; }
      });
      renderWires();
    } else if(drag.kind === "smove" || drag.kind === "resize"){
      var s = drag.s, el = sEls[s.id];
      if(drag.kind === "smove"){ s.x = snap(drag.x + dx / v.z); s.y = snap(drag.y + dy / v.z); if(el){ el.style.left = s.x + "px"; el.style.top = s.y + "px"; } }
      else { s.w = Math.max(90, Math.round(drag.w + dx / v.z)); s.h = Math.max(60, Math.round(drag.h + dy / v.z)); if(el){ el.style.width = s.w + "px"; el.style.height = s.h + "px"; } }
    } else if(drag.kind === "wire"){
      var a2 = byId(cur(), drag.from), w = toWorld(e.clientX, e.clientY), ts = null;
      var target = dropTarget(e, drag.from);
      if(target){ var tt = byId(cur(), target); ts = dropSide(e, tt, w); w = anchor(tt, ts); }
      var ld = state.lineDefault || {};
      tempWire = linePath(anchor(a2, drag.fs), drag.fs, w, ts, ld.shape);
      Object.keys(els).forEach(function(k){ els[k].classList.toggle("drop", k === target); });
      renderWires();
    }
  });
  // Lado por el que llega: el punto que está debajo del dedo, o el lado más cercano.
  function dropSide(e, t, w){
    var el = root.elementFromPoint(e.clientX, e.clientY), port = el && el.closest(".port");
    return port && SIDES[port.dataset.port] ? port.dataset.port : sideAt(t, w);
  }
  function dropTarget(e, from){
    var el = root.elementFromPoint(e.clientX, e.clientY);
    var c = el && el.closest(".card");
    return c && c.dataset.id !== from ? c.dataset.id : null;
  }
  function endPointer(e){
    delete pointers[e.pointerId];
    if(pinch){ if(Object.keys(pointers).length < 2){ pinch = null; save(); } return; }
    if(!drag) return;
    var d = drag, p = cur();
    drag = null;
    canvas.classList.remove("panning");
    if(e.type === "pointercancel"){ tempWire = null; renderAll(); return; }
    if(d.kind === "box"){
      $("selBox").hidden = true;
      if(!d.moved){ closeMenu(); if(sel || multi.length) select(null); return; }
      var r = canvas.getBoundingClientRect(), hit = boxHits(d, e.clientX - r.left, e.clientY - r.top);
      if(d.add) (d.prev || []).forEach(function(id){ if(hit.indexOf(id) < 0) hit.push(id); });
      closeMenu();
      if(hit.length) setMulti(hit); else select(null);
    } else if(d.kind === "pan"){
      if(d.moved) save();
      else if(sel || multi.length) select(null);
    } else if(d.kind === "smove" || d.kind === "resize"){
      if(d.moved){ pushHist(d.before); p.updated = Date.now(); save(); renderAll(); }
      else if(d.kind === "smove" && isDoubleTap(e, d.s.id)) editSticky(d.s.id);
    } else if(d.kind === "move"){
      if(d.moved){ pushHist(d.before); p.updated = Date.now(); save(); renderAll(); }
      else tapCard(e, d.id);
    } else if(d.kind === "wire"){
      tempWire = null;
      var target = d.moved ? dropTarget(e, d.from) : null;
      if(target){
        var tt = byId(p, target), ts = dropSide(e, tt, toWorld(e.clientX, e.clientY));
        change(function(){
          if(d.route){
            if(!addRoute(p, d.from, target, { fs: d.fs, ts: ts })) return false;
            showLayer("ruta");
            return;
          }
          var nd = addDep(p, d.from, target); if(!nd) return false;
          nd.fs = d.fs; nd.ts = ts;
          showLayer(depLayer(nd));
        });
        renderAll();
      } else if(d.moved){
        // a un lugar vacío: nueva card hacia ese lado, la línea llega por el lado de enfrente
        var w = toWorld(e.clientX, e.clientY), t;
        var x = d.fs === "l" ? w.x - W : d.fs === "r" ? w.x : w.x - W / 2;
        var y = d.fs === "t" ? w.y - H : d.fs === "b" ? w.y : w.y - H / 2;
        change(function(){
          t = makeNode(p, x, y);
          if(d.route){ addRoute(p, d.from, t.id, { fs: d.fs, ts: OPP[d.fs] }); showLayer("ruta"); }
          else { var nd2 = lineFor({ from: d.from, to: t.id, fs: d.fs, ts: OPP[d.fs] }); p.deps.push(nd2); showLayer(depLayer(nd2)); }
          sel = { node: t.id };
        });
        startEdit(t.id);
      } else { renderAll(); tapCard(e, d.from); }   // tocar un punto sin arrastrar = tocar la card
    }
  }
  // Toque en una card = abrir / cerrar su menú · doble toque (celular) = renombrar.
  function tapCard(e, id){
    if(isDoubleTap(e, id)){ closeMenu(); startEdit(id); }
    else if(menu && menu.id === id) closeMenu(); else openMenu(id);
    if(sideNotesOn() && panelId !== id) showPanel(id, false);
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("click", function(e){
    var sb = e.target.closest('[data-sact="del"]');
    if(sb){ select({ sticky: sb.closest(".sticky").dataset.sid }); deleteSelected(); return; }
    var b = e.target.closest("[data-act]"); if(!b) return;
    var card = b.closest(".card"); if(!card) return;
    var id = card.dataset.id, act = b.dataset.act;
    if(act === "edit"){ select({ node: id }); startEdit(id); }
    else if(act === "child") newChild(id);
    else if(act === "level") cycleLevel(id);
    else if(act === "notes"){
      closeMenu();
      if(sideNotesOn()){ var nt = byId(cur(), id); showPanel(id, !(nt && nt.notes && nt.notes.trim())); }
      else openNotes(id);
    }
    else if(act === "del"){
      var p = cur(), t = byId(p, id), k = dependents(p, id).length;
      sel = { node: id };
      if(k) ask({ title: "¿Borrar «" + t.title + "»? Sus " + k + " parte(s) quedan sueltas.", ok: "borrar", danger: true }, deleteSelected);
      else deleteSelected();
    }
  });
  canvas.addEventListener("dblclick", function(e){
    var p = cur(); if(!p) return;
    var el = root.elementFromPoint(e.clientX, e.clientY) || e.target;
    if(el.closest("[data-act]") || el.closest("[data-sact]") || el.closest(".toolbar") || el.closest(".palette") || el.closest(".port")) return;
    var stk = el.closest(".sticky");
    if(stk){ editSticky(stk.dataset.sid); return; }
    var card = el.closest(".card");
    if(card){ closeMenu(); startEdit(card.dataset.id); return; }
    if(el.closest(".wire")) return;
    var w = toWorld(e.clientX, e.clientY), t;
    change(function(){ t = makeNode(p, w.x - W / 2, w.y - H / 2); sel = { node: t.id }; });
    startEdit(t.id);
  });
  canvas.addEventListener("wheel", function(e){
    e.preventDefault();
    if(!cur()) return;
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  // ---------- teclado ----------
  document.addEventListener("keydown", function(e){
    if(!api.visible() || focoOn || rutaOn || (window.PlanesNotes && window.PlanesNotes.isOpen())) return;
    var tg = root.activeElement || e.target;
    if(!$("ask").hidden || !$("helpDlg").hidden || !$("notesDlg").hidden) return;
    if(editing || tg.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName)) return;
    var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if(mod && k === "z" && !e.shiftKey){ e.preventDefault(); undo(); }
    else if(mod && (k === "y" || (k === "z" && e.shiftKey))){ e.preventDefault(); redo(); }
    else if(mod) return;
    else if(k === "delete" || k === "backspace"){ e.preventDefault(); deleteSelected(); }
    else if((k === "enter" || k === "f2") && sel && sel.node){ e.preventDefault(); startEdit(sel.node); }
    else if((k === "enter" || k === "f2") && sel && sel.sticky){ e.preventDefault(); editSticky(sel.sticky); }
    else if(k === "tab" && sel && sel.node){ e.preventDefault(); newChild(sel.node); }
    else if(k === "escape"){ closeMenu(); $("palette").hidden = true; select(null); }
  });

  // ---------- ventana propia (reemplaza prompt/confirm, que muchos celulares bloquean) ----------
  function ask(o, onOk){
    var box = $("ask"), input = $("askInput"), area = $("askArea");
    $("askTitle").textContent = o.title;
    $("askText").hidden = !o.text; $("askText").textContent = o.text || "";
    input.hidden = o.input === undefined;
    input.value = o.input || "";
    input.placeholder = o.placeholder || "";
    area.hidden = o.area === undefined; area.value = o.area || "";
    $("askBox").classList.toggle("wide", o.area !== undefined);
    $("askOk").textContent = o.ok || "aceptar";
    $("askOk").classList.toggle("danger", !!o.danger);
    $("askCancel").textContent = o.cancel || "cancelar";
    box.hidden = false;
    setTimeout(function(){ if(input.hidden) $("askOk").focus(); else { input.focus(); input.select(); } }, 30);
    function close(){ box.hidden = true; $("askOk").onclick = $("askCancel").onclick = box.onclick = box.onkeydown = null; }
    function accept(){
      var v = input.value.replace(/\s+/g, " ").trim();
      if(!input.hidden && !v && !o.allowEmpty){ input.focus(); return; }
      close();
      onOk(v);
    }
    $("askOk").onclick = accept;
    $("askCancel").onclick = close;
    box.onclick = function(e){ if(e.target === box) close(); };
    box.onkeydown = function(e){
      if(e.key === "Escape"){ e.preventDefault(); close(); }
      else if(e.key === "Enter" && e.target === input){ e.preventDefault(); accept(); }
    };
  }

  // ---------- exportar / importar ----------
  function exportJSON(){
    closeSideMobile();
    var json = JSON.stringify({ app: "aprender", version: 3, skills: state.skills }, null, 2);
    // Se puede descargar salvo dentro de un marco de otro sitio (ej. una vista previa); dentro de Planes sí.
    var canDownload = true;
    try { if(window.self !== window.top) canDownload = !!window.top.location.href; } catch(e){ canDownload = false; }
    if(canDownload){
      var url = URL.createObjectURL(new Blob([json], { type: "application/json" })), a = document.createElement("a");
      a.href = url; a.download = "aprender-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      toast("JSON exportado");
      return;
    }
    // Dentro de otra página (vista previa) no se puede descargar: se muestra el texto para copiar.
    ask({ title: "Exportar", text: "Copiá este texto y guardalo en un archivo .json.", area: json, ok: "copiar", cancel: "cerrar" }, function(){
      if(navigator.clipboard) navigator.clipboard.writeText(json).then(function(){ toast("Copiado"); }, function(){ toast("Seleccioná el texto y copialo a mano"); });
      else toast("Seleccioná el texto y copialo a mano");
    });
  }
  $("fileIn").addEventListener("change", function(e){
    var f = e.target.files[0]; e.target.value = "";
    if(!f) return;
    f.text().then(function(txt){
      var data;
      try { data = JSON.parse(txt); if(!data || !Array.isArray(data.skills)) throw 0; }
      catch(err){ toast("Ese archivo no es un JSON de Aprender"); return; }
      var ok = data.skills.filter(function(s){ return s && Array.isArray(s.nodes); }).map(normSkill);
      if(!ok.length){ toast("El archivo no trae habilidades"); return; }
      ask({ title: "Importar " + ok.length + " habilidad" + (ok.length > 1 ? "es" : ""),
            text: "Se suman a las que tenés. Si alguna ya existe, se reemplaza por la del archivo.", ok: "importar" }, function(){
        change(function(){
          var ids = {}; ok.forEach(function(s){ ids[s.id] = 1; });
          state.skills = state.skills.filter(function(s){ return !ids[s.id]; }).concat(ok);
          state.current = ok[0].id;
          sel = null;
        });
        fit();
        toast("Importada" + (ok.length > 1 ? "s " + ok.length + " habilidades" : ": " + ok[0].name));
      });
    });
  });

  // ---------- botones ----------
  $("newSkill").addEventListener("click", newSkill);
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  $("exportBtn").addEventListener("click", exportJSON);
  $("importBtn").addEventListener("click", function(){ closeSideMobile(); $("fileIn").click(); });
  $("fit").addEventListener("click", fit);
  $("wireDel").addEventListener("click", deleteSelected);
  $("routeBtn").addEventListener("click", function(){
    state.lineDefault = state.lineDefault || {};
    var on = !routeMode();
    state.lineDefault.style = on ? "ruta" : "continua";
    if(on){ showLayer("ruta"); toast("Ruta: arrastrá el ● de cada card a la que sigue"); }
    save(); renderBars();
  });
  $("wireCancel").addEventListener("click", function(){ select(null); });
  Array.prototype.forEach.call(root.querySelectorAll("[data-help]"), function(b){
    b.addEventListener("click", function(){ closeSideMobile(); $("helpDlg").hidden = false; });
  });
  $("helpClose").addEventListener("click", function(){ $("helpDlg").hidden = true; });
  $("helpDlg").addEventListener("click", function(e){ if(e.target === e.currentTarget) e.currentTarget.hidden = true; });

  function isMobile(){ return matchMedia("(max-width: 800px)").matches; }
  function closeSideMobile(){ $("side").classList.remove("open"); }
  // En el celular ☰ abre el panel en pantalla completa; en la compu lo pliega o despliega.
  function applySide(){ $("layoutEl").classList.toggle("side-collapsed", !!state.sideCollapsed); if(typeof renderPanel === "function") renderPanel(); }
  $("openSide").addEventListener("click", function(){
    if(isMobile()){ $("side").classList.add("open"); return; }
    state.sideCollapsed = !state.sideCollapsed;
    applySide(); save();
  });
  $("closeSide").addEventListener("click", closeSideMobile);

  applySide();

  function show(){
    renderAll();
    var first = cur();
    if(first && !first.fitted){ first.fitted = true; fit(); }
  }
  // Planes trajo otra versión de los datos (otro dispositivo, otra cuenta): empezar de nuevo con esa.
  function reload(){
    state = api.state();
    hist = []; fut = []; sel = null; menu = null; drag = null; tempWire = null; panelId = null; panelEdit = false;
    applySide();
    if(api.visible()) show();
  }
  function busy(){ return !!(editing || drag || notesId !== null || (window.PlanesNotes && window.PlanesNotes.isOpen()) || !$("ask").hidden); }
  return { show: show, reload: reload, busy: busy };
}
})();
