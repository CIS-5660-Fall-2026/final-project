import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDungeon, normalizeParameters } from '../src/generator.ts';
import { validateDungeon } from '../src/validation.ts';
import { boundarySegments } from '../src/geometry.ts';
import { poisson } from '../src/hatching.ts';
import { random } from '../src/random.ts';
import { renderDungeon } from '../src/renderer.ts';
import { DEFAULT_DRAWING, DEFAULT_PARAMETERS } from '../src/types.ts';
import { key, roomCells } from '../src/grid.ts';

test('100 seeds across three presets: connected geometry, graph, route and deterministic output',()=>{
  const presets=[{rooms:8,symmetry:0,loops:0},{rooms:16,symmetry:.65,loops:.5},{rooms:24,symmetry:1,loops:1}];
  let loops=0,shortfalls=0;
  for(const preset of presets)for(let i=0;i<100;i++){
    const p={...preset,seed:'validation-'+i},d=generateDungeon(p),result=validateDungeon(d);
    assert.equal(result.valid,true,JSON.stringify({p,errors:result.errors}));
    assert.equal(result.components,1);assert.equal(result.reachableRooms,d.rooms.length);
    assert.deepEqual(generateDungeon(p),d,'same input must reproduce the complete layout');
    assert.ok(d.attempts<=1600);assert.ok(d.rooms.length<=p.rooms);
    if(d.rooms.length<p.rooms)shortfalls++;
    loops+=result.loops;
    // Independently check that no two rooms share a cell.
    const all=d.rooms.flatMap(roomCells).map(key);
    assert.equal(new Set(all).size,all.length);
    if(p.loops===0)assert.equal(d.connections.length,d.rooms.length-1);
    assert.equal(d.connections.filter(e=>e.kind==='tree').length,d.rooms.length-1);
  }
  assert.ok(loops>0,'loop insertion should actually create cycles');
  console.log(JSON.stringify({layouts:300,shortfalls,additionalPassages:loops}));
});
test('loop and drawing controls preserve base room geometry',()=>{
  const a=generateDungeon({...DEFAULT_PARAMETERS,loops:0}),b=generateDungeon({...DEFAULT_PARAMETERS,loops:1});
  assert.deepEqual(a.rooms,b.rooms);
  const before=JSON.stringify(b);
  const ink=renderDungeon(b,DEFAULT_DRAWING);
  const bare=renderDungeon(b,{...DEFAULT_DRAWING,hatch:0,view:'geometry'});
  assert.equal(JSON.stringify(b),before);
  assert.equal(renderDungeon(b,DEFAULT_DRAWING),ink);
  assert.notEqual(ink,bare);
  assert.ok(ink.includes('mask="url(#exterior)"'));
});
test('validator catches damaged geometry and disconnected graph',()=>{
  const broken=generateDungeon(DEFAULT_PARAMETERS);
  broken.floor=broken.floor.filter(p=>key(p)!==key(broken.entrance));
  assert.equal(validateDungeon(broken).valid,false);
  const disconnected=generateDungeon(DEFAULT_PARAMETERS);disconnected.connections=[];
  assert.ok(validateDungeon(disconnected).errors.includes('Disconnected room graph'));
  const overlap=generateDungeon(DEFAULT_PARAMETERS);overlap.rooms[1]={...overlap.rooms[0],id:1};
  assert.ok(validateDungeon(overlap).errors.includes('Overlapping room interiors'));
});
test('shared floor edges disappear and exterior collinear edges merge',()=>{
  const segments=boundarySegments([{x:0,y:0},{x:1,y:0}]);
  assert.equal(segments.length,4);
  assert.equal(segments.reduce((n,s)=>n+Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y),0),6);
});
test('Poisson samples stay in bounds and respect minimum separation',()=>{
  const points=poisson(15,12,.9,random('sampler-check'));
  assert.ok(points.length>50);
  for(let i=0;i<points.length;i++){
    assert.ok(points[i].x>=0&&points[i].x<15&&points[i].y>=0&&points[i].y<12);
    for(let j=0;j<i;j++)assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=.9-1e-10);
  }
});
test('bounded parameter normalization and escaped SVG metadata',()=>{
  const p=normalizeParameters({seed:'',rooms:Infinity,symmetry:-5,loops:9});
  assert.equal(p.rooms,18);assert.equal(p.symmetry,0);assert.equal(p.loops,1);
  const d=generateDungeon({...DEFAULT_PARAMETERS,seed:'<script>alert("x")</script>'});
  const svg=renderDungeon(d,{...DEFAULT_DRAWING,hatch:0});
  assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));
  // SVG downloads are parsed as XML, unlike inline SVG inserted into HTML.
  assert.doesNotMatch(svg,/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/);
});
