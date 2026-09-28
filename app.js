(function(){
  "use strict";

  var STORAGE_KEY = "libro-gastos:v1";

  var CATEGORY_SEED = [
    {id:"cat-comida", name:"Comida"},
    {id:"cat-disfrute", name:"Disfrute"},
    {id:"cat-salud", name:"Salud"},
    {id:"cat-transporte", name:"Transporte"},
    {id:"cat-vivienda", name:"Vivienda"},
    {id:"cat-otros", name:"Otros"}
  ];

  // Fecha local (no UTC): en Uruguay, después de las 21 toISOString ya da el día siguiente.
  function localDateStr(d){
    function pad(n){ return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
  }
  function todayStr(){
    return localDateStr(new Date());
  }
  function daysAgo(n){
    var d = new Date();
    d.setDate(d.getDate()-n);
    return localDateStr(d);
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }
  function uid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c){
      var r = Math.random()*16|0;
      return (c === "x" ? r : (r&0x3|0x8)).toString(16);
    });
  }
  function money(n){
    var v = Number(n)||0;
    return "$" + v.toLocaleString("es-UY", {minimumFractionDigits:0, maximumFractionDigits:0});
  }

  function seedData(){
    var me = {id:"me", name:"Vos"};
    var partner = {id:"partner", name:"Ana"};
    var group = {id:"g-casa", name:"Casa", memberIds:["me","partner"]};

    var expenses = [
      {id:uid(), date:daysAgo(1), amount:1450, categoryId:"cat-comida", description:"Supermercado", scope:"compartido", groupId:"g-casa", paidBy:"me", splitType:"equitativo"},
      {id:uid(), date:daysAgo(1), amount:600, categoryId:"cat-disfrute", description:"Cine", scope:"personal", paidBy:"me"},
      {id:uid(), date:daysAgo(3), amount:3200, categoryId:"cat-vivienda", description:"Alquiler", scope:"compartido", groupId:"g-casa", paidBy:"partner", splitType:"equitativo"},
      {id:uid(), date:daysAgo(4), amount:890, categoryId:"cat-transporte", description:"Nafta", scope:"personal", paidBy:"me"},
      {id:uid(), date:daysAgo(6), amount:2200, categoryId:"cat-salud", description:"Farmacia", scope:"personal", paidBy:"me"},
      {id:uid(), date:daysAgo(2), amount:1800, categoryId:"cat-disfrute", description:"Salida", scope:"compartido", groupId:"g-casa", paidBy:"me", splitType:"completo", owedBy:"partner"},
      {id:uid(), date:todayStr(), amount:520, categoryId:"cat-comida", description:"Pan", scope:"personal", paidBy:"me"}
    ];

    return {
      members:[me, partner],
      groups:[group],
      categories: CATEGORY_SEED,
      expenses: expenses,
      settlements: [],
      seeded: true
    };
  }

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return seedData();
      var parsed = JSON.parse(raw);
      if(!parsed || !parsed.members) return seedData();
      if(!parsed.settlements) parsed.settlements = [];
      return parsed;
    }catch(e){
      return seedData();
    }
  }
  function save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  }

  function emptyState(){
    return {members:[{id:"me", name:"Vos"}], groups:[], categories:CATEGORY_SEED, expenses:[], settlements:[]};
  }

  // ---------------- Supabase ----------------
  // Si config.js tiene URL y clave, los datos viven en Supabase; si no, en localStorage.
  var CFG = window.APP_CONFIG || {};
  var REMOTE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  var sb = (REMOTE && window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey)
    : null;
  var session = null;

  // En memoria la app usa "me" para referirse a vos. En la base, cada grupo tiene
  // su propia fila de integrante; estas tablas traducen entre ambos.
  var myMemberByGroup = {};
  var myMemberIds = {};
  function toLocalMember(id){ return id && myMemberIds[id] ? "me" : id; }
  function toRemoteMember(id, groupId){ return id === "me" ? myMemberByGroup[groupId] : id; }

  function fetchRemote(){
    return Promise.all([
      sb.from("groups").select("id,name,invite_code,created_at").order("created_at"),
      sb.from("group_members").select("id,group_id,user_id,name,created_at").order("created_at"),
      sb.from("expenses").select("*").order("date", {ascending:false}).order("created_at", {ascending:false}),
      sb.from("settlements").select("*").order("date").order("created_at")
    ]).then(function(res){
      res.forEach(function(r){ if(r.error) throw r.error; });
      var user = session.user;
      var memberRows = res[1].data;
      myMemberByGroup = {};
      myMemberIds = {};
      memberRows.forEach(function(m){
        if(m.user_id === user.id){ myMemberByGroup[m.group_id] = m.id; myMemberIds[m.id] = true; }
      });
      var myRow = memberRows.filter(function(m){ return myMemberIds[m.id]; })[0];
      var meta = user.user_metadata || {};
      var myName = meta.name || meta.full_name ||
        (myRow && myRow.name) || (user.email || "Vos").split("@")[0];

      state = {
        members: [{id:"me", name:myName}].concat(
          memberRows.filter(function(m){ return !myMemberIds[m.id]; })
            .map(function(m){ return {id:m.id, name:m.name, joined:!!m.user_id}; })
        ),
        groups: res[0].data.map(function(g){
          return {
            id: g.id,
            name: g.name,
            inviteCode: g.invite_code,
            memberIds: memberRows.filter(function(m){ return m.group_id === g.id; })
              .map(function(m){ return toLocalMember(m.id); })
          };
        }),
        categories: CATEGORY_SEED,
        expenses: res[2].data.map(function(r){
          var shared = !!r.group_id;
          var e = {
            id: r.id,
            date: r.date,
            amount: Number(r.amount),
            description: r.description || "",
            categoryId: r.category_id,
            scope: shared ? "compartido" : "personal",
            paidBy: shared ? toLocalMember(r.paid_by) : "me"
          };
          if(shared){
            e.groupId = r.group_id;
            e.splitType = r.split_type;
            if(r.owed_by) e.owedBy = toLocalMember(r.owed_by);
          }
          return e;
        }),
        settlements: res[3].data.map(function(r){
          return {
            id: r.id,
            groupId: r.group_id,
            from: toLocalMember(r.from_member),
            to: toLocalMember(r.to_member),
            amount: Number(r.amount),
            date: r.date
          };
        })
      };
    });
  }

  function expenseToRow(e){
    var shared = e.scope === "compartido";
    return {
      date: e.date,
      amount: e.amount,
      description: e.description || "",
      category_id: e.categoryId,
      group_id: shared ? e.groupId : null,
      split_type: shared ? e.splitType : null,
      paid_by: shared ? toRemoteMember(e.paidBy, e.groupId) : null,
      owed_by: shared && e.splitType === "completo" ? toRemoteMember(e.owedBy, e.groupId) : null
    };
  }

  // Guarda un cambio: en modo local escribe localStorage; en Supabase corre la
  // consulta y, si falla, avisa y vuelve a traer los datos del servidor.
  function persist(run){
    if(!REMOTE){ save(); return Promise.resolve(true); }
    return Promise.resolve().then(run).then(function(r){
      if(r && r.error) throw r.error;
      return true;
    }).catch(function(err){
      console.error(err);
      showToast("No se pudo guardar. Revisá tu conexión.");
      refresh();
      return false;
    });
  }

  var state = REMOTE ? emptyState() : load();

  function memberName(id){
    var m = state.members.filter(function(x){return x.id===id;})[0];
    return m ? m.name : "—";
  }
  function categoryName(id){
    var c = state.categories.filter(function(x){return x.id===id;})[0];
    return c ? c.name : "Otros";
  }
  function groupById(id){
    return state.groups.filter(function(g){return g.id===id;})[0];
  }

  // ---------------- tabs ----------------
  var tabButtons = document.querySelectorAll(".tab-btn");
  var panels = {
    grupos: document.getElementById("panel-grupos"),
    individual: document.getElementById("panel-individual")
  };
  tabButtons.forEach(function(btn){
    btn.addEventListener("click", function(){
      tabButtons.forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      Object.keys(panels).forEach(function(k){ panels[k].classList.remove("active"); });
      panels[btn.dataset.tab].classList.add("active");
      if(btn.dataset.tab === "grupos") renderGroupList();
      if(btn.dataset.tab === "individual") renderIndividual();
    });
  });

  // ---------------- toast ----------------
  var toastEl = document.getElementById("toast");
  var toastTimer;
  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 1800);
  }

  // ---------------- form: populate selects ----------------
  var categoriaSel = document.getElementById("categoria");
  var descripcionInput = document.getElementById("descripcion");
  var withSelect = document.getElementById("withSelect");
  var paidBySel = document.getElementById("paidBy");
  var owedBySel = document.getElementById("owedBy");
  var fechaInput = document.getElementById("fecha");
  var cantidadInput = document.getElementById("cantidad");
  var splitSummaryRow = document.getElementById("splitSummaryRow");
  var splitSummaryText = document.getElementById("splitSummaryText");

  function fillSelect(sel, items, getId, getLabel){
    sel.innerHTML = "";
    items.forEach(function(it){
      var opt = document.createElement("option");
      opt.value = getId(it);
      opt.textContent = getLabel(it);
      sel.appendChild(opt);
    });
  }

  // currentSplit: null cuando es individual, o {splitType, paidBy, owedBy} cuando es compartido
  var currentSplit = null;

  function populateFormSelects(){
    fillSelect(categoriaSel, state.categories, function(c){return c.id;}, function(c){return c.name;});
    var opts = [{id:"individual", name:"Personal"}].concat(
      state.groups.map(function(g){ return {id:g.id, name:g.name}; })
    );
    fillSelect(withSelect, opts, function(o){return o.id;}, function(o){return o.name;});
    onWithChange();
  }

  function defaultSplitForGroup(groupId){
    return {splitType:"equitativo", paidBy:"me", groupId:groupId};
  }

  function onWithChange(){
    var val = withSelect.value;
    if(val === "individual"){
      currentSplit = null;
      splitSummaryRow.classList.remove("show");
    } else {
      currentSplit = defaultSplitForGroup(val);
      splitSummaryRow.classList.add("show");
      refreshMemberSelectsForGroup(val);
      updateSplitSummaryText();
    }
  }
  withSelect.addEventListener("change", onWithChange);

  function refreshMemberSelectsForGroup(groupId){
    var g = groupById(groupId);
    var members = g ? state.members.filter(function(m){ return g.memberIds.indexOf(m.id) !== -1; }) : [];
    fillSelect(paidBySel, members, function(m){return m.id;}, function(m){return m.name;});
    fillSelect(owedBySel, members, function(m){return m.id;}, function(m){return m.name;});
  }

  function splitLabel(split){
    if(split.splitType === "equitativo"){
      return split.paidBy === "me"
        ? "Pagaste vos, dividido a partes iguales"
        : memberName(split.paidBy) + " pagó, dividido a partes iguales";
    }
    // completo
    return split.owedBy === "me"
      ? "Se te debe la cantidad total"
      : "A " + memberName(split.owedBy) + " se le debe la cantidad total";
  }

  function updateSplitSummaryText(){
    if(currentSplit) splitSummaryText.textContent = splitLabel(currentSplit);
  }

  fechaInput.value = todayStr();

  // ---------------- modal: reparto estilo Splitwise ----------------
  var splitModal = document.getElementById("splitModal");
  var splitOptionsList = document.getElementById("splitOptionsList");
  var advancedSplit = document.getElementById("advancedSplit");
  var moreOptionsBtn = document.getElementById("moreOptionsBtn");

  function openSplitModal(){
    if(!currentSplit) return;
    var g = groupById(currentSplit.groupId);
    advancedSplit.classList.remove("show");
    moreOptionsBtn.hidden = false;

    if(g && g.memberIds.length === 2){
      var other = g.memberIds.filter(function(id){ return id !== "me"; })[0] || g.memberIds[1];
      var presets = [
        {splitType:"equitativo", paidBy:"me", groupId:g.id},
        {splitType:"completo", paidBy:"me", owedBy:other, groupId:g.id},
        {splitType:"equitativo", paidBy:other, groupId:g.id},
        {splitType:"completo", paidBy:other, owedBy:"me", groupId:g.id}
      ];
      splitOptionsList.innerHTML = presets.map(function(p, i){
        var isSel = p.splitType === currentSplit.splitType && p.paidBy === currentSplit.paidBy &&
          (p.splitType !== "completo" || p.owedBy === currentSplit.owedBy);
        return '<button type="button" class="split-option'+(isSel?" selected":"")+'" data-idx="'+i+'">' +
          '<span>'+ esc(splitLabel(p)) +'</span><span class="check">✓</span></button>';
      }).join("");
      splitOptionsList.querySelectorAll(".split-option").forEach(function(btn, i){
        btn.addEventListener("click", function(){
          currentSplit = presets[i];
          updateSplitSummaryText();
          closeSplitModal();
        });
      });
    } else {
      // grupo con más de 2 personas: directo a opciones avanzadas
      splitOptionsList.innerHTML = '<div class="empty-state">Este grupo tiene más de dos personas — elegí manualmente abajo.</div>';
      showAdvancedSplit();
    }
    splitModal.hidden = false;
  }
  function closeSplitModal(){ splitModal.hidden = true; }

  function showAdvancedSplit(){
    refreshMemberSelectsForGroup(currentSplit.groupId);
    paidBySel.value = currentSplit.paidBy;
    splitSeg.querySelectorAll("button").forEach(function(b){
      b.classList.toggle("selected", b.dataset.split === currentSplit.splitType);
    });
    owedByField.classList.toggle("show", currentSplit.splitType === "completo");
    if(currentSplit.owedBy) owedBySel.value = currentSplit.owedBy;
    advancedSplit.classList.add("show");
    moreOptionsBtn.hidden = true;
  }
  moreOptionsBtn.addEventListener("click", showAdvancedSplit);

  var splitSeg = document.getElementById("splitSeg");
  var owedByField = document.getElementById("owedByField");
  splitSeg.querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("click", function(){
      splitSeg.querySelectorAll("button").forEach(function(b){b.classList.remove("selected");});
      btn.classList.add("selected");
      owedByField.classList.toggle("show", btn.dataset.split === "completo");
    });
  });

  document.getElementById("applyAdvancedSplit").addEventListener("click", function(){
    var splitType = splitSeg.querySelector(".selected").dataset.split;
    var next = {splitType:splitType, paidBy:paidBySel.value, groupId:currentSplit.groupId};
    if(splitType === "completo") next.owedBy = owedBySel.value;
    currentSplit = next;
    updateSplitSummaryText();
    closeSplitModal();
  });

  splitSummaryRow.addEventListener("click", openSplitModal);
  splitModal.addEventListener("click", function(ev){
    if(ev.target === splitModal) closeSplitModal();
  });

  // ---------------- guardar / editar gasto ----------------
  var editingId = null;
  var saveBtn = document.getElementById("saveBtn");
  var expenseScreen = document.getElementById("expenseScreen");

  function resetForm(groupId){
    editingId = null;
    saveBtn.textContent = "Guardar gasto";
    document.getElementById("expenseScreenTitle").textContent = "Nuevo gasto";
    cantidadInput.value = "";
    descripcionInput.value = "";
    fechaInput.value = todayStr();
    withSelect.value = (groupId && groupById(groupId)) ? groupId : "individual";
    onWithChange();
  }

  function openNewExpense(groupId){
    resetForm(groupId);
    openScreen(expenseScreen);
    setTimeout(function(){ try{ cantidadInput.focus(); }catch(e){} }, 50);
  }
  document.getElementById("expenseScreenBack").addEventListener("click", function(){ goBack(); });

  saveBtn.addEventListener("click", function(){
    var amount = parseFloat(cantidadInput.value);
    if(!amount || amount <= 0){
      showToast("Poné una cantidad válida");
      return;
    }
    var isCompartido = withSelect.value !== "individual";
    var exp = {
      id: editingId || uid(),
      date: fechaInput.value || todayStr(),
      amount: amount,
      description: descripcionInput.value.trim(),
      categoryId: categoriaSel.value,
      scope: isCompartido ? "compartido" : "personal",
      paidBy: isCompartido ? currentSplit.paidBy : "me"
    };
    if(isCompartido){
      exp.groupId = currentSplit.groupId;
      exp.splitType = currentSplit.splitType;
      if(currentSplit.splitType === "completo") exp.owedBy = currentSplit.owedBy;
    }

    var wasEditing = !!editingId;
    if(wasEditing){
      var idx = state.expenses.findIndex(function(x){ return x.id === editingId; });
      if(idx > -1) state.expenses[idx] = exp;
    } else {
      state.expenses.unshift(exp);
    }
    persist(function(){
      return wasEditing
        ? sb.from("expenses").update(expenseToRow(exp)).eq("id", exp.id)
        : sb.from("expenses").insert(Object.assign({id:exp.id}, expenseToRow(exp)));
    });
    goBack();
    showToast(wasEditing ? "Gasto actualizado" : "Gasto guardado");
    renderAll();
  });

  function loadExpenseIntoForm(e){
    fechaInput.value = e.date;
    cantidadInput.value = e.amount;
    descripcionInput.value = e.description || "";
    categoriaSel.value = e.categoryId;
    if(e.scope === "personal"){
      withSelect.value = "individual";
      onWithChange();
    } else {
      withSelect.value = e.groupId;
      onWithChange();
      currentSplit = {splitType:e.splitType, paidBy:e.paidBy, groupId:e.groupId};
      if(e.splitType === "completo") currentSplit.owedBy = e.owedBy;
      updateSplitSummaryText();
    }
    editingId = e.id;
    saveBtn.textContent = "Guardar cambios";
    document.getElementById("expenseScreenTitle").textContent = "Editar gasto";
  }

  // ---------------- render: filas de gasto ----------------
  // Cuánto de un gasto compartido te corresponde realmente a vos (tu costo real),
  // sin importar quién puso la plata.
  function myShareOf(e){
    if(e.scope !== "compartido") return null;
    var g = groupById(e.groupId);
    if(!g || g.memberIds.indexOf("me") === -1) return null;
    if(e.splitType === "equitativo"){
      var n = g.memberIds.length || 1;
      return e.amount / n;
    }
    // completo: si el 100% es tuyo, es todo tu costo; si es del otro, no te cuesta nada
    return e.owedBy === "me" ? e.amount : 0;
  }

  function expenseRowHTML(e, opts){
    opts = opts || {};
    var titleText = e.description ? e.description : categoryName(e.categoryId);
    var subParts = [];
    if(e.description) subParts.push(categoryName(e.categoryId));
    var displayAmount = e.amount;

    if(e.scope === "compartido"){
      var g = groupById(e.groupId);
      if(opts.personalView){
        displayAmount = myShareOf(e) || 0;
        subParts.push((g ? g.name : "grupo") + " · tu parte de " + money(e.amount));
      } else {
        var partSub = (g ? g.name : "grupo") + " · pagó " + memberName(e.paidBy);
        if(e.splitType === "completo"){
          partSub += " · 100% " + memberName(e.owedBy);
        } else {
          partSub += " · equitativo";
        }
        subParts.push(partSub);
      }
    }
    var dateLabel = opts.showDate ? formatDateShort(e.date) + " · " : "";
    return (
      '<div class="expense-row" data-id="'+e.id+'">' +
        '<div class="expense-cat-dot" style="background:'+categoryColorVar(e.categoryId)+'"></div>' +
        '<div class="expense-main">' +
          '<div class="expense-title">'+ dateLabel + esc(titleText) +'</div>' +
          '<div class="expense-sub">'+ esc(subParts.join(" · ")) +'</div>' +
        '</div>' +
        '<div class="expense-amount">'+ money(displayAmount) +'</div>' +
        '<span class="chevron">›</span>' +
      '</div>'
    );
  }

  function categoryColorVar(categoryId){
    var idx = state.categories.findIndex(function(c){ return c.id === categoryId; });
    if(idx < 0) idx = 0;
    return "var(--series-" + ((idx % 8) + 1) + ")";
  }

  function formatDateShort(d){
    var parts = d.split("-");
    return parts[2] + "/" + parts[1];
  }

  function formatDateLong(d){
    var months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    var parts = d.split("-").map(Number);
    return parts[2] + " " + months[parts[1]-1] + " " + parts[0];
  }

  function attachRowClickHandlers(container){
    container.querySelectorAll("[data-id]").forEach(function(row){
      row.addEventListener("click", function(){
        openExpenseDetail(row.getAttribute("data-id"));
      });
    });
  }

  var MONTHS_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  function ledgerDateHTML(dateStr){
    var parts = dateStr.split("-").map(Number);
    return '<div class="ledger-date"><span class="mon">'+ MONTHS_SHORT[parts[1]-1] +'</span><span class="day">'+ parts[2] +'</span></div>';
  }

  // Si el gasto compartido te da un saldo a favor o en contra, devuelve {label, amount, cls}.
  // Para grupos de 2 personas esto coincide siempre con "tu parte" del gasto.
  function balanceEffectOf(e){
    var share = myShareOf(e);
    if(share === null) return null;
    var paidByMe = e.paidBy === "me" ? e.amount : 0;
    var net = paidByMe - share;
    if(net > 0.5) return {label:"prestaste", amount:net, cls:"positive"};
    if(net < -0.5) return {label:"pediste", amount:-net, cls:"negative"};
    return {label:"", amount:share, cls:""};
  }

  // Fila de lista (Detalle / Movimientos): fecha a la izquierda, descripción + contexto, saldo a la derecha
  // opts.personalView: para "Mis gastos" — muestra cuánto te costó realmente el gasto (tu parte),
  // sin el lenguaje de saldo (prestaste/pediste), que es propio de la vista de Grupos.
  function expenseLedgerRowHTML(e, opts){
    opts = opts || {};
    var titleText = e.description ? e.description : categoryName(e.categoryId);
    var subParts = [];
    if(e.description) subParts.push(categoryName(e.categoryId));

    var amount = e.amount, statusHTML = "", amountCls = "";

    if(e.scope === "compartido"){
      var g = groupById(e.groupId);
      subParts.push((g ? g.name : "grupo") + " · " + (e.paidBy === "me" ? "pagaste" : memberName(e.paidBy) + " pagó") + " " + money(e.amount));
      if(opts.personalView){
        amount = myShareOf(e) || 0;
      } else {
        var effect = balanceEffectOf(e);
        if(effect){
          amount = effect.amount;
          amountCls = effect.cls;
          if(effect.label) statusHTML = '<div class="ledger-status '+effect.cls+'">'+effect.label+'</div>';
        }
      }
    }

    return (
      '<div class="ledger-row" data-id="'+e.id+'">' +
        ledgerDateHTML(e.date) +
        '<div class="ledger-dot" style="background:'+categoryColorVar(e.categoryId)+'"></div>' +
        '<div class="ledger-main">' +
          '<div class="ledger-title">'+ esc(titleText) +'</div>' +
          '<div class="ledger-sub">'+ esc(subParts.join(" · ")) +'</div>' +
        '</div>' +
        '<div class="ledger-right">' +
          statusHTML +
          '<div class="ledger-amount'+(amountCls?(" "+amountCls):"")+'">'+ money(amount) +'</div>' +
        '</div>' +
      '</div>'
    );
  }

  function settlementLedgerRowHTML(s){
    return (
      '<div class="ledger-row">' +
        ledgerDateHTML(s.date) +
        '<div class="ledger-dot" style="background:var(--warn);"></div>' +
        '<div class="ledger-main">' +
          '<div class="ledger-title">Pago registrado</div>' +
          '<div class="ledger-sub">'+ esc(memberName(s.from)) +' → '+ esc(memberName(s.to)) +'</div>' +
        '</div>' +
        '<div class="ledger-right">' +
          '<div class="ledger-amount">'+ money(s.amount) +'</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ---------------- pantallas completas con "atrás" ----------------
  // Cada pantalla abierta agrega una entrada al historial, así el botón atrás del
  // celular/navegador la cierra en vez de salir de la app.
  var screenStack = [];
  // Algunos visores embebidos bloquean el historial; ahí se cierra sin usarlo.
  var historyOk = true;
  function openScreen(el){
    el.hidden = false;
    el.querySelector(".modal-sheet").scrollTop = 0;
    if(screenStack.indexOf(el) !== -1) return;
    screenStack.push(el);
    el.style.zIndex = 50 + screenStack.length;
    if(historyOk){
      try{ history.pushState({screenDepth: screenStack.length}, ""); }
      catch(e){ historyOk = false; }
    }
  }
  function goBack(){
    if(!screenStack.length) return;
    if(historyOk) history.back();
    else screenStack.pop().hidden = true;
  }
  // Cambia la pantalla de arriba por otra (ej.: detalle → editar) sin tocar el historial.
  function replaceTopScreen(el){
    var top = screenStack.pop();
    if(!top){ openScreen(el); return; }
    top.hidden = true;
    el.hidden = false;
    el.querySelector(".modal-sheet").scrollTop = 0;
    screenStack.push(el);
    el.style.zIndex = 50 + screenStack.length;
  }
  function isScreenOpen(el){ return screenStack.indexOf(el) !== -1; }

  function closeAllScreens(){
    var n = screenStack.length;
    screenStack.forEach(function(el){ el.hidden = true; });
    screenStack = [];
    if(n && historyOk) history.go(-n);
  }
  window.addEventListener("popstate", function(ev){
    var depth = (ev.state && ev.state.screenDepth) || 0;
    while(screenStack.length > depth){ screenStack.pop().hidden = true; }
  });

  // ---------------- detalle del gasto (estilo Splitwise) ----------------
  var detailModal = document.getElementById("detailModal");
  var confirmDeleteModal = document.getElementById("confirmDeleteModal");
  var currentDetailId = null;

  function openExpenseDetail(id){
    var e = state.expenses.filter(function(x){ return x.id === id; })[0];
    if(!e) return;
    currentDetailId = id;

    document.getElementById("detailCat").textContent = categoryName(e.categoryId);
    var detailDescEl = document.getElementById("detailDesc");
    detailDescEl.textContent = e.description || "";
    detailDescEl.style.display = e.description ? "block" : "none";
    document.getElementById("detailAmount").textContent = money(e.amount);
    var metaParts = ["Añadido el " + formatDateLong(e.date)];
    metaParts.push(e.scope === "compartido" ? (groupById(e.groupId) ? groupById(e.groupId).name : "Grupo") : "Individual");
    document.getElementById("detailMeta").textContent = metaParts.join(" · ");

    var bd = document.getElementById("detailBreakdown");
    if(e.scope === "compartido"){
      var g = groupById(e.groupId);
      var lines = [];
      lines.push({label:(e.paidBy === "me" ? "Pagaste" : memberName(e.paidBy) + " pagó"), amt: e.amount});
      if(e.splitType === "equitativo"){
        var n = g ? g.memberIds.length : 1;
        var share = e.amount / n;
        (g ? g.memberIds : []).forEach(function(mid){
          lines.push({label:(mid === "me" ? "Debés" : memberName(mid) + " debe"), amt: share});
        });
      } else {
        lines.push({label:(e.owedBy === "me" ? "Debés" : memberName(e.owedBy) + " debe"), amt: e.amount});
      }
      bd.innerHTML = lines.map(function(l){
        return '<div class="line"><span>'+esc(l.label)+'</span><span class="amt">'+money(l.amt)+'</span></div>';
      }).join("");
    } else {
      bd.innerHTML = '<div class="line"><span>Gasto individual</span></div>';
    }
    openScreen(detailModal);
  }

  document.getElementById("detailCloseBtn").addEventListener("click", goBack);

  document.getElementById("detailEditBtn").addEventListener("click", function(){
    var e = state.expenses.filter(function(x){ return x.id === currentDetailId; })[0];
    if(!e) return;
    loadExpenseIntoForm(e);
    replaceTopScreen(expenseScreen);
  });

  document.getElementById("detailDeleteBtn").addEventListener("click", function(){
    confirmDeleteModal.hidden = false;
  });
  document.getElementById("cancelDeleteBtn").addEventListener("click", function(){
    confirmDeleteModal.hidden = true;
  });
  document.getElementById("confirmDeleteBtn").addEventListener("click", function(){
    var deletedId = currentDetailId;
    state.expenses = state.expenses.filter(function(e){ return e.id !== deletedId; });
    persist(function(){ return sb.from("expenses").delete().eq("id", deletedId); });
    confirmDeleteModal.hidden = true;
    goBack();
    renderAll();
    showToast("Gasto eliminado");
  });

  // ---------------- render: grupos ----------------
  var groupFilterMonthSel = document.getElementById("groupFilterMonth");
  var groupFilterDayRow = document.getElementById("groupFilterDayRow");
  var groupFilterDayInput = document.getElementById("groupFilterDay");
  var groupFilterDayBackBtn = document.getElementById("groupFilterDayBack");
  var groupDateMode = "month";

  function setGroupDateMode(mode){
    groupDateMode = mode;
    groupFilterMonthSel.hidden = (mode === "day");
    groupFilterDayRow.hidden = (mode !== "day");
  }

  function populateGroupFilters(groupId){
    var months = Array.from(new Set(
      expensesOf(groupId).map(function(e){ return e.date.slice(0,7); })
    )).sort().reverse();

    var prev = groupFilterMonthSel.value;
    fillSelect(
      groupFilterMonthSel,
      [{id:"all", name:"Todos los meses"}]
        .concat(months.map(function(ym){ return {id:ym, name:monthLabel(ym)}; }))
        .concat([{id:DAY_OPTION, name:"Buscar un día…"}]),
      function(o){return o.id;}, function(o){return o.name;}
    );
    if(groupDateMode === "day"){
      groupFilterMonthSel.value = DAY_OPTION;
    } else if(prev && (prev === "all" || months.indexOf(prev) !== -1)){
      groupFilterMonthSel.value = prev;
    } else if(months.indexOf(currentYM()) !== -1){
      groupFilterMonthSel.value = currentYM();
    } else {
      groupFilterMonthSel.value = "all";
    }
  }
  groupFilterMonthSel.addEventListener("change", function(){
    if(groupFilterMonthSel.value === DAY_OPTION){
      setGroupDateMode("day");
      if(groupFilterDayInput.showPicker){ try{ groupFilterDayInput.showPicker(); }catch(e){} }
      groupFilterDayInput.focus();
      return;
    }
    setGroupDateMode("month");
    groupFilterDayInput.value = "";
    renderGroupScreen();
  });
  groupFilterDayInput.addEventListener("change", renderGroupScreen);
  groupFilterDayBackBtn.addEventListener("click", function(){
    groupFilterDayInput.value = "";
    setGroupDateMode("month");
    groupFilterMonthSel.value = "all";
    renderGroupScreen();
  });

  function computeGroupBalances(groupId){
    var g = groupById(groupId);
    if(!g) return {};
    var balances = {};
    g.memberIds.forEach(function(id){ balances[id] = 0; });

    var groupExpenses = state.expenses.filter(function(e){ return e.scope === "compartido" && e.groupId === groupId; });
    groupExpenses.forEach(function(e){
      balances[e.paidBy] = (balances[e.paidBy]||0) + e.amount;
      if(e.splitType === "equitativo"){
        var n = g.memberIds.length || 1;
        var share = e.amount / n;
        g.memberIds.forEach(function(id){ balances[id] -= share; });
      } else if(e.splitType === "completo"){
        balances[e.owedBy] = (balances[e.owedBy]||0) - e.amount;
      }
    });

    var groupSettlements = state.settlements.filter(function(s){ return s.groupId === groupId; });
    groupSettlements.forEach(function(s){
      // "from" le pagó a "to": el balance de "from" mejora, el de "to" se reduce.
      balances[s.from] = (balances[s.from]||0) + s.amount;
      balances[s.to] = (balances[s.to]||0) - s.amount;
    });
    return balances;
  }

  // ---------------- grupos: lista principal ----------------
  // "Personal" es un grupo fijo (no está en la base): son los gastos con scope "personal".
  var PERSONAL = "individual";
  var currentGroupId = null;
  var groupScreen = document.getElementById("groupScreen");

  function expensesOf(groupId){
    return groupId === PERSONAL
      ? state.expenses.filter(function(e){ return e.scope === "personal"; })
      : state.expenses.filter(function(e){ return e.scope === "compartido" && e.groupId === groupId; });
  }
  function sumAmounts(list){ return list.reduce(function(s, e){ return s + e.amount; }, 0); }
  function monthName(ym){ return monthLabel(ym).split(" ")[0].toLowerCase(); }

  function membersText(g, showPending){
    return g.memberIds.map(function(id){
      if(id === "me") return "Vos";
      var m = state.members.filter(function(x){ return x.id === id; })[0];
      var name = m ? m.name : "—";
      return (showPending && m && m.joined === false) ? name + " (sin unirse)" : name;
    }).join(", ");
  }

  var PERSON_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor"/></svg>';
  function avatarHTML(groupId, extraCls){
    var cls = "group-avatar" + (extraCls ? " " + extraCls : "");
    if(groupId === PERSONAL) return '<div class="'+cls+' personal">'+PERSON_ICON+'</div>';
    var idx = state.groups.findIndex(function(g){ return g.id === groupId; });
    var g = state.groups[idx];
    var letter = g ? (g.name.trim().charAt(0) || "?").toUpperCase() : "?";
    return '<div class="'+cls+'" style="background:var(--series-'+((Math.max(idx,0) % 8) + 1)+')">'+esc(letter)+'</div>';
  }

  // Tu saldo en el grupo: > 0 te deben, < 0 debés.
  function myNet(groupId){ return computeGroupBalances(groupId).me || 0; }

  function balanceLine(groupId){
    var g = groupById(groupId);
    var others = g.memberIds.filter(function(id){ return id !== "me"; });
    if(others.length === 0) return {text:"Todavía estás solo en este grupo", cls:""};
    var net = myNet(groupId);
    if(Math.abs(net) < 1) return {text:"Al día", cls:""};
    if(others.length === 1){
      var o = memberName(others[0]);
      return net > 0
        ? {text:o + " te debe " + money(net), cls:"positive"}
        : {text:"Le debés " + money(-net) + " a " + o, cls:"negative"};
    }
    return net > 0
      ? {text:"Te deben " + money(net), cls:"positive"}
      : {text:"Debés " + money(-net), cls:"negative"};
  }

  function groupCardHTML(groupId, name, spent, line){
    return '<button type="button" class="group-card" data-group="'+esc(groupId)+'">' +
      avatarHTML(groupId) +
      '<div class="group-card-main">' +
        '<div class="group-card-name">'+esc(name)+'</div>' +
        '<div class="group-card-spent">Gastado en '+monthName(currentYM())+' <strong>'+money(spent)+'</strong></div>' +
        (line ? '<div class="group-card-balance '+line.cls+'">'+esc(line.text)+'</div>' : '') +
      '</div>' +
      '<span class="chevron">›</span>' +
    '</button>';
  }

  function renderGroupList(){
    var ym = currentYM();
    function inMonth(e){ return e.date.slice(0,7) === ym; }

    var cards = [groupCardHTML(PERSONAL, "Personal", sumAmounts(expensesOf(PERSONAL).filter(inMonth)), null)];
    var totalNet = 0, withOthers = 0;
    state.groups.forEach(function(g){
      if(g.memberIds.length > 1){ totalNet += myNet(g.id); withOthers++; }
      cards.push(groupCardHTML(g.id, g.name, sumAmounts(expensesOf(g.id).filter(inMonth)), balanceLine(g.id)));
    });
    if(state.groups.length === 0){
      cards.push('<button type="button" class="group-card group-card-empty" id="emptyGroupCta">' +
        '<div class="group-avatar ghost">＋</div>' +
        '<div class="group-card-main"><div class="group-card-name">Compartí gastos</div>' +
        '<div class="group-card-spent">Creá un grupo o unite con un código</div></div>' +
        '<span class="chevron">›</span></button>');
    }

    // Lo que te costó el mes: tus gastos personales + tu parte de los compartidos.
    var myMonth = sumAmounts(expensesOf(PERSONAL).filter(inMonth)) +
      state.expenses.filter(function(e){ return e.scope === "compartido" && inMonth(e); })
        .reduce(function(s, e){ return s + (myShareOf(e) || 0); }, 0);

    var head;
    if(withOthers === 0) head = 'Este mes gastaste <span class="accent">'+money(myMonth)+'</span>';
    else if(Math.abs(totalNet) < 1) head = 'En general, <span class="accent">estás al día</span>';
    else if(totalNet > 0) head = 'En general, te deben <span class="positive">'+money(totalNet)+'</span>';
    else head = 'En general, debés <span class="negative">'+money(-totalNet)+'</span>';
    var sub = withOthers === 0 ? '' : '<div class="overview-sub">Tus gastos de '+monthName(ym)+': '+money(myMonth)+'</div>';
    document.getElementById("overview").innerHTML = '<div class="overview-head">'+head+'</div>' + sub;

    var list = document.getElementById("groupList");
    list.innerHTML = cards.join("");
    list.querySelectorAll(".group-card[data-group]").forEach(function(card){
      card.addEventListener("click", function(){ openGroupScreen(card.getAttribute("data-group")); });
    });
    var cta = document.getElementById("emptyGroupCta");
    if(cta) cta.addEventListener("click", openSettings);
  }

  // ---------------- pantalla de un grupo ----------------
  function openGroupScreen(groupId){
    currentGroupId = groupId;
    setGroupDateMode("month");
    groupFilterDayInput.value = "";
    groupFilterMonthSel.value = "";
    renderGroupScreen();
    openScreen(groupScreen);
  }
  document.getElementById("groupScreenBack").addEventListener("click", function(){ goBack(); });
  document.getElementById("groupScreenAdd").addEventListener("click", function(){ openNewExpense(currentGroupId); });

  function renderGroupScreen(){
    var groupId = currentGroupId;
    if(!groupId) return;
    var isPersonal = groupId === PERSONAL;
    var g = isPersonal ? null : groupById(groupId);
    if(!isPersonal && !g) return;

    document.getElementById("groupScreenAvatar").outerHTML =
      avatarHTML(groupId, "big").replace('class="', 'id="groupScreenAvatar" class="');
    document.getElementById("groupScreenTitle").textContent = isPersonal ? "Personal" : g.name;
    document.getElementById("groupScreenKind").textContent = isPersonal ? "Solo vos" : membersText(g);

    populateGroupFilters(groupId);
    var selMonth = groupDateMode === "day" ? "all" : (groupFilterMonthSel.value || "all");
    var selDay = groupDateMode === "day" ? (groupFilterDayInput.value || "") : "";
    function dateMatches(dateStr){
      if(selDay) return dateStr === selDay;
      return selMonth === "all" || dateStr.slice(0,7) === selMonth;
    }

    var hero = document.getElementById("balanceHero");
    if(isPersonal){
      var ym = currentYM();
      hero.innerHTML =
        '<span class="pill">'+esc(monthLabel(ym))+'</span>' +
        '<div class="amount">'+ money(sumAmounts(expensesOf(PERSONAL).filter(function(e){ return e.date.slice(0,7) === ym; }))) +'</div>' +
        '<div class="caption">gastados este mes</div>';
    } else {
      renderGroupHero(hero, g);
    }

    var byDate = expensesOf(groupId).filter(function(e){ return dateMatches(e.date); });
    var settlementsByDate = isPersonal ? [] : state.settlements
      .filter(function(st){ return st.groupId === groupId && dateMatches(st.date); });

    // torta por categoría: gasto total del grupo (no tu parte), según el filtro de fecha
    var byCat = {};
    byDate.forEach(function(e){ byCat[e.categoryId] = (byCat[e.categoryId]||0) + e.amount; });
    var catEntries = state.categories
      .filter(function(c){ return byCat[c.id] > 0; })
      .map(function(c){ return {id:c.id, amount:byCat[c.id]}; });
    var total = catEntries.reduce(function(sum, c){ return sum + c.amount; }, 0);

    var chartEl = document.getElementById("groupCategoryChart");
    if(catEntries.length === 0){
      chartEl.innerHTML = '<div class="empty-state">Sin gastos para este filtro.</div>';
    } else {
      chartEl.innerHTML = buildDonutChart(catEntries, total, {selectable:true});
      chartEl.querySelectorAll(".legend-row[data-cat]").forEach(function(row){
        row.addEventListener("click", function(){
          openGroupCategoryDetail(row.getAttribute("data-cat"), byDate, settlementsByDate, byCat, total);
        });
      });
    }

    var rows = byDate.map(function(e){ return {date:e.date, html: expenseLedgerRowHTML(e)}; })
      .concat(settlementsByDate.map(function(st){ return {date:st.date, html: settlementLedgerRowHTML(st)}; }))
      .sort(function(a, b){ return b.date.localeCompare(a.date); });
    var movEl = document.getElementById("groupMovements");
    movEl.innerHTML = rows.length === 0
      ? '<div class="empty-state">Todavía no hay movimientos.</div>'
      : rows.map(function(r){ return r.html; }).join("");
    attachRowClickHandlers(movEl);
  }

  function debtText(debtor, creditor){
    if(creditor === "me") return memberName(debtor) + " te debe";
    if(debtor === "me") return "Le debés a " + memberName(creditor);
    return memberName(debtor) + " le debe a " + memberName(creditor);
  }

  function renderGroupHero(hero, g){
    var groupId = g.id;
    var balances = computeGroupBalances(groupId);
    var ids = g.memberIds;

    if(ids.length < 2){
      hero.innerHTML =
        '<span class="pill">Solo vos</span>' +
        '<div class="caption">Invitá a alguien para dividir gastos' +
        (REMOTE && g.inviteCode ? ': pasale el código <strong class="mono">'+esc(g.inviteCode)+'</strong>' : '') +
        '.</div>';
      return;
    }

    if(ids.length === 2){
      var a = ids[0], b = ids[1];
      var owedAmount = Math.abs(balances[a] - balances[b]) / 2;
      if(owedAmount < 1){
        hero.innerHTML =
          '<span class="pill">Al día</span>' +
          '<div class="amount">'+ money(0) +'</div>' +
          '<div class="caption">'+ esc(memberName(a)) +' y '+ esc(memberName(b)) +' están saldados</div>';
        return;
      }
      var debtor = balances[a] > balances[b] ? b : a;
      var creditor = debtor === a ? b : a;
      hero.innerHTML =
        '<span class="pill warn">Balance pendiente</span>' +
        '<div class="amount">'+ money(owedAmount) +'</div>' +
        '<div class="caption">'+ esc(debtText(debtor, creditor)) +'</div>' +
        '<button class="btn-ghost" id="settleBtn" type="button" style="margin-top:6px;">Liquidar</button>';
      document.getElementById("settleBtn").addEventListener("click", function(){
        openSettleModal(groupId, debtor, creditor, owedAmount);
      });
      return;
    }

    // Más de dos personas: cuánto le deben o debe cada uno.
    var sorted = ids.slice().sort(function(x, y){ return (balances[y]||0) - (balances[x]||0); });
    var rowsHTML = sorted.map(function(id){
      var v = balances[id] || 0;
      var who = id === "me" ? "Vos" : memberName(id);
      var txt = Math.abs(v) < 1 ? "al día" : (v > 0 ? "le deben " + money(v) : "debe " + money(-v));
      if(id === "me" && Math.abs(v) >= 1) txt = v > 0 ? "te deben " + money(v) : "debés " + money(-v);
      return '<div class="member-balance"><span>'+esc(who)+'</span><span class="'+(Math.abs(v) < 1 ? "" : (v > 0 ? "positive" : "negative"))+'">'+txt+'</span></div>';
    }).join("");
    var top = sorted[0], bottom = sorted[sorted.length - 1];
    var pending = (balances[top]||0) >= 1 && (balances[bottom]||0) <= -1;
    hero.innerHTML =
      '<span class="pill'+(pending ? " warn" : "")+'">'+(pending ? "Balance pendiente" : "Al día")+'</span>' +
      '<div class="member-balances">'+rowsHTML+'</div>' +
      (pending ? '<button class="btn-ghost" id="settleBtn" type="button" style="margin-top:6px;">Registrar un pago</button>' : '');
    if(pending){
      document.getElementById("settleBtn").addEventListener("click", function(){
        openSettleModal(groupId, bottom, top, Math.min(balances[top], -balances[bottom]));
      });
    }
  }

  // ---------------- ¿en qué grupo? ----------------
  var pickGroupModal = document.getElementById("pickGroupModal");
  function openPickGroup(){
    if(state.groups.length === 0){ openNewExpense(PERSONAL); return; }
    var items = [{id:PERSONAL, name:"Personal", sub:"Solo tus gastos"}].concat(
      state.groups.map(function(g){ return {id:g.id, name:g.name, sub:membersText(g)}; })
    );
    var list = document.getElementById("pickGroupList");
    list.innerHTML = items.map(function(it){
      return '<button type="button" class="pick-row" data-group="'+esc(it.id)+'">' +
        avatarHTML(it.id, "small") +
        '<span class="pick-main"><span class="pick-name">'+esc(it.name)+'</span>' +
        '<span class="pick-sub">'+esc(it.sub)+'</span></span>' +
        '<span class="chevron">›</span></button>';
    }).join("");
    list.querySelectorAll(".pick-row").forEach(function(row){
      row.addEventListener("click", function(){
        pickGroupModal.hidden = true;
        openNewExpense(row.getAttribute("data-group"));
      });
    });
    pickGroupModal.hidden = false;
  }
  pickGroupModal.addEventListener("click", function(ev){ if(ev.target === pickGroupModal) pickGroupModal.hidden = true; });
  document.getElementById("addExpenseBtn").addEventListener("click", openPickGroup);

  // ---------------- liquidar deudas ----------------
  var settleModal = document.getElementById("settleModal");
  var settleCtx = null;

  function openSettleModal(groupId, from, to, amount){
    settleCtx = {groupId:groupId, from:from, to:to};
    document.getElementById("settleFromLabel").textContent = from === "me" ? "Vos" : memberName(from);
    document.getElementById("settleToLabel").textContent = to === "me" ? "Vos" : memberName(to);
    document.getElementById("settleDescription").textContent =
      (from === "me" ? "Le pagaste a " + memberName(to) : memberName(from) + " te pagó a vos");
    document.getElementById("settleAmount").value = amount.toFixed(2);
    settleModal.hidden = false;
  }
  function closeSettleModal(){ settleModal.hidden = true; }

  document.getElementById("cancelSettleBtn").addEventListener("click", closeSettleModal);
  settleModal.addEventListener("click", function(ev){ if(ev.target === settleModal) closeSettleModal(); });

  document.getElementById("confirmSettleBtn").addEventListener("click", function(){
    var amt = parseFloat(document.getElementById("settleAmount").value);
    if(!amt || amt <= 0){
      showToast("Poné una cantidad válida");
      return;
    }
    var st = {
      id: uid(),
      groupId: settleCtx.groupId,
      from: settleCtx.from,
      to: settleCtx.to,
      amount: amt,
      date: todayStr()
    };
    state.settlements.push(st);
    persist(function(){
      return sb.from("settlements").insert({
        id: st.id,
        group_id: st.groupId,
        from_member: toRemoteMember(st.from, st.groupId),
        to_member: toRemoteMember(st.to, st.groupId),
        amount: st.amount,
        date: st.date
      });
    });
    closeSettleModal();
    showToast("Pago registrado");
    renderAll();
  });

  // ---------------- filtros de "Mis gastos" ----------------
  var filterMonthSel = document.getElementById("filterMonth");
  var filterDayRow = document.getElementById("filterDayRow");
  var filterDayInput = document.getElementById("filterDay");
  var filterDayBackBtn = document.getElementById("filterDayBack");
  var individualDateMode = "month";
  var DAY_OPTION = "__day__";

  function currentYM(){ return todayStr().slice(0,7); }

  function monthLabel(ym){
    var months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    var parts = ym.split("-").map(Number);
    var label = months[parts[1]-1] + " " + parts[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function setIndividualDateMode(mode){
    individualDateMode = mode;
    filterMonthSel.hidden = (mode === "day");
    filterDayRow.hidden = (mode !== "day");
  }

  function populateIndividualFilters(){
    var months = Array.from(new Set(state.expenses.map(function(e){ return e.date.slice(0,7); }))).sort().reverse();

    var prevMonth = filterMonthSel.value;
    fillSelect(
      filterMonthSel,
      [{id:"all", name:"Todos los meses"}]
        .concat(months.map(function(ym){ return {id:ym, name:monthLabel(ym)}; }))
        .concat([{id:DAY_OPTION, name:"Buscar un día…"}]),
      function(o){return o.id;}, function(o){return o.name;}
    );
    if(individualDateMode === "day"){
      filterMonthSel.value = DAY_OPTION;
    } else if(prevMonth && (prevMonth === "all" || months.indexOf(prevMonth) !== -1)){
      filterMonthSel.value = prevMonth;
    } else if(months.indexOf(currentYM()) !== -1){
      filterMonthSel.value = currentYM();
    } else {
      filterMonthSel.value = "all";
    }
  }
  filterMonthSel.addEventListener("change", function(){
    if(filterMonthSel.value === DAY_OPTION){
      setIndividualDateMode("day");
      if(filterDayInput.showPicker){ try{ filterDayInput.showPicker(); }catch(e){} }
      filterDayInput.focus();
      return;
    }
    setIndividualDateMode("month");
    filterDayInput.value = "";
    renderIndividual();
  });
  filterDayInput.addEventListener("change", renderIndividual);
  filterDayBackBtn.addEventListener("click", function(){
    filterDayInput.value = "";
    setIndividualDateMode("month");
    filterMonthSel.value = "all";
    renderIndividual();
  });

  // ---------------- gráfico de torta por categoría ----------------
  function buildDonutChart(entries, total, opts){
    opts = opts || {};
    var r = 40, cx = 50, cy = 50, sw = 15;
    var circumference = 2 * Math.PI * r;
    var cumulative = 0;

    var parts = entries.map(function(entry){
      var colorVar = categoryColorVar(entry.id);
      var pct = total > 0 ? entry.amount / total : 0;
      var dash = pct * circumference;
      var gap = entries.length > 1 ? Math.min(2.5, dash * 0.15) : 0;
      var visDash = Math.max(0, dash - gap);
      var circle = '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" style="stroke:'+colorVar+'" ' +
        'stroke-width="'+sw+'" stroke-linecap="round" ' +
        'stroke-dasharray="'+visDash.toFixed(2)+' '+(circumference - visDash).toFixed(2)+'" ' +
        'stroke-dashoffset="'+(-cumulative).toFixed(2)+'"></circle>';
      cumulative += dash;
      return {circle:circle, colorVar:colorVar, pct:pct, entry:entry};
    });

    var legend = parts.map(function(p){
      var isSel = opts.selectable && opts.selectedId === p.entry.id;
      var cls = "legend-row" + (opts.selectable ? " clickable" : "") + (isSel ? " selected" : "");
      var dataAttr = opts.selectable ? ' data-cat="'+p.entry.id+'"' : "";
      return '<div class="'+cls+'"'+dataAttr+'>' +
        '<span class="legend-dot" style="background:'+p.colorVar+'"></span>' +
        '<span class="legend-name">'+ esc(categoryName(p.entry.id)) +'</span>' +
        '<span class="legend-pct">'+ Math.round(p.pct*100) +'%</span>' +
        '<span class="legend-amt">'+ money(p.entry.amount) +'</span>' +
      '</div>';
    }).join("");

    var totalRow = opts.selectable
      ? '<div class="legend-row clickable total-legend-row" data-cat="all">' +
          '<span class="legend-dot" style="background:var(--ink-soft)"></span>' +
          '<span class="legend-name">Total</span>' +
          '<span class="legend-pct"></span>' +
          '<span class="legend-amt">'+ money(total) +'</span>' +
        '</div>'
      : "";

    return (
      '<div class="donut-wrap">' +
        '<div class="donut-svg-holder">' +
          '<svg viewBox="0 0 100 100" class="donut-svg"><g transform="rotate(-90 50 50)">' +
            parts.map(function(p){ return p.circle; }).join("") +
          '</g></svg>' +
          '<div class="donut-center">' +
            '<div class="donut-center-amt">'+ money(total) +'</div>' +
            '<div class="donut-center-label">total</div>' +
          '</div>' +
        '</div>' +
        '<div class="legend-list">'+ totalRow + legend +'</div>' +
      '</div>'
    );
  }

  // ---------------- pantalla de desglose por categoría ----------------
  var categoryDetailModal = document.getElementById("categoryDetailModal");

  function openCategoryDetail(catId, personalByDate, sharedByDate, byCat, totalAmount){
    var isAll = catId === "all";
    var catPersonal = isAll ? personalByDate : personalByDate.filter(function(e){ return e.categoryId === catId; });
    var catShared = isAll ? sharedByDate : sharedByDate.filter(function(x){ return x.expense.categoryId === catId; });
    var amount = isAll ? totalAmount : (byCat[catId] || 0);
    var count = catPersonal.length + catShared.length;

    document.getElementById("categoryDetailCat").textContent = isAll ? "Todas las categorías" : categoryName(catId);
    document.getElementById("categoryDetailAmount").textContent = money(amount);
    document.getElementById("categoryDetailMeta").textContent = count + " gasto" + (count === 1 ? "" : "s");

    var rows = catPersonal.map(function(e){ return {date:e.date, html: expenseLedgerRowHTML(e, {personalView:true})}; })
      .concat(catShared.map(function(x){ return {date:x.expense.date, html: expenseLedgerRowHTML(x.expense, {personalView:true})}; }))
      .sort(function(a,b){ return b.date.localeCompare(a.date); });

    var listEl = document.getElementById("categoryDetailList");
    listEl.innerHTML = rows.length === 0
      ? '<div class="empty-state">No hay gastos para este filtro.</div>'
      : rows.map(function(item){ return item.html; }).join("");
    attachRowClickHandlers(listEl);

    openScreen(categoryDetailModal);
  }

  function openGroupCategoryDetail(catId, groupExpensesByDate, groupSettlementsByDate, byCat, totalAmount){
    var isAll = catId === "all";
    var catExpenses = isAll ? groupExpensesByDate : groupExpensesByDate.filter(function(e){ return e.categoryId === catId; });
    var amount = isAll ? totalAmount : (byCat[catId] || 0);
    var count = catExpenses.length + (isAll ? groupSettlementsByDate.length : 0);

    document.getElementById("categoryDetailCat").textContent = isAll ? "Todos los movimientos" : categoryName(catId);
    document.getElementById("categoryDetailAmount").textContent = money(amount);
    document.getElementById("categoryDetailMeta").textContent = count + " movimiento" + (count === 1 ? "" : "s");

    var rows = catExpenses.map(function(e){ return {date:e.date, html: expenseLedgerRowHTML(e)}; });
    if(isAll){
      rows = rows.concat(groupSettlementsByDate.map(function(s){ return {date:s.date, html: settlementLedgerRowHTML(s)}; }));
    }
    rows.sort(function(a,b){ return b.date.localeCompare(a.date); });

    var listEl = document.getElementById("categoryDetailList");
    listEl.innerHTML = rows.length === 0
      ? '<div class="empty-state">No hay movimientos para este filtro.</div>'
      : rows.map(function(item){ return item.html; }).join("");
    attachRowClickHandlers(listEl);

    openScreen(categoryDetailModal);
  }

  document.getElementById("categoryDetailCloseBtn").addEventListener("click", goBack);

  // ---------------- render: mis gastos ----------------
  function renderIndividual(){
    populateIndividualFilters();
    var selMonth = individualDateMode === "day" ? "all" : (filterMonthSel.value || "all");
    var selDay = individualDateMode === "day" ? (filterDayInput.value || "") : "";

    function dateMatches(dateStr){
      if(selDay) return dateStr === selDay;
      return selMonth === "all" || dateStr.slice(0,7) === selMonth;
    }

    // "Mis gastos" = mis gastos personales + mi parte real de cada gasto compartido
    // (así un gasto compartido pesa en mi plata aunque no lo haya pagado yo).
    // La torta reacciona a la fecha; tocar una categoría abre su desglose en una pantalla aparte.
    var personalByDate = state.expenses.filter(function(e){ return e.scope === "personal" && dateMatches(e.date); });
    var sharedByDate = state.expenses
      .filter(function(e){ return e.scope === "compartido" && dateMatches(e.date); })
      .map(function(e){ return {expense:e, share: myShareOf(e)}; })
      .filter(function(x){ return x.share !== null && x.share > 0; });

    var totalPersonal = personalByDate.reduce(function(s,e){ return s + e.amount; }, 0);
    var totalShared = sharedByDate.reduce(function(s,x){ return s + x.share; }, 0);
    var total = totalPersonal + totalShared;

    var byCat = {};
    personalByDate.forEach(function(e){
      byCat[e.categoryId] = (byCat[e.categoryId]||0) + e.amount;
    });
    sharedByDate.forEach(function(x){
      byCat[x.expense.categoryId] = (byCat[x.expense.categoryId]||0) + x.share;
    });
    // orden fijo por categoría (no por monto) para que el color de cada porción no cambie
    var catEntries = state.categories
      .filter(function(c){ return byCat[c.id] > 0; })
      .map(function(c){ return {id:c.id, amount:byCat[c.id]}; });

    // Desglose: Personal + tu parte en cada grupo = total.
    var perGroup = {};
    sharedByDate.forEach(function(x){ perGroup[x.expense.groupId] = (perGroup[x.expense.groupId]||0) + x.share; });
    var lines = [{id:PERSONAL, name:"Personal", amount:totalPersonal}].concat(
      state.groups.filter(function(g){ return perGroup[g.id] > 0; })
        .map(function(g){ return {id:g.id, name:"Tu parte en " + g.name, amount:perGroup[g.id]}; })
    );
    var bdEl = document.getElementById("myBreakdown");
    bdEl.innerHTML = lines.map(function(l){
      return '<button type="button" class="breakdown-row" data-group="'+esc(l.id)+'">' +
        avatarHTML(l.id, "tiny") +
        '<span class="breakdown-name">'+esc(l.name)+'</span>' +
        '<span class="breakdown-amt">'+money(l.amount)+'</span>' +
      '</button>';
    }).join("") +
      '<div class="breakdown-total"><span>Total</span><span>'+money(total)+'</span></div>';
    bdEl.querySelectorAll(".breakdown-row").forEach(function(row){
      row.addEventListener("click", function(){ openGroupScreen(row.getAttribute("data-group")); });
    });

    var barsEl = document.getElementById("categoryBars");
    if(catEntries.length === 0){
      barsEl.innerHTML = '<div class="empty-state">Sin gastos para este filtro.</div>';
    } else {
      barsEl.innerHTML = buildDonutChart(catEntries, total, {selectable:true});
      barsEl.querySelectorAll(".legend-row[data-cat]").forEach(function(row){
        row.addEventListener("click", function(){
          openCategoryDetail(row.getAttribute("data-cat"), personalByDate, sharedByDate, byCat, total);
        });
      });
    }
  }

  // ---------------- settings modal ----------------
  var settingsModal = document.getElementById("settingsModal");
  var meNameInput = document.getElementById("meNameInput");

  function openSettings(){
    meNameInput.value = memberName("me");
    document.getElementById("resetDataBtn").hidden = REMOTE;
    document.getElementById("signOutBtn").hidden = !REMOTE;
    document.getElementById("joinBox").hidden = !REMOTE;
    document.getElementById("groupsBox").hidden = state.groups.length === 0;
    document.getElementById("groupsList").innerHTML = state.groups.map(function(g){
      return '<div class="settings-group">' +
        avatarHTML(g.id, "small") +
        '<div class="settings-group-main">' +
          '<div class="settings-group-name">'+esc(g.name)+'</div>' +
          '<div class="settings-group-members">'+esc(membersText(g, true))+'</div>' +
        '</div>' +
        (REMOTE && g.inviteCode ? '<div class="invite-code small" title="Código para invitar">'+esc(g.inviteCode)+'</div>' : '') +
      '</div>';
    }).join("") + (REMOTE && state.groups.length
      ? '<p class="hint">Para sumar a alguien a un grupo, pasale su código: crea su cuenta y lo pone en "¿Te invitaron?".</p>'
      : '');
    if(REMOTE){
      document.getElementById("settingsTitle").textContent = "Configuración";
      document.getElementById("settingsHint").textContent =
        "Conectado como " + (session ? session.user.email : "") + ".";
    } else {
      document.getElementById("settingsHint").textContent =
        "Modo local: los datos quedan solo en este navegador.";
    }
    updateInstallBox();
    settingsModal.hidden = false;
  }
  document.getElementById("settingsBtn").addEventListener("click", openSettings);

  // ---------------- instalar como app ----------------
  var installPrompt = null;
  var isStandalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  function updateInstallBox(){
    var canPrompt = !!installPrompt;
    var iosHint = isIOS && !isStandalone;
    document.getElementById("installBtn").hidden = !canPrompt;
    document.getElementById("iosInstallHint").hidden = !iosHint;
    document.getElementById("installBox").hidden = !(canPrompt || iosHint);
  }
  window.addEventListener("beforeinstallprompt", function(ev){
    ev.preventDefault();
    installPrompt = ev;
    updateInstallBox();
  });
  window.addEventListener("appinstalled", function(){
    installPrompt = null;
    updateInstallBox();
    showToast("App instalada");
  });
  document.getElementById("installBtn").addEventListener("click", function(){
    if(!installPrompt) return;
    installPrompt.prompt();
    installPrompt = null;
    updateInstallBox();
  });
  if("serviceWorker" in navigator && location.protocol === "https:"){
    navigator.serviceWorker.register("sw.js").catch(function(err){ console.warn(err); });
  }
  settingsModal.addEventListener("click", function(ev){
    if(ev.target === settingsModal) settingsModal.hidden = true;
  });

  document.getElementById("saveNamesBtn").addEventListener("click", function(){
    var meN = meNameInput.value.trim();
    var meChanged = meN && meN !== memberName("me");
    state.members.forEach(function(m){
      if(m.id === "me" && meChanged) m.name = meN;
    });
    settingsModal.hidden = true;
    populateFormSelects();
    renderAll();
    persist(function(){
      var ops = [];
      if(meChanged){
        ops.push(sb.auth.updateUser({data:{name:meN}}));
        var mine = Object.keys(myMemberIds);
        if(mine.length) ops.push(sb.from("group_members").update({name:meN}).in("id", mine));
      }
      return Promise.all(ops).then(function(res){
        return res.filter(function(r){ return r.error; })[0];
      });
    }).then(function(ok){ if(ok) showToast("Guardado"); });
  });

  document.getElementById("resetDataBtn").addEventListener("click", function(){
    state = seedData();
    save();
    settingsModal.hidden = true;
    populateFormSelects();
    renderAll();
    showToast("Datos de ejemplo reiniciados");
  });

  function runGroupRpc(fn, args, okMsg){
    return sb.rpc(fn, args).then(function(r){
      if(r.error) throw r.error;
      settingsModal.hidden = true;
      showToast(okMsg);
      return refresh();
    }).catch(function(err){
      console.error(err);
      showToast(/inválido/i.test(err.message || "") ? "Código inválido" : "No se pudo completar. Probá de nuevo.");
    });
  }
  document.getElementById("createGroupBtn").addEventListener("click", function(){
    var nameInput = document.getElementById("newGroupName");
    var otherInput = document.getElementById("newGroupOther");
    var name = nameInput.value.trim();
    var other = otherInput.value.trim();
    if(!name){ showToast("Poné un nombre para el grupo"); nameInput.focus(); return; }
    nameInput.value = "";
    otherInput.value = "";
    if(REMOTE){
      runGroupRpc("create_group", {group_name:name, my_name:memberName("me"), other_name:other || null}, "Grupo creado");
      return;
    }
    var g = {id:uid(), name:name, memberIds:["me"]};
    if(other){
      var m = {id:uid(), name:other};
      state.members.push(m);
      g.memberIds.push(m.id);
    }
    state.groups.push(g);
    save();
    settingsModal.hidden = true;
    populateFormSelects();
    renderAll();
    showToast("Grupo creado");
  });
  document.getElementById("joinGroupBtn").addEventListener("click", function(){
    var code = document.getElementById("joinCodeInput").value.trim();
    if(!code){ showToast("Poné el código"); return; }
    // Sin nombre propio configurado, se conserva el que puso quien creó el grupo.
    var meta = session && session.user.user_metadata;
    runGroupRpc("join_group", {code:code, my_name:(meta && meta.name) || null}, "Te uniste al grupo");
  });
  document.getElementById("signOutBtn").addEventListener("click", function(){
    settingsModal.hidden = true;
    sb.auth.signOut();
  });

  // ---------------- login ----------------
  var authScreen = document.getElementById("authScreen");
  var authMsg = document.getElementById("authMsg");
  var authEmail = document.getElementById("authEmail");
  var authPassword = document.getElementById("authPassword");

  function setAuthMsg(text, ok){
    authMsg.textContent = text || "";
    authMsg.classList.toggle("ok", !!ok);
  }
  function authErrorText(err){
    var m = (err && err.message) || "";
    if(/invalid login/i.test(m)) return "Email o contraseña incorrectos.";
    if(/not confirmed/i.test(m)) return "Confirmá tu email antes de entrar (revisá tu casilla).";
    if(/already registered/i.test(m)) return "Ese email ya tiene cuenta. Probá con Entrar.";
    if(/password/i.test(m)) return "La contraseña tiene que tener al menos 6 caracteres.";
    return "No se pudo conectar. Probá de nuevo.";
  }
  function credentials(){
    var email = authEmail.value.trim(), password = authPassword.value;
    if(!email || password.length < 6){
      setAuthMsg("Poné tu email y una contraseña de al menos 6 caracteres.");
      return null;
    }
    return {email:email, password:password};
  }
  document.getElementById("authForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var c = credentials();
    if(!c) return;
    setAuthMsg("Entrando…", true);
    sb.auth.signInWithPassword(c).then(function(r){
      if(r.error) setAuthMsg(authErrorText(r.error));
    });
  });
  document.getElementById("signUpBtn").addEventListener("click", function(){
    var c = credentials();
    if(!c) return;
    setAuthMsg("Creando cuenta…", true);
    sb.auth.signUp({
      email: c.email,
      password: c.password,
      options: {emailRedirectTo: location.origin + location.pathname}
    }).then(function(r){
      if(r.error) setAuthMsg(authErrorText(r.error));
      else if(!r.data.session) setAuthMsg("Te mandamos un email para confirmar la cuenta. Después volvé y entrá.", true);
    });
  });

  // ---------------- login con Google ----------------
  // El botón aparece solo si Google está habilitado en Supabase (Authentication → Providers).
  function checkGoogleEnabled(){
    return fetch(CFG.supabaseUrl + "/auth/v1/settings", {headers:{apikey:CFG.supabaseAnonKey}})
      .then(function(r){ return r.json(); })
      .then(function(st){
        document.getElementById("googleBox").hidden = !(st && st.external && st.external.google);
      })
      .catch(function(){});
  }
  document.getElementById("googleBtn").addEventListener("click", function(){
    setAuthMsg("Abriendo Google…", true);
    sb.auth.signInWithOAuth({
      provider: "google",
      options: {redirectTo: location.origin + location.pathname}
    }).then(function(r){
      if(r.error) setAuthMsg("No se pudo abrir Google. Probá de nuevo.");
    });
  });
  // Si Google o Supabase devuelven un error, viene en la URL (#error_description=...).
  function oauthErrorFromUrl(){
    var params = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
    var desc = params.get("error_description");
    if(!desc) return null;
    history.replaceState(null, "", location.pathname);
    return desc.replace(/\+/g, " ");
  }

  // ---------------- sincronización ----------------
  var refreshing = null;
  var refreshAgain = false;
  function refresh(){
    if(!REMOTE || !session) return Promise.resolve();
    if(refreshing){ refreshAgain = true; return refreshing; }
    refreshing = fetchRemote().then(function(){
      // Mantener lo que se esté cargando en el formulario.
      var prevWith = withSelect.value, prevSplit = currentSplit, prevCat = categoriaSel.value;
      populateFormSelects();
      if(prevCat) categoriaSel.value = prevCat;
      if(prevWith !== "individual" && groupById(prevWith)){
        withSelect.value = prevWith;
        onWithChange();
        if(prevSplit){ currentSplit = prevSplit; updateSplitSummaryText(); }
      }
      renderAll();
    }).catch(function(err){
      console.error(err);
      showToast("No se pudieron cargar los datos");
    }).then(function(){
      refreshing = null;
      if(refreshAgain){ refreshAgain = false; return refresh(); }
    });
    return refreshing;
  }

  // ---------------- tiempo real ----------------
  // Cuando otra persona (u otro dispositivo) cambia algo, Supabase avisa y se
  // vuelven a traer los datos. Las reglas RLS filtran qué avisos llegan.
  var realtimeChannel = null;
  var realtimeTimer = null;
  function scheduleRefresh(){
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(refresh, 400);
  }
  function startRealtime(){
    stopRealtime();
    realtimeChannel = sb.channel("cambios-" + session.user.id);
    ["expenses", "settlements", "group_members", "groups"].forEach(function(table){
      realtimeChannel.on("postgres_changes", {event:"*", schema:"public", table:table}, scheduleRefresh);
    });
    realtimeChannel.subscribe(function(status){
      // Al reconectar (por ejemplo, después de perder señal) puede haber cambios perdidos.
      if(status === "SUBSCRIBED") scheduleRefresh();
    });
  }
  function stopRealtime(){
    if(realtimeChannel){ sb.removeChannel(realtimeChannel); realtimeChannel = null; }
  }

  function onSession(s){
    session = s;
    document.getElementById("settingsBtn").hidden = !s;
    if(!s){
      stopRealtime();
      state = emptyState();
      resetForm();
      populateFormSelects();
      renderAll();
      if(!/No se pudo entrar/.test(authMsg.textContent)) setAuthMsg("");
      authPassword.value = "";
      authScreen.hidden = false;
      return;
    }
    authScreen.hidden = true;
    document.getElementById("modeNote").textContent = "Sincronizado con la nube · " + s.user.email;
    refresh();
    startRealtime();
  }

  function renderAll(){
    renderGroupList();
    if(isScreenOpen(groupScreen)) renderGroupScreen();
    renderIndividual();
  }

  // ---------------- init ----------------
  populateFormSelects();
  renderAll();

  if(REMOTE){
    if(!sb){
      document.getElementById("modeNote").textContent = "No se pudo cargar Supabase. Revisá tu conexión y recargá.";
      authScreen.hidden = false;
      setAuthMsg("No se pudo cargar Supabase. Revisá tu conexión y recargá la página.");
      document.getElementById("signInBtn").disabled = true;
      document.getElementById("signUpBtn").disabled = true;
    } else {
      var oauthError = oauthErrorFromUrl();
      if(oauthError) setAuthMsg("No se pudo entrar: " + oauthError);
      checkGoogleEnabled();
      var currentUserId;
      sb.auth.onAuthStateChange(function(event, s){
        var id = s ? s.user.id : null;
        if(id === currentUserId){ session = s || session; return; }
        currentUserId = id;
        // Supabase recomienda no llamar a la API dentro de este callback.
        setTimeout(function(){ onSession(s); }, 0);
      });
      document.addEventListener("visibilitychange", function(){
        if(document.visibilityState === "visible") refresh();
      });
    }
  } else {
    document.getElementById("modeNote").textContent =
      "Modo local — los datos se guardan solo en este navegador.";
  }

})();
