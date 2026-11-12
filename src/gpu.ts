export interface GPUContextBundle {
    canvas: HTMLCanvasElement;
    device: GPUDevice;
    context: GPUCanvasContext;
    format: GPUTextureFormat;
}

export function showError(title: string, detail: string): void {
    const box = document.createElement('div');
    box.className = 'error-message';
    const h = document.createElement('h1');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = detail;
    box.append(h, p);
    document.body.innerHTML = '';
    document.body.style.overflow = 'auto';
    document.body.appendChild(box);
}

export async function initWebGPU(): Promise<GPUContextBundle> {
    const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;

    if (!navigator.gpu) {
        showError('WebGPU is not available',
            'This page needs a browser with WebGPU enabled, such as a recent Chrome or Edge on desktop.');
        throw new Error('WebGPU not supported in this browser');
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
        showError('No WebGPU adapter found',
            'The browser supports WebGPU but could not find a usable GPU. Check that hardware acceleration is enabled.');
        throw new Error('No appropriate GPUAdapter found');
    }

    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (e) => {
        console.error('WebGPU error:', (e as GPUUncapturedErrorEvent).error.message);
    });
    device.lost.then((info) => console.error(`WebGPU device lost (${info.reason}): ${info.message}`));

    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    return { canvas, device, context, format };
}

// Logs WGSL compile errors with line numbers; resolves false if the module failed to compile.
export async function checkShader(module: GPUShaderModule, name: string): Promise<boolean> {
    const info = await module.getCompilationInfo();
    let ok = true;
    for (const m of info.messages) {
        const line = `${name}:${m.lineNum}:${m.linePos} ${m.type}: ${m.message}`;
        if (m.type === 'error') {
            ok = false;
            console.error(line);
        } else {
            console.warn(line);
        }
    }
    return ok;
}
