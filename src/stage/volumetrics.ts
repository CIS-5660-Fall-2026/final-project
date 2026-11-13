import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

class VolumeUniforms {
    static readonly bufferBytes = 16 * Float32Array.BYTES_PER_ELEMENT;
    readonly buffer = new ArrayBuffer(VolumeUniforms.bufferBytes);
    private readonly floatView = new Float32Array(this.buffer);
    private readonly uintView = new Uint32Array(this.buffer);

    set volumeNearZ(nearZ: number) {
        this.floatView.set(new Float32Array([nearZ]), 0);
    }

    set volumeFarZ(farZ: number) {
        this.floatView.set(new Float32Array([farZ]), 1);
    }

    set distributionExponent(distrib: number) {
        this.floatView.set(new Float32Array([distrib]), 2);
    }

    set scattering(scattering: number) {
        this.floatView.set(new Float32Array([scattering]), 3);
    }

    set ambientLightColor(ambient: Float32Array) {
        this.floatView.set(ambient, 4);
    }

    set absorption(absorption: number) {
        this.floatView.set(new Float32Array([absorption]), 7);
    }

    set noiseFreq(noiseFreq: number) {
        this.floatView.set(new Float32Array([noiseFreq]), 8);
    }

    set octaveCount(octaveCount: number) {
        this.uintView.set(new Uint32Array([octaveCount]), 9);
    }

    set densityScale(densityScale: number) {
        this.floatView.set(new Float32Array([densityScale]), 10);
    }

    set fogBaseHeight(baseHeight: number) {
        this.floatView.set(new Float32Array([baseHeight]), 11);
    }

    set fogHeightFalloff(heightFalloff: number) {
        this.floatView.set(new Float32Array([heightFalloff]), 12);
    }
}

export class Volumetrics {
    private camera: Camera;

    uniforms: VolumeUniforms = new VolumeUniforms();
    uniformsBuffer: GPUBuffer;

    // A 3D texture used to store a volume's scattering and extinction
    // coefficients. One texel represents the data for one froxel.
    scatteringExtinctionBuffer: GPUTexture;
    scatteringExtinctionBufferView: GPUTextureView;

    lightingBuffer: GPUTexture;
    lightingBufferView: GPUTextureView;

    integrationBuffer: GPUTexture;
    public integrationBufferView: GPUTextureView;

    // The texture sampler we'll use to sample our volume buffers
    // during the integration/composition pass
    volumeSampler: GPUSampler;

    voxelizationComputeBindGroupLayout: GPUBindGroupLayout;
    voxelizationComputeBindGroup: GPUBindGroup;
    voxelizationComputePipeline: GPUComputePipeline;

    lightingComputeBindGroupLayout: GPUBindGroupLayout;
    lightingComputeBindGroup: GPUBindGroup;
    lightingComputePipeline: GPUComputePipeline;

    integrationComputeBindGroupLayout: GPUBindGroupLayout;
    integrationComputeBindGroup: GPUBindGroup;
    integrationComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

        this.uniformsBuffer = device.createBuffer({
            label: "volumetricsUniforms",
            size: this.uniforms.buffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.scatteringExtinctionBuffer = device.createTexture({
            label: "scatteringExtinctionBuffer",
            dimension: "3d",
            size: [shaders.constants.froxelGridDimX,
                shaders.constants.froxelGridDimY,
                shaders.constants.froxelGridDimZ],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        this.scatteringExtinctionBufferView = this.scatteringExtinctionBuffer.createView();

        this.lightingBuffer = device.createTexture({
            label: "lightingBuffer",
            dimension: "3d",
            size: [shaders.constants.froxelGridDimX,
            shaders.constants.froxelGridDimY,
            shaders.constants.froxelGridDimZ],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        this.lightingBufferView = this.lightingBuffer.createView();

        this.integrationBuffer = device.createTexture({
            label: "integrationBuffer",
            dimension: "3d",
            size: [shaders.constants.froxelGridDimX,
            shaders.constants.froxelGridDimY,
            shaders.constants.froxelGridDimZ],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        this.integrationBufferView = this.integrationBuffer.createView();

        this.volumeSampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge"
        });
    }
}
