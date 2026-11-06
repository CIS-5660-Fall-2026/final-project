import GUI from 'lil-gui';
import { checkShader, initWebGPU, showError } from './gpu';
import { defaultParams, hollandFromPhysics, hollandV, packUniforms, UNIFORM_FLOATS, type Params } from './params';
import { heightfieldWGSL, renderWGSL } from './shaders/shaders';

async function main() {
    const { canvas, device, context, format } = await initWebGPU();
    const params = defaultParams();

    // Optional URL override for the height-field resolution, e.g. ?res=512 on slow GPUs.
    const resParam = Number(new URLSearchParams(location.search).get('res'));
    if ([256, 512, 1024, 2048].includes(resParam)) params.texSize = resParam;

    // ------------------------------------------------------------ pipelines

    const computeModule = device.createShaderModule({ label: 'heightfield', code: heightfieldWGSL });
    const renderModule = device.createShaderModule({ label: 'render', code: renderWGSL });
    const [computeOk, renderOk] = await Promise.all([
        checkShader(computeModule, 'heightfield.cs.wgsl'),
        checkShader(renderModule, 'render.wgsl'),
    ]);
    if (!computeOk || !renderOk) {
        showError('Shader compilation failed', 'See the browser console for the WGSL errors.');
        return;
    }

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

    let heightTex: GPUTexture | null = null;
    let computeBindGroup: GPUBindGroup;
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
        computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: view },
            ],
        });
        renderBindGroup = device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: view },
                { binding: 2, resource: sampler },
            ],
        });
    }
    createHeightResources(params.texSize);

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
    applyPhysics();

    const structure = gui.addFolder('Structure');
    structure.add(params, 'bandCount', 1, 6, 1).name('Rainbands').onChange(markDirty);
    structure.add(params, 'bandPitchDeg', 8, 35, 0.5).name('Spiral pitch (°)').onChange(markDirty);
    structure.add(params, 'bandStrength', 0, 1.5, 0.01).name('Band strength').onChange(markDirty);
    structure.add(params, 'cdoRadiusKm', 60, 450, 1).name('Dense overcast (km)').onChange(markDirty);

    const detail = gui.addFolder('Detail');
    detail.add(params, 'detailScaleKm', 5, 60, 0.5).name('Scale (km)').onChange(markDirty);
    detail.add(params, 'detailStrength', 0, 4, 0.05).name('Strength (km)').onChange(markDirty);
    detail.add(params, 'flowPeriodMin', 5, 120, 1).name('Streakiness (min)').onChange(markDirty);
    detail.add(params, 'seed', 0, 100, 1).name('Seed').onChange(markDirty);

    const lighting = gui.addFolder('Lighting & view');
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

    if (window.innerWidth < 700) gui.close();

    // ------------------------------------------------------------ frame loop

    const hud = document.getElementById('hud') as HTMLDivElement;
    let stormTime = 0;
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
            `${fps.toFixed(0)} fps`;
    }

    function frame(now: number) {
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        fps = fps === 0 ? 1 / Math.max(dt, 1e-3) : fps * 0.95 + 0.05 / Math.max(dt, 1e-3);
        if (!params.paused) stormTime += dt * params.timeScale;

        if (resizeCanvas()) dirty = true;
        const recompute = !params.paused || dirty;

        if (recompute && !gpuBusy) {
            packUniforms(uniformData, params, stormTime, canvas.width / canvas.height);
            device.queue.writeBuffer(uniformBuffer, 0, uniformData);

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass({ label: 'heightfield' });
            pass.setPipeline(computePipeline);
            pass.setBindGroup(0, computeBindGroup);
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
