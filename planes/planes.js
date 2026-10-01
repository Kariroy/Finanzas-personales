// Planes: planificador de tareas en forma de ramas.
// Cada tarea es una card en un lienzo; un wire A→B significa "B depende de A".
// Con Supabase configurado (../config.js) los datos se guardan en la cuenta y se
// sincronizan entre dispositivos; sin él, quedan solo en este navegador (localStorage).
(function(){
"use strict";

var KEY = "planes-v1";
var storeKey = KEY;       // con cuenta: una copia local por usuario (KEY + ":" + id)
var W = 230, H = 56;      // tamaño de la card (igual que --card-w / --card-h)
var GX = 60, GY = 18;     // separación entre columnas / filas al reordenar
var GRID = 10;
var ICON = { todo: "○", doing: "▶", paused: "❚❚", done: "✓" };
var NEXT = { todo: "doing", doing: "done", done: "todo", paused: "doing" };

var $ = function(id){ return document.getElementById(id); };
var canvas = $("canvas"), world = $("world"), wiresEl = $("wires"), cardsEl = $("cards");

var state = load();
if(!Array.isArray(state.programs)) state.programs = [];
if(!Array.isArray(state.portfolios)) state.portfolios = [];
if(!state.mode) state.mode = matchMedia("(max-width: 800px)").matches ? "list" : "map";
var hist = [], fut = [];
var sel = null;          // {task: id} | {dep: {from, to}}
var els = {};            // id de tarea → elemento de la card
var drag = null;         // arrastre en curso
var pinch = null;        // zoom con dos dedos
var pointers = {};
var tempWire = null;
var editing = null;

// ---------- datos ----------
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function demo(){
  var p = newProjectObj("Muestra de proyecto");
  function t(title, status, x, y){ var o = { id: uid(), title: title, status: status, x: x, y: y }; p.tasks.push(o); return o; }
  var a = t("Definir la idea", "done", 0, 60);
  var b = t("Investigar opciones", "done", 290, 0);
  var c = t("Hacer bocetos", "doing", 290, 120);
  var d = t("Elegir la opción final", "todo", 580, 0);
  var e = t("Prototipo", "todo", 870, 60);
  var f = t("Probar con usuarios", "todo", 1160, 60);
  var g = t("Armar presupuesto", "todo", 290, 240);
  [[a, b], [a, c], [b, d], [d, e], [c, e], [e, f], [a, g]].forEach(function(x){ p.deps.push({ from: x[0].id, to: x[1].id }); });
  return p;
}

function newProjectObj(name, program){
  return { id: uid(), name: name, program: program || null, updated: Date.now(), tasks: [], deps: [], view: { x: 60, y: 120, z: 1 } };
}

function readStore(key){
  try {
    var s = JSON.parse(localStorage.getItem(key));
    if(s && Array.isArray(s.projects)) return s;
  } catch(e){}
  return null;
}

function load(){
  var s = readStore(storeKey);
  if(s) return s;
  var g = { id: uid(), name: "Personal", open: true };
  var p = demo();
  p.program = g.id;
  return { programs: [g], projects: [p], current: p.id, highlight: true };
}

function save(){
  if(REMOTE && !user) return;   // sin sesión no se guarda nada (evita pisar datos)
  try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch(e){}
  if(user) schedulePush();
}

function proj(){
  for(var i = 0; i < state.projects.length; i++) if(state.projects[i].id === state.current) return state.projects[i];
  return null;
}
function byId(p, id){
  for(var i = 0; i < p.tasks.length; i++) if(p.tasks[i].id === id) return p.tasks[i];
  return null;
}
function prereqs(p, id){ return p.deps.filter(function(d){ return d.to === id; }).map(function(d){ return d.from; }); }
function dependents(p, id){ return p.deps.filter(function(d){ return d.from === id; }).map(function(d){ return d.to; }); }

function info(p, t){
  var pending = prereqs(p, t.id).map(function(id){ return byId(p, id); })
    .filter(function(x){ return x && x.status !== "done"; }).length;
  return {
    pending: pending,
    blocked: t.status !== "done" && pending > 0,
    unlocked: pending === 0 && (t.status === "todo" || t.status === "paused")
  };
}

// ¿Hay un camino a → … → b?
function reaches(p, a, b){
  var seen = {}, stack = [a];
  while(stack.length){
    var n = stack.pop();
    if(n === b) return true;
    if(seen[n]) continue;
    seen[n] = 1;
    dependents(p, n).forEach(function(x){ stack.push(x); });
  }
  return false;
}

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
  if(p.deps.some(function(d){ return d.from === from && d.to === to; })){ toast("Esa dependencia ya existe"); return false; }
  if(reaches(p, to, from)){ toast("Eso crearía un ciclo"); return false; }
  p.deps.push({ from: from, to: to });
  return true;
}
function removeDep(p, from, to){
  p.deps = p.deps.filter(function(d){ return !(d.from === from && d.to === to); });
}

function overlaps(p, x, y, skip){
  return p.tasks.some(function(t){ return t.id !== skip && Math.abs(t.x - x) < W && Math.abs(t.y - y) < H + 4; });
}
function freeSpot(p, x, y){
  var i = 0;
  while(overlaps(p, x, y) && i++ < 200) y += H + GY;
  return { x: x, y: y };
}

function makeTask(p, x, y, title){
  var s = freeSpot(p, snap(x), snap(y));
  var t = { id: uid(), title: title || "Nueva tarea", status: "todo", x: s.x, y: s.y };
  p.tasks.push(t);
  return t;
}

function snap(v){ return Math.round(v / GRID) * GRID; }

// ---------- historial ----------
function snapshot(){ return JSON.stringify({ portfolios: state.portfolios, programs: state.programs, projects: state.projects, current: state.current }); }
function pushHist(s){
  hist.push(s || snapshot());
  if(hist.length > 200) hist.shift();
  fut = [];
}
function restore(s){
  var o = JSON.parse(s);
  state.projects = o.projects;
  state.programs = o.programs || [];
  state.portfolios = o.portfolios || [];
  state.current = o.current;
  sel = null;
  save();
  renderAll();
}
function undo(){ if(!hist.length) return; fut.push(snapshot()); restore(hist.pop()); }
function redo(){ if(!fut.length) return; hist.push(snapshot()); restore(fut.pop()); }

// Cambio con deshacer: guarda el estado anterior, aplica, guarda y redibuja.
function change(fn){
  var before = snapshot();
  var p = proj();
  if(fn(p) === false) return;
  pushHist(before);
  if(p) p.updated = Date.now();
  save();
  renderAll();
}

// ---------- vista ----------
function view(){ var p = proj(); return p ? p.view : { x: 0, y: 0, z: 1 }; }
function applyView(){
  var v = view();
  world.style.transform = "translate(" + v.x + "px," + v.y + "px) scale(" + v.z + ")";
  var g = 22 * v.z;
  canvas.style.backgroundSize = g + "px " + g + "px";
  canvas.style.backgroundPosition = v.x + "px " + v.y + "px";
}
function toWorld(cx, cy){
  var r = canvas.getBoundingClientRect(), v = view();
  return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
}
function zoomAt(cx, cy, factor){
  var p = proj(); if(!p) return;
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
  var p = proj(); if(!p || !p.tasks.length) return;
  var r = canvas.getBoundingClientRect();
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  p.tasks.forEach(function(t){
    minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + W); maxY = Math.max(maxY, t.y + H);
  });
  var pad = 60;
  var z = Math.min(1.2, (r.width - pad * 2) / (maxX - minX), (r.height - pad * 2 - 50) / (maxY - minY));
  z = Math.max(0.45, z);   // en pantallas chicas mejor legible que completo
  p.view.z = z;
  p.view.x = (r.width - (maxX - minX) * z) / 2 - minX * z;
  p.view.y = (r.height - 50 - (maxY - minY) * z) / 2 - minY * z;
  applyView();
  save();
}

