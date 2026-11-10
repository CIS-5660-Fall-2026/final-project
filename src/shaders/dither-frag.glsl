#version 300 es

precision highp float;
precision highp sampler3D;

uniform vec4 u_Color;
uniform sampler3D u_DitherTex;

in vec4 fs_Nor;
in vec3 fs_ObjNor;
in vec4 fs_LightVec;
in vec4 fs_Col;
in vec4 fs_Pos;

out vec4 out_Col;

void main()
{
        // tunable parameters
        float u_DotScale = 10.0;
        vec3 u_ColorHighlight = vec3(1.0, 0.0, 0.0);
        vec3 u_ColorShadow = vec3(0.0, 0.0, 1.0);
        
        // lighting
        float diffuseTerm = dot(normalize(fs_Nor), normalize(fs_LightVec));
        float ambientTerm = 0.6;
        float lightIntensity = mix(0.2, 0.9, max(diffuseTerm, 0.0));
        // lightIntensity = 0.5;

        // get uv
        vec3 pos = fs_Pos.xyz;
        vec3 nor = abs(normalize(fs_Nor.xyz));
        vec2 uv0 = (nor.x > nor.y && nor.x > nor.z) ? pos.yz : 
                   (nor.y > nor.z) ? pos.xz : 
                   pos.xy;

        // screen space uv derivatives
        vec2 dx = dFdx(uv0);
        vec2 dy = dFdy(uv0);

        // SVD uv freq - from Rune's implementation
        float Q = dot(dx, dx) + dot(dy, dy);
        float R = dx.x * dy.y - dx.y * dy.x;
        float discriminant = sqrt(max(0.0, Q * Q - 4.0 * R * R));
        vec2 freq = sqrt(max(vec2(Q + discriminant, Q - discriminant) * 0.5, 0.0));
        float spacing = freq.y; // dot spacing
        spacing *= u_DotScale;
        spacing /= max(sqrt(lightIntensity), 0.001);

        // get fractal level
        float spacingLog = log2(max(spacing, 1e-5));
        float level = floor(spacingLog);
        float frac = fract(spacingLog); // percent to next level

        // get sub-layer -- ?? why math
        float subLayer = mix(1.0, 4.0, 1.0 - frac); // blend between 1 and 4 dots
        float layer = (subLayer - 1.0) * 8.0;
        float w = (layer + 0.5) / 25.0;

        // scale uv for current fractal level
        vec2 uv = uv0 / exp2(level);

        // get threshold from 3D Bayer matrix texture
        float threshold = texture(u_DitherTex, vec3(uv, w)).r;    
        float dither = lightIntensity > threshold ? 1.0 : 0.0;
        vec3 finalColor = mix(u_ColorShadow, u_ColorHighlight, dither);

        out_Col = vec4(finalColor, 1.0);
}
