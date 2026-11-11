import GUI from 'lil-gui';
import { checkShader, initWebGPU, showError } from './gpu';
import {
    defaultParams, hollandFromPhysics, hollandV, packUniforms, SIM_DT, SIM_SIZE, UNIFORM_FLOATS, type Params,
} from './params';
import { advectWGSL, heightfieldWGSL, renderWGSL } from './shaders/shaders';

// Storm hours simulated quickly after a reset, so the cloud shield has time to spread out.
const WARMUP_HOURS = 60;
// Simulation ticks per frame: the most allowed in normal running, and the rate during spin-up.
const MAX_STEPS_PER_FRAME = 8;
const WARMUP_STEPS_PER_FRAME = 96;

async function main() {
    const { canvas, device, context, format } = await initWebGPU();
    const params = defaultParams();

    // Optional URL overrides for any numeric setting, e.g. ?texSize=512 on slow GPUs or
    // ?viewMode=1&viewHalfKm=300 to link straight to a particular view.
    const numeric = params as unknown as Record<string, unknown>;
    for (const [key, value] of new URLSearchParams(location.search)) {
        const n = Number(value);
        if (typeof numeric[key] === 'number' && value !== '' && Number.isFinite(n)) numeric[key] = n;
    }
    if (![256, 512, 1024, 2048].includes(params.texSize)) params.texSize = 1024;

    // ------------------------------------------------------------ pipelines

    const advectModule = device.createShaderModule({ label: 'advect', code: advectWGSL });
    const computeModule = device.createShaderModule({ label: 'heightfield', code: heightfieldWGSL });
    const renderModule = device.createShaderModule({ label: 'render', code: renderWGSL });
    const [advectOk, computeOk, renderOk] = await Promise.all([
        checkShader(advectModule, 'advect.cs.wgsl'),
        checkShader(computeModule, 'heightfield.cs.wgsl'),
        checkShader(renderModule, 'render.wgsl'),
    ]);
    if (!advectOk || !computeOk || !renderOk) {
        showError('Shader compilation failed', 'See the browser console for the WGSL errors.');
        return;
    }

    const advectPipeline = device.createComputePipeline({
        label: 'advect',
        layout: 'auto',
        compute: { module: advectModule, entryPoint: 'main' },
    });
    const computePipeline = device.createComputePipeline({
        label: 'heightfield',
        layout: 'auto',
        compute: { module: computeModule, entryPoint: 'main' },
    });
    const renderPipeline = device.createRenderPipeline({
        label: 'render',
        layout: 'auto',
        vertex: { module: renderModule, entryPoint: 'vs' },
        fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
    });

    const uniformData = new Float32Array(UNIFORM_FLOATS);
    const uniformBuffer = device.createBuffer({
        label: 'params',
        size: uniformData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });

    // Coarse cloud field: two textures, swapped after every simulation tick.
    let simTex: GPUTexture[] = [];
    let advectBindGroups: GPUBindGroup[] = [];
    let simFront = 0;       // index of the texture holding the latest state
    let warmupSteps = 0;    // ticks still to run before the storm counts as spun up

    let heightTex: GPUTexture | null = null;
    let composeBindGroups: GPUBindGroup[] = [];
    let renderBindGroup: GPUBindGroup;

    function createHeightResources(size: number) {
        heightTex?.destroy();
        heightTex = device.createTexture({
            label: 'cloud-top height',
            size: [size, size],
            format: 'rgba16float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });
        const view = heightTex.createView();
        composeBindGroups = simTex.map((tex) => device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: sampler },
                { binding: 3, resource: view },
            ],
        }));
        renderBindGroup = device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: view },
                { binding: 2, resource: sampler },
            ],
        });
    }

    // Starts the simulation from a clear sky (new textures are zero-filled) and spins it up.
    function resetSimulation() {
        simTex.forEach((tex) => tex.destroy());
        simTex = [0, 1].map((i) => device.createTexture({
            label: `coarse cloud field ${i}`,
            size: [SIM_SIZE, SIM_SIZE],
            format: 'rgba16float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        }));
        advectBindGroups = [0, 1].map((i) => device.createBindGroup({
            layout: advectPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: simTex[i].createView() },
                { binding: 2, resource: sampler },
                { binding: 3, resource: simTex[1 - i].createView() },
            ],
        }));
        simFront = 0;
        warmupSteps = Math.round(WARMUP_HOURS * 3600 / SIM_DT);
        createHeightResources(params.texSize);
    }
    resetSimulation();

    // ------------------------------------------------------------ control panel

    let dirty = true;
    const markDirty = () => { dirty = true; };
    const gui = new GUI({ title: 'TyphoonMaster' });

    const storm = gui.addFolder('Storm');
    storm.add(params, 'deltaPhPa', 5, 110, 1).name('Pressure drop (hPa)').onChange(() => applyPhysics());
    storm.add(params, 'latitudeDeg', -40, 40, 0.5).name('Latitude (°)').onChange(() => applyPhysics());
    storm.add(params, 'autoFromPhysics').name('Rmax, B from physics').onChange(() => applyPhysics());
    const rmaxCtl = storm.add(params, 'rmaxKm', 8, 80, 0.5).name('Rmax (km)').onChange(markDirty);
    const bCtl = storm.add(params, 'hollandB', 0.5, 2.5, 0.01).name('Holland B').onChange(markDirty);
    function applyPhysics() {
        if (params.autoFromPhysics) {
            const fit = hollandFromPhysics(params.deltaPhPa, params.latitudeDeg);
            params.rmaxKm = Math.round(fit.rmaxKm * 10) / 10;
            params.hollandB = Math.round(fit.hollandB * 100) / 100;
            rmaxCtl.updateDisplay();
            bCtl.updateDisplay();
        }
        rmaxCtl.enable(!params.autoFromPhysics);
        bCtl.enable(!params.autoFromPhysics);
        dirty = true;
    }
    storm.add(params, 'eyeRatio', 0.2, 0.9, 0.01).name('Eye radius / Rmax').onChange(markDirty);
    storm.add(params, 'outflowTurn', 0, 1, 0.01).name('Outflow turning').onChange(markDirty);
    storm.add(params, 'outflowSpeed', 0, 20, 0.1).name('Outflow speed (m/s)').onChange(markDirty);
    applyPhysics();

    const structure = gui.addFolder('Structure');
    structure.add(params, 'bandCount', 1, 6, 1).name('Rainbands').onChange(markDirty);
    structure.add(params, 'bandPitchDeg', 8, 35, 0.5).name('Spiral pitch (°)').onChange(markDirty);
    structure.add(params, 'bandStrength', 0, 1.5, 0.01).name('Band strength').onChange(markDirty);
    structure.add(params, 'cdoRadiusKm', 150, 700, 5).name('Cloud shield radius (km)').onChange(markDirty);
    structure.add(params, 'cloudLifeH', 5, 120, 1).name('Cloud lifetime (h)').onChange(markDirty);

    const detail = gui.addFolder('Detail');
    detail.add(params, 'detailScaleKm', 4, 60, 0.5).name('Streak width (km)').onChange(markDirty);
    detail.add(params, 'detailStrength', 0, 4, 0.05).name('Strength (km)').onChange(markDirty);
    detail.add(params, 'streak', 1, 12, 0.1).name('Streakiness (length/width)').onChange(markDirty);
    detail.add(params, 'terrace', 0, 1, 0.01).name('Terracing').onChange(markDirty);
    detail.add(params, 'seed', 0, 100, 1).name('Seed').onChange(markDirty);

    const lighting = gui.addFolder('Lighting & view');
    lighting.add(params, 'viewMode', { 'Clouds': 0, 'Wind field (debug)': 1 }).name('View').onChange(markDirty);
    lighting.add(params, 'sunElevDeg', 2, 89, 0.5).name('Sun elevation (°)').onChange(markDirty);
    lighting.add(params, 'sunAzimDeg', 0, 360, 1).name('Sun azimuth (°)').onChange(markDirty);
    lighting.add(params, 'exaggeration', 0.5, 20, 0.1).name('Relief exaggeration').onChange(markDirty);
    lighting.add(params, 'reliefMix', 0, 1, 0.01).name('Relief mix').onChange(markDirty);
    lighting.add(params, 'shadows').name('Shadows').onChange(markDirty);
    lighting.add(params, 'viewHalfKm', 100, 800, 5).name('View half-width (km)').onChange(markDirty);

    const sim = gui.addFolder('Simulation');
    sim.add(params, 'timeScale', 0, 14400, 60).name('Time scale (×)');
    sim.add(params, 'paused').name('Paused');
    sim.add(params, 'texSize', { '256²': 256, '512²': 512, '1024²': 1024, '2048²': 2048 }).name('Resolution')
        .onChange((size: number) => { createHeightResources(size); dirty = true; });
    sim.add({ reset: () => { resetSimulation(); dirty = true; } }, 'reset').name('Restart from clear sky');

    if (window.innerWidth < 700) gui.close();

    // ------------------------------------------------------------ frame loop

    const hud = document.getElementById('hud') as HTMLDivElement;
    let stormTime = 0;
    let simTime = 0;        // storm time the coarse simulation has reached
    let last = performance.now();
    let fps = 0;
    let hudTimer = 0;
    // Never queue a new frame while the GPU is still busy with the last one; on slow GPUs this
    // drops frames instead of piling up latency.
    let gpuBusy = false;

    function resizeCanvas(): boolean {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width === w && canvas.height === h) return false;
        canvas.width = w;
        canvas.height = h;
        return true;
    }

    function updateHud(p: Params) {
        const total = Math.floor(stormTime / 60);
        const day = Math.floor(total / 1440);
        const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
        const mm = String(total % 60).padStart(2, '0');
        const vmax = hollandV(p, p.rmaxKm);
        hud.textContent =
            `storm time  day ${day} ${hh}:${mm}\n` +
            `Vmax ${vmax.toFixed(0)} m/s   Δp ${p.deltaPhPa} hPa   Rmax ${p.rmaxKm.toFixed(0)} km\n` +
            `${fps.toFixed(0)} fps` + (warmupSteps > 0 ? '   spinning up…' : '');
    }

    function frame(now: number) {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        fps = fps === 0 ? 1 / Math.max(dt, 1e-3) : fps * 0.95 + 0.05 / Math.max(dt, 1e-3);
        if (!params.paused) stormTime += dt * params.timeScale;

        if (resizeCanvas()) dirty = true;

        // Fixed-tick simulation: run as many ticks as storm time has advanced, plus spin-up ticks.
        let steps = 0;
        if (!gpuBusy) {
            if (warmupSteps > 0) {
                steps = Math.min(warmupSteps, WARMUP_STEPS_PER_FRAME);
                warmupSteps -= steps;
                simTime = stormTime - steps * SIM_DT;
            } else {
                steps = Math.min(Math.floor((stormTime - simTime) / SIM_DT), MAX_STEPS_PER_FRAME);
                // If the simulation cannot keep up, drop the backlog instead of falling further behind.
                if (stormTime - simTime > 4 * MAX_STEPS_PER_FRAME * SIM_DT) simTime = stormTime - steps * SIM_DT;
            }
        }
        const recompute = !params.paused || dirty || steps > 0;

        if (recompute && !gpuBusy) {
            const aspect = canvas.width / canvas.height;
            const groupsSim = Math.ceil(SIM_SIZE / 8);
            for (let i = 0; i < steps; i++) {
                // Each tick needs its own time in the uniforms, so each is submitted separately.
                simTime += SIM_DT;
                packUniforms(uniformData, params, simTime, aspect);
                device.queue.writeBuffer(uniformBuffer, 0, uniformData);
                const enc = device.createCommandEncoder();
                const apass = enc.beginComputePass({ label: 'advect' });
                apass.setPipeline(advectPipeline);
                apass.setBindGroup(0, advectBindGroups[simFront]);
                apass.dispatchWorkgroups(groupsSim, groupsSim);
                apass.end();
                device.queue.submit([enc.finish()]);
                simFront = 1 - simFront;
            }

            packUniforms(uniformData, params, stormTime, aspect);
            device.queue.writeBuffer(uniformBuffer, 0, uniformData);

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass({ label: 'heightfield' });
            pass.setPipeline(computePipeline);
            pass.setBindGroup(0, composeBindGroups[simFront]);
            const groups = Math.ceil(params.texSize / 8);
            pass.dispatchWorkgroups(groups, groups);
            pass.end();
            const rpass = encoder.beginRenderPass({
                label: 'render',
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                }],
            });
            rpass.setPipeline(renderPipeline);
            rpass.setBindGroup(0, renderBindGroup);
            rpass.draw(3);
            rpass.end();
            device.queue.submit([encoder.finish()]);
            dirty = false;
            gpuBusy = true;
            device.queue.onSubmittedWorkDone()
                .then(() => { gpuBusy = false; })
                .catch((err) => console.error('GPU work failed:', err));
        }

        hudTimer += dt;
        if (hudTimer > 0.25) {
            hudTimer = 0;
            updateHud(params);
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

main().catch((err) => console.error(err));