// ---------- reordenar (auto-layout) ----------
function layout(p){
  var level = {}, order = [];
  // Orden topológico (Kahn) y nivel = camino más largo desde una raíz.
  var indeg = {};
  p.tasks.forEach(function(t){ indeg[t.id] = 0; level[t.id] = 0; });
  p.deps.forEach(function(d){ if(indeg[d.to] !== undefined) indeg[d.to]++; });
  var queue = p.tasks.filter(function(t){ return !indeg[t.id]; })
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

  // Cada columna se ordena por la fila promedio de sus prerequisitos (baricentro),
  // así las ramas quedan cerca de su origen y se cruzan poco.
  var row = {};
  var rootRow = 0;
  cols.forEach(function(col, li){
    var items = col.map(function(id){
      var pre = prereqs(p, id).filter(function(x){ return row[x] !== undefined; });
      var want = pre.length ? pre.reduce(function(s, x){ return s + row[x]; }, 0) / pre.length : null;
      return { id: id, want: want, y: byId(p, id).y };
    });
    if(li === 0){
      // Raíces: cada una deja lugar para el ancho de su rama.
      items.forEach(function(it){ row[it.id] = rootRow; rootRow += Math.max(1, branchWidth(p, it.id)); });
      return;
    }
    items.sort(function(a, b){ return a.want - b.want || a.y - b.y; });
    var last = -Infinity;
    items.forEach(function(it){
      var r = Math.max(Math.round(it.want * 2) / 2, last + 1);
      row[it.id] = r; last = r;
    });
  });
  var x0 = Infinity, y0 = Infinity;
  p.tasks.forEach(function(t){ x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); });
  p.tasks.forEach(function(t){
    t.x = snap(x0 + level[t.id] * (W + GX));
    t.y = snap(y0 + row[t.id] * (H + GY));
  });
}
// Cuántas filas ocupa la rama que sale de una raíz (máximo de tareas en una misma columna).
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
function isSelTask(id){ return sel && sel.task === id; }
function isSelDep(d){ return sel && sel.dep && sel.dep.from === d.from && sel.dep.to === d.to; }

function renderAll(){
  var list = state.mode === "list";
  canvas.hidden = list;
  Array.prototype.forEach.call($("modeSeg").children, function(b){ b.classList.toggle("on", b.dataset.mode === state.mode); });
  renderProjects();
  renderList();
  renderCards();
  renderWires();
  applyView();
  var p = proj();
  $("undo").disabled = !hist.length;
  $("redo").disabled = !fut.length;
  $("newTask").disabled = !p;
  $("layout").disabled = !p;
  canvas.classList.toggle("hl", state.highlight !== false);
  $("highlight").checked = state.highlight !== false;
}

function renderCards(){
  var p = proj();
  cardsEl.innerHTML = "";
  els = {};
  $("empty").hidden = !!(p && p.tasks.length);
  $("empty").firstElementChild.textContent = p
    ? "Doble clic en cualquier lugar para crear la primera tarea."
    : "Creá un proyecto con «+ proyecto».";
  if(!p) return;
  p.tasks.forEach(function(t){
    var i = info(p, t);
    var kids = dependents(p, t.id).length;
    var c = document.createElement("div");
    c.className = "card s-" + t.status + (i.blocked ? " blocked" : "") + (i.unlocked ? " unlocked" : "") + (isSelTask(t.id) ? " selected" : "");
    c.dataset.id = t.id;
    c.style.left = t.x + "px";
    c.style.top = t.y + "px";
    c.innerHTML =
      '<span class="port in" data-port="in" title="Arrastrá para reconectar o quitar la dependencia"></span>' +
      '<div class="head"><button class="st" data-act="status" title="Clic: cambiar estado · Shift+clic: pausar">' + ICON[t.status] + '</button>' +
      '<span class="title"></span></div>' +
      '<div class="meta">' +
        (i.blocked ? '<span class="lock" title="Prerequisitos sin terminar">🔒 ' + i.pending + '</span>' : kids ? '<span class="kids" title="Tareas que dependen de esta">→ ' + kids + '</span>' : '') +
        noteDot(t) + '<span class="tools"><button data-act="edit" title="Renombrar">✎</button><button data-act="child" title="Nueva tarea dependiente (Tab)">+</button><button data-act="del" title="Borrar (Supr)">×</button></span>' +
        (i.unlocked ? '<span class="ready">▶ lista</span>' : '') +
      '</div>' +
      '<span class="port out" data-port="out" title="Arrastrá para crear una dependencia"></span>';
    c.querySelector(".title").textContent = t.title;
    c.title = t.title;
    cardsEl.appendChild(c);
    els[t.id] = c;
  });
}

function wirePath(x1, y1, x2, y2){
  var dx = Math.max(30, Math.abs(x2 - x1) / 2);
  return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2;
}

function renderWires(){
  var p = proj(), html = "";
  if(p){
    p.deps.forEach(function(d){
      if(drag && drag.kind === "wire" && drag.hide && drag.hide.from === d.from && drag.hide.to === d.to) return;
      var a = byId(p, d.from), b = byId(p, d.to);
      if(!a || !b) return;
      var path = wirePath(a.x + W, a.y + H / 2, b.x, b.y + H / 2);
      html += '<g class="wire' + (a.status === "done" ? " done" : "") + (isSelDep(d) ? " selected" : "") +
        '" data-from="' + d.from + '" data-to="' + d.to + '"><path class="hit" d="' + path + '"/><path class="line" d="' + path + '"/></g>';
    });
  }
  if(tempWire) html += '<path class="temp" d="' + tempWire + '"/>';
  wiresEl.innerHTML = html;
}

function programById(id){
  for(var i = 0; i < state.programs.length; i++) if(state.programs[i].id === id) return state.programs[i];
  return null;
}
// Programa real del proyecto (null si no tiene o si el programa ya no existe).
function progOf(p){ return programById(p.program) ? p.program : null; }

function projStats(p){
  var done = p.tasks.filter(function(t){ return t.status === "done"; }).length;
  return { n: p.tasks.length, done: done, pending: p.tasks.length - done };
}

