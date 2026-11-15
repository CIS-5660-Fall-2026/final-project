import * as THREE from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {Engine} from './engine';
import RAPIER from '@dimforge/rapier2d-compat';



const flat = (color: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({color});

export class Snake{
    private snake : THREE.Mesh[] = [];
    constructor(private segments : number = 14,
        private spacing : number = 0.55,
    ){
        this.generateGraphics();    
        Engine.engine.onUpdate(this.update);
    }

    destroy(){
        Engine.engine.offUpdate(this.update);
    }

    generateGraphics(){
        const circleGeo = new THREE.CircleGeometry(1, 32);
        for (let i = 0; i < this.segments; i++) {
            const f = i / (this.segments - 1);
            const r = 0.5 * (1 - 0.6 * f);
            const seg = new THREE.Mesh(circleGeo, flat(new THREE.Color(0.2 + 0.6 * f, 0.9 - 0.5 * f, 0.3)));
            seg.scale.set(r, r, 1);
            seg.position.set(0, 0, 0.3 - i * 0.01); // head drawn on top
            this.snake.push(seg);
        }

        for (let i = 0; i < this.segments; i++){  
            Engine.engine.scene.add(this.snake[i]);
        }
    }

    followChain(target: THREE.Vector3, dt: number, speed : number = 8) {
        const head = this.snake[0].position;
        const k = 1 - Math.exp(-speed * dt);
        head.x += (target.x - head.x) * k;
        head.y += (target.y - head.y) * k;
        if(speed < 0){
            head.x = target.x;
            head.y = target.y;
        }

        for (let i = 1; i < this.snake.length; i++) {
            const p = this.snake[i].position, q = this.snake[i - 1].position;
            const dx = p.x - q.x, dy = p.y - q.y;
            const d = Math.hypot(dx, dy);
            if (d > this.spacing) {
                p.x = q.x + (dx / d) * this.spacing;
                p.y = q.y + (dy / d) * this.spacing;
            }
        }
    }

    private update = (dt: number) => {
        this.followChain(Engine.engine.mouse, dt,0);
    };
}