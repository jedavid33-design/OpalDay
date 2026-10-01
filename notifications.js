(function(){
  const PUSH_KEY="opalday-push-enabled";
  const reminderStore=()=>state.planner.dayReminders||(state.planner.dayReminders={});
  reminderStore();
  const todayKey=()=>dateKey(new Date());
  const reminderTime=x=>x.time||x.fixedTime||"12:00";
  function dayBucket(){const store=reminderStore(),key=todayKey();return store[key]||(store[key]={items:[],events:[],custom:[]})}
  function todayEntries(){
    const items=state.planner.items.filter(dueToday),events=window.OpalDayCalendar?.todayEvents?.()||[];
    return{items,events,all:items.map(x=>({type:"item",id:x.id,title:x.title,time:reminderTime(x),kind:x.kind})).concat(events.map(x=>({type:"event",id:x.id,title:x.title,time:reminderTime(x),kind:window.OpalDayCalendar?.calendarName?.(x.calendarId)||"event"})))}
  }
  function prettyTime(value){return new Date("2000-01-01T"+value).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}
  function wheelHtml(prefix,value="12:00"){let[h,m]=String(value||"12:00").split(":").map(Number),rounded=Math.round((m||0)/5)*5;if(rounded===60){rounded=0;h=(h+1)%24}const display=(h%12)||12,period=h>=12?"PM":"AM",hours=Array.from({length:12},(_,n)=>'<option value="'+(n+1)+'" '+(display===n+1?'selected':'')+'>'+(n+1)+'</option>').join(""),minutes=Array.from({length:12},(_,n)=>{const v=String(n*5).padStart(2,"0");return'<option value="'+v+'" '+(rounded===n*5?'selected':'')+'>'+v+'</option>'}).join("");return'<div class="time-wheel" data-time-wheel="'+prefix+'"><label>Hour<select id="'+prefix+'Hour">'+hours+'</select></label><b>:</b><label>Minute<select id="'+prefix+'Minute">'+minutes+'</select></label><label>Period<select id="'+prefix+'Period"><option '+(period==="AM"?'selected':'')+'>AM</option><option '+(period==="PM"?'selected':'')+'>PM</option></select></label></div>'}
  function readTimeWheel(prefix){let h=Number($("#"+prefix+"Hour").value)||12,m=$("#"+prefix+"Minute").value||"00",period=$("#"+prefix+"Period").value;if(period==="AM"&&h===12)h=0;if(period==="PM"&&h!==12)h+=12;return String(h).padStart(2,"0")+":"+m}
  function decodeKey(value){const pad="=".repeat((4-value.length%4)%4),raw=atob((value+pad).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
  async function ensurePush(){
    if(!state.syncCode){showSync();toast("Set up sync before notifications");return false}
    if(!workerUrl()){toast("Worker URL needed");return false}
    if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window)){toast("Install OpalDay on your Home Screen first");return false}
    let permission=Notification.permission;if(permission==="default")permission=await Notification.requestPermission();if(permission!=="granted"){toast("Notifications remain off");return false}
    try{
      const keyResponse=await fetch(workerUrl()+"/push/vapid-key");if(!keyResponse.ok)throw Error();const{publicKey}=await keyResponse.json(),registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)});
      const response=await fetch(workerUrl()+"/push/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:state.syncCode,subscription:subscription.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"})});if(!response.ok)throw Error();
      localStorage.setItem(PUSH_KEY,"true");return true
    }catch{toast("Couldn’t connect notifications yet");return false}
  }
  async function updateSettings(){
    const status=$("#notificationSettingsStatus"),button=$("#enableNotificationsSettings");if(!status||!button)return;
    const supported="serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window,permission=supported?Notification.permission:"unsupported",connected=localStorage.getItem(PUSH_KEY)==="true";
    button.disabled=false;
    let freshness="";
    if(supported&&permission==="granted"&&connected&&workerUrl()){
      try{
        const response=await fetch(workerUrl()+"/health"),health=response.ok?await response.json():null;
        if(health&&health.lastCronRun){
          const ageMin=(Date.now()-Date.parse(health.lastCronRun))/60000;
          if(!(ageMin>=0)||ageMin>20)freshness=" — ⚠ reminder scheduler hasn't checked in recently";
        }else freshness=" — scheduler status unknown";
      }catch{/* network failure: leave the status text as-is */}
    }
    if(!supported){status.textContent="Install OpalDay on your Home Screen first";button.textContent="Notifications unavailable";button.disabled=true}
    else if(permission==="denied"){status.textContent="Blocked in iPhone or iPad settings";button.textContent="Permission blocked";button.disabled=true}
    else if(permission==="granted"&&connected){
      let tapNote="";
      try{
        const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
        let latest=localStorage.getItem("opalday-last-push-tap");
        if(sub&&workerUrl()){const r=await fetch(workerUrl()+"/push/ack?endpoint="+encodeURIComponent(sub.endpoint));if(r.ok)latest=[latest,(await r.json()).lastAck].filter(Boolean).sort().at(-1)}
        tapNote=latest?" · last reminder opened "+new Date(latest).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):" · no reminder opened yet";
      }catch{}
      status.textContent="Ready — individual reminders remain opt-in"+freshness+tapNote;button.textContent="Notifications enabled";button.disabled=true}
    else if(permission==="granted"){status.textContent="Permission granted — finish connecting";button.textContent="Finish notification setup"}
    else{status.textContent="Off until you enable them";button.textContent="Enable notifications"}
  }
  async function enableFromSettings(){if(await ensurePush()){updateSettings();toast("Notifications are ready")}}
  function updateTodayButton(){const button=$("#todayRemindersButton");if(!button)return;const bucket=reminderStore()[todayKey()],count=(bucket?.items?.length||0)+(bucket?.events?.length||0)+(bucket?.custom?.length||0);button.classList.toggle("active",count>0);button.classList.toggle("quiet",!count);button.querySelector("strong").textContent=count?count+" reminder"+(count===1?"":"s")+" set for today":"Set reminders for today";button.querySelector("small").textContent=count?"Tap to review or clear them.":"Notifications are off until you choose them."}
  let foregroundTimer;
  function showForegroundNotification(data={}){const banner=$("#foregroundNotification");if(!banner)return;$("#foregroundNotificationTitle").textContent=data.title||"OpalDay reminder";$("#foregroundNotificationBody").textContent=data.body||"You have something coming up.";banner.classList.remove("hidden");clearTimeout(foregroundTimer);foregroundTimer=setTimeout(()=>banner.classList.add("hidden"),9000)}
  const recentPushTags={};
  // C3: if the OS/browser permission was revoked while push is still enabled,
  // the worker would log "delivered" into the void. Surface a banner, and in
  // installed-PWA mode quietly drop the dead subscription (plain Safari tabs
  // can share localStorage and must not unsubscribe other contexts). PUSH_KEY
  // stays so re-enabling re-subscribes automatically.
  function checkPermissionState(){
    if(!("Notification"in window))return;
    if(localStorage.getItem(PUSH_KEY)==="true"&&Notification.permission==="denied"){
      showForegroundNotification({title:"Notifications blocked",body:"OpalDay reminders can't reach you until you turn notifications back on in iPhone/iPad Settings."});
      const standalone=window.navigator.standalone===true||(window.matchMedia&&matchMedia("(display-mode: standalone)").matches);
      if(standalone&&workerUrl())(async()=>{try{const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub)await fetch(workerUrl()+"/push/subscribe",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({endpoint:sub.endpoint})})}catch{}})();
    }
  }
  // m11: travelling without a reload leaves the worker scheduling against a
  // stale timezone — re-POST the subscription with the current tz when the
  // page becomes visible again.
  async function refreshPushTimezone(){
    try{
      if(localStorage.getItem(PUSH_KEY)!=="true"||!("Notification"in window)||Notification.permission!=="granted"||!workerUrl())return;
      const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
      if(!sub||!state.syncCode)return;
      await fetch(workerUrl()+"/push/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:state.syncCode,subscription:sub.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"America/New_York"})});
    }catch{}
  }
  function showTodaySheet(){const entries=todayEntries().all,bucket=reminderStore()[todayKey()]||{items:[],events:[],custom:[]};$("#todayReminderList").innerHTML=entries.length?entries.map(x=>'<div class="today-reminder-row"><span><strong>'+escapeHtml(x.title)+'</strong><small>'+escapeHtml(x.kind)+'</small></span><b>'+prettyTime(x.time)+'</b></div>').join(""):'<div class="small-empty">Nothing needs a reminder today.</div>';$("#enableTodayReminders").disabled=!entries.length;$("#clearTodayReminders").disabled=!((bucket.items||[]).length||(bucket.events||[]).length||(bucket.custom||[]).length);openModal("#todayRemindersModal")}
  async function enableToday(){const entries=todayEntries();if(!entries.all.length)return;if(!await ensurePush())return;const bucket=dayBucket();bucket.items=[...new Set(entries.items.filter(i=>!i.notification?.enabled).map(x=>x.id))];bucket.events=[...new Set(entries.events.filter(e=>e.source!=="builtin"&&!e.notification?.enabled).map(x=>x.id))];bucket.custom=entries.events.filter(e=>e.source==="builtin").map(e=>({id:e.id,title:e.title,time:reminderTime(e)}));closeModals();changed();updateTodayButton();toast("Today’s reminders are on")}
  function clearToday(){delete reminderStore()[todayKey()];closeModals();changed();updateTodayButton();toast("Today’s reminders cleared")}
  function notificationPanel(i){const bucket=reminderStore()[todayKey()]||{items:[]},todayOnly=bucket.items.includes(i.id)&&!i.notification?.enabled,enabled=!!i.notification?.enabled||todayOnly,time=i.notification?.time||i.fixedTime||"12:00";return'<div class="notification-editor item-notification-editor"><div><strong>Notification</strong><span>Off unless you enable it</span></div><label class="switch-row"><input id="itemNotify" type="checkbox" '+(enabled?'checked':'')+'> Remind me</label><div class="notification-wheel-field"><span>Reminder time</span>'+wheelHtml("itemNotify",time)+'<small>Five-minute increments</small></div><label>Apply to<select id="itemNotifyScope"><option value="every" '+(!todayOnly?'selected':'')+'>Every occurrence</option><option value="today" '+(todayOnly?'selected':'')+'>Today only</option></select></label><button class="secondary full notification-save" id="saveItemNotification">Save notification</button>'+(i.kind==="medication"?'<p class="modal-note notification-note">Medication alerts include one hour before, due now, and overdue follow-ups until marked taken. Chained follow-ups (a second nudge only after you check off the first) aren\'t scheduled in-app.</p>':'')+'</div>'}
  const originalShowItem=showItem;
  showItem=function(id){originalShowItem(id);const i=state.planner.items.find(x=>x.id===id);if(!i)return;$("#itemModalBody").insertAdjacentHTML("beforeend",notificationPanel(i));$("#saveItemNotification").onclick=()=>saveItemNotification(i)};
  async function saveItemNotification(i){const enabled=$("#itemNotify").checked,scope=$("#itemNotifyScope").value,time=readTimeWheel("itemNotify");if(enabled&&!await ensurePush())return;const bucket=dayBucket();if(scope==="today"){i.notification={...(i.notification||{}),enabled:false,time};bucket.items=enabled?[...new Set([...bucket.items,i.id])]:bucket.items.filter(id=>id!==i.id)}else{i.notification={enabled,time};bucket.items=bucket.items.filter(id=>id!==i.id)}closeModals();changed();updateTodayButton();toast(enabled?"Notification saved":"Notification off")}
  const originalSaveEvent=$("#saveEvent").onclick;
  $("#saveEvent").onclick=async()=>{if($("#eventNotify").checked&&!await ensurePush())return;originalSaveEvent()};
  $("#todayRemindersButton").onclick=showTodaySheet;$("#enableTodayReminders").onclick=enableToday;$("#clearTodayReminders").onclick=clearToday;$("#enableNotificationsSettings").onclick=enableFromSettings;
  $("#foregroundNotification").onclick=()=>$("#foregroundNotification").classList.add("hidden");
  if("serviceWorker"in navigator)navigator.serviceWorker.addEventListener("message",event=>{if(event.data?.type==="OPALDAY_FOREGROUND_NOTIFICATION"){if(event.data.data?.tag)recentPushTags[event.data.data.tag]=Date.now();showForegroundNotification(event.data.data)}});
  const previousRender=render;render=function(){previousRender();updateTodayButton()};
  window.OpalDayNotifications={updateSettings,showForegroundNotification,checkPermissionState,refreshPushTimezone,recentPushTags};updateTodayButton();updateSettings();checkPermissionState();
  if(localStorage.getItem(PUSH_KEY)==="true"&&"Notification"in window&&Notification.permission==="granted")setTimeout(()=>{if(Notification.permission==="granted")ensurePush()},1800);
})();