// Panel izquierdo: programas desplegables con sus proyectos adentro.
function renderProjects(){
  var list = $("projects");
  var sortFn = function(a, b){ return b.updated - a.updated; };  // últimos editados primero
  var tab = activeTab();
  renderTabs(tab);
  var groups = state.programs.filter(function(g){ return tab === "all" || portOf(g) === tab; })
    .sort(function(a, b){ return a.name.localeCompare(b.name, "es"); });
  var loose = state.projects.filter(function(p){ return !progOf(p); });
  if(loose.length && tab === "all") groups.push({ id: null, name: "Sin programa", open: state.looseOpen !== false });

  list.innerHTML = "";
  if(!groups.length){
    list.innerHTML = '<div class="no-projects">' + (tab === "all" ? "Creá un programa y adentro tus proyectos." :
      "Este portafolio no tiene programas. Creá uno con «+ programa» o pasá uno existente con ✎.") + "</div>";
    return;
  }
  groups.forEach(function(g){
    var all = state.projects.filter(function(p){ return progOf(p) === g.id; });
    var shown = all.slice().sort(sortFn);
    var tot = all.reduce(function(acc, p){ var st = projStats(p); acc.n += st.n; acc.done += st.done; return acc; }, { n: 0, done: 0 });
    var pct = tot.n ? Math.round(tot.done * 100 / tot.n) : 0;
    var hasCurrent = all.some(function(p){ return p.id === state.current; });
    var open = g.open !== false;

    var box = document.createElement("div");
    box.className = "prog" + (open ? " open" : "") + (g.id ? "" : " loose");
    var head = document.createElement("div");
    head.className = "prog-h" + (hasCurrent && !open ? " has-current" : "");
    head.innerHTML = '<span class="caret">' + (open ? "▾" : "▸") + '</span><span class="ring" style="--p:' + pct + '"></span>' +
      '<div class="txt"><div class="name"></div><div class="sub">' + all.length + " proyecto" + (all.length === 1 ? "" : "s") +
      " · " + pct + "%</div></div>" +
      (g.id ? '<button class="x add" title="Nuevo proyecto en este programa">＋</button>' +
              '<button class="x ren" title="Editar programa">✎</button><button class="x del" title="Borrar programa">×</button>' : "");
    head.querySelector(".name").textContent = g.name;
    head.addEventListener("click", function(e){
      if(e.target.closest(".add")){ newProject(g.id); return; }
      if(e.target.closest(".ren")){ renameProgram(g); return; }
      if(e.target.closest(".del")){ deleteProgram(g, all.length); return; }
      if(g.id) g.open = !open; else state.looseOpen = !open;
      save(); renderProjects();
    });
    box.appendChild(head);

    if(open){
      var inner = document.createElement("div");
      inner.className = "prog-body";
      if(!shown.length){
        inner.innerHTML = '<div class="no-projects">' + "Sin proyectos todavía." + "</div>";
      }
      shown.forEach(function(p){ inner.appendChild(projectItem(p)); });
      box.appendChild(inner);
    }
    list.appendChild(box);
  });
}

function projectItem(p){
  var st = projStats(p), pct = st.n ? Math.round(st.done * 100 / st.n) : 0;
  var d = new Date(p.updated);
  var el = document.createElement("div");
  el.className = "proj" + (p.id === state.current ? " active" : "");
  el.innerHTML = '<span class="ring" style="--p:' + pct + '"></span><div class="txt"><div class="name"></div>' +
    '<div class="sub">' + st.pending + " por hacer · ed. " + d.toISOString().slice(0, 10) + "</div></div>" +
    '<button class="x ren" title="Editar proyecto">✎</button><button class="x del" title="Borrar proyecto">×</button>';
  el.querySelector(".name").textContent = p.name;
  el.addEventListener("click", function(e){
    if(e.target.closest(".ren")){ editProject(p); return; }
    if(e.target.closest(".del")){
      ask({ title: "¿Borrar el proyecto «" + p.name + "» y todas sus tareas?", ok: "borrar", danger: true }, function(){
        change(function(){
          state.projects = state.projects.filter(function(x){ return x.id !== p.id; });
          if(state.current === p.id) state.current = state.projects[0] ? state.projects[0].id : null;
        });
      });
      return;
    }
    if(state.current !== p.id){ state.current = p.id; sel = null; save(); renderAll(); }
    closeSideMobile();
  });
  el.addEventListener("dblclick", function(e){ if(!e.target.closest(".x")) editProject(p); });
  return el;
}

function programOptions(){
  return [{ value: "", label: "Sin programa" }].concat(state.programs.slice()
    .sort(function(a, b){ return a.name.localeCompare(b.name, "es"); })
    .map(function(g){ return { value: g.id, label: g.name }; }));
}

function newProgram(){
  var tab = activeTab();
  ask({ title: "Nuevo programa", input: "", placeholder: "Nombre del programa (ej. Mudarme)", ok: "crear",
        select: { label: "Portafolio", options: portfolioOptions(), value: tab === "all" ? "" : tab } }, function(name, port){
    change(function(){ state.programs.push({ id: uid(), name: name, open: true, portfolio: port || null }); });
  });
}
function renameProgram(g){
  ask({ title: "Editar programa", input: g.name, ok: "guardar",
        select: { label: "Portafolio", options: portfolioOptions(), value: portOf(g) || "" } }, function(name, port){
    port = port || null;
    if(name !== g.name || port !== portOf(g)) change(function(){ g.name = name; g.portfolio = port; });
  });
}

// ---------- portafolios (pestañas arriba del panel) ----------
// Cada programa pertenece a un portafolio (o a ninguno). La pestaña elegida
// filtra el panel; "Todos" muestra todo. La pestaña se recuerda en este navegador.
function portfolioById(id){
  for(var i = 0; i < state.portfolios.length; i++) if(state.portfolios[i].id === id) return state.portfolios[i];
  return null;
}
function portOf(g){ return portfolioById(g.portfolio) ? g.portfolio : null; }
function activeTab(){ return portfolioById(state.portfolioTab) ? state.portfolioTab : "all"; }
function sortedPortfolios(){ return state.portfolios.slice().sort(function(a, b){ return a.name.localeCompare(b.name, "es"); }); }
function portfolioOptions(){
  return [{ value: "", label: "Sin portafolio" }].concat(sortedPortfolios().map(function(f){ return { value: f.id, label: f.name }; }));
}

// Progreso de un conjunto de programas (todas las tareas de sus proyectos).
function progressOf(programIds){
  var n = 0, done = 0;
  state.projects.forEach(function(p){
    if(programIds.indexOf(progOf(p)) < 0) return;
    var st = projStats(p); n += st.n; done += st.done;
  });
  return n ? Math.round(done * 100 / n) : 0;
}

function renderTabs(tab){
  var box = $("tabs");
  var html = '<button type="button" class="tab' + (tab === "all" ? " on" : "") + '" data-tab="all">Todos</button>';
  sortedPortfolios().forEach(function(f){
    html += '<button type="button" class="tab' + (tab === f.id ? " on" : "") + '" data-tab="' + f.id + '">' + esc(f.name) + "</button>";
  });
  html += '<button type="button" class="tab add" data-tab="new" title="Nuevo portafolio">＋</button>';
  box.innerHTML = html;
  var info = $("tabInfo"), f = portfolioById(tab);
  info.hidden = !f;
  if(f){
    var ids = state.programs.filter(function(g){ return portOf(g) === f.id; }).map(function(g){ return g.id; });
    info.innerHTML = '<span class="ring" style="--p:' + progressOf(ids) + '"></span><span class="tab-name"></span>' +
      '<span class="tab-sub">' + ids.length + " programa" + (ids.length === 1 ? "" : "s") + " · " + progressOf(ids) + "%</span>" +
      '<button type="button" class="x" data-tab-act="ren" title="Renombrar portafolio">✎</button>' +
      '<button type="button" class="x del" data-tab-act="del" title="Borrar portafolio">×</button>';
    info.querySelector(".tab-name").textContent = f.name;
  }
}

$("tabs").addEventListener("click", function(e){
  var b = e.target.closest("[data-tab]"); if(!b) return;
  var t = b.dataset.tab;
  if(t === "new"){
    ask({ title: "Nuevo portafolio", input: "", placeholder: "Ej. Trabajo, Personal, Estudio", ok: "crear" }, function(name){
      var f = { id: uid(), name: name };
      change(function(){ state.portfolios.push(f); state.portfolioTab = f.id; });
    });
    return;
  }
  state.portfolioTab = t;
  save();
  renderProjects();
  b.scrollIntoView({ block: "nearest", inline: "nearest" });
});

