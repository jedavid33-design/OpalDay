const CACHE = "opalday-v1.6.0";
const ASSETS = ["./","./index.html","./styles.css?v=1.6.0","./calendar.css?v=1.6.0","./v04.css?v=1.6.0","./app.js?v=1.6.0","./calendar.js?v=1.6.0","./notifications.js?v=1.6.0","./config.js?v=1.6.0","./manifest.webmanifest","./app-icon.png","./app-icon-180.png","./app-icon-192.png","./app-icon-512.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
self.addEventListener("push",event=>{let data={title:"OpalDay reminder",body:"You have something coming up.",url:"./"};try{if(event.data)data={...data,...event.data.json()}}catch{}event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});for(const client of windows)if(client.visibilityState==="visible")client.postMessage({type:"OPALDAY_FOREGROUND_NOTIFICATION",data});await self.registration.showNotification(data.title,{body:data.body,icon:"./app-icon.png",tag:data.tag||"opalday-reminder",data:{url:data.url||"./"},renotify:true})})())});
self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{const existing=list.find(c=>"focus"in c);return existing?existing.focus():clients.openWindow(event.notification.data?.url||"./")}))});

self.addEventListener("message",event=>{if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting()});
