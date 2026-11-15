use bevy::mesh::VertexAttributeValues;
use bevy::prelude::*;
use noise_functions::*;

use std::f32::consts::PI;

#[derive(Component)]
pub struct Ground;

#[derive(Resource)]
pub struct Terrain {
    seed: i32,
    freq: f32,
    amp: f32,
    subdivisions: u32,
}

impl Default for Terrain {
    fn default() -> Self {
        Terrain {
            seed: 10,
            freq: 0.05,
            amp: 6.0,
            subdivisions: 64,
        }
    }
}

impl Terrain {
    pub fn height_at(&self, x: f32, z: f32) -> f32 {
        Perlin.seed(self.seed).frequency(self.freq).sample2([x, z]) * self.amp
    }
}

pub struct TerrainPlugin;

impl Plugin for TerrainPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Terrain>()
            .add_systems(Startup, generate_terrain)
            .add_systems(Update, draw_grid);
    }
}

fn generate_terrain(
    mut cmds: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    terrain: Res<Terrain>,
) {
    // Generate ground mesh
    let mut ground = Plane3d::default()
        .mesh()
        .size(64.0, 64.0)
        .subdivisions(terrain.subdivisions)
        .build();
    if let Some(VertexAttributeValues::Float32x3(positions)) =
        ground.attribute_mut(Mesh::ATTRIBUTE_POSITION)
    {
        for pos in positions.iter_mut() {
            pos[1] = terrain.height_at(pos[0], pos[2]);
        }
    }
    ground.compute_normals();

    // Spawn ground
    cmds.spawn((
        Name::new("Ground"),
        Ground, // Tag
        Mesh3d(meshes.add(ground)),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgba(0.2, 0.15, 0.1, 1.0),
            ..Default::default()
        })),
    ));
}

fn draw_grid(mut gizmos: Gizmos) {
    gizmos.grid(
        Isometry3d::new(Vec3::new(0., 0.1, 0.), Quat::from_rotation_x(PI / 2.)),
        UVec2::new(32, 32),
        Vec2::splat(1.),
        Color::srgba(1., 0.5, 0., 0.5),
    );
}

pub fn ground_hit(ray: Ray3d, ray_cast: &mut MeshRayCast, ground: Entity) -> Option<Vec3> {
    let filter = &|e: Entity| e == ground;
    let settings = MeshRayCastSettings::default().with_filter(filter);
    ray_cast
        .cast_ray(ray, &settings)
        .first()
        .map(|(_, hit)| hit.point)
}
