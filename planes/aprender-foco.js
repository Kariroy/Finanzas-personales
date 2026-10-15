// Vista foco de Aprender: las cards como bolitas en 3D.
// Muestra un nodo central y solo sus conexiones directas; tocar otra bolita la vuelve el centro.
// «Ver mapa completo» muestra todo el diagrama; tocando una bolita se vuelve al foco.
// Es solo de lectura: recibe los nodos y las líneas y no cambia nada.
// No usa librerías: proyección en perspectiva propia sobre un <canvas> (cámara que gira y hace zoom).
(function(){
"use strict";

var BG = "#141518";
var PINK = "233,168,242";          // bolitas (como la imagen de referencia)
var GREY = "120,122,128";          // nodos apagados y polvo del fondo
var R_FOCUS = 230;                 // distancia de los vecinos al centro
var DUR = 650;                     // duración de la transición (ms)

function ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerp(a, b, t){ return a + (b - a) * t; }
// Pseudoaleatorio con semilla: el fondo y el mapa completo quedan siempre iguales.
function rng(seed){ var s = seed % 2147483647; if(s <= 0) s += 2147483646; return function(){ s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
function hash(str){ var h = 7; for(var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 2147483647; return h; }

// Vecinos alrededor del centro: en un anillo un poco inclinado (con pocos) o repartidos en una esfera (con muchos).
function around(n, r){
  var out = [];
  if(n <= 10){
    for(var i = 0; i < n; i++){
      var a = -Math.PI / 2 + i * 2 * Math.PI / n + (n % 2 ? 0 : Math.PI / n);
      out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * .82, z: (i % 2 ? 1 : -1) * r * .32 });
    }
    return out;
  }
  var g = Math.PI * (3 - Math.sqrt(5));
  for(var j = 0; j < n; j++){
    var y = 1 - j / (n - 1) * 2, rad = Math.sqrt(1 - y * y), th = g * j;
    out.push({ x: Math.cos(th) * rad * r * 1.15, y: y * r * .85, z: Math.sin(th) * rad * r * 1.15 });
  }
  return out;
}

// Mapa completo: fuerzas en 3D (se repelen, las líneas atraen), arrancando del dibujo 2D.
function fullLayout(nodes, edges){
  var P = {}, n = nodes.length, cx = 0, cy = 0;
  nodes.forEach(function(t){ cx += t.x / n; cy += t.y / n; });
  nodes.forEach(function(t){
    var r = rng(hash(t.id));
    P[t.id] = { x: (t.x - cx) * .55, y: (t.y - cy) * .55, z: (r() - .5) * 260, vx: 0, vy: 0, vz: 0 };
  });
  var ids = nodes.map(function(t){ return t.id; });
  for(var it = 0; it < 260; it++){
    var cool = 1 - it / 260;
    for(var i = 0; i < n; i++) for(var j = i + 1; j < n; j++){
      var a = P[ids[i]], b = P[ids[j]], dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      var d2 = Math.max(400, dx * dx + dy * dy + dz * dz), f = 42000 / d2, d = Math.sqrt(d2);
      dx /= d; dy /= d; dz /= d;
      a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    }
    edges.forEach(function(e){
      var a = P[e.from], b = P[e.to]; if(!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, f = (d - 230) * .035;
      dx /= d; dy /= d; dz /= d;
      a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    });
    ids.forEach(function(id){
      var p = P[id];
      p.vx -= p.x * .004; p.vy -= p.y * .004; p.vz -= p.z * .004;
      var m = Math.min(1, 30 / (Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) || 1));
      p.x += p.vx * m * cool; p.y += p.vy * m * cool; p.z += p.vz * m * cool;
      p.vx *= .55; p.vy *= .55; p.vz *= .55;
    });
  }
  return P;
}

function create(host, opts){
  opts = opts || {};
  host.innerHTML =
    '<canvas class="fc-canvas"></canvas>' +
    '<div class="fc-bar"><button type="button" class="fc-btn" data-fc="full"></button></div>' +
    '<div class="fc-hint"></div>';
  var cv = host.querySelector("canvas"), ctx = cv.getContext("2d");
  var btn = host.querySelector("[data-fc=full]"), hint = host.querySelector(".fc-hint");

  var graph = { nodes: [], edges: [] }, byId = {}, adj = {};
  var mode = "focus", center = null, full = null;
  var items = {};                 // id → { x, y, z, a, s, lab, … } estado animado de cada bolita
  var anim = null, open = false, hover = null;
  var cam = { yaw: -.25, pitch: .18, dist: 820 };
  var W = 0, H = 0, dpr = 1, raf = 0;

  var dust = (function(){
    var r = rng(12345), out = [];
    for(var i = 0; i < 170; i++){
      var u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 350 + r() * 900, q = Math.sqrt(1 - u * u);
      out.push({ x: Math.cos(th) * q * rad, y: u * rad * .8, z: Math.sin(th) * q * rad, s: .6 + r() * 1.8, a: .08 + r() * .22 });
    }
    return out;
  })();

  function setGraph(g){
    graph = g; byId = {}; adj = {}; full = null;
    g.nodes.forEach(function(t){ byId[t.id] = t; adj[t.id] = []; });
    g.edges.forEach(function(e){
      if(!byId[e.from] || !byId[e.to]) return;
      if(adj[e.from].indexOf(e.to) < 0) adj[e.from].push(e.to);
      if(adj[e.to].indexOf(e.from) < 0) adj[e.to].push(e.from);
    });
  }
  // Distancia de la cámara en el foco: más cerca en pantallas angostas (celular).
  function baseDist(){ return W < 700 ? 560 : 820; }
  // Aleja la cámara lo justo para que entre todo el mapa.
  function fitFull(){
    var F = fullPos(), r = 0;
    Object.keys(F).forEach(function(id){ var p = F[id]; r = Math.max(r, Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)); });
    cam.dist = Math.max(baseDist(), Math.min(3200, r * (W < 700 ? 1.9 : 2.4) + 300));
  }
  function fullPos(){ if(!full) full = fullLayout(graph.nodes, graph.edges); return full; }

  // Dónde va cada bolita según el modo: posición, opacidad (1 = encendida), tamaño y si lleva nombre.
  function targets(){
    var T = {}, F = fullPos();
    if(mode === "full"){
      graph.nodes.forEach(function(t){ var p = F[t.id]; T[t.id] = { x: p.x, y: p.y, z: p.z, a: 1, s: t.id === center ? 15 : 10.5, lab: 1 }; });
      return T;
    }
    var near = adj[center] || [], ring = around(near.length, R_FOCUS), c = F[center];
    T[center] = { x: 0, y: 0, z: 0, a: 1, s: 19, lab: 1 };
    near.forEach(function(id, i){ T[id] = { x: ring[i].x, y: ring[i].y, z: ring[i].z, a: 1, s: 11, lab: 1 }; });
    // El resto queda apagado, lejos, como puntos del fondo.
    graph.nodes.forEach(function(t){
      if(T[t.id]) return;
      var p = F[t.id], dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      var k = Math.max(R_FOCUS * 2.1, d * 1.7) / d;
      T[t.id] = { x: dx * k, y: dy * k, z: dz * k, a: .16, s: 5, lab: 0 };
    });
    return T;
  }
  function go(){
    var T = targets(), from = {};
    graph.nodes.forEach(function(t){
      var it = items[t.id];
      // Las que aparecen salen desde el centro.
      from[t.id] = it ? { x: it.x, y: it.y, z: it.z, a: it.a, s: it.s } : { x: 0, y: 0, z: 0, a: 0, s: 2 };
      items[t.id] = items[t.id] || { x: 0, y: 0, z: 0, a: 0, s: 2 };
      items[t.id].lab = T[t.id].lab;
    });
    Object.keys(items).forEach(function(id){ if(!byId[id]) delete items[id]; });
    anim = { t0: performance.now(), from: from, to: T };
    renderUi();
    kick();
  }
  function step(now){
    if(!anim) return false;
    var k = Math.min(1, (now - anim.t0) / DUR), e = ease(k);
    Object.keys(anim.to).forEach(function(id){
      var a = anim.from[id], b = anim.to[id], it = items[id]; if(!a || !it) return;
      it.x = lerp(a.x, b.x, e); it.y = lerp(a.y, b.y, e); it.z = lerp(a.z, b.z, e); it.a = lerp(a.a, b.a, e); it.s = lerp(a.s, b.s, e);
    });
    if(k >= 1) anim = null;
    return true;
  }

  // ---------- cámara y proyección ----------
  function proj(p){
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var x = p.x * cy - p.z * sy, z = p.x * sy + p.z * cy;
    var y = p.y * cp - z * sp; z = p.y * sp + z * cp;
    var zz = z + cam.dist; if(zz < 40) return null;
    var f = Math.min(W, H) * .95, k = f / zz;
    return { x: W / 2 + x * k, y: H / 2 + y * k, k: k, z: zz };
  }

  function draw(){
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .75);
    vg.addColorStop(0, "rgba(255,255,255,0.018)"); vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    dust.forEach(function(d){
      var q = proj(d); if(!q) return;
      ctx.fillStyle = "rgba(" + GREY + "," + Math.min(.4, d.a * q.k * 1.3).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(.5, d.s * q.k), 0, 6.283); ctx.fill();
    });

    var P = {};
    Object.keys(items).forEach(function(id){ P[id] = proj(items[id]); });

    // líneas finas, grises, un poco punteadas como en la referencia
    ctx.lineCap = "round";
    graph.edges.forEach(function(e){
      var a = items[e.from], b = items[e.to], pa = P[e.from], pb = P[e.to];
      if(!a || !b || !pa || !pb) return;
      // solo entre bolitas encendidas (las apagadas no muestran sus líneas)
      var al = Math.max(0, (Math.min(a.a, b.a) - .2) / .8); if(al < .02) return;
      var lw = Math.max(.6, 1.6 * (pa.k + pb.k) / 2);
      ctx.strokeStyle = "rgba(150,152,158," + (al * .42).toFixed(3) + ")"; ctx.lineWidth = lw;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.strokeStyle = "rgba(190,192,198," + (al * .22).toFixed(3) + ")"; ctx.lineWidth = lw * .9;
      ctx.setLineDash([1, 9 + 6 * (pa.k + pb.k)]);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // bolitas, de la más lejana a la más cercana
    var order = Object.keys(items).filter(function(id){ return P[id] && items[id].a > .01; })
      .sort(function(a, b){ return P[b].z - P[a].z; });
    order.forEach(function(id){
      var it = items[id], q = P[id], r = Math.max(1.2, it.s * q.k), lit = it.a > .5;
      var col = lit ? PINK : GREY, al = it.a, isC = mode === "focus" && id === center;
      if(lit){
        var gl = ctx.createRadialGradient(q.x, q.y, r * .6, q.x, q.y, r * (isC ? 3.4 : 2.6));
        gl.addColorStop(0, "rgba(" + PINK + "," + ((isC ? .42 : .28) * al).toFixed(3) + ")");
        gl.addColorStop(1, "rgba(" + PINK + ",0)");
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(q.x, q.y, r * (isC ? 3.4 : 2.6), 0, 6.283); ctx.fill();
      }
      var g = ctx.createRadialGradient(q.x - r * .35, q.y - r * .38, r * .1, q.x, q.y, r);
      if(lit){
        g.addColorStop(0, "rgba(253,236,255," + al + ")");
        g.addColorStop(.45, "rgba(" + col + "," + al + ")");
        g.addColorStop(1, "rgba(196,128,214," + al + ")");
      } else {
        g.addColorStop(0, "rgba(160,162,168," + al + ")");
        g.addColorStop(1, "rgba(" + col + "," + (al * .7) + ")");
      }
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill();
      if(hover === id && lit){ ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, r + 3, 0, 6.283); ctx.stroke(); }
      if(it.lab && al > .3){
        var t = byId[id];
        ctx.font = "600 " + (isC ? 11 : 10) + "px 'JetBrains Mono', ui-monospace, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0,0,0," + (.6 * al) + ")"; ctx.fillText(t.title, q.x + 1, q.y - r - 7);
        ctx.fillStyle = "rgba(236,236,240," + al + ")"; ctx.fillText(t.title, q.x, q.y - r - 8);
      }
    });

    // Etiqueta abajo de la bolita señalada (o del centro): nombre + tipo · nivel
    var tagId = hover || (mode === "focus" ? center : null), tq = tagId && P[tagId], ti = tagId && items[tagId];
    if(tq && ti && ti.a > .5){
      var tn = byId[tagId], sub = [tn.typeLabel, tn.levelLabel].filter(Boolean).join(" · "), r2 = Math.max(1.2, ti.s * tq.k);
      ctx.font = "600 12px system-ui, -apple-system, Segoe UI, sans-serif";
      var w1 = ctx.measureText(tn.title).width;
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      var w2 = sub ? ctx.measureText(sub).width + 10 : 0, bw = w1 + w2 + 20, bh = 26, bx = tq.x - bw / 2, by = tq.y + r2 + 12;
      ctx.fillStyle = "rgba(28,29,34,.94)"; ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.lineWidth = 1;
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5); else ctx.rect(bx, by, bw, bh);
      ctx.fill(); ctx.stroke();
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.font = "600 12px system-ui, -apple-system, Segoe UI, sans-serif"; ctx.fillStyle = "#eceef2"; ctx.fillText(tn.title, bx + 10, by + bh / 2);
      if(sub){ ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif"; ctx.fillStyle = "#8a8d96"; ctx.fillText(sub, bx + 10 + w1 + 10, by + bh / 2); }
    }
  }

  function frame(now){
    raf = 0;
    if(!open) return;
    var more = step(now);
    draw();
    if(more || anim) kick();
  }
  function kick(){ if(!raf && open) raf = requestAnimationFrame(frame); }

  function resize(){
    var r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    kick();
  }
  if(window.ResizeObserver) new ResizeObserver(resize).observe(host);
  else window.addEventListener("resize", resize);

  function renderUi(){
    btn.textContent = mode === "full" ? "◉ Volver al foco" : "Ver mapa completo";
    var n = (adj[center] || []).length;
    hint.textContent = mode === "full"
      ? "Tocá una bolita para verla en foco · arrastrá para girar · rueda o dos dedos = zoom"
      : (n ? "" : "Sin conexiones · ") + "Tocá una bolita para centrarla · arrastrá para girar · rueda o dos dedos = zoom";
  }

  // ---------- puntero: girar, zoom, tocar ----------
  var pts = {}, drag = null, pinch = null;
  function pick(x, y){
    var best = null, bz = Infinity;
    Object.keys(items).forEach(function(id){
      var it = items[id]; if(it.a < .5) return;
      var q = proj(it); if(!q) return;
      var r = Math.max(8, it.s * q.k) + 6, d = Math.hypot(q.x - x, q.y - y);
      if(d <= r && q.z < bz){ best = id; bz = q.z; }
    });
    return best;
  }
  function local(e){ var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener("pointerdown", function(e){
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if(ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return; }
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", function(e){
    if(pts[e.pointerId]) pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if(pinch){
      var ids = Object.keys(pts); if(ids.length < 2) return;
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if(pinch.d) zoom(pinch.d / d);
      pinch.d = d; return;
    }
    if(!drag){
      var l = local(e), h = pick(l.x, l.y);
      if(h !== hover){ hover = h; cv.style.cursor = h ? "pointer" : "grab"; kick(); }
      return;
    }
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if(!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    drag.moved = true; hover = null;
    cam.yaw += dx * .006; cam.pitch = Math.max(-1.35, Math.min(1.35, cam.pitch + dy * .006));
    drag.x = e.clientX; drag.y = e.clientY;
    kick();
  });
  function up(e){
    delete pts[e.pointerId];
    if(pinch){ if(Object.keys(pts).length < 2) pinch = null; drag = null; return; }
    var d = drag; drag = null;
    if(!d || d.moved || e.type === "pointercancel") return;
    var l = local(e), id = pick(l.x, l.y);
    if(!id) return;
    hover = null;
    if(mode === "focus" && id === center) return;
    if(mode === "full") cam.dist = baseDist();
    center = id; mode = "focus";
    go();
    if(opts.onCenter) opts.onCenter(id);
  }
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("pointerleave", function(){ if(hover && !drag){ hover = null; kick(); } });
  function zoom(f){ cam.dist = Math.max(260, Math.min(3200, cam.dist * f)); kick(); }
  cv.addEventListener("wheel", function(e){ e.preventDefault(); zoom(Math.exp(e.deltaY * .0012)); }, { passive: false });
  btn.addEventListener("click", function(){
    mode = mode === "full" ? "focus" : "full";
    if(mode === "full") fitFull(); else cam.dist = baseDist();
    go();
  });

  return {
    // graph: { nodes: [{ id, title, typeLabel, levelLabel, x, y }], edges: [{ from, to }] }
    open: function(g, centerId){
      setGraph(g);
      center = byId[centerId] ? centerId : (g.nodes[0] && g.nodes[0].id);
      mode = "focus"; items = {}; hover = null;
      cam = { yaw: -.25, pitch: .18, dist: 0 };
      open = true;
      resize();
      cam.dist = baseDist();
      go();
    },
    // Los datos cambiaron (otra habilidad, una card nueva o borrada): se rearma sin perder el centro.
    update: function(g, centerId){
      if(!open) return;
      setGraph(g);
      if(!byId[center]) center = byId[centerId] ? centerId : (g.nodes[0] && g.nodes[0].id);
      go();
    },
    close: function(){ open = false; if(raf) cancelAnimationFrame(raf); raf = 0; anim = null; },
    center: function(){ return center; }
  };
}

window.AprenderFoco = { create: create };
})();
