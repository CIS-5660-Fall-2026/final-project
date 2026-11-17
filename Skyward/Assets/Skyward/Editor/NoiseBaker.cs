using UnityEditor;
using UnityEngine;
using UnityEngine.Experimental.Rendering;

/// <summary>
/// Bakes the tileable 3D cloud noise with NoiseBake.compute and saves it as Texture3D assets.
/// Menu: Skyward > Bake Noise Textures. Re-baking keeps the asset GUIDs, so material references stay valid.
/// Sizes and periods must match the constants in SkyAndClouds.shader (kBaseNoisePeriod, kDetailNoisePeriod).
/// </summary>
public static class NoiseBaker
{
    const string ComputePath = "Assets/Skyward/Shaders/NoiseBake.compute";
    const string OutputFolder = "Assets/Skyward/Textures";
    const string MaterialPath = "Assets/Skyward/Material/SkyAndClouds_Mat.mat";

    const int BaseSize = 128;
    const int BasePeriod = 4;
    const int DetailSize = 64;
    const int DetailPeriod = 2;

    [MenuItem("Skyward/Bake Noise Textures")]
    static void Bake()
    {
        var compute = AssetDatabase.LoadAssetAtPath<ComputeShader>(ComputePath);
        if (compute == null)
        {
            Debug.LogError($"Skyward: compute shader not found at {ComputePath}");
            return;
        }

        if (!AssetDatabase.IsValidFolder(OutputFolder))
            AssetDatabase.CreateFolder("Assets/Skyward", "Textures");

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        Texture3D baseNoise = BakeTexture(compute, "BakeBase", BaseSize, BasePeriod, $"{OutputFolder}/BaseNoise.asset");
        Texture3D detailNoise = BakeTexture(compute, "BakeDetail", DetailSize, DetailPeriod, $"{OutputFolder}/DetailNoise.asset");

        var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
        if (material != null)
        {
            material.SetTexture("_BaseNoise", baseNoise);
            material.SetTexture("_DetailNoise", detailNoise);
            material.SetFloat("_BakedNoise", 1f);
            material.EnableKeyword("_BAKED_NOISE");
            EditorUtility.SetDirty(material);
        }
        else
        {
            Debug.LogWarning($"Skyward: material not found at {MaterialPath}, assign the noise textures manually.");
        }

        AssetDatabase.SaveAssets();
        Debug.Log($"Skyward: baked {BaseSize}^3 base and {DetailSize}^3 detail noise in {stopwatch.ElapsedMilliseconds} ms.");
    }

    static Texture3D BakeTexture(ComputeShader compute, string kernelName, int size, int period, string path)
    {
        int kernel = compute.FindKernel(kernelName);
        int count = size * size * size;
        var buffer = new ComputeBuffer(count, sizeof(float) * 4);
        try
        {
            compute.SetBuffer(kernel, "_Result", buffer);
            compute.SetInt("_Size", size);
            compute.SetFloat("_Period", period);
            int groups = Mathf.CeilToInt(size / 8f);
            compute.Dispatch(kernel, groups, groups, groups);

            var data = new Vector4[count];
            buffer.GetData(data);

            var pixels = new Color32[count];
            for (int i = 0; i < count; i++)
            {
                Vector4 v = data[i];
                pixels[i] = new Color32(ToByte(v.x), ToByte(v.y), ToByte(v.z), ToByte(v.w));
            }

            var texture = new Texture3D(size, size, size, GraphicsFormat.R8G8B8A8_UNorm, TextureCreationFlags.None)
            {
                name = System.IO.Path.GetFileNameWithoutExtension(path),
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear,
            };
            texture.SetPixels32(pixels);
            texture.Apply(false);

            var existing = AssetDatabase.LoadAssetAtPath<Texture3D>(path);
            if (existing != null)
            {
                EditorUtility.CopySerialized(texture, existing);
                Object.DestroyImmediate(texture);
                return existing;
            }
            AssetDatabase.CreateAsset(texture, path);
            return texture;
        }
        finally
        {
            buffer.Release();
        }
    }

    static byte ToByte(float v)
    {
        return (byte)Mathf.RoundToInt(Mathf.Clamp01(v) * 255f);
    }

    // ---------------------------------------------------------------------------------------------
    // Blue noise (void-and-cluster, Ulichney 1993)
    // ---------------------------------------------------------------------------------------------
    const int BlueNoiseSize = 64;   // must match kBlueNoiseSize in SkyClouds.hlsl
    const float BlueNoiseSigma = 1.5f;

