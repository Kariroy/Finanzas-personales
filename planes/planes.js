// Planes: planificador de tareas en forma de ramas.
// Cada tarea es una card en un lienzo; un wire A→B significa "B depende de A".
// Todo se guarda en localStorage (este navegador). Exportar/importar = JSON.
(function(){
"use strict";

var KEY = "planes-v1";
var W = 230, H = 56;      // tamaño de la card (igual que --card-w / --card-h)
var GX = 60, GY = 18;     // separación entre columnas / filas al reordenar
var GRID = 10;
var ICON = { todo: "○", doing: "▶", paused: "❚❚", done: "✓" };
var NEXT = { todo: "doing", doing: "done", done: "todo", paused: "doing" };

var $ = function(id){ return document.getElementById(id); };
var canvas = $("canvas"), world = $("world"), wiresEl = $("wires"), cardsEl = $("cards");

var state = load();
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

function newProjectObj(name){
  return { id: uid(), name: name, updated: Date.now(), tasks: [], deps: [], view: { x: 60, y: 120, z: 1 } };
}

function load(){
  try {
    var s = JSON.parse(localStorage.getItem(KEY));
    if(s && Array.isArray(s.projects)) return s;
  } catch(e){}
  var p = demo();
  return { projects: [p], current: p.id, highlight: true };
}

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){}
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
function snapshot(){ return JSON.stringify({ projects: state.projects, current: state.current }); }
function pushHist(s){
  hist.push(s || snapshot());
  if(hist.length > 200) hist.shift();
  fut = [];
}
function restore(s){
  var o = JSON.parse(s);
  state.projects = o.projects;
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
  renderProjectPick();
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
        '<span class="tools"><button data-act="edit" title="Renombrar">✎</button><button data-act="child" title="Nueva tarea dependiente (Tab)">+</button><button data-act="del" title="Borrar (Supr)">×</button></span>' +
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

function renderProjects(){
  var list = $("projects"), f = state.filter || "todo", s = state.sort || "edited";
  $("filter").value = f; $("sort").value = s;
  var items = state.projects.map(function(p){
    var done = p.tasks.filter(function(t){ return t.status === "done"; }).length;
    return { p: p, pending: p.tasks.length - done, pct: p.tasks.length ? Math.round(done * 100 / p.tasks.length) : 0 };
  }).filter(function(it){
    if(f === "todo") return it.pending > 0 || !it.p.tasks.length || it.p.id === state.current;
    if(f === "done") return it.p.tasks.length && !it.pending;
    return true;
  });
  items.sort(function(a, b){
    if(s === "name") return a.p.name.localeCompare(b.p.name, "es");
    if(s === "pending") return b.pending - a.pending;
    return b.p.updated - a.p.updated;
  });
  list.innerHTML = "";
  if(!items.length){
    list.innerHTML = '<div class="no-projects">Sin proyectos en este filtro.</div>';
    return;
  }
  items.forEach(function(it){
    var d = new Date(it.p.updated);
    var el = document.createElement("div");
    el.className = "proj" + (it.p.id === state.current ? " active" : "");
    el.innerHTML = '<span class="ring" style="--p:' + it.pct + '"></span><div class="txt"><div class="name"></div>' +
      '<div class="sub">' + it.pending + ' por hacer · ed. ' + d.toISOString().slice(0, 10) + '</div></div>' +
      '<button class="x" title="Borrar proyecto">×</button>';
    el.querySelector(".name").textContent = it.p.name;
    el.title = "Doble clic para renombrar";
    el.addEventListener("click", function(e){
      if(e.target.closest(".x")){
        if(confirm("¿Borrar el proyecto «" + it.p.name + "» y todas sus tareas?")){
          change(function(){
            state.projects = state.projects.filter(function(x){ return x.id !== it.p.id; });
            if(state.current === it.p.id) state.current = state.projects[0] ? state.projects[0].id : null;
          });
        }
        return;
      }
      if(state.current !== it.p.id){ state.current = it.p.id; sel = null; save(); renderAll(); }
      closeSideMobile();
    });
    el.addEventListener("dblclick", function(e){
      if(e.target.closest(".x")) return;
      var name = prompt("Nombre del proyecto", it.p.name);
      if(name && name.trim()) change(function(){ it.p.name = name.trim(); });
    });
    list.appendChild(el);
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
  var body = $("listBody"), head = $("listHead"), after = $("listAfter");
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
  var keep = after.value;
  after.innerHTML = '<option value="">tarea principal</option>' + p.tasks.slice()
    .sort(function(a, b){ return tree.order[a.id] - tree.order[b.id]; })
    .filter(function(t){ return t.status !== "done"; })
    .map(function(t){ return '<option value="' + t.id + '">subtarea de: ' + esc(t.title) + "</option>"; }).join("");
  if(byId(p, keep)) after.value = keep;

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
    '<div class="li-main"><span class="li-title">' + esc(t.title) + "</span>" + meta + "</div>" + badge +
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
  else if(act === "rename") startEdit(id, b.closest(".li").querySelector(".li-title"));
  else if(act === "sub"){
    var n;
    change(function(){ n = addTask(p, "Nueva subtarea", id); });
    var row = $("listBody").querySelector('.li[data-id="' + n.id + '"]');
    if(row){ row.scrollIntoView({ block: "nearest" }); startEdit(n.id, row.querySelector(".li-title")); }
  }
  else if(act === "del"){
    var k = dependents(p, id).length;
    if(k && !confirm("«" + t.title + "» tiene " + k + " subtarea(s). Se borra solo esta tarea y sus subtareas quedan sueltas. ¿Seguir?")) return;
    sel = { task: id }; deleteSelected();
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

$("listAdd").addEventListener("submit", function(e){
  e.preventDefault();
  var p = proj(), input = $("listNew"), title = input.value.replace(/\s+/g, " ").trim();
  if(!p || !title) return;
  var from = $("listAfter").value;
  change(function(){ addTask(p, title, from && byId(p, from) ? from : null); });
  input.value = "";
  input.focus();
});

$("modeSeg").addEventListener("click", function(e){
  var b = e.target.closest("[data-mode]"); if(!b || b.dataset.mode === state.mode) return;
  state.mode = b.dataset.mode;
  save();
  renderAll();
});

// ---------- panel lateral ----------
// Desplegable de proyectos de la barra de arriba (lo principal en el celular).
function renderProjectPick(){
  var pick = $("projectPick");
  var list = state.projects.slice().sort(function(a, b){ return b.updated - a.updated; });
  pick.innerHTML = list.map(function(p){
    var pending = p.tasks.filter(function(t){ return t.status !== "done"; }).length;
    return '<option value="' + p.id + '">' + esc(p.name) + (pending ? " · " + pending : " ✓") + "</option>";
  }).join("") + '<option value="__new">＋ nuevo proyecto…</option>';
  pick.value = state.current || "__new";
}
$("projectPick").addEventListener("change", function(e){
  var v = e.target.value;
  if(v === "__new"){ if(!newProject()) renderProjectPick(); return; }
  state.current = v; sel = null; save(); renderAll();
});

function newProject(){
  var name = prompt("Nombre del proyecto", "Nuevo proyecto");
  if(!name || !name.trim()) return false;
  change(function(){
    var p = newProjectObj(name.trim());
    state.projects.push(p);
    state.current = p.id;
    sel = null;
  });
  closeSideMobile();
  return true;
}
$("newProject").addEventListener("click", newProject);

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

$("filter").addEventListener("change", function(e){ state.filter = e.target.value; save(); renderProjects(); });
$("sort").addEventListener("change", function(e){ state.sort = e.target.value; save(); renderProjects(); });
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

$("export").addEventListener("click", function(){
  var blob = new Blob([JSON.stringify({ projects: state.projects }, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "planes-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
});
$("import").addEventListener("click", function(){ $("importFile").click(); });
$("importFile").addEventListener("change", function(e){
  var f = e.target.files[0]; if(!f) return;
  f.text().then(function(txt){
    var o = JSON.parse(txt);
    if(!o || !Array.isArray(o.projects)) throw new Error("formato");
    var have = {};
    state.projects.forEach(function(p){ have[p.id] = 1; });
    var added = o.projects.filter(function(p){ return p && p.id && Array.isArray(p.tasks) && Array.isArray(p.deps) && !have[p.id]; });
    if(!added.length){ toast("No hay proyectos nuevos en ese archivo"); return; }
    change(function(){
      added.forEach(function(p){ p.view = p.view || { x: 60, y: 120, z: 1 }; state.projects.push(p); });
      state.current = added[0].id;
    });
    toast(added.length + " proyecto(s) importado(s)");
  }).catch(function(){ toast("No se pudo leer el archivo"); });
  e.target.value = "";
});

function closeSideMobile(){ $("side").classList.remove("open"); }
$("openSide").addEventListener("click", function(){ $("side").classList.add("open"); });
$("closeSide").addEventListener("click", closeSideMobile);

window.addEventListener("storage", function(e){
  if(e.key === KEY){ state = load(); sel = null; renderAll(); }
});

renderAll();
})();
