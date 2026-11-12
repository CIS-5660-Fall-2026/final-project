using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Rendering;

public struct MeshConstructionData
{
    public Vector3[] vertices;
    public int[] triangles;
    public Vector2[] uvs;
}

public enum BlockType
{
    Air,
    Dirt,
    Grass,
    Stone,
    WoodPlank
}

[RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
public class ChunkTerrainGenerator : MonoBehaviour
{
    [Header("Chunk Settings")]
    [SerializeField] private int ChunkWidth = 50;
    private const int ChunkHeight = 200;
    private const int AtlasColumns = 3;
    private const int AtlasRows = 2;
    private const float AtlasTileInset = 0.001f;

    [Header("Terrain Noise")]
    [SerializeField] private int seed;
    [SerializeField, Min(0)] private int baseTerrainHeight = 100;
    [SerializeField, Min(0)] private float terrainAmplitudeDirt = 20.0f;
    [SerializeField] private float terrainAmplitudeStone = 20.0f;
    [SerializeField] private float noiseScale = 0.05f;

    [Header("River")]
    [SerializeField] private bool generateRiver = true;
    [SerializeField, Min(1)] private int riverDepth = 5;
    [SerializeField, Range(0.001f, 0.5f)] private float riverWidth = 0.06f;
    [SerializeField, Range(0.001f, 0.5f)] private float riverBankWidth = 0.12f;
    [SerializeField, Min(0.001f)] private float riverNoiseScale = 0.015f;
    [SerializeField, Min(0.001f)] private float riverWarpNoiseScale = 0.008f;
    [SerializeField, Min(0.0f)] private float riverWarpStrength = 18.0f;

    [Header("Large Cave")]
    [SerializeField] private bool generateLargeCave = true;
    [SerializeField, Min(1)] private int minimumCaveY = 5;
    [SerializeField] private float caveCenterY = 55.0f;
    [SerializeField, Range(0.1f, 0.6f)] private float caveHorizontalRadiusFraction = 0.4f;
    [SerializeField, Min(1.0f)] private float caveVerticalRadius = 25.0f;
    [SerializeField, Min(0.001f)] private float caveShapeNoiseScale = 0.025f;
    [SerializeField, Range(0.0f, 1.0f)] private float caveShapeNoiseStrength = 0.35f;
    [SerializeField, Min(0.001f)] private float caveDetailNoiseScale = 0.08f;
    [SerializeField, Range(0.0f, 0.5f)] private float caveDetailNoiseStrength = 0.08f;
    [SerializeField, Min(0.001f)] private float caveWarpNoiseScale = 0.018f;
    [SerializeField, Min(0.0f)] private float caveWarpStrength = 8.0f;
    [SerializeField, Range(-0.5f, 0.5f)] private float caveThreshold = 0.05f;

    [Header("Water")]
    [SerializeField] private GameObject waterPrefab;
    [SerializeField] private int waterHeight = 100;
    private const float waterHorizontalInset = 0.05f;
    private const float waterVerticalOffset = 0.05f;

    public bool IsGenerating { get; private set; }

    private GameObject waterInstance;

    private static readonly Vector3Int[] NeighborDirections =
    {
        Vector3Int.left,
        Vector3Int.right,
        Vector3Int.down,
        Vector3Int.up,
        Vector3Int.back,
        Vector3Int.forward
    };

    private static readonly Vector3[,] FaceVertices =
    {
        {
            new Vector3(0, 0, 1), new Vector3(0, 1, 1),
            new Vector3(0, 1, 0), new Vector3(0, 0, 0)
        },
        {
            new Vector3(1, 0, 0), new Vector3(1, 1, 0),
            new Vector3(1, 1, 1), new Vector3(1, 0, 1)
        },
        {
            new Vector3(0, 0, 1), new Vector3(0, 0, 0),
            new Vector3(1, 0, 0), new Vector3(1, 0, 1)
        },
        {
            new Vector3(0, 1, 0), new Vector3(0, 1, 1),
            new Vector3(1, 1, 1), new Vector3(1, 1, 0)
        },
        {
            new Vector3(0, 0, 0), new Vector3(0, 1, 0),
            new Vector3(1, 1, 0), new Vector3(1, 0, 0)
        },
        {
            new Vector3(1, 0, 1), new Vector3(1, 1, 1),
            new Vector3(0, 1, 1), new Vector3(0, 0, 1)
        }
    };

    private static readonly Vector2[] FaceUvs =
    {
        new Vector2(0, 0),
        new Vector2(0, 1),
        new Vector2(1, 1),
        new Vector2(1, 0)
    };

    // Tile coordinates use Unity's bottom-left UV origin
    // Face order is left, right, down, up, back, forward
    private static readonly Vector2Int[,] AtlasTiles =
    {
        {
            new Vector2Int(0, 1), new Vector2Int(0, 1), new Vector2Int(0, 1),
            new Vector2Int(0, 1), new Vector2Int(0, 1), new Vector2Int(0, 1)
        },
        {
            new Vector2Int(0, 1), new Vector2Int(0, 1), new Vector2Int(0, 1),
            new Vector2Int(0, 1), new Vector2Int(0, 1), new Vector2Int(0, 1)
        },
        {
            new Vector2Int(0, 0), new Vector2Int(0, 0), new Vector2Int(2, 1),
            new Vector2Int(1, 1), new Vector2Int(0, 0), new Vector2Int(0, 0)
        },
        {
            new Vector2Int(1, 0), new Vector2Int(1, 0), new Vector2Int(1, 0),
            new Vector2Int(1, 0), new Vector2Int(1, 0), new Vector2Int(1, 0)
        },
        {
            new Vector2Int(2, 0), new Vector2Int(2, 0), new Vector2Int(2, 0),
            new Vector2Int(2, 0), new Vector2Int(2, 0), new Vector2Int(2, 0)
        }
    };

    private void Start()
    {
        GenerateChunk();
    }

    private BlockType[,,] GenerateBlockMap()
    {
        BlockType[,,] blocks = new BlockType[ChunkWidth, ChunkHeight, ChunkWidth];
        int[,] surfaceHeights = new int[ChunkWidth, ChunkWidth];
        System.Random seedRandom = new System.Random(seed);
        float noiseOffsetX = seedRandom.Next(-100000, 100001);
        float noiseOffsetZ = seedRandom.Next(-100000, 100001);
        int riverSeed = unchecked(seed * 1103515245 + 12345);
        int riverWarpSeedX = unchecked(riverSeed + 1301);
        int riverWarpSeedZ = unchecked(riverSeed + 2903);
        int riverBedHeight = Mathf.Clamp(waterHeight - riverDepth, 0, ChunkHeight - 1);

        for (int x = 0; x < ChunkWidth; x++)
        {
            for (int z = 0; z < ChunkWidth; z++)
            {
                float terrainNoise = Mathf.PerlinNoise(
                    noiseOffsetX + x * noiseScale,
                    noiseOffsetZ + z * noiseScale
                );
                int stoneHeight = Mathf.Clamp(
                    Mathf.RoundToInt(
                        baseTerrainHeight +
                        terrainNoise * terrainAmplitudeStone
                    ),
                    0,
                    ChunkHeight - 1
                );
                int dirtHeight = Mathf.Clamp(
                    Mathf.RoundToInt(
                        stoneHeight +
                        terrainNoise * terrainAmplitudeDirt
                    ),
                    0,
                    ChunkHeight - 1
                );
                float riverInfluence = 0.0f;

                if (generateRiver)
                {
                    float sampleX = x + 0.5f;
                    float sampleZ = z + 0.5f;
                    float riverWarpX = SampleValueNoise3D(
                        sampleX * riverWarpNoiseScale,
                        17.31f,
                        sampleZ * riverWarpNoiseScale,
                        riverWarpSeedX
                    ) * riverWarpStrength;
                    float riverWarpZ = SampleValueNoise3D(
                        sampleX * riverWarpNoiseScale,
                        31.73f,
                        sampleZ * riverWarpNoiseScale,
                        riverWarpSeedZ
                    ) * riverWarpStrength;
                    float riverDistance = Mathf.Abs(SampleValueNoise3D(
                        (sampleX + riverWarpX) * riverNoiseScale,
                        53.19f,
                        (sampleZ + riverWarpZ) * riverNoiseScale,
                        riverSeed
                    ));
                    float bankBlend = Mathf.Clamp01(
                        (riverDistance - riverWidth) / Mathf.Max(0.0001f, riverBankWidth)
                    );
                    bankBlend = bankBlend * bankBlend * (3.0f - 2.0f * bankBlend);
                    riverInfluence = 1.0f - bankBlend;
                    int carvedHeight = Mathf.RoundToInt(
                        dirtHeight + (riverBedHeight - dirtHeight) * riverInfluence
                    );
                    dirtHeight = Mathf.Min(dirtHeight, carvedHeight);
                    stoneHeight = Mathf.Min(stoneHeight, dirtHeight);
                }

                surfaceHeights[x, z] = dirtHeight;

                for (int y = 0; y <= dirtHeight; y++)
                {
                    blocks[x, y, z] = y <= stoneHeight ? BlockType.Stone : BlockType.Dirt;
                }

                if (riverInfluence > 0.0f)
                {
                    blocks[x, dirtHeight, z] = BlockType.Dirt;
                }

                if (dirtHeight >= waterHeight)
                {
                    blocks[x, dirtHeight, z] = BlockType.Grass;
                }
            }
        }

        if (generateLargeCave)
        {
            int caveSeed = unchecked(seed * 73428767 + 912367421);
            System.Random caveParameterRandom = new System.Random(caveSeed);
            float caveCenterX = 0.5f + (float)caveParameterRandom.NextDouble() * (ChunkWidth - 1.0f);
            float caveCenterZ = 0.5f + (float)caveParameterRandom.NextDouble() * (ChunkWidth - 1.0f);
            float caveHorizontalRadius = ChunkWidth * caveHorizontalRadiusFraction;
            int warpSeedX = unchecked(caveSeed + 101);
            int warpSeedY = unchecked(caveSeed + 307);
            int warpSeedZ = unchecked(caveSeed + 503);
            int shapeSeed = unchecked(caveSeed + 701);
            int detailSeed = unchecked(caveSeed + 907);

            for (int x = 0; x < ChunkWidth; x++)
            {
                for (int z = 0; z < ChunkWidth; z++)
                {
                    for (int y = minimumCaveY; y <= surfaceHeights[x, z]; y++)
                    {
                        float sampleX = x + 0.5f;
                        float sampleY = y + 0.5f;
                        float sampleZ = z + 0.5f;
                        float coreX = (sampleX - caveCenterX) / caveHorizontalRadius;
                        float coreY = (sampleY - caveCenterY) / caveVerticalRadius;
                        float coreZ = (sampleZ - caveCenterZ) / caveHorizontalRadius;
                        float coreDistanceSquared = coreX * coreX + coreY * coreY + coreZ * coreZ;
                        float warpX = SampleValueNoise3D(
                            sampleX * caveWarpNoiseScale,
                            sampleY * caveWarpNoiseScale,
                            sampleZ * caveWarpNoiseScale,
                            warpSeedX
                        ) * caveWarpStrength;
                        float warpY = SampleValueNoise3D(
                            sampleX * caveWarpNoiseScale,
                            sampleY * caveWarpNoiseScale,
                            sampleZ * caveWarpNoiseScale,
                            warpSeedY
                        ) * caveWarpStrength * 0.35f;
                        float warpZ = SampleValueNoise3D(
                            sampleX * caveWarpNoiseScale,
                            sampleY * caveWarpNoiseScale,
                            sampleZ * caveWarpNoiseScale,
                            warpSeedZ
                        ) * caveWarpStrength;
                        float warpedX = sampleX + warpX;
                        float warpedY = sampleY + warpY;
                        float warpedZ = sampleZ + warpZ;
                        float normalizedX = (warpedX - caveCenterX) / caveHorizontalRadius;
                        float normalizedY = (warpedY - caveCenterY) / caveVerticalRadius;
                        float normalizedZ = (warpedZ - caveCenterZ) / caveHorizontalRadius;
                        float warpedDistanceSquared =
                            normalizedX * normalizedX +
                            normalizedY * normalizedY +
                            normalizedZ * normalizedZ;
                        float caveDensity =
                            1.0f - warpedDistanceSquared +
                            SampleValueNoise3D(
                                warpedX * caveShapeNoiseScale,
                                warpedY * caveShapeNoiseScale,
                                warpedZ * caveShapeNoiseScale,
                                shapeSeed
                            ) * caveShapeNoiseStrength +
                            SampleValueNoise3D(
                                warpedX * caveDetailNoiseScale,
                                warpedY * caveDetailNoiseScale,
                                warpedZ * caveDetailNoiseScale,
                                detailSeed
                            ) * caveDetailNoiseStrength;

                        bool insideGuaranteedCore = coreDistanceSquared < 0.45f;
                        bool insideDistortedBoundary =
                            warpedDistanceSquared < 1.6f &&
                            caveDensity > caveThreshold;

                        if (insideGuaranteedCore || insideDistortedBoundary)
                        {
                            blocks[x, y, z] = BlockType.Air;
                        }
                    }
                }
            }
        }

        return blocks;
    }

    private static float SampleValueNoise3D(float x, float y, float z, int noiseSeed)
    {
        int x0 = (int)System.Math.Floor(x);
        int y0 = (int)System.Math.Floor(y);
        int z0 = (int)System.Math.Floor(z);
        int x1 = x0 + 1;
        int y1 = y0 + 1;
        int z1 = z0 + 1;
        float blendX = Fade(x - x0);
        float blendY = Fade(y - y0);
        float blendZ = Fade(z - z0);
        float lowerFront = Lerp(
            HashToSignedFloat(x0, y0, z0, noiseSeed),
            HashToSignedFloat(x1, y0, z0, noiseSeed),
            blendX
        );
        float lowerBack = Lerp(
            HashToSignedFloat(x0, y0, z1, noiseSeed),
            HashToSignedFloat(x1, y0, z1, noiseSeed),
            blendX
        );
        float upperFront = Lerp(
            HashToSignedFloat(x0, y1, z0, noiseSeed),
            HashToSignedFloat(x1, y1, z0, noiseSeed),
            blendX
        );
        float upperBack = Lerp(
            HashToSignedFloat(x0, y1, z1, noiseSeed),
            HashToSignedFloat(x1, y1, z1, noiseSeed),
            blendX
        );

        return Lerp(
            Lerp(lowerFront, lowerBack, blendZ),
            Lerp(upperFront, upperBack, blendZ),
            blendY
        );
    }

    private static float HashToSignedFloat(int x, int y, int z, int noiseSeed)
    {
        uint hash;

        unchecked
        {
            hash = (uint)noiseSeed;
            hash ^= (uint)x * 374761393u;
            hash = (hash << 13) | (hash >> 19);
            hash ^= (uint)y * 668265263u;
            hash = (hash << 11) | (hash >> 21);
            hash ^= (uint)z * 2246822519u;
            hash *= 3266489917u;
            hash ^= hash >> 16;
        }

        return (hash & 0x00ffffffu) / 8388607.5f - 1.0f;
    }

    private static float Fade(float value)
    {
        return value * value * value * (value * (value * 6.0f - 15.0f) + 10.0f);
    }

    private static float Lerp(float start, float end, float amount)
    {
        return start + (end - start) * amount;
    }

    private static MeshConstructionData ConstructMeshData(BlockType[,,] blocks)
    {
        List<Vector3> vertices = new List<Vector3>();
        List<int> triangles = new List<int>();
        List<Vector2> uvs = new List<Vector2>();

        int chunkSizeX = blocks.GetLength(0);
        int chunkSizeY = blocks.GetLength(1);
        int chunkSizeZ = blocks.GetLength(2);

        for (int y = 0; y < chunkSizeY; y++)
        {
            for (int x = 0; x < chunkSizeX; x++)
            {
                for (int z = 0; z < chunkSizeZ; z++)
                {
                    if (blocks[x, y, z] == BlockType.Air)
                    {
                        continue;
                    }

                    for (int face = 0; face < NeighborDirections.Length; face++)
                    {
                        int neighborX = x + NeighborDirections[face].x;
                        int neighborY = y + NeighborDirections[face].y;
                        int neighborZ = z + NeighborDirections[face].z;

                        bool neighborIsOutside =
                            neighborX < 0 || neighborX >= chunkSizeX ||
                            neighborY < 0 || neighborY >= chunkSizeY ||
                            neighborZ < 0 || neighborZ >= chunkSizeZ;

                        if (!neighborIsOutside && blocks[neighborX, neighborY, neighborZ] != BlockType.Air)
                        {
                            continue;
                        }

                        int firstVertex = vertices.Count;
                        Vector3 blockPosition = new Vector3(x, y, z);
                        Vector2Int atlasTile = AtlasTiles[(int)blocks[x, y, z], face];

                        for (int corner = 0; corner < 4; corner++)
                        {
                            Vector2 faceUv = FaceUvs[corner];
                            vertices.Add(blockPosition + FaceVertices[face, corner]);
                            uvs.Add(new Vector2(
                                (
                                    atlasTile.x + AtlasTileInset +
                                    faceUv.x * (1.0f - 2.0f * AtlasTileInset)
                                ) / AtlasColumns,
                                (
                                    atlasTile.y + AtlasTileInset +
                                    faceUv.y * (1.0f - 2.0f * AtlasTileInset)
                                ) / AtlasRows
                            ));
                        }

                        triangles.Add(firstVertex);
                        triangles.Add(firstVertex + 1);
                        triangles.Add(firstVertex + 2);
                        triangles.Add(firstVertex);
                        triangles.Add(firstVertex + 2);
                        triangles.Add(firstVertex + 3);
                    }
                }
            }
        }

        return new MeshConstructionData
        {
            vertices = vertices.ToArray(),
            triangles = triangles.ToArray(),
            uvs = uvs.ToArray()
        };
    }

    private void ApplyMesh(MeshConstructionData data)
    {
        Mesh mesh = new Mesh
        {
            name = "Generated Stone Chunk",
            hideFlags = HideFlags.DontSave,
            indexFormat = IndexFormat.UInt32,
            vertices = data.vertices,
            triangles = data.triangles,
            uv = data.uvs
        };

        mesh.RecalculateNormals();
        mesh.RecalculateBounds();

        MeshFilter meshFilter = GetComponent<MeshFilter>();
        Mesh previousMesh = meshFilter.sharedMesh;
        meshFilter.sharedMesh = mesh;

        if (previousMesh != null && (previousMesh.hideFlags & HideFlags.DontSave) != 0)
        {
            if (Application.isPlaying)
            {
                Destroy(previousMesh);
            }
            else
            {
                DestroyImmediate(previousMesh);
            }
        }
    }

    public async void GenerateChunk()
    {
        if (IsGenerating)
        {
            return;
        }

        IsGenerating = true;

        try
        {
            BlockType[,,] blocks = GenerateBlockMap();
            ApplyMesh(await Task.Run(() => ConstructMeshData(blocks)));

            if (waterPrefab != null)
            {
                if (waterInstance != null)
                {
                    if (Application.isPlaying)
                    {
                        Destroy(waterInstance);
                    }
                    else
                    {
                        DestroyImmediate(waterInstance);
                    }
                }

                float waterDepth = Mathf.Max(0.01f, waterHeight - baseTerrainHeight);
                float waterWidth = Mathf.Max(0.01f, ChunkWidth - 2.0f * waterHorizontalInset);
                waterInstance = Instantiate(waterPrefab, transform);
                waterInstance.hideFlags = HideFlags.DontSave;
                waterInstance.transform.localPosition = new Vector3(
                    ChunkWidth * 0.5f,
                    waterHeight + 1.0f - waterDepth * 0.5f - waterVerticalOffset,
                    ChunkWidth * 0.5f
                );
                waterInstance.transform.localRotation = Quaternion.identity;
                waterInstance.transform.localScale = new Vector3(waterWidth, waterDepth, waterWidth);
            }
        }
        finally
        {
            IsGenerating = false;
        }
    }
}