    [MenuItem("Skyward/Bake Blue Noise")]
    static void BakeBlueNoise()
    {
        if (!AssetDatabase.IsValidFolder(OutputFolder))
            AssetDatabase.CreateFolder("Assets/Skyward", "Textures");

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        int[] ranks = VoidAndCluster(BlueNoiseSize, BlueNoiseSigma, 1234);
        int count = BlueNoiseSize * BlueNoiseSize;

        var texture = new Texture2D(BlueNoiseSize, BlueNoiseSize, TextureFormat.R8, false, true)
        {
            name = "BlueNoise",
            wrapMode = TextureWrapMode.Repeat,
            filterMode = FilterMode.Point,
        };
        var pixels = new byte[count];
        for (int i = 0; i < count; i++)
            pixels[i] = (byte)(ranks[i] * 256 / count);
        texture.SetPixelData(pixels, 0);
        texture.Apply(false);

        string path = $"{OutputFolder}/BlueNoise.asset";
        var existing = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        if (existing != null)
        {
            EditorUtility.CopySerialized(texture, existing);
            Object.DestroyImmediate(texture);
            texture = existing;
        }
        else
        {
            AssetDatabase.CreateAsset(texture, path);
        }

        var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
        if (material != null)
        {
            material.SetTexture("_BlueNoise", texture);
            EditorUtility.SetDirty(material);
        }
        AssetDatabase.SaveAssets();
        Debug.Log($"Skyward: baked {BlueNoiseSize}x{BlueNoiseSize} blue noise in {stopwatch.ElapsedMilliseconds} ms.");
    }

    /// <summary>
    /// Returns a rank (0..n*n-1) per pixel; thresholding the ranks at any level gives an evenly spread point set.
    /// "Energy" is each pixel's Gaussian-weighted count of nearby set pixels (toroidal, so the texture tiles).
    /// The tightest cluster is the set pixel with the highest energy, the largest void the empty one with the lowest.
    /// </summary>
    static int[] VoidAndCluster(int size, float sigma, int seed)
    {
        int count = size * size;
        var kernel = new float[count];
        for (int y = 0; y < size; y++)
        {
            for (int x = 0; x < size; x++)
            {
                int dx = Mathf.Min(x, size - x);
                int dy = Mathf.Min(y, size - y);
                kernel[y * size + x] = Mathf.Exp(-(dx * dx + dy * dy) / (2f * sigma * sigma));
            }
        }

        var bits = new bool[count];
        var energy = new float[count];

        void Set(int index, bool value)
        {
            bits[index] = value;
            float sign = value ? 1f : -1f;
            int px = index % size, py = index / size;
            for (int y = 0; y < size; y++)
            {
                int dy = (y - py + size) % size;
                for (int x = 0; x < size; x++)
                {
                    int dx = (x - px + size) % size;
                    energy[y * size + x] += sign * kernel[dy * size + dx];
                }
            }
        }

        int TightestCluster()
        {
            int best = -1;
            for (int i = 0; i < count; i++)
                if (bits[i] && (best < 0 || energy[i] > energy[best]))
                    best = i;
            return best;
        }

        int LargestVoid()
        {
            int best = -1;
            for (int i = 0; i < count; i++)
                if (!bits[i] && (best < 0 || energy[i] < energy[best]))
                    best = i;
            return best;
        }

        // 1. Initial pattern: 10% random points, relaxed by moving the tightest cluster into the largest void
        var random = new System.Random(seed);
        int initialCount = count / 10;
        for (int placed = 0; placed < initialCount;)
        {
            int index = random.Next(count);
            if (!bits[index])
            {
                Set(index, true);
                placed++;
            }
        }
        for (int iteration = 0; iteration < count; iteration++)
        {
            int cluster = TightestCluster();
            Set(cluster, false);
            int voidIndex = LargestVoid();
            Set(voidIndex, true);
            if (voidIndex == cluster)
                break;
        }

        var ranks = new int[count];
        var prototypeBits = (bool[])bits.Clone();
        var prototypeEnergy = (float[])energy.Clone();

        // 2. Ranks below the initial count: remove the tightest cluster one at a time
        for (int rank = initialCount - 1; rank >= 0; rank--)
        {
            int cluster = TightestCluster();
            Set(cluster, false);
            ranks[cluster] = rank;
        }

        // 3. Ranks above it: from the prototype, fill the largest void one at a time
        System.Array.Copy(prototypeBits, bits, count);
        System.Array.Copy(prototypeEnergy, energy, count);
        for (int rank = initialCount; rank < count; rank++)
        {
            int voidIndex = LargestVoid();
            Set(voidIndex, true);
            ranks[voidIndex] = rank;
        }
        return ranks;
    }
}
