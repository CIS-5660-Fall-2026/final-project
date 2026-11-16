use bevy::prelude::*;

pub const DEFAULT_WALL_HEIGHT: f32 = 1.;

#[derive(Component, Reflect)]
#[reflect(Component)]
pub struct Wall {
    pub id: u32,
    pub seed: u32,
    pub control_points: Vec<Vec3>,
    pub height: f32,
}

#[derive(Resource, Default)]
pub struct ActiveWall {
    pub id: Option<Entity>,
}

#[derive(Resource, Default)]
pub struct NextWallId {
    pub id: u32,
}

pub struct WallPlugin;

impl Plugin for WallPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ActiveWall>()
            .init_resource::<NextWallId>()
            .register_type::<Wall>();
    }
}
