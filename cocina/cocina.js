// Cocina: planificador de comidas por día, stock de la casa y recetas (bases por tanda + platos).
// Con Supabase configurado (../config.js) los datos se guardan en la cuenta y se sincronizan
// entre dispositivos; sin él, quedan solo en este navegador (localStorage).
(function(){
"use strict";
var KEY = "cocina-v1";
var storeKey = KEY;       // con cuenta: una copia local por usuario (KEY + ":" + id)
var $ = function(id){ return document.getElementById(id); };
var PLACES = ["Freezer", "Heladera", "Verduras", "Alacena", "Otros"];
var PLACE_C = { Freezer: "#56d4c4", Heladera: "#58a6ff", Verduras: "#3fb950", Alacena: "#e3c341", Otros: "#8b949e" };
var UNIT_OPTS = ["u", "g", "kg", "ml", "l", "porc.", "paquete", "diente", "taza", "lata"];
var SLOTS = [{ id: "a", name: "Almuerzo" }, { id: "c", name: "Cena" }];
var DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
var MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// ---------- utilidades ----------
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return "&#" + c.charCodeAt(0) + ";"; }); }
function norm(s){ return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
// Para comparar nombres: sin tildes, sin mayúsculas y sin plural («Huevos» = «huevo»).
function nkey(s){ return norm(s).split(/\s+/).map(function(w){ return w.length > 3 ? w.replace(/es$/, "").replace(/s$/, "") : w; }).join(" "); }
function num(n){ var r = Math.round(n * 100) / 100; return String(r).replace(".", ","); }
var PARSE_UNITS = { g: "g", gr: "g", kg: "kg", ml: "ml", l: "l", lt: "l", taza: "taza", tazas: "taza", diente: "diente", dientes: "diente", paquete: "paquete", paquetes: "paquete", lata: "lata", latas: "lata", porc: "porc.", "porc.": "porc." };
// «200 g soja» → {qty:200, unit:"g", name:"soja"} · «2 cebolla» → {qty:2, unit:"u"} · «sal» → {qty:null} (a gusto)
function parseLine(s){
  s = String(s).trim();
  var m = s.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(.*)$/);
  if(!m) return { qty: null, unit: "", name: s };
  var q = m[1].indexOf("/") > 0 ? m[1].split("/")[0] / m[1].split("/")[1] : +m[1].replace(",", ".");
  var w = m[2].trim().split(/\s+/), unit = "u";
  if(w.length > 1 && PARSE_UNITS[norm(w[0])]){ unit = PARSE_UNITS[norm(w.shift())]; }
  return { qty: q, unit: unit, name: w.join(" ").replace(/^de\s+/i, "") };
}
function lineText(i){ return i.qty == null ? i.name : num(i.qty) + " " + (i.unit && i.unit !== "u" ? i.unit + " " : "") + i.name; }
function qtyText(q, unit){
  if(unit === "g" && q >= 1000) return num(q / 1000) + " kg";
  if(unit === "ml" && q >= 1000) return num(q / 1000) + " l";
  if(unit === "u" || !unit) return num(q);
  var pl = { diente: "dientes", taza: "tazas", paquete: "paquetes", lata: "latas" };
  return num(q) + " " + (q !== 1 && pl[unit] ? pl[unit] : unit);
}
// Convierte entre unidades compatibles (g↔kg, ml↔l); null si no se puede.
var FAM = { g: ["m", 1], kg: ["m", 1000], ml: ["v", 1], l: ["v", 1000] };
function conv(q, from, to){
  from = from || "u"; to = to || "u";
  if(from === to) return q;
  if(FAM[from] && FAM[to] && FAM[from][0] === FAM[to][0]) return q * FAM[from][1] / FAM[to][1];
  return null;
}
function stepOf(unit){ return unit === "g" || unit === "ml" ? 100 : unit === "kg" || unit === "l" ? 0.5 : 1; }

