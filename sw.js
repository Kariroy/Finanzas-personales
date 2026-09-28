// Service worker: permite instalar la app y abrirla sin conexión.
// Los archivos de la app se piden siempre a la red primero (así cada deploy se ve
// enseguida) y solo si no hay conexión se usa la copia guardada.
// Las consultas a Supabase no pasan por acá.
var CACHE = "libro-gastos-v1";
var SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
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
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
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
