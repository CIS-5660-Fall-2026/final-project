#version 300 es

precision highp float;

uniform vec4 u_Color;
uniform mat4 u_Model;
uniform vec3 u_CamPos;
uniform float u_Temperature;
uniform float u_Time;

in vec4 fs_Nor;
in vec4 fs_LightVec;
in vec4 fs_Col;
in vec4 fs_Pos;
in float fs_SmallNoise;
in float fs_CurlNoise;

out vec4 out_Col;

float impulse(float k, float x) {
    float h = k * x;
    return h * exp(1.0 - h);
}

float fresnel(float amount, vec3 normal, vec3 view){
	return pow(
		1.0 - clamp(dot(normalize(normal), normalize(view)), 0.0, 1.0),
		amount
	);
}

vec3 temp_change(vec3 coolColor, vec3 whiteColor, vec3 blueColor, float temp) {
    vec3 white = mix(coolColor, whiteColor, smoothstep(0.0, 0.6, temp));
    vec3 blue = mix(whiteColor, blueColor, smoothstep(0.6, 1.0, temp));
    return mix(white, blue, step(0.6, temp));
}

void main()
{
    float depthT = smoothstep(0.6, 1.5, length(-fs_Pos.xyz));
    float heightT = smoothstep(-0.5, 3.0, -fs_Pos.y);

    depthT += (-fs_SmallNoise - 0.5) * 0.2;
    depthT += (-fs_CurlNoise - 0.25) * 0.25;

    vec3 cool_depth_yellow = vec3(1.0, 0.9, 0.2);
    vec3 cool_depth_red    = vec3(0.7, 0.05, 0.0);
    vec3 cool_height_yellow = vec3(1.0, 0.92, 0.56);

    vec3 white_depth_yellow = vec3(0.784, 0.843, 0.961);
    vec3 white_depth_red    = vec3(1, 0.627, 0.4);
    vec3 white_height_yellow = vec3(1.0, 0.92, 0.56);

    vec3 blue_depth_yellow = vec3(0.294, 0.486, 0.91);
    vec3 blue_depth_red    = vec3(1, 0.816, 0.608) * 1.2;
    vec3 blue_height_yellow = vec3(0.122, 0.314, 0.729);

    vec3 depth_yellow = temp_change(cool_depth_yellow, white_depth_yellow, blue_depth_yellow, u_Temperature);
    vec3 depth_red = temp_change(cool_depth_red, white_depth_red, blue_depth_red, u_Temperature);
    vec3 height_yellow = temp_change(cool_height_yellow, white_height_yellow, blue_height_yellow, u_Temperature);

    vec3 depthColor = mix(depth_yellow, depth_red, depthT);
    vec3 heightColor = height_yellow * 2.0;

    vec3 finalColor = mix(depthColor, heightColor, heightT);

    float fresnel_effect = fresnel(0.2, fs_Nor.xyz, u_CamPos);
    finalColor += fresnel_effect * 0.1;

    float time = u_Time * 0.05;
    float flare = impulse(0.5,  0.5 + 0.5 * cos(time * 0.5));
    finalColor += flare * 0.05;

    float diffuseTerm = dot(normalize(fs_Nor), normalize(fs_LightVec));
    diffuseTerm = diffuseTerm * 0.01;

    float ambientTerm = 0.90;
    float lightIntensity = diffuseTerm + ambientTerm;
    lightIntensity += fs_SmallNoise * 0.2;

    out_Col = vec4(finalColor * lightIntensity, u_Color.a);
}
