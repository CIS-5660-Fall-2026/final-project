import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { generateDitherTextureData } from '../textures/ditherTexture';

export class DitherRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    ditherBindGroupLayout: GPUBindGroupLayout;
    ditherBindGroup: GPUBindGroup;

    ditherTexture: GPUTexture;
    ditherSampler: GPUSampler;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // ------------------------------------------------
        // Group 0: Scene uniforms (camera only)
        // ------------------------------------------------

        this.sceneUniformsBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "dither scene bind group layout",
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: "uniform" }
                    }
                ]
            });

        this.sceneUniformsBindGroup =
            renderer.device.createBindGroup({
                label: "dither scene bind group",
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
            label: "3D Bayer dither texture",
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
            label: "dither texture sampler",
            addressModeU: "repeat",
            addressModeV: "repeat",
            addressModeW: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "nearest"
        });

        this.ditherBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "dither texture bind group layout",
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
            label: "dither texture bind group",
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
        // Depth texture
        // ------------------------------------------------

        this.depthTexture = renderer.device.createTexture({
            size: [
                renderer.canvas.width,
                renderer.canvas.height
            ],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.depthTextureView = this.depthTexture.createView();

        // ------------------------------------------------
        // Render pipeline
        // ------------------------------------------------

        this.pipeline = renderer.device.createRenderPipeline({
            label: "object-space dithering pipeline",

            layout: renderer.device.createPipelineLayout({
                label: "dither pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                    this.ditherBindGroupLayout
                ]
            }),

            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },

            vertex: {
                module: renderer.device.createShaderModule({
                    label: "dither vertex shader",
                    code: shaders.ditherVertSrc
                }),
                buffers: [
                    renderer.vertexBufferLayout
                ]
            },

            fragment: {
                module: renderer.device.createShaderModule({
                    label: "dither fragment shader",
                    code: shaders.ditherFragSrc
                }),
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

        const canvasTextureView =
            renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "dither render pass",

            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],

            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        renderPass.setPipeline(this.pipeline);

        // Group 0: Camera
        renderPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );

        // Group 3: Dither texture
        renderPass.setBindGroup(
            shaders.constants.bindGroup_dither,
            this.ditherBindGroup
        );

        this.scene.iterate(
            node => {
                // Group 1: Model matrix
                renderPass.setBindGroup(
                    shaders.constants.bindGroup_model,
                    node.modelBindGroup
                );
            },

            material => {
                // Group 2: Material
                renderPass.setBindGroup(
                    shaders.constants.bindGroup_material,
                    material.materialBindGroup
                );
            },

            primitive => {
                renderPass.setVertexBuffer(
                    0,
                    primitive.vertexBuffer
                );

                renderPass.setIndexBuffer(
                    primitive.indexBuffer,
                    'uint32'
                );

                renderPass.drawIndexed(primitive.numIndices);
            }
        );

        renderPass.end();

        renderer.device.queue.submit([
            encoder.finish()
        ]);
    }
}