$("tabInfo").addEventListener("click", function(e){
  var b = e.target.closest("[data-tab-act]"); if(!b) return;
  var f = portfolioById(activeTab()); if(!f) return;
  if(b.dataset.tabAct === "ren"){
    ask({ title: "Renombrar portafolio", input: f.name, ok: "guardar" }, function(name){
      if(name !== f.name) change(function(){ f.name = name; });
    });
  } else {
    var n = state.programs.filter(function(g){ return portOf(g) === f.id; }).length;
    ask({ title: "¿Borrar el portafolio «" + f.name + "»?" + (n ? " Sus " + n + " programa(s) y proyectos no se borran: quedan en «Todos»." : ""), ok: "borrar", danger: true }, function(){
      change(function(){
        state.portfolios = state.portfolios.filter(function(x){ return x.id !== f.id; });
        state.programs.forEach(function(g){ if(g.portfolio === f.id) g.portfolio = null; });
        state.portfolioTab = "all";
      });
    });
  }
});
function deleteProgram(g, n){
  ask({ title: "¿Borrar el programa «" + g.name + "»?" + (n ? " Sus " + n + " proyecto(s) no se borran: pasan a «Sin programa»." : ""), ok: "borrar", danger: true }, function(){
    change(function(){
      state.programs = state.programs.filter(function(x){ return x.id !== g.id; });
      state.projects.forEach(function(p){ if(p.program === g.id) p.program = null; });
    });
  });
}

// ---------- edición del título ----------
function startEdit(id, span){
  if(!span && state.mode === "list"){
    var row = $("listBody").querySelector('.li[data-id="' + id + '"]');
    span = row && row.querySelector(".li-title");
  }
  if(!span){ var c = els[id]; span = c && c.querySelector(".title"); }
  if(!span) return;
  var p = proj(), t = byId(p, id);
  editing = id;
  span.contentEditable = "true";
  span.focus();
  var r = document.createRange(); r.selectNodeContents(span);
  var s = getSelection(); s.removeAllRanges(); s.addRange(r);
  var done = false;
  function finish(ok){
    if(done) return; done = true;
    editing = null;
    var v = span.textContent.replace(/\s+/g, " ").trim();
    span.contentEditable = "false";
    if(ok && v && v !== t.title) change(function(){ t.title = v; });
    else { renderCards(); renderList(); }
  }
  span.addEventListener("keydown", function(e){
    e.stopPropagation();
    if(e.key === "Enter"){ e.preventDefault(); finish(true); }
    else if(e.key === "Escape"){ e.preventDefault(); finish(false); }
  });
  span.addEventListener("blur", function(){ finish(true); });
}

// ---------- acciones ----------
// Cambia la selección sin rehacer las cards (así el doble clic sigue funcionando).
function select(s){
  sel = s;
  Object.keys(els).forEach(function(k){ els[k].classList.toggle("selected", isSelTask(k)); });
  renderWires();
}

function newChild(id){
  var p = proj(), parent = byId(p, id); if(!parent) return;
  var t;
  change(function(){
    var ys = dependents(p, id).map(function(k){ return byId(p, k).y; });
    var y = ys.length ? Math.max.apply(null, ys) + H + GY : parent.y;
    t = makeTask(p, parent.x + W + GX, y);
    p.deps.push({ from: id, to: t.id });
    sel = { task: t.id };
  });
  if(t){ ensureVisible(t); startEdit(t.id); }
}

function deleteSelected(){
  if(!sel) return;
  if(sel.task){
    var id = sel.task;
    change(function(p){
      p.tasks = p.tasks.filter(function(t){ return t.id !== id; });
      p.deps = p.deps.filter(function(d){ return d.from !== id && d.to !== id; });
      sel = null;
    });
  } else if(sel.dep){
    var d = sel.dep;
    change(function(p){ removeDep(p, d.from, d.to); sel = null; });
  }
}

function cycleStatus(id, shift){
  var t = byId(proj(), id);
  setStatus(id, shift ? (t.status === "paused" ? "todo" : "paused") : NEXT[t.status]);
}

// Cambia el estado y avisa qué tareas quedaron desbloqueadas gracias a eso.
function setStatus(id, status){
  change(function(p){
    var ready = {};
    p.tasks.forEach(function(x){ if(info(p, x).unlocked) ready[x.id] = 1; });
    var t = byId(p, id);
    t.status = status;
    var i = info(p, t);
    var freed = p.tasks.filter(function(x){ return x.id !== id && !ready[x.id] && info(p, x).unlocked; });
    if(freed.length) toast("Desbloqueada" + (freed.length > 1 ? "s" : "") + ": " + freed.map(function(x){ return x.title; }).join(", "));
    else if((status === "doing" || status === "done") && i.pending) toast("Ojo: tiene " + i.pending + " prerequisito(s) sin terminar");
  });
}

function ensureVisible(t){
  var r = canvas.getBoundingClientRect(), v = view();
  var sx = t.x * v.z + v.x, sy = t.y * v.z + v.y;
  var m = 40;
  if(sx < m) v.x += m - sx;
  if(sx + W * v.z > r.width - m) v.x -= sx + W * v.z - (r.width - m);
  if(sy < m) v.y += m - sy;
  if(sy + H * v.z > r.height - 80) v.y -= sy + H * v.z - (r.height - 80);
  applyView();
}

var toastTimer;
function toast(msg){
  var el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove("show"); }, 2200);
}

// ---------- puntero: mover, conectar, pan, pinch ----------
canvas.addEventListener("pointerdown", function(e){
  if(e.button !== 0 && e.pointerType === "mouse") return;
  var p = proj(); if(!p) return;
  if(editing){ if(!e.target.closest(".title[contenteditable=true]")) document.activeElement.blur(); else return; }

  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  var ids = Object.keys(pointers);
  if(ids.length === 2){
    var a = pointers[ids[0]], b = pointers[ids[1]];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    drag = null; tempWire = null; renderWires();
    return;
  }
  var t = e.target;
  if(t.closest("[data-act]") || t.closest(".toolbar") || t.closest(".menu")) return;

  var card = t.closest(".card"), port = t.closest(".port"), wire = t.closest(".wire");
  var base = { sx: e.clientX, sy: e.clientY, moved: false, before: snapshot() };

  if(port && card){
    var id = card.dataset.id;
    if(port.dataset.port === "out"){
      drag = Object.assign(base, { kind: "wire", from: id });
    } else {
      var inc = prereqs(p, id);
      if(!inc.length){ drag = moveDrag(base, id, e.shiftKey); }
      else drag = Object.assign(base, { kind: "wire", from: inc[inc.length - 1], hide: { from: inc[inc.length - 1], to: id } });
    }
  } else if(card){
    drag = moveDrag(base, card.dataset.id, e.shiftKey);
    if(!isSelTask(card.dataset.id)) select({ task: card.dataset.id });
  } else if(wire){
    select({ dep: { from: wire.dataset.from, to: wire.dataset.to } });
    return;
  } else {
    var v = view();
    drag = Object.assign(base, { kind: "pan", vx: v.x, vy: v.y });
  }
  canvas.setPointerCapture(e.pointerId);
});

