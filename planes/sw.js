// Service worker de Planes (alcance /planes/, separado del de finanzas).
// Los archivos de la app se piden primero a la red (cada deploy se ve enseguida)
// y solo sin conexión se usa la copia guardada. Supabase no pasa por acá.
var CACHE = "planes-v4";
var SHELL = [
  "./",
  "index.html",
  "planes.css",
  "planes.js",
  "notas.js",
  "aprender.js",
  "../config.js",
  "manifest.webmanifest",
  "icons/icon-192.png"
];

self.addEventListener("install", function(ev){
  ev.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).catch(function(){})
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(ev){
  ev.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k.indexOf("planes-") === 0 && k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isStaticCdn(url){
  return url.hostname === "cdn.jsdelivr.net" ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", function(ev){
  var req = ev.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);

  if(url.origin === self.location.origin){
    ev.respondWith(
      fetch(req).then(function(res){
        if(res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          return hit || (req.mode === "navigate" ? caches.match("index.html") : undefined);
        });
      })
    );
    return;
  }

  // Librería de Supabase (versión fija) y tipografías: primero la copia guardada.
  if(isStaticCdn(url)){
    ev.respondWith(
      caches.match(req).then(function(hit){
        return hit || fetch(req).then(function(res){
          if(res.ok || res.type === "opaque"){
            var copy = res.clone();
            caches.open(CACHE).then(function(c){ c.put(req, copy); });
          }
          return res;
        });
      })
    );
  }
});

// ---------- avisos (notificaciones push de las rutinas) ----------
self.addEventListener("push", function(ev){
  var d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch(e){ d = { title: "Planes", body: ev.data ? ev.data.text() : "" }; }
  ev.waitUntil(self.registration.showNotification(d.title || "Planes", {
    body: d.body || "",
    tag: d.tag,
    icon: "icons/icon-192.png",
    data: { url: d.url || "./?rutinas" }
  }));
});

// Tocar la notificación abre Planes en la vista Rutinas (o trae al frente la que ya está abierta).
self.addEventListener("notificationclick", function(ev){
  ev.notification.close();
  var url = new URL((ev.notification.data && ev.notification.data.url) || "./?rutinas", self.registration.scope).href;
  ev.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list){
    for(var i = 0; i < list.length; i++){
      var c = list[i];
      if(c.url.indexOf(self.registration.scope) === 0 && "focus" in c){
        return c.focus().then(function(w){ return w && w.navigate ? w.navigate(url).catch(function(){}) : null; });
      }
    }
    return self.clients.openWindow(url);
  }));
});
