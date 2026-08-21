(function(){
  const DAY=86400000, COLORS=["#7f3659","#70549b","#458d91","#c36f7d","#557aa8","#ad793e","#925887","#4f826b"];
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
  }
  ensureCalendarData();
  state.calView=localStorage.getItem("opalday-cal-view")||"timeline";
  state.calCursor=new Date();
  state.editEvent=null; state.editCalendar=null;
  function dk(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
  function ws(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
  function c(id){return state.planner.calendars.find(x=>x.id===id)||state.planner.calendars[0]}
  function fmt(t){return t?new Date("2000-01-01T"+t).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"All day"}
  function options(){return state.planner.calendars.map(x=>'<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>').join("")}
  function eventsOn(d){return state.planner.events.filter(e=>e.date===dk(d)&&c(e.calendarId).visible!==false).sort((a,b)=>(a.time||"99").localeCompare(b.time||"99"))}
  const baseRender=render;
  render=function(){baseRender();renderCalendar()};
  function renderCalendar(){
    ensureCalendarData();
    if(!$("#calendarCanvas"))return;
    $$("[data-cal-view]").forEach(b=>b.classList.toggle("selected",b.dataset.calView===state.calView));
    $("#calRange").textContent=range();
    $("#calendarCanvas").innerHTML=state.calView==="month"?month():state.calView==="week"?week():day();
    $("#calendarList").innerHTML=state.planner.calendars.map(x=>'<article class="calendar-row"><button class="cal-visible '+(x.visible===false?"off":"")+'" data-cal-visible="'+x.id+'" style="--event:'+x.color+'">'+(x.visible===false?"":"✓")+'</button><button class="cal-name" data-cal-edit="'+x.id+'"><i style="--event:'+x.color+'"></i><span><strong>'+escapeHtml(x.name)+'</strong><small>'+state.planner.events.filter(e=>e.calendarId===x.id).length+' events'+(x.feedUrl?" · linked":"")+'</small></span></button></article>').join("");
    $("#icalCalendar").innerHTML=options();$("#eventCalendar").innerHTML=options();
    $$("[data-event]").forEach(b=>b.onclick=()=>openEvent(b.dataset.event));
    $$("[data-cal-day]").forEach(b=>b.onclick=()=>{state.calCursor=new Date(b.dataset.calDay+"T12:00");state.calView="day";render()});
    $$("[data-cal-visible]").forEach(b=>b.onclick=()=>{const x=c(b.dataset.calVisible);x.visible=x.visible===false;calendarChanged()});
    $$("[data-cal-edit]").forEach(b=>b.onclick=()=>openCalendar(b.dataset.calEdit));
  }
  function range(){if(state.calView==="month")return state.calCursor.toLocaleDateString([],{month:"long",year:"numeric"});if(state.calView==="week"){const s=ws(state.calCursor),e=new Date(s.getTime()+6*DAY);return s.toLocaleDateString([],{month:"short",day:"numeric"})+"–"+e.toLocaleDateString([],{month:"short",day:"numeric"})}return state.calCursor.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})}
  function chip(e){const x=c(e.calendarId);return '<button class="event-chip" data-event="'+e.id+'" style="--event:'+x.color+'"><strong>'+escapeHtml(e.title)+'</strong><small>'+fmt(e.time)+' · '+escapeHtml(x.name)+'</small></button>'}
  function day(){const ev=eventsOn(state.calCursor);if(state.calView==="timeline")return ev.length?'<div class="calendar-timeline">'+ev.map((e,i)=>'<div><time>'+fmt(e.time)+'</time><span style="--event:'+c(e.calendarId).color+'"></span>'+chip(e)+'</div>').join("")+'</div>':'<div class="small-empty">No events on this date.</div>';return '<div class="day-grid">'+Array.from({length:18},(_,n)=>n+6).map(h=>{const here=ev.filter(e=>+(e.time||"99").slice(0,2)===h);return '<div class="hour-row"><time>'+new Date(2000,0,1,h).toLocaleTimeString([],{hour:"numeric"})+'</time><div>'+here.map(chip).join("")+'</div></div>'}).join("")+'<div class="all-day-row">'+ev.filter(e=>!e.time).map(chip).join("")+'</div></div>'}
  function week(){const s=ws(state.calCursor);return '<div class="week-grid">'+Array.from({length:7},(_,n)=>{const d=new Date(s.getTime()+n*DAY),ev=eventsOn(d);return '<div class="week-day '+(dk(d)===dk(new Date())?"today-col":"")+'"><button data-cal-day="'+dk(d)+'"><small>'+d.toLocaleDateString([],{weekday:"short"})+'</small><strong>'+d.getDate()+'</strong></button><div>'+ev.slice(0,5).map(chip).join("")+(ev.length>5?'<small>+'+(ev.length-5)+' more</small>':'')+'</div></div>'}).join("")+'</div>'}
  function month(){const y=state.calCursor.getFullYear(),m=state.calCursor.getMonth(),f=new Date(y,m,1),s=new Date(f);s.setDate(1-((f.getDay()+6)%7));return '<div class="month-weekdays">'+["M","T","W","T","F","S","S"].map(x=>'<span>'+x+'</span>').join("")+'</div><div class="month-grid">'+Array.from({length:42},(_,n)=>{const d=new Date(s.getTime()+n*DAY),ev=eventsOn(d);return '<button class="'+(d.getMonth()!==m?"outside ":"")+(dk(d)===dk(new Date())?"today-cell":"")+'" data-cal-day="'+dk(d)+'"><strong>'+d.getDate()+'</strong><span>'+ev.slice(0,4).map(e=>'<i style="--event:'+c(e.calendarId).color+'"></i>').join("")+'</span></button>'}).join("")+'</div>'}
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
  async function refresh(){const feeds=state.planner.feeds.filter(f=>f.url);if(!feeds.length)return toast("No linked calendars yet");$("#icalStatus").textContent="Refreshing…";for(const f of feeds){try{const r=await fetch(workerUrl()+"/calendar-feed?url="+encodeURIComponent(f.url));if(!r.ok)throw Error();merge(parseICS(await r.text(),f.calendarId,f.id),f.calendarId,f.id);f.lastRefresh=new Date().toISOString();f.error=false}catch{f.error=true}}$("#icalStatus").textContent="Refresh finished.";calendarChanged()}
  $$("[data-cal-view]").forEach(b=>b.onclick=()=>{state.calView=b.dataset.calView;localStorage.setItem("opalday-cal-view",state.calView);render()});
  $("#calPrev").onclick=()=>move(-1);$("#calNext").onclick=()=>move(1);$("#calToday").onclick=()=>{state.calCursor=new Date();render()};
  function move(n){const d=new Date(state.calCursor);if(state.calView==="month")d.setMonth(d.getMonth()+n);else d.setDate(d.getDate()+n*(state.calView==="week"?7:1));state.calCursor=d;render()}
  $("#addEventButton").onclick=()=>openEvent();$("#newCalendarButton").onclick=()=>openCalendar();
  $("#saveEvent").onclick=()=>{const title=$("#eventTitle").value.trim();if(!title)return toast("Name the event");let e=state.editEvent?state.planner.events.find(x=>x.id===state.editEvent):null;if(!e){e={id:uid(),createdAt:new Date().toISOString(),source:"manual"};state.planner.events.push(e)}e.title=title;e.date=$("#eventDate").value;e.time=$("#eventTime").value||null;e.end=$("#eventEnd").value||null;e.calendarId=$("#eventCalendar").value;if(state.editEvent)e.userEdited=true;state.editEvent=null;closeModals();calendarChanged();toast("Event saved")};
  $("#deleteEvent").onclick=()=>{const e=state.planner.events.find(x=>x.id===state.editEvent);if(!e)return;if(e.feedUid)state.planner.deletedFeedUids.push(e.feedUid);state.planner.events=state.planner.events.filter(x=>x.id!==e.id);state.editEvent=null;closeModals();calendarChanged();toast("Event deleted")};
  $("#saveCalendar").onclick=()=>{const name=$("#calendarName").value.trim();if(!name)return toast("Name the calendar");if(state.editCalendar){const x=c(state.editCalendar);x.name=name;x.color=$("#calendarColor").value}else state.planner.calendars.push({id:uid(),name,color:$("#calendarColor").value,visible:true});state.editCalendar=null;closeModals();calendarChanged()};
  $("#icalFile").onchange=async e=>{const file=e.target.files[0];if(!file)return;const cid=$("#icalCalendar").value;merge(parseICS(await file.text(),cid,null),cid,null);toast("iCal imported")};
  $("#linkIcal").onclick=async()=>{const url=$("#icalUrl").value.trim(),cid=$("#icalCalendar").value;if(!url)return toast("Paste an iCal link");const f={id:uid(),url,calendarId:cid,lastRefresh:null};state.planner.feeds.push(f);c(cid).feedUrl=url;calendarChanged();await refresh()};
  $("#refreshIcal").onclick=refresh;
  setTimeout(()=>{if(state.planner.feeds.some(f=>!f.lastRefresh||Date.now()-new Date(f.lastRefresh)>DAY)&&workerUrl())refresh()},2200);
  renderCalendar();
})();
