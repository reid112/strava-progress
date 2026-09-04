// @ts-nocheck
// Verbatim port of reference/template.html script for the Phase 1 fixture check.
// Replaced module-by-module during the generalisation step.
import Chart from 'chart.js/auto';
if (import.meta.env.DEV) (window as any).Chart = Chart; // fixture comparison only

export function renderReport(D: any) {
// ---------- helpers
const $=s=>document.querySelector(s);
const fmt=s=>{s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`};
const pace=p=>{const m=Math.floor(p),s=Math.round((p-m)*60);return s===60?`${m+1}:00`:`${m}:${String(s).padStart(2,'0')}`};
const paceS=s=>pace(s/60);
const TARG={'1k':1000,'1mi':1609.34,'5k':5000,'10k':10000,'15k':15000,'half':21097.5,'30k':30000,'marathon':42195};
const LBL={'1k':'1 km','1mi':'1 mile','5k':'5K','10k':'10K','15k':'15K','half':'Half','30k':'30K','marathon':'Marathon'};
function vdot(dm,ts){const v=dm/(ts/60),t=ts/60;const vo2=-4.60+0.182258*v+0.000104*v*v;const pct=0.8+0.1894393*Math.exp(-0.012778*t)+0.2989558*Math.exp(-0.193261*t);return vo2/pct}
function timeFor(dm,vd){let lo=200,hi=40000;for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(vdot(dm,mid)>vd)lo=mid;else hi=mid}return (lo+hi)/2}
const C={canola:'#E4B31F',canolaDeep:'#B98A0C',sky:'#2C6E9E',skySoft:'#CFE0EC',slate:'#7A8894',ink:'#14213D',swim:'#3AA6A0',strength:'#8E7CC3',other:'#C5CCD3',wheat:'#C9A96E',line:'#D9DEE4'};
const dy=d=>{const t=new Date(d+'T12:00:00');return t.getFullYear()+(t-new Date(t.getFullYear(),0,1))/31557600000};
const yearColor=y=>{const t=(y-2017)/9;const a=[201,169,110],b=[44,110,158];const c=a.map((v,i)=>Math.round(v+(b[i]-v)*t));return '#'+c.map(x=>x.toString(16).padStart(2,'0')).join('')};
Chart.defaults.font.family='Barlow, Helvetica Neue, Arial, sans-serif';Chart.defaults.font.size=13;Chart.defaults.color='#4A5568';
Chart.defaults.plugins.legend.labels.boxWidth=12;Chart.defaults.plugins.legend.labels.boxHeight=12;
const gridOpt={color:'#E6EAEE'};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduced)Chart.defaults.animation=false;
const charts={};
function mk(id,cfg){if(charts[id])charts[id].destroy();charts[id]=new Chart($('#'+id),cfg);return charts[id]}

// ---------- tabs
document.querySelectorAll('nav [role=tab]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('nav [role=tab]').forEach(x=>x.setAttribute('aria-selected',x===b));
  document.querySelectorAll('section.tab').forEach(s=>s.classList.toggle('active',s.id==='tab-'+b.dataset.tab));
  built[b.dataset.tab]||build[b.dataset.tab]();built[b.dataset.tab]=true;
  window.scrollTo({top:$('nav').offsetTop,behavior:reduced?'auto':'smooth'});
}));
const built={},build={};

// ---------- header
$('#h-km').textContent=Math.round(D.totals.run_km).toLocaleString();
$('#h-lede').textContent=`From a 24-minute 5K in the summer of 2017 to 18:39 this August. ${D.totals.runs.toLocaleString()} runs, ${D.totals.marathons} marathons, one 70.3, and a lot of Wascana laps in between.`;

// hero race
(function(){
  const T_NOW=1124.7,T_THEN=1447.8,DUR=reduced?0:11000;let raf=null;
  const lane=$('#lane');for(let k=0;k<=5;k++){const t=document.createElement('div');t.className='tick';t.style.left=(k*20)+'%';t.innerHTML=`<span>${k} km</span>`;lane.appendChild(t)}
  function setState(t){const dn=Math.min(5,5*t/T_NOW),dt=Math.min(5,5*t/T_THEN);
    $('#r-now').style.left=(dn/5*100)+'%';$('#r-then').style.left=(dt/5*100)+'%';
    $('#clk').textContent=fmt(Math.min(t,T_THEN));$('#d-now').textContent=dn.toFixed(2)+' km';$('#d-then').textContent=dt.toFixed(2)+' km';
    if(t>=T_NOW){const gap=5-5*T_NOW/T_THEN;$('#res').textContent=`2026 finishes in ${fmt(T_NOW)}. 2017 is ${gap.toFixed(2)} km back and will need another ${fmt(T_THEN-T_NOW)}.`}
    else $('#res').textContent='';}
  function run(){if(raf)cancelAnimationFrame(raf);$('#go').textContent='Run it again';
    if(!DUR){setState(T_NOW);return}
    const t0=performance.now();const step=now=>{const t=Math.min(T_NOW,(now-t0)/DUR*T_NOW);setState(t);if(t<T_NOW)raf=requestAnimationFrame(step)};raf=requestAnimationFrame(step)}
  $('#go').addEventListener('click',run);setState(0);
})();

// ---------- OVERVIEW
build.overview=function(){
  const yrs=D.yearly,maxkm=Math.max(...yrs.map(y=>y.run_km));
  $('#timeline').innerHTML=yrs.map(y=>{const b=D.best_by_year['5k'][y.year];return `<div class="yr"><div class="y">${y.year}</div><div class="bar" style="width:${Math.max(3,y.run_km/maxkm*100)}%"></div><div class="km">${Math.round(y.run_km).toLocaleString()} km</div><div class="s">${y.runs} runs<br>${b?'5K '+fmt(b.t):'—'}</div></div>`}).join('');
  $('#s-runs').textContent=D.totals.runs.toLocaleString();$('#s-hours').textContent=Math.round(D.totals.run_hours).toLocaleString();
  $('#s-days').textContent=D.totals.active_days.toLocaleString();$('#s-mar').textContent=D.totals.marathons;$('#s-long').textContent=D.totals.halfs_plus;$('#s-elev').textContent=D.totals.run_elev.toLocaleString();
  $('#f-n').textContent=D.totals.activities.toLocaleString();$('#f-runs').textContent=D.totals.runs.toLocaleString();
  const mo=D.monthly;
  mk('c-monthly',{type:'bar',data:{labels:mo.map(m=>m.m),datasets:[{label:'km',data:mo.map(m=>m.run_km),backgroundColor:mo.map(m=>yearColor(+m.m.slice(0,4))),borderWidth:0,barPercentage:1,categoryPercentage:.9}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw} km · ${mo[c.dataIndex].runs} runs · longest ${mo[c.dataIndex].long} km`}}},scales:{x:{grid:{display:false},ticks:{autoSkip:false,maxRotation:0,callback:(v,i)=>mo[i].m.endsWith('-01')?mo[i].m.slice(0,4):null}},y:{grid:gridOpt,title:{display:true,text:'km'}}}}});
  mk('c-yr-pace-hr',{data:{labels:yrs.map(y=>y.year),datasets:[
    {type:'line',label:'median pace',data:yrs.map(y=>y.med_pace),borderColor:C.canolaDeep,backgroundColor:C.canola,yAxisID:'y',tension:.3,pointRadius:5,order:2},
    {type:'line',label:'avg HR',data:yrs.map(y=>y.avg_hr),borderColor:C.sky,backgroundColor:C.sky,yAxisID:'y2',spanGaps:true,tension:.3,order:1,pointRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>c.dataset.label==='median pace'?`pace ${pace(c.raw)} /km`:`HR ${c.raw} bpm`}}},scales:{x:{grid:{display:false}},y:{reverse:true,min:5,max:6.5,ticks:{callback:v=>pace(v)},grid:gridOpt,title:{display:true,text:'min/km (faster ↑)'}},y2:{position:'right',min:140,max:180,grid:{display:false},title:{display:true,text:'bpm'}}}}});
  const q=D.vdot_quarterly;
  mk('c-vdot-mini',{type:'line',data:{labels:q.map(x=>x.q),datasets:[{label:'VDOT',data:q.map(x=>x.vdot),borderColor:C.ink,backgroundColor:q.map(x=>x.vdot>=45?C.canola:C.wheat),pointRadius:4,tension:.25,borderWidth:1.5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const x=q[c.dataIndex];return `VDOT ${x.vdot} · ${LBL[x.dist]} in ${fmt(x.t)} (${x.d})`}}}},scales:{x:{grid:{display:false},ticks:{autoSkip:false,maxRotation:0,callback:(v,i)=>q[i].q.endsWith('Q1')?q[i].q.slice(0,4):null}},y:{grid:gridOpt,min:25}}}});
};

