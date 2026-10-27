import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const here=new URL('./',import.meta.url);
const names=process.argv.slice(2);
if(!names.length)names.push('baseline','optimized');
const median=values=>{const x=[...values].sort((a,b)=>a-b);return x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2;};
const stats=values=>({samples:values.length,median:median(values),min:Math.min(...values),max:Math.max(...values)});
const summary={generated:new Date().toISOString(),runs:[]};
for(const name of names){
  const data=JSON.parse(await readFile(new URL(`${name}.json`,here),'utf8'));
  assert.ok(data.completed,`Incomplete run: ${name}`);
  const run={label:name,base:data.base,conditions:data.conditions,gpu:data.navigation[0]?.gpu,warmup:data.warmup,errors:{page:data.exceptions.filter(e=>!e?.instrumentation),instrumentation:data.exceptions.filter(e=>e?.instrumentation),blockedRequests:data.blocked.length,distinctBlockedRequests:new Set(data.blocked).size},byDpr:[]};
  for(const dpr of data.conditions.dprs){
    const selected=data.navigation.filter(x=>x.dpr===dpr);
    const navigation=Object.fromEntries(['cold','warm-reload'].map(cache=>{const list=selected.filter(x=>x.cache===cache);return[cache,{map:stats(list.map(x=>x.mapReady.time)),full:stats(list.filter(x=>x.fullReady).map(x=>x.fullReady.time)),allRealDragsAccepted:list.every(x=>x.pointerDragAccepted),fullReadyCount:list.filter(x=>x.fullReady).length}];}));
    const clicks=data.clicks.filter(x=>x.dpr===dpr);
    run.byDpr.push({dpr,navigation,clicks:{feedback:stats(clicks.map(x=>x.feedbackMs)),dom:stats(clicks.map(x=>x.domMs))},frames:data.frames.filter(x=>x.dpr===dpr).map(({scene,rendered,raf,complete,canvas})=>({scene,rendered,raf,complete,canvas}))});
  }
  summary.runs.push(run);
}
if(summary.runs.length===2){
  const [before,after]=summary.runs;
  assert.deepEqual(before.conditions.dprs,after.conditions.dprs);
  assert.equal(before.conditions.width,after.conditions.width);
  assert.equal(before.conditions.height,after.conditions.height);
  summary.comparison=after.byDpr.map((item,index)=>{
    const prior=before.byDpr[index],change=(a,b)=>({before:a,after:b,reductionPercent:(a-b)/a*100});
    return{dpr:item.dpr,coldMap:change(prior.navigation.cold.map.median,item.navigation.cold.map.median),warmReload:change(prior.navigation['warm-reload'].map.median,item.navigation['warm-reload'].map.median),fullCold:change(prior.navigation.cold.full.median,item.navigation.cold.full.median),click:change(prior.clicks.feedback.median,item.clicks.feedback.median)};
  });
}
await writeFile(new URL('summary.json',here),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary.comparison||summary.runs.map(r=>({label:r.label,byDpr:r.byDpr})),null,2));
