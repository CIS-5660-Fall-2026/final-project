/**
 * Creates one shader module from several WGSL sources. WGSL module-scope
 * declarations are order-independent, so plain concatenation is sufficient.
 */
export function createShaderModule(
  device: GPUDevice,
  label: string,
  sources: readonly string[],
): GPUShaderModule {
  const module = device.createShaderModule({label, code: sources.join('\n')});
  void module.getCompilationInfo().then(info => {
    for (const message of info.messages) {
      if (message.type === 'error') {
        console.error(
          `[${label}] ${message.lineNum}:${message.linePos} ${message.message}`,
        );
      }
    }
  });
  return module;
}