// ---------- PROGRESS
let curDist='5k';
build.progress=function(){
  const seg=$('#seg-dist');seg.innerHTML=['1k','1mi','5k','10k','15k','half','30k','marathon'].map(k=>`<button data-k="${k}" aria-pressed="${k===curDist}">${LBL[k]}</button>`).join('');
  seg.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{curDist=b.dataset.k;seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));drawEffort()}));
  drawEffort();
  // year best table
  const ks=['1k','1mi','5k','10k','half','marathon'];const yrs=D.yearly.map(y=>y.year);
  $('#t-yearbest').innerHTML=`<tr><th>Year</th>${ks.map(k=>`<th class="num">${LBL[k]}</th>`).join('')}</tr>`+yrs.map(y=>`<tr><td>${y}</td>${ks.map(k=>{const b=D.best_by_year[k][y];if(!b)return'<td class="num">—</td>';const rec=Math.min(...Object.entries(D.best_by_year[k]).filter(([yy])=>+yy<=y).map(([,v])=>v.t));const isPR=b.t<=rec+0.01;return `<td class="num" title="${b.name} (${b.d})" style="${isPR?'color:var(--canola-deep);font-weight:600':''}">${fmt(b.t)}</td>`}).join('')}</tr>`).join('')+`<tr><td colspan="7" class="note small">Yellow = the record stood at the end of that year. Hover a time for the run. Treadmill runs are scaled to the distance you corrected them to; 1 km and mile efforts from those runs are excluded.</td></tr>`;
  // aerobic
  const a=D.aerobic;
  mk('c-aero',{data:{labels:a.map(x=>x.q),datasets:[{type:'line',label:'easy pace',data:a.map(x=>x.pace),borderColor:C.sky,backgroundColor:C.sky,yAxisID:'y',tension:.3,pointRadius:4,order:2},{type:'line',label:'m/min per bpm',data:a.map(x=>x.ef*60/1000),borderColor:C.canolaDeep,backgroundColor:C.canola,yAxisID:'y2',tension:.3,pointRadius:4,order:1}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>{const x=a[c.dataIndex];return c.dataset.label==='easy pace'?`pace ${pace(x.pace)} at ${x.hr} bpm (${x.n} runs)`:`${(x.ef*60/1000).toFixed(2)} m/min/bpm`}}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{reverse:true,ticks:{callback:v=>pace(v)},grid:gridOpt,title:{display:true,text:'min/km (faster ↑)'}},y2:{position:'right',grid:{display:false},title:{display:true,text:'m/min/bpm'}}}}});
  // cloud
  const ph=D.pace_hr;
  mk('c-cloud',{type:'scatter',data:{datasets:[{label:'runs',data:ph.map(p=>({x:p[2],y:p[1],d:p[0],km:p[3]})),backgroundColor:ph.map(p=>yearColor(+p[0].slice(0,4))+'B3'),pointRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw.d} · ${pace(c.raw.y)} /km at ${c.raw.x} bpm · ${c.raw.km} km`}}},scales:{x:{title:{display:true,text:'average HR (bpm)'},grid:gridOpt},y:{reverse:true,ticks:{callback:v=>pace(v)},grid:gridOpt,title:{display:true,text:'min/km (faster ↑)'}}}}});
  // zones
  const zy=D.zones_by_year,zyears=Object.keys(zy).sort();const zc=['#CFE0EC','#8FB7D6','#E4B31F','#D67C2B','#B23A3A'];const zl=['Z1 <60%','Z2 60–70%','Z3 70–80%','Z4 80–90%','Z5 90%+'];
  mk('c-zones',{type:'bar',data:{labels:zyears,datasets:[0,1,2,3,4].map(i=>({label:zl[i],data:zyears.map(y=>zy[y][i]),backgroundColor:zc[i],borderWidth:0}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw} h`}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:gridOpt,title:{display:true,text:'hours'}}}}});
  // cadence
  const cy=D.yearly.filter(y=>y.cad);
  mk('c-cad',{type:'line',data:{labels:cy.map(y=>y.year),datasets:[{label:'spm',data:cy.map(y=>y.cad),borderColor:C.canolaDeep,backgroundColor:C.canola,tension:.3,pointRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{min:165,max:185,grid:gridOpt,title:{display:true,text:'steps / min'}}}}});
};
function drawEffort(){
  const k=curDist,sc=D.effort_scatter[k],pr=D.pr_progression[k];
  const pts=sc.map(x=>({x:dy(x[0]),y:x[1],d:x[0]}));
  const step=[];pr.forEach((p,i)=>{step.push({x:dy(p.d),y:p.t});if(pr[i+1])step.push({x:dy(pr[i+1].d),y:p.t})});step.push({x:dy(D.last),y:pr[pr.length-1].t});
  const ys=sc.map(x=>x[1]);const lo=Math.min(...ys),hi=Math.max(...ys);
  const capHi=Math.min(hi,lo*1.8);
  mk('c-effort',{type:'scatter',data:{datasets:[
    {type:'scatter',label:'best segment in a run',data:pts,backgroundColor:sc.map(x=>yearColor(+x[0].slice(0,4))+'99'),pointRadius:3.5,order:2},
    {type:'line',label:'record at the time',data:step,borderColor:C.ink,borderWidth:2,pointRadius:0,showLine:true,tension:0,order:1}]},
    options:{responsive:true,maintainAspectRatio:false,parsing:true,plugins:{tooltip:{callbacks:{label:c=>{if(c.dataset.type==='line')return `record ${fmt(c.raw.y)}`;return `${c.raw.d} · ${fmt(c.raw.y)} (${paceS(c.raw.y/TARG[k]*1000)}/km)`}}}},
      scales:{x:{type:'linear',min:2017,max:2027,ticks:{stepSize:1,callback:v=>String(v)},grid:{display:false}},y:{reverse:true,min:Math.floor(lo*0.97),max:Math.ceil(capHi),ticks:{callback:v=>fmt(v)},grid:gridOpt,title:{display:true,text:'time (faster ↑)'}}}}});
  $('#pr-chain').innerHTML=`<h3 style="margin-top:14px">${LBL[k]} record, every time it fell</h3><div style="overflow-x:auto"><table><tr><th>Date</th><th>Run</th><th class="num">Time</th><th class="num">Pace</th><th class="num">Improvement</th><th class="num">VDOT</th></tr>`+pr.map((p,i)=>`<tr><td>${p.d}</td><td>${p.name}</td><td class="num">${fmt(p.t)}</td><td class="num">${paceS(p.t/TARG[k]*1000)}</td><td class="num">${i?'−'+fmt(pr[i-1].t-p.t):'first'}</td><td class="num">${p.vdot}</td></tr>`).join('')+'</table></div>';
}

