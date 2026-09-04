import json, os, sys, pandas as pd
from parse_runs import process
df=pd.read_csv('activities.csv',low_memory=False)
runs=df[df['Activity Type'].isin(['Run','Virtual Run'])&df['Filename'].notna()]
jobs=list(zip(runs['Activity ID'],runs['Filename']))
done={}
if os.path.exists('run_streams.jsonl'):
    for line in open('run_streams.jsonl'):
        r=json.loads(line); done[r['id']]=r
todo=[j for j in jobs if j[0] not in done]
N=int(sys.argv[1])
with open('run_streams.jsonl','a') as f:
    for j in todo[:N]:
        f.write(json.dumps(process(j))+'\n'); f.flush()
print('done',len(done)+min(N,len(todo)),'of',len(jobs))
