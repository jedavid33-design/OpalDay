// M6: a single APP_VERSION drives the cache name and every asset's ?v=
// query string. When releasing a new version, bump APP_VERSION here and in
// index.html's ?v= parameters and OPALDAY_VERSION in app.js — the cache-name
// change purges the old cache on activation, so all three must move together.
const APP_VERSION = "1.6.2";
const CACHE = "opalday-v" + APP_VERSION;
const ASSETS = ["./","./index.html","./styles.css?v="+APP_VERSION,"./calendar.css?v="+APP_VERSION,"./v04.css?v="+APP_VERSION,"./app.js?v="+APP_VERSION,"./calendar.js?v="+APP_VERSION,"./notifications.js?v="+APP_VERSION,"./config.js?v="+APP_VERSION,"./manifest.webmanifest","./app-icon.png","./app-icon-180.png","./app-icon-192.png","./app-icon-512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  // m12: cache same-origin static GETs only — never the worker API
  // (/sync, /sports, /widget, /push), which is cross-origin here anyway —
  // and never error responses.
  const url = new URL(event.request.url);
  const cacheable = url.origin === self.location.origin;
  event.respondWith(fetch(event.request).then(response => {
    if (cacheable && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
// m2: if a client window is visible, route the push to the in-app banner and
// skip showNotification so the user doesn't get both a banner and an OS
// notification for the same reminder.
self.addEventListener("push",event=>{let data={title:"OpalDay reminder",body:"You have something coming up.",url:"./"};try{if(event.data)data={...data,...event.data.json()}}catch{}event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});let visible=false;for(const client of windows)if(client.visibilityState==="visible"){visible=true;client.postMessage({type:"OPALDAY_FOREGROUND_NOTIFICATION",data})}if(!visible)await self.registration.showNotification(data.title,{body:data.body,icon:"./app-icon.png",tag:data.tag||"opalday-reminder",data:{url:data.url||"./"},renotify:true})})())});
self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{const existing=list.find(c=>"focus"in c);return existing?existing.focus():clients.openWindow(event.notification.data?.url||"./")}))});

self.addEventListener("message",event=>{if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting()});