// ---------- RECORDS
const OFFICIAL={'2025-10-04':'1:30:02','2025-09-07':'3:10:21','2026-08-15':'18:39','2025-08-23':'40:57','2025-04-27':'3:20:11'};
const SKIP=['Warming up','Last run before','1 mile warm up','Park Run plus','Bring on QCM','Long run #1','recovery run','is coming','Parkrun'];
const RACENAME={'Qcm!':'Queen City Marathon — half','QCM #2. Killed my goal of 1:45!':'Queen City Marathon — half','QCM':'Queen City Marathon','QCM 2024':'Queen City Marathon','QCM 2025':'Queen City Marathon','Gopher Attack':'Gopher Attack marathon','Gopher Attack 2026':'Gopher Attack half','Flatlanders Road Race 1/2 Marathon':'Flatlanders half','Flatlanders Half':'Flatlanders half','I Love Regina Run':'I Love Regina 10K','Cure For The Brrr 2026':'Cure for the Brrr 50K','Ironman Calgary 70.3 Run':'Ironman 70.3 Calgary — run leg','PR Baby!':'5K race (“PR Baby!”)','Dog river dash 5km':'Dog River Dash 5K','Park run was awesome. Finished Strava a little late but oh well 5km pr':'Parkrun 5K','Park Run':'Parkrun 5K','Time trial. Slower than I was hoping for':'5K time trial','HM time trial with Britt on the bike':'Half time trial','Half Marathon Time Trial':'Half time trial','10k time trial':'10K time trial','5k Time Trial':'5K time trial','1 mile time trial':'Mile time trial'};
build.records=function(){
  const rc=D.races.filter(r=>!SKIP.some(s=>r.name.includes(s)));
  $('#t-races').innerHTML=`<tr><th>Date</th><th>Event</th><th class="num">Distance</th><th class="num">Time</th><th class="num">Pace</th><th class="num">Avg HR</th><th class="num">VDOT</th><th>Your note</th></tr>`+rc.map(r=>{const off=OFFICIAL[r.d];const t=off||fmt(r.elapsed);const dist=Object.keys(TARG).reduce((b,k)=>Math.abs(r.km*1000-TARG[k])/TARG[k]<0.03?k:b,null);const vd=dist?vdot(TARG[dist],off?toSec(off):r.elapsed).toFixed(1):'';return `<tr><td>${r.d}</td><td>${RACENAME[r.name]||r.name}</td><td class="num">${r.km} km</td><td class="num"><strong>${t}</strong>${off?'<div class="note small" style="margin:0">official · watch '+fmt(r.elapsed)+'</div>':''}</td><td class="num">${paceS(r.elapsed/r.km)}</td><td class="num">${r.hr||'—'}</td><td class="num">${vd}</td><td class="note small" style="margin:0">${r.desc.replace(/\[strava:\/\/[^\]]+\]/g,'')}</td></tr>`}).join('');
  $('#t-records').innerHTML=`<tr><th>Distance</th><th class="num">Record</th><th class="num">Pace</th><th>Where</th><th>Date</th><th class="num">VDOT</th><th class="num">First recorded</th><th class="num">Gained</th></tr>`+Object.keys(TARG).map(k=>{const pr=D.pr_progression[k];if(!pr||!pr.length)return'';const p=pr[pr.length-1],f=pr[0];return `<tr><td>${LBL[k]}</td><td class="num"><strong>${fmt(p.t)}</strong></td><td class="num">${paceS(p.t/TARG[k]*1000)}</td><td>${p.name}</td><td>${p.d}</td><td class="num">${p.vdot}</td><td class="num">${fmt(f.t)} <span class="note small" style="margin:0">(${f.d.slice(0,4)})</span></td><td class="num">−${fmt(f.t-p.t)}</td></tr>`}).join('');
  $('#t-longest').innerHTML=`<tr><th>Date</th><th>Run</th><th class="num">Distance</th><th class="num">Moving time</th><th class="num">Pace</th></tr>`+D.longest_runs.map(r=>`<tr><td>${r.d}</td><td>${r.name}</td><td class="num">${r.km} km</td><td class="num">${fmt(r.t)}</td><td class="num">${paceS(r.t/r.km)}</td></tr>`).join('');
};
function toSec(s){const p=s.split(':').map(Number);return p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1]}

