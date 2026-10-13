// Aprender: vista de Planes para organizar habilidades en diagramas (cards concepto / acción,
// niveles bronce → diamante con criterio, objetivo, requisitos que bloquean y notas adhesivas).
// Se dibuja dentro de un shadow root para que sus estilos e ids no choquen con los de Planes.
// Los datos viven en el estado de Planes (state.aprender) y se guardan/sincronizan con él.
(function(){
"use strict";

// ---------- datos ----------
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function newSkillObj(name){ return { id: uid(), name: name, updated: Date.now(), nodes: [], deps: [], reqs: [], stickies: [], view: { x: 60, y: 120, z: 1 } }; }
// Completa lo que falte (datos guardados con versiones anteriores o importados).
function normSkill(s){
  s.id = s.id || uid(); s.name = s.name || "Sin nombre"; s.updated = s.updated || Date.now();
  s.nodes = Array.isArray(s.nodes) ? s.nodes : [];
  s.deps = Array.isArray(s.deps) ? s.deps : [];
  s.reqs = Array.isArray(s.reqs) ? s.reqs : [];
  s.stickies = Array.isArray(s.stickies) ? s.stickies : [];
  s.view = s.view || { x: 60, y: 120, z: 1 };
  return s;
}

function demo(){
  // list: [clave, título, x, y, tipo, nivel] · extra: notes / hearts {clave: texto}, reqs [[requerida, requiere]], stickies
  function sk(name, list, links, extra){
    var s = newSkillObj(name), by = {};
    extra = extra || {};
    list.forEach(function(x){
      var n = { id: uid(), title: x[1], x: x[2], y: x[3] };
      if(x[4]) n.type = x[4]; if(x[5]) n.level = x[5];
      if(extra.notes && extra.notes[x[0]]) n.notes = extra.notes[x[0]];
      if(extra.hearts && extra.hearts[x[0]]) n.heart = extra.hearts[x[0]];
      s.nodes.push(n); by[x[0]] = n;
    });
    links.forEach(function(l){ s.deps.push({ from: by[l[0]].id, to: by[l[1]].id }); });
    (extra.reqs || []).forEach(function(r){ s.reqs.push({ from: by[r[0]].id, to: by[r[1]].id }); });
    (extra.stickies || []).forEach(function(n){ s.stickies.push(Object.assign({ id: uid() }, n)); });
    return s;
  }
  var latte = sk("Latte art", [
    ["la", "Latte art: corazón simétrico", 0, 140],
    ["le", "Leche", 290, 40], ["ve", "Vertido", 290, 260],
    ["te", "Textura (microespuma)", 580, 0, "accion", "plata"], ["tp", "Temperatura 55–65 °C", 580, 100, "concepto", "oro"],
    ["al", "Altura y velocidad", 580, 260, "accion", "bronce"], ["co", "Corte final", 580, 380, "accion"]
  ], [["la","le"],["la","ve"],["le","te"],["le","tp"],["ve","al"],["ve","co"]], {
    notes: { tp: "Arriba de 65 °C la leche pierde dulzor y la espuma se rompe.\nTermómetro de clip en la jarra hasta que salga de memoria." },
    hearts: { la: "corazón simétrico 8 de 10", tp: "digo la temperatura tocando la jarra, ±5 °C", te: "superficie brillante sin burbujas, 8 de 10" },
    reqs: [["al", "co"]],
    stickies: [{ color: "rosa", text: "cuello: el chorro se corta", x: 840, y: 250, w: 170, h: 90 }]
  });
  var dec = sk("Decidir con registro", [
    ["d", "Decidir con registro", 0, 60],
    ["de", "Detectar decisiones importantes", 290, 0, "accion", "bronce"], ["fo", "Formato de la predicción", 290, 110, "concepto", "diamante"],
    ["re", "Revisión mensual", 580, 50, "accion"]
  ], [["d","de"],["d","fo"],["de","re"],["fo","re"]], {
    hearts: { d: "predicción escrita en 9 de cada 10 decisiones importantes", fo: "resultado esperado + % de confianza, 10 de 10" }
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
  --concepto: #c297ff; --accion: #f0883e;
  --bronce: #c98a5a; --plata: #c3ccd6; --oro: #e8c547; --diamante: #7fd8f5;
  --heart: #ef8fb0; --req: #ef8fb0;
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
.side-head { display: flex; align-items: center; gap: 8px; }
.brand { font-weight: 700; font-size: 14px; flex: 1; letter-spacing: .02em; }
.row2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
.row2 .btn { width: 100%; overflow: hidden; text-overflow: ellipsis; }
.btn { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; padding: 7px 10px; cursor: pointer; text-align: center; white-space: nowrap; }
.btn:hover { border-color: var(--line-2); background: #1b222c; }
.btn:disabled { opacity: .4; cursor: default; }
.btn.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
.btn.primary.danger { background: #b62324; border-color: #b62324; }
.btn.sq { width: 34px; padding: 7px 0; }
.icon-btn { background: var(--panel-2); border: 1px solid var(--line); border-radius: 6px; width: 32px; height: 32px; cursor: pointer; font-size: 16px; flex: none; }
.sec { color: var(--muted); font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-top: 4px; }

.skills { display: flex; flex-direction: column; gap: 4px; min-height: 80px; flex: 1; overflow-y: auto; }
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
.cur-name { background: rgba(16,21,28,.92); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.topbar .help-btn { margin-left: auto; font-weight: 700; font-size: 14px; }

.wire .line { fill: none; stroke: #3a4452; stroke-width: 1.6; }
.wire .hit { fill: none; stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: pointer; }
.wire:hover .line { stroke: #6b7788; }
.wire.selected .line { stroke: var(--accent); stroke-width: 2.4; }
/* requisito: flecha punteada, distinta de la conexión "es parte de" */
.wire.req .line { stroke: var(--req); stroke-dasharray: 6 5; opacity: .8; }
.wire.req:hover .line { opacity: 1; }
.wire.req.selected .line { stroke: var(--accent); opacity: 1; }
.temp { fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-dasharray: 5 4; }

.card { position: absolute; width: var(--card-w); min-height: var(--card-h); background: var(--card); border: 1px solid var(--line);
  border-left: 3px solid var(--teal); border-radius: 6px; padding: 8px 12px 6px 12px; cursor: default; user-select: none; -webkit-user-select: none; }
.card:hover { border-color: var(--line-2); border-left-color: var(--teal); }
.card.root { border-left-color: var(--accent); background: #131c27; }
.card.selected { border-color: var(--accent) !important; box-shadow: 0 0 0 2px rgba(88,166,255,.45) !important; opacity: 1; }
.card.drop, .card.pickable:hover { border-color: var(--accent) !important; box-shadow: 0 0 0 2px var(--accent) !important; }
.card.dragging { cursor: grabbing; z-index: 5; }
.card.blocked { opacity: .5; }
.card.blocked .st { cursor: not-allowed; }
.title { display: block; font-weight: 600; font-size: 12px; line-height: 1.4; min-width: 0; outline: none; overflow-wrap: anywhere; }
.title[contenteditable="true"] { background: var(--input); border-radius: 3px; padding: 0 3px; margin: 0 -3px; box-shadow: 0 0 0 1px var(--accent); cursor: text; user-select: text; -webkit-user-select: text; }
.card .heart { margin: 3px 0 0 24px; font-size: 10.5px; line-height: 1.35; color: var(--heart); overflow-wrap: anywhere; }
.meta { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 5px; font-size: 10.5px; color: var(--muted); height: 16px; }
.meta .kids, .meta .lock { margin-right: auto; color: var(--faint); }
.meta .lock { color: var(--muted); }
.meta .lock + .kids { margin-right: 0; }
.tools { display: flex; gap: 2px; opacity: 0; transition: opacity .1s; }
.card:hover .tools, .card.selected .tools { opacity: 1; }
.tools button { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0 3px; font-size: 12px; }
.tools button:hover { color: var(--text); }
.tools button[data-act="del"]:hover { color: var(--danger); }
.port { position: absolute; top: 50%; width: 11px; height: 11px; margin-top: -5.5px; border-radius: 50%; background: var(--bg); border: 1.5px solid #4b5563; cursor: crosshair; }
.port::after { content: ""; position: absolute; inset: -9px; border-radius: 50%; }
.port.out { right: -6.5px; }
.port.in { left: -8px; }
.port:hover { border-color: var(--accent); background: var(--accent); }

/* tipos */
.card.t-concepto, .card.t-concepto:hover { border-left-color: var(--concepto); border-radius: 22px; padding-left: 16px; padding-right: 16px;
  background: color-mix(in srgb, var(--concepto) 11%, var(--card)); border-color: color-mix(in srgb, var(--concepto) 28%, var(--line)); }
.card.t-accion, .card.t-accion:hover { border-left-color: var(--accion);
  background: color-mix(in srgb, var(--accion) 10%, var(--card)); border-color: color-mix(in srgb, var(--accion) 26%, var(--line)); }
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
/* objetivo y requiere, al lado del puntito de notas: aparecen al pasar o con la card elegida */
.mt { display: inline-flex; align-items: center; background: none; border: 0; padding: 0 2px; cursor: pointer; font-size: 12px; line-height: 1; color: var(--muted); opacity: 0; transition: opacity .1s; }
.card:hover .mt, .card.selected .mt { opacity: 1; }
.mt svg { display: block; }
.mt.goal.has, .mt.goal:hover { color: var(--heart); }
.mt.req:hover { color: var(--req); }
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

/* menú del nodo: botones en diagonal debajo de la card */
.nmenu { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 4; }
.nm-item { position: absolute; display: flex; align-items: center; gap: 8px; white-space: nowrap;
  background: #1a222d; border: 1px solid var(--line-2); border-radius: 999px; padding: 7px 14px 7px 10px; cursor: pointer;
  box-shadow: 0 6px 18px rgba(0,0,0,.45); font-weight: 600; transform-origin: left center;
  animation: nm-in .16s ease-out both; animation-delay: calc(var(--i) * 40ms); }
.nm-item:hover { border-color: var(--accent); }
.nm-item .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c, var(--faint)); flex: none; }
.nm-item.on { border-color: var(--c, var(--accent)); background: color-mix(in srgb, var(--c, var(--accent)) 16%, #1a222d); }
.nm-item.tool .dot { background: none; border: 1.5px solid var(--c, var(--faint)); }
@keyframes nm-in { from { opacity: 0; translate: -8px -8px; } to { opacity: 1; translate: 0 0; } }
@media (prefers-reduced-motion: reduce) { .nm-item { animation: none; } }

.empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--faint); pointer-events: none; text-align: center; padding: 16px; line-height: 1.7; }
.toolbar { position: absolute; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 3; align-items: center; }
.toolbar .btn { background: #141a22; }
.toolbar .btn.primary { background: #b62324; }
.toolbar.pick { background: #141a22; border: 1px solid var(--accent); border-radius: 8px; padding: 6px 6px 6px 12px; max-width: calc(100% - 20px); }
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
  .tools, .mt { opacity: 1; }
  .skill .x { opacity: 1; font-size: 15px; padding: 4px 6px; }
  .skill { padding: 11px 10px; }
  .btn { padding: 10px 12px; }
  .btn.sq { width: 42px; }
  .toolbar .lbl { display: none; }
  .icon-btn { width: 40px; height: 40px; }
  .cur-name { padding: 10px 12px; }
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
      <span class="brand">🎯 Aprender</span>
      <button class="icon-btn" data-help aria-label="Ayuda" title="Ayuda">?</button>
      <button class="icon-btn only-mobile" id="closeSide" aria-label="Cerrar panel">×</button>
    </div>
    <div class="row2">
      <button class="btn" id="newSkill">+ habilidad</button>
      <button class="btn" id="newNode">+ nodo</button>
    </div>
    <div class="sec">Habilidades</div>
    <div class="skills" id="skills"></div>
    <div class="row2">
      <button class="btn" id="undo" title="Ctrl+Z">↶ deshacer</button>
      <button class="btn" id="redo" title="Ctrl+Y">↷ rehacer</button>
    </div>
    <div class="row2">
      <button class="btn" id="exportBtn" title="Guardar una copia de todas las habilidades en JSON">⇩ exportar</button>
      <button class="btn" id="importBtn" title="Cargar habilidades desde un JSON">⇧ importar</button>
    </div>
  </aside>
  <div class="stage">
    <div class="topbar">
      <button class="icon-btn" id="openSide" aria-label="Mostrar u ocultar el panel" title="Mostrar / ocultar panel">☰</button>
      <span class="cur-name" id="curName" title="Renombrar"></span>
      <button class="icon-btn help-btn only-mobile" data-help aria-label="Ayuda">?</button>
    </div>
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
        <button class="btn" id="layout" title="Acomoda los nodos en columnas según sus conexiones">⇶<span class="lbl"> reordenar</span></button>
        <button class="btn" id="fit" title="Ver todo">⤢<span class="lbl"> centrar</span></button>
        <button class="btn sq" id="zoomOut" aria-label="Alejar">−</button>
        <button class="btn sq" id="zoomIn" aria-label="Acercar">+</button>
        <button class="btn" id="noteBtn" title="Nota adhesiva">▣ nota</button>
      </div>
      <div class="toolbar" id="wireBar" hidden>
        <button class="btn primary" id="wireDel">× quitar conexión</button>
        <button class="btn" id="wireCancel">cancelar</button>
      </div>
      <div class="toolbar pick" id="pickBar" hidden>
        <span id="pickTxt"></span>
        <button class="btn" id="pickCancel">cancelar</button>
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
      <li><b>Conexión</b> (línea continua) A → B = <b>B es parte de A</b>. Arrastrá el <b>puerto ●</b> del borde derecho a otra card = conectarlas · a un lugar vacío = nuevo nodo.</li>
      <li><b>Requisito</b> (<b style="color:var(--req)">flecha punteada</b>) A ⇢ B = <b>B requiere A</b>. Se crea con el botón <b style="color:var(--req)">⇢</b> de la card y tocando después la card requerida.</li>
      <li><b>🔒 Bloqueada</b>: si alguna card requerida está por debajo de Plata, la card que la requiere se atenúa y no puede subir de nivel. Se desbloquea sola cuando todas llegan a Plata.</li>
      <li>Tocá una <b>card</b> = menú debajo para elegir <b style="color:var(--concepto)">concepto</b> / <b style="color:var(--accion)">acción</b>.</li>
      <li>Al lado del puntito de notas: <b style="color:var(--heart)">◎ objetivo</b> y <b style="color:var(--req)">⇢ requiere</b> (flechita punteada).</li>
      <li><b style="color:var(--heart)">Objetivo</b> = lo que tiene que salir y cuánto (ej. «corazón simétrico 8 de 10»). Sin objetivo, una card no pasa de Plata.</li>
      <li><b>Estado</b>: tocá el círculo al inicio de la card para subirlo. El nivel de cada card es independiente del de sus partes.</li>
      <li><b>Notas</b>: el <b>puntito</b> de la card (lleno si tiene notas).</li>
      <li>Tocá una <b>línea</b> o <b>flecha</b> = seleccionarla para quitarla.</li>
      <li>Arrastrá la <b>card</b> = moverla · <b>Shift + arrastrar</b> = mover con todas sus partes.</li>
      <li><b>Doble clic</b> = crear nodo / renombrar · <b>✎</b> renombrar · <b>+</b> nueva parte · <b>×</b> borrar.</li>
      <li>Arrastrá el fondo = mover · rueda o dos dedos = zoom · <b>⇶</b> reordenar · <b>⤢</b> centrar.</li>
      <li>Teclado: <b>Tab</b> nueva parte · <b>Supr</b> borrar · <b>Enter</b> renombrar · <b>Ctrl+Z / Ctrl+Y</b>.</li>
    </ul>
    <div class="help-h">Niveles</div>
    <div class="lv-tab">
      <span></span><span class="h">Acción</span><span class="h">Concepto</span>
      <b style="color:var(--bronce)">Bronce</b><span>lo entiendo o lo hice una vez</span><span>lo leí</span>
      <b style="color:var(--plata)">Plata</b><span>me sale con atención deliberada</span><span>lo recuerdo con ayuda</span>
      <b style="color:var(--oro)">Oro</b><span>cumplo el objetivo de forma consistente</span><span>lo explico sin mirar</span>
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
  var GX = 60, GY = 18;     // separación entre columnas / filas al reordenar
  var GRID = 10;
  var LEVEL_ORDER = ["", "bronce", "plata", "oro", "diamante"];
  var PLATA = 2, ORO = 3;   // posiciones en LEVEL_ORDER
  var LEVELS = {
    bronce:   { label: "Bronce",   color: "var(--bronce)" },
    plata:    { label: "Plata",    color: "var(--plata)" },
    oro:      { label: "Oro",      color: "var(--oro)" },
    diamante: { label: "Diamante", color: "var(--diamante)" }
  };
  // Criterio de cada nivel según el tipo (una card sin tipo usa los de acción).
  var CRITERIA = {
    accion:   { bronce: "lo entiendo o lo hice una vez", plata: "me sale con atención deliberada",
                oro: "cumplo el objetivo de forma consistente", diamante: "automatizado, me sale mientras pienso en otra cosa" },
    concepto: { bronce: "lo leí", plata: "lo recuerdo con ayuda", oro: "lo explico sin mirar", diamante: "lo uso sin pensarlo" }
  };
  var TYPES = {
    concepto: { label: "Concepto", color: "var(--concepto)" },
    accion:   { label: "Acción",   color: "var(--accion)" }
  };
  var STICKY_COLORS = ["rosa", "amarillo", "azul", "verde"];

  var $ = function(id){ return root.getElementById(id); };
  var canvas = $("canvas"), world = $("world"), wiresEl = $("wires"), cardsEl = $("cards"), stickiesEl = $("stickies");

  var state = api.state();
  var hist = [], fut = [];
  var sel = null;          // {node: id} | {dep: {from, to}} | {req: {from, to}} | {sticky: id}
  var els = {};            // id de nodo → elemento de la card
  var sEls = {};           // id de nota adhesiva → elemento
  var drag = null, pinch = null, pointers = {}, tempWire = null, editing = null;
  var menu = null;         // {id} menú abierto sobre un nodo
  var pick = null;         // {to: id} eligiendo la card que «to» requiere

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
  function addDep(p, from, to){
    if(from === to) return false;
    if(p.deps.some(function(d){ return d.from === from && d.to === to; })){ toast("Esa conexión ya existe"); return false; }
    if(reaches(p, to, from)){ toast("Eso crearía un ciclo"); return false; }
    p.deps.push({ from: from, to: to });
    return true;
  }
  function removeDep(p, from, to){ p.deps = p.deps.filter(function(d){ return !(d.from === from && d.to === to); }); }

  // ---------- requisitos y bloqueo ----------
  function rank(l){ return Math.max(0, LEVEL_ORDER.indexOf(l || "")); }
  function criterion(t, l){ return CRITERIA[t.type === "concepto" ? "concepto" : "accion"][l]; }
  function reqsOf(p, id){ return p.reqs.filter(function(r){ return r.to === id; }).map(function(r){ return r.from; }); }
  // Cards requeridas que todavía están por debajo de Plata.
  function blockers(p, t){ return reqsOf(p, t.id).map(function(id){ return byId(p, id); }).filter(function(x){ return x && rank(x.level) < PLATA; }); }
  function blockedSet(p){ var o = {}; if(p) p.nodes.forEach(function(t){ if(blockers(p, t).length) o[t.id] = 1; }); return o; }
  function addReq(p, from, to){
    var a = byId(p, from), b = byId(p, to);
    if(!a || !b || from === to) return false;
    if(p.reqs.some(function(r){ return r.from === from && r.to === to; })){ toast("Ese requisito ya existe"); return false; }
    if(reachesIn(p.reqs, to, from)){ toast("No se puede: «" + a.title + "» ya requiere (directa o indirectamente) a «" + b.title + "»"); return false; }
    p.reqs.push({ from: from, to: to });
    return true;
  }

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
  function restore(s){ var o = JSON.parse(s); state.skills = o.skills; state.current = o.current; sel = null; pick = null; save(); renderAll(); }
  function undo(){ if(!hist.length) return; fut.push(snapshot()); restore(hist.pop()); }
  function redo(){ if(!fut.length) return; hist.push(snapshot()); restore(fut.pop()); }
  // Cambio con deshacer. Si una card queda desbloqueada por el cambio, avisa.
  function change(fn){
    var before = snapshot(), p = cur(), was = blockedSet(p);
    if(fn(p) === false) return;
    pushHist(before);
    p = cur();
    if(p) p.updated = Date.now();
    save();
    renderAll();
    if(!p) return;
    var now = blockedSet(p);
    var freed = p.nodes.filter(function(t){ return was[t.id] && !now[t.id]; });
    if(freed.length) setTimeout(function(){
      toast("Desbloqueada" + (freed.length > 1 ? "s" : "") + ": " + freed.map(function(t){ return t.title; }).join(", "));
    }, 0);
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

  // ---------- reordenar (auto-layout) ----------
  function layout(p){
    var level = {}, order = [], indeg = {};
    p.nodes.forEach(function(t){ indeg[t.id] = 0; level[t.id] = 0; });
    p.deps.forEach(function(d){ if(indeg[d.to] !== undefined) indeg[d.to]++; });
    var queue = p.nodes.filter(function(t){ return !indeg[t.id]; })
      .sort(function(a, b){ return a.y - b.y || a.x - b.x; }).map(function(t){ return t.id; });
    while(queue.length){
      var n = queue.shift();
      order.push(n);
      dependents(p, n).forEach(function(k){
        level[k] = Math.max(level[k], level[n] + 1);
        if(--indeg[k] === 0) queue.push(k);
      });
    }
    var cols = [];
    order.forEach(function(id){ (cols[level[id]] = cols[level[id]] || []).push(id); });
    // Cada columna se ordena por la fila promedio de lo que la conecta (baricentro), así se cruzan poco.
    var row = {}, rootRow = 0;
    cols.forEach(function(col, li){
      var items = col.map(function(id){
        var pre = prereqs(p, id).filter(function(x){ return row[x] !== undefined; });
        var want = pre.length ? pre.reduce(function(s, x){ return s + row[x]; }, 0) / pre.length : null;
        return { id: id, want: want, y: byId(p, id).y };
      });
      if(li === 0){
        items.forEach(function(it){ row[it.id] = rootRow; rootRow += Math.max(1, branchWidth(p, it.id)); });
        return;
      }
      items.sort(function(a, b){ return a.want - b.want || a.y - b.y; });
      var last = -Infinity;
      items.forEach(function(it){ var r = Math.max(Math.round(it.want * 2) / 2, last + 1); row[it.id] = r; last = r; });
    });
    var pitch = Math.max.apply(null, [H].concat(p.nodes.map(function(t){ return cardH(t.id); }))) + GY;
    var x0 = Infinity, y0 = Infinity;
    p.nodes.forEach(function(t){ x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); });
    p.nodes.forEach(function(t){ t.x = snap(x0 + level[t.id] * (W + GX)); t.y = snap(y0 + row[t.id] * pitch); });
  }
  function branchWidth(p, id){
    var depth = {}, count = {};
    (function walk(n, d){
      if(depth[n] !== undefined && depth[n] >= d) return;
      depth[n] = d;
      dependents(p, n).forEach(function(k){ walk(k, d + 1); });
    })(id, 0);
    Object.keys(depth).forEach(function(k){ count[depth[k]] = (count[depth[k]] || 0) + 1; });
    return Math.max.apply(null, Object.keys(count).map(function(k){ return count[k]; }));
  }

  // ---------- dibujo ----------
  function isSelNode(id){ return sel && sel.node === id; }
  function isSelDep(d){ return sel && sel.dep && sel.dep.from === d.from && sel.dep.to === d.to; }
  function isSelReq(r){ return sel && sel.req && sel.req.from === r.from && sel.req.to === r.to; }

  function renderAll(){
    renderSkills();
    renderStickies();
    renderCards();
    renderWires();
    applyView();
    var p = cur();
    $("undo").disabled = !hist.length;
    $("redo").disabled = !fut.length;
    $("newNode").disabled = $("noteBtn").disabled = !p;
    $("layout").disabled = !p || !p.nodes.length;
    $("fit").disabled = !p || (!p.nodes.length && !p.stickies.length);
    $("curName").textContent = p ? p.name : "";
    $("curName").hidden = !p;
    renderBars();
    renderMenu();
  }

  function levelTip(p, t, lv, bl){
    var s = lv ? lv.label + ": " + criterion(t, t.level) : "Sin estado";
    if(bl.length) return s + " · 🔒 requiere llevar a Plata: " + bl.map(function(x){ return x.title; }).join(", ");
    var next = LEVEL_ORDER[rank(t.level) + 1];
    return s + (next ? " · tocá para subir a " + LEVELS[next].label + " (" + criterion(t, next) + ")" : " · tocá para volver a sin estado");
  }

  function renderCards(){
    var p = cur();
    cardsEl.innerHTML = "";
    els = {};
    $("empty").hidden = !!(p && (p.nodes.length || p.stickies.length));
    $("empty").firstElementChild.textContent = p
      ? "Doble clic (o «+ nodo») para crear el primer nodo."
      : "Creá una habilidad con «+ habilidad».";
    if(!p) return;
    p.nodes.forEach(function(t){
      var kids = dependents(p, t.id).length;
      var c = document.createElement("div");
      var ty = TYPES[t.type], lv = LEVELS[t.level], bl = blockers(p, t);
      c.className = "card" + (ty ? " t-" + t.type : !prereqs(p, t.id).length && kids ? " root" : "") + (lv ? " lv-" + t.level : "") +
        (bl.length ? " blocked" : "") + (pick && pick.to !== t.id ? " pickable" : "") + (isSelNode(t.id) ? " selected" : "");
      c.dataset.id = t.id;
      c.style.left = t.x + "px";
      c.style.top = t.y + "px";
      c.innerHTML =
        '<span class="port in" data-port="in" title="Arrastrá para reconectar o quitar la conexión"></span>' +
        '<div class="head"><button class="st" data-act="level"></button><span class="title"></span></div>' +
        (t.heart ? '<div class="heart"></div>' : '') +
        '<div class="meta">' + (bl.length ? '<span class="lock">🔒</span>' : '') + (kids ? '<span class="kids" title="Partes">→ ' + kids + '</span>' : '') +
          '<button class="mt goal' + (t.heart ? " has" : "") + '" data-act="heart" title="' + (t.heart ? "Editar objetivo" : "Agregar objetivo") + '" aria-label="Objetivo">◎</button>' +
          '<button class="mt req" data-act="req" title="Requiere… (tocá después la card requerida)" aria-label="Requiere"><svg width="15" height="10" viewBox="0 0 15 10" aria-hidden="true"><path d="M1 5 H10" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.5 2" fill="none"/><path d="M9 1.5 L13.5 5 L9 8.5 Z" fill="currentColor"/></svg></button>' +
          noteDot(t) + '<span class="tools"><button data-act="edit" title="Renombrar">✎</button><button data-act="child" title="Nueva parte (Tab)">+</button><button data-act="del" title="Borrar (Supr)">×</button></span>' +
        '</div>' +
        '<span class="port out" data-port="out" title="Arrastrá para conectar"></span>';
      var st = c.querySelector(".st");
      st.innerHTML = lv ? '<span class="medal m-' + t.level + '" style="--m:' + lv.color + '"></span>' : "○";
      st.title = levelTip(p, t, lv, bl);
      c.querySelector(".title").textContent = t.title;
      if(t.heart){ var hz = c.querySelector(".heart"); hz.textContent = "◎ " + t.heart; hz.title = "Objetivo: " + t.heart; }
      if(bl.length) c.querySelector(".lock").title = "Bloqueada: requiere llevar a Plata " + bl.map(function(x){ return "«" + x.title + "»"; }).join(", ");
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

  function curve(x1, y1, x2, y2, horiz){
    if(horiz){ var dx = Math.max(30, Math.abs(x2 - x1) / 2) * (x2 >= x1 ? 1 : -1);
      return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2; }
    var dy = Math.max(24, Math.abs(y2 - y1) / 2) * (y2 >= y1 ? 1 : -1);
    return "M" + x1 + "," + y1 + " C" + x1 + "," + (y1 + dy) + " " + x2 + "," + (y2 - dy) + " " + x2 + "," + y2;
  }
  function wirePath(x1, y1, x2, y2){
    var dx = Math.max(30, Math.abs(x2 - x1) / 2);
    return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2;
  }
  // Flecha de requisito: de lado a lado si las cards están en columnas distintas; si no, de arriba a abajo.
  function reqPath(a, b){
    var ah = cardH(a.id), bh = cardH(b.id);
    var ax = a.x + W / 2, ay = a.y + ah / 2, bx = b.x + W / 2, by = b.y + bh / 2;
    if(Math.abs(bx - ax) >= W * 0.8){
      var right = bx > ax;
      return curve(right ? a.x + W : a.x, ay, right ? b.x - 4 : b.x + W + 4, by, true);
    }
    var down = by > ay, off = W * 0.3;   // corrida hacia la derecha para no tapar las conexiones
    return curve(ax + off, down ? a.y + ah : a.y, bx + off, down ? b.y - 4 : b.y + bh + 4, false);
  }
  function renderWires(){
    var p = cur();
    var html = '<defs><marker id="reqArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#ef8fb0"/></marker></defs>';
    if(p){
      p.deps.forEach(function(d){
        if(drag && drag.kind === "wire" && drag.hide && drag.hide.from === d.from && drag.hide.to === d.to) return;
        var a = byId(p, d.from), b = byId(p, d.to);
        if(!a || !b) return;
        var path = wirePath(a.x + W, a.y + cardH(a.id) / 2, b.x, b.y + cardH(b.id) / 2);
        html += '<g class="wire' + (isSelDep(d) ? " selected" : "") + '" data-from="' + d.from + '" data-to="' + d.to + '"><path class="hit" d="' + path + '"/><path class="line" d="' + path + '"/></g>';
      });
      p.reqs.forEach(function(r){
        var a = byId(p, r.from), b = byId(p, r.to);
        if(!a || !b) return;
        var path = reqPath(a, b);
        html += '<g class="wire req' + (isSelReq(r) ? " selected" : "") + '" data-rfrom="' + r.from + '" data-rto="' + r.to + '"><title>«' +
          esc(b.title) + '» requiere «' + esc(a.title) + '»</title><path class="hit" d="' + path + '"/><path class="line" d="' + path + '" marker-end="url(#reqArrow)"/></g>';
      });
    }
    if(tempWire) html += '<path class="temp" d="' + tempWire + '"/>';
    wiresEl.innerHTML = html;
  }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return "&#" + c.charCodeAt(0) + ";"; }); }
  // Barra de abajo: normal · línea o flecha seleccionada · eligiendo requisito.
  function renderBars(){
    var line = !!(sel && (sel.dep || sel.req));
    $("pickBar").hidden = !pick;
    $("wireBar").hidden = !!pick || !line;
    $("toolbar").hidden = !!pick || line;
    if(pick || line) $("palette").hidden = true;
    $("wireDel").textContent = sel && sel.req ? "× quitar requisito" : "× quitar conexión";
    if(pick){ var t = cur() && byId(cur(), pick.to); $("pickTxt").textContent = "Tocá la card que «" + (t ? t.title : "") + "» requiere"; }
  }

  // ---------- menú del nodo: el tipo, en diagonal debajo de la card ----------
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
  // Los botones salen debajo de la card y bajan en diagonal hacia la derecha.
  function placeMenu(){
    var box = $("nmenu");
    if(!menu || box.hidden || !els[menu.id]) return;
    var cr = canvas.getBoundingClientRect(), r = els[menu.id].getBoundingClientRect();
    var n = box.children.length, dx = 22, step = isMobile() ? 46 : 38;
    var widest = Math.max.apply(null, Array.prototype.map.call(box.children, function(b){ return b.offsetWidth; }));
    var x0 = r.left - cr.left + 6, y0 = r.bottom - cr.top + 8;
    x0 = Math.max(8, Math.min(x0, cr.width - 8 - widest - (n - 1) * dx));   // que no se salga por la derecha
    Array.prototype.forEach.call(box.children, function(b, i){
      b.style.left = (x0 + i * dx) + "px";
      b.style.top = (y0 + i * step) + "px";
    });
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

  // ---------- requisito: elegir la otra card ----------
  function startPick(id){ pick = { to: id }; select(null); renderCards(); renderWires(); renderBars(); }
  function endPick(){ pick = null; renderCards(); renderWires(); renderBars(); }
  function finishPick(fromId){
    var p = cur(), to = pick && pick.to; pick = null;
    if(!to || fromId === to){ renderCards(); renderBars(); return; }
    var a = byId(p, fromId), b = byId(p, to);
    var ok = false;
    change(function(){ ok = addReq(p, fromId, to); return ok; });
    if(!ok){ renderCards(); renderBars(); return; }
    toast("«" + b.title + "» requiere «" + a.title + "»" + (rank(a.level) < PLATA ? " · queda bloqueada" : ""));
  }
  $("pickCancel").addEventListener("click", endPick);

  // ---------- estado (toque en el círculo = siguiente estado) ----------
  function setLevel(id, next){
    var p = cur(), t = byId(p, id); if(!t) return;
    if(rank(next) > rank(t.level)){
      var bl = blockers(p, t);
      if(bl.length){ toast("🔒 Bloqueada: primero llevá a Plata " + bl.map(function(x){ return "«" + x.title + "»"; }).join(", ")); return; }
      if(rank(next) >= ORO && !(t.heart && t.heart.trim())){
        ask({ title: "Para pasar a " + LEVELS[next].label + ", escribí el objetivo de «" + t.title + "»",
              text: "Qué tiene que salir y cuánto. Ej.: corazón simétrico 8 de 10.", input: "", placeholder: "Objetivo…", ok: "guardar y subir" }, function(v){
          change(function(){ t.heart = v; t.level = next; });
          toast("Estado: " + LEVELS[next].label);
        });
        return;
      }
    }
    change(function(){ if(next) t.level = next; else delete t.level; });
    toast(next ? "Estado: " + LEVELS[next].label : "Sin estado");
  }
  function cycleLevel(id){
    var t = byId(cur(), id); if(!t) return;
    setLevel(id, LEVEL_ORDER[(rank(t.level) + 1) % LEVEL_ORDER.length]);
  }
  function editHeart(id){
    var t = byId(cur(), id); if(!t) return;
    ask({ title: "Objetivo de «" + t.title + "»", text: "Qué tiene que salir y cuánto, ej.: corazón simétrico 8 de 10. Dejalo vacío para quitarlo.",
          input: t.heart || "", placeholder: "Objetivo…", ok: "guardar", allowEmpty: true }, function(v){
      if(v === (t.heart || "")) return;
      var drop = !v && rank(t.level) >= ORO;
      change(function(){ if(v) t.heart = v; else delete t.heart; if(drop) t.level = "plata"; });
      if(drop) toast("Sin objetivo no puede estar en Oro: bajó a Plata");
    });
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
    var has = !!(t.notes && t.notes.trim());
    return '<button type="button" class="note-dot' + (has ? " has" : "") + '" data-act="notes" title="' + (has ? "Ver notas" : "Agregar notas") + '" aria-label="Notas"></button>';
  }
  var notesId = null;
  function openNotes(id){
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
    if(!state.skills.length){ list.innerHTML = '<div class="no-skills">Todavía no hay habilidades.<br>Creá una con «+ habilidad».</div>'; return; }
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
        if(state.current !== p.id){ state.current = p.id; sel = null; menu = null; pick = null; $("palette").hidden = true; save(); renderAll(); if(!p.fitted){ p.fitted = true; fit(); } }
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

  // ---------- acciones ----------
  function select(s){
    sel = s;
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
      p.deps.push({ from: id, to: t.id });
      sel = { node: t.id };
    });
    if(t){ ensureVisible(t); startEdit(t.id); }
  }
  function deleteSelected(){
    if(!sel) return;
    if(sel.node){
      var id = sel.node;
      change(function(p){
        p.nodes = p.nodes.filter(function(t){ return t.id !== id; });
        p.deps = p.deps.filter(function(d){ return d.from !== id && d.to !== id; });
        p.reqs = p.reqs.filter(function(r){ return r.from !== id && r.to !== id; });
        sel = null;
      });
    } else if(sel.dep){
      var d = sel.dep;
      change(function(p){ removeDep(p, d.from, d.to); sel = null; });
      toast("Conexión quitada");
    } else if(sel.req){
      var q = sel.req;
      change(function(p){ p.reqs = p.reqs.filter(function(r){ return !(r.from === q.from && r.to === q.to); }); sel = null; });
      toast("Requisito quitado");
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
  canvas.addEventListener("pointerdown", function(e){
    if(e.button !== 0 && e.pointerType === "mouse") return;
    var p = cur(); if(!p) return;
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
      if(pick) endPick();
      if(t.closest('[data-sact="resize"]')) drag = Object.assign(base, { kind: "resize", s: s, w: s.w, h: s.h });
      else drag = Object.assign(base, { kind: "smove", s: s, x: s.x, y: s.y });
      if(!(sel && sel.sticky === s.id)) select({ sticky: s.id });
    } else if(port && card && !pick){
      var id = card.dataset.id;
      if(port.dataset.port === "out") drag = Object.assign(base, { kind: "wire", from: id });
      else {
        var inc = prereqs(p, id);
        if(!inc.length) drag = moveDrag(base, id, e.shiftKey);
        else drag = Object.assign(base, { kind: "wire", from: inc[inc.length - 1], hide: { from: inc[inc.length - 1], to: id } });
      }
    } else if(card){
      drag = moveDrag(base, card.dataset.id, e.shiftKey);
      if(!pick && !isSelNode(card.dataset.id)) select({ node: card.dataset.id });
    } else if(wire && !pick){
      if(wire.dataset.rfrom) select({ req: { from: wire.dataset.rfrom, to: wire.dataset.rto } });
      else select({ dep: { from: wire.dataset.from, to: wire.dataset.to } });
      return;
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
      var a2 = byId(cur(), drag.from), w = toWorld(e.clientX, e.clientY);
      var target = dropTarget(e, drag.from);
      if(target){ var tt = byId(cur(), target); w = { x: tt.x, y: tt.y + cardH(tt.id) / 2 }; }
      tempWire = wirePath(a2.x + W, a2.y + cardH(a2.id) / 2, w.x, w.y);
      Object.keys(els).forEach(function(k){ els[k].classList.toggle("drop", k === target); });
      renderWires();
    }
  });
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
    if(d.kind === "pan"){
      if(d.moved) save();
      else if(pick) endPick();
      else if(sel) select(null);
    } else if(d.kind === "smove" || d.kind === "resize"){
      if(d.moved){ pushHist(d.before); p.updated = Date.now(); save(); renderAll(); }
      else if(d.kind === "smove" && isDoubleTap(e, d.s.id)) editSticky(d.s.id);
    } else if(d.kind === "move"){
      if(d.moved){ pushHist(d.before); p.updated = Date.now(); save(); renderAll(); }
      else if(pick) finishPick(d.id);
      else {
        // toque en una card = abrir / cerrar su menú · doble toque (celular) = renombrar
        if(isDoubleTap(e, d.id)){ closeMenu(); startEdit(d.id); }
        else if(menu && menu.id === d.id) closeMenu(); else openMenu(d.id);
      }
    } else if(d.kind === "wire"){
      tempWire = null;
      var target = d.moved ? dropTarget(e, d.from) : null;
      if(d.hide){
        if(!d.moved || target === d.hide.to){ renderAll(); return; }
        pushHist(d.before);
        removeDep(p, d.hide.from, d.hide.to);
        if(target){ if(!addDep(p, d.from, target)) p.deps.push(d.hide); }
        else toast("Conexión quitada");
        p.updated = Date.now(); save(); renderAll();
      } else if(target){
        change(function(){ return addDep(p, d.from, target); });
        renderAll();
      } else if(d.moved){
        var w = toWorld(e.clientX, e.clientY), t;
        change(function(){
          t = makeNode(p, w.x, w.y - H / 2);
          p.deps.push({ from: d.from, to: t.id });
          sel = { node: t.id };
        });
        startEdit(t.id);
      } else renderAll();
    }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("click", function(e){
    var sb = e.target.closest('[data-sact="del"]');
    if(sb){ select({ sticky: sb.closest(".sticky").dataset.sid }); deleteSelected(); return; }
    var b = e.target.closest("[data-act]"); if(!b) return;
    var card = b.closest(".card"); if(!card) return;
    var id = card.dataset.id, act = b.dataset.act;
    if(pick){ if(act !== "del") finishPick(id); return; }
    if(act === "edit"){ select({ node: id }); startEdit(id); }
    else if(act === "child") newChild(id);
    else if(act === "level") cycleLevel(id);
    else if(act === "notes"){ closeMenu(); openNotes(id); }
    else if(act === "heart"){ closeMenu(); editHeart(id); }
    else if(act === "req"){ closeMenu(); startPick(id); }
    else if(act === "del"){
      var p = cur(), t = byId(p, id), k = dependents(p, id).length;
      sel = { node: id };
      if(k) ask({ title: "¿Borrar «" + t.title + "»? Sus " + k + " parte(s) quedan sueltas.", ok: "borrar", danger: true }, deleteSelected);
      else deleteSelected();
    }
  });
  canvas.addEventListener("dblclick", function(e){
    var p = cur(); if(!p || pick) return;
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
    if(!api.visible()) return;
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
    else if(k === "escape"){ closeMenu(); $("palette").hidden = true; if(pick) endPick(); select(null); }
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
          sel = null; pick = null;
        });
        fit();
        toast("Importada" + (ok.length > 1 ? "s " + ok.length + " habilidades" : ": " + ok[0].name));
      });
    });
  });

  // ---------- botones ----------
  $("newSkill").addEventListener("click", newSkill);
  $("newNode").addEventListener("click", function(){
    var p = cur(); if(!p) return;
    closeSideMobile();
    var r = canvas.getBoundingClientRect();
    var c = toWorld(r.left + r.width / 2, r.top + r.height / 2), t;
    change(function(){ t = makeNode(p, c.x - W / 2, c.y - H / 2); sel = { node: t.id }; });
    startEdit(t.id);
  });
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  $("exportBtn").addEventListener("click", exportJSON);
  $("importBtn").addEventListener("click", function(){ closeSideMobile(); $("fileIn").click(); });
  $("layout").addEventListener("click", function(){
    change(function(p){ if(!p || !p.nodes.length) return false; layout(p); });
    fit();
  });
  $("fit").addEventListener("click", fit);
  $("zoomIn").addEventListener("click", function(){ var r = canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); });
  $("zoomOut").addEventListener("click", function(){ var r = canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); });
  $("wireDel").addEventListener("click", deleteSelected);
  $("wireCancel").addEventListener("click", function(){ select(null); });
  $("curName").addEventListener("click", function(){ var p = cur(); if(p) renameSkill(p); });
  Array.prototype.forEach.call(root.querySelectorAll("[data-help]"), function(b){
    b.addEventListener("click", function(){ closeSideMobile(); $("helpDlg").hidden = false; });
  });
  $("helpClose").addEventListener("click", function(){ $("helpDlg").hidden = true; });
  $("helpDlg").addEventListener("click", function(e){ if(e.target === e.currentTarget) e.currentTarget.hidden = true; });

  function isMobile(){ return matchMedia("(max-width: 800px)").matches; }
  function closeSideMobile(){ $("side").classList.remove("open"); }
  // En el celular ☰ abre el panel en pantalla completa; en la compu lo pliega o despliega.
  function applySide(){ $("layoutEl").classList.toggle("side-collapsed", !!state.sideCollapsed); }
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
    hist = []; fut = []; sel = null; menu = null; pick = null; drag = null; tempWire = null;
    applySide();
    if(api.visible()) show();
  }
  function busy(){ return !!(editing || drag || pick || notesId !== null || !$("ask").hidden); }
  return { show: show, reload: reload, busy: busy };
}
})();
