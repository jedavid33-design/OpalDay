(function(){
  const PUSH_KEY="opalday-push-enabled";
  state.planner.dayReminders=state.planner.dayReminders||{};
  const todayKey=()=>dateKey(new Date());
  const reminderTime=x=>x.time||x.fixedTime||"12:00";
  function dayBucket(){const key=todayKey();return state.planner.dayReminders[key]||(state.planner.dayReminders[key]={items:[],events:[],custom:[]})}
  function todayEntries(){
    const items=state.planner.items.filter(dueToday),events=window.OpalDayCalendar?.todayEvents?.()||[];
    return{items,events,all:items.map(x=>({type:"item",id:x.id,title:x.title,time:reminderTime(x),kind:x.kind})).concat(events.map(x=>({type:"event",id:x.id,title:x.title,time:reminderTime(x),kind:window.OpalDayCalendar?.calendarName?.(x.calendarId)||"event"})))}
  }
  function prettyTime(value){return new Date("2000-01-01T"+value).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}
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
  function updateSettings(){
    const status=$("#notificationSettingsStatus"),button=$("#enableNotificationsSettings");if(!status||!button)return;
    const supported="serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window,permission=supported?Notification.permission:"unsupported",connected=localStorage.getItem(PUSH_KEY)==="true";
    button.disabled=false;
    if(!supported){status.textContent="Install OpalDay on your Home Screen first";button.textContent="Notifications unavailable";button.disabled=true}
    else if(permission==="denied"){status.textContent="Blocked in iPhone or iPad settings";button.textContent="Permission blocked";button.disabled=true}
    else if(permission==="granted"&&connected){status.textContent="Ready — individual reminders remain opt-in";button.textContent="Notifications enabled";button.disabled=true}
    else if(permission==="granted"){status.textContent="Permission granted — finish connecting";button.textContent="Finish notification setup"}
    else{status.textContent="Off until you enable them";button.textContent="Enable notifications"}
  }
  async function enableFromSettings(){if(await ensurePush()){updateSettings();toast("Notifications are ready")}}
  function updateTodayButton(){const button=$("#todayRemindersButton");if(!button)return;const bucket=state.planner.dayReminders[todayKey()],count=(bucket?.items?.length||0)+(bucket?.events?.length||0)+(bucket?.custom?.length||0);button.classList.toggle("active",count>0);button.querySelector("strong").textContent=count?count+" reminder"+(count===1?"":"s")+" set for today":"Set reminders for today";button.querySelector("small").textContent=count?"Tap to review or clear them.":"Notifications are off until you choose them."}
  function showTodaySheet(){const entries=todayEntries().all,bucket=state.planner.dayReminders[todayKey()]||{items:[],events:[],custom:[]};$("#todayReminderList").innerHTML=entries.length?entries.map(x=>'<div class="today-reminder-row"><span><strong>'+escapeHtml(x.title)+'</strong><small>'+escapeHtml(x.kind)+'</small></span><b>'+prettyTime(x.time)+'</b></div>').join(""):'<div class="small-empty">Nothing needs a reminder today.</div>';$("#enableTodayReminders").disabled=!entries.length;$("#clearTodayReminders").disabled=!((bucket.items||[]).length||(bucket.events||[]).length||(bucket.custom||[]).length);openModal("#todayRemindersModal")}
  async function enableToday(){const entries=todayEntries();if(!entries.all.length)return;if(!await ensurePush())return;const bucket=dayBucket();bucket.items=[...new Set(entries.items.map(x=>x.id))];bucket.events=[...new Set(entries.events.filter(e=>e.source!=="builtin").map(x=>x.id))];bucket.custom=entries.events.filter(e=>e.source==="builtin").map(e=>({id:e.id,title:e.title,time:reminderTime(e)}));closeModals();changed();updateTodayButton();toast("Today’s reminders are on")}
  function clearToday(){delete state.planner.dayReminders[todayKey()];closeModals();changed();updateTodayButton();toast("Today’s reminders cleared")}
  function notificationPanel(i){const bucket=state.planner.dayReminders[todayKey()]||{items:[]},todayOnly=bucket.items.includes(i.id)&&!i.notification?.enabled,enabled=!!i.notification?.enabled||todayOnly,time=i.notification?.time||i.fixedTime||"12:00";return'<div class="notification-editor item-notification-editor"><div><strong>Notification</strong><span>Off unless you enable it</span></div><label class="switch-row"><input id="itemNotify" type="checkbox" '+(enabled?'checked':'')+'> Remind me</label><label>Time<input id="itemNotifyTime" type="time" value="'+time+'"></label><label>Apply to<select id="itemNotifyScope"><option value="every" '+(!todayOnly?'selected':'')+'>Every occurrence</option><option value="today" '+(todayOnly?'selected':'')+'>Today only</option></select></label><button class="secondary full notification-save" id="saveItemNotification">Save notification</button>'+(i.kind==="medication"?'<p class="modal-note notification-note">Medication alerts include one hour before, due now, and overdue follow-ups until marked taken.</p>':'')+'</div>'}
  const originalShowItem=showItem;
  showItem=function(id){originalShowItem(id);const i=state.planner.items.find(x=>x.id===id);if(!i)return;$("#itemModalBody").insertAdjacentHTML("beforeend",notificationPanel(i));$("#saveItemNotification").onclick=()=>saveItemNotification(i)};
  async function saveItemNotification(i){const enabled=$("#itemNotify").checked,scope=$("#itemNotifyScope").value,time=$("#itemNotifyTime").value||"12:00";if(enabled&&!await ensurePush())return;const bucket=dayBucket();if(scope==="today"){i.notification={...(i.notification||{}),enabled:false,time};bucket.items=enabled?[...new Set([...bucket.items,i.id])]:bucket.items.filter(id=>id!==i.id)}else{i.notification={enabled,time};bucket.items=bucket.items.filter(id=>id!==i.id)}closeModals();changed();updateTodayButton();toast(enabled?"Notification saved":"Notification off")}
  const originalSaveEvent=$("#saveEvent").onclick;
  $("#saveEvent").onclick=async()=>{if($("#eventNotify").checked&&!await ensurePush())return;originalSaveEvent()};
  $("#todayRemindersButton").onclick=showTodaySheet;$("#enableTodayReminders").onclick=enableToday;$("#clearTodayReminders").onclick=clearToday;$("#enableNotificationsSettings").onclick=enableFromSettings;
  const previousRender=render;render=function(){previousRender();updateTodayButton()};
  window.OpalDayNotifications={updateSettings};updateTodayButton();updateSettings();
  if(localStorage.getItem(PUSH_KEY)==="true"&&"Notification"in window&&Notification.permission==="granted")setTimeout(()=>ensurePush(),1800);
})();