function moveDrag(base, id, subtree){
  var p = proj();
  var ids = subtree ? descendants(p, id) : [id];
  return Object.assign(base, {
    kind: "move", id: id,
    items: ids.map(function(k){ var t = byId(p, k); return { t: t, x: t.x, y: t.y }; })
  });
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
    if(Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if(drag.kind === "pan") canvas.classList.add("panning");
    if(drag.kind === "move") drag.items.forEach(function(it){ var c = els[it.t.id]; if(c) c.classList.add("dragging"); });
  }
  var v = view();
  if(drag.kind === "pan"){
    v.x = drag.vx + dx; v.y = drag.vy + dy;
    applyView();
  } else if(drag.kind === "move"){
    drag.items.forEach(function(it){
      it.t.x = snap(it.x + dx / v.z);
      it.t.y = snap(it.y + dy / v.z);
      var c = els[it.t.id];
      if(c){ c.style.left = it.t.x + "px"; c.style.top = it.t.y + "px"; }
    });
    renderWires();
  } else if(drag.kind === "wire"){
    var a2 = byId(proj(), drag.from), w = toWorld(e.clientX, e.clientY);
    var target = dropTarget(e, drag.from);
    if(target){ var tt = byId(proj(), target); w = { x: tt.x, y: tt.y + H / 2 }; }
    tempWire = wirePath(a2.x + W, a2.y + H / 2, w.x, w.y);
    Object.keys(els).forEach(function(k){ els[k].classList.toggle("drop", k === target); });
    renderWires();
  }
});

function dropTarget(e, from){
  var el = document.elementFromPoint(e.clientX, e.clientY);
  var c = el && el.closest(".card");
  return c && c.dataset.id !== from ? c.dataset.id : null;
}

function endPointer(e){
  delete pointers[e.pointerId];
  if(pinch){ if(Object.keys(pointers).length < 2){ pinch = null; save(); } return; }
  if(!drag) return;
  var d = drag, p = proj();
  drag = null;
  canvas.classList.remove("panning");
  if(e.type === "pointercancel"){ tempWire = null; renderAll(); return; }

  if(d.kind === "pan"){
    if(d.moved) save(); else if(sel) select(null);
  } else if(d.kind === "move"){
    if(d.moved){ pushHist(d.before); p.updated = Date.now(); save(); renderAll(); }
  } else if(d.kind === "wire"){
    tempWire = null;
    var target = d.moved ? dropTarget(e, d.from) : null;
    if(d.hide){
      if(!d.moved || target === d.hide.to){ renderAll(); return; }
      pushHist(d.before);
      removeDep(p, d.hide.from, d.hide.to);
      if(target){ if(!addDep(p, d.from, target)) p.deps.push(d.hide); }
      else toast("Dependencia quitada");
      p.updated = Date.now(); save(); renderAll();
    } else if(target){
      change(function(){ return addDep(p, d.from, target); });
      renderAll();
    } else if(d.moved){
      var w = toWorld(e.clientX, e.clientY), t;
      change(function(){
        t = makeTask(p, w.x, w.y - H / 2);
        p.deps.push({ from: d.from, to: t.id });
        sel = { task: t.id };
      });
      startEdit(t.id);
    } else renderAll();
  }
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

// Botones dentro de las cards (estado, renombrar, hija, borrar).
canvas.addEventListener("click", function(e){
  var b = e.target.closest("[data-act]"); if(!b) return;
  var id = b.closest(".card").dataset.id;
  var act = b.dataset.act;
  if(act === "status") cycleStatus(id, e.shiftKey);
  else if(act === "edit"){ select({ task: id }); startEdit(id); }
  else if(act === "child") newChild(id);
  else if(act === "notes") openNotes(id);
  else if(act === "del"){ sel = { task: id }; deleteSelected(); }
});

canvas.addEventListener("dblclick", function(e){
  var p = proj(); if(!p) return;
  // Con pointer capture el evento llega al lienzo: buscamos qué hay bajo el puntero.
  var el = document.elementFromPoint(e.clientX, e.clientY) || e.target;
  if(el.closest("[data-act]") || el.closest(".toolbar") || el.closest(".port") || el.closest(".menu")) return;
  var card = el.closest(".card");
  if(card){ startEdit(card.dataset.id); return; }
  if(el.closest(".wire")) return;
  var w = toWorld(e.clientX, e.clientY), t;
  change(function(){ t = makeTask(p, w.x - W / 2, w.y - H / 2); sel = { task: t.id }; });
  startEdit(t.id);
});

canvas.addEventListener("wheel", function(e){
  e.preventDefault();
  if(!proj()) return;
  var f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
  zoomAt(e.clientX, e.clientY, f);
}, { passive: false });

// ---------- teclado ----------
document.addEventListener("keydown", function(e){
  var tg = e.target;
  if(!$("ask").hidden || !$("notesDlg").hidden) return;
  if(editing || tg.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName)) return;
  var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if(mod && k === "z" && !e.shiftKey){ e.preventDefault(); undo(); }
  else if(mod && (k === "y" || (k === "z" && e.shiftKey))){ e.preventDefault(); redo(); }
  else if(mod || state.mode === "list") return;
  else if(k === "delete" || k === "backspace"){ e.preventDefault(); deleteSelected(); }
  else if((k === "enter" || k === "f2") && sel && sel.task){ e.preventDefault(); startEdit(sel.task); }
  else if(k === "tab" && sel && sel.task){ e.preventDefault(); newChild(sel.task); }
  else if(k === " " && sel && sel.task){ e.preventDefault(); cycleStatus(sel.task, e.shiftKey); }
  else if(k === "escape"){ select(null); }
});

// ---------- vista lista (árbol de tareas y subtareas) ----------
// Cada tarea cuelga de su prerequisito: sus dependientes son sus subtareas.
// Si depende de varias, cuelga de la última en el orden de las ramas y
// muestra "también espera a …" con las demás.

function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return "&#" + c.charCodeAt(0) + ";"; }); }

// Orden de las ramas: primero lo que va antes (orden topológico), desempate por posición en el mapa.
function topoOrder(p){
  var indeg = {}, out = [], pos = {};
  p.tasks.forEach(function(t){ indeg[t.id] = 0; });
  p.deps.forEach(function(d){ if(indeg[d.to] !== undefined) indeg[d.to]++; });
  var byPos = function(a, b){ var A = byId(p, a), B = byId(p, b); return A.y - B.y || A.x - B.x; };
  var queue = p.tasks.map(function(t){ return t.id; }).filter(function(id){ return !indeg[id]; }).sort(byPos);
  while(queue.length){
    var n = queue.shift();
    out.push(n);
    dependents(p, n).forEach(function(k){ if(--indeg[k] === 0){ queue.push(k); queue.sort(byPos); } });
  }
  out.forEach(function(id, i){ pos[id] = i; });
  return pos;
}

function buildTree(p){
  var order = topoOrder(p), parent = {}, kids = {};
  p.tasks.forEach(function(t){
    var pre = prereqs(p, t.id).filter(function(id){ return byId(p, id); });
    pre.sort(function(a, b){ return order[b] - order[a]; });
    parent[t.id] = pre[0] || null;
  });
  var byOrder = function(a, b){ return order[a] - order[b]; };
  var roots = p.tasks.map(function(t){ return t.id; }).filter(function(id){ return !parent[id]; }).sort(byOrder);
  p.tasks.forEach(function(t){ var pa = parent[t.id]; if(pa) (kids[pa] = kids[pa] || []).push(t.id); });
  Object.keys(kids).forEach(function(k){ kids[k].sort(byOrder); });
  return { roots: roots, kids: kids, parent: parent, order: order };
}

