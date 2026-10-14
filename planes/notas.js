// Notas con formato, compartidas por todo Planes: las notas de las tareas (Mapa y Lista),
// las de los nodos de Aprender y la vista Notas usan el mismo formato, la misma barra para
// escribir y la misma ventana.
// Formato: # título · - lista · 1. numerada · - [ ] tarea (se tilda tocándola) · **negrita** · `código` · links.
(function(){
"use strict";

var $ = function(id){ return document.getElementById(id); };
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return "&#" + c.charCodeAt(0) + ";"; }); }

var CHECK = /^(\s*)[-*•]\s+\[( |x|X)\]\s?(.*)$/;

function inline(s){
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
// HTML del texto. Con checkable, las tareas son botones con el número de línea (data-ln) para tildarlas.
function format(b, checkable){
  var out = "", list = null;
  function close(){ if(list){ out += "</" + (list === "check" ? "ul" : list) + ">"; list = null; } }
  String(b || "").split("\n").forEach(function(line, i){
    var m;
    if((m = line.match(CHECK))){
      if(list !== "check"){ close(); out += '<ul class="nt-check">'; list = "check"; }
      var done = m[2] !== " ";
      out += '<li class="' + (done ? "done" : "") + '">' +
        (checkable ? '<button type="button" class="nt-box" data-ln="' + i + '" aria-pressed="' + done + '" aria-label="' + (done ? "Destildar" : "Tildar") + '">' + (done ? "✓" : "") + "</button>"
                   : '<span class="nt-box">' + (done ? "✓" : "") + "</span>") +
        "<span>" + inline(m[3]) + "</span></li>";
    }
    else if((m = line.match(/^\s*(#{1,3})\s+(.*)$/))){ close(); out += '<div class="nt-h' + m[1].length + '">' + inline(m[2]) + "</div>"; }
    else if((m = line.match(/^\s*[-*•]\s+(.*)$/))){ if(list !== "ul"){ close(); out += "<ul>"; list = "ul"; } out += "<li>" + inline(m[1]) + "</li>"; }
    else if((m = line.match(/^\s*\d+[.)]\s+(.*)$/))){ if(list !== "ol"){ close(); out += "<ol>"; list = "ol"; } out += "<li>" + inline(m[1]) + "</li>"; }
    else if(!line.trim()){ close(); out += '<div class="nt-gap"></div>'; }
    else { close(); out += "<p>" + inline(line) + "</p>"; }
  });
  close();
  return out;
}
// Tareas del texto: { done, total }.
function tasks(b){
  var r = { done: 0, total: 0 };
  String(b || "").split("\n").forEach(function(l){ var m = l.match(CHECK); if(m){ r.total++; if(m[2] !== " ") r.done++; } });
  return r;
}
// Tilda o destilda la tarea de la línea ln.
function toggle(b, ln){
  var lines = String(b || "").split("\n"), m = lines[ln] && lines[ln].match(CHECK);
  if(!m) return b;
  lines[ln] = lines[ln].replace(/\[( |x|X)\]/, m[2] === " " ? "[x]" : "[ ]");
  return lines.join("\n");
}
// Resumen en una línea, sin marcas de formato.
function preview(b, max){
  max = max || 110;
  var l = String(b || "").split("\n").map(function(x){
    return x.replace(CHECK, function(_, sp, c, t){ return (c === " " ? "☐ " : "☑ ") + t; })
            .replace(/^\s*(#+|[-*•]|\d+[.)])\s+/, "").replace(/[*`]/g, "").trim();
  }).filter(Boolean).join(" · ");
  return l.length > max ? l.slice(0, max) + "…" : l;
}
// Puntito de notas para una card o fila (lleno si hay notas) y, si hay tareas, cuántas van tildadas.
function dot(text, attrs){
  var has = !!(text && text.trim()), t = tasks(text);
  return (t.total ? '<span class="note-prog' + (t.done === t.total ? " all" : "") + '" title="Tareas de las notas">' + t.done + "/" + t.total + "</span>" : "") +
    '<button type="button" class="note-dot' + (has ? " has" : "") + '" ' + (attrs || 'data-act="notes"') +
    ' title="' + (has ? "Ver notas" : "Agregar notas") + '" aria-label="Notas"></button>';
}
function when(ms){
  if(!ms) return "";
  var d = new Date(ms), now = new Date(), M = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var day = d.getDate() + " " + M[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? " " + d.getFullYear() : "");
  return d.toDateString() === now.toDateString() ? "hoy " + d.toTimeString().slice(0, 5) : day;
}

// Barra de formato sobre un textarea: título, lista, tarea, negrita.
function tools(bar, ta){
  bar.innerHTML =
    '<button type="button" data-f="h" title="Título"><b>#</b> título</button>' +
    '<button type="button" data-f="ul" title="Lista">• lista</button>' +
    '<button type="button" data-f="check" title="Tarea para tildar">☐ tarea</button>' +
    '<button type="button" data-f="b" title="Negrita"><b>B</b></button>';
  bar.addEventListener("pointerdown", function(e){ if(e.target.closest("[data-f]")) e.preventDefault(); });   // no sacar el foco del texto
  bar.addEventListener("click", function(e){
    var b = e.target.closest("[data-f]"); if(!b) return;
    apply(ta, b.dataset.f);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function apply(ta, f){
  var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
  if(f === "b"){
    var sel = v.slice(s, e) || "texto";
    ta.value = v.slice(0, s) + "**" + sel + "**" + v.slice(e);
    ta.focus(); ta.setSelectionRange(s + 2, s + 2 + sel.length);
    return;
  }
  var prefix = f === "h" ? "# " : f === "ul" ? "- " : "- [ ] ";
  var a = v.lastIndexOf("\n", s - 1) + 1, z = v.indexOf("\n", e); if(z < 0) z = v.length;
  var strip = /^\s*(#{1,3}\s+|[-*•]\s+\[( |x|X)\]\s?|[-*•]\s+|\d+[.)]\s+)/;
  var block = v.slice(a, z).split("\n");
  var filled = block.filter(function(l){ return l.trim(); });
  var all = filled.length > 0 && filled.every(function(l){ return l.indexOf(prefix) === 0; });
  // Si todas las líneas ya tienen esa marca, se la saca; si no, se la pone (reemplazando otra marca).
  var out = block.map(function(l){
    if(!l.trim() && block.length > 1) return l;
    var rest = l.replace(strip, "");
    return all ? rest : prefix + rest;
  }).join("\n");
  ta.value = v.slice(0, a) + out + v.slice(z);
  var end = a + out.length;
  ta.focus(); ta.setSelectionRange(end, end);
}
// Enter en una línea de lista o de tarea sigue la lista; en una línea vacía de lista, la corta.
function continueLists(ta){
  ta.addEventListener("keydown", function(e){
    if(e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    var v = ta.value, s = ta.selectionStart;
    if(s !== ta.selectionEnd) return;
    var a = v.lastIndexOf("\n", s - 1) + 1, line = v.slice(a, s), m;
    var mark = (m = line.match(/^(\s*[-*•]\s+\[( |x|X)\]\s?)/)) ? m[1].replace(/\[(x|X)\]/, "[ ]")
             : (m = line.match(/^(\s*[-*•]\s+)/)) ? m[1]
             : (m = line.match(/^(\s*)(\d+)([.)]\s+)/)) ? m[1] + (+m[2] + 1) + m[3] : null;
    if(!mark) return;
    e.preventDefault();
    if(!line.replace(/^\s*([-*•]\s+(\[( |x|X)\]\s?)?|\d+[.)]\s+)/, "").trim()){   // ítem vacío: cortar la lista
      ta.value = v.slice(0, a) + v.slice(s); ta.setSelectionRange(a, a);
    } else {
      ta.value = v.slice(0, s) + "\n" + mark + v.slice(ta.selectionEnd);
      var p = s + 1 + mark.length; ta.setSelectionRange(p, p);
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// ---------- ventana de notas (una sola para tareas y nodos) ----------
// open({ title, text, at, save(text) }): se abre leyendo si hay texto, escribiendo si está vacía.
// Al cerrar (listo, ×, Esc o tocando afuera) guarda si cambió.
var cur = null;
function open(o){
  cur = { o: o, text: o.text || "" };
  $("notesTitle").textContent = o.title || "Notas";
  $("notesDlg").hidden = false;
  show(cur.text ? "view" : "edit");
}
function show(mode){
  if(!cur) return;
  cur.mode = mode;
  var t = tasks(cur.text);
  $("notesMeta").textContent = [cur.o.at ? "editada " + when(cur.o.at) : "", t.total ? t.done + " de " + t.total + " tareas" : ""].filter(Boolean).join(" · ");
  $("notesView").hidden = mode !== "view";
  $("notesEdit").hidden = mode !== "edit";
  $("notesMode").textContent = mode === "view" ? "✎ editar" : "👁 ver";
  $("notesMode").hidden = mode === "edit" && !cur.text.trim();
  if(mode === "view"){
    $("notesView").innerHTML = cur.text.trim() ? format(cur.text, true) : '<p class="nt-nobody">Sin notas todavía.</p>';
  } else {
    var ta = $("notesText");
    ta.value = cur.text;
    setTimeout(function(){ ta.focus(); var n = ta.value.length; ta.setSelectionRange(n, n); }, 30);
  }
}
function close(){
  if(!cur) return;
  var c = cur, v = c.text.replace(/\s+$/, "");
  cur = null;
  $("notesDlg").hidden = true;
  if(v !== (c.o.text || "").replace(/\s+$/, "")) c.o.save(v);
}
function isOpen(){ return !!cur; }

function bind(){
  if(!$("notesDlg")) return;
  tools($("notesTools"), $("notesText"));
  continueLists($("notesText"));
  $("notesText").addEventListener("input", function(){ if(cur) cur.text = $("notesText").value; });
  $("notesMode").addEventListener("click", function(){ if(cur) show(cur.mode === "view" ? "edit" : "view"); });
  $("notesView").addEventListener("click", function(e){
    var b = e.target.closest("[data-ln]");
    if(b && cur){ cur.text = toggle(cur.text, +b.dataset.ln); show("view"); return; }
    // Tocar el texto (no un link ni una tarea) pasa a escribir.
    if(cur && !e.target.closest("a") && !getSelection().toString()) show("edit");
  });
  $("notesOk").addEventListener("click", close);
  $("notesClose").addEventListener("click", close);
  $("notesDlg").addEventListener("click", function(e){ if(e.target === e.currentTarget) close(); });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && cur){ e.preventDefault(); close(); } });
  $("notesText").addEventListener("keydown", function(e){ if(e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); close(); } });
}
bind();

window.PlanesNotes = {
  format: format, tasks: tasks, toggle: toggle, preview: preview, dot: dot, when: when,
  tools: tools, continueLists: continueLists,
  open: open, close: close, isOpen: isOpen
};
})();
