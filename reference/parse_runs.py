import gzip, json, math, sys, os
import pandas as pd, numpy as np
from multiprocessing import Pool
from fitparse import FitFile
import gpxpy

TARGETS = {'1k':1000,'1mi':1609.34,'5k':5000,'10k':10000,'15k':15000,'half':21097.5,'30k':30000,'marathon':42195}

def hav(lat1,lon1,lat2,lon2):
    R=6371000; p=math.pi/180
    a=math.sin((lat2-lat1)*p/2)**2+math.cos(lat1*p)*math.cos(lat2*p)*math.sin((lon2-lon1)*p/2)**2
    return 2*R*math.asin(math.sqrt(a))

def streams_fit(path):
    raw=gzip.open(path,'rb').read() if path.endswith('.gz') else open(path,'rb').read()
    f=FitFile(raw)
    t=[];d=[];hr=[];cad=[];pw=[]
    t0=None
    for r in f.get_messages('record'):
        v={x.name:x.value for x in r}
        ts=v.get('timestamp'); dist=v.get('distance')
        if ts is None or dist is None: continue
        if t0 is None: t0=ts
        t.append((ts-t0).total_seconds()); d.append(float(dist))
        hr.append(v.get('heart_rate')); cad.append(v.get('cadence')); pw.append(v.get('power'))
    return t,d,hr,cad,pw

def streams_gpx(path):
    raw=gzip.open(path,'rt') if path.endswith('.gz') else open(path,'r')
    g=gpxpy.parse(raw)
    t=[];d=[];hr=[];cad=[];pw=[]
    t0=None;cum=0;prev=None
    for tr in g.tracks:
        for seg in tr.segments:
            for p in seg.points:
                if p.time is None: continue
                if t0 is None: t0=p.time
                if prev is not None: cum+=hav(prev.latitude,prev.longitude,p.latitude,p.longitude)
                prev=p
                t.append((p.time-t0).total_seconds()); d.append(cum)
                h=None;c=None
                for e in p.extensions:
                    for ch in e.iter():
                        tag=ch.tag.split('}')[-1]
                        if tag=='hr' and ch.text: h=int(ch.text)
                        if tag=='cad' and ch.text: c=int(ch.text)
                hr.append(h);cad.append(c);pw.append(None)
    return t,d,hr,cad,pw

def best_efforts(t,d):
    # remove pauses: use moving time approx = drop gaps > 15s
    n=len(t); out={}
    if n<10: return out
    t=np.array(t,float); d=np.array(d,float)
    # moving time: cap dt at 15s
    dt=np.diff(t); dt=np.minimum(dt,15); mt=np.concatenate([[0],np.cumsum(dt)])
    for name,L in TARGETS.items():
        if d[-1] < L*0.995: continue
        j=0; best=None
        for i in range(n):
            target=d[i]+L
            if target>d[-1]+L*0.005: break
            while j<n and d[j]<target: j+=1
            if j>=n: break
            # interpolate time at exact distance
            if j>0 and d[j]!=d[j-1]:
                frac=(target-d[j-1])/(d[j]-d[j-1]); tt=mt[j-1]+frac*(mt[j]-mt[j-1])
            else: tt=mt[j]
            el=tt-mt[i]
            if best is None or el<best: best=el
        if best and best>0: out[name]=round(best,1)
    return out

def process(args):
    aid,fname=args
    path=os.path.join('/home/claude/strava',fname)
    try:
        if '.fit' in fname: t,d,hr,cad,pw=streams_fit(path)
        elif '.gpx' in fname: t,d,hr,cad,pw=streams_gpx(path)
        elif '.tcx' in fname: return {'id':aid,'err':'tcx'}
        else: return {'id':aid,'err':'unknown'}
        be=best_efforts(t,d)
        hrv=[h for h in hr if h]; cv=[c for c in cad if c]; pv=[p for p in pw if p]
        res={'id':aid,'n':len(t),'dist':d[-1] if d else 0,'be':be,
             'hr_avg':float(np.mean(hrv)) if hrv else None,'hr_max':max(hrv) if hrv else None,
             'cad_avg':float(np.mean(cv)) if cv else None,'pw_avg':float(np.mean(pv)) if pv else None}
        # HR zone time distribution (seconds) using max 201
        if hrv and len(hrv)>10:
            hra=np.array([h if h else 0 for h in hr]); dt=np.minimum(np.diff(np.array(t)),15)
            zones=[0,0.6*201,0.7*201,0.8*201,0.9*201,999]
            zt=[float(dt[(hra[1:]>=zones[k])&(hra[1:]<zones[k+1])].sum()) for k in range(5)]
            res['zones']=zt
        return res
    except Exception as e:
        return {'id':aid,'err':str(e)[:80]}

if __name__=='__main__':
    df=pd.read_csv('activities.csv',low_memory=False)
    runs=df[df['Activity Type'].isin(['Run','Virtual Run'])&df['Filename'].notna()]
    jobs=list(zip(runs['Activity ID'],runs['Filename']))
    with Pool(os.cpu_count()) as p:
        results=p.map(process,jobs,chunksize=8)
    json.dump(results,open('run_streams.json','w'))
    errs=[r for r in results if 'err' in r]
    print('done',len(results),'errors',len(errs), errs[:5])