function renderList(){
  var box = $("list"), p = proj();
  box.hidden = state.mode !== "list";
  if(box.hidden) return;
  var body = $("listBody"), head = $("listHead");
  $("listAdd").hidden = !p;
  if(!p){
    head.innerHTML = "";
    body.innerHTML = '<div class="list-empty">Creá un proyecto con «+ proyecto».</div>';
    return;
  }
  var done = p.tasks.filter(function(t){ return t.status === "done"; }).length;
  var pct = p.tasks.length ? Math.round(done * 100 / p.tasks.length) : 0;
  head.innerHTML = "<h2>" + esc(p.name) + '</h2><div class="sub">' + done + " de " + p.tasks.length +
    " hechas · " + pct + '%<label class="check hide-done"><input type="checkbox" data-act="hidedone"' +
    (state.hideDone ? " checked" : "") + '> ocultar ramas terminadas</label></div><div class="bar"><i style="width:' + pct + '%"></i></div>';

  var tree = buildTree(p);

  if(!p.tasks.length){
    body.innerHTML = '<div class="list-empty">Todavía no hay tareas. Escribí la primera arriba.</div>';
    return;
  }
  // Cuántas tareas tiene cada rama y cuántas están hechas (incluida la propia).
  var stats = {};
  (function count(ids){
    ids.forEach(function walk(id){
      if(stats[id]) return;
      var t = byId(p, id), s = { n: 1, done: t.status === "done" ? 1 : 0 };
      (tree.kids[id] || []).forEach(function(k){ walk(k); s.n += stats[k].n; s.done += stats[k].done; });
      stats[id] = s;
    });
  })(tree.roots);

  var html = "";
  (function nodes(ids){
    ids.forEach(function(id){
      var st = stats[id];
      if(state.hideDone && st.done === st.n) return;
      var t = byId(p, id), kids = tree.kids[id] || [];
      html += '<div class="node">' + listRow(p, t, tree, st, kids.length);
      if(kids.length && !t.fold){ html += '<div class="subs">'; nodes(kids); html += "</div>"; }
      html += "</div>";
    });
  })(tree.roots);
  body.innerHTML = html || '<div class="list-empty">Todo terminado 🎉</div>';
}

function listRow(p, t, tree, st, nkids){
  var i = info(p, t);
  var others = prereqs(p, t.id).filter(function(id){
    var x = byId(p, id); return x && id !== tree.parent[t.id] && x.status !== "done";
  });
  var meta = others.length ? '<span class="li-meta">también espera a ' + others.map(function(id){ return "<b>" + esc(byId(p, id).title) + "</b>"; }).join(", ") + "</span>" : "";
  var fold = nkids
    ? '<button type="button" class="tog" data-act="fold" aria-label="' + (t.fold ? "Mostrar" : "Ocultar") + ' subtareas">' + (t.fold ? "▸" : "▾") + "</button>"
    : '<span class="tog"></span>';
  var badge = nkids ? '<span class="li-count" title="Hechas en esta rama">' + st.done + "/" + st.n + "</span>" : "";
  if(i.unlocked) badge = '<span class="li-ready">▶ lista</span>' + badge;
  if(i.blocked) badge = '<span class="li-lock" title="Prerequisitos sin terminar">🔒</span>' + badge;
  return '<div class="li s-' + t.status + (i.blocked ? " blocked" : "") + (i.unlocked ? " unlocked" : "") + '" data-id="' + t.id + '">' + fold +
    '<input type="checkbox" class="chk" data-act="done" aria-label="Hecha"' + (t.status === "done" ? " checked" : "") + ">" +
    '<button type="button" class="st" data-act="status" title="Cambiar estado · Shift+clic: pausar">' + ICON[t.status] + "</button>" +
    '<div class="li-main"><span class="li-tline"><span class="li-title">' + esc(t.title) + "</span>" + noteDot(t) + "</span>" + meta + "</div>" + badge +
    '<span class="li-tools">' +
    '<button type="button" class="li-btn" data-act="sub" title="Agregar subtarea">＋</button>' +
    '<button type="button" class="li-btn" data-act="rename" title="Renombrar">✎</button>' +
    '<button type="button" class="li-btn" data-act="goto" title="Ver en el mapa">◎</button>' +
    '<button type="button" class="li-btn" data-act="del" title="Borrar">×</button>' +
    "</span></div>";
}

// Crea una tarea; con parentId queda como subtarea (depende de ella) y se ubica a su derecha en el mapa.
function addTask(p, title, parentId){
  var parent = parentId && byId(p, parentId), t;
  if(parent){
    var ys = dependents(p, parentId).map(function(k){ return byId(p, k).y; });
    t = makeTask(p, parent.x + W + GX, ys.length ? Math.max.apply(null, ys) + H + GY : parent.y, title);
    p.deps.push({ from: parentId, to: t.id });
    parent.fold = false;
  } else {
    var x = p.tasks.length ? Math.min.apply(null, p.tasks.map(function(k){ return k.x; })) : 0;
    var y = p.tasks.length ? Math.max.apply(null, p.tasks.map(function(k){ return k.y; })) + H + GY : 0;
    t = makeTask(p, x, y, title);
  }
  return t;
}

$("listHead").addEventListener("change", function(e){
  if(e.target.dataset.act === "hidedone"){ state.hideDone = e.target.checked; save(); renderList(); }
});

$("listBody").addEventListener("click", function(e){
  var b = e.target.closest("[data-act]"); if(!b) return;
  var act = b.dataset.act, p = proj();
  var id = b.closest(".li").dataset.id, t = byId(p, id);
  if(act === "fold"){ t.fold = !t.fold; save(); renderList(); }
  else if(act === "done") setStatus(id, b.checked ? "done" : "todo");
  else if(act === "status") cycleStatus(id, e.shiftKey);
  else if(act === "notes") openNotes(id);
  else if(act === "rename") startEdit(id, b.closest(".li").querySelector(".li-title"));
  else if(act === "sub"){
    var n;
    change(function(){ n = addTask(p, "Nueva subtarea", id); });
    var row = $("listBody").querySelector('.li[data-id="' + n.id + '"]');
    if(row){ row.scrollIntoView({ block: "nearest" }); startEdit(n.id, row.querySelector(".li-title")); }
  }
  else if(act === "del"){
    var k = dependents(p, id).length;
    var del = function(){ sel = { task: id }; deleteSelected(); };
    if(k) ask({ title: "«" + t.title + "» tiene " + k + " subtarea(s). Se borra solo esta tarea y sus subtareas quedan sueltas. ¿Seguir?", ok: "borrar", danger: true }, del);
    else del();
  }
  else if(act === "goto"){
    state.mode = "map"; sel = { task: id }; save(); renderAll();
    var v = view(), r = canvas.getBoundingClientRect();
    v.x = r.width / 2 - (t.x + W / 2) * v.z;
    v.y = r.height / 2 - (t.y + H / 2) * v.z;
    applyView(); save();
  }
});
$("listBody").addEventListener("dblclick", function(e){
  var span = e.target.closest(".li-title");
  if(span) startEdit(span.closest(".li").dataset.id, span);
});

function listAddTask(){
  var p = proj(), input = $("listNew"), title = input.value.replace(/\s+/g, " ").trim();
  if(!p || !title) return;
  change(function(){ addTask(p, title, null); });
  input.value = "";
  input.focus();
}
$("listAddBtn").addEventListener("click", listAddTask);
$("listNew").addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.preventDefault(); listAddTask(); } });

