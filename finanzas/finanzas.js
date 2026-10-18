// Finanzas personales — vista de escritorio.
// Lee los gastos, grupos y deudas del Libro de Gastos y les suma cuentas, ingresos,
// transferencias y tarjetas (tablas fin_* en Supabase, privadas de cada usuario).
// Sin Supabase configurado funciona en modo local (localStorage) con datos de ejemplo.
(function(){
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var REMOTE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  var sb = (REMOTE && window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
  var session = null;

  var LS_SHARED = "libro-gastos:v1";
  var LS_FIN = "libro-gastos:fin:v1";
  var CATEGORIES = [
    {id:"cat-comida", name:"Comida"}, {id:"cat-disfrute", name:"Disfrute"}, {id:"cat-salud", name:"Salud"},
    {id:"cat-transporte", name:"Transporte"}, {id:"cat-vivienda", name:"Vivienda"}, {id:"cat-otros", name:"Otros"}
  ];
  var ACCOUNT_KINDS = [
    {id:"banco", name:"Banco"}, {id:"efectivo", name:"Efectivo"}, {id:"billetera", name:"Billetera virtual"},
    {id:"tarjeta", name:"Tarjeta de crédito"}, {id:"ahorro", name:"Ahorro"}, {id:"inversion", name:"Inversión"}
  ];
  var MOV_KINDS = {ingreso:"Ingreso", gasto:"Gasto", transferencia:"Transferencia", ajuste:"Ajuste"};
  var MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var MONTHS_ABBR = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

  // ---------------- utilidades ----------------
  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }
  function uid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c){
      var r = Math.random()*16|0; return (c === "x" ? r : (r&0x3|0x8)).toString(16);
    });
  }
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function localDateStr(d){ return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()); }
  function todayStr(){ return localDateStr(new Date()); }
  function ymOf(date){ return date.slice(0,7); }
  function currentYM(){ return ymOf(todayStr()); }
  function addMonths(ym, k){
    var p = ym.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1 + k, 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }
  function monthsBetween(a, b){ // b - a en meses
    var pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return (pb[0] - pa[0]) * 12 + (pb[1] - pa[1]);
  }
  function monthLabel(ym){
    var p = ym.split("-").map(Number);
    var s = MONTHS[p[1]-1] + " " + p[0];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function shortMonth(ym){ var p = ym.split("-").map(Number); return MONTHS_ABBR[p[1]-1]; }
  function dayLabel(d){ var p = d.split("-").map(Number); return p[2] + " " + MONTHS_ABBR[p[1]-1]; }
  function fmt(v, cur){
    v = Number(v) || 0;
    var neg = v < 0; v = Math.abs(v);
    var s = v.toLocaleString("es-UY", {minimumFractionDigits:0, maximumFractionDigits: cur === "USD" ? 2 : 0});
    return (neg ? "−" : "") + (cur === "USD" ? "US$ " : "$ ") + s;
  }
  function fmtShort(v){
    var a = Math.abs(v), sign = v < 0 ? "−" : "";
    if(a >= 1000000) return sign + "$" + (a/1000000).toFixed(1).replace(".", ",") + "M";
    if(a >= 1000) return sign + "$" + (a >= 10000 ? Math.round(a/1000) : (a/1000).toFixed(1).replace(".", ",")) + "k";
    return sign + "$" + Math.round(a);
  }
  var toastTimer;
  function toast(msg){
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove("show"); }, 2200);
  }

  // ---------------- datos ----------------
  // D: lo del Libro de Gastos (grupos, gastos, pagos, deudas) + lo de finanzas.
  var D = null;

  function emptyFin(){
    return {accounts:[], movements:[], links:{}, settings:{enabled:false, usdRate:40,
      incomeCategories:["Sueldo","Freelance","Aguinaldo","Ventas","Regalos","Otros"]}};
  }
  function categoryName(id){
    var c = CATEGORIES.filter(function(x){ return x.id === id; })[0];
    return c ? c.name : (id || "Otros");
  }
  function groupById(id){ return D.groups.filter(function(g){ return g.id === id; })[0]; }
  function memberName(id){
    if(id === "me") return "Vos";
    var m = D.members.filter(function(x){ return x.id === id; })[0];
    return m ? m.name : "—";
  }
  function accountById(id){ return D.accounts.filter(function(a){ return a.id === id; })[0]; }
  function rate(){ return Number(D.settings.usdRate) || 1; }
  function toUYU(v, cur){ return cur === "USD" ? v * rate() : v; }
  function link(kind, id){ return D.links[kind + ":" + id]; }

  // ---- lo que viene del Libro de Gastos ----
  // "Contar desde" (Configuración del celular) y "solo registro": se ven pero no suman
  // en gastos ni en deudas. Los saldos de las cuentas no cambian: esa plata sí se movió.
  function counts(item){ return !item.ignored && (!D.countFrom || item.date >= D.countFrom); }
  function myShareOf(e){
    if(e.scope !== "compartido") return e.amount;
    var g = groupById(e.groupId);
    if(!g || g.memberIds.indexOf("me") === -1) return 0;
    if(e.splitType === "completo") return e.owedBy === "me" ? e.amount : 0;
    return e.amount / (g.memberIds.length || 1);
  }
  function paidByMe(e){ return e.scope === "personal" || e.paidBy === "me"; }
  // Plata que entra (+) o sale (−) de tu bolsillo por una deuda o un pago de grupo.
  function debtCash(d){
    if(d.kind === "pago") return d.debtor.me ? -d.amount : (d.creditor.me ? d.amount : 0);
    if(d.creditor.me) return -d.amount;            // pagaste algo de otro o prestaste
    if(d.debtor.me && d.kind === "prestamo") return d.amount; // te prestaron
    return 0;                                     // otro pagó algo tuyo: no movió tu plata
  }
  function settlementCash(s){
    if(s.from === "me") return -s.amount;
    if(s.to === "me") return s.amount;
    return 0;
  }
  function debtEffect(d){ return d.amount * (d.creditor.me ? 1 : -1) * (d.kind === "pago" ? -1 : 1); }
  function groupNetMe(g){
    var b = {}; g.memberIds.forEach(function(id){ b[id] = 0; });
    D.expenses.forEach(function(e){
      if(e.scope !== "compartido" || e.groupId !== g.id) return;
      b[e.paidBy] = (b[e.paidBy] || 0) + e.amount;
      if(e.splitType === "completo") b[e.owedBy] = (b[e.owedBy] || 0) - e.amount;
      else g.memberIds.forEach(function(id){ b[id] -= e.amount / (g.memberIds.length || 1); });
    });
    D.settlements.forEach(function(s){
      if(s.groupId !== g.id) return;
      b[s.from] = (b[s.from] || 0) + s.amount;
      b[s.to] = (b[s.to] || 0) - s.amount;
    });
    return b.me || 0;
  }
  // Lo que te deben (+) o debés (−) a otros, sumando grupos y deudas.
  function receivablesNet(){
    var v = 0;
    D.groups.forEach(function(g){ v += groupNetMe(g); });
    D.debts.forEach(function(d){ if(counts(d)) v += debtEffect(d); });
    return v;
  }

  // ---- saldo con cada persona (como "Amigos" en el celular) ----
  function personKey(side){ return side.user ? "u:" + side.user : "n:" + String(side.name || "").trim().toLowerCase(); }
  function otherSide(d){ return d.creditor.me ? d.debtor : d.creditor; }
  function memberSide(m){ return m.userId ? {user:m.userId, name:m.name} : {name:m.name}; }
  // Cuánto te debe ese integrante en ese grupo (> 0) o le debés (< 0), gasto por gasto.
  function pairwiseInGroup(g, memberId){
    var v = 0, n = g.memberIds.length || 1;
    D.expenses.forEach(function(e){
      if(e.scope !== "compartido" || e.groupId !== g.id) return;
      if(e.splitType === "completo"){
        if(e.paidBy === "me" && e.owedBy === memberId) v += e.amount;
        else if(e.paidBy === memberId && e.owedBy === "me") v -= e.amount;
      } else {
        if(e.paidBy === "me") v += e.amount / n;
        else if(e.paidBy === memberId) v -= e.amount / n;
      }
    });
    D.settlements.forEach(function(st){
      if(st.groupId !== g.id) return;
      if(st.from === memberId && st.to === "me") v -= st.amount;
      else if(st.from === "me" && st.to === memberId) v += st.amount;
    });
    return v;
  }
  // Una fila por persona: total, partes por grupo y lo de fuera de grupo.
  function peopleBalances(){
    var map = {}, list = [];
    function entry(side){
      var k = personKey(side);
      if(!map[k]){ map[k] = {key:k, side:side, net:0, parts:[], debtNet:0, debtCount:0}; list.push(map[k]); }
      if(side.user && !map[k].side.user) map[k].side = side;
      return map[k];
    }
    D.groups.forEach(function(g){
      g.memberIds.forEach(function(mid){
        if(mid === "me") return;
        var m = D.members.filter(function(x){ return x.id === mid; })[0];
        if(!m) return;
        var en = entry(memberSide(m)), v = pairwiseInGroup(g, mid);
        en.parts.push({name:g.name, net:v});
        en.net += v;
      });
    });
    D.debts.forEach(function(d){
      if(!counts(d)) return;
      var en = entry(otherSide(d)), v = debtEffect(d);
      en.debtNet += v; en.debtCount++; en.net += v;
    });
    list.forEach(function(p){ if(p.debtCount) p.parts.push({name:"Sin grupo", net:p.debtNet}); });
    return list.sort(function(a, b){ return Math.abs(b.net) - Math.abs(a.net); });
  }
  function owesText(net, name){
    return net > 0 ? name + " te debe" : "Le debés a " + name;
  }

  // ---------------- motor: costos, ingresos, saldos ----------------
  // Reparte un monto en n cuotas mensuales desde el mes de la fecha.
  function spread(date, amount, n){
    n = Math.max(1, n || 1);
    var out = [], ym = ymOf(date);
    for(var i = 0; i < n; i++) out.push({ym: addMonths(ym, i), amount: amount / n});
    return out;
  }
  // Cuotas de una compra: de la cuota "from" a la "n", una por mes desde "start"
  // (por defecto, el mes de la compra). Las anteriores a "from" ya estaban pagas.
  function cuotaPlan(src){
    var n = Math.max(1, src.n || 1), from = Math.min(n, Math.max(1, src.from || 1));
    var start = src.start ? ymOf(src.start) : ymOf(src.date), cuota = src.total / n, items = [];
    for(var k = from; k <= n; k++) items.push({num:k, ym:addMonths(start, k - from), amount:cuota});
    return {n:n, from:from, cuota:cuota, items:items, tracked:cuota * items.length};
  }
  function movPlan(m){ return cuotaPlan({date:m.date, total:m.amount, n:m.installments, from:m.instFrom, start:m.instStart}); }

  // Todo lo que te cuesta (en $): tus gastos, tu parte de los compartidos, lo que otro
  // pagó por vos y los gastos propios de finanzas (ej. en dólares). Las cuotas se reparten.
  function costItems(){
    var items = [];
    D.expenses.forEach(function(e){
      var mine = myShareOf(e);
      if(!(mine > 0) || !counts(e)) return;
      var l = link("expense", e.id);
      var g = e.scope === "compartido" ? groupById(e.groupId) : null;
      items.push({date:e.date, amount:mine, n:(l && l.installments) || 1, category:categoryName(e.categoryId),
        desc:e.description || categoryName(e.categoryId), where: g ? g.name : "Personal"});
    });
    D.debts.forEach(function(d){
      if(d.kind === "gasto" && d.debtor.me && counts(d)){
        items.push({date:d.date, amount:d.amount, n:1, category:categoryName(d.categoryId),
          desc:d.description || "Pagó " + (d.creditor.name || "otro"), where:"Deuda"});
      }
    });
    D.movements.forEach(function(m){
      if(m.kind !== "gasto") return;
      var plan = movPlan(m);
      items.push({date:m.date, amount:toUYU(plan.tracked, m.currency), n:m.installments || 1,
        sched: plan.items.map(function(c){ return {ym:c.ym, amount:toUYU(c.amount, m.currency)}; }),
        category:categoryName(m.category), desc:m.description || categoryName(m.category), where:"Finanzas"});
    });
    return items;
  }
  function costByMonth(){
    var map = {};
    costItems().forEach(function(it){
      (it.sched || spread(it.date, it.amount, it.n)).forEach(function(p){ map[p.ym] = (map[p.ym] || 0) + p.amount; });
    });
    return map;
  }
  function costByCategory(ym){
    var map = {};
    costItems().forEach(function(it){
      (it.sched || spread(it.date, it.amount, it.n)).forEach(function(p){
        if(p.ym === ym) map[it.category] = (map[it.category] || 0) + p.amount;
      });
    });
    return map;
  }
  function incomeByMonth(){
    var map = {};
    D.movements.forEach(function(m){
      if(m.kind === "ingreso") map[ymOf(m.date)] = (map[ymOf(m.date)] || 0) + toUYU(m.amount, m.currency);
    });
    return map;
  }

  // Saldos por cuenta y moneda.
  // El saldo inicial de una cuenta es el de su fecha (balanceAt): lo anterior ya está
  // incluido ahí, así que asignarlo a la cuenta no vuelve a moverle el saldo.
  function countsForBalance(accId, item){
    var a = accountById(accId);
    if(!a || !a.balanceAt) return true;
    var cut = new Date(a.balanceAt), day = localDateStr(cut);
    if(item.date !== day) return item.date > day;
    return !item.createdAt || new Date(item.createdAt) > cut;
  }
  function balances(){
    var b = {};
    D.accounts.forEach(function(a){ b[a.id] = {UYU: Number(a.initialUYU) || 0, USD: Number(a.initialUSD) || 0}; });
    function add(acc, cur, v, item){ if(acc && b[acc] && countsForBalance(acc, item)) b[acc][cur] += v; }
    D.movements.forEach(function(m){
      if(m.kind === "ingreso") add(m.accountId, m.currency, m.amount, m);
      else if(m.kind === "gasto"){
        var plan = movPlan(m);
        add(m.accountId, m.currency, -plan.tracked, plan.from > 1 && m.createdAt ? {date:localDateStr(new Date(m.createdAt)), createdAt:m.createdAt} : m);
      }
      else if(m.kind === "ajuste") add(m.accountId, m.currency, m.amount, m);
      else if(m.kind === "transferencia"){
        add(m.accountId, m.currency, -m.amount, m);
        add(m.toAccountId, m.toCurrency, m.toAmount, m);
      }
    });
    D.expenses.forEach(function(e){
      var l = link("expense", e.id);
      if(l && l.accountId && paidByMe(e)) add(l.accountId, "UYU", -e.amount, e);
    });
    D.settlements.forEach(function(s){
      var l = link("settlement", s.id);
      if(l && l.accountId) add(l.accountId, "UYU", settlementCash(s), s);
    });
    D.debts.forEach(function(d){
      var l = link("debt", d.id);
      if(l && l.accountId) add(l.accountId, "UYU", debtCash(d), d);
    });
    return b;
  }
  function accountTotalUYU(bal){ return bal.UYU + bal.USD * rate(); }
  function netWorth(){
    var b = balances(), t = 0;
    D.accounts.forEach(function(a){ if(b[a.id]) t += accountTotalUYU(b[a.id]); });
    return {accounts:t, receivables:receivablesNet(), total:t + receivablesNet()};
  }

  // Compras en cuotas de cada tarjeta.
  // Compras en cuotas de una tarjeta, con cada cuota en su mes. "billed" = cuotas que ya
  // vinieron hasta este mes (incluido); "remaining" = las que faltan.
  function installmentPlans(cardId){
    var plans = [];
    D.expenses.forEach(function(e){
      var l = link("expense", e.id);
      if(l && l.accountId === cardId && (l.installments || 1) > 1 && paidByMe(e)){
        plans.push(Object.assign({date:e.date, desc:e.description || categoryName(e.categoryId), total:e.amount, currency:"UYU"},
          cuotaPlan({date:e.date, total:e.amount, n:l.installments})));
      }
    });
    D.movements.forEach(function(m){
      if(m.kind === "gasto" && m.accountId === cardId && ((m.installments || 1) > 1 || (m.instFrom || 1) > 1)){
        plans.push(Object.assign({date:m.date, desc:m.description || categoryName(m.category), total:m.amount, currency:m.currency, movId:m.id}, movPlan(m)));
      }
    });
    var now = currentYM();
    plans.forEach(function(p){
      var done = p.items.filter(function(c){ return c.ym <= now; }).length;
      p.billed = p.from - 1 + done;
      p.remaining = p.n - p.billed;
      p.lastYM = p.items.length ? p.items[p.items.length - 1].ym : now;
      var cur = p.items.filter(function(c){ return c.ym === now; })[0];
      p.current = cur ? cur.num : null;
    });
    return plans.sort(function(a, b){ return b.date.localeCompare(a.date); });
  }

  // ---------------- libro mayor: todas las filas que mueven plata o te cuestan ----------------
  function ledgerRows(){
    var rows = [];
    D.movements.forEach(function(m){
      var acc = accountById(m.accountId), to = accountById(m.toAccountId);
      var sign = m.kind === "ingreso" ? 1 : (m.kind === "ajuste" ? 1 : -1);
      rows.push({
        key:"m:" + m.id, ref:{type:"movement", id:m.id}, date:m.date, type:m.kind,
        typeLabel: MOV_KINDS[m.kind] + (m.kind === "gasto" && m.installments > 1
          ? ((m.instFrom || 1) > 1 ? " · cuotas " + m.instFrom + "–" + m.installments + " de " + m.installments : " · " + m.installments + " cuotas") : ""),
        desc: m.description || (m.kind === "transferencia" ? (acc ? acc.name : "?") + " → " + (to ? to.name : "?") : (m.category ? (m.kind === "ingreso" ? m.category : categoryName(m.category)) : "")),
        category: m.kind === "ingreso" ? (m.category || "") : (m.kind === "gasto" ? categoryName(m.category) : ""),
        accountId: m.accountId, accountLabel: m.kind === "transferencia" ? (acc ? acc.name : "—") + " → " + (to ? to.name : "—") : (acc ? acc.name : "Sin cuenta"),
        amount: m.kind === "transferencia" ? m.amount : (m.kind === "gasto" ? -movPlan(m).tracked : sign * m.amount), currency: m.currency,
        extra: m.kind === "transferencia" && (m.toCurrency !== m.currency) ? "llegan " + fmt(m.toAmount, m.toCurrency) : "",
        pending: !m.accountId, editable:true
      });
    });
    D.expenses.forEach(function(e){
      var share = myShareOf(e);
      var mine = paidByMe(e);
      if(!mine && !(share > 0)) return;
      var l = link("expense", e.id);
      var g = e.scope === "compartido" ? groupById(e.groupId) : null;
      rows.push({
        key:"e:" + e.id, ref:{type:"expense", id:e.id}, date:e.date, type:"gasto_app",
        typeLabel: (g ? "Gasto · " + g.name : "Gasto") + (l && l.installments > 1 ? " · " + l.installments + " cuotas" : ""),
        desc: e.description || categoryName(e.categoryId), category: categoryName(e.categoryId),
        accountId: l ? l.accountId : null, assignable: mine, installmentsAllowed: mine,
        installments: l ? l.installments : 1,
        accountLabel: mine ? null : "Pagó " + memberName(e.paidBy),
        amount: mine ? -e.amount : 0, currency:"UYU",
        extra: g ? "tu parte " + fmt(share, "UYU") : "",
        pending: mine && !(l && l.accountId)
      });
    });
    D.settlements.forEach(function(s){
      var cash = settlementCash(s);
      if(!cash) return;
      var l = link("settlement", s.id), g = groupById(s.groupId);
      rows.push({
        key:"s:" + s.id, ref:{type:"settlement", id:s.id}, date:s.date, type:"pago_grupo",
        typeLabel:"Pago de grupo" + (g ? " · " + g.name : ""),
        desc: cash < 0 ? "Le pagaste a " + memberName(s.to) : memberName(s.from) + " te pagó",
        category:"", accountId: l ? l.accountId : null, assignable:true,
        amount: cash, currency:"UYU", pending: !(l && l.accountId)
      });
    });
    D.debts.forEach(function(d){
      var cash = debtCash(d);
      if(!cash) return;
      var l = link("debt", d.id);
      var other = d.creditor.me ? d.debtor.name : d.creditor.name;
      var desc = d.kind === "pago" ? (cash < 0 ? "Le pagaste a " + other : other + " te pagó")
        : d.kind === "prestamo" ? (cash < 0 ? "Le prestaste a " + other : other + " te prestó")
        : "Pagaste algo de " + other;
      rows.push({
        key:"d:" + d.id, ref:{type:"debt", id:d.id}, date:d.date, type:"deuda",
        typeLabel:"Deuda", desc: (d.description ? d.description + " · " : "") + desc, category:"",
        accountId: l ? l.accountId : null, assignable:true,
        amount: cash, currency:"UYU", pending: !(l && l.accountId)
      });
    });
    rows.forEach(function(r){
      if(r.type === "transferencia" || !r.accountId) return;
      var item = r.ref.type === "movement" ? D.movements.filter(function(m){ return m.id === r.ref.id; })[0]
        : r.ref.type === "expense" ? D.expenses.filter(function(e){ return e.id === r.ref.id; })[0]
        : r.ref.type === "settlement" ? D.settlements.filter(function(x){ return x.id === r.ref.id; })[0]
        : D.debts.filter(function(x){ return x.id === r.ref.id; })[0];
      if(item && !countsForBalance(r.accountId, item)) r.beforeBalance = true;
    });
    return rows.sort(function(a, b){ return b.date.localeCompare(a.date); });
  }

  // ---------------- carga: Supabase o local ----------------
  function load(){
    if(!REMOTE) return Promise.resolve(loadLocal());
    return fetchRemote();
  }

  function loadLocal(){
    var shared = null, fin = null;
    try{ shared = JSON.parse(localStorage.getItem(LS_SHARED)); }catch(e){}
    try{ fin = JSON.parse(localStorage.getItem(LS_FIN)); }catch(e){}
    if(!shared || !shared.members){ shared = demoShared(); try{ localStorage.setItem(LS_SHARED, JSON.stringify(shared)); }catch(e){} }
    if(!fin || !fin.accounts){ fin = demoFin(shared); saveLocalFin(fin); }
    D = {
      me:"Vos", countFrom:shared.countFrom || null, members:shared.members || [], groups:shared.groups || [], expenses:shared.expenses || [],
      settlements:shared.settlements || [], debts:shared.debts || [],
      accounts:fin.accounts, movements:fin.movements, links:fin.links || {}, settings:fin.settings || emptyFin().settings
    };
  }
  function saveLocalFin(fin){
    fin = fin || {accounts:D.accounts, movements:D.movements, links:D.links, settings:D.settings};
    try{ localStorage.setItem(LS_FIN, JSON.stringify(fin)); }catch(e){}
  }

  function fetchRemote(){
    var user = session.user, gen = writeGen;
    return Promise.all([
      sb.from("groups").select("id,name").order("created_at"),
      sb.from("group_members").select("id,group_id,user_id,name"),
      sb.from("expenses").select("*"),
      sb.from("settlements").select("*"),
      sb.from("debts").select("*"),
      sb.from("fin_accounts").select("*").order("sort").order("created_at"),
      sb.from("fin_movements").select("*").order("date", {ascending:false}),
      sb.from("fin_links").select("*"),
      sb.from("fin_settings").select("*").maybeSingle()
    ]).then(function(res){
      if(gen !== writeGen || pendingWrites > 0){ var stale = new Error("stale"); stale.stale = true; throw stale; }
      // Deudas y finanzas son opcionales (si falta correr su SQL, se sigue sin ellas).
      [4,5,6,7,8].forEach(function(i){ if(res[i].error){ console.warn(res[i].error); res[i] = {data: i === 8 ? null : []}; } });
      [0,1,2,3].forEach(function(i){ if(res[i].error) throw res[i].error; });
      var memberRows = res[1].data, mine = {};
      memberRows.forEach(function(m){ if(m.user_id === user.id) mine[m.id] = true; });
      function loc(id){ return id && mine[id] ? "me" : id; }
      function side(userId, name){ return userId === user.id ? {me:true} : {user:userId, name:name || "—"}; }
      var meta = user.user_metadata || {};
      var fs = res[8].data;
      D = {
        me: meta.name || meta.full_name || (user.email || "").split("@")[0],
        countFrom: meta.count_from || null,
        members: memberRows.filter(function(m){ return !mine[m.id]; }).map(function(m){ return {id:m.id, name:m.name, userId:m.user_id}; }),
        groups: res[0].data.map(function(g){
          return {id:g.id, name:g.name, memberIds: memberRows.filter(function(m){ return m.group_id === g.id; }).map(function(m){ return loc(m.id); })};
        }),
        expenses: res[2].data.map(function(r){
          var shared = !!r.group_id;
          return {id:r.id, date:r.date, amount:Number(r.amount), description:r.description || "", categoryId:r.category_id,
            scope: shared ? "compartido" : "personal", paidBy: shared ? loc(r.paid_by) : "me",
            groupId:r.group_id, splitType:r.split_type, owedBy: loc(r.owed_by), createdAt:r.created_at, ignored:!!r.ignored};
        }),
        settlements: res[3].data.map(function(r){
          return {id:r.id, groupId:r.group_id, from:loc(r.from_member), to:loc(r.to_member), amount:Number(r.amount), date:r.date, createdAt:r.created_at};
        }),
        debts: res[4].data.map(function(r){
          return {id:r.id, kind:r.kind, date:r.date, amount:Number(r.amount), description:r.description || "", categoryId:r.category_id,
            creditor: side(r.creditor_user, r.creditor_name), debtor: side(r.debtor_user, r.debtor_name), createdAt:r.created_at,
            note:r.note || "", settlesId:r.settles_id || null, ignored:!!r.ignored};
        }),
        accounts: res[5].data.map(function(r){
          return {id:r.id, name:r.name, kind:r.kind, currency:r.currency, initialUYU:Number(r.initial_uyu), initialUSD:Number(r.initial_usd), archived:r.archived, sort:r.sort, balanceAt:r.balance_at || null};
        }),
        movements: res[6].data.map(movFromRow),
        links: res[7].data.reduce(function(m, r){ m[r.ref_kind + ":" + r.ref_id] = {accountId:r.account_id, installments:r.installments}; return m; }, {}),
        settings: fs ? {enabled:fs.enabled, usdRate:Number(fs.usd_rate), incomeCategories:fs.income_categories || []} : emptyFin().settings
      };
    });
  }
  function movFromRow(r){
    return {id:r.id, kind:r.kind, date:r.date, amount:Number(r.amount), currency:r.currency, accountId:r.account_id,
      toAccountId:r.to_account_id, toAmount:r.to_amount == null ? null : Number(r.to_amount), toCurrency:r.to_currency,
      category:r.category, description:r.description || "", installments:r.installments || 1, createdAt:r.created_at,
      instFrom:r.inst_from || 1, instStart:r.inst_start || null};
  }
  function movToRow(m){
    return {kind:m.kind, date:m.date, amount:m.amount, currency:m.currency, account_id:m.accountId || null,
      to_account_id:m.toAccountId || null, to_amount:m.kind === "transferencia" ? m.toAmount : null,
      to_currency:m.kind === "transferencia" ? m.toCurrency : null, category:m.category || null,
      description:m.description || "", installments:m.installments || 1};
  }
  // inst_from / inst_start solo viajan si se usan (así no rompe si falta correr la parte 14).
  function movRow(m){
    var row = movToRow(m);
    if((m.instFrom || 1) > 1 || m.instStart || m.hadPlan){ row.inst_from = m.instFrom || 1; row.inst_start = m.instStart || null; }
    return row;
  }

  // ---------------- guardar ----------------
  // Mientras se guarda algo, una recarga que empezó antes no puede pisar los datos.
  var pendingWrites = 0, writeGen = 0;
  function run(op){
    if(!REMOTE){ saveLocalFin(); return Promise.resolve(true); }
    pendingWrites++; writeGen++;
    return Promise.resolve().then(op).then(function(r){
      if(r && r.error) throw r.error;
      return true;
    }).catch(function(err){
      console.error(err);
      toast("No se pudo guardar. Revisá tu conexión.");
      return false;
    }).then(function(ok){
      pendingWrites--;
      if(pendingWrites === 0) scheduleRefresh();
      return ok;
    });
  }
  function saveAccount(a, isNew){
    if(isNew) D.accounts.push(a);
    return run(function(){
      var row = {name:a.name, kind:a.kind, currency:a.currency, initial_uyu:a.initialUYU || 0, initial_usd:a.initialUSD || 0, archived:!!a.archived, sort:a.sort || 0,
        balance_at:a.balanceAt || null};
      function send(r){ return isNew ? sb.from("fin_accounts").insert(Object.assign({id:a.id}, r)) : sb.from("fin_accounts").update(r).eq("id", a.id); }
      return send(row).then(function(res){
        if(res.error && /balance_at/.test(res.error.message || "")){ delete row.balance_at; return send(row); }
        return res;
      });
    });
  }
  function saveMovement(m, isNew){
    if(isNew) D.movements.unshift(m);
    else D.movements = D.movements.map(function(x){ return x.id === m.id ? m : x; });
    return run(function(){
      var row = movRow(m);
      function send(r){ return isNew ? sb.from("fin_movements").insert(Object.assign({id:m.id}, r)) : sb.from("fin_movements").update(r).eq("id", m.id); }
      return send(row).then(function(res){
        if(res.error && "inst_from" in row && /inst_/.test(res.error.message || "")){
          toast("Falta correr supabase/14-cuotas.sql: se guardó como compra nueva en cuotas");
          delete row.inst_from; delete row.inst_start; return send(row);
        }
        return res;
      });
    });
  }
  function deleteMovement(id){
    D.movements = D.movements.filter(function(m){ return m.id !== id; });
    return run(function(){ return sb.from("fin_movements").delete().eq("id", id); });
  }
  function setLink(kind, id, accountId, installments){
    var key = kind + ":" + id;
    if(!accountId && (!installments || installments === 1)){
      delete D.links[key];
      return run(function(){ return sb.from("fin_links").delete().eq("ref_kind", kind).eq("ref_id", id); });
    }
    D.links[key] = {accountId:accountId || null, installments:installments || 1};
    return run(function(){
      return sb.from("fin_links").upsert({ref_kind:kind, ref_id:id, account_id:accountId || null, installments:installments || 1, user_id:session.user.id},
        {onConflict:"user_id,ref_kind,ref_id"});
    });
  }
  function saveSettings(){
    return run(function(){
      return sb.from("fin_settings").upsert({user_id:session.user.id, enabled:!!D.settings.enabled, usd_rate:D.settings.usdRate,
        income_categories:D.settings.incomeCategories, updated_at:new Date().toISOString()}, {onConflict:"user_id"});
    });
  }

  // ---------------- vistas ----------------
  var view = "resumen";
  var selYM = currentYM();
  document.querySelectorAll(".nav-btn").forEach(function(b){
    b.addEventListener("click", function(){ showView(b.getAttribute("data-view")); });
  });
  document.querySelectorAll("[data-goto]").forEach(function(b){
    b.addEventListener("click", function(){ showView(b.getAttribute("data-goto")); });
  });
  function showView(v){
    view = v;
    document.querySelectorAll(".nav-btn").forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-view") === v); });
    document.querySelectorAll(".view").forEach(function(s){ s.classList.toggle("active", s.id === "view-" + v); });
    render();
  }
  $("prevMonth").addEventListener("click", function(){ selYM = addMonths(selYM, -1); render(); });
  $("nextMonth").addEventListener("click", function(){ selYM = addMonths(selYM, 1); render(); });

  function render(){
    if(!D) return;
    $("whoami").textContent = D.me || "";
    var pending = ledgerRows().filter(function(r){ return r.pending && ymOf(r.date) === currentYM(); }).length;
    $("pendingBadge").hidden = !pending;
    $("pendingBadge").textContent = pending;
    if(view === "resumen") renderResumen();
    if(view === "cuentas") renderCuentas();
    if(view === "movimientos") renderMovimientos();
    if(view === "tarjetas") renderTarjetas();
    if(view === "deudas") renderDeudas();
    if(view === "config") renderConfig();
  }

  // ---- Resumen ----
  function kpi(label, value, sub, cls){
    return '<div class="kpi"><div class="kpi-label">'+esc(label)+'</div><div class="kpi-value '+(cls || "")+'">'+value+'</div>' +
      (sub ? '<div class="kpi-sub">'+sub+'</div>' : '') + '</div>';
  }
  function renderResumen(){
    $("monthLabel").textContent = monthLabel(selYM);
    var inc = incomeByMonth(), cost = costByMonth();
    var i = inc[selYM] || 0, c = cost[selYM] || 0, saved = i - c;
    var nw = netWorth();
    $("kpis").innerHTML =
      kpi("Ingresos", esc(fmt(i, "UYU")), "en " + esc(MONTHS[Number(selYM.slice(5)) - 1])) +
      kpi("Gastos", esc(fmt(c, "UYU")), "lo que te costó el mes") +
      kpi("Ahorro", esc(fmt(saved, "UYU")), i > 0 ? Math.round(saved / i * 100) + "% de lo que ganaste" : "sin ingresos cargados", saved >= 0 ? "pos" : "neg") +
      kpi("Patrimonio", esc(fmt(nw.total, "UYU")), "cuentas " + esc(fmt(nw.accounts, "UYU")) + " · " + (nw.receivables >= 0 ? "te deben " : "debés ") + esc(fmt(Math.abs(nw.receivables), "UYU")));

    renderIEChart(inc, cost);
    renderCatBars();
    renderAccountsMini();
    renderDebtsMini();
    renderTodo();
  }

  function renderIEChart(inc, cost){
    var months = [];
    for(var k = 11; k >= 0; k--) months.push(addMonths(selYM, -k));
    $("ieLegend").innerHTML = '<span><i class="sw inc"></i>Ingresos</span><span><i class="sw exp"></i>Gastos</span>';
    var W = 640, H = 240, padL = 48, padR = 8, padT = 16, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = 0;
    months.forEach(function(m){ max = Math.max(max, inc[m] || 0, cost[m] || 0); });
    var top = niceMax(max);
    var y = function(v){ return padT + plotH - v / top * plotH; };
    var step = plotW / months.length, bw = Math.min(16, (step - 8) / 2);
    var grid = "";
    for(var g = 0; g <= 4; g++){
      var gv = top * g / 4;
      grid += '<line x1="'+padL+'" x2="'+(W - padR)+'" y1="'+y(gv)+'" y2="'+y(gv)+'" class="grid'+(g === 0 ? " base" : "")+'"/>' +
        '<text x="'+(padL - 6)+'" y="'+(y(gv) + 3.5)+'" class="axis" text-anchor="end">'+fmtShort(gv)+'</text>';
    }
    var bars = months.map(function(m, i){
      var cx = padL + i * step + step / 2;
      var vi = inc[m] || 0, vc = cost[m] || 0;
      return '<g class="col'+(m === selYM ? " sel" : "")+'" data-ym="'+m+'" tabindex="0" role="button" aria-label="'+esc(monthLabel(m) + ": ingresos " + fmt(vi, "UYU") + ", gastos " + fmt(vc, "UYU"))+'">' +
        '<rect class="hit" x="'+(padL + i * step)+'" y="'+padT+'" width="'+step+'" height="'+(plotH + padB)+'"/>' +
        barPath(cx - bw - 1, bw, y(vi), padT + plotH, "inc") +
        barPath(cx + 1, bw, y(vc), padT + plotH, "exp") +
        '<text x="'+cx+'" y="'+(H - 8)+'" class="axis" text-anchor="middle">'+shortMonth(m)+'</text>' +
      '</g>';
    }).join("");
    $("ieChart").innerHTML = '<div class="chart-wrap"><svg viewBox="0 0 '+W+' '+H+'" class="chart" role="img" aria-label="Ingresos y gastos por mes">' +
      grid + bars + '</svg><div class="tip" hidden></div></div>';
    var tip = $("ieChart").querySelector(".tip"), wrap = $("ieChart").querySelector(".chart-wrap");
    $("ieChart").querySelectorAll(".col").forEach(function(col){
      var m = col.getAttribute("data-ym");
      function show(){
        var vi = inc[m] || 0, vc = cost[m] || 0;
        tip.innerHTML = '<b>'+esc(monthLabel(m))+'</b><div><i class="sw inc"></i>Ingresos '+esc(fmt(vi, "UYU"))+'</div>' +
          '<div><i class="sw exp"></i>Gastos '+esc(fmt(vc, "UYU"))+'</div><div class="muted">Ahorro '+esc(fmt(vi - vc, "UYU"))+'</div>';
        tip.hidden = false;
        var r = col.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(r.left - wr.left + r.width / 2 - tip.offsetWidth / 2, wr.width - tip.offsetWidth)) + "px";
      }
      function hide(){ tip.hidden = true; }
      col.addEventListener("mouseenter", show); col.addEventListener("focus", show);
      col.addEventListener("mouseleave", hide); col.addEventListener("blur", hide);
      col.addEventListener("click", function(){ selYM = m; render(); });
    });
  }
  function barPath(x, w, top, base, cls){
    var h = base - top;
    if(h <= 0.5) return "";
    var r = Math.min(4, w / 2, h);
    return '<path class="bar '+cls+'" d="M'+x+' '+base+' V'+(top + r)+' Q'+x+' '+top+' '+(x + r)+' '+top+' H'+(x + w - r)+' Q'+(x + w)+' '+top+' '+(x + w)+' '+(top + r)+' V'+base+' Z"/>';
  }
  function niceMax(v){
    if(v <= 0) return 1000;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function renderCatBars(){
    var map = costByCategory(selYM);
    var cats = Object.keys(map).sort(function(a, b){ return map[b] - map[a]; });
    var max = cats.length ? map[cats[0]] : 1, total = cats.reduce(function(s, c){ return s + map[c]; }, 0);
    $("catBars").innerHTML = cats.length === 0 ? '<p class="empty">Sin gastos en ' + esc(monthLabel(selYM)) + '.</p>' :
      cats.map(function(c){
        return '<div class="hbar"><span class="hbar-name">'+esc(c)+'</span>' +
          '<span class="hbar-track"><span style="width:'+Math.max(2, map[c] / max * 100)+'%"></span></span>' +
          '<span class="hbar-val">'+esc(fmt(map[c], "UYU"))+'</span><span class="hbar-pct">'+Math.round(map[c] / total * 100)+'%</span></div>';
      }).join("");
  }

  function balanceCells(a, bal){
    var parts = [];
    if(a.currency !== "USD") parts.push(fmt(bal.UYU, "UYU"));
    if(a.currency !== "UYU") parts.push(fmt(bal.USD, "USD"));
    return parts;
  }
  function renderAccountsMini(){
    var b = balances();
    var accs = D.accounts.filter(function(a){ return !a.archived; });
    $("accountsMini").innerHTML = accs.length === 0
      ? '<p class="empty">Todavía no tenés cuentas. <button type="button" class="link" id="miniNewAcc">Crear la primera</button></p>'
      : '<table class="tbl"><tbody>' + accs.map(function(a){
          var bal = b[a.id];
          return '<tr><td><b>'+esc(a.name)+'</b><div class="muted">'+esc(kindName(a.kind))+'</div></td>' +
            '<td class="num">'+balanceCells(a, bal).map(function(s){ return '<div class="'+(s.indexOf("−") === 0 ? "neg" : "")+'">'+esc(s)+'</div>'; }).join("")+'</td></tr>';
        }).join("") + '</tbody></table>';
    var n = $("miniNewAcc"); if(n) n.addEventListener("click", function(){ openAccount(null); });
  }
  function kindName(k){ var x = ACCOUNT_KINDS.filter(function(o){ return o.id === k; })[0]; return x ? x.name : k; }

  function renderTodo(){
    var rows = ledgerRows().filter(function(r){ return r.pending; });
    var month = rows.filter(function(r){ return ymOf(r.date) === selYM; });
    var items = [];
    if(D.accounts.length === 0) items.push('Creá tus <b>cuentas</b> (banco, efectivo, tarjeta, ahorro en dólares) para seguir los saldos.');
    if(month.length) items.push('<b>'+month.length+' movimiento'+(month.length === 1 ? "" : "s")+'</b> de '+esc(monthLabel(selYM))+' sin cuenta asignada. <button type="button" class="link" id="todoPending">Asignar</button>');
    else if(rows.length) items.push(rows.length + ' movimientos anteriores sin cuenta. <button type="button" class="link" id="todoPendingAll">Ver</button>');
    if(!incomeByMonth()[selYM]) items.push('No cargaste <b>ingresos</b> en '+esc(monthLabel(selYM))+'. <button type="button" class="link" data-new="ingreso">Cargar</button>');
    $("todo").innerHTML = items.length ? '<ul class="todo">' + items.map(function(t){ return '<li>'+t+'</li>'; }).join("") + '</ul>' : '<p class="empty">Todo en orden ✓</p>';
    var tp = $("todoPending"); if(tp) tp.addEventListener("click", function(){ filters.month = selYM; filters.pending = true; showView("movimientos"); });
    var ta = $("todoPendingAll"); if(ta) ta.addEventListener("click", function(){ filters.month = "all"; filters.pending = true; showView("movimientos"); });
    bindNewButtons($("todo"));
  }

  // ---- Cuentas ----
  function renderCuentas(){
    var b = balances(), nw = netWorth();
    var uyu = 0, usd = 0;
    D.accounts.forEach(function(a){ if(b[a.id]){ uyu += b[a.id].UYU; usd += b[a.id].USD; } });
    $("worthKpis").innerHTML =
      kpi("En pesos", esc(fmt(uyu, "UYU"))) +
      kpi("En dólares", esc(fmt(usd, "USD")), "≈ " + esc(fmt(usd * rate(), "UYU")) + " a $ " + rate()) +
      kpi(nw.receivables >= 0 ? "Te deben" : "Debés", esc(fmt(Math.abs(nw.receivables), "UYU")), "grupos y deudas") +
      kpi("Patrimonio", esc(fmt(nw.total, "UYU")), "todo sumado en pesos", nw.total >= 0 ? "pos" : "neg");
    var accs = D.accounts.slice().sort(function(a, b2){ return (a.archived - b2.archived) || (a.sort - b2.sort); });
    $("accountsTable").innerHTML = accs.length === 0 ? '<p class="empty">Creá tu primera cuenta con “＋ Nueva cuenta”.</p>' :
      '<table class="tbl"><thead><tr><th>Cuenta</th><th>Tipo</th><th class="num">Saldo $</th><th class="num">Saldo US$</th><th class="num">Total en $</th><th></th></tr></thead><tbody>' +
      accs.map(function(a){
        var bal = b[a.id];
        return '<tr class="'+(a.archived ? "archived" : "")+'"><td><button type="button" class="link strong" data-acc-ledger="'+a.id+'">'+esc(a.name)+'</button>'+(a.archived ? ' <span class="muted">(archivada)</span>' : '')+(a.balanceAt ? '<div class="muted small">saldo inicial al '+esc(dayLabel(localDateStr(new Date(a.balanceAt))))+'</div>' : '')+'</td>' +
          '<td>'+esc(kindName(a.kind))+'</td>' +
          '<td class="num '+(bal.UYU < 0 ? "neg" : "")+'">'+(a.currency !== "USD" ? esc(fmt(bal.UYU, "UYU")) : "—")+'</td>' +
          '<td class="num '+(bal.USD < 0 ? "neg" : "")+'">'+(a.currency !== "UYU" ? esc(fmt(bal.USD, "USD")) : "—")+'</td>' +
          '<td class="num">'+esc(fmt(accountTotalUYU(bal), "UYU"))+'</td>' +
          '<td class="num"><button type="button" class="link" data-acc-edit="'+a.id+'">Editar</button></td></tr>';
      }).join("") + '</tbody></table>';
    $("accountsTable").querySelectorAll("[data-acc-edit]").forEach(function(btn){
      btn.addEventListener("click", function(){ openAccount(accountById(btn.getAttribute("data-acc-edit"))); });
    });
    $("accountsTable").querySelectorAll("[data-acc-ledger]").forEach(function(btn){
      btn.addEventListener("click", function(){ filters.account = btn.getAttribute("data-acc-ledger"); filters.month = "all"; filters.pending = false; showView("movimientos"); });
    });
  }

  // ---- Movimientos ----
  var filters = {month:null, type:"all", account:"all", pending:false, q:""};
  var TYPE_OPTS = [["all","Todos"],["ingreso","Ingresos"],["gasto","Gastos"],["transferencia","Transferencias"],["ajuste","Ajustes"],["pago_grupo","Pagos de grupo"],["deuda","Deudas"]];
  function fillSelect(sel, opts, value){
    sel.innerHTML = opts.map(function(o){ return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>'; }).join("");
    if(value != null) sel.value = value;
  }
  function accountOptions(withNone, allowArchived){
    var opts = withNone ? [["", withNone]] : [];
    return opts.concat(D.accounts.filter(function(a){ return allowArchived || !a.archived; }).map(function(a){ return [a.id, a.name]; }));
  }
  function renderMovimientos(){
    var rows = ledgerRows();
    if(!filters.month) filters.month = currentYM();
    var months = {}; rows.forEach(function(r){ months[ymOf(r.date)] = true; }); months[currentYM()] = true;
    fillSelect($("fMonth"), [["all","Todos"]].concat(Object.keys(months).sort().reverse().map(function(m){ return [m, monthLabel(m)]; })), filters.month);
    fillSelect($("fType"), TYPE_OPTS, filters.type);
    fillSelect($("fAccount"), [["all","Todas"]].concat(accountOptions(null, true)).concat([["none","Sin cuenta"]]), filters.account);
    $("fPending").checked = filters.pending;
    $("fSearch").value = filters.q;

    var q = filters.q.trim().toLowerCase();
    var shown = rows.filter(function(r){
      if(filters.month !== "all" && ymOf(r.date) !== filters.month) return false;
      if(filters.type !== "all"){
        var t = r.type === "gasto_app" ? "gasto" : r.type;
        if(t !== filters.type) return false;
      }
      if(filters.account === "none" && r.accountId) return false;
      if(filters.account !== "all" && filters.account !== "none" && r.accountId !== filters.account &&
        !(r.ref.type === "movement" && (accountTouched(r.ref.id, filters.account)))) return false;
      if(filters.pending && !r.pending) return false;
      if(q && (r.desc + " " + r.category + " " + r.typeLabel).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var pend = shown.filter(function(r){ return r.pending && r.assignable; });
    $("bulkBar").hidden = pend.length < 2 || D.accounts.length === 0;
    if(!$("bulkBar").hidden){
      $("bulkBar").innerHTML = '<span>'+pend.length+' movimientos de esta lista sin cuenta.</span> Asignarlos todos a ' +
        '<select id="bulkAcc">'+accountOptions(null).map(function(o){ return '<option value="'+o[0]+'">'+esc(o[1])+'</option>'; }).join("")+'</select>' +
        ' <button type="button" class="btn small" id="bulkApply">Asignar</button>';
      $("bulkApply").addEventListener("click", function(){
        var acc = $("bulkAcc").value;
        pend.forEach(function(r){ setLink(r.ref.type, r.ref.id, acc, (link(r.ref.type, r.ref.id) || {}).installments || 1); });
        toast(pend.length + " movimientos asignados");
        render();
      });
    }

    var totalIn = 0, totalOut = 0;
    shown.forEach(function(r){
      var v = toUYU(r.amount, r.currency);
      if(r.type === "transferencia") return;
      if(v > 0) totalIn += v; else totalOut += -v;
    });
    var accOpts = accountOptions("Sin cuenta");
    $("ledger").innerHTML = shown.length === 0 ? '<p class="empty">Nada para mostrar con estos filtros.</p>' :
      '<table class="tbl ledger"><thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th><th class="num">Monto</th><th></th></tr></thead><tbody>' +
      shown.map(function(r){
        var accCell;
        if(r.ref.type === "movement") accCell = esc(r.accountLabel);
        else if(r.assignable){
          accCell = '<select class="inline-acc'+(r.pending ? " pending" : "")+'" data-ref="'+r.ref.type+':'+r.ref.id+'">' +
            accOpts.map(function(o){ return '<option value="'+o[0]+'"'+((r.accountId || "") === o[0] ? " selected" : "")+'>'+esc(o[1])+'</option>'; }).join("") + '</select>';
          var acc = accountById(r.accountId);
          if(r.installmentsAllowed && acc && acc.kind === "tarjeta"){
            accCell += ' <select class="inline-inst" data-ref="'+r.ref.type+':'+r.ref.id+'" title="Cuotas">' +
              instOptions().map(function(n){ return '<option value="'+n+'"'+(n === (r.installments || 1) ? " selected" : "")+'>'+(n === 1 ? "1 pago" : n + " cuotas")+'</option>'; }).join("") + '</select>';
          }
        } else accCell = '<span class="muted">'+esc(r.accountLabel || "—")+'</span>';
        var amtCls = r.type === "transferencia" ? "" : (r.amount > 0 ? "pos" : (r.amount < 0 ? "neg" : "muted"));
        return '<tr class="'+(r.pending ? "is-pending" : "")+'">' +
          '<td class="nowrap">'+dayLabel(r.date)+'</td>' +
          '<td class="muted">'+esc(r.typeLabel)+'</td>' +
          '<td>'+esc(r.desc)+(r.extra ? '<div class="muted small">'+esc(r.extra)+'</div>' : '')+'</td>' +
          '<td>'+esc(r.category)+'</td>' +
          '<td>'+accCell+(r.beforeBalance ? '<div class="muted small" title="Es anterior a la fecha del saldo de la cuenta: ya está incluido en ese saldo.">no cambia el saldo</div>' : '')+'</td>' +
          '<td class="num '+amtCls+'">'+(r.amount ? esc(fmt(r.type === "transferencia" ? r.amount : r.amount, r.currency)) : '<span class="muted">sin plata</span>')+'</td>' +
          '<td class="num">'+(r.editable ? '<button type="button" class="link" data-edit-mov="'+r.ref.id+'">Editar</button>' : '')+'</td>' +
        '</tr>';
      }).join("") + '</tbody><tfoot><tr><td colspan="5">'+shown.length+' movimientos · entra '+esc(fmt(totalIn, "UYU"))+' · sale '+esc(fmt(totalOut, "UYU"))+'</td>' +
      '<td class="num">'+esc(fmt(totalIn - totalOut, "UYU"))+'</td><td></td></tr></tfoot></table>';

    $("ledger").querySelectorAll(".inline-acc").forEach(function(sel){
      sel.addEventListener("change", function(){
        var p = sel.getAttribute("data-ref").split(":");
        var cur = link(p[0], p[1]) || {};
        var acc = accountById(sel.value);
        setLink(p[0], p[1], sel.value || null, acc && acc.kind === "tarjeta" ? (cur.installments || 1) : 1);
        render();
      });
    });
    $("ledger").querySelectorAll(".inline-inst").forEach(function(sel){
      sel.addEventListener("change", function(){
        var p = sel.getAttribute("data-ref").split(":");
        var cur = link(p[0], p[1]) || {};
        setLink(p[0], p[1], cur.accountId || null, Number(sel.value));
        render();
      });
    });
    $("ledger").querySelectorAll("[data-edit-mov]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var m = D.movements.filter(function(x){ return x.id === btn.getAttribute("data-edit-mov"); })[0];
        if(m) openMovement(m.kind, m);
      });
    });
  }
  function accountTouched(movId, acc){
    var m = D.movements.filter(function(x){ return x.id === movId; })[0];
    return m && (m.accountId === acc || m.toAccountId === acc);
  }
  [["fMonth","month"],["fType","type"],["fAccount","account"]].forEach(function(p){
    $(p[0]).addEventListener("change", function(){ filters[p[1]] = $(p[0]).value; renderMovimientos(); });
  });
  $("fPending").addEventListener("change", function(){ filters.pending = $("fPending").checked; renderMovimientos(); });
  $("fSearch").addEventListener("input", function(){ filters.q = $("fSearch").value; renderMovimientos(); });
  function instOptions(){ var o = []; for(var n = 1; n <= 24; n++) o.push(n); return o.concat([30, 36, 48]); }

  // ---- Deudas ----
  function settled(v){ return Math.abs(v) < 0.5; }
  function partText(p){ return p.name + ": " + (settled(p.net) ? "al día" : (p.net > 0 ? "te debe " : "le debés ") + fmt(Math.abs(p.net), "UYU")); }
  function renderDebtsMini(){
    var people = peopleBalances().filter(function(p){ return !settled(p.net); });
    $("debtsMini").innerHTML = people.length === 0 ? '<p class="empty">Estás al día con todos ✓</p>' :
      '<ul class="mini-list">' + people.slice(0, 6).map(function(p){
        return '<li><span>'+esc(p.side.name)+'</span><span class="'+(p.net > 0 ? "pos" : "neg")+'">'+(p.net > 0 ? "te debe " : "le debés ")+esc(fmt(Math.abs(p.net), "UYU"))+'</span></li>';
      }).join("") + '</ul>';
  }
  function describeDebt(d){
    var o = otherSide(d).name;
    if(d.kind === "prestamo") return d.creditor.me ? "Le prestaste a " + o : o + " te prestó";
    if(d.kind === "gasto") return d.creditor.me ? "Pagaste algo de " + o : o + " pagó algo tuyo";
    return d.debtor.me ? "Le devolviste a " + o : o + " te devolvió";
  }
  function renderDeudas(){
    var people = peopleBalances(), showAll = $("debtShowAll").checked;
    var owed = 0, owe = 0;
    people.forEach(function(p){ if(!settled(p.net)){ if(p.net > 0) owed += p.net; else owe -= p.net; } });
    $("debtKpis").innerHTML =
      kpi("Te deben", esc(fmt(owed, "UYU")), "suma de lo que te deben", "pos") +
      kpi("Debés", esc(fmt(owe, "UYU")), "suma de lo que debés", owe > 0 ? "neg" : "") +
      kpi("Neto", esc(fmt(owed - owe, "UYU")), owed - owe >= 0 ? "a tu favor" : "en contra", owed - owe >= 0 ? "pos" : "neg");

    var shown = people.filter(function(p){ return showAll || !settled(p.net); });
    $("debtPeople").innerHTML = shown.length === 0 ? '<p class="empty">Estás al día con todos ✓</p>' :
      '<table class="tbl"><thead><tr><th>Persona</th><th>Detalle</th><th class="num">Saldo</th><th></th></tr></thead><tbody>' +
      shown.map(function(p, i){
        var parts = p.parts.filter(function(x){ return !settled(x.net) || p.parts.length === 1; });
        return '<tr><td><strong>'+esc(p.side.name)+'</strong></td>' +
          '<td><div class="parts">'+parts.map(function(x){ return '<span class="part">'+esc(partText(x))+'</span>'; }).join("")+'</div></td>' +
          '<td class="num '+(settled(p.net) ? "" : (p.net > 0 ? "pos" : "neg"))+'">'+(settled(p.net) ? "al día" : esc((p.net > 0 ? "te debe " : "le debés ") + fmt(Math.abs(p.net), "UYU")))+'</td>' +
          '<td class="num">'+(settled(p.debtNet) ? "" : '<button type="button" class="link" data-debt-pay="'+i+'">Anotar devolución</button>')+'</td></tr>';
      }).join("") + '</tbody></table>' +
      '<p class="muted small">Lo de los grupos se salda desde el celular (Amigos → la persona → Saldar).</p>';
    $("debtPeople").querySelectorAll("[data-debt-pay]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var p = shown[Number(btn.getAttribute("data-debt-pay"))];
        openDebt(null, {kind:"pago", key:p.key, dir: p.debtNet > 0 ? "el" : "yo", amount: Math.round(Math.abs(p.debtNet) * 100) / 100});
      });
    });

    var list = D.debts.slice().sort(function(a, b){ return b.date.localeCompare(a.date); });
    $("debtHistory").innerHTML = list.length === 0 ? '<p class="empty">Todavía no anotaste deudas fuera de los grupos.</p>' :
      '<table class="tbl"><thead><tr><th>Fecha</th><th>Qué pasó</th><th>Descripción</th><th class="num">Monto</th><th>Cuenta</th><th></th></tr></thead><tbody>' +
      list.map(function(d){
        var cash = debtCash(d), l = link("debt", d.id);
        var acc = cash ? '<select data-debt-acc="'+d.id+'">'+accountOptions("Sin cuenta").map(function(o){ return '<option value="'+o[0]+'"'+((l && l.accountId || "") === o[0] ? " selected" : "")+'>'+esc(o[1])+'</option>'; }).join("")+'</select>'
          : '<span class="muted small">no movió tu plata</span>';
        return '<tr class="'+(counts(d) ? "" : "archived")+'"><td class="nowrap">'+esc(dayLabel(d.date))+'</td><td>'+esc(describeDebt(d))+(counts(d) ? '' : ' <span class="muted small">(registro)</span>')+'</td><td>'+esc(d.description || "")+(d.note ? '<div class="note">'+esc(d.note)+'</div>' : '')+'</td>' +
          '<td class="num">'+esc(fmt(d.amount, "UYU"))+'</td><td>'+acc+'</td>' +
          '<td class="num"><button type="button" class="link" data-debt-edit="'+d.id+'">Editar</button></td></tr>';
      }).join("") + '</tbody></table>';
    $("debtHistory").querySelectorAll("[data-debt-acc]").forEach(function(sel){
      sel.addEventListener("change", function(){ setLink("debt", sel.getAttribute("data-debt-acc"), sel.value || null, 1); render(); });
    });
    $("debtHistory").querySelectorAll("[data-debt-edit]").forEach(function(btn){
      btn.addEventListener("click", function(){ openDebt(D.debts.filter(function(d){ return d.id === btn.getAttribute("data-debt-edit"); })[0]); });
    });
  }
  $("debtShowAll").addEventListener("change", render);

  // diálogo de deuda
  var editingDebt = null, debtKind = "prestamo", debtDir = "yo", debtPeople = [];
  var DIR_LABELS = {
    prestamo:{yo:"Yo le presté", el:"Me prestó"},
    gasto:{yo:"Yo pagué algo suyo", el:"Pagó algo mío"},
    pago:{yo:"Yo le devolví", el:"Me devolvió"}
  };
  // ¿La plata salió de mi bolsillo (−), entró (+) o no se movió (0)?
  function draftCash(){
    if(debtKind === "gasto") return debtDir === "yo" ? -1 : 0;
    return debtDir === "yo" ? -1 : 1;
  }
  function syncDebtDialog(){
    $("debtKindSeg").querySelectorAll("button").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-kind") === debtKind); });
    $("debtDirSeg").querySelectorAll("button").forEach(function(b){
      var d = b.getAttribute("data-dir");
      b.textContent = DIR_LABELS[debtKind][d];
      b.classList.toggle("on", d === debtDir);
    });
    $("debtOtherField").hidden = $("debtPerson").value !== "__other";
    var cash = draftCash();
    $("debtAccField").hidden = cash === 0;
    $("debtAccLabel").textContent = cash < 0 ? "Sale de la cuenta" : "Entra a la cuenta";
    $("debtCatField").hidden = !(debtKind === "gasto" && debtDir === "el");
    $("debtHint").textContent = debtKind === "gasto" && debtDir === "el" ? "Cuenta como gasto tuyo en la categoría elegida, aunque la plata la puso la otra persona." :
      debtKind === "pago" ? "Resta de lo que se deben." : "";
  }
  $("debtKindSeg").querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){ debtKind = b.getAttribute("data-kind"); syncDebtDialog(); });
  });
  $("debtDirSeg").querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){ debtDir = b.getAttribute("data-dir"); syncDebtDialog(); });
  });
  $("debtPerson").addEventListener("change", function(){ syncDebtDialog(); if($("debtPerson").value === "__other") $("debtOther").focus(); });
  fillSelect($("debtCategory"), CATEGORIES.map(function(c){ return [c.id, c.name]; }));

  function openDebt(d, preset){
    preset = preset || {};
    editingDebt = d || null;
    debtPeople = peopleBalances().map(function(p){ return p.side; });
    fillSelect($("debtPerson"), debtPeople.map(function(sd){ return [personKey(sd), sd.name]; }).concat([["__other", "Otra persona…"]]));
    $("debtTitle").textContent = d ? "Editar deuda" : "Anotar deuda";
    if(d){
      debtKind = d.kind;
      debtDir = d.kind === "pago" ? (d.debtor.me ? "yo" : "el") : (d.creditor.me ? "yo" : "el");
      $("debtPerson").value = personKey(otherSide(d));
      $("debtAmount").value = d.amount;
      $("debtDate").value = d.date;
      $("debtDesc").value = d.description || "";
      $("debtNote").value = d.note || "";
      $("debtCategory").value = d.categoryId || "cat-otros";
    } else {
      debtKind = preset.kind || "prestamo";
      debtDir = preset.dir || "yo";
      $("debtPerson").value = preset.key || (debtPeople.length ? personKey(debtPeople[0]) : "__other");
      $("debtAmount").value = preset.amount || "";
      $("debtDate").value = todayStr();
      $("debtDesc").value = "";
      $("debtNote").value = "";
      $("debtCategory").value = "cat-otros";
    }
    $("debtOther").value = "";
    var l = d ? link("debt", d.id) : null;
    fillSelect($("debtAccount"), accountOptions("Sin indicar"), l && l.accountId || "");
    $("debtDelete").hidden = !d;
    syncDebtDialog();
    openDialog($("debtDialog"));
    setTimeout(function(){ try{ $("debtAmount").focus(); }catch(e){} }, 40);
  }
  $("newDebtBtn").addEventListener("click", function(){ openDebt(null); });

  function debtToRow(d){
    function u(side){ return side.me ? session.user.id : (side.user || null); }
    function n(side){ return (side.me ? D.me : side.name || "").slice(0, 40); }
    return {kind:d.kind, date:d.date, amount:d.amount, description:d.description || "", category_id:d.categoryId || null,
      creditor_user:u(d.creditor), creditor_name:n(d.creditor), debtor_user:u(d.debtor), debtor_name:n(d.debtor),
      note:d.note || null, settles_id:d.settlesId || null};
  }
  // En modo local las deudas viven en los datos del Libro de Gastos.
  function saveLocalDebts(){
    try{
      var sh = JSON.parse(localStorage.getItem(LS_SHARED)) || {};
      sh.debts = D.debts;
      localStorage.setItem(LS_SHARED, JSON.stringify(sh));
    }catch(e){}
  }
  $("debtSave").addEventListener("click", function(){
    var amount = parseFloat($("debtAmount").value);
    if(!(amount > 0)){ toast("Poné un monto válido"); return; }
    var key = $("debtPerson").value, other;
    if(key === "__other"){
      var nm = $("debtOther").value.trim();
      if(!nm){ toast("Poné el nombre de la persona"); return; }
      other = debtPeople.filter(function(sd){ return !sd.user && sd.name.trim().toLowerCase() === nm.toLowerCase(); })[0] || {name:nm};
    } else {
      other = debtPeople.filter(function(sd){ return personKey(sd) === key; })[0];
    }
    if(!other){ toast("Elegí con quién"); return; }
    other = other.user ? {user:other.user, name:other.name} : {name:other.name};
    // "deudor le debe a acreedor": en préstamo y gasto el que pone la plata es acreedor; en devolución, deudor.
    var iGive = debtDir === "yo", meIsCreditor = debtKind === "pago" ? !iGive : iGive;
    var d = {
      id: editingDebt ? editingDebt.id : uid(), kind:debtKind, date:$("debtDate").value || todayStr(), amount:amount,
      description:$("debtDesc").value.trim(), categoryId: debtKind === "gasto" && debtDir === "el" ? $("debtCategory").value : null,
      creditor: meIsCreditor ? {me:true} : other, debtor: meIsCreditor ? other : {me:true},
      createdAt: editingDebt ? editingDebt.createdAt : new Date().toISOString(),
      note: $("debtNote").value.trim(), settlesId: editingDebt ? editingDebt.settlesId || null : null,
      ignored: editingDebt ? !!editingDebt.ignored : false
    };
    var isNew = !editingDebt;
    if(isNew) D.debts.unshift(d);
    else D.debts = D.debts.map(function(x){ return x.id === d.id ? d : x; });
    var acc = draftCash() !== 0 ? $("debtAccount").value : "";
    var saved = REMOTE
      ? run(function(){
          var row = debtToRow(d);
          function send(r){ return isNew ? sb.from("debts").insert(Object.assign({id:d.id}, r)) : sb.from("debts").update(r).eq("id", d.id); }
          // Si falta correr la parte 12, guarda sin comentario.
          return send(row).then(function(res){
            if(res.error && (/note|settles_id/.test(res.error.message || "") || res.error.code === "42501")){
              if(row.note || row.settles_id) toast("Falta correr supabase/12-deudas-detalle.sql: se guardó sin comentario");
              delete row.note; delete row.settles_id; return send(row);
            }
            return res;
          });
        })
      : (saveLocalDebts(), Promise.resolve(true));
    saved.then(function(ok){
      if(!ok) return;
      var l = link("debt", d.id);
      if(acc || l) setLink("debt", d.id, acc || null, 1);
      toast("Guardado");
      render();
    });
    closeDialog($("debtDialog"));
    render();
  });
  $("debtDelete").addEventListener("click", function(){
    if(!editingDebt || !confirm("¿Eliminar esta deuda? La otra persona también deja de verla.")) return;
    var id = editingDebt.id;
    D.debts = D.debts.filter(function(x){ return x.id !== id; });
    var done = REMOTE ? run(function(){ return sb.from("debts").delete().eq("id", id); }) : (saveLocalDebts(), Promise.resolve(true));
    done.then(function(ok){ if(ok){ if(link("debt", id)) setLink("debt", id, null, 1); toast("Eliminada"); render(); } });
    closeDialog($("debtDialog"));
    render();
  });

  // ---- Tarjetas ----
  function renderTarjetas(){
    var cards = D.accounts.filter(function(a){ return a.kind === "tarjeta" && !a.archived; });
    var b = balances();
    if(cards.length === 0){
      $("cards").innerHTML = '<div class="card"><p class="empty">No tenés tarjetas. Creá una cuenta de tipo “Tarjeta de crédito” en Cuentas.</p></div>';
      return;
    }
    var now = currentYM();
    $("cards").innerHTML = cards.map(function(c){
      var bal = b[c.id], plans = installmentPlans(c.id);
      var active = plans.filter(function(p){ return p.remaining > 0; });
      // Mes por mes, desde este hasta la última cuota.
      var last = now;
      active.forEach(function(p){ if(p.lastYM > last) last = p.lastYM; });
      var months = [];
      for(var ym = now; ym <= last; ym = addMonths(ym, 1)){
        var row = {ym:ym, uyu:0, usd:0, items:[]};
        active.forEach(function(p){
          p.items.forEach(function(q){
            if(q.ym !== ym) return;
            if(p.currency === "USD") row.usd += q.amount; else row.uyu += q.amount;
            row.items.push({desc:p.desc, num:q.num, n:p.n, amount:q.amount, currency:p.currency, final:q.num === p.n});
          });
        });
        months.push(row);
      }
      var pendingUYU = 0, pendingUSD = 0;
      active.forEach(function(p){
        p.items.forEach(function(q){ if(q.ym > now){ if(p.currency === "USD") pendingUSD += q.amount; else pendingUYU += q.amount; } });
      });
      var thisMonth = months[0] || {uyu:0, usd:0};
      return '<div class="card"><div class="card-head"><h2>'+esc(c.name)+'</h2><div class="head-actions">' +
          '<button type="button" class="btn ghost small" data-card-buy="'+c.id+'">＋ Compra</button>' +
          '<button type="button" class="btn small" data-pay-card="'+c.id+'">Pagar tarjeta</button></div></div>' +
        '<div class="kpis small four">' +
          kpi("Deuda en $", esc(fmt(-bal.UYU, "UYU")), "", bal.UYU < 0 ? "neg" : "") +
          kpi("Deuda en US$", esc(fmt(-bal.USD, "USD")), "", bal.USD < 0 ? "neg" : "") +
          kpi("Cuotas de " + MONTHS[Number(now.slice(5)) - 1], esc(fmt(thisMonth.uyu, "UYU")) + (thisMonth.usd ? " + " + esc(fmt(thisMonth.usd, "USD")) : ""), "lo que viene este mes") +
          kpi("Cuotas que faltan", esc(fmt(pendingUYU, "UYU")) + (pendingUSD ? " + " + esc(fmt(pendingUSD, "USD")) : ""), "de los meses siguientes") +
        '</div>' +
        (active.length ? '<h3>Compras en cuotas</h3><table class="tbl"><thead><tr><th>Compra</th><th>Fecha</th><th class="num">Cuota</th><th class="num">Este mes</th><th class="num">Faltan</th><th>Termina</th><th class="num">Resta pagar</th><th></th></tr></thead><tbody>' +
          active.map(function(p){
            return '<tr><td>'+esc(p.desc)+'</td><td>'+dayLabel(p.date)+'</td>' +
              '<td class="num">'+esc(fmt(p.cuota, p.currency))+'</td>' +
              '<td class="num">'+(p.current ? p.current + ' de ' + p.n : '<span class="muted">—</span>')+'</td>' +
              '<td class="num">'+p.remaining+'</td><td>'+esc(monthLabel(p.lastYM))+'</td>' +
              '<td class="num">'+esc(fmt(p.cuota * p.remaining, p.currency))+'</td>' +
              '<td class="num">'+(p.movId ? '<button type="button" class="link" data-edit-mov="'+p.movId+'">Editar</button>' : '<span class="muted small">celular</span>')+'</td></tr>';
          }).join("") + '</tbody></table>' +
          '<h3>Mes por mes</h3><div class="month-plan">' + months.map(function(mo){
            return '<details'+(mo.ym === now ? ' open' : '')+'><summary><span>'+esc(monthLabel(mo.ym))+(mo.ym === now ? ' <span class="muted small">(este mes)</span>' : '')+'</span>' +
              '<b>'+esc(fmt(mo.uyu, "UYU"))+(mo.usd ? ' + '+esc(fmt(mo.usd, "USD")) : '')+'</b></summary>' +
              (mo.items.length ? '<ul>' + mo.items.map(function(it){
                return '<li><span>'+esc(it.desc)+' <span class="muted">· cuota '+it.num+' de '+it.n+(it.final ? ' (última)' : '')+'</span></span><span>'+esc(fmt(it.amount, it.currency))+'</span></li>';
              }).join("") + '</ul>' : '<p class="empty small">Sin cuotas este mes.</p>') +
            '</details>';
          }).join("") + '</div>' : '<p class="empty">Sin compras en cuotas pendientes. Anotalas con “＋ Compra”.</p>') +
      '</div>';
    }).join("");
    $("cards").querySelectorAll("[data-pay-card]").forEach(function(btn){
      btn.addEventListener("click", function(){
        openMovement("transferencia", null, {toAccountId: btn.getAttribute("data-pay-card"), description:"Pago de tarjeta"});
      });
    });
    $("cards").querySelectorAll("[data-card-buy]").forEach(function(btn){
      btn.addEventListener("click", function(){ openMovement("gasto", null, {accountId: btn.getAttribute("data-card-buy")}); });
    });
    $("cards").querySelectorAll("[data-edit-mov]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var m = D.movements.filter(function(x){ return x.id === btn.getAttribute("data-edit-mov"); })[0];
        if(m) openMovement(m.kind, m);
      });
    });
  }

  // ---- Configuración ----
  function renderConfig(){
    $("cfgEnabled").checked = !!D.settings.enabled;
    $("cfgRate").value = D.settings.usdRate;
    $("cfgIncomeCats").value = (D.settings.incomeCategories || []).join(", ");
  }
  $("cfgSave").addEventListener("click", function(){
    var r = parseFloat($("cfgRate").value);
    if(!(r > 0)){ toast("Poné un valor del dólar válido"); return; }
    D.settings.enabled = $("cfgEnabled").checked;
    D.settings.usdRate = r;
    D.settings.incomeCategories = $("cfgIncomeCats").value.split(",").map(function(s){ return s.trim(); }).filter(Boolean);
    saveSettings().then(function(ok){ if(ok) toast("Guardado"); });
    render();
  });

  // ---------------- diálogo: movimiento ----------------
  var movDialog = $("movDialog"), editingMov = null, movKind = "ingreso";
  function openDialog(el){ el.hidden = false; var f = el.querySelector("input:not([type=hidden]), select"); if(f) setTimeout(function(){ try{ if(!el.contains(document.activeElement)) f.focus(); }catch(e){} }, 30); }
  function closeDialog(el){ el.hidden = true; }
  document.querySelectorAll(".overlay [data-close]").forEach(function(b){
    b.addEventListener("click", function(){ closeDialog(b.closest(".overlay")); });
  });
  document.querySelectorAll(".overlay").forEach(function(o){
    o.addEventListener("click", function(ev){ if(ev.target === o && o.id !== "loginOverlay") closeDialog(o); });
  });
  document.addEventListener("keydown", function(ev){
    if(ev.key === "Escape") document.querySelectorAll(".overlay").forEach(function(o){ if(o.id !== "loginOverlay") o.hidden = true; });
  });
  function bindNewButtons(root){
    (root || document).querySelectorAll("[data-new]").forEach(function(b){
      if(b._bound) return; b._bound = true;
      b.addEventListener("click", function(){ openMovement(b.getAttribute("data-new"), null); });
    });
  }
  bindNewButtons();
  $("movKind").querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){ setMovKind(b.getAttribute("data-kind")); });
  });

  function setMovKind(kind){
    movKind = kind;
    $("movKind").querySelectorAll("button").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-kind") === kind); });
    var transfer = kind === "transferencia";
    $("movToRow").hidden = !transfer;
    $("movCatField").hidden = transfer || kind === "ajuste";
    $("movAccountLabel").textContent = transfer ? "Desde la cuenta" : (kind === "ingreso" ? "Entra en" : (kind === "gasto" ? "Sale de" : "Cuenta"));
    $("movAmountLabel").textContent = transfer ? "Monto que sale" : (kind === "ajuste" ? "Monto (+ suma, − resta)" : "Monto");
    var cats = kind === "ingreso"
      ? (D.settings.incomeCategories || []).map(function(c){ return [c, c]; })
      : CATEGORIES.map(function(c){ return [c.id, c.name]; });
    var prev = $("movCategory").value;
    fillSelect($("movCategory"), cats);
    if(prev && cats.some(function(c){ return c[0] === prev; })) $("movCategory").value = prev;
    $("movHint").textContent = kind === "gasto"
      ? "Para gastos del día a día usá la app del celular; acá conviene cargar los que son en dólares o que no querés en el Libro de Gastos."
      : kind === "ajuste" ? "Para corregir un saldo que no coincide con el banco." : "";
    updateInstField();
    updateRateHint();
  }
  function updateInstField(){
    var acc = accountById($("movAccount").value);
    var show = movKind === "gasto" && acc && acc.kind === "tarjeta";
    $("movInstField").hidden = !show;
    if(!show) $("movInst").value = "1";
    $("movPlanBox").hidden = !(show && Number($("movInst").value) > 1);
    $("movSaveAnother").hidden = !(show && !editingMov);
    if(movKind === "gasto") $("movHint").textContent = show ? "" :
      "Para gastos del día a día usá la app del celular; acá conviene cargar los que son en dólares o que no querés en el Libro de Gastos.";
    updatePlanHint();
  }
  // Compra en cuotas: el monto puede ser la cuota o el total, y puede venir "por la mitad".
  var amtMode = "cuota", startTouched = false;
  function setAmtMode(mode){
    amtMode = mode;
    $("movAmtMode").querySelectorAll("button").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-mode") === mode); });
    updatePlanHint();
  }
  $("movAmtMode").querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){ setAmtMode(b.getAttribute("data-mode")); });
  });
  function draftPlan(){
    var n = Number($("movInst").value) || 1, a = parseFloat($("movAmount").value) || 0;
    var from = Math.min(n, Math.max(1, parseInt($("movInstFrom").value, 10) || 1));
    var start = $("movInstStart").value || ymOf($("movDate").value || todayStr());
    return cuotaPlan({date:$("movDate").value || todayStr(), total: amtMode === "cuota" ? a * n : a, n:n, from:from, start:start + "-01"});
  }
  function updatePlanHint(){
    if($("movPlanBox").hidden){ $("movPlanHint").textContent = ""; return; }
    var p = draftPlan(), cur = $("movCurrency").value;
    if(!(p.cuota > 0)){ $("movPlanHint").textContent = ""; return; }
    var first = p.items[0], last = p.items[p.items.length - 1];
    $("movPlanHint").textContent = p.n + " cuotas de " + fmt(p.cuota, cur) + " (total " + fmt(p.cuota * p.n, cur) + "). " +
      (p.from > 1 ? "Faltan " + p.items.length + ": " : "") +
      "de " + monthLabel(first.ym) + " a " + monthLabel(last.ym) + " · suma a la deuda " + fmt(p.tracked, cur) + ".";
  }
  // Por defecto, como en el resumen de la tarjeta: una compra nueva empieza a pagarse el
  // mes siguiente; si ya venía en cuotas, la cuota que dice es la del mes que viene.
  function defaultStart(){
    var from = parseInt($("movInstFrom").value, 10) || 1;
    return addMonths(from > 1 ? currentYM() : ymOf($("movDate").value || todayStr()), 1);
  }
  $("movInst").addEventListener("change", updateInstField);
  $("movInstFrom").addEventListener("input", function(){
    // Si viene por la mitad, lo más común es que la cuota que dice sea la del mes que viene.
    if(!startTouched) $("movInstStart").value = defaultStart();
    updatePlanHint();
  });
  $("movInstStart").addEventListener("input", function(){ startTouched = true; updatePlanHint(); });
  $("movDate").addEventListener("change", function(){
    if(!startTouched) $("movInstStart").value = defaultStart();
    updatePlanHint();
  });
  function updateRateHint(){
    if(movKind !== "transferencia"){ $("movRateHint").textContent = ""; return; }
    var a = parseFloat($("movAmount").value), b = parseFloat($("movToAmount").value);
    var ca = $("movCurrency").value, cb = $("movToCurrency").value;
    $("movRateHint").textContent = (a > 0 && b > 0 && ca !== cb)
      ? "Tipo de cambio: $ " + (ca === "UYU" ? (a / b) : (b / a)).toFixed(2) + " por US$ 1" : "";
  }
  function syncCurrency(selAcc, selCur){
    var acc = accountById(selAcc.value);
    if(acc && acc.currency !== "AMBAS") selCur.value = acc.currency;
  }
  $("movAccount").addEventListener("change", function(){ syncCurrency($("movAccount"), $("movCurrency")); updateInstField(); });
  $("movTo").addEventListener("change", function(){ syncCurrency($("movTo"), $("movToCurrency")); autoToAmount(); });
  $("movAmount").addEventListener("input", function(){ autoToAmount(); updateRateHint(); updatePlanHint(); });
  $("movToAmount").addEventListener("input", updateRateHint);
  $("movCurrency").addEventListener("change", function(){ autoToAmount(); updateRateHint(); });
  $("movToCurrency").addEventListener("change", function(){ autoToAmount(); updateRateHint(); });
  var toAmountTouched = false;
  $("movToAmount").addEventListener("keydown", function(){ toAmountTouched = true; });
  function autoToAmount(){
    if(movKind !== "transferencia" || toAmountTouched) return;
    var a = parseFloat($("movAmount").value);
    if(!(a > 0)) return;
    var ca = $("movCurrency").value, cb = $("movToCurrency").value;
    $("movToAmount").value = ca === cb ? a : (ca === "UYU" ? (a / rate()).toFixed(2) : (a * rate()).toFixed(2));
    updateRateHint();
  }

  function openMovement(kind, m, preset){
    if(D.accounts.length === 0 && kind !== "gasto"){
      toast("Primero creá una cuenta");
      showView("cuentas");
      openAccount(null);
      return;
    }
    editingMov = m;
    toAmountTouched = !!m;
    $("movTitle").textContent = m ? "Editar " + MOV_KINDS[m.kind].toLowerCase() : "Nuevo movimiento";
    $("movKind").hidden = !!m;
    var accOpts = accountOptions(kind === "gasto" ? "Sin cuenta" : null);
    fillSelect($("movAccount"), accOpts);
    fillSelect($("movTo"), accountOptions(null));
    fillSelect($("movInst"), instOptions().map(function(n){ return [String(n), n === 1 ? "1 pago" : n + " cuotas"]; }));
    preset = preset || {};
    if(!m && preset.accountId) $("movAccount").value = preset.accountId;
    startTouched = !!(m && m.instStart);
    setAmtMode(m ? "total" : amtMode);
    $("movInstFrom").value = m ? (m.instFrom || 1) : 1;
    $("movInstStart").value = m ? (m.instStart ? ymOf(m.instStart) : ymOf(m.date)) : addMonths(currentYM(), 1);
    setMovKind(kind);
    $("movDate").value = m ? m.date : todayStr();
    $("movAmount").value = m ? Math.abs(m.amount) * (m.kind === "ajuste" && m.amount < 0 ? -1 : 1) : "";
    if(m){
      $("movAccount").value = m.accountId || "";
      $("movCurrency").value = m.currency;
      $("movTo").value = m.toAccountId || "";
      $("movToAmount").value = m.toAmount || "";
      $("movToCurrency").value = m.toCurrency || "UYU";
      if(m.category) $("movCategory").value = m.category;
      $("movInst").value = String(m.installments || 1);
      $("movDesc").value = m.description || "";
    } else {
      $("movDesc").value = preset.description || "";
      $("movToAmount").value = "";
      if(preset.toAccountId){
        $("movTo").value = preset.toAccountId;
        var from = D.accounts.filter(function(a){ return a.kind === "banco" && !a.archived; })[0];
        if(from) $("movAccount").value = from.id;
      }
      syncCurrency($("movAccount"), $("movCurrency"));
      syncCurrency($("movTo"), $("movToCurrency"));
      if(preset.date){ $("movDate").value = preset.date; }
      if(preset.instStart){ $("movInstStart").value = preset.instStart; startTouched = true; }
      if(preset.category) $("movCategory").value = preset.category;
    }
    updateInstField();
    updateRateHint();
    $("movDelete").hidden = !m;
    openDialog(movDialog);
    setTimeout(function(){ try{ $("movAmount").focus(); }catch(e){} }, 40);
  }
  $("movSave").addEventListener("click", function(){ saveMovementDialog(false); });
  $("movSaveAnother").addEventListener("click", function(){ saveMovementDialog(true); });
  function saveMovementDialog(again){
    var amount = parseFloat($("movAmount").value);
    if(!amount || (movKind !== "ajuste" && amount <= 0)){ toast("Poné un monto válido"); return; }
    var acc = $("movAccount").value || null;
    if(movKind !== "gasto" && !acc){ toast("Elegí la cuenta"); return; }
    var m = {
      id: editingMov ? editingMov.id : uid(), kind: movKind, date: $("movDate").value || todayStr(),
      amount: amount, currency: $("movCurrency").value, accountId: acc,
      category: (movKind === "ingreso" || movKind === "gasto") ? $("movCategory").value : null,
      description: $("movDesc").value.trim(), installments: movKind === "gasto" ? Number($("movInst").value || 1) : 1,
      createdAt: editingMov ? editingMov.createdAt : new Date().toISOString()
    };
    m.hadPlan = !!(editingMov && ((editingMov.instFrom || 1) > 1 || editingMov.instStart));
    if(!$("movPlanBox").hidden){
      var plan = draftPlan();
      m.amount = Math.round(plan.cuota * plan.n * 100) / 100;
      m.instFrom = plan.from;
      var st = $("movInstStart").value;
      m.instStart = (plan.from > 1 || (st && st !== ymOf(m.date))) ? st + "-01" : null;
    } else { m.instFrom = 1; m.instStart = null; }
    if(movKind === "transferencia"){
      var to = $("movTo").value, toAmount = parseFloat($("movToAmount").value);
      if(!to || to === acc){ toast("Elegí una cuenta de destino distinta"); return; }
      if(!(toAmount > 0)){ toast("Poné el monto que llega"); return; }
      m.toAccountId = to; m.toAmount = toAmount; m.toCurrency = $("movToCurrency").value;
    }
    saveMovement(m, !editingMov).then(function(ok){ if(ok) toast("Guardado"); });
    closeDialog(movDialog);
    render();
    if(again) openMovement("gasto", null, {accountId:m.accountId, date:m.date, category:m.category,
      instStart: startTouched ? $("movInstStart").value : null});
  }
  $("movDelete").addEventListener("click", function(){
    if(!editingMov || !window.confirm("¿Eliminar este movimiento?")) return;
    deleteMovement(editingMov.id).then(function(ok){ if(ok) toast("Eliminado"); });
    closeDialog(movDialog);
    render();
  });

  // ---------------- diálogo: cuenta ----------------
  var accDialog = $("accDialog"), editingAcc = null;
  fillSelect($("accKind"), ACCOUNT_KINDS.map(function(k){ return [k.id, k.name]; }));
  function syncAccFields(){
    var cur = $("accCurrency").value;
    $("accInitUyuField").hidden = cur === "USD";
    $("accInitUsdField").hidden = cur === "UYU";
  }
  $("accCurrency").addEventListener("change", syncAccFields);
  $("accKind").addEventListener("change", function(){ if($("accKind").value === "tarjeta" && !editingAcc) $("accCurrency").value = "AMBAS"; syncAccFields(); });
  function openAccount(a){
    editingAcc = a;
    $("accTitle").textContent = a ? "Editar cuenta" : "Nueva cuenta";
    $("accName").value = a ? a.name : "";
    $("accKind").value = a ? a.kind : "banco";
    $("accCurrency").value = a ? a.currency : "UYU";
    $("accInitUyu").value = a ? a.initialUYU : "";
    $("accInitUsd").value = a ? a.initialUSD : "";
    $("accSince").value = a ? (a.balanceAt ? localDateStr(new Date(a.balanceAt)) : "") : todayStr();
    $("accArchived").checked = a ? !!a.archived : false;
    $("accArchivedRow").hidden = !a;
    syncAccFields();
    openDialog(accDialog);
  }
  $("newAccountBtn").addEventListener("click", function(){ openAccount(null); });
  $("accSave").addEventListener("click", function(){
    var name = $("accName").value.trim();
    if(!name){ toast("Poné un nombre"); return; }
    var a = editingAcc || {id:uid(), sort:D.accounts.length};
    a.name = name; a.kind = $("accKind").value; a.currency = $("accCurrency").value;
    a.initialUYU = a.currency === "USD" ? 0 : (parseFloat($("accInitUyu").value) || 0);
    a.initialUSD = a.currency === "UYU" ? 0 : (parseFloat($("accInitUsd").value) || 0);
    a.archived = $("accArchived").checked;
    // Fecha del saldo: hoy = desde ahora; otro día = al cierre de ese día; vacío = cuenta todo.
    var since = $("accSince").value, prev = a.balanceAt ? localDateStr(new Date(a.balanceAt)) : "";
    if(!since) a.balanceAt = null;
    else if(since !== prev){
      var p = since.split("-").map(Number);
      a.balanceAt = since === todayStr() ? new Date().toISOString() : new Date(p[0], p[1]-1, p[2], 23, 59, 59).toISOString();
    }
    saveAccount(a, !editingAcc).then(function(ok){ if(ok) toast("Cuenta guardada"); });
    closeDialog(accDialog);
    render();
  });

  // ---------------- datos de ejemplo (modo local) ----------------
  function monthsAgo(m, day){ var d = new Date(); return localDateStr(new Date(d.getFullYear(), d.getMonth() - m, day)); }
  function demoShared(){
    var exps = [], sets = [];
    for(var m = 0; m <= 5; m++){
      exps.push(
        {id:uid(), date:monthsAgo(m, 3), amount:30000, categoryId:"cat-vivienda", description:"Alquiler", scope:"compartido", groupId:"g-casa", paidBy:"partner", splitType:"equitativo"},
        {id:uid(), date:monthsAgo(m, 9), amount:9800 + m * 450, categoryId:"cat-comida", description:"Supermercado", scope:"compartido", groupId:"g-casa", paidBy:"me", splitType:"equitativo"},
        {id:uid(), date:monthsAgo(m, 12), amount:2600 + m * 90, categoryId:"cat-transporte", description:"Nafta", scope:"personal", paidBy:"me"},
        {id:uid(), date:monthsAgo(m, 18), amount:3200 - m * 150, categoryId:"cat-disfrute", description:"Salida", scope:"personal", paidBy:"me"},
        {id:uid(), date:monthsAgo(m, 22), amount:1400 + m * 120, categoryId:"cat-salud", description:"Farmacia", scope:"personal", paidBy:"me"}
      );
      if(m > 0) sets.push({id:uid(), groupId:"g-casa", from:"me", to:"partner", amount:15000 - (9800 + m * 450) / 2, date:monthsAgo(m, 27)});
    }
    return {
      members:[{id:"me", name:"Vos"}, {id:"partner", name:"Ana"}],
      groups:[{id:"g-casa", name:"Casa", memberIds:["me","partner"]}],
      expenses:exps, settlements:sets,
      debts:[{id:uid(), kind:"prestamo", date:monthsAgo(1, 5), amount:500, description:"", categoryId:null, creditor:{me:true}, debtor:{name:"Papá"}}]
    };
  }
  function demoFin(shared){
    var brou = uid(), cash = uid(), usd = uid(), visa = uid(), mp = uid();
    var accounts = [
      {id:brou, name:"BROU caja de ahorro", kind:"banco", currency:"UYU", initialUYU:42000, initialUSD:0, archived:false, sort:0},
      {id:cash, name:"Efectivo", kind:"efectivo", currency:"UYU", initialUYU:3500, initialUSD:0, archived:false, sort:1},
      {id:mp, name:"Mercado Pago", kind:"billetera", currency:"UYU", initialUYU:18000, initialUSD:0, archived:false, sort:2},
      {id:usd, name:"Ahorro en dólares", kind:"ahorro", currency:"USD", initialUYU:0, initialUSD:1500, archived:false, sort:3},
      {id:visa, name:"Visa", kind:"tarjeta", currency:"AMBAS", initialUYU:0, initialUSD:0, archived:false, sort:4}
    ];
    var mv = [];
    for(var m = 0; m <= 5; m++){
      mv.push({id:uid(), kind:"ingreso", date:monthsAgo(m, 1), amount:68000, currency:"UYU", accountId:brou, category:"Sueldo", description:"Sueldo", installments:1});
      if(m % 2 === 0) mv.push({id:uid(), kind:"ingreso", date:monthsAgo(m, 15), amount:300, currency:"USD", accountId:usd, category:"Freelance", description:"Proyecto web", installments:1});
      mv.push({id:uid(), kind:"gasto", date:monthsAgo(m, 6), amount:15.99, currency:"USD", accountId:visa, category:"cat-disfrute", description:"Netflix", installments:1});
      if(m > 0) mv.push({id:uid(), kind:"transferencia", date:monthsAgo(m, 10), amount:15000, currency:"UYU", accountId:brou, toAccountId:visa, toAmount:15000, toCurrency:"UYU", category:null, description:"Pago de tarjeta", installments:1});
    }
    mv.push({id:uid(), kind:"gasto", date:monthsAgo(2, 14), amount:30000, currency:"UYU", accountId:visa, category:"cat-vivienda", description:"Televisor", installments:6});
    mv.push({id:uid(), kind:"transferencia", date:monthsAgo(1, 20), amount:20500, currency:"UYU", accountId:brou, toAccountId:usd, toAmount:500, toCurrency:"USD", category:null, description:"Compra de dólares", installments:1});
    var links = {};
    (shared.expenses || []).forEach(function(e, i){
      if(e.paidBy !== "me") return;
      if(e.date.slice(0,7) === currentYM() && i % 3 === 0) return; // algunos sin asignar, para revisar
      links["expense:" + e.id] = {accountId: e.categoryId === "cat-comida" ? visa : (e.categoryId === "cat-transporte" ? mp : brou), installments:1};
    });
    (shared.settlements || []).forEach(function(s){ links["settlement:" + s.id] = {accountId:brou, installments:1}; });
    return {accounts:accounts, movements:mv, links:links, settings:{enabled:true, usdRate:41, incomeCategories:["Sueldo","Freelance","Aguinaldo","Ventas","Regalos","Otros"]}};
  }

  // ---------------- inicio y login ----------------
  var refreshing = null, refreshAgain = false;
  function refresh(){
    if(refreshing){ refreshAgain = true; return refreshing; }
    refreshing = load().then(render).catch(function(err){
      if(err && err.stale){ if(pendingWrites === 0) refreshAgain = true; return; }
      console.error(err); toast("No se pudieron cargar los datos");
    }).then(function(){
      refreshing = null;
      if(refreshAgain){ refreshAgain = false; return refresh(); }
    });
    return refreshing;
  }
  var refreshTimer;
  function scheduleRefresh(){ clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 400); }

  function setLoginMsg(t){ $("loginMsg").textContent = t || ""; }
  $("loginForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    setLoginMsg("Entrando…");
    sb.auth.signInWithPassword({email:$("loginEmail").value.trim(), password:$("loginPass").value}).then(function(r){
      if(r.error) setLoginMsg(/invalid login/i.test(r.error.message) ? "Email o contraseña incorrectos." : "No se pudo entrar.");
    });
  });
  $("loginGoogle").addEventListener("click", function(){
    sb.auth.signInWithOAuth({provider:"google", options:{redirectTo: location.origin + location.pathname}});
  });

  if(!REMOTE){
    $("modeNote").textContent = "Modo local — datos de ejemplo en este navegador.";
    refresh();
  } else if(!sb){
    $("modeNote").textContent = "No se pudo cargar Supabase.";
  } else {
    fetch(CFG.supabaseUrl + "/auth/v1/settings", {headers:{apikey:CFG.supabaseAnonKey}})
      .then(function(r){ return r.json(); })
      .then(function(st){ $("loginGoogle").hidden = !(st && st.external && st.external.google); })
      .catch(function(){});
    var currentUser;
    sb.auth.onAuthStateChange(function(event, s){
      var id = s ? s.user.id : null;
      if(id === currentUser){ session = s || session; return; }
      currentUser = id;
      setTimeout(function(){
        session = s;
        $("loginOverlay").hidden = !!s;
        if(!s){ D = null; return; }
        $("modeNote").textContent = "Conectado · " + s.user.email;
        refresh();
        var ch = sb.channel("fin-" + s.user.id);
        ["expenses","settlements","debts","groups","group_members","fin_accounts","fin_movements","fin_links","fin_settings"].forEach(function(t){
          ch.on("postgres_changes", {event:"*", schema:"public", table:t}, scheduleRefresh);
        });
        ch.subscribe();
      }, 0);
    });
    document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "visible" && session) scheduleRefresh(); });
  }
})();