// ---------- VOLUME
build.volume=function(){
  const w=D.weekly.filter(x=>x.w>='2024-08-26');
  const roll=w.map((x,i)=>{const s=w.slice(Math.max(0,i-3),i+1);return +(s.reduce((a,b)=>a+b.km,0)/s.length).toFixed(1)});
  mk('c-weekly',{data:{labels:w.map(x=>x.w),datasets:[{type:'bar',label:'km',data:w.map(x=>x.km),backgroundColor:C.canola,borderWidth:0,barPercentage:1,categoryPercentage:.85},{type:'line',label:'4-week average',data:roll,borderColor:C.ink,borderWidth:2,pointRadius:0,tension:.3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{title:c=>'week of '+c[0].label,label:c=>c.dataset.type==='bar'?`${c.raw} km · ${w[c.dataIndex].n} runs · ${w[c.dataIndex].h} h`:`4-wk avg ${c.raw} km`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:12,callback:(v,i)=>w[i].w.slice(0,7)}},y:{grid:gridOpt,title:{display:true,text:'km'}}}}});
  const t2=D.train_last2y;$('#weekly-note').textContent=`Two-year average ${t2.run_km_wk} km and ${t2.run_h_wk} running hours a week (${t2.all_h_wk} h across all sports). The two years before that averaged ${D.train_prev2y.run_km_wk} km a week. Biggest week on record: ${Math.max(...D.weekly.map(x=>x.km))} km.`;
  // heatmap
  const heat=$('#heat');const start=new Date('2024-09-01T12:00:00');const dow=(start.getDay()+6)%7;const cells=[];for(let i=0;i<dow;i++)cells.push('<div style="visibility:hidden"></div>');
  const end=new Date(D.last+'T12:00:00');const col={Run:'228,179,31',Bike:'44,110,158',Swim:'58,166,160',Strength:'142,124,195',Other:'160,170,180'};
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){const key=d.toISOString().slice(0,10);const day=D.daily[key];if(!day){cells.push(`<div data-t="${key} · rest"></div>`);continue}
    const tot=Object.values(day).reduce((a,b)=>a+b,0);const top=Object.keys(day).sort((a,b)=>day[b]-day[a])[0];const al=Math.min(1,0.3+tot/120*0.7);
    cells.push(`<div style="background:rgba(${col[top]},${al.toFixed(2)})" data-t="${key} · ${Object.entries(day).map(([k,v])=>k.toLowerCase()+' '+v+' min').join(', ')}"></div>`)}
  heat.innerHTML=cells.join('');
  const tip=$('#tip');heat.addEventListener('mousemove',e=>{const t=e.target.dataset.t;if(!t){tip.style.display='none';return}tip.textContent=t;tip.style.display='block';tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY+12)+'px'});heat.addEventListener('mouseleave',()=>tip.style.display='none');
  const cy=Object.keys(D.consistency);
  mk('c-consist',{type:'bar',data:{labels:cy,datasets:[{data:cy.map(y=>D.consistency[y]),backgroundColor:cy.map(y=>yearColor(+y)),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{max:52,grid:gridOpt,title:{display:true,text:'weeks'}}}}});
  const dl=['<5','5–8','8–12','12–16','16–21','21–30','30+'];const dd=D.dist_dist,dy=Object.keys(dd);const dcol=['#EEF2F5','#CFE0EC','#8FB7D6','#E4B31F','#D67C2B','#B23A3A','#14213D'];
  mk('c-distdist',{type:'bar',data:{labels:dy,datasets:dl.map((l,i)=>({label:l+' km',data:dy.map(y=>{const s=dd[y].reduce((a,b)=>a+b,0);return s?+(dd[y][i]/s*100).toFixed(1):0}),backgroundColor:dcol[i],borderWidth:0}))},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw}% (${dd[c.label][c.datasetIndex]} runs)`}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,max:100,grid:gridOpt,ticks:{callback:v=>v+'%'}}}}});
  mk('c-hour',{type:'bar',data:{labels:[...Array(24).keys()].map(h=>h+':00'),datasets:[{data:D.hour_hist,backgroundColor:C.sky,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:12}},y:{grid:gridOpt,title:{display:true,text:'runs'}}}}});
  mk('c-dow',{type:'bar',data:{labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],datasets:[{data:D.dow_hist,backgroundColor:C.sky,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:gridOpt,title:{display:true,text:'runs'}}}}});
  const sh=D.shoes.slice(0,15);
  mk('c-shoes',{type:'bar',data:{labels:sh.map(s=>s.name),datasets:[{data:sh.map(s=>s.km),backgroundColor:C.canola,borderWidth:0}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const s=sh[c.dataIndex];return `${s.km} km · ${s.n} runs · ${s.first} → ${s.last}`}}}},scales:{x:{grid:gridOpt,title:{display:true,text:'km'}},y:{grid:{display:false}}}}});
};

// ---------- MULTISPORT
build.multi=function(){
  const t=D.totals;$('#m-totals').textContent=`${Math.round(t.bike_km).toLocaleString()} km of riding, ${t.swim_km.toFixed(0)} km of swimming and ${Math.round(t.strength_hours)} hours of strength work alongside the ${Math.round(t.run_km).toLocaleString()} km of running`;
  const mo=D.monthly.filter(m=>m.m>='2024-01');
  const ds=[['run_h','run',C.canola],['bike_h','bike',C.sky],['swim_h','swim',C.swim],['strength_h','strength',C.strength],['other_h','other',C.other]];
  mk('c-sport-hours',{type:'bar',data:{labels:mo.map(m=>m.m),datasets:ds.map(([k,l,c])=>({label:l,data:mo.map(m=>m[k]),backgroundColor:c,borderWidth:0}))},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw.toFixed(1)} h`}}},scales:{x:{stacked:true,grid:{display:false},ticks:{autoSkip:false,maxRotation:0,callback:(v,i)=>mo[i].m.endsWith('-01')||mo[i].m.endsWith('-07')?mo[i].m:null}},y:{stacked:true,grid:gridOpt,title:{display:true,text:'hours'}}}}});
  $('#calgary').innerHTML=`<table><tr><th>Leg</th><th class="num">Distance</th><th class="num">Time</th><th class="num">Pace / speed</th></tr>
    <tr><td>Swim</td><td class="num">2.0 km</td><td class="num">52:00</td><td class="num">2:33 /100 m</td></tr>
    <tr><td>T1</td><td class="num"></td><td class="num">3:20</td><td></td></tr>
    <tr><td>Bike</td><td class="num">87.5 km</td><td class="num">2:55:59</td><td class="num">29.8 km/h</td></tr>
    <tr><td>T2</td><td class="num"></td><td class="num">1:26</td><td></td></tr>
    <tr><td>Run</td><td class="num">21.2 km</td><td class="num">1:47:21</td><td class="num">5:03 /km</td></tr>
    <tr><td><strong>Total</strong></td><td class="num">110.7 km</td><td class="num"><strong>5:46:49</strong></td><td class="note small" style="margin:0">official; watch legs sum to 5:40 because timing mats and pauses differ</td></tr></table>`;
  $('#t-sport').innerHTML=`<tr><th>Year</th><th class="num">Run km</th><th class="num">Bike km</th><th class="num">Swim km</th><th class="num">Strength h</th><th class="num">All hours</th></tr>`+D.yearly.map(y=>`<tr><td>${y.year}</td><td class="num">${Math.round(y.run_km).toLocaleString()}</td><td class="num">${y.bike_km?Math.round(y.bike_km).toLocaleString():'—'}</td><td class="num">${y.swim_km?y.swim_km.toFixed(1):'—'}</td><td class="num">${y.strength_h?Math.round(y.strength_h):'—'}</td><td class="num">${Math.round(y.all_h)}</td></tr>`).join('');
};

