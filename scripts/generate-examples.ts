import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { generateDungeon } from '../src/generator.ts';
import { validateDungeon } from '../src/validation.ts';
import { renderDungeon } from '../src/renderer.ts';
import { DEFAULT_DRAWING } from '../src/types.ts';
const directory=new URL('../docs/milestone1/',import.meta.url);
await mkdir(directory,{recursive:true});
const examples=[
  {name:'sable-archive',seed:'1473',rooms:18,symmetry:.65,loops:.5},
  {name:'small-sanctuary',seed:'2306',rooms:8,symmetry:1,loops:.25},
  {name:'large-vaults',seed:'5660',rooms:24,symmetry:.2,loops:.85},
];
const samples=[];
for(const {name,...parameters} of examples){
  const start=performance.now(),d=generateDungeon(parameters),generationMs=performance.now()-start;
  const inkStart=performance.now(),svg=renderDungeon(d,DEFAULT_DRAWING),svgMs=performance.now()-inkStart;
  const validation=validateDungeon(d);if(!validation.valid)throw new Error(validation.errors.join(', '));
  await writeFile(new URL(name+'.svg',directory),svg);
  await writeFile(new URL(name+'.json',directory),JSON.stringify(d,null,2)+'\n');
  if(name==='sable-archive')await writeFile(new URL('structure.svg',directory),renderDungeon(d,{...DEFAULT_DRAWING,view:'graph',route:true}));
  samples.push({name,parameters,rooms:d.rooms.length,connections:d.connections.length,loops:validation.loops,floorCells:d.floor.length,
    generationMs:Number(generationMs.toFixed(2)),svgSerializationMs:Number(svgMs.toFixed(2)),validation});
}
const presets=[{rooms:8,symmetry:0,loops:0},{rooms:16,symmetry:.65,loops:.5},{rooms:24,symmetry:1,loops:1}];
let failures=0,shortfalls=0,totalMs=0,maxMs=0;
for(const preset of presets)for(let i=0;i<100;i++){
  const start=performance.now(),d=generateDungeon({...preset,seed:'validation-'+i});const ms=performance.now()-start;
  totalMs+=ms;maxMs=Math.max(maxMs,ms);if(!validateDungeon(d).valid)failures++;if(d.rooms.length<preset.rooms)shortfalls++;
}
const report={milestone:1,recordedAt:new Date().toISOString(),runtime:process.version,
  sampleCount:300,failures,shortfalls,meanGenerationMs:Number((totalMs/300).toFixed(2)),maxGenerationMs:Number(maxMs.toFixed(2)),
  timingNote:'Node timings measure generation and SVG serialization, not browser paint. Results vary by machine.',
  presets,samples};
await writeFile(new URL('validation-report.json',directory),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
