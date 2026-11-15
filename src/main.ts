import * as THREE from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {Engine} from './engine';
import {Snake} from './object';
import RAPIER from '@dimforge/rapier2d-compat';

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

let s = new Snake();
