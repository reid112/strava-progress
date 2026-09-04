import json, math, pandas as pd, numpy as np
from collections import defaultdict
rs={json.loads(l)['id']:json.loads(l) for l in open('run_streams_clean.jsonl')}
df=pd.read_csv('activities.csv',low_memory=False)
df['date']=pd.to_datetime(df['Activity Date'], format='%b %d, %Y, %I:%M:%S %p')
# Strava export dates are UTC; Regina is UTC-6 year round
df['date']=df['date']-pd.Timedelta(hours=6)
df['km']=pd.to_numeric(df['Distance.1'],errors='coerce')/1000
df['mt']=pd.to_numeric(df['Moving Time'],errors='coerce').fillna(pd.to_numeric(df['Elapsed Time'],errors='coerce'))
df['el']=pd.to_numeric(df['Elapsed Time'],errors='coerce')
df['hr']=pd.to_numeric(df['Average Heart Rate'],errors='coerce')
df['hrmax']=pd.to_numeric(df['Max Heart Rate.1'],errors='coerce')
df['cad']=pd.to_numeric(df['Average Cadence'],errors='coerce')
df['elev']=pd.to_numeric(df['Elevation Gain'],errors='coerce')
df['year']=df.date.dt.year
def sport(t):
    if t in ('Run','Virtual Run'): return 'Run'
    if t in ('Ride','Virtual Ride'): return 'Bike'
    if t=='Swim': return 'Swim'
    if t in ('Weight Training','Workout'): return 'Strength'
    return 'Other'
df['sport']=df['Activity Type'].map(sport)
runs=df[df.sport=='Run'].copy()
runs['pace']=runs.mt/60/runs.km

TARGETS={'1k':1000,'1mi':1609.34,'5k':5000,'10k':10000,'15k':15000,'half':21097.5,'30k':30000,'marathon':42195}
def vdot(dist_m, t_s):
    v=dist_m/(t_s/60); tmin=t_s/60
    vo2=-4.60+0.182258*v+0.000104*v*v
    pct=0.8+0.1894393*math.exp(-0.012778*tmin)+0.2989558*math.exp(-0.193261*tmin)
    return vo2/pct

out={}
OVERRIDE={}
for _,r in runs.iterrows():
    if r['Activity Name']=='5k Time Trial' and str(r.date.date())=='2026-08-15': OVERRIDE[r['Activity ID']]={'5k':1119.0}
for aid,s in rs.items():
    if s.get('scaled'):
        for k in ('1k','1mi'): s.get('be',{}).pop(k,None)
    if aid in OVERRIDE: s.setdefault('be',{}).update(OVERRIDE[aid])
# ---------- summary
out['generated']='2026-08-27'
out['first']=str(df.date.min().date()); out['last']=str(df.date.max().date())
out['totals']={'activities':int(len(df)),'runs':int(len(runs)),'run_km':round(float(runs.km.sum()),1),
  'run_hours':round(float(runs.mt.sum()/3600),1),'run_elev':round(float(runs.elev.sum())),
  'bike_km':round(float(df[df.sport=='Bike'].km.sum()),1),'bike_hours':round(float(df[df.sport=='Bike'].mt.sum()/3600),1),
  'swim_km':round(float(df[df.sport=='Swim'].km.sum()),1),'swim_hours':round(float(df[df.sport=='Swim'].mt.sum()/3600),1),
  'strength_hours':round(float(df[df.sport=='Strength'].mt.sum()/3600),1),
  'all_hours':round(float(df.mt.sum()/3600),1),
  'marathons':int((runs.km>=42).sum()),'halfs_plus':int((runs.km>=21).sum()),'longest_km':round(float(runs.km.max()),1),
  'active_days':int(df.date.dt.date.nunique())}
# ---------- yearly by sport
yr=[]
for y in range(2017,2027):
    d=df[df.year==y]; r=runs[runs.year==y]
    row={'year':y,'runs':int(len(r)),'run_km':round(float(r.km.sum()),1),'run_h':round(float(r.mt.sum()/3600),1),
         'longest':round(float(r.km.max()),1) if len(r) else 0,
         'med_pace':round(float(r[r.km>=2].pace.median()),2) if len(r) else None,
         'avg_hr':round(float(r.hr.mean()),1) if r.hr.notna().any() else None,
         'cad':round(float(r[(r.cad>60)&(r.cad<120)].cad.mean()*2)) if (r.cad>60).any() else None,
         'bike_km':round(float(d[d.sport=='Bike'].km.sum()),1),'bike_h':round(float(d[d.sport=='Bike'].mt.sum()/3600),1),
         'swim_km':round(float(d[d.sport=='Swim'].km.sum()),1),'swim_h':round(float(d[d.sport=='Swim'].mt.sum()/3600),1),
         'strength_h':round(float(d[d.sport=='Strength'].mt.sum()/3600),1),
         'other_h':round(float(d[d.sport=='Other'].mt.sum()/3600),1),
         'all_h':round(float(d.mt.sum()/3600),1),'activities':int(len(d)),
         'weeks_run':int(r.date.dt.to_period('W').nunique())}
    yr.append(row)
out['yearly']=yr
# ---------- monthly
months=pd.period_range('2017-04','2026-08',freq='M')
mo=[]
for p in months:
    d=df[df.date.dt.to_period('M')==p]; r=d[d.sport=='Run']
    mo.append({'m':str(p),'run_km':round(float(r.km.sum()),1),'runs':int(len(r)),
       'run_h':round(float(r.mt.sum()/3600),2),'bike_h':round(float(d[d.sport=='Bike'].mt.sum()/3600),2),
       'swim_h':round(float(d[d.sport=='Swim'].mt.sum()/3600),2),'strength_h':round(float(d[d.sport=='Strength'].mt.sum()/3600),2),
       'other_h':round(float(d[d.sport=='Other'].mt.sum()/3600),2),
       'bike_km':round(float(d[d.sport=='Bike'].km.sum()),1),'swim_km':round(float(d[d.sport=='Swim'].km.sum()),2),
       'long':round(float(r.km.max()),1) if len(r) else 0})
out['monthly']=mo
# ---------- weekly (all)
wk=runs.groupby(runs.date.dt.to_period('W-SUN')).agg(km=('km','sum'),h=('mt',lambda s:s.sum()/3600),n=('km','size'))
allw=pd.period_range(runs.date.min(),runs.date.max(),freq='W-SUN')
wk=wk.reindex(allw,fill_value=0)
out['weekly']=[{'w':str(p.start_time.date()),'km':round(float(v.km),1),'h':round(float(v.h),2),'n':int(v.n)} for p,v in wk.iterrows()]
# ---------- best efforts
prog={}; per_year={}; scatter={}
for k,L in TARGETS.items():
    rows=[]
    for _,r in runs.iterrows():
        s=rs.get(r['Activity ID'])
        if s and k not in s.get('be',{}) and r.km*1000>=L*0.985 and r.km*1000<L*1.03 and r.mt>0:
            s.setdefault('be',{})[k]=float(r.mt)*L/(r.km*1000)
        if s and k in s.get('be',{}):
            rows.append({'d':str(r.date.date()),'t':float(s['be'][k]),'name':str(r['Activity Name'])[:60],'id':int(r['Activity ID']),'y':int(r.year),'km':round(float(r.km),1),'hr':None if pd.isna(r.hr) else float(r.hr)})
    rows.sort(key=lambda x:x['d'])
    best=1e9; pr=[]
    for x in rows:
        if x['t']<best: best=x['t']; pr.append({**x,'vdot':round(vdot(L,x['t']),1)})
    prog[k]=pr
    py={}
    for x in rows:
        if x['y'] not in py or x['t']<py[x['y']]['t']: py[x['y']]=x
    per_year[k]={str(y):{**v,'vdot':round(vdot(L,v['t']),1)} for y,v in py.items()}
    scatter[k]=[[x['d'],round(x['t'])] for x in rows]
out['pr_progression']=prog; out['best_by_year']=per_year; out['effort_scatter']=scatter
# ---------- VDOT timeline: quarterly max over all efforts >=5k
qv=defaultdict(lambda:None)
for k in ['5k','10k','15k','half','30k','marathon']:
    for x in scatter[k]:
        q=str(pd.Period(x[0],freq='Q')); v=vdot(TARGETS[k],x[1])
        if qv[q] is None or v>qv[q]['vdot']: qv[q]={'vdot':round(v,1),'dist':k,'t':x[1],'d':x[0]}
out['vdot_quarterly']=[{'q':q,**qv[q]} for q in sorted(qv)]
# ---------- aerobic efficiency (easy runs, HR 135-158, >=5km, pace not race)
ez=runs[(runs.hr>=135)&(runs.hr<=158)&(runs.km>=5)&(runs.pace>4.3)].copy()
ez['ef']=(1000/ez.pace/60)/ez.hr  # m/s per bpm
ez['q']=ez.date.dt.to_period('Q').astype(str)
ae=ez.groupby('q').agg(pace=('pace','median'),hr=('hr','median'),ef=('ef','median'),n=('km','size')).reset_index()
out['aerobic']=[{'q':r.q,'pace':round(float(r.pace),2),'hr':round(float(r.hr)),'ef':round(float(r.ef)*1000,1),'n':int(r.n)} for r in ae.itertuples() if r.n>=3]
# pace-vs-HR cloud for all runs with HR (sampled)
cloud=runs[(runs.hr>100)&(runs.km>=3)&(runs.pace<8)&(runs.pace>3)][['date','pace','hr','km','year']]
out['pace_hr']=[[str(r.date.date()),round(float(r.pace),2),round(float(r.hr)),round(float(r.km),1)] for r in cloud.itertuples()]
# ---------- HR zones per year (from stream zone seconds)
zy=defaultdict(lambda:[0]*5)
for _,r in runs.iterrows():
    s=rs.get(r['Activity ID'])
    if s and 'zones' in s:
        for i,v in enumerate(s['zones']): zy[int(r.year)][i]+=v
