import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { generateDitherTextureData } from '../textures/ditherTexture';

export class CloudsRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    ditherBindGroupLayout: GPUBindGroupLayout;
    ditherBindGroup: GPUBindGroup;

    ditherTexture: GPUTexture;
    ditherSampler: GPUSampler;

    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // ------------------------------------------------
        // Group 0: Scene uniforms (camera only)
        // ------------------------------------------------

        this.sceneUniformsBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "cloud scene bind group layout",
                entries: [
                    {
                        binding: 0,
                        visibility:
                            GPUShaderStage.VERTEX |
                            GPUShaderStage.FRAGMENT,
                        buffer: { type: "uniform" }
                    }
                ]
            });

        this.sceneUniformsBindGroup =
            renderer.device.createBindGroup({
                label: "cloud scene bind group",
                layout: this.sceneUniformsBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.camera.uniformsBuffer
                        }
                    }
                ]
            });

        // ------------------------------------------------
        // Group 3: Dither texture and sampler
        // ------------------------------------------------

        const ditherData = generateDitherTextureData(32, 8);

        this.ditherTexture = renderer.device.createTexture({
            label: "cloud 3D Bayer dither texture",
            size: {
                width: ditherData.size,
                height: ditherData.size,
                depthOrArrayLayers: ditherData.layers
            },
            dimension: "3d",
            format: "r8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST
        });

        // Pad rows to WebGPU's 256-byte copy alignment.
        const bytesPerRow = Math.ceil(ditherData.size / 256) * 256;

        const paddedData = new Uint8Array(
            bytesPerRow * ditherData.size * ditherData.layers
        );

        for (let z = 0; z < ditherData.layers; ++z) {
            for (let y = 0; y < ditherData.size; ++y) {
                const srcOffset =
                    (z * ditherData.size + y) * ditherData.size;

                const dstOffset =
                    (z * ditherData.size + y) * bytesPerRow;

                paddedData.set(
                    ditherData.data.subarray(
                        srcOffset,
                        srcOffset + ditherData.size
                    ),
                    dstOffset
                );
            }
        }

        renderer.device.queue.writeTexture(
            { texture: this.ditherTexture },
            paddedData,
            {
                offset: 0,
                bytesPerRow,
                rowsPerImage: ditherData.size
            },
            {
                width: ditherData.size,
                height: ditherData.size,
                depthOrArrayLayers: ditherData.layers
            }
        );

        this.ditherSampler = renderer.device.createSampler({
            label: "cloud dither texture sampler",
            addressModeU: "repeat",
            addressModeV: "repeat",
            addressModeW: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "nearest"
        });

        this.ditherBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "cloud dither texture bind group layout",
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: "float",
                            viewDimension: "3d",
                            multisampled: false
                        }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {
                            type: "filtering"
                        }
                    }
                ]
            });

        this.ditherBindGroup = renderer.device.createBindGroup({
            label: "cloud dither texture bind group",
            layout: this.ditherBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.ditherTexture.createView({
                        dimension: "3d"
                    })
                },
                {
                    binding: 1,
                    resource: this.ditherSampler
                }
            ]
        });

        // ------------------------------------------------
        // Render pipeline
        // ------------------------------------------------

        this.pipeline = renderer.device.createRenderPipeline({
            label: "cloud ray marching pipeline",

            layout: renderer.device.createPipelineLayout({
                label: "cloud pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.ditherBindGroupLayout
                ]
            }),

            vertex: {
                module: renderer.device.createShaderModule({
                    label: "cloud vertex shader",
                    code: shaders.cloudsVertSrc
                }),
                entryPoint: "vs_main",
                buffers: []
            },

            fragment: {
                module: renderer.device.createShaderModule({
                    label: "cloud fragment shader",
                    code: shaders.cloudsFragSrc
                }),
                entryPoint: "fs_main",
                targets: [
                    {
                        format: renderer.canvasFormat,
                        blend: {
                            color: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add"
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add"
                            }
                        }
                    }
                ]
            },

            primitive: {
                topology: "triangle-list"
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

        const canvasTextureView =
            renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "cloud render pass",

            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        renderPass.setPipeline(this.pipeline);

        // Group 0: Camera
        renderPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );

        // Group 3: Dither texture
        renderPass.setBindGroup(1, this.ditherBindGroup);

        // Draw fullscreen triangle.
        // The vertex shader generates its vertices using vertex_index.
        renderPass.draw(3);

        renderPass.end();

        renderer.device.queue.submit([
            encoder.finish()
        ]);
    }
}