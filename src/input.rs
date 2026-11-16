use bevy::prelude::*;
use bevy_inspector_egui::bevy_egui::input::EguiWantsInput;

use crate::terrain::{Ground, ground_hit};
use crate::wall::{ActiveWall, DEFAULT_WALL_HEIGHT, NextWallId, Wall};

const MIN_WALL_STEP: f32 = 1.;

pub struct InputPlugin;

impl Plugin for InputPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, (start_wall, extend_wall));
    }
}

fn cursor_to_ground_raycast(
    window: &Window,
    cam: &Camera,
    cam_transform: &GlobalTransform,
    ray_cast: &mut MeshRayCast,
    ground: Entity,
) -> Option<Vec3> {
    let click_pos = window.cursor_position()?;
    let ray = cam.viewport_to_world(cam_transform, click_pos).ok()?;
    ground_hit(ray, ray_cast, ground)
}

fn start_wall(
    mut cmds: Commands,
    mouse: Res<ButtonInput<MouseButton>>,
    window: Single<&Window>,
    camera_query: Single<(&Camera, &GlobalTransform)>,
    ground: Single<Entity, With<Ground>>,
    mut ray_cast: MeshRayCast,
    mut next_wall_id: ResMut<NextWallId>,
    mut active_wall: ResMut<ActiveWall>,
    egui: Res<EguiWantsInput>
) {
    // Early out if using GUI
    if egui.wants_any_pointer_input() {return;};

    // Get click position
    if mouse.just_pressed(MouseButton::Left) {
        let (cam, cam_transform) = *camera_query;
        let Some(hit_point) =
            cursor_to_ground_raycast(&window, cam, cam_transform, &mut ray_cast, *ground)
        else {
            return;
        };

        // Create new wall!
        let active_wall_id = cmds
            .spawn((
                Name::new("Wall"),
                Wall {
                    id: next_wall_id.id,
                    seed: next_wall_id.id,
                    control_points: vec![hit_point],
                    height: DEFAULT_WALL_HEIGHT,
                },
            ))
            .id();
        next_wall_id.id += 1;
        active_wall.id = Some(active_wall_id);
    }
}

fn extend_wall(
    mouse: Res<ButtonInput<MouseButton>>,
    window: Single<&Window>,
    camera_query: Single<(&Camera, &GlobalTransform)>,
    ground: Single<Entity, With<Ground>>,
    mut ray_cast: MeshRayCast,
    mut active_wall: ResMut<ActiveWall>,
    mut walls: Query<&mut Wall>,
) {
    if mouse.just_released(MouseButton::Left) {
        // TODO- Resample polyline to simplify?
        active_wall.id = None;
        return;
    }

    let (cam, cam_transform) = *camera_query;
    if mouse.pressed(MouseButton::Left)
        && let Some(entity) = active_wall.id
        && let Some(hit_point) =
            cursor_to_ground_raycast(&window, cam, cam_transform, &mut ray_cast, *ground)
        && let Ok(mut wall) = walls.get_mut(entity)
        && wall
            .control_points
            .last()
            .is_none_or(|last| hit_point.distance(*last) >= MIN_WALL_STEP)
    {
        wall.control_points.push(hit_point);
    }
}