out['zones_by_year']={str(y):[round(v/3600,1) for v in z] for y,z in zy.items()}
# ---------- races (curated by name)
race_pat=r'qcm|flatlanders|gopher|park ?run|dog river|spartan|i love regina|time trial|pr baby|cure for the brrr|70\.3|10k time trial|5k time trial|1 mile'
rc=runs[runs['Activity Name'].str.contains(race_pat,case=False,na=False)].sort_values('date')
races=[]
for _,r in rc.iterrows():
    s=rs.get(r['Activity ID'],{})
    races.append({'d':str(r.date.date()),'name':str(r['Activity Name']),'km':round(float(r.km),2),'moving':int(r.mt),'elapsed':int(r.el),
                  'pace':round(float(r.pace),2),'hr':None if pd.isna(r.hr) else int(r.hr),'hrmax':None if pd.isna(r.hrmax) else int(r.hrmax),
                  'desc':'' if pd.isna(r['Activity Description']) else str(r['Activity Description'])[:200],'be':s.get('be',{})})
out['races']=races
# ---------- heatmap: daily minutes by sport, last 2 years + all-time counts
daily=df.groupby([df.date.dt.date,'sport']).mt.sum().unstack(fill_value=0)/60
out['daily']={str(d):{k:int(round(v)) for k,v in row.items() if v>0} for d,row in daily.iterrows()}
# ---------- streaks & consistency
days=sorted(set(runs.date.dt.date))
best=cur=1
for i in range(1,len(days)):
    cur=cur+1 if (days[i]-days[i-1]).days==1 else 1; best=max(best,cur)
out['streaks']={'longest_run_streak_days':best}
# weeks with >=3 runs per year
wr=runs.groupby([runs.year,runs.date.dt.to_period('W-SUN')]).size()
out['consistency']={str(y):int((wr.loc[y]>=3).sum()) for y in range(2017,2027) if y in wr.index.get_level_values(0)}
# ---------- shoes
sh=runs.groupby('Activity Gear').agg(km=('km','sum'),n=('km','size'),first=('date','min'),last=('date','max')).sort_values('km',ascending=False)
out['shoes']=[{'name':n,'km':round(float(v.km)),'n':int(v.n),'first':str(v['first'].date()),'last':str(v['last'].date())} for n,v in sh.iterrows()]
# ---------- time of day & weekday
out['hour_hist']=[int(v) for v in runs.date.dt.hour.value_counts().reindex(range(24),fill_value=0)]
out['dow_hist']=[int(v) for v in runs.date.dt.dayofweek.value_counts().reindex(range(7),fill_value=0)]
# ---------- distance distribution per year
bins=[0,5,8,12,16,21,30,60]
dd={}
for y in range(2017,2027):
    r=runs[runs.year==y]
    dd[str(y)]=[int(v) for v in pd.cut(r.km,bins).value_counts().reindex(pd.IntervalIndex.from_breaks(bins),fill_value=0)]
out['dist_dist']=dd
# ---------- training hours last 2 years (for prediction)
last2=df[df.date>='2024-08-27']
wks=last2.groupby(last2.date.dt.to_period('W-SUN')).apply(lambda g:pd.Series({'run':g[g.sport=='Run'].mt.sum()/3600,'all':g.mt.sum()/3600,'km':g[g.sport=='Run'].km.sum()}))
out['train_last2y']={'weeks':int(len(wks)),'run_h_wk':round(float(wks.run.mean()),2),'all_h_wk':round(float(wks['all'].mean()),2),'run_km_wk':round(float(wks.km.mean()),1),
   'run_h_wk_median':round(float(wks.run.median()),2)}
prev2=df[(df.date>='2022-08-27')&(df.date<'2024-08-27')]
out['train_prev2y']={'run_km_wk':round(float(prev2[prev2.sport=='Run'].km.sum()/104),1),'all_h_wk':round(float(prev2.mt.sum()/3600/104),2)}
# top longest runs
out['longest_runs']=[{'d':str(r.date.date()),'name':str(r['Activity Name'])[:50],'km':round(float(r.km),1),'t':int(r.mt)} for _,r in runs.nlargest(10,'km').iterrows()]
json.dump(out,open('data.json','w'))
print(json.dumps(out['totals'])); print(out['train_last2y'], out['train_prev2y'])
print(out['vdot_quarterly'][-12:])
for k in ['5k','10k','half','marathon']: print(k,[(p['d'],round(p['t']),p['vdot']) for p in out['pr_progression'][k]])
print(len(out['races']))
for r in out['races']: print(r['d'],r['name'][:40],r['km'],r['elapsed'])
