use bevy::prelude::*;

use crate::wall::Wall;

const SPLINE_SAMPLES_PER_POINT: usize = 4;
const SPLINE_COLOR: Color = Color::srgb(1., 0., 0.);
const POINT_COLOR: Color = Color::srgba(1., 1., 1., 0.2);

pub struct SplinePlugin;

impl Plugin for SplinePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, draw_spline);
    }
}

fn build_curve(points: &[Vec3]) -> Option<CubicCurve<Vec3>> {
    CubicCardinalSpline::new_catmull_rom(points.iter().copied())
        .to_curve()
        .ok()
}

fn wall_color(id: u32) -> Color {
    let hue = (id as f32 * 0.618304).fract() * 360.; 
    Color::hsl(hue, 0.5, 0.5)
}

fn draw_spline(walls: Query<&Wall>, mut gizmos: Gizmos) {
    for wall in &walls {
        // Draw points
        for p in &wall.control_points {
            gizmos.sphere(
                Isometry3d::new(*p, Quat::default()),
                0.05,
                POINT_COLOR,
            );
        }

        // Draw curve
        if let Some(curve) = build_curve(&wall.control_points) {
            let sample_cnt = wall.control_points.len() * SPLINE_SAMPLES_PER_POINT;
            gizmos.linestrip(curve.iter_positions(sample_cnt), wall_color(wall.id));
        }
    }
}
