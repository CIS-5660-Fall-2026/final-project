import { Camera } from "./camera";
import { Lights } from "./lights";
import { Volumetrics } from "./volumetrics";
import { Scene } from "./scene";

export class Stage {
    scene: Scene;
    lights: Lights;
    volumetrics: Volumetrics;
    camera: Camera;
    stats: Stats;

    constructor(scene: Scene, lights: Lights, volumetrics: Volumetrics, camera: Camera, stats: Stats) {
        this.scene = scene;
        this.lights = lights;
        this.volumetrics = volumetrics;
        this.camera = camera;
        this.stats = stats;
    }
}
