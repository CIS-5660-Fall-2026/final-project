#![allow(clippy::type_complexity, clippy::too_many_arguments)]

use bevy::prelude::*;
use bevy_inspector_egui::{bevy_egui::EguiPlugin, quick::WorldInspectorPlugin};

mod spline;
use spline::SplinePlugin;

mod terrain;
use terrain::TerrainPlugin;

mod camera;
use camera::CameraPlugin;

mod input;
use input::InputPlugin;

mod wall;
use wall::WallPlugin;

fn main() {
    // PLUGINS
    App::new()
        .add_plugins((
            DefaultPlugins,
            EguiPlugin::default(),
            WorldInspectorPlugin::default(),
            // Internal plugins
            CameraPlugin,
            TerrainPlugin,
            SplinePlugin,
            InputPlugin,
            WallPlugin,
        ))
        .run();
}

/*
HANDY COMMANDS:
To run:
> cargo run --features dev

For best rust practices:
> cargo clippy --fix

Lint formatting:
> cargo fmt
*/
