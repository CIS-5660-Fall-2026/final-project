Shader "CIS5660/Block Terrain"
{
    Properties
    {
        _MainTex ("Block Atlas", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        LOD 200

        CGPROGRAM
        #pragma surface SurfaceProgram Lambert fullforwardshadows
        #pragma target 3.0

        sampler2D _MainTex;
        fixed4 _Color;

        struct Input
        {
            float2 uv_MainTex;
        };

        void SurfaceProgram(Input input, inout SurfaceOutput output)
        {
            fixed4 atlasColor = tex2D(_MainTex, input.uv_MainTex) * _Color;
            output.Albedo = atlasColor.rgb;
            output.Alpha = 1.0;
        }
        ENDCG
    }

    Fallback "Diffuse"
}
