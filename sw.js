const CACHE = "opalday-v1.0.1";
const ASSETS = ["./","./index.html","./styles.css","./calendar.css","./v04.css","./app.js","./calendar.js","./notifications.js","./config.js","./manifest.webmanifest","./app-icon.png"];
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
self.addEventListener("push",event=>{let data={title:"OpalDay reminder",body:"You have something coming up.",url:"./"};try{if(event.data)data={...data,...event.data.json()}}catch{}event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"./app-icon.png",tag:data.tag||"opalday-reminder",data:{url:data.url||"./"},renotify:true}))});
self.addEventListener("notificationclick",event=>{event.notification.close();event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{const existing=list.find(c=>"focus"in c);return existing?existing.focus():clients.openWindow(event.notification.data?.url||"./")}))});
