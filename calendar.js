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
    state.planner.events.filter(e=>e.source==="sports").forEach(addSportsEnd);
  }
  ensureCalendarData();
  state.calView=localStorage.getItem("opalday-cal-view")||"timeline";
  state.calCursor=new Date();
  state.editEvent=null; state.editCalendar=null;state.dayScrollPositions=state.dayScrollPositions||{};state.dayScrollManual=state.dayScrollManual||{};
  state.calOverlays=JSON.parse(localStorage.getItem("opalday-cal-overlays")||"null")||{events:true,habits:false,medications:true,resets:false,completed:false};
  if(localStorage.getItem("opalday-v06-calendar-defaults-final")!=="done"){
    state.calOverlays.habits=false;state.calOverlays.resets=false;state.calOverlays.completed=false;
    localStorage.setItem("opalday-cal-overlays",JSON.stringify(state.calOverlays));localStorage.setItem("opalday-v06-calendar-defaults-final","done")
  }
  function dk(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
  function addSportsEnd(event){if(!event.date||!event.time)return event;const start=new Date(event.date+"T"+event.time),finish=new Date(start.getTime()+3*60*60*1000);event.allDay=false;event.endDate=dk(finish);event.end=String(finish.getHours()).padStart(2,"0")+":"+String(finish.getMinutes()).padStart(2,"0");return event}
  function initTimeWheel(prefix){const hour=$("#"+prefix+"Hour"),minute=$("#"+prefix+"Minute");if(!hour)return;minute.querySelectorAll("option[data-existing]").forEach(option=>option.remove());if(!hour.options.length)hour.innerHTML=Array.from({length:12},(_,n)=>'<option value="'+(n+1)+'">'+(n+1)+'</option>').join("");if(!minute.options.length)minute.innerHTML=Array.from({length:12},(_,n)=>'<option value="'+String(n*5).padStart(2,"0")+'">'+String(n*5).padStart(2,"0")+'</option>').join("")}
  function setTimeWheel(prefix,value="12:00"){initTimeWheel(prefix);let[h,m]=String(value||"12:00").split(":").map(Number);h=Number.isFinite(h)?h:12;m=Number.isFinite(m)?m:0;const minute=$("#"+prefix+"Minute"),minuteValue=String(m).padStart(2,"0");if(m%5!==0&&!minute.querySelector('option[value="'+minuteValue+'"]')){const existing=document.createElement("option");existing.value=minuteValue;existing.textContent=minuteValue+" (existing)";existing.dataset.existing="true";minute.append(existing)}$("#"+prefix+"Hour").value=String((h%12)||12);minute.value=minuteValue;$("#"+prefix+"Period").value=h>=12?"PM":"AM"}
  function readTimeWheel(prefix){let h=Number($("#"+prefix+"Hour").value)||12,m=$("#"+prefix+"Minute").value||"00",period=$("#"+prefix+"Period").value;if(period==="AM"&&h===12)h=0;if(period==="PM"&&h!==12)h+=12;return String(h).padStart(2,"0")+":"+m}
  function legacyReminderTime(e){if(!e?.time)return"12:00";const[h,m]=e.time.split(":").map(Number),lead=Number(e.notification?.leadMinutes||0),total=((h*60+m-lead)%1440+1440)%1440;return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0")}
  function ws(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x}
  function plusDays(key,n){const d=new Date(key+"T12:00");d.setDate(d.getDate()+n);return dk(d)}
  function dateDiff(a,b){return Math.round((new Date(a+"T12:00")-new Date(b+"T12:00"))/DAY)}
  function recurrenceRule(e){
    const legacy=e.calendarId==="birthdays"?"yearly":e.recurrence;
    if(!legacy&&!e.recurrenceRule?.frequency)return null;
    const saved=e.recurrenceRule||{},frequency=saved.frequency||legacy,interval=Math.max(1,Number(saved.interval)||1),startDay=new Date(e.date+"T12:00").getDay();
    const weekdays=frequency==="weekly"?(Array.isArray(saved.weekdays)&&saved.weekdays.length?[...new Set(saved.weekdays.map(Number).filter(n=>n>=0&&n<=6))]:[startDay]):[];
    const legacyDate=e.recurrenceUntil||null,end=saved.end?.type?{type:saved.end.type,date:saved.end.date||null,count:Math.max(1,Number(saved.end.count)||1)}:legacyDate?{type:"date",date:legacyDate,count:null}:{type:"never",date:null,count:null};
    return{frequency,interval,weekdays,end}
  }
  function monthDiff(a,b){const x=new Date(a+"T12:00"),y=new Date(b+"T12:00");return(x.getFullYear()-y.getFullYear())*12+x.getMonth()-y.getMonth()}
  function validMonthDay(year,month,day){const d=new Date(year,month,day,12);return d.getFullYear()===year&&d.getMonth()===month&&d.getDate()===day}
  function matchesRecurrence(e,key,rule){
    const diff=dateDiff(key,e.date),candidate=new Date(key+"T12:00"),start=new Date(e.date+"T12:00");
    if(rule.frequency==="daily")return diff%rule.interval===0;
    if(rule.frequency==="weekly"){const startWeek=ws(start),candidateWeek=ws(candidate),weeks=Math.round((candidateWeek-startWeek)/(7*DAY));return weeks>=0&&weeks%rule.interval===0&&rule.weekdays.includes(candidate.getDay())}
    if(rule.frequency==="monthly"){const months=monthDiff(key,e.date);return months>=0&&months%rule.interval===0&&candidate.getDate()===start.getDate()}
    if(rule.frequency==="yearly"){const years=candidate.getFullYear()-start.getFullYear();return years>=0&&years%rule.interval===0&&candidate.getMonth()===start.getMonth()&&candidate.getDate()===start.getDate()}
    return false
  }
  function occurrenceOrdinal(e,key,rule){
    if(rule.frequency==="daily")return Math.floor(dateDiff(key,e.date)/rule.interval)+1;
    let count=0,start=new Date(e.date+"T12:00"),candidate=new Date(key+"T12:00");
    if(rule.frequency==="weekly"){const firstWeek=ws(start),lastWeek=ws(candidate),weeks=Math.round((lastWeek-firstWeek)/(7*DAY));for(let w=0;w<=weeks;w+=rule.interval)for(const weekday of rule.weekdays){const day=new Date(firstWeek);day.setDate(day.getDate()+w*7+weekday);const dayKey=dk(day);if(dayKey>=e.date&&dayKey<=key)count++}return count}
    if(rule.frequency==="monthly"){const anchorDay=start.getDate(),months=monthDiff(key,e.date);for(let m=0;m<=months;m+=rule.interval){const year=start.getFullYear()+Math.floor((start.getMonth()+m)/12),month=(start.getMonth()+m)%12;if(validMonthDay(year,month,anchorDay)){const day=dk(new Date(year,month,anchorDay,12));if(day<=key)count++}}return count}
    if(rule.frequency==="yearly"){const years=candidate.getFullYear()-start.getFullYear();for(let y=0;y<=years;y+=rule.interval)if(validMonthDay(start.getFullYear()+y,start.getMonth(),start.getDate())){const day=dk(new Date(start.getFullYear()+y,start.getMonth(),start.getDate(),12));if(day<=key)count++}return count}
    return 1
  }
  function recurrenceStartsOn(e,key){if(!e.date||key<e.date)return false;const rule=recurrenceRule(e);if(!rule)return key===e.date;if(rule.end.type==="date"&&rule.end.date&&key>rule.end.date)return false;if(!matchesRecurrence(e,key,rule))return false;return rule.end.type!=="count"||occurrenceOrdinal(e,key,rule)<=rule.end.count}
  function occurrenceStart(e,key){const span=e.endDate?Math.max(0,dateDiff(e.endDate,e.date)):0;for(let back=0;back<=span;back++){const candidate=plusDays(key,-back);if(recurrenceStartsOn(e,candidate))return candidate}return null}
  function isRepeatingEvent(e){return!!recurrenceRule(e)}
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
    const key=dk(d),dismissed=new Set(state.planner.dismissedAllDayOccurrences||[]);
    const events=state.calOverlays.events?state.planner.events.map(e=>{
      if(c(e.calendarId).visible===false)return null;
      if(!isRepeatingEvent(e))return(e.date===key||!!(e.endDate&&key>=e.date&&key<=e.endDate))?{event:e,start:e.date}:null;
      const start=occurrenceStart(e,key);return start?{event:e,start}:null
    }).filter(Boolean).map(x=>x.start===x.event.date&&key===x.event.date?x.event:{...x.event,_displayDate:key,_occurrenceStart:x.start}).concat(builtin).filter(e=>e.time||!dismissed.has(dismissalKey(e))):[];
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
    const priorDayScroll=$("#dayScrollWindow");if(priorDayScroll)state.dayScrollPositions[priorDayScroll.dataset.date]=priorDayScroll.scrollTop;
    $$("[data-cal-view]").forEach(b=>b.classList.toggle("selected",b.dataset.calView===state.calView));
    $$("[data-overlay]").forEach(b=>b.classList.toggle("selected",!!state.calOverlays[b.dataset.overlay]));
    $("#calRange").textContent=range();
    $("#calendarCanvas").innerHTML=state.calView==="month"?month():state.calView==="week"?week():day();
    $("#calendarList").innerHTML=state.planner.calendars.map(x=>'<article class="calendar-row"><button class="cal-visible '+(x.visible===false?"off":"")+'" data-cal-visible="'+x.id+'" style="--event:'+x.color+'">'+(x.visible===false?"":"✓")+'</button><button class="cal-name" data-cal-edit="'+x.id+'"><i style="--event:'+x.color+'"></i><span><strong>'+escapeHtml(x.name)+'</strong><small>'+calendarSummary(x)+'</small></span></button></article>').join("");
    $("#sportsCalendarList").innerHTML=SPORTS.map(s=>{const setting=state.planner.sports[s.id],calendar=sportCalendar(s.id);return '<button class="sports-toggle '+(setting.enabled?"enabled":"")+'" data-sport="'+s.id+'" style="--event:'+calendar.color+'"><i></i><span><strong>'+escapeHtml(calendar.name)+'</strong><small>'+s.short+(setting.lastRefresh?" · updated "+new Date(setting.lastRefresh).toLocaleDateString([],{month:"short",day:"numeric"}):"")+'</small></span><b>'+(setting.enabled?"On":"Off")+'</b></button>'}).join("");
    $("#icalCalendar").innerHTML=options();$("#eventCalendar").innerHTML=options();
    $$("[data-event]").forEach(b=>b.onclick=()=>openEvent(b.dataset.event));
    $$("[data-system]").forEach(b=>b.onclick=()=>showItem(b.dataset.system));
    $$("[data-cal-day]").forEach(b=>b.onclick=()=>{const key=b.dataset.calDay;state.calCursor=new Date(key+"T12:00");delete state.dayScrollPositions[key];delete state.dayScrollManual[key];state.calView="day";localStorage.setItem("opalday-cal-view","day");render();window.scrollTo({top:0,behavior:"smooth"})});
    $$("[data-cal-visible]").forEach(b=>b.onclick=()=>{const x=c(b.dataset.calVisible);x.visible=x.visible===false;calendarChanged()});
    $$("[data-cal-edit]").forEach(b=>b.onclick=()=>openCalendar(b.dataset.calEdit));
    $$("[data-sport]").forEach(b=>b.onclick=()=>toggleSport(b.dataset.sport));
    requestAnimationFrame(setupDayScroll);
  }
  function updateFloatingEventLabels(scroller){if(!scroller)return;const viewportTop=scroller.scrollTop;scroller.querySelectorAll(".duration-event").forEach(card=>{const content=card.querySelector(".duration-event-content");if(!content)return;const cardTop=Number.parseFloat(card.style.top)||0,max=Math.max(0,card.offsetHeight-content.offsetHeight-12),shift=Math.max(0,Math.min(max,viewportTop-cardTop+8));content.style.transform="translateY("+shift+"px)"})}
  function setupDayScroll(){const scroller=$("#dayScrollWindow");if(!scroller)return;const key=scroller.dataset.date,today=dk(new Date()),saved=state.dayScrollPositions[key],now=new Date(),automatic=key===today&&!state.dayScrollManual[key];let settling=true;scroller.scrollTop=automatic?Math.floor((now.getHours()*60+now.getMinutes())/60)*76:saved!==undefined?saved:0;updateFloatingEventLabels(scroller);setTimeout(()=>settling=false,120);scroller.addEventListener("scroll",()=>{state.dayScrollPositions[key]=scroller.scrollTop;updateFloatingEventLabels(scroller);if(!settling&&scroller.dataset.autoScrolling!=="true")state.dayScrollManual[key]=true},{passive:true});updateCurrentTimeLine()}
  function updateCurrentTimeLine(){const line=$("#currentTimeLine"),scroller=$("#dayScrollWindow");if(!line)return;const now=new Date(),key=dk(now);line.style.top=((now.getHours()*60+now.getMinutes())/60*76)+"px";if(scroller&&scroller.dataset.date===key&&!state.dayScrollManual[key]){const target=now.getHours()*76;if(Math.abs(scroller.scrollTop-target)>4){scroller.dataset.autoScrolling="true";scroller.scrollTo({top:target,behavior:"smooth"});setTimeout(()=>delete scroller.dataset.autoScrolling,700)}}}
  function range(){if(state.calView==="month")return state.calCursor.toLocaleDateString([],{month:"long",year:"numeric"});if(state.calView==="week"){const s=ws(state.calCursor),e=new Date(s.getTime()+6*DAY);return s.toLocaleDateString([],{month:"short",day:"numeric"})+"–"+e.toLocaleDateString([],{month:"short",day:"numeric"})}return state.calCursor.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})}
  function eventDayLabel(e,d=state.calCursor){if(!e.endDate||e.endDate===e.date)return"";const key=dk(d),startKey=e._occurrenceStart||e.date,endKey=plusDays(startKey,dateDiff(e.endDate,e.date)),start=new Date(startKey+"T12:00"),current=new Date(key+"T12:00"),n=Math.round((current-start)/DAY)+1;if(key===startKey)return"Begins today";if(key===endKey)return"Ends today";return"Day "+n}
  function chip(e){const color=entryColor(e),attr=e.source==="builtin"?"":e._system?' data-system="'+e.id+'"':' data-event="'+e.id+'"',onDate=e._system?new Date((e._date||dk(state.calCursor))+"T12:00"):state.calCursor,done=e._system&&itemComplete(e,onDate),continuation=e._system?"":eventDayLabel(e,onDate),label=e._system?(e.kind==="medication"?(done?"Taken":medState(e,onDate)==="overdue"?"OVERDUE · Hard deadline":"Hard medication deadline"):cadenceLabel(e)):escapeHtml(c(e.calendarId).name),timeLabel=e.end&&e.time?fmt(e.time)+"–"+fmt(e.end):fmt(e.time);return '<button class="event-chip kind-'+(e.kind||"event")+(done?" is-complete":"")+(continuation?' multi-day':'')+'"'+attr+' style="--event:'+color+'"><strong>'+escapeHtml(e.title)+'</strong><small>'+timeLabel+' · '+(continuation?continuation+' · ':"")+label+'</small></button>'}
  function clockMinutes(value,fallback=0){if(!value)return fallback;const[h,m]=value.split(":").map(Number);return h*60+(m||0)}
  function minutesLabel(value){if(value>=1440)return"midnight";const h=Math.floor(value/60),m=value%60;return fmt(String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"))}
  function dayInterval(e,key){const occurrence=e._occurrenceStart||e.date,occurrenceEnd=e.endDate?plusDays(occurrence,dateDiff(e.endDate,e.date)):occurrence,first=occurrence===key,last=occurrenceEnd===key;let start=first?clockMinutes(e.time):0,end;if(!last)end=1440;else if(e.end)end=clockMinutes(e.end);else end=start+60;if(first&&last&&end<=start)end+=1440;return{start:Math.max(0,Math.min(1440,start)),end:Math.max(0,Math.min(1440,Math.max(start+5,end)))}}
  function layOutDayEvents(events,key){const placed=events.map(event=>({event,...dayInterval(event,key)})).sort((a,b)=>a.start-b.start||a.end-b.end),groups=[];let group=[],groupEnd=-1;for(const item of placed){if(group.length&&item.start>=groupEnd){groups.push(group);group=[];groupEnd=-1}group.push(item);groupEnd=Math.max(groupEnd,item.end)}if(group.length)groups.push(group);for(const cluster of groups){const columnEnds=[];for(const item of cluster){let column=columnEnds.findIndex(end=>end<=item.start);if(column<0)column=columnEnds.length;columnEnds[column]=item.end;item.column=column}for(const item of cluster)item.columns=columnEnds.length}return placed}
  function durationBlock(layout,startHour,hourHeight){const e=layout.event,color=entryColor(e),label=escapeHtml(c(e.calendarId).name),left=layout.column/layout.columns*100,width=100/layout.columns,top=(layout.start-startHour*60)/60*hourHeight,height=Math.max(38,(layout.end-layout.start)/60*hourHeight),attr=e.source==="builtin"?"":' data-event="'+e.id+'"',startLabel=layout.start===0&&(e._occurrenceStart||e.date)!==dk(state.calCursor)?"Continues":minutesLabel(layout.start),endLabel=minutesLabel(layout.end);return'<button class="duration-event"'+attr+' style="--event:'+color+';top:'+top+'px;height:'+height+'px;left:calc('+left+'% + 3px);width:calc('+width+'% - 6px)"><span class="duration-event-content"><strong>'+escapeHtml(e.title)+'</strong><small>'+startLabel+'–'+endLabel+' · '+label+'</small></span></button>'}
  function day(){
    const ev=eventsOn(state.calCursor),systems=ev.filter(e=>e._system),scheduled=ev.filter(e=>!e._system),allDay=scheduled.filter(e=>!e.time),timed=scheduled.filter(e=>e.time);
    const systemTop=systems.length?'<div class="day-system-band"><small>HABITS & REMINDERS</small>'+systems.map(chip).join("")+'</div>':"";
    const allDayTop=allDay.length?'<div class="day-all-day-band"><small>ALL DAY</small>'+allDay.map(chip).join("")+'</div>':"";
    const top=systemTop+allDayTop;
    if(state.calView==="timeline")return top+(timed.length?'<div class="calendar-timeline">'+timed.map(e=>'<div><time>'+fmt(e.time)+'</time><span style="--event:'+entryColor(e)+'"></span>'+chip(e)+'</div>').join("")+'</div>':top?"":'<div class="small-empty">No items on this date.</div>');
    const key=dk(state.calCursor),layouts=layOutDayEvents(timed,key),startHour=0,endHour=24,hourHeight=76,hours=Array.from({length:25},(_,n)=>n),nowLine=key===dk(new Date())?'<div class="current-time-line" id="currentTimeLine"><i></i></div>':"";return top+'<div class="day-scroll-window" id="dayScrollWindow" data-date="'+key+'"><div class="duration-day" style="height:'+((endHour-startHour)*hourHeight)+'px;--hour-height:'+hourHeight+'px"><div class="duration-hours">'+hours.map((h,n)=>'<div style="top:'+(n*hourHeight)+'px"><time>'+new Date(2000,0,1,h%24).toLocaleTimeString([],{hour:"numeric"})+'</time></div>').join("")+'</div>'+nowLine+'<div class="duration-event-layer">'+layouts.map(x=>durationBlock(x,startHour,hourHeight)).join("")+'</div></div></div>'
  }
  function week(){const s=ws(state.calCursor);return flexibleBand()+'<div class="week-grid">'+Array.from({length:7},(_,n)=>{const d=new Date(s.getTime()+n*DAY),ev=eventsOn(d);return '<div class="week-day '+(dk(d)===dk(new Date())?"today-col":"")+'"><button data-cal-day="'+dk(d)+'"><small>'+d.toLocaleDateString([],{weekday:"short"})+'</small><strong>'+d.getDate()+'</strong></button><div>'+ev.slice(0,5).map(chip).join("")+(ev.length>5?'<small>+'+(ev.length-5)+' more</small>':'')+'</div></div>'}).join("")+'</div>'}
  function month(){const y=state.calCursor.getFullYear(),m=state.calCursor.getMonth(),f=new Date(y,m,1),s=new Date(f);s.setDate(1-f.getDay());return monthlyBand()+'<div class="month-weekdays">'+["S","M","T","W","T","F","S"].map(x=>'<span>'+x+'</span>').join("")+'</div><div class="month-grid">'+Array.from({length:42},(_,n)=>{const d=new Date(s.getTime()+n*DAY),ev=eventsOn(d);return '<button class="'+(d.getMonth()!==m?"outside ":"")+(dk(d)===dk(new Date())?"today-cell":"")+'" data-cal-day="'+dk(d)+'"><strong>'+d.getDate()+'</strong><span>'+ev.slice(0,4).map(e=>'<i style="--event:'+entryColor(e)+';opacity:'+(e._system&&itemComplete(e,d)?".35":"1")+'"></i>').join("")+'</span></button>'}).join("")+'</div>'}
  function openEvent(id){
    const e=id?state.planner.events.find(x=>x.id===id):null;state.editEvent=id||null;
    const rule=e?recurrenceRule(e):null,mode=rule?(rule.interval===1&&["daily","weekly","monthly","yearly"].includes(rule.frequency)?rule.frequency:"custom"):"";
    $("#eventModalTitle").textContent=e?"Edit event":"Add event";$("#eventTitle").value=e?.title||"";$("#eventDate").value=e?.date||dk(state.calCursor);$("#eventEndDate").value=e?.endDate||e?.date||dk(state.calCursor);$("#eventAllDay").checked=e?.allDay??!e?.time;setTimeWheel("eventStart",e?.time||"09:00");setTimeWheel("eventEndTime",e?.end||"10:00");$("#eventRecurrence").value=mode;$("#eventRepeatInterval").value=rule?.interval||2;$("#eventRepeatUnit").value=rule?.frequency||"weekly";$$('[name="eventWeekday"]').forEach(box=>box.checked=(rule?.weekdays||[new Date((e?.date||dk(state.calCursor))+"T12:00").getDay()]).includes(Number(box.value)));$("#eventRecurrenceEnd").value=rule?.end?.type||"never";$("#eventRecurrenceUntil").value=rule?.end?.date||e?.recurrenceUntil||"";$("#eventRecurrenceCount").value=rule?.end?.count||10;$("#eventNotify").checked=!!e?.notification?.enabled;setTimeWheel("eventNotify",e?.notification?.time||legacyReminderTime(e));$("#eventNotifyScope").value=e?.notification?.scope||"every";$("#eventNotifyDays").value=e?.notification?.days||"start";$("#eventCalendar").innerHTML=options();$("#eventCalendar").value=e?.calendarId||"mine";$("#deleteEvent").classList.toggle("hidden",!e);$("#deleteEvent").textContent=rule?"Delete series":"Delete";$("#eventSeriesNotice").classList.toggle("hidden",!e||!rule);toggleEventTimes();toggleRecurrenceFields();openModal("#eventModal");
  }
  function openCalendar(id){const x=id?c(id):null;state.editCalendar=id||null;$("#calendarEditTitle").textContent=x?"Edit calendar":"New calendar";$("#calendarName").value=x?.name||"";$("#calendarColor").value=x?.color||COLORS[state.planner.calendars.length%COLORS.length];openModal("#calendarEditModal")}
  function openCalendarJump(){const month=$("#jumpMonth"),year=$("#jumpYear");month.innerHTML=Array.from({length:12},(_,n)=>'<option value="'+n+'">'+new Date(2000,n,1).toLocaleDateString([],{month:"long"})+'</option>').join("");year.innerHTML=Array.from({length:201},(_,n)=>{const value=1900+n;return'<option value="'+value+'">'+value+'</option>'}).join("");month.value=String(state.calCursor.getMonth());year.value=String(state.calCursor.getFullYear());openModal("#calendarJumpModal")}
  function jumpToMonth(){const month=Number($("#jumpMonth").value),year=Number($("#jumpYear").value),day=Math.min(state.calCursor.getDate(),new Date(year,month+1,0).getDate());state.calCursor=new Date(year,month,day,12);delete state.dayScrollPositions[dk(state.calCursor)];delete state.dayScrollManual[dk(state.calCursor)];closeModals();render()}
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
      return addSportsEnd({id:old?.id||uid(),title:raw.title||"Game",date:dk(start),time:String(start.getHours()).padStart(2,"0")+":"+String(start.getMinutes()).padStart(2,"0"),end:null,calendarId:calendar.id,source:"sports",sportId:id,sportUid:String(raw.uid),url:raw.url||null,status:raw.status||null,createdAt:old?.createdAt||new Date().toISOString()})
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
  $$("[data-cal-view]").forEach(b=>b.onclick=()=>{state.calView=b.dataset.calView;if(state.calView==="day"){delete state.dayScrollPositions[dk(state.calCursor)];delete state.dayScrollManual[dk(state.calCursor)]}localStorage.setItem("opalday-cal-view",state.calView);render()});
  $$("[data-overlay]").forEach(b=>b.onclick=()=>{state.calOverlays[b.dataset.overlay]=!state.calOverlays[b.dataset.overlay];localStorage.setItem("opalday-cal-overlays",JSON.stringify(state.calOverlays));render()});
  $("#calPrev").onclick=()=>move(-1);$("#calNext").onclick=()=>move(1);$("#calToday").onclick=()=>{state.calCursor=new Date();delete state.dayScrollPositions[dk(state.calCursor)];delete state.dayScrollManual[dk(state.calCursor)];render()};$("#calRange").onclick=openCalendarJump;$("#jumpToMonth").onclick=jumpToMonth;
  function move(n){const d=new Date(state.calCursor);if(state.calView==="month")d.setMonth(d.getMonth()+n);else d.setDate(d.getDate()+n*(state.calView==="week"?7:1));state.calCursor=d;render()}
  $("#addEventButton").onclick=()=>openEvent();$("#newCalendarButton").onclick=()=>openCalendar();
  function toggleEventTimes(){$$(".event-time-field").forEach(x=>x.classList.toggle("hidden",$("#eventAllDay").checked))}
  function toggleRecurrenceFields(){const mode=$("#eventRecurrence").value,repeating=!!mode,frequency=mode==="custom"?$("#eventRepeatUnit").value:mode,end=$("#eventRecurrenceEnd").value;$("#eventCustomRepeatFields").classList.toggle("hidden",mode!=="custom");$("#eventWeeklyDaysField").classList.toggle("hidden",frequency!=="weekly");$("#eventRecurrenceEndField").classList.toggle("hidden",!repeating);$("#eventRecurrenceUntilField").classList.toggle("hidden",!repeating||end!=="date");$("#eventRecurrenceCountField").classList.toggle("hidden",!repeating||end!=="count")}
  function recurrenceFromForm(start,calendarId){const mode=$("#eventRecurrence").value;if(!mode&&calendarId!=="birthdays")return null;const frequency=calendarId==="birthdays"?"yearly":mode==="custom"?$("#eventRepeatUnit").value:mode,interval=calendarId==="birthdays"?1:mode==="custom"?Math.max(1,Number($("#eventRepeatInterval").value)||1):1,weekdays=frequency==="weekly"?$$('[name="eventWeekday"]:checked').map(x=>Number(x.value)):[],endType=$("#eventRecurrenceEnd").value||"never";return{frequency,interval,weekdays:weekdays.length?weekdays:[new Date(start+"T12:00").getDay()],end:{type:endType,date:endType==="date"?$("#eventRecurrenceUntil").value||null:null,count:endType==="count"?Math.max(1,Number($("#eventRecurrenceCount").value)||1):null}}}
  $("#eventAllDay").onchange=toggleEventTimes;
  $("#eventRecurrence").onchange=toggleRecurrenceFields;$("#eventRepeatUnit").onchange=toggleRecurrenceFields;$("#eventRecurrenceEnd").onchange=toggleRecurrenceFields;
  $("#saveEvent").onclick=()=>{const title=$("#eventTitle").value.trim(),start=$("#eventDate").value,end=$("#eventEndDate").value||start,calendarId=$("#eventCalendar").value,rule=recurrenceFromForm(start,calendarId);if(!title)return toast("Name the event");if(end<start)return toast("End date must follow start date");if(rule?.end.type==="date"&&!rule.end.date)return toast("Choose when the repeat should end");if(rule?.end.date&&rule.end.date<start)return toast("Repeat-until date must follow the start");let e=state.editEvent?state.planner.events.find(x=>x.id===state.editEvent):null;if(!e){e={id:uid(),createdAt:new Date().toISOString(),source:"manual"};state.planner.events.push(e)}e.title=title;e.date=start;e.endDate=end;e.allDay=$("#eventAllDay").checked;e.time=e.allDay?null:readTimeWheel("eventStart");e.end=e.allDay?null:readTimeWheel("eventEndTime");e.calendarId=calendarId;e.recurrence=rule?.frequency||null;e.recurrenceRule=rule;e.recurrenceUntil=rule?.end.type==="date"?rule.end.date:null;const scope=$("#eventNotifyScope").value;e.notification={enabled:$("#eventNotify").checked,time:readTimeWheel("eventNotify"),leadMinutes:null,days:$("#eventNotifyDays").value,scope,occurrenceDate:scope==="once"?(state.view==="today"?dk(new Date()):dk(state.calCursor)):null};if(state.editEvent)e.userEdited=true;state.editEvent=null;closeModals();calendarChanged();toast(rule?"Repeating event saved":end>start?"Multi-day event saved":"Event saved")};
  $("#deleteEvent").onclick=()=>{const e=state.planner.events.find(x=>x.id===state.editEvent);if(!e)return;if(e.feedUid)state.planner.deletedFeedUids.push(e.feedUid);state.planner.deletedEventIds=[...new Set([...(state.planner.deletedEventIds||[]),e.id])];state.planner.events=state.planner.events.filter(x=>x.id!==e.id);state.editEvent=null;closeModals();calendarChanged();toast("Event deleted")};
  $("#saveCalendar").onclick=()=>{const name=$("#calendarName").value.trim();if(!name)return toast("Name the calendar");if(state.editCalendar){const x=c(state.editCalendar);x.name=name;x.color=$("#calendarColor").value}else state.planner.calendars.push({id:uid(),name,color:$("#calendarColor").value,visible:true});state.editCalendar=null;closeModals();calendarChanged()};
  $("#icalFile").onchange=async e=>{const file=e.target.files[0];if(!file)return;const cid=$("#icalCalendar").value;merge(parseICS(await file.text(),cid,null),cid,null);toast("iCal imported")};
  $("#refreshSports").onclick=()=>refreshSports();
  function dismissalKey(e){return String(e.id||"")+"@"+(e._occurrenceStart||e.date||dk(new Date()))}
  window.OpalDayCalendar={todayEvents:()=>eventsOn(new Date()).filter(e=>!e._system),eventsForDate:d=>eventsOn(d).filter(e=>!e._system),color:entryColor,calendarName:id=>c(id).name,eventDayLabel,dismissalKey,openEvent};
  setTimeout(()=>{if(SPORTS.some(s=>{const x=state.planner.sports[s.id];return x.enabled&&(!x.lastRefresh||Date.now()-new Date(x.lastRefresh)>DAY)})&&workerUrl())refreshSports()},2200);
  setInterval(updateCurrentTimeLine,60000);
  render();
})();
