import type { DrawingSettings, Dungeon } from './types.ts';
import { center } from './grid.ts';
import { boundarySegments, floorPath } from './geometry.ts';
import { hatchCenters } from './hatching.ts';
import { integer, random } from './random.ts';

export const escapeXml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const f=(v:number)=>Number(v.toFixed(3));
export function mapTitle(seed:string):string {
  const rng=random(seed+':title');
  const names=['Sable','Quiet','Amber','Forgotten','Hollow','Silver','Sunken','Twilight'];
  const places=['Archive','Sanctuary','Vaults','Cloister','Labyrinth','Chambers','Reliquary','Passage'];
  return 'The '+names[integer(rng,0,names.length-1)]+' '+places[integer(rng,0,places.length-1)];
}
export function renderDungeon(d:Dungeon,settings:DrawingSettings):string {
  const ink=settings.view==='ink', graph=settings.view==='graph';
  const rng=random(d.parameters.seed+':ink');
  const minX=Math.min(...d.floor.map(p=>p.x)),minY=Math.min(...d.floor.map(p=>p.y));
  const w=Math.max(...d.floor.map(p=>p.x))+1-minX,h=Math.max(...d.floor.map(p=>p.y))+1-minY;
  const scale=Math.min(850/(w+5),500/(h+5)), tx=500-(minX+w/2)*scale,ty=391-(minY+h/2)*scale;
  const paper=ink?'#f6f1e5':'#f8f8f4', floor=ink?'#fcf9ef':'#fff';
  const path=floorPath(d.floor), segments=boundarySegments(d.floor);
  const parts:string[]=[];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 740" width="1000" height="740" role="img" aria-labelledby="map-title map-description">
<title id="map-title">${escapeXml(mapTitle(d.parameters.seed))}</title>
<desc id="map-description">A generated dungeon with ${d.rooms.length} rooms and ${d.connections.filter(e=>e.kind==='loop').length} additional passages. Seed ${escapeXml(d.parameters.seed)}. ${settings.view} view.</desc>
<defs>
<pattern id="floor-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#b1aa96" stroke-width=".025"/></pattern>
<clipPath id="floor-clip"><path d="${path}"/></clipPath>
<mask id="exterior" maskUnits="userSpaceOnUse" x="${minX-4}" y="${minY-4}" width="${w+8}" height="${h+8}"><rect x="${minX-4}" y="${minY-4}" width="${w+8}" height="${h+8}" fill="white"/><path d="${path}" fill="black"/></mask>
</defs>
<rect width="1000" height="740" fill="${paper}"/>
<path d="M32 53V25H60 M940 25H968V53 M32 687V715H60 M940 715H968V687" fill="none" stroke="#b7ae99" stroke-width="1"/>
<text x="500" y="37" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" letter-spacing="3" fill="#857b66">A PROCEDURAL DUNGEON SURVEY</text>
<text x="500" y="75" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#343b32">${escapeXml(mapTitle(d.parameters.seed))}</text>
<text x="500" y="99" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" letter-spacing=".8" fill="#847d6d">${String(d.rooms.length).padStart(2,'0')} CHAMBERS · ${graph?'ROOM RELATIONSHIPS':ink?'PEN &amp; PAPER':'FLOOR GEOMETRY'}</text>
<path d="M450 116H550" stroke="#c6bdab" stroke-width="1"/>
<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(scale)})">`);
  if(ink&&settings.hatch>0){
    const hatchRng=random(d.parameters.seed+':hatching');
    const density=Math.max(0,Math.min(1,settings.hatch));
    const points=hatchCenters(d.floor,density,hatchRng);
    const strokes:string[]=[];
    for(const p of points){
      const angle=hatchRng()*Math.PI, len=.36+hatchRng()*.28;
      const dx=Math.cos(angle)*len,dy=Math.sin(angle)*len;
      for(let j=-1;j<=1;j++){
        const ox=-Math.sin(angle)*j*.17,oy=Math.cos(angle)*j*.17,curve=(hatchRng()-.5)*.12;
        strokes.push(`M${f(p.x+ox-dx/2)} ${f(p.y+oy-dy/2)}q${f(dx/2+curve)} ${f(dy/2+curve)} ${f(dx)} ${f(dy)}`);
      }
    }
    parts.push(`<path d="${strokes.join('')}" fill="none" stroke="#777263" stroke-width=".045" stroke-linecap="round" opacity=".72" mask="url(#exterior)"/>`);
  }
  parts.push(`<path d="${path}" fill="${floor}"/>`);
  if(settings.grid&&!graph)parts.push(`<path d="${path}" fill="url(#floor-grid)" opacity=".65"/>`);
  if(graph){
    for(const r of d.rooms) parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx=".15" fill="#e1e8dc" stroke="#becaba" stroke-width=".08"/>`);
    for(const e of d.connections){
      const a=center(d.rooms[e.from]),b=center(d.rooms[e.to]),points=[a,...e.cells,b].map(p=>`${p.x+.5},${p.y+.5}`).join(' ');
      parts.push(`<polyline points="${points}" fill="none" stroke="${e.kind==='loop'?'#b66c4e':'#57735c'}" stroke-width=".15" ${e.kind==='loop'?'stroke-dasharray=".3 .2"':''}/>`);
    }
  }else{
    const paths:string[]=[];
    for(const {a,b} of segments){
      const length=Math.hypot(a.x-b.x,a.y-b.y);
      const jitter=ink?Math.min(.045,length*.01):0, midX=(a.x+b.x)/2+(rng()-.5)*jitter,midY=(a.y+b.y)/2+(rng()-.5)*jitter;
      paths.push(`M${a.x} ${a.y}Q${f(midX)} ${f(midY)} ${b.x} ${b.y}`);
    }
    parts.push(`<path d="${paths.join('')}" fill="none" stroke="#373b32" stroke-width="${ink?'.17':'.12'}" stroke-linejoin="round" stroke-linecap="round"/>`);
    if(ink)parts.push(`<path d="${paths.join('')}" transform="translate(.055 .035)" fill="none" stroke="#373b32" stroke-width=".035" opacity=".45"/>`);
    for(const door of d.doors){
      const vertical=door.direction===1||door.direction===3;
      parts.push(`<rect x="${f(door.x-(vertical?.115:.38))}" y="${f(door.y-(vertical?.38:.115))}" width="${vertical?.23:.76}" height="${vertical?.76:.23}" fill="${paper}" stroke="#4f5144" stroke-width=".075"/>`);
    }
    if(ink)for(const r of d.rooms){
      if(r.w>=7&&r.h>=7&&rng()<.45)for(const p of [{x:r.x+1.4,y:r.y+1.4},{x:r.x+r.w-1.4,y:r.y+1.4},{x:r.x+1.4,y:r.y+r.h-1.4},{x:r.x+r.w-1.4,y:r.y+r.h-1.4}]){
        parts.push(`<circle cx="${p.x}" cy="${p.y}" r=".22" fill="#d2c9b5" stroke="#737163" stroke-width=".055"/>`);
      }
    }
  }
  if(settings.route){
    parts.push(`<polyline points="${d.route.map(p=>`${p.x+.5},${p.y+.5}`).join(' ')}" fill="none" stroke="#b2684e" stroke-width=".19" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>`);
  }
  for(const r of d.rooms){
    const c=center(r),special=r.id===0||r.id===d.exitRoom;
    parts.push(`<circle cx="${c.x+.5}" cy="${c.y+.5}" r="${graph?.64:.6}" fill="${special?'#e7ded0':floor}" ${special?'stroke="#ab7657" stroke-width=".065"':''}/>
<text x="${c.x+.5}" y="${c.y+.75}" text-anchor="middle" font-family="Georgia,serif" font-size=".8" fill="${special?'#8f5038':'#4d5045'}">${String(r.id+1).padStart(2,'0')}</text>`);
  }
  parts.push(`</g>
<g font-family="Arial,sans-serif" font-size="11" fill="#766f60">
<circle cx="72" cy="689" r="5" fill="#e7ded0" stroke="#ab7657"/><text x="86" y="693">01 Entrance</text>
<circle cx="191" cy="689" r="5" fill="#e7ded0" stroke="#ab7657"/><text x="205" y="693">${String(d.exitRoom+1).padStart(2,'0')} Exit</text>
<text x="930" y="693" text-anchor="end">SEED ${escapeXml(d.parameters.seed.length>30?d.parameters.seed.slice(0,27)+'…':d.parameters.seed)}</text>
</g></svg>`);
  return parts.join('\n');
}