// ---------- PREDICTION
let scn='base';
const FIT={};
build.predict=function(){
  const all=D.vdot_quarterly;const qi=all.findIndex(x=>x.q==='2024Q2');
  const q=all.slice(qi).map((x,i)=>({q:x.q,vdot:Math.max(...all.slice(Math.max(qi,qi+i-3),qi+i+1).map(y=>y.vdot))}));
  const qt=s=>+s.slice(0,4)+(+s.slice(5)-1)/4+0.125;
  const xs=q.map(x=>qt(x.q)),ys=q.map(x=>x.vdot);const n=xs.length,mx=xs.reduce((a,b)=>a+b)/n,my=ys.reduce((a,b)=>a+b)/n;
  const slope=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/xs.reduce((s,x)=>s+(x-mx)**2,0);
  FIT.rate=slope;FIT.v0=53.7;FIT.t0=2026.62;FIT.h0=D.train_last2y.all_h_wk;
  $('#p-rate').textContent=slope.toFixed(1);$('#p-hours').textContent=D.train_last2y.all_h_wk.toFixed(1);$('#p-runh').textContent=D.train_last2y.run_h_wk.toFixed(1)+' h';$('#p-km').textContent=D.train_last2y.run_km_wk;
  const sl=$('#hrs');sl.value=D.train_last2y.all_h_wk;$('#hrs-base').textContent=D.train_last2y.all_h_wk.toFixed(1);
  sl.addEventListener('input',draw);$('#seg-scn').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{scn=b.dataset.s;$('#seg-scn').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));draw()}));
  draw();
};
const SCN={cons:{tau:2.5,mult:0.7,label:'Conservative',color:'#7A8894'},base:{tau:3.5,mult:1.0,label:'Base',color:'#E4B31F'},opt:{tau:4.0,mult:1.2,label:'Optimistic',color:'#2C6E9E'}};
function proj(s,t,h){const m=Math.sqrt(h/FIT.h0);const r=FIT.rate*m*SCN[s].mult;const G=r*SCN[s].tau;return FIT.v0+G*(1-Math.exp(-(t-FIT.t0)/SCN[s].tau))}
function draw(){
  const h=+$('#hrs').value;$('#hrs-out').textContent=h.toFixed(2)+' h';
  const hist=D.vdot_quarterly.filter(x=>x.q>='2021Q1').map(x=>({x:+x.q.slice(0,4)+(+x.q.slice(5)-1)/4+0.125,y:x.vdot,q:x.q,d:x.dist,t:x.t}));
  const ts=[];for(let t=FIT.t0;t<=2031.01;t+=0.125)ts.push(+t.toFixed(3));
  const ds=[{type:'scatter',label:'measured',data:hist,backgroundColor:hist.map(p=>p.q>='2024Q2'?C.ink:'#A9B2BA'),pointRadius:4.5,order:0}];
  Object.keys(SCN).forEach(s=>ds.push({type:'line',label:SCN[s].label,data:ts.map(t=>({x:t,y:+proj(s,t,h).toFixed(2)})),borderColor:SCN[s].color,borderWidth:s===scn?3:1.5,borderDash:s===scn?[]:[5,4],pointRadius:0,tension:.2,order:1}));
  mk('c-proj',{data:{datasets:ds},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>c.raw.q?`${c.raw.q}: VDOT ${c.raw.y} (${LBL[c.raw.d]} ${fmt(c.raw.t)})`:`${c.dataset.label} ${c.raw.x.toFixed(2)}: ${c.raw.y}`}}},scales:{x:{type:'linear',min:2021,max:2031,ticks:{stepSize:1,callback:v=>String(v)},grid:{display:false}},y:{min:40,max:66,grid:gridOpt,title:{display:true,text:'VDOT'}}}}});
  const years=[{t:2026.70,l:'Sep 2026 (QCM half)'},{t:2027.3,l:'Spring 2027'},{t:2027.7,l:'Sep 2027'},{t:2028.7,l:'Sep 2028'},{t:2029.7,l:'Sep 2029'},{t:2030.7,l:'Sep 2030'}];
  const ks=['5k','10k','half','marathon'];
  $('#t-proj').innerHTML=`<tr><th>When</th><th class="num">VDOT</th>${ks.map(k=>`<th class="num">${LBL[k]}</th>`).join('')}</tr>`+years.map(y=>{const v=proj(scn,y.t,h);return `<tr><td>${y.l}</td><td class="num">${v.toFixed(1)}</td>${ks.map(k=>`<td class="num">${fmt(timeFor(TARG[k],v)*(k==='marathon'?1.015:1))}</td>`).join('')}</tr>`}).join('')+`<tr><td>Current records</td><td class="num">53.7</td>${ks.map(k=>{const p=D.pr_progression[k];return `<td class="num" style="color:var(--ink-2)">${fmt(p[p.length-1].t)}</td>`}).join('')}</tr>`;
  const ms=[['5K','sub-18:00',5000,1080],['10K','sub-40:00',10000,2400],['10K','sub-38:00',10000,2280],['Half','sub-1:25',21097.5,5100],['Half','sub-1:20',21097.5,4800],['Marathon','sub-3:00',42195,10800/1.015],['Marathon','sub-2:50',42195,10200/1.015],['Marathon','sub-2:40',42195,9600/1.015]];
  $('#milestones').innerHTML=ms.map(([d,g,dm,tt])=>{const need=vdot(dm,tt);let when=null;for(let t=FIT.t0;t<=2036;t+=1/12){if(proj(scn,t,h)>=need){when=t;break}}
    const now=proj(scn,FIT.t0,h)>=need;const lab=now?'now':when?`${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Math.floor((when%1)*12)]} ${Math.floor(when)}`:'beyond 2036';
    return `<div class="ms ${now?'done':''}"><div class="g">${d} ${g}</div><div class="w">${lab}</div><div class="r">needs VDOT ${need.toFixed(1)}</div></div>`}).join('');
}

build.overview();built.overview=true;
}
