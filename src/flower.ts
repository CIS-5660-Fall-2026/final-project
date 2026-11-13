import { BufferAttribute, BufferGeometry, Material, Mesh } from 'three'
import { Bloom } from './bloom'

export class Flower extends Mesh<BufferGeometry, Material> {
  private frames: Float32Array[]

  constructor(bloom: Bloom, material: Material) {
    super(new BufferGeometry(), material)
    this.frames = bloom.frames
    this.geometry.setIndex(bloom.index)
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.frames[0].length), 3))
    this.castShadow = true
    this.receiveShadow = true
  }

  // 0 is the flat sheet, 1 is the last baked keyframe
  fold(amount: number) {
    const at = amount * (this.frames.length - 1)
    const i = Math.min(Math.floor(at), this.frames.length - 2)
    const from = this.frames[i]
    const to = this.frames[i + 1]
    const position = this.geometry.attributes.position
    for (let j = 0; j < from.length; j++) position.array[j] = from[j] + (to[j] - from[j]) * (at - i)
    position.needsUpdate = true
    this.geometry.computeBoundingSphere()
  }
}
