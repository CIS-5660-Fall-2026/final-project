Shader "CIS5660/Block Water"
{
    Properties
    {
        _DeepColor ("Deep Color", Color) = (0.02, 0.18, 0.35, 1.0)
        _ShallowColor ("Shallow Color", Color) = (0.05, 0.55, 0.75, 1.0)
        _Opacity ("Opacity", Range(0.0, 1.0)) = 0.55
        _WaveScale ("Wave Scale", Float) = 0.18
        _WaveSpeed ("Wave Speed", Float) = 1.2
        _WaveStrength ("Wave Strength", Range(0.0, 1.0)) = 0.18
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent"
            "RenderType" = "Transparent"
        }

        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Back

        Pass
        {
            CGPROGRAM
            #pragma vertex VertexProgram
            #pragma fragment FragmentProgram
            #include "UnityCG.cginc"

            struct VertexInput
            {
                float4 position : POSITION;
                float3 normal : NORMAL;
            };

            struct FragmentInput
            {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
            };

            float4 _DeepColor;
            float4 _ShallowColor;
            float _Opacity;
            float _WaveScale;
            float _WaveSpeed;
            float _WaveStrength;

            FragmentInput VertexProgram(VertexInput input)
            {
                FragmentInput output;
                output.position = UnityObjectToClipPos(input.position);
                output.worldPosition = mul(unity_ObjectToWorld, input.position).xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                return output;
            }

            fixed4 FragmentProgram(FragmentInput input) : SV_Target
            {
                float firstWave = sin(
                    (input.worldPosition.x + input.worldPosition.z) * _WaveScale +
                    _Time.y * _WaveSpeed
                );
                float secondWave = sin(
                    (input.worldPosition.x - input.worldPosition.z) * _WaveScale * 0.73 -
                    _Time.y * _WaveSpeed * 0.81
                );
                float wave = (firstWave + secondWave) * 0.25 + 0.5;
                float3 viewDirection = normalize(_WorldSpaceCameraPos.xyz - input.worldPosition);
                float fresnel = pow(
                    1.0 - saturate(dot(normalize(input.worldNormal), viewDirection)),
                    3.0
                );
                float3 waterColor = lerp(
                    _DeepColor.rgb,
                    _ShallowColor.rgb,
                    saturate(wave + fresnel * _WaveStrength)
                );

                return fixed4(waterColor, saturate(_Opacity + fresnel * 0.15));
            }
            ENDCG
        }
    }

    Fallback "Transparent/Diffuse"
}
