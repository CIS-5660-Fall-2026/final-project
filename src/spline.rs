use bevy::prelude::*;

use crate::wall::Wall;

const SPLINE_SAMPLES: usize = 100;
const SPLINE_COLOR: Color = Color::srgb(1., 0., 0.);

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

fn draw_spline(walls: Query<&Wall>, mut gizmos: Gizmos) {
    for wall in &walls {
        // Draw points
        for p in &wall.control_points {
            gizmos.sphere(
                Isometry3d::new(p + Dir3::Y * 0.1, Quat::default()),
                0.2,
                Color::WHITE,
            );
        }

        // Draw curve
        if let Some(curve) = build_curve(&wall.control_points) {
            gizmos.linestrip(curve.iter_positions(SPLINE_SAMPLES), SPLINE_COLOR);
        }
    }
}
