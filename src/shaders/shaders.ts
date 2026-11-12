// Loads the WGSL sources and prepends the shared code (WGSL has no #include).

import commonRaw from './common.wgsl?raw';
import advectRaw from './advect.cs.wgsl?raw';
import heightfieldRaw from './heightfield.cs.wgsl?raw';
import renderRaw from './render.wgsl?raw';

export const advectWGSL = `${commonRaw}\n${advectRaw}`;
export const heightfieldWGSL = `${commonRaw}\n${heightfieldRaw}`;
export const renderWGSL = `${commonRaw}\n${renderRaw}`;
