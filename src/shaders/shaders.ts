// Loads the WGSL sources and prepends the shared code (WGSL has no #include).

import commonRaw from './common.wgsl?raw';
import heightfieldRaw from './heightfield.cs.wgsl?raw';
import renderRaw from './render.wgsl?raw';

export const heightfieldWGSL = `${commonRaw}\n${heightfieldRaw}`;
export const renderWGSL = `${commonRaw}\n${renderRaw}`;