$("modeSeg").addEventListener("click", function(e){
  var b = e.target.closest("[data-mode]"); if(!b || b.dataset.mode === state.mode) return;
  state.mode = b.dataset.mode;
  save();
  renderAll();
});

// ---------- panel lateral ----------
function newProject(program){
  closeSideMobile();
  var cur = proj();
  if(typeof program !== "string") program = cur ? progOf(cur) : null;
  ask({ title: "Nuevo proyecto", input: "", placeholder: "Nombre del proyecto", ok: "crear",
        select: { label: "Programa", options: programOptions(), value: program || "" } }, function(name, prog){
    change(function(){
      var p = newProjectObj(name, prog || null);
      state.projects.push(p);
      state.current = p.id;
      sel = null;
    });
  });
}

function editProject(p){
  ask({ title: "Editar proyecto", input: p.name, ok: "guardar",
        select: { label: "Programa", options: programOptions(), value: progOf(p) || "" } }, function(name, prog){
    prog = prog || null;
    if(name !== p.name || prog !== progOf(p)) change(function(){
      p.name = name; p.program = prog;
      var g = programById(prog); if(g) g.open = true;
    });
  });
}

// Ventana propia para pedir un texto o confirmar. Reemplaza a prompt()/confirm(),
// que muchos celulares y vistas previas bloquean.
function ask(o, onOk){
  var box = $("ask"), input = $("askInput");
  $("askTitle").textContent = o.title;
  input.hidden = o.input === undefined;
  input.value = o.input || "";
  input.placeholder = o.placeholder || "";
  var selWrap = $("askSelWrap"), selEl = $("askSelect");
  selWrap.hidden = !o.select;
  if(o.select){
    $("askSelLabel").textContent = o.select.label;
    selEl.innerHTML = o.select.options.map(function(x){ return '<option value="' + esc(x.value) + '">' + esc(x.label) + "</option>"; }).join("");
    selEl.value = o.select.value;
  }
  $("askOk").textContent = o.ok || "aceptar";
  $("askOk").classList.toggle("danger", !!o.danger);
  box.hidden = false;
  setTimeout(function(){ if(input.hidden) $("askOk").focus(); else { input.focus(); input.select(); } }, 30);
  function close(){ box.hidden = true; $("askOk").onclick = $("askCancel").onclick = box.onclick = box.onkeydown = null; }
  function accept(){
    var v = input.value.replace(/\s+/g, " ").trim();
    if(!input.hidden && !v){ input.focus(); return; }
    close();
    onOk(v, o.select ? selEl.value : undefined);
  }
  // Sin <form> submit: en vistas previas "sandbox" los formularios no se envían.
  $("askOk").onclick = accept;
  $("askCancel").onclick = close;
  box.onclick = function(e){ if(e.target === box) close(); };
  box.onkeydown = function(e){
    if(e.key === "Escape"){ e.preventDefault(); close(); }
    else if(e.key === "Enter" && e.target === input){ e.preventDefault(); accept(); }
  };
}
$("newProject").addEventListener("click", function(){ newProject(); });
$("newProgram").addEventListener("click", newProgram);

Array.prototype.forEach.call(document.querySelectorAll("[data-help]"), function(b){
  b.addEventListener("click", function(){ closeSideMobile(); $("helpDlg").showModal(); });
});
$("helpClose").addEventListener("click", function(){ $("helpDlg").close(); });
// Clic en el fondo oscuro (fuera del recuadro) = cerrar.
$("helpDlg").addEventListener("click", function(e){
  var r = e.currentTarget.getBoundingClientRect();
  if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.currentTarget.close();
});

$("newTask").addEventListener("click", function(){
  var p = proj(); if(!p) return;
  if(state.mode === "list"){ closeSideMobile(); $("listNew").focus(); return; }
  var r = canvas.getBoundingClientRect();
  var c = toWorld(r.left + r.width / 2, r.top + r.height / 2), t;
  change(function(){ t = makeTask(p, c.x - W / 2, c.y - H / 2); sel = { task: t.id }; });
  closeSideMobile();
  startEdit(t.id);
});

$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
$("highlight").addEventListener("change", function(e){ state.highlight = e.target.checked; save(); renderAll(); });

$("layout").addEventListener("click", function(){
  change(function(p){ if(!p || !p.tasks.length) return false; layout(p); });
  fit();
});
$("fit").addEventListener("click", fit);
$("zoomIn").addEventListener("click", function(){ var r = canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); });
$("zoomOut").addEventListener("click", function(){ var r = canvas.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); });

function closeSideMobile(){ $("side").classList.remove("open"); }
function isMobile(){ return matchMedia("(max-width: 800px)").matches; }
// En el celular ☰ abre el panel en pantalla completa; en la compu lo pliega o despliega.
function applySide(){ document.querySelector(".layout").classList.toggle("side-collapsed", !!state.sideCollapsed); }
$("openSide").addEventListener("click", function(){
  if(isMobile()){ $("side").classList.add("open"); return; }
  state.sideCollapsed = !state.sideCollapsed;
  applySide();
  save();
});
applySide();

// ---------- notas de las tareas ----------
// La tarea solo muestra un puntito (lleno si tiene notas); al tocarlo se abren las notas.
function noteDot(t){
  var has = !!(t.notes && t.notes.trim());
  return '<button type="button" class="note-dot' + (has ? " has" : "") + '" data-act="notes" title="' +
    (has ? "Ver notas" : "Agregar notas") + '" aria-label="Notas"></button>';
}

var notesId = null;
function openNotes(id){
  var p = proj(), t = p && byId(p, id); if(!t) return;
  notesId = id;
  $("notesTitle").textContent = t.title;
  var ta = $("notesText");
  ta.value = t.notes || "";
  $("notesDlg").hidden = false;
  // Con notas: se muestran sin abrir el teclado. Sin notas: listo para escribir.
  if(!ta.value) ta.focus();
  else { ta.scrollTop = 0; ta.blur(); }
}
function closeNotes(){
  if(notesId === null) return;
  var id = notesId, v = $("notesText").value.replace(/\s+$/, "");
  notesId = null;
  $("notesDlg").hidden = true;
  var p = proj(), t = p && byId(p, id);
  if(t && v !== (t.notes || "")) change(function(){ if(v) t.notes = v; else delete t.notes; });
}
$("notesOk").addEventListener("click", closeNotes);
$("notesClose").addEventListener("click", closeNotes);
$("notesDlg").addEventListener("click", function(e){ if(e.target === e.currentTarget) closeNotes(); });
document.addEventListener("keydown", function(e){
  if(e.key === "Escape" && !$("notesDlg").hidden){ e.preventDefault(); closeNotes(); }
});
$("closeSide").addEventListener("click", closeSideMobile);

window.addEventListener("storage", function(e){
  if(e.key !== storeKey) return;
  var s = readStore(storeKey); if(!s) return;
  applyData(s);
});

// ---------- cuenta y sincronización (Supabase) ----------
// Una fila por persona en planes_datos (ver supabase/7-planes.sql) con
// { portfolios, programs, projects }. Lo demás (vista elegida, pliegues) queda en el navegador.
var CFG = window.APP_CONFIG || {};
var REMOTE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
var sb = (REMOTE && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey)
  : null;
var user = null;
var sync = { at: null, timer: null, busy: false, pending: false };