// ---------- fechas ----------
function today(){ var t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function key(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addD(d, n){ var x = new Date(d); x.setDate(x.getDate() + n); return x; }
function parseK(k){ var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }

// ---------- datos iniciales: tus recetas, con el stock en 0 para completar ----------
// Los rendimientos que en la nota decían «x» son estimados y quedan marcados «⚠ revisar».
var PLACE_OF = { huevo: "Heladera", queso: "Heladera", mayonesa: "Heladera", panqueque: "Heladera",
  cebolla: "Verduras", zanahoria: "Verduras", zucchini: "Verduras", ajo: "Verduras", morron: "Verduras", boniato: "Verduras",
  papa: "Verduras", ensalada: "Verduras", palta: "Verduras" };
function seed(){
  var ing = function(l){ return l.map(parseLine); };
  var B = {
    wok:   { name: "Verduras al wok", yields: 6, portion: "250 g", check: true,
      ing: ing(["2 cebolla", "2 zanahoria", "2 zucchini", "2 diente ajo", "salsa de soja", "sal", "pimienta"]),
      steps: ["Cortar todo en tiras", "Saltear todo junto hasta que esté al dente", "Agregar salsa de soja", "Dejar enfriar", "Porcionar de a 250 g"] },
    taco:  { name: "Masa de tacos", yields: 12, portion: "1 tapa", check: true,
      ing: ing(["500 g harina", "60 ml aceite", "10 g sal"]), steps: ["Mezclar todo junto con agua", "Separar en bollitos", "Aplastar", "Cocinar al horno"] },
    arroz: { name: "Arroz cocido", yields: 3, portion: "150 g", check: true,
      ing: ing(["1 taza arroz"]), steps: ["Cocinar 1 taza de arroz con 2 de agua al máximo", "Cortar cocción", "Porcionar"] },
    soja:  { name: "Salsa sojanesa", yields: 4, portion: "tupper mediano", check: true,
      ing: ing(["1 l salsa de tomate", "1 cebolla", "2 diente ajo", "1 morrón", "200 g soja texturizada", "orégano", "sal", "pimienta"]),
      steps: ["Picar cebolla, ajo y morrón", "Saltear con orégano, sal y pimienta", "Agregar agua, salsa y soja", "Dejar enfriar", "Porcionar en tuppers medianos"] },
    hamb:  { name: "Hamburguesas", yields: 10, portion: "1 hamburguesa", check: true, ing: [], steps: [] },
    rell:  { name: "Relleno de verduras", yields: 6, portion: "150 g", check: true,
      ing: ing(["1 boniato", "2 zanahoria", "1 cebolla", "2 diente ajo", "orégano", "sal", "pimienta"]),
      steps: ["Picar todo en la procesadora", "Saltear", "Dejar enfriar", "Separar de a 150 g", "Congelar"] }
  };
  var bases = [], id = {};
  Object.keys(B).forEach(function(k){ B[k].id = uid(); id[k] = B[k].id; bases.push(B[k]); });
  function d(name, group, bs, fresh){ var o = { id: uid(), name: name, group: group, bases: {}, fresh: ing(fresh) }; Object.keys(bs).forEach(function(k){ o.bases[id[k]] = bs[k]; }); return o; }
  var dishes = [
    d("Hamburguesas con puré", "Hamburguesas", { hamb: 2 }, ["1 huevo", "200 g papa"]),
    d("Hamburguesas con ensalada", "Hamburguesas", { hamb: 2 }, ["1 huevo", "1 ensalada"]),
    d("Hamburguesas al pan", "Hamburguesas", { hamb: 2 }, ["2 pan de hamburguesa", "1 huevo", "1 ensalada", "mayonesa"]),
    d("Sandwich de relleno", "Relleno", { rell: 1 }, ["4 pan de molde", "1 huevo", "mayonesa"]),
    d("Omelette de relleno", "Relleno", { rell: 1 }, ["2 huevo", "1 ensalada"]),
    d("Canelones de relleno", "Relleno", { rell: 1 }, ["2 panqueque", "150 ml salsa de tomate"]),
    d("Tacos de relleno", "Relleno", { rell: 1, taco: 2 }, ["mayonesa"]),
    d("Quesadillas", "Quesadillas", { taco: 2 }, ["50 g queso", "0.5 palta"]),
    d("Arroz al wok", "Wok", { arroz: 1, wok: 1 }, ["1 huevo", "salsa de soja"]),
    d("Fideos al wok", "Wok", { wok: 1 }, ["100 g fideos", "1 huevo", "salsa de soja"]),
    d("Ramen", "Wok", { wok: 1 }, ["1 paquete ramen", "1 huevo"]),
    d("Sopa de arroz", "Sopas", { arroz: 1 }, ["1 caldo de verdura", "1 huevo"]),
    d("Fideos con sojanesa", "Fideos", { soja: 0.5 }, ["100 g fideos"])
  ];
  var stock = [], seen = {};
  bases.forEach(function(b){ stock.push({ id: uid(), name: b.name, qty: 0, unit: "porc.", place: "Freezer", base: b.id }); });
  function add(i){
    var k = nkey(i.name); if(seen[k]) return; seen[k] = 1;
    var nm = i.name.charAt(0).toUpperCase() + i.name.slice(1);
    stock.push({ id: uid(), name: nm, qty: 0, unit: i.qty == null ? "u" : i.unit || "u", place: PLACE_OF[norm(i.name).split(" ")[0]] || "Alacena" });
  }
  bases.forEach(function(b){ b.ing.forEach(add); });
  dishes.forEach(function(x){ x.fresh.forEach(add); });
  return { persons: 2, bases: bases, dishes: dishes, stock: stock, plan: {} };
}
function fix(s){
  s = s && typeof s === "object" ? s : {};
  return { persons: s.persons > 0 ? s.persons : 2, bases: Array.isArray(s.bases) ? s.bases : [], dishes: Array.isArray(s.dishes) ? s.dishes : [],
    stock: Array.isArray(s.stock) ? s.stock : [], plan: s.plan && typeof s.plan === "object" ? s.plan : {} };
}

var S = load();
var ui = { tab: "week", week: today(), open: null, rq: "", rf: "", sq: "", sp: "", slot: null };
try { ui.tab = localStorage.getItem(KEY + ":tab") || "week"; } catch(e){}
function readStore(k){ try { var s = JSON.parse(localStorage.getItem(k)); if(s && Array.isArray(s.stock)) return fix(s); } catch(e){} return null; }
function load(){ return readStore(storeKey) || seed(); }
function save(){
  if(REMOTE && !user) return;   // sin sesión no se guarda nada (evita pisar datos)
  try { localStorage.setItem(storeKey, JSON.stringify(S)); } catch(e){}
  if(user) schedulePush();
}
function base(id){ for(var i = 0; i < S.bases.length; i++) if(S.bases[i].id === id) return S.bases[i]; return null; }
function dish(id){ for(var i = 0; i < S.dishes.length; i++) if(S.dishes[i].id === id) return S.dishes[i]; return null; }
function item(id){ for(var i = 0; i < S.stock.length; i++) if(S.stock[i].id === id) return S.stock[i]; return null; }
function baseItem(bid){ for(var i = 0; i < S.stock.length; i++) if(S.stock[i].base === bid) return S.stock[i]; return null; }
function itemByName(n){ var k = nkey(n); for(var i = 0; i < S.stock.length; i++) if(!S.stock[i].base && nkey(S.stock[i].name) === k) return S.stock[i]; return null; }
function ensureBaseItems(){
  S.bases.forEach(function(b){
    var it = baseItem(b.id);
    if(!it) S.stock.unshift({ id: uid(), name: b.name, qty: 0, unit: "porc.", place: "Freezer", base: b.id });
    else it.name = b.name;
  });
}

// ---------- lo que pide un plato y si alcanza el stock ----------
// Devuelve [{name, need, unit, it, taste, isBase}] para las personas actuales.
function reqs(d){
  var out = [];
  Object.keys(d.bases).forEach(function(bid){ var b = base(bid); if(b) out.push({ name: b.name, need: d.bases[bid] * S.persons, unit: "porc.", it: baseItem(bid), isBase: true }); });
  d.fresh.forEach(function(i){ out.push({ name: i.name, need: i.qty == null ? null : i.qty * S.persons, unit: i.unit, it: itemByName(i.name), taste: i.qty == null }); });
  return out;
}
// avail: { itemId: cantidad en la unidad del ítem }
function snapshot(){ var a = {}; S.stock.forEach(function(i){ a[i.id] = i.qty; }); return a; }
function check(d, avail){
  var miss = [];
  reqs(d).forEach(function(r){
    if(r.taste){ if(!r.it || !(avail[r.it.id] > 0)) miss.push(r.name); return; }
    if(!r.it){ miss.push(r.name); return; }
    var need = conv(r.need, r.unit, r.it.unit);
    var have = avail[r.it.id] || 0;
    if(need == null ? have <= 0 : have + 1e-9 < need) miss.push(r.name);
  });
  return miss;
}
function consume(d, avail){
  reqs(d).forEach(function(r){
    if(r.taste || !r.it) return;
    var need = conv(r.need, r.unit, r.it.unit); if(need == null) return;
    avail[r.it.id] = Math.max(0, (avail[r.it.id] || 0) - need);
  });
}
// Recorre lo planeado desde hoy en orden: cada comida usa lo que dejan las anteriores.
function plannedKeys(){
  var t = key(today());
  return Object.keys(S.plan).filter(function(k){ var p = S.plan[k]; return p && !p.eaten && dish(p.dish) && k.split("|")[0] >= t; }).sort();
}
function simulate(skip){
  var avail = snapshot(), res = {};
  plannedKeys().forEach(function(k){
    if(k === skip) return;
    var d = dish(S.plan[k].dish);
    res[k] = check(d, avail);
    consume(d, avail);
  });
  return { res: res, avail: avail };
}
function usedBy(it){
  if(it.base) return S.dishes.filter(function(d){ return d.bases[it.base]; }).map(function(d){ return d.name; });
  var k = nkey(it.name), out = [];
  S.bases.forEach(function(b){ if(b.ing.some(function(i){ return nkey(i.name) === k; })) out.push(b.name); });
  S.dishes.forEach(function(d){ if(d.fresh.some(function(i){ return nkey(i.name) === k; })) out.push(d.name); });
  return out;
}

// ---------- dibujo ----------
function render(){
  ensureBaseItems();
  Array.prototype.forEach.call($("tabs").children, function(b){ b.classList.toggle("on", b.dataset.t === ui.tab); });
  ["week", "stock", "recipes"].forEach(function(t){ $("v-" + t).hidden = t !== ui.tab; });
  var bad = 0, sim = simulate();
  Object.keys(sim.res).forEach(function(k){ if(sim.res[k].length) bad++; });
  $("tabs").children[0].innerHTML = "Semana" + (bad ? "<b>" + bad + "</b>" : "");
  var fab = $("fab");
  fab.hidden = ui.tab !== "stock";
  fab.textContent = "+ agregar al stock";
  ({ week: renderWeek, stock: renderStock, recipes: renderRecipes })[ui.tab](sim);
}

function renderWeek(sim){
  var m = ui.week, end = addD(m, 6), tk = key(today());
  var h = '<div class="wk-top"><button class="btn" data-wk="-1" aria-label="Semana anterior">‹</button>' +
    '<button class="lbl" data-wk="0" title="Volver a hoy">' + (key(m) === tk ? "Próximos 7 días" : m.getDate() + " " + MES[m.getMonth()] + " – " + end.getDate() + " " + MES[end.getMonth()]) +
    "<small>" + (key(m) === tk ? "desde hoy, " + m.getDate() + " " + MES[m.getMonth()] + " al " + end.getDate() + " " + MES[end.getMonth()] : "tocá para volver a hoy") + "</small></button>" +
    '<button class="btn" data-wk="1" aria-label="Semana siguiente">›</button></div>';
  h += '<div class="wk-bar"><span class="pp">Personas <span class="step"><button data-pp="-1" aria-label="Menos">−</button><span>' + S.persons + '</span><button data-pp="1" aria-label="Más">+</button></span></span>' +
    '<button class="btn" id="randomFill">🎲 completar al azar</button><button class="btn ghost" id="clearWeek">vaciar</button></div>';

  var planned = 0, eaten = 0, short = 0, empty = 0, days = "";
  for(var i = 0; i < 7; i++){
    var d = addD(m, i), dk = key(d), past = dk < tk;
    days += '<div class="day' + (dk === tk ? " today" : "") + (past ? " past" : "") + '"><div class="day-h"><b>' + DAYS[(d.getDay() + 6) % 7] + "</b><span>" + d.getDate() + " " + MES[d.getMonth()] + "</span>" + (dk === tk ? '<span class="hoy">HOY</span>' : "") + "</div>";
    SLOTS.forEach(function(sl){
      var k = dk + "|" + sl.id, p = S.plan[k], ds = p && dish(p.dish);
      if(ds) planned++; else if(!past) empty++;
      if(p && p.eaten) eaten++;
      var miss = sim.res[k];
      if(miss && miss.length) short++;
      days += '<div class="slot' + (p && p.eaten ? " eaten" : "") + '"><span class="when">' + sl.name + "</span>";
      if(ds){
        var st = p.eaten ? '<div class="st">✓ comido</div>' : miss ? (miss.length ? '<div class="st bad">⚠ falta: ' + esc(miss.join(", ")) + "</div>" : '<div class="st ok">✓ hay stock</div>') : '<div class="st faint">sin marcar como comido</div>';
        days += '<div class="what" data-slot="' + k + '"><div class="nm">' + esc(ds.name) + "</div>" + st + "</div>" +
          (p.eaten ? '<button class="icon" data-uneat="' + k + '" title="Desmarcar (devuelve al stock)">↶</button>'
                   : '<button class="btn sm" data-eat="' + k + '" title="Descuenta del stock">✓ comí</button>');
      } else {
        days += '<div class="what add" data-slot="' + k + '">＋ elegir</div>' + (past ? "" : '<button class="icon" data-rnd="' + k + '" title="Al azar con lo que hay">🎲</button>');
      }
      days += "</div>";
    });
    days += "</div>";
  }
  h += '<div class="wk-sum"><b>' + planned + "</b> comidas planeadas · <b>" + eaten + "</b> comidas" + (short ? ' · <span style="color:var(--paused)"><b>' + short + "</b> sin stock suficiente</span>" : "") + (empty ? " · " + empty + " libres" : "") + "</div>";
  $("v-week").innerHTML = h + '<div style="margin-top:10px">' + days + "</div>";
}

function renderStock(){
  var q = nkey(ui.sq);
  var list = S.stock.filter(function(i){ return (!ui.sp || i.place === ui.sp) && (!q || nkey(i.name).indexOf(q) >= 0); });
  var zero = S.stock.filter(function(i){ return !(i.qty > 0) && usedBy(i).length; }).length;
  var h = '<div class="search"><input type="search" id="sq" placeholder="Buscar en el stock…" value="' + esc(ui.sq) + '" autocomplete="off"></div>' +
    '<div class="chips" style="margin:10px 0 2px">' + [""].concat(PLACES).map(function(p){
      return '<button class="chip' + (ui.sp === p ? " on" : "") + '" data-sp="' + p + '"' + (p ? ' style="--c:' + PLACE_C[p] + '"' : "") + ">" + (p || "Todo") + "</button>";
    }).join("") + "</div>";
  if(zero) h += '<div class="hint" style="margin-top:8px">⚠ ' + zero + " cosas que usan tus recetas están en 0 (con borde punteado)</div>";
  PLACES.forEach(function(pl){
    var its = list.filter(function(i){ return i.place === pl; });
    if(!its.length) return;
    its.sort(function(a, b){ return (b.base ? 1 : 0) - (a.base ? 1 : 0) || a.name.localeCompare(b.name, "es"); });
    h += '<div class="sec-h" style="--c:' + PLACE_C[pl] + '">' + pl + "<small>" + its.length + "</small></div>";
    its.forEach(function(i){
      var u = usedBy(i);
      h += '<div class="it' + (i.qty > 0 ? "" : " zero") + '"><div class="main" data-item="' + i.id + '"><div class="nm">' + esc(i.name) + (i.base ? ' <span class="tag base">base</span>' : "") + "</div>" +
        '<div class="sub' + (u.length ? " use" : "") + '">' + (u.length ? "en: " + esc(u.join(", ")) : "no se usa en recetas") + "</div></div>" +
        '<span class="step"><button data-q="' + i.id + '" data-d="-1" aria-label="Menos">−</button><span>' + qtyText(i.qty, i.unit) + (i.unit === "u" ? "" : "") + '</span><button data-q="' + i.id + '" data-d="1" aria-label="Más">+</button></span></div>';
    });
  });
  if(!list.length) h += '<div class="empty">' + (S.stock.length ? "Nada con ese filtro." : "El stock está vacío.") + "</div>";
  $("v-stock").innerHTML = h;
}

function reqLine(r, avail){
  var st;
  if(!r.it) st = '<span class="s no">no está en el stock</span>';
  else {
    var have = avail ? avail[r.it.id] : r.it.qty;
    var need = r.need == null ? null : conv(r.need, r.unit, r.it.unit);
    st = r.need == null ? (have > 0 ? '<span class="s ok">✓ hay</span>' : '<span class="s bad">✗ no hay</span>')
      : (need == null ? have > 0 : have + 1e-9 >= need) ? '<span class="s ok">✓ hay ' + qtyText(have, r.it.unit) + "</span>" : '<span class="s bad">✗ hay ' + qtyText(have, r.it.unit) + "</span>";
  }
  return "<li><b>" + (r.need == null ? "a gusto" : qtyText(r.need, r.unit)) + '</b><span class="n">' + esc(r.name) + "</span>" + st + "</li>";
}

function renderRecipes(){
  if(ui.open) return renderRecipe();
  var q = nkey(ui.rq);
  function match(x){ return !q || nkey(x.name + " " + (x.group || "") + " " + (x.ing || x.fresh || []).map(function(i){ return i.name; }).join(" ")).indexOf(q) >= 0; }
  var avail = snapshot();
  var h = '<div class="tools" style="margin-bottom:10px"><button class="btn sm" id="newBase">+ base</button><button class="btn sm" id="newDish">+ plato</button></div>' +
    '<div class="search"><input type="search" id="rq" placeholder="Buscar recetas o ingredientes…" value="' + esc(ui.rq) + '" autocomplete="off"></div>' +
    '<div class="chips" style="margin-top:10px">' + [["", "Todo"], ["b", "Bases"], ["d", "Platos"], ["ok", "Con lo que hay"]].map(function(x){
      return '<button class="chip' + (ui.rf === x[0] ? " on" : "") + '" data-rf="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>";
  if(ui.rf === "" || ui.rf === "b"){
    var bs = S.bases.filter(match);
    h += '<div class="sec-h" style="--c:var(--teal)">Bases · se cocinan por tanda</div>';
    h += bs.length ? bs.map(function(b){
      var it = baseItem(b.id);
      return '<div class="row" data-ob="' + b.id + '"><div class="main"><div class="nm">' + esc(b.name) + (b.check ? ' <span class="tag warn">⚠ revisar</span>' : "") +
        '</div><div class="sub"><span>rinde ' + b.yields + " × " + esc(b.portion || "porción") + "</span><span>" + (it && it.qty > 0 ? '<span style="color:var(--done)">' + num(it.qty) + " en stock</span>" : '<span style="color:var(--paused)">0 en stock</span>') + '</span></div></div><span class="go">›</span></div>';
    }).join("") : '<div class="empty">Nada con esa búsqueda.</div>';
  }
  if(ui.rf !== "b"){
    var groups = {};
    S.dishes.filter(match).filter(function(d){ return ui.rf !== "ok" || !check(d, avail).length; }).forEach(function(d){ (groups[d.group || "Otros"] = groups[d.group || "Otros"] || []).push(d); });
    h += '<div class="sec-h">Platos · para ' + S.persons + "</div>";
    var gk = Object.keys(groups).sort(function(a, b){ return a.localeCompare(b, "es"); });
    h += gk.length ? gk.map(function(g){
      return '<div class="pick-g">' + esc(g) + "</div>" + groups[g].map(function(d){
        var miss = check(d, avail);
        return '<div class="row" data-od="' + d.id + '"><div class="main"><div class="nm">' + esc(d.name) + '</div><div class="sub">' +
          (miss.length ? '<span style="color:var(--paused)">falta: ' + esc(miss.join(", ")) + "</span>" : '<span style="color:var(--done)">✓ se puede hacer con lo que hay</span>') +
          '</div></div><span class="go">›</span></div>';
      }).join("");
    }).join("") : '<div class="empty">' + (ui.rf === "ok" ? "Con el stock actual no alcanza para ningún plato." : "Nada con esa búsqueda.") + "</div>";
  }
  $("v-recipes").innerHTML = h;
}

function renderRecipe(){
  var o = ui.open, h = '<div class="d-top"><button class="btn" id="rBack">← volver</button><button class="btn" id="rEdit">✎ editar</button></div><div class="card">';
  if(o.t === "b"){
    var b = base(o.id); if(!b){ ui.open = null; return renderRecipes(); }
    var it = baseItem(b.id), uses = S.dishes.filter(function(d){ return d.bases[b.id]; });
    var rs = b.ing.map(function(i){ return { name: i.name, need: i.qty, unit: i.unit, it: itemByName(i.name), taste: i.qty == null }; });
    h += '<div class="d-title"><h2>' + esc(b.name) + '</h2><span class="tag base">base</span></div>' +
      (b.check ? '<div class="note">⚠ El rendimiento y algunas cantidades son estimados (en tu nota decía «x»). Tocá ✎ editar para poner los reales.</div>' : "") +
      '<div class="facts"><div><b>' + b.yields + "</b><span>porciones por tanda</span></div><div><b>" + esc(b.portion || "—") + "</b><span>cada porción</span></div><div><b>" + num(it ? it.qty : 0) + "</b><span>en stock</span></div></div>" +
      '<div class="tools" style="margin:10px 0 2px"><button class="btn primary" id="cookBatch">＋ cociné 1 tanda</button><span class="hint">suma ' + b.yields + " porciones y descuenta los ingredientes</span></div>" +
      '<div class="sec-h" style="--c:var(--teal)">Ingredientes (1 tanda)</div>' +
      (rs.length ? '<ul class="ing">' + rs.map(function(r){ return reqLine(r); }).join("") + "</ul>" : '<div class="empty">Sin ingredientes cargados.</div>') +
      '<div class="sec-h" style="--c:var(--teal)">Procedimiento</div>' +
      (b.steps.length ? '<ol class="steps">' + b.steps.map(function(s){ return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : '<div class="empty">Sin pasos cargados.</div>') +
      '<div class="sec-h" style="--c:var(--teal)">Se usa en</div>' +
      (uses.length ? '<div class="can">' + uses.map(function(d){ return "<span>" + esc(d.name) + "</span>"; }).join("") + "</div>" : '<div class="faint">Ningún plato la usa todavía.</div>');
  } else {
    var d = dish(o.id); if(!d){ ui.open = null; return renderRecipes(); }
    var r = reqs(d);
    h += '<div class="d-title"><h2>' + esc(d.name) + '</h2><span class="tag">' + esc(d.group || "plato") + "</span></div>" +
      '<div class="sec-h" style="--c:var(--teal)">Bases · para ' + S.persons + "</div>" +
      (r.some(function(x){ return x.isBase; }) ? '<ul class="ing">' + r.filter(function(x){ return x.isBase; }).map(function(x){ return reqLine(x); }).join("") + "</ul>" : '<div class="faint">No usa bases.</div>') +
      '<div class="sec-h">Otros ingredientes · para ' + S.persons + "</div>" +
      (r.some(function(x){ return !x.isBase; }) ? '<ul class="ing">' + r.filter(function(x){ return !x.isBase; }).map(function(x){ return reqLine(x); }).join("") + "</ul>" : '<div class="faint">Nada más.</div>');
  }
  $("v-recipes").innerHTML = h + "</div>";
}

// ---------- acciones ----------
function toast(m){ var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function(){ t.classList.remove("show"); }, 2400); }
function commit(){ save(); render(); }

// Elige un plato al azar que alcance con lo que queda, evitando repetir mucho.
function randomFor(k, avail, counts, prev){
  var ok = S.dishes.filter(function(d){ return !check(d, avail).length; });
  var varied = ok.filter(function(d){ return (counts[d.id] || 0) < 2 && d.id !== prev; });
  var pool = varied.length ? varied : ok;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function weekKeys(){ var out = []; for(var i = 0; i < 7; i++){ var dk = key(addD(ui.week, i)); SLOTS.forEach(function(s){ out.push(dk + "|" + s.id); }); } return out; }
function fillRandom(){
  var tk = key(today()), avail = simulate().avail, counts = {}, prev = null, put = 0, left = 0;
  weekKeys().forEach(function(k){ var p = S.plan[k]; if(p && dish(p.dish)) counts[p.dish] = (counts[p.dish] || 0) + 1; });
  weekKeys().forEach(function(k){
    var p = S.plan[k];
    if(p && dish(p.dish)){ prev = p.dish; return; }
    if(k.split("|")[0] < tk) return;
    var d = randomFor(k, avail, counts, prev);
    if(!d){ left++; return; }
    S.plan[k] = { dish: d.id }; consume(d, avail); counts[d.id] = (counts[d.id] || 0) + 1; prev = d.id; put++;
  });
  commit();
  toast(put ? "🎲 " + put + (put === 1 ? " comida asignada" : " comidas asignadas") + (left ? " · " + left + " sin stock para nada" : "") : left ? "No alcanza el stock para más comidas" : "No hay huecos libres en estos 7 días");
}
function moveStock(d, sign){
  reqs(d).forEach(function(r){
    if(r.taste || !r.it) return;
    var n = conv(r.need, r.unit, r.it.unit); if(n == null) return;
    r.it.qty = Math.max(0, Math.round((r.it.qty + sign * n) * 1000) / 1000);
  });
}

$("tabs").addEventListener("click", function(e){
  var b = e.target.closest("[data-t]"); if(!b) return;
  ui.tab = b.dataset.t; if(ui.tab !== "recipes") ui.open = null;
  try { localStorage.setItem(KEY + ":tab", ui.tab); } catch(err){}
  render(); window.scrollTo(0, 0);
});

document.addEventListener("click", function(e){
  var t = e.target, x;
  if(t.classList.contains("sheet") || t.closest("[data-close]")) return closeSheets();
  if((x = t.closest("[data-wk]"))){ var n = +x.dataset.wk; ui.week = n ? addD(ui.week, 7 * n) : today(); return render(); }
  if((x = t.closest("[data-pp]"))){ S.persons = Math.max(1, Math.min(12, S.persons + +x.dataset.pp)); return commit(); }
  if((x = t.closest("[data-slot]"))) return openPicker(x.dataset.slot);
  if((x = t.closest("[data-rnd]"))){
    var sim = simulate(), dd = randomFor(x.dataset.rnd, sim.avail, {}, null);
    if(!dd) return toast("Con lo que queda en el stock no alcanza para ningún plato");
    S.plan[x.dataset.rnd] = { dish: dd.id }; commit(); return toast("🎲 " + dd.name);
  }
  if((x = t.closest("[data-eat]"))){
    var p = S.plan[x.dataset.eat], d1 = dish(p.dish), miss = check(d1, snapshot());
    moveStock(d1, -1); p.eaten = true; commit();
    return toast(miss.length ? "✓ Anotado · no alcanzaba: " + miss.join(", ") : "✓ Anotado y descontado del stock");
  }
  if((x = t.closest("[data-uneat]"))){ var p2 = S.plan[x.dataset.uneat]; moveStock(dish(p2.dish), 1); delete p2.eaten; commit(); return toast("↶ Devuelto al stock"); }
  if((x = t.closest("[data-q]"))){ var it = item(x.dataset.q); it.qty = Math.max(0, Math.round((it.qty + +x.dataset.d * stepOf(it.unit)) * 1000) / 1000); return commit(); }
  if((x = t.closest("[data-item]"))) return editItem(item(x.dataset.item));
  if((x = t.closest("[data-sp]"))){ ui.sp = x.dataset.sp; return render(); }
  if((x = t.closest("[data-rf]"))){ ui.rf = x.dataset.rf; return render(); }
  if((x = t.closest("[data-ob]"))){ ui.open = { t: "b", id: x.dataset.ob }; render(); return window.scrollTo(0, 0); }
  if((x = t.closest("[data-od]"))){ ui.open = { t: "d", id: x.dataset.od }; render(); return window.scrollTo(0, 0); }
  if((x = t.closest("[data-pick]"))){ S.plan[ui.slot] = { dish: x.dataset.pick }; closeSheets(); return commit(); }
  if((x = t.closest("[data-place]"))){ editPlace = x.dataset.place; return paintPlaces(); }
  switch(t.id){
    case "randomFill": return fillRandom();
    case "clearWeek":
      if(confirm("¿Vaciar las comidas no comidas de estos 7 días?")){ weekKeys().forEach(function(k){ if(S.plan[k] && !S.plan[k].eaten) delete S.plan[k]; }); commit(); }
      return;
    case "pickRandom":
      var sm = simulate(ui.slot), dr = randomFor(ui.slot, sm.avail, {}, S.plan[ui.slot] && S.plan[ui.slot].dish);
      if(!dr) return toast("Con lo que queda no alcanza para ningún plato");
      S.plan[ui.slot] = { dish: dr.id }; closeSheets(); commit(); return toast("🎲 " + dr.name);
    case "pickClear": delete S.plan[ui.slot]; closeSheets(); return commit();
    case "cookBatch":
      var b = base(ui.open.id), bi = baseItem(b.id), lack = [];
      b.ing.forEach(function(i){
        if(i.qty == null) return;
        var s = itemByName(i.name); if(!s){ lack.push(i.name); return; }
        var n = conv(i.qty, i.unit, s.unit); if(n == null) return;
        if(s.qty + 1e-9 < n) lack.push(i.name);
        s.qty = Math.max(0, Math.round((s.qty - n) * 1000) / 1000);
      });
      bi.qty += b.yields; commit();
      return toast("＋" + b.yields + " porciones de " + b.name + (lack.length ? " · no alcanzaba: " + lack.join(", ") : ""));
    case "newBase": return editBase(null);
    case "newDish": return editDish(null);
    case "rBack": ui.open = null; return render();
    case "rEdit": return ui.open.t === "b" ? editBase(base(ui.open.id)) : editDish(dish(ui.open.id));
  }
});
function liveSearch(id, field, fn){
  document.addEventListener("input", function(e){
    if(e.target.id !== id) return;
    ui[field] = e.target.value; var pos = e.target.selectionStart; fn(); var i = $(id); i.focus(); i.setSelectionRange(pos, pos);
  });
}
liveSearch("rq", "rq", renderRecipes);
liveSearch("sq", "sq", renderStock);
$("fab").addEventListener("click", function(){ editItem(null); });
function sheetOpen(){ return ["pickSheet", "itemSheet", "baseSheet", "dishSheet"].some(function(id){ return !$(id).hidden; }); }

// ---------- hojas ----------
var editing = null, editPlace = "Heladera";
function closeSheets(){ ["pickSheet", "itemSheet", "baseSheet", "dishSheet"].forEach(function(id){ $(id).hidden = true; }); editing = null; }
document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeSheets(); });

function openPicker(k){
  ui.slot = k;
  var parts = k.split("|"), d = parseK(parts[0]);
  $("pickT").textContent = DAYS[(d.getDay() + 6) % 7] + " " + d.getDate() + " · " + (parts[1] === "a" ? "almuerzo" : "cena");
  var cur = S.plan[k] && S.plan[k].dish;
  $("pickClear").hidden = !cur;
  var avail = simulate(k).avail, groups = {};
  S.dishes.forEach(function(x){ (groups[x.group || "Otros"] = groups[x.group || "Otros"] || []).push(x); });
  $("pickList").innerHTML = '<div class="hint">Verde = alcanza con el stock, contando lo que ya planeaste para los otros días.</div>' +
    Object.keys(groups).sort(function(a, b){ return a.localeCompare(b, "es"); }).map(function(g){
      return '<div class="pick-g">' + esc(g) + "</div>" + groups[g].map(function(x){
        var miss = check(x, avail);
        return '<div class="pick' + (x.id === cur ? " cur" : "") + (miss.length ? " nope" : "") + '" data-pick="' + x.id + '"><div class="main"><span>' + esc(x.name) + "</span>" +
          (miss.length ? '<small class="bad">falta: ' + esc(miss.join(", ")) + "</small>" : '<small class="ok">✓ alcanza</small>') + "</div></div>";
      }).join("");
    }).join("");
  $("pickSheet").hidden = false;
}

function paintPlaces(){
  $("iPlace").innerHTML = PLACES.map(function(p){ return '<button type="button" class="chip' + (p === editPlace ? " on" : "") + '" data-place="' + p + '" style="--c:' + PLACE_C[p] + '">' + p + "</button>"; }).join("");
}
function editItem(it){
  editing = it || null;
  $("iT").textContent = it ? (it.base ? "Porciones de " + it.name : "Editar") : "Agregar al stock";
  $("iName").value = it ? it.name : ""; $("iName").disabled = !!(it && it.base);
  $("iQty").value = it ? it.qty : "";
  $("iUnit").innerHTML = UNIT_OPTS.map(function(u){ return "<option>" + u + "</option>"; }).join("");
  $("iUnit").value = it ? it.unit : "u"; $("iUnit").disabled = !!(it && it.base);
  editPlace = it ? it.place : (ui.sp || "Heladera"); paintPlaces();
  // Sugerencias: ingredientes de las recetas que todavía no están en el stock.
  var names = {};
  S.bases.forEach(function(b){ b.ing.forEach(function(i){ names[nkey(i.name)] = i.name; }); });
  S.dishes.forEach(function(d){ d.fresh.forEach(function(i){ names[nkey(i.name)] = i.name; }); });
  $("iNames").innerHTML = Object.keys(names).filter(function(k){ return !itemByName(names[k]); }).map(function(k){ return '<option value="' + esc(names[k]) + '">'; }).join("");
  var u = it ? usedBy(it) : [];
  $("iUse").textContent = it ? (u.length ? "Se usa en: " + u.join(", ") : "No se usa en ninguna receta (no pasa nada, queda como stock de la casa).") : "Si el nombre coincide con un ingrediente de tus recetas, se conecta solo.";
  $("iDel").hidden = !it || !!it.base; $("iErr").textContent = "";
  $("itemSheet").hidden = false;
  if(!it) setTimeout(function(){ if(!$("itemSheet").contains(document.activeElement)) $("iName").focus(); }, 30);
}
$("iSave").addEventListener("click", function(){
  var name = $("iName").value.replace(/\s+/g, " ").trim(), q = +String($("iQty").value).replace(",", ".");
  if(!name){ $("iErr").textContent = "¿Qué es?"; return; }
  if(!(q >= 0)){ $("iErr").textContent = "Poné cuánto hay (puede ser 0)."; return; }
  var dup = itemByName(name);
  if(dup && dup !== editing){ $("iErr").textContent = "«" + dup.name + "» ya está en el stock (" + dup.place + ")."; return; }
  var o = { name: name, qty: q, unit: $("iUnit").value, place: editPlace };
  if(editing){ if(editing.base){ delete o.name; delete o.unit; } Object.assign(editing, o); }
  else { o.id = uid(); S.stock.push(o); }
  var nm = name;
  closeSheets(); commit(); toast("✓ " + nm);
});
$("iDel").addEventListener("click", function(){
  if(!editing || !confirm("¿Sacar «" + editing.name + "» del stock?")) return;
  var id = editing.id; S.stock = S.stock.filter(function(i){ return i.id !== id; }); closeSheets(); commit();
});

function editBase(b){
  editing = b || null;
  $("bT").textContent = b ? "Editar base" : "Nueva base";
  $("bName").value = b ? b.name : ""; $("bYield").value = b ? b.yields : 4; $("bPortion").value = b ? b.portion : "";
  $("bIng").value = b ? b.ing.map(lineText).join("\n") : ""; $("bSteps").value = b ? b.steps.join("\n") : "";
  $("bDel").hidden = !b; $("bErr").textContent = "";
  $("baseSheet").hidden = false;
}
$("bSave").addEventListener("click", function(){
  var name = $("bName").value.trim(), y = Math.round(+$("bYield").value);
  if(!name){ $("bErr").textContent = "Poné un nombre."; return; }
  if(!(y >= 1)){ $("bErr").textContent = "¿Cuántas porciones rinde una tanda?"; return; }
  var o = { name: name, yields: y, portion: $("bPortion").value.trim(),
    ing: $("bIng").value.split("\n").map(function(s){ return s.trim(); }).filter(Boolean).map(parseLine),
    steps: $("bSteps").value.split("\n").map(function(s){ return s.replace(/^\s*(\d+[.)]|-)\s*/, "").trim(); }).filter(Boolean), check: false };
  if(editing) Object.assign(editing, o); else { o.id = uid(); S.bases.push(o); }
  var id = editing ? editing.id : o.id;
  closeSheets(); ui.tab = "recipes"; ui.open = { t: "b", id: id }; commit(); toast("✓ Guardado");
});
$("bDel").addEventListener("click", function(){
  if(!editing || !confirm("¿Borrar «" + editing.name + "»? Sale también del stock y de los platos que la usan.")) return;
  var id = editing.id;
  S.bases = S.bases.filter(function(b){ return b.id !== id; });
  S.stock = S.stock.filter(function(i){ return i.base !== id; });
  S.dishes.forEach(function(d){ delete d.bases[id]; });
  closeSheets(); ui.open = null; commit();
});

function editDish(d){
  editing = d || null;
  $("dT").textContent = d ? "Editar plato" : "Nuevo plato";
  $("dName").value = d ? d.name : ""; $("dGroup").value = d ? d.group : "";
  $("dBases").innerHTML = S.bases.map(function(b){
    return '<div class="bq"><label for="q-' + b.id + '">' + esc(b.name) + ' <span class="faint">(' + esc(b.portion || "porción") + ')</span></label><input id="q-' + b.id + '" data-bq="' + b.id + '" type="number" min="0" step="0.5" inputmode="decimal" value="' + (d && d.bases[b.id] ? d.bases[b.id] : "") + '" placeholder="0"></div>';
  }).join("");
  $("dFresh").value = d ? d.fresh.map(lineText).join("\n") : "";
  $("dDel").hidden = !d; $("dErr").textContent = "";
  $("dishSheet").hidden = false;
}
$("dSave").addEventListener("click", function(){
  var name = $("dName").value.trim();
  if(!name){ $("dErr").textContent = "Poné un nombre."; return; }
  var bs = {};
  Array.prototype.forEach.call(document.querySelectorAll("[data-bq]"), function(i){ var v = +i.value.replace(",", "."); if(v > 0) bs[i.dataset.bq] = v; });
  var o = { name: name, group: $("dGroup").value.trim(), bases: bs,
    fresh: $("dFresh").value.split("\n").map(function(s){ return s.trim(); }).filter(Boolean).map(parseLine) };
  if(editing) Object.assign(editing, o); else { o.id = uid(); S.dishes.push(o); }
  var id = editing ? editing.id : o.id;
  closeSheets(); ui.tab = "recipes"; ui.open = { t: "d", id: id }; commit(); toast("✓ Guardado");
});
$("dDel").addEventListener("click", function(){
  if(!editing || !confirm("¿Borrar «" + editing.name + "»? Sale también de los días donde estaba.")) return;
  var id = editing.id;
  S.dishes = S.dishes.filter(function(d){ return d.id !== id; });
  Object.keys(S.plan).forEach(function(k){ if(S.plan[k].dish === id) delete S.plan[k]; });
  closeSheets(); ui.open = null; commit();
});

// ---------- cuenta y sincronización (Supabase) ----------
// Una fila por persona en cocina_datos (ver supabase/8-cocina.sql) con { persons, bases, dishes, stock, plan }.
// La pestaña elegida y los filtros quedan en el navegador.
var CFG = window.APP_CONFIG || {};
var REMOTE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
var sb = (REMOTE && window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey)
  : null;
var user = null;
var sync = { at: null, timer: null, busy: false, pending: false };

function setSync(text){ $("syncState").textContent = text; }
function applyData(d){
  S = fix(d);
  try { localStorage.setItem(storeKey, JSON.stringify(S)); } catch(e){}
  render();
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
  sb.from("cocina_datos").upsert({ user_id: user.id, data: S })
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
  if(!user || sync.pending || sync.busy || sheetOpen()) return;
  sb.from("cocina_datos").select("updated_at").eq("user_id", user.id).maybeSingle().then(function(r){
    if(r.error || !r.data || r.data.updated_at === sync.at) return;
    return sb.from("cocina_datos").select("data, updated_at").eq("user_id", user.id).single().then(function(r2){
      if(r2.error || sync.pending || sync.busy || sheetOpen()) return;
      sync.at = r2.data.updated_at;
      applyData(r2.data.data);
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
    S = fix({}); closeSheets(); render();
    return;
  }
  $("accountEmail").textContent = user.email || "";
  storeKey = KEY + ":" + user.id;
  var cached = readStore(storeKey);
  if(cached) applyData(cached);
  setSync("sincronizando…");
  sb.from("cocina_datos").select("data, updated_at").eq("user_id", user.id).maybeSingle().then(function(r){
    if(r.error) throw r.error;
    if(r.data){
      sync.at = r.data.updated_at;
      applyData(r.data.data);
      setSync("guardado ✓");
      return;
    }
    // Primera vez con esta cuenta: se suben tus recetas iniciales (o lo que haya en este navegador).
    applyData(cached || readStore(KEY) || seed());
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
  if((sync.pending || sync.busy) && !confirm("Hay cambios que todavía no se subieron. Si salís ahora se pierden. ¿Salir igual?")) return;
  sb.auth.signOut();
});
window.addEventListener("storage", function(e){
  if(e.key !== storeKey || sheetOpen()) return;
  var s = readStore(storeKey); if(s){ S = s; render(); }
});

render();

if(REMOTE){
  if(!sb){
    $("auth").hidden = false;
    authMsg("No se pudo cargar Supabase. Revisá tu conexión y recargá la página.");
    $("signInBtn").disabled = $("signUpBtn").disabled = true;
  } else {
    // Mientras se sabe si hay sesión, no mostrar datos locales de nadie.
    S = fix({}); render();
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
