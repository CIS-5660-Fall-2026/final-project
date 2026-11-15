import * as THREE from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {Engine} from './engine'

const SNAKE_SEGMENTS = 14;
const SEGMENT_SPACING = 0.55;
const engine = new Engine();
engine.start();

/** Concave 5-point star, counter-clockwise, as [x, y] pairs. */
function starPoints(tips: number, outer: number, inner: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < tips * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / tips;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Head eases toward the target; every other segment stays `spacing` behind the one in front. */
function followChain(segs: THREE.Object3D[], target: THREE.Vector3, spacing: number, dt: number) {
  const head = segs[0].position;
  const k = 1 - Math.exp(-8 * dt);
  head.x += (target.x - head.x) * k;
  head.y += (target.y - head.y) * k;

  for (let i = 1; i < segs.length; i++) {
    const p = segs[i].position, q = segs[i - 1].position;
    const dx = p.x - q.x, dy = p.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d > spacing) {
      p.x = q.x + (dx / d) * spacing;
      p.y = q.y + (dy / d) * spacing;
    }
  }
}



// Flat color needs no shader: MeshBasicMaterial
const flat = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({color});

// Background
const bg = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), flat(0x262b33));
engine.scene.add(bg);

// Closed polygon: filled star + thick outline sharing the same points
const star = starPoints(5, 2, 0.85);

// Shape triangulates for you (and accepts holes via shape.holes)
const starFill = new THREE.Mesh(
  new THREE.ShapeGeometry(new THREE.Shape(star.map(([x, y]) => new THREE.Vector2(x, y)))),
  flat(0xf2991f));
starFill.position.set(-4, 2, 0.1);
engine.scene.add(starFill);

const lineMat = new LineMaterial({color: 0xffffff, linewidth: 0.12, worldUnits: true});
const outlineGeo = new LineGeometry();
outlineGeo.setPositions([...star, star[0]].flatMap(([x, y]) => [x, y, 0])); // repeat first point to close
const starStroke = new Line2(outlineGeo, lineMat);
starStroke.position.set(-4, 2, 0.2);
engine.scene.add(starStroke);

// Thick line
const lineGeo = new LineGeometry();
lineGeo.setPositions([2, 3, 0.15, 6, 1, 0.15]);
engine.scene.add(new Line2(lineGeo, new LineMaterial({color: 0xccddff, linewidth: 0.08, worldUnits: true})));

// Snake: a chain of circles that follows the mouse (one shared geometry)
const circleGeo = new THREE.CircleGeometry(1, 32);
const snake: THREE.Mesh[] = [];
for (let i = 0; i < SNAKE_SEGMENTS; i++) {
  const f = i / (SNAKE_SEGMENTS - 1);
  const r = 0.5 * (1 - 0.6 * f);
  const seg = new THREE.Mesh(circleGeo, flat(new THREE.Color(0.2 + 0.6 * f, 0.9 - 0.5 * f, 0.3)));
  seg.scale.set(r, r, 1);
  seg.position.set(0, 0, 0.3 - i * 0.01); // head drawn on top
  engine.scene.add(seg);
  snake.push(seg);
}


function snakeTick(dt : number){
followChain(snake, engine.mouse, SEGMENT_SPACING, dt);
}
engine.onUpdate(snakeTick);