function setSync(text){ $("syncState").textContent = text; }

function payload(){ return { portfolios: state.portfolios, programs: state.programs, projects: state.projects }; }

// Reemplaza programas y proyectos por los de otra copia, conservando la vista local.
function applyData(d){
  state.portfolios = Array.isArray(d.portfolios) ? d.portfolios : [];
  state.programs = Array.isArray(d.programs) ? d.programs : [];
  state.projects = Array.isArray(d.projects) ? d.projects : [];
  if(!proj()) state.current = state.projects[0] ? state.projects[0].id : null;
  hist = []; fut = []; sel = null;
  try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch(e){}
  renderAll();
}

function schedulePush(){
  sync.pending = true;
  setSync("guardando…");
  clearTimeout(sync.timer);
  sync.timer = setTimeout(push, 800);
}

function push(){
  if(!user) return;
  if(sync.busy){ clearTimeout(sync.timer); sync.timer = setTimeout(push, 500); return; }
  sync.busy = true; sync.pending = false;
  sb.from("planes_datos").upsert({ user_id: user.id, data: payload() })
    .select("updated_at").single()
    .then(function(r){
      sync.busy = false;
      if(r.error) throw r.error;
      sync.at = r.data.updated_at;
      if(!sync.pending) setSync("guardado ✓");
    })
    .catch(function(){
      sync.busy = false;
      sync.pending = true;
      setSync("sin conexión · se guarda al volver");
      clearTimeout(sync.timer);
      sync.timer = setTimeout(push, 15000);
    });
}

// Trae la versión de la nube si otro dispositivo la cambió (y acá no hay cambios sin subir).
function pull(){
  if(!user || sync.pending || sync.busy || editing || drag) return;
  sb.from("planes_datos").select("updated_at").eq("user_id", user.id).maybeSingle().then(function(r){
    if(r.error || !r.data || r.data.updated_at === sync.at) return;
    return sb.from("planes_datos").select("data, updated_at").eq("user_id", user.id).single().then(function(r2){
      if(r2.error || sync.pending || sync.busy || editing || drag) return;
      sync.at = r2.data.updated_at;
      applyData(r2.data.data || {});
      setSync("actualizado ✓");
    });
  }).catch(function(){});
}

function onSession(s){
  user = s ? s.user : null;
  $("auth").hidden = !!user;
  $("account").hidden = !user;
  if(!user){
    // Sin sesión: no dejar a la vista datos de la cuenta anterior.
    storeKey = KEY; sync.at = null; clearTimeout(sync.timer); sync.pending = false;
    state.portfolios = []; state.programs = []; state.projects = []; state.current = null;
    hist = []; fut = []; sel = null;
    renderAll();
    return;
  }
  $("accountEmail").textContent = user.email || "";
  storeKey = KEY + ":" + user.id;
  var cached = readStore(storeKey);
  if(cached){ state.mode = cached.mode || state.mode; state.hideDone = cached.hideDone; applyData(cached); }
  setSync("sincronizando…");
  sb.from("planes_datos").select("data, updated_at").eq("user_id", user.id).maybeSingle().then(function(r){
    if(r.error) throw r.error;
    if(r.data){
      sync.at = r.data.updated_at;
      applyData(r.data.data || {});
      setSync("guardado ✓");
      return;
    }
    // Primera vez con esta cuenta: se sube lo que haya en este navegador
    // (lo que se usó sin cuenta, o el proyecto de muestra).
    var local = cached || readStore(KEY) || load();
    applyData(local);
    push();
    try { localStorage.removeItem(KEY); } catch(e){}
  }).catch(function(){
    setSync("sin conexión · usando la copia de este dispositivo");
  });
}

// ---------- login ----------
function authMsg(text, ok){ $("authMsg").textContent = text || ""; $("authMsg").classList.toggle("ok", !!ok); }
function authErrorText(err){
  var m = (err && err.message) || "";
  if(/invalid login/i.test(m)) return "Email o contraseña incorrectos.";
  if(/not confirmed/i.test(m)) return "Confirmá tu email antes de entrar (revisá tu casilla).";
  if(/already registered/i.test(m)) return "Ese email ya tiene cuenta. Probá con Entrar.";
  if(/password/i.test(m)) return "La contraseña tiene que tener al menos 6 caracteres.";
  return "No se pudo conectar. Probá de nuevo.";
}
function credentials(){
  var email = $("authEmail").value.trim(), password = $("authPass").value;
  if(!email || password.length < 6){ authMsg("Poné tu email y una contraseña de al menos 6 caracteres."); return null; }
  return { email: email, password: password };
}
function signIn(){
  var c = credentials(); if(!c) return;
  authMsg("Entrando…", true);
  sb.auth.signInWithPassword(c).then(function(r){ if(r.error) authMsg(authErrorText(r.error)); });
}
$("signInBtn").addEventListener("click", signIn);
$("authPass").addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.preventDefault(); signIn(); } });
$("authEmail").addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.preventDefault(); $("authPass").focus(); } });
$("signUpBtn").addEventListener("click", function(){
  var c = credentials(); if(!c) return;
  authMsg("Creando cuenta…", true);
  sb.auth.signUp({ email: c.email, password: c.password, options: { emailRedirectTo: location.origin + location.pathname } })
    .then(function(r){
      if(r.error) authMsg(authErrorText(r.error));
      else if(!r.data.session) authMsg("Te mandamos un email para confirmar la cuenta. Después volvé y entrá.", true);
    });
});
$("googleBtn").addEventListener("click", function(){
  authMsg("Abriendo Google…", true);
  sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } })
    .then(function(r){ if(r.error) authMsg("No se pudo abrir Google. Probá de nuevo."); });
});
$("signOut").addEventListener("click", function(){
  closeSideMobile();
  var out = function(){ sb.auth.signOut(); };
  if(sync.pending || sync.busy){
    ask({ title: "Hay cambios que todavía no se subieron. Si salís ahora se pierden. ¿Salir igual?", ok: "salir", danger: true }, out);
  } else out();
});

renderAll();

if(REMOTE){
  if(!sb){
    $("auth").hidden = false;
    authMsg("No se pudo cargar Supabase. Revisá tu conexión y recargá la página.");
    $("signInBtn").disabled = $("signUpBtn").disabled = true;
  } else {
    // Mientras se sabe si hay sesión, no mostrar datos locales de nadie.
    state.portfolios = []; state.programs = []; state.projects = []; state.current = null;
    renderAll();
    var params = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
    if(params.get("error_description")){
      authMsg("No se pudo entrar: " + params.get("error_description").replace(/\+/g, " "));
      history.replaceState(null, "", location.pathname);
    }
    fetch(CFG.supabaseUrl + "/auth/v1/settings", { headers: { apikey: CFG.supabaseAnonKey } })
      .then(function(r){ return r.json(); })
      .then(function(st){ $("googleBtn").hidden = !(st && st.external && st.external.google); })
      .catch(function(){});
    var currentUserId;
    sb.auth.onAuthStateChange(function(event, s){
      var id = s ? s.user.id : null;
      if(id === currentUserId) return;
      currentUserId = id;
      // Supabase recomienda no llamar a la API dentro de este callback.
      setTimeout(function(){ onSession(s); }, 0);
    });
    document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "visible") pull(); });
    window.addEventListener("focus", pull);
    window.addEventListener("online", function(){ if(sync.pending) push(); else pull(); });
    setInterval(function(){ if(document.visibilityState === "visible") pull(); }, 30000);
  }
}
})();
