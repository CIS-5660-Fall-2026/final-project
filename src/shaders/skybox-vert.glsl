#version 300 es

uniform mat4 u_Model;
uniform mat4 u_ViewProj;

in vec4 vs_Pos;

out vec4 fs_Pos;

void main()
{
    vec4 modelPos = u_Model * vs_Pos;
    fs_Pos = modelPos;
    gl_Position = u_ViewProj * modelPos;
}