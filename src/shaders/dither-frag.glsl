#version 300 es

precision highp float;

uniform vec4 u_Color;

in vec4 fs_Nor;
in vec4 fs_LightVec;
in vec4 fs_Col;

out vec4 out_Col;

void main()
{
        vec4 diffuseColor = u_Color;

        float diffuseTerm = dot(normalize(fs_Nor), normalize(fs_LightVec));
        float ambientTerm = 0.2;

        float lightIntensity = diffuseTerm + ambientTerm;
        out_Col = vec4(diffuseColor.rgb * lightIntensity, diffuseColor.a);
}
