(function(){
  const DAY=86400000, COLORS=["#7f3659","#70549b","#458d91","#c36f7d","#557aa8","#ad793e","#925887","#4f826b"];
  const SPORTS=[
    {id:"astros",name:"Houston Astros",short:"MLB",color:"#d86b32",aliases:["astros","houston astros"]},
    {id:"vgk",name:"Vegas Golden Knights",short:"NHL",color:"#b4975a",aliases:["vgk","golden knights","vegas golden knights"]},
    {id:"pwhl-vegas",name:"PWHL Las Vegas",short:"PWHL",color:"#50775d",aliases:["pwhl las vegas","pwhl vegas"]},
    {id:"boston-fleet",name:"Boston Fleet",short:"PWHL",color:"#31746b",aliases:["boston fleet"]},
    {id:"wpbl",name:"WPBL",short:"All league games",color:"#9b4f78",aliases:["wpbl","women’s pro baseball","womens pro baseball"]}
  ];
  function ensureCalendarData(){
    state.planner.calendars=state.planner.calendars||[
      {id:"mine",name:"Mine",color:"#7f3659",visible:true},
      {id:"moms",name:"Mom’s",color:"#70549b",visible:true},
      {id:"birthdays",name:"Birthdays",color:"#c36f7d",visible:true},
      {id:"holidays",name:"Holidays",color:"#458d91",visible:true}
    ];
    state.planner.events=state.planner.events||[];
    state.planner.feeds=state.planner.feeds||[];
    state.planner.deletedFeedUids=state.planner.deletedFeedUids||[];
    state.planner.sports=state.planner.sports||{};
    for(const sport of SPORTS){
      let calendar=state.planner.calendars.find(x=>x.sportId===sport.id);
      if(!calendar)calendar=state.planner.calendars.find(x=>sport.aliases.some(a=>String(x.name||"").toLowerCase().includes(a)));
      if(!calendar){calendar={id:"sport-"+sport.id,name:sport.name,color:sport.color,visible:true};state.planner.calendars.push(calendar)}
      calendar.sportId=sport.id;
      if(state.planner.sports[sport.id]===undefined)state.planner.sports[sport.id]={enabled:true,lastRefresh:null,error:false};
      else if(typeof state.planner.sports[sport.id]==="boolean")state.planner.sports[sport.id]={enabled:state.planner.sports[sport.id],lastRefresh:null,error:false};
    }
  }
  ensureCalendarData();
  state.calView=localStorage.getItem("opalday-cal-view")||"timeline";
  state.calCursor=new Date();
  state.editEvent=null; state.editCalendar=null;
  state.calOverlays=JSON.parse(localStorage.getItem("opalday-cal-overlays")||"null")||{events:true,habits:true,medications:true,resets:true,completed:true};
  function dk(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
  function ws(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
  function c(id){return state.planner.calendars.find(x=>x.id===id)||state.planner.calendars[0]}
  function fmt(t){return t?new Date("2000-01-01T"+t).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"All day"}
  function nthWeekday(year,month,weekday,n){const d=new Date(year,month,1);d.setDate(1+((weekday-d.getDay()+7)%7)+(n-1)*7);return d}
  function lastWeekday(year,month,weekday){const d=new Date(year,month+1,0);d.setDate(d.getDate()-((d.getDay()-weekday+7)%7));return d}
  function usHolidays(year){
    const list=[
      ["New Year’s Day",new Date(year,0,1)],
      ["Martin Luther King Jr. Day",nthWeekday(year,0,1,3)],
      ["Presidents’ Day",nthWeekday(year,1,1,3)],
      ["Memorial Day",lastWeekday(year,4,1)],
      ["Juneteenth",new Date(year,5,19)],
      ["Independence Day",new Date(year,6,4)],
      ["Labor Day",nthWeekday(year,8,1,1)],
      ["Columbus Day",nthWeekday(year,9,1,2)],
      ["Veterans Day",new Date(year,10,11)],
      ["Thanksgiving",nthWeekday(year,10,4,4)],
      ["Christmas Day",new Date(year,11,25)]
    ];
    return list.map((x,n)=>({id:"us-holiday-"+year+"-"+n,title:x[0],date:dk(x[1]),time:null,end:null,calendarId:"holidays",source:"builtin"}))
  }
  function options(){return state.planner.calendars.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>').join("")}
  function calendarSummary(x){
    const saved=state.planner.events.filter(e=>e.calendarId===x.id).length;
    if(x.id==="holidays")return (saved+usHolidays(new Date().getFullYear()).length)+" holidays · built in";
    return saved+" events"+(x.sportId?" · built-in sport":"")
  }
  function overlayKey(i){return i.kind==="medication"?"medications":i.kind==="reset"?"resets":"habits"}
  function systemOn(i,d){
    if(!state.calOverlays[overlayKey(i)]||(!state.calOverlays.completed&&itemComplete(i,d)))return false;
    if(i.kind==="medication")return medOccursOn(i,d);
    if(i.cadence==="daily")return true;
    if(i.cadence==="once")return i.hardDate===dk(d);
    if(i.cadence==="weekly")return i.fixedDay!==null&&i.fixedDay===d.getDay();
    if(i.cadence==="interval"){const a=new Date((i.hardDate||i.createdAt.slice(0,10))+"T12:00"),days=Math.round((new Date(dk(d)+"T12:00")-a)/DAY);return days>=0&&days%((i.intervalWeeks||1)*7)===0}
    if(i.cadence==="monthly"){const a=new Date((i.hardDate||i.createdAt.slice(0,10))+"T12:00");return d.getDate()===a.getDate()}
    return false
  }
  function entryColor(e){return e._system?(e.kind==="medication"?"#a7354f":e.kind==="reset"?"#4e9f99":"#8b6bb5"):c(e.calendarId).color}
  function eventsOn(d){
    const builtin=state.calOverlays.events&&c("holidays").visible!==false?usHolidays(d.getFullYear()).filter(e=>e.date===dk(d)):[];
    const events=state.calOverlays.events?state.planner.events.filter(e=>e.date===dk(d)&&c(e.calendarId).visible!==false).concat(builtin):[];
    const systems=state.planner.items.filter(i=>systemOn(i,d)).map(i=>Object.assign({},i,{_system:true,_date:dk(d),time:i.fixedTime}));
    return events.concat(systems).sort((a,b)=>{const pa=a.kind==="medication"&&medState(a,d)==="overdue"?0:a.kind==="medication"?1:2,pb=b.kind==="medication"&&medState(b,d)==="overdue"?0:b.kind==="medication"?1:2;return pa-pb||(a.time||"99").localeCompare(b.time||"99")})
  }
  function flexibleBand(){
    const items=state.planner.items.filter(i=>["habit","reset"].includes(i.kind)&&i.cadence==="weekly"&&i.fixedDay===null&&state.calOverlays[overlayKey(i)]&&(state.calOverlays.completed||!complete(i)));
    return items.length?'<div class="goal-band"><small>ANYTIME THIS WEEK</small>'+items.map(i=>'<button data-system="'+i.id+'">'+escapeHtml(i.title)+'<span>'+periodCount(i)+'/'+target(i)+'</span></button>').join("")+'</div>':""
  }
  function monthlyBand(){
    const items=state.planner.items.filter(i=>i.kind==="reset"&&i.cadence==="monthly"&&state.calOverlays.resets&&(state.calOverlays.completed||!complete(i)));
    return items.length?'<div class="goal-band monthly"><small>THIS MONTH</small>'+items.map(i=>'<button data-system="'+i.id+'">'+escapeHtml(i.title)+'<span>'+(complete(i)?"Done":"Open")+'</span></button>').join("")+'</div>':""
  }
  const baseRender=render;
  render=function(){baseRender();renderCalendar()};
  function renderCalendar(){
    ensureCalendarData();
    if(!$("#calendarCanvas"))return;
    $$("[data-cal-view]").forEach(b=>b.classList.toggle("selected",b.dataset.calView===state.calView));
    $$("[data-overlay]").forEach(b=>b.classList.toggle("selected",!!state.calOverlays[b.dataset.overlay]));
    $("#calRange").textContent=range();
    $("#calendarCanvas").innerHTML=state.calView==="month"?month():state.calView==="week"?week():day();
    $("#calendarList").innerHTML=state.planner.calendars.map(x=>'<article class="calendar-row"><button class="cal-visible '+(x.visible===false?"off":"")+'" data-cal-visible="'+x.id+'" style="--event:'+x.color+'">'+(x.visible===false?"":"✓")+'</button><button class="cal-name" data-cal-edit="'+x.id+'"><i style="--event:'+x.color+'"></i><span><strong>'+escapeHtml(x.name)+'</strong><small>'+calendarSummary(x)+'</small></span></button></article>').join("");
    $("#sportsCalendarList").innerHTML=SPORTS.map(s=>{const setting=state.planner.sports[s.id],calendar=sportCalendar(s.id);return '<button class="sports-toggle '+(setting.enabled?"enabled":"")+'" data-sport="'+s.id+'" style="--event:'+calendar.color+'"><i></i><span><strong>'+escapeHtml(calendar.name)+'</strong><small>'+s.short+(setting.lastRefresh?" · updated "+new Date(setting.lastRefresh).toLocaleDateString([],{month:"short",day:"numeric"}):"")+'</small></span><b>'+(setting.enabled?"On":"Off")+'</b></button>'}).join("");
    $("#icalCalendar").innerHTML=options();$("#eventCalendar").innerHTML=options();
    $$("[data-event]").forEach(b=>b.onclick=()=>openEvent(b.dataset.event));
    $$("[data-system]").forEach(b=>b.onclick=()=>showItem(b.dataset.system));
    $$("[data-cal-day]").forEach(b=>b.onclick=()=>{state.calCursor=new Date(b.dataset.calDay+"T12:00");state.calView="day";render()});
    $$("[data-cal-visible]").forEach(b=>b.onclick=()=>{const x=c(b.dataset.calVisible);x.visible=x.visible===false;calendarChanged()});
    $$("[data-cal-edit]").forEach(b=>b.onclick=()=>openCalendar(b.dataset.calEdit));
    $$("[data-sport]").forEach(b=>b.onclick=()=>toggleSport(b.dataset.sport));
  }
  function range(){if(state.calView==="month")return state.calCursor.toLocaleDateString([],{month:"long",year:"numeric"});if(state.calView==="week"){const s=ws(state.calCursor),e=new Date(s.getTime()+6*DAY);return s.toLocaleDateString([],{month:"short",day:"numeric"})+"–"+e.toLocaleDateString([],{month:"short",day:"numeric"})}return state.calCursor.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})}
  function chip(e){const color=entryColor(e),attr=e.source==="builtin"?"":e._system?' data-system="'+e.id+'"':' data-event="'+e.id+'"',onDate=e._system?new Date((e._date||dk(state.calCursor))+"T12:00"):state.calCursor,done=e._system&&itemComplete(e,onDate),label=e._system?(e.kind==="medication"?(done?"Taken":medState(e,onDate)==="overdue"?"OVERDUE · Hard deadline":"Hard medication deadline"):cadenceLabel(e)):escapeHtml(c(e.calendarId).name);return '<button class="event-chip kind-'+(e.kind||"event")+(done?" is-complete":"")+'"'+attr+' style="--event:'+color+'"><strong>'+escapeHtml(e.title)+'</strong><small>'+fmt(e.time)+' · '+label+'</small></button>'}
  function day(){
    const ev=eventsOn(state.calCursor),systems=ev.filter(e=>e._system),scheduled=ev.filter(e=>!e._system),allDay=scheduled.filter(e=>!e.time),timed=scheduled.filter(e=>e.time);
    const systemTop=systems.length?'<div class="day-system-band"><small>HABITS & REMINDERS</small>'+systems.map(chip).join("")+'</div>':"";
    const allDayTop=allDay.length?'<div class="day-all-day-band"><small>ALL DAY</small>'+allDay.map(chip).join("")+'</div>':"";
    const top=systemTop+allDayTop;
    if(state.calView==="timeline")return top+(timed.length?'<div class="calendar-timeline">'+timed.map(e=>'<div><time>'+fmt(e.time)+'</time><span style="--event:'+entryColor(e)+'"></span>'+chip(e)+'</div>').join("")+'</div>':top?"":'<div class="small-empty">No items on this date.</div>');
    return top+'<div class="day-grid">'+Array.from({length:18},(_,n)=>n+6).map(h=>{const here=timed.filter(e=>+e.time.slice(0,2)===h);return '<div class="hour-row"><time>'+new Date(2000,0,1,h).toLocaleTimeString([],{hour:"numeric"})+'</time><div>'+here.map(chip).join("")+'</div></div>'}).join("")+'</div>'
  }
  function week(){const s=ws(state.calCursor);return flexibleBand()+'<div class="week-grid">'+Array.from({length:7},(_,n)=>{const d=new Date(s.getTime()+n*DAY),ev=eventsOn(d);return '<div class="week-day '+(dk(d)===dk(new Date())?"today-col":"")+'"><button data-cal-day="'+dk(d)+'"><small>'+d.toLocaleDateString([],{weekday:"short"})+'</small><strong>'+d.getDate()+'</strong></button><div>'+ev.slice(0,5).map(chip).join("")+(ev.length>5?'<small>+'+(ev.length-5)+' more</small>':'')+'</div></div>'}).join("")+'</div>'}
  function month(){const y=state.calCursor.getFullYear(),m=state.calCursor.getMonth(),f=new Date(y,m,1),s=new Date(f);s.setDate(1-((f.getDay()+6)%7));return monthlyBand()+'<div class="month-weekdays">'+["M","T","W","T","F","S","S"].map(x=>'<span>'+x+'</span>').join("")+'</div><div class="month-grid">'+Array.from({length:42},(_,n)=>{const d=new Date(s.getTime()+n*DAY),ev=eventsOn(d);return '<button class="'+(d.getMonth()!==m?"outside ":"")+(dk(d)===dk(new Date())?"today-cell":"")+'" data-cal-day="'+dk(d)+'"><strong>'+d.getDate()+'</strong><span>'+ev.slice(0,4).map(e=>'<i style="--event:'+entryColor(e)+';opacity:'+(e._system&&itemComplete(e,d)?".35":"1")+'"></i>').join("")+'</span></button>'}).join("")+'</div>'}
  function openEvent(id){
    const e=id?state.planner.events.find(x=>x.id===id):null;state.editEvent=id||null;
    $("#eventModalTitle").textContent=e?"Edit event":"Add event";$("#eventTitle").value=e?.title||"";$("#eventDate").value=e?.date||dk(state.calCursor);$("#eventTime").value=e?.time||"";$("#eventEnd").value=e?.end||"";$("#eventCalendar").innerHTML=options();$("#eventCalendar").value=e?.calendarId||"mine";$("#deleteEvent").classList.toggle("hidden",!e);openModal("#eventModal");
  }
  function openCalendar(id){const x=id?c(id):null;state.editCalendar=id||null;$("#calendarEditTitle").textContent=x?"Edit calendar":"New calendar";$("#calendarName").value=x?.name||"";$("#calendarColor").value=x?.color||COLORS[state.planner.calendars.length%COLORS.length];openModal("#calendarEditModal")}
  function calendarChanged(){state.planner.updatedAt=new Date().toISOString();save()}
  function icsDate(v){const m=v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);if(!m)return null;return new Date(+m[1],+m[2]-1,+m[3],+(m[4]||12),+(m[5]||0))}
  function parseICS(text,cid,feedId){
    return text.replace(/\r?\n[ \t]/g,"").split("BEGIN:VEVENT").slice(1).map(block=>{
      const lines=block.split(/\r?\n/),get=n=>{const line=lines.find(l=>l.startsWith(n));return line?line.split(":").slice(1).join(":"):""},raw=get("DTSTART"),d=icsDate(raw);if(!d)return null;
      const feedUid=get("UID")||uid(),old=state.planner.events.find(e=>e.feedUid===feedUid&&e.calendarId===cid),allDay=/VALUE=DATE/.test(lines.find(l=>l.startsWith("DTSTART"))||"")||/^\d{8}$/.test(raw);
      if(old?.userEdited)return old;
      return{id:old?.id||uid(),title:(get("SUMMARY")||"Untitled event").replace(/\\,/g,",").replace(/\\n/gi," "),date:dk(d),time:allDay?null:String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"),end:null,calendarId:cid,source:feedId?"feed":"import",feedId,feedUid,createdAt:old?.createdAt||new Date().toISOString()}
    }).filter(e=>e&&!state.planner.deletedFeedUids.includes(e.feedUid))
  }
  function merge(events,cid,feedId){for(const e of events){const n=state.planner.events.findIndex(x=>x.feedUid===e.feedUid&&x.calendarId===cid);if(n<0)state.planner.events.push(e);else state.planner.events[n]=e}calendarChanged()}
  function sportCalendar(id){return state.planner.calendars.find(x=>x.sportId===id)}
  function mergeSport(id,rawEvents){
    const calendar=sportCalendar(id),fresh=new Set();
    const incoming=(rawEvents||[]).map(raw=>{
      const start=new Date(raw.start);if(!raw.uid||Number.isNaN(start.getTime()))return null;
      fresh.add(String(raw.uid));
      const old=state.planner.events.find(e=>e.source==="sports"&&e.sportId===id&&e.sportUid===String(raw.uid));
      if(old?.userEdited)return old;
      return{id:old?.id||uid(),title:raw.title||"Game",date:dk(start),time:raw.allDay?null:String(start.getHours()).padStart(2,"0")+":"+String(start.getMinutes()).padStart(2,"0"),end:null,calendarId:calendar.id,source:"sports",sportId:id,sportUid:String(raw.uid),url:raw.url||null,status:raw.status||null,createdAt:old?.createdAt||new Date().toISOString()}
    }).filter(Boolean);
    state.planner.events=state.planner.events.filter(e=>e.source!=="sports"||e.sportId!==id||e.userEdited||fresh.has(e.sportUid));
    for(const event of incoming){const n=state.planner.events.findIndex(e=>e.source==="sports"&&e.sportId===id&&e.sportUid===event.sportUid);if(n<0)state.planner.events.push(event);else state.planner.events[n]=event}
  }
  async function refreshSports(onlyId=null){
    if(!workerUrl())return toast("Worker URL needed");
    const ids=SPORTS.map(s=>s.id).filter(id=>(!onlyId||id===onlyId)&&state.planner.sports[id].enabled);
    if(!ids.length)return toast("Turn on a sports calendar first");
    $("#sportsStatus").textContent="Refreshing schedules…";$("#refreshSports").classList.add("sports-refreshing");
    let updated=0,failed=0;
    for(const id of ids){const setting=state.planner.sports[id];try{const response=await fetch(workerUrl()+"/sports?id="+encodeURIComponent(id));if(!response.ok)throw Error("Schedule unavailable");const payload=await response.json();if(!Array.isArray(payload.events))throw Error("Invalid schedule");mergeSport(id,payload.events);setting.lastRefresh=new Date().toISOString();setting.error=false;updated++}catch{setting.error=true;failed++}}
    state.planner.updatedAt=new Date().toISOString();save();$("#sportsStatus").textContent=failed?updated+" updated · "+failed+" waiting for schedule source":"Sports schedules are up to date.";$("#refreshSports").classList.remove("sports-refreshing");render()
  }
  function toggleSport(id){const setting=state.planner.sports[id],calendar=sportCalendar(id);setting.enabled=!setting.enabled;if(setting.enabled)calendar.visible=true;else calendar.visible=false;calendarChanged();render();if(setting.enabled)refreshSports(id)}
  $$("[data-cal-view]").forEach(b=>b.onclick=()=>{state.calView=b.dataset.calView;localStorage.setItem("opalday-cal-view",state.calView);render()});
  $$("[data-overlay]").forEach(b=>b.onclick=()=>{state.calOverlays[b.dataset.overlay]=!state.calOverlays[b.dataset.overlay];localStorage.setItem("opalday-cal-overlays",JSON.stringify(state.calOverlays));render()});
  $("#calPrev").onclick=()=>move(-1);$("#calNext").onclick=()=>move(1);$("#calToday").onclick=()=>{state.calCursor=new Date();render()};
  function move(n){const d=new Date(state.calCursor);if(state.calView==="month")d.setMonth(d.getMonth()+n);else d.setDate(d.getDate()+n*(state.calView==="week"?7:1));state.calCursor=d;render()}
  $("#addEventButton").onclick=()=>openEvent();$("#newCalendarButton").onclick=()=>openCalendar();
  $("#saveEvent").onclick=()=>{const title=$("#eventTitle").value.trim();if(!title)return toast("Name the event");let e=state.editEvent?state.planner.events.find(x=>x.id===state.editEvent):null;if(!e){e={id:uid(),createdAt:new Date().toISOString(),source:"manual"};state.planner.events.push(e)}e.title=title;e.date=$("#eventDate").value;e.time=$("#eventTime").value||null;e.end=$("#eventEnd").value||null;e.calendarId=$("#eventCalendar").value;if(state.editEvent)e.userEdited=true;state.editEvent=null;closeModals();calendarChanged();toast("Event saved")};
  $("#deleteEvent").onclick=()=>{const e=state.planner.events.find(x=>x.id===state.editEvent);if(!e)return;if(e.feedUid)state.planner.deletedFeedUids.push(e.feedUid);state.planner.events=state.planner.events.filter(x=>x.id!==e.id);state.editEvent=null;closeModals();calendarChanged();toast("Event deleted")};
  $("#saveCalendar").onclick=()=>{const name=$("#calendarName").value.trim();if(!name)return toast("Name the calendar");if(state.editCalendar){const x=c(state.editCalendar);x.name=name;x.color=$("#calendarColor").value}else state.planner.calendars.push({id:uid(),name,color:$("#calendarColor").value,visible:true});state.editCalendar=null;closeModals();calendarChanged()};
  $("#icalFile").onchange=async e=>{const file=e.target.files[0];if(!file)return;const cid=$("#icalCalendar").value;merge(parseICS(await file.text(),cid,null),cid,null);toast("iCal imported")};
  $("#refreshSports").onclick=()=>refreshSports();
  setTimeout(()=>{if(SPORTS.some(s=>{const x=state.planner.sports[s.id];return x.enabled&&(!x.lastRefresh||Date.now()-new Date(x.lastRefresh)>DAY)})&&workerUrl())refreshSports()},2200);
  renderCalendar();
})();
