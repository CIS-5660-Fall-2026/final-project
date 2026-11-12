import './style.css';
import { generateDungeon } from './generator.ts';
import { validateDungeon } from './validation.ts';
import { mapTitle, renderDungeon } from './renderer.ts';
import { DEFAULT_DRAWING, DEFAULT_PARAMETERS } from './types.ts';
import type { DrawingSettings, Dungeon, Parameters } from './types.ts';

const icon=(name:string)=> {
 const paths:Record<string,string>={dice:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" stroke-width="3" stroke-linecap="round"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>'};
 return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">'+paths[name]+'</svg>';
};
const query=new URLSearchParams(location.search);
const numberParam=(name:string,fallback:number)=>query.has(name)&&Number.isFinite(Number(query.get(name)))?Number(query.get(name)):fallback;
let parameters:Parameters={...DEFAULT_PARAMETERS,seed:query.get('seed')??DEFAULT_PARAMETERS.seed,rooms:numberParam('rooms',18),symmetry:numberParam('symmetry',.65),loops:numberParam('loops',.5)};
let drawing:DrawingSettings={...DEFAULT_DRAWING,hatch:Math.max(0,Math.min(1,numberParam('hatch',.55)))};
let dungeon:Dungeon;
let generationMs=0;
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`
<header class="masthead">
 <a class="brand" href="./" aria-label="Dungeon Atlas home"><span class="brand-mark">${icon('map')}</span><span>Dungeon Atlas<small>PROCEDURAL CARTOGRAPHY</small></span></a>
 <div class="edition"><span class="edition-dot"></span> A study in rooms &amp; passages <span class="edition-number">No. 01 / CIS 5660</span></div>
</header>
<main class="workspace">
 <aside class="sidebar" aria-label="Map controls">
  <div class="side-intro"><p class="eyebrow">THE GENERATOR</p><h1>Every seed,<br>a new story.</h1><p>Shape a connected dungeon.<br>Give it a little character.</p></div>
  <form id="seed-form"><label class="field-label" for="seed">Map seed <span>01</span></label>
   <div class="seed-row"><input id="seed" name="seed" aria-label="Map seed" maxlength="120" autocomplete="off" spellcheck="false"/><button id="randomize" class="icon-button" type="button" title="Choose a new seed" aria-label="Choose a new seed">${icon('dice')}</button></div>
   <button class="primary" type="submit">Draw map ${icon('arrow')}</button>
  </form>
  <section class="control-section" aria-label="Layout parameters">
   <div class="section-label">LAYOUT <span>02</span></div>
   <label class="range-label" for="rooms">Chambers <output id="rooms-value" for="rooms"></output></label><input id="rooms" type="range" min="8" max="24" step="1"/>
   <div class="range-ends"><span>Small expedition</span><span>Deep exploration</span></div>
   <label class="range-label" for="symmetry">Symmetry <output id="symmetry-value" for="symmetry"></output></label><input id="symmetry" type="range" min="0" max="100" step="5"/><p class="control-hint">How often rooms grow in mirrored pairs.</p>
   <label class="range-label" for="loops">Extra passages <output id="loops-value" for="loops"></output></label><input id="loops" type="range" min="0" max="100" step="5"/><p class="control-hint">Connect nearby chambers where space allows.</p>
  </section>
  <section class="control-section appearance" aria-label="Drawing parameters">
   <div class="section-label">INK &amp; PAPER <span>03</span></div>
   <label class="range-label" for="hatch">Hatching <output id="hatch-value" for="hatch"></output></label><input id="hatch" type="range" min="0" max="100" step="5"/>
   <label class="check-label"><input id="grid" type="checkbox" checked/> Floor grid <span class="hint-inline">1 square = 1 unit</span></label>
  </section>
  <button id="reset" class="text-button" type="button">${icon('reset')} Reset parameters</button>
  <p class="sidebar-foot">Built with rules. Drawn with a seed.<br><a href="https://watabou.itch.io/one-page-dungeon" target="_blank" rel="noreferrer">Inspired by Watabou ↗</a></p>
 </aside>
 <section class="studio" aria-label="Dungeon map">
  <div class="studio-toolbar">
   <div class="view-switch" role="group" aria-label="Map view"><button data-view="ink" aria-pressed="true">Ink plan</button><button data-view="geometry" aria-pressed="false">Floor plan</button><button data-view="graph" aria-pressed="false">Room graph</button></div>
   <label class="route-toggle"><input type="checkbox" id="route"/><span class="route-dot"></span> Trace route</label>
  </div>
  <div class="map-surface" id="map-surface" aria-label="Generated map"></div>
  <div class="map-caption"><div class="map-caption-left"><span class="live-dot"></span><span id="map-summary" role="status" aria-live="polite"></span></div><span id="timing" title="Generation and SVG serialization time; excludes browser painting"></span></div>
  <div class="export-bar"><div><p class="eyebrow">TAKE YOUR MAP WITH YOU</p><p class="export-description">A vector drawing, or the structure behind it.</p></div><div class="export-actions"><button id="export-svg" class="secondary">${icon('download')} Export SVG</button><button id="export-json" class="secondary subtle">${icon('download')} JSON</button></div></div>
  <div id="notice" class="notice" role="status" aria-live="polite"></div>
 </section>
</main>`;
const input=(id:string)=>document.getElementById(id) as HTMLInputElement;
const el=(id:string)=>document.getElementById(id)!;
function syncControls(){
 input('seed').value=parameters.seed;input('rooms').value=String(parameters.rooms);
 input('symmetry').value=String(Math.round(parameters.symmetry*100));input('loops').value=String(Math.round(parameters.loops*100));
 input('hatch').value=String(Math.round(drawing.hatch*100));input('grid').checked=drawing.grid;input('route').checked=drawing.route;
 for(const id of ['rooms','symmetry','loops','hatch'])el(id+'-value').textContent=input(id).value+(id==='rooms'?'':'%');
 document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===drawing.view)));
 for(const id of ['hatch','grid'])input(id).disabled=drawing.view==='graph';
}
function updateAddress(){
 const q=new URLSearchParams({seed:parameters.seed,rooms:String(parameters.rooms),symmetry:String(parameters.symmetry),loops:String(parameters.loops),hatch:String(drawing.hatch)});
 history.replaceState(null,'',location.pathname+'?'+q.toString());
}
function paint(){
 const start=performance.now();const svg=renderDungeon(dungeon,drawing);
 el('map-surface').innerHTML=svg;
 const drawingMs=performance.now()-start, validation=validateDungeon(dungeon);
 el('map-summary').textContent=validation.valid?`${dungeon.rooms.length} chambers connected · ${validation.loops} extra passage${validation.loops===1?'':'s'}`:'Validation issue: '+validation.errors.join('; ');
 el('map-summary').classList.toggle('error',!validation.valid);
 el('timing').textContent=Math.round(generationMs+drawingMs)+' ms';
 el('notice').textContent=dungeon.warnings.join(' ');
 document.title=mapTitle(parameters.seed)+' — Dungeon Atlas';
 updateAddress();syncControls();
}
function regenerate(){
 const start=performance.now();dungeon=generateDungeon(parameters);generationMs=performance.now()-start;parameters={...dungeon.parameters};paint();
}
let timer:ReturnType<typeof setTimeout>|undefined;
let pendingLayout=false;
function cancelPending(){if(timer)clearTimeout(timer);timer=undefined;pendingLayout=false;}
function schedule(layout:boolean){
 pendingLayout ||= layout;
 if(timer)clearTimeout(timer);
 timer=setTimeout(()=>{const needsLayout=pendingLayout;cancelPending();needsLayout?regenerate():paint();},100);
}
function flush(){if(timer){const needsLayout=pendingLayout;cancelPending();needsLayout?regenerate():paint();}}
el('seed-form').addEventListener('submit',event=>{event.preventDefault();cancelPending();parameters.seed=input('seed').value;regenerate();});
el('randomize').addEventListener('click',()=>{cancelPending();parameters.seed=String(crypto.getRandomValues(new Uint32Array(1))[0]);regenerate();});
for(const id of ['rooms','symmetry','loops'])input(id).addEventListener('input',()=>{
 const value=Number(input(id).value);parameters={...parameters,[id]:id==='rooms'?value:value/100};
 el(id+'-value').textContent=value+(id==='rooms'?'':'%');schedule(true);
});
input('hatch').addEventListener('input',()=>{drawing.hatch=Number(input('hatch').value)/100;el('hatch-value').textContent=input('hatch').value+'%';schedule(false);});
input('grid').addEventListener('change',()=>{const checked=input('grid').checked;flush();drawing.grid=checked;paint();});
input('route').addEventListener('change',()=>{const checked=input('route').checked;flush();drawing.route=checked;paint();});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.addEventListener('click',()=>{flush();drawing.view=b.dataset.view as DrawingSettings['view'];paint();}));
el('reset').addEventListener('click',()=>{cancelPending();parameters={...DEFAULT_PARAMETERS,seed:parameters.seed};drawing={...DEFAULT_DRAWING};regenerate();});
function download(data:string,type:string,extension:string){
 const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='dungeon-'+parameters.seed.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,50)+'.'+extension;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);el('notice').textContent=extension.toUpperCase()+' exported for seed '+parameters.seed+'.';
}
el('export-svg').addEventListener('click',()=>{flush();download(renderDungeon(dungeon,drawing),'image/svg+xml;charset=utf-8','svg');});
el('export-json').addEventListener('click',()=>{flush();download(JSON.stringify({...dungeon,drawing},null,2),'application/json','json');});
regenerate();
