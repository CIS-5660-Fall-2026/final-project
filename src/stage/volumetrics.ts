import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";
import { Lights } from "./lights";

class VolumeUniforms {
    static readonly bufferBytes = 12 * Float32Array.BYTES_PER_ELEMENT;
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

    set phaseG(g: number) {
        this.floatView.set(new Float32Array([g]), 11);
    }
}

export class Volumetrics {
    private camera: Camera;
    private lights: Lights;

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

    constructor(camera: Camera, lights: Lights) {
        this.camera = camera;
        this.lights = lights;

        // Create all the buffers/textures we need
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

        // Create the bind group, bind group layout, and pipeline for
        // our voxelization compute pass
        this.voxelizationComputeBindGroupLayout = device.createBindGroupLayout({
            label: "voxelization compute bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // volumeUniforms
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // scatteringExtinctionBuffer
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "3d" }
                }
            ]
        });

        this.voxelizationComputeBindGroup = device.createBindGroup({
            label: "voxelization compute bind group",
            layout: this.voxelizationComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.uniformsBuffer }
                },
                {
                    binding: 2,
                    resource: this.scatteringExtinctionBufferView
                }
            ]
        });

        this.voxelizationComputePipeline = device.createComputePipeline({
            label: "voxelization compute pipeline",
            layout: device.createPipelineLayout({
                label: "voxelization compute pipeline layout",
                bindGroupLayouts: [this.voxelizationComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "voxelization compute shader",
                    code: shaders.volumetricVoxelizationComputeSrc
                }),
                entryPoint: "populateParticipatingMediaProperties"
            }
        });

        // Create the bind group, bind group layout, and pipeline for
        // our volumetric lighting compute pass
        this.lightingComputeBindGroupLayout = device.createBindGroupLayout({
            label: "volumetric lighting compute bind group layout",
            entries: [
                { // volumeUniforms
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // scatteringExtinctionBuffer
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "float", viewDimension: "3d" }
                },
                { // lightingBuffer
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "3d" }
                },
                { // camera
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.lightingComputeBindGroup = device.createBindGroup({
            label: "volumetric lighting compute bind group",
            layout: this.lightingComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: this.scatteringExtinctionBufferView
                },
                {
                    binding: 2,
                    resource: this.lightingBufferView
                },
                {
                    binding: 3,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 5,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });

        this.lightingComputePipeline = device.createComputePipeline({
            label: "volumetric lighting compute pipeline",
            layout: device.createPipelineLayout({
                label: "volumetric lighting compute pipeline layout",
                bindGroupLayouts: [this.lightingComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "volumetric lighting compute shader",
                    code: shaders.volumetricLightingComputeSrc
                }),
                entryPoint: "computeScatteredLight"
            }
        });

        // Create the bind group, bind group layout, and pipeline for
        // our integration compute pass
        this.integrationComputeBindGroupLayout = device.createBindGroupLayout({
            label: "integration compute bind group layout",
            entries: [
                { // volumeUniforms
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightingVolume
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "float", viewDimension: "3d" }
                },
                { // integrationBuffer
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "3d" }
                }
            ]
        });

        this.integrationComputeBindGroup = device.createBindGroup({
            label: "integration compute bind group",
            layout: this.integrationComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: this.lightingBufferView
                },
                {
                    binding: 2,
                    resource: this.integrationBufferView
                }
            ]
        });

        this.integrationComputePipeline = device.createComputePipeline({
            label: "integration compute pipeline",
            layout: device.createPipelineLayout({
                label: "integration compute pipeline layout",
                bindGroupLayouts: [this.integrationComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "integration compute shader",
                    code: shaders.volumetricIntegrationComputeSrc
                }),
                entryPoint: "integrateVolume"
            }
        });

        // Set our volume uniform values and write them to the GPU
        // NCHORTEK TODO: These can potentially be tied to GUI sliders
        this.uniforms.volumeNearZ = 0.5;
        this.uniforms.volumeFarZ = 40.0;
        this.uniforms.distributionExponent = 1.0;
        this.uniforms.scattering = 0.04;
        this.uniforms.ambientLightColor = new Float32Array([0.15, 0.15, 0.15]);
        this.uniforms.absorption = 0.01;
        this.uniforms.noiseFreq = 0.3;
        this.uniforms.octaveCount = 4;
        this.uniforms.densityScale = 1.0;
        this.uniforms.phaseG = 0.3;

        device.queue.writeBuffer(this.uniformsBuffer, 0, this.uniforms.buffer);
    }

    computeVolumetrics(encoder: GPUCommandEncoder) {
        const workgroupCountX = Math.ceil(shaders.constants.froxelGridDimX / shaders.constants.froxelWorkgroupSizeX);
        const workgroupCountY = Math.ceil(shaders.constants.froxelGridDimY / shaders.constants.froxelWorkgroupSizeY);
        const workgroupCountZ = Math.ceil(shaders.constants.froxelGridDimZ / shaders.constants.froxelWorkgroupSizeZ);

        const computePass = encoder.beginComputePass();

        computePass.setPipeline(this.voxelizationComputePipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_volumetric, this.voxelizationComputeBindGroup);
        computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);

        computePass.setPipeline(this.lightingComputePipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_volumetric, this.lightingComputeBindGroup);
        computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);

        computePass.setPipeline(this.integrationComputePipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_volumetric, this.integrationComputeBindGroup);
        computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY);

        computePass.end();
    }
}
