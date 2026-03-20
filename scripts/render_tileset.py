#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy


SCRIPT_DIRECTORY = Path(__file__).resolve().parent
DEFAULT_SCENE_SPEC_PATH = SCRIPT_DIRECTORY / "lib" / "terrain-scene-spec.json"
MATERIAL_NAMES = ("TerrainMed", "TerrainLight", "TerrainDark")
TEXTURE_INTERPOLATION = {
    "legacyMatched": "Linear",
    "strictPixel": "Closest",
    "nativeExact": "Linear",
}
EMISSION_STRENGTHS = {
    "flat": {"TerrainLight": 1.0, "TerrainMed": 1.0, "TerrainDark": 1.0},
    "shaded": {"TerrainLight": 2.0, "TerrainMed": 1.0, "TerrainDark": 0.5},
}
ORACLE_MASK_COLOR = (1.0, 1.0, 1.0, 1.0)


def load_scene_spec(scene_spec_path: Path) -> dict:
    with scene_spec_path.open("r", encoding="utf-8") as scene_spec_file:
        return json.load(scene_spec_file)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Render the terrain tileset scene without a .blend file")
    parser.add_argument("--texture", help="Texture image path")
    parser.add_argument("--output-dir", required=True, help="Frame output directory")
    parser.add_argument("--engine", choices=("CYCLES", "BLENDER_EEVEE_NEXT"), required=True)
    parser.add_argument("--shading", choices=("flat", "shaded"), required=True)
    parser.add_argument("--texture-rotation", choices=("none", "quarterTurn", "cameraAlignedLegacy"), required=True)
    parser.add_argument(
        "--sampling-profile",
        choices=("legacyMatched", "strictPixel", "nativeExact"),
        default="nativeExact",
    )
    parser.add_argument("--render-kind", choices=("textured", "oracleMask", "metadata"), default="textured")
    parser.add_argument("--samples", type=int, default=10)
    parser.add_argument("--scene-spec", default=str(DEFAULT_SCENE_SPEC_PATH), help="Machine-readable terrain scene spec")
    args = parser.parse_args(argv)
    if args.render_kind == "textured" and not args.texture:
        parser.error("--texture is required when --render-kind=textured")
    return args


def get_render_contract(scene_spec: dict) -> dict:
    render_spec = scene_spec["render"]
    camera_spec = render_spec["camera"]
    frame_spec = render_spec["frame"]
    return {
        "resolution": (render_spec["resolution"]["width"], render_spec["resolution"]["height"]),
        "camera_location": (camera_spec["location"]["x"], camera_spec["location"]["y"], camera_spec["location"]["z"]),
        "camera_rotation": (
            math.radians(camera_spec["rotationDeg"]["x"]),
            math.radians(camera_spec["rotationDeg"]["y"]),
            math.radians(camera_spec["rotationDeg"]["z"]),
        ),
        "ortho_scale": camera_spec["orthoScale"],
        "clip_start": camera_spec["clipStart"],
        "clip_end": camera_spec["clipEnd"],
        "frame_start": frame_spec["start"],
        "frame_end": frame_spec["end"],
        "fps": frame_spec["fps"],
        "cycles_preview_samples": 10,
        "cycles_use_denoising": False,
        "cycles_pixel_filter_type": "GAUSSIAN",
        "cycles_filter_width": 0.01,
        "image_compression": 90,
    }


def get_mesh_data(scene_spec: dict) -> tuple[tuple[tuple[float, float, float], ...], tuple[tuple[tuple[int, ...], int, tuple[tuple[float, float], ...]], ...]]:
    vertices = tuple(tuple(vertex) for vertex in scene_spec["mesh"]["vertices"])
    polygons = tuple(
        (tuple(polygon["indices"]), polygon["materialIndex"], tuple(tuple(uv) for uv in polygon["uvs"]))
        for polygon in scene_spec["mesh"]["polygons"]
    )
    return vertices, polygons


def get_poses(scene_spec: dict) -> tuple[tuple[float, float, float], ...]:
    return tuple((pose["x"], pose["y"], pose["rotationZRad"]) for pose in scene_spec["poses"])


def clear_scene() -> bpy.types.Scene:
    scene = bpy.context.scene

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material, do_unlink=True)
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image, do_unlink=True)

    return scene


def configure_scene(scene: bpy.types.Scene, args: argparse.Namespace, output_dir: Path, render_contract: dict) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    scene.render.engine = args.engine
    scene.render.resolution_x, scene.render.resolution_y = render_contract["resolution"]
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.use_compositing = True
    scene.render.use_sequencer = True
    scene.render.dither_intensity = 0.0
    scene.render.filter_size = 0.0
    scene.render.filepath = f"{output_dir}/"
    scene.render.use_file_extension = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = render_contract["image_compression"]
    scene.frame_start = render_contract["frame_start"]
    scene.frame_end = render_contract["frame_end"]
    scene.render.fps = render_contract["fps"]
    scene.display_settings.display_device = "sRGB"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.view_settings.use_curve_mapping = False
    scene.sequencer_colorspace_settings.name = "sRGB"
    scene.world = None

    if args.engine == "CYCLES":
        scene.cycles.samples = args.samples
        scene.cycles.preview_samples = render_contract["cycles_preview_samples"]
        scene.cycles.use_denoising = render_contract["cycles_use_denoising"]
        scene.cycles.pixel_filter_type = render_contract["cycles_pixel_filter_type"]
        scene.cycles.filter_width = render_contract["cycles_filter_width"]


def create_camera(scene: bpy.types.Scene, render_contract: dict) -> None:
    camera_data = bpy.data.cameras.new("Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = render_contract["ortho_scale"]
    camera_data.clip_start = render_contract["clip_start"]
    camera_data.clip_end = render_contract["clip_end"]

    camera = bpy.data.objects.new("Camera", camera_data)
    camera.location = render_contract["camera_location"]
    camera.rotation_mode = "XYZ"
    camera.rotation_euler = render_contract["camera_rotation"]

    scene.collection.objects.link(camera)
    scene.camera = camera


def build_material(
    name: str,
    texture: bpy.types.Image | None,
    render_kind: str,
    shading: str,
    texture_rotation: str,
    sampling_profile: str,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    material.blend_method = "HASHED"
    material.use_backface_culling = False

    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (320.0, 300.0)

    emission = nodes.new("ShaderNodeEmission")
    emission.location = (20.0, 300.0)
    emission.inputs["Strength"].default_value = 1.0 if render_kind in {"oracleMask", "metadata"} else EMISSION_STRENGTHS[shading][name]

    if render_kind == "oracleMask":
        emission.inputs["Color"].default_value = ORACLE_MASK_COLOR
        links.new(emission.outputs["Emission"], output.inputs["Surface"])
        return material

    if render_kind == "metadata":
        geometry = nodes.new("ShaderNodeNewGeometry")
        geometry.location = (-620.0, 320.0)

        scale = nodes.new("ShaderNodeVectorMath")
        scale.location = (-400.0, 320.0)
        scale.operation = "SCALE"
        scale.inputs[3].default_value = 0.5

        offset = nodes.new("ShaderNodeVectorMath")
        offset.location = (-180.0, 320.0)
        offset.operation = "ADD"
        offset.inputs[1].default_value = (0.5, 0.5, 0.5)

        links.new(geometry.outputs["Normal"], scale.inputs[0])
        links.new(scale.outputs["Vector"], offset.inputs[0])
        links.new(offset.outputs["Vector"], emission.inputs["Color"])
        links.new(emission.outputs["Emission"], output.inputs["Surface"])
        return material

    if texture is None:
        raise RuntimeError("Textured render requires a loaded image texture.")

    image_texture = nodes.new("ShaderNodeTexImage")
    image_texture.location = (-280.0, 260.0)
    image_texture.image = texture
    image_texture.extension = "EXTEND"
    image_texture.interpolation = TEXTURE_INTERPOLATION[sampling_profile]
    image_texture.projection = "FLAT"

    links.new(image_texture.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])

    if texture_rotation in {"quarterTurn", "cameraAlignedLegacy"}:
        mapping = nodes.new("ShaderNodeMapping")
        mapping.location = (-460.0, 220.0)
        mapping.vector_type = "TEXTURE"
        mapping.inputs["Location"].default_value = (0.0, 0.0, 0.0)
        mapping.inputs["Rotation"].default_value = (0.0, 0.0, 0.0)
        mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.0)

        texture_coordinate = nodes.new("ShaderNodeTexCoord")
        texture_coordinate.location = (-640.0, 220.0)

        links.new(texture_coordinate.outputs["UV"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], image_texture.inputs["Vector"])

        if texture_rotation == "quarterTurn":
            mapping.inputs["Location"].default_value = (0.0, 1.0, 0.0)
            mapping.inputs["Rotation"].default_value = (0.0, 0.0, -math.pi / 2)

    return material


def create_terrain(
    scene_spec: dict,
    texture: bpy.types.Image | None,
    render_kind: str,
    shading: str,
    texture_rotation: str,
    sampling_profile: str,
) -> bpy.types.Object:
    vertices, polygons = get_mesh_data(scene_spec)
    mesh = bpy.data.meshes.new("TerrainMesh")
    mesh.from_pydata(vertices, [], [polygon[0] for polygon in polygons])
    mesh.update(calc_edges=True)

    materials = [
        build_material(name, texture, render_kind, shading, texture_rotation, sampling_profile) for name in MATERIAL_NAMES
    ]
    for material in materials:
        mesh.materials.append(material)

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon_index, polygon in enumerate(mesh.polygons):
        _, material_index, polygon_uvs = polygons[polygon_index]
        polygon.material_index = material_index
        polygon.use_smooth = False
        for loop_index, uv in zip(range(polygon.loop_start, polygon.loop_start + polygon.loop_total), polygon_uvs, strict=True):
            uv_layer.data[loop_index].uv = uv

    terrain = bpy.data.objects.new("Terrain", mesh)
    terrain.rotation_mode = "XYZ"
    bpy.context.scene.collection.objects.link(terrain)
    return terrain


def animate_legacy_camera_aligned_texture_rotation(terrain: bpy.types.Object, frame: int, rotation_z: float) -> None:
    quarter_turn = int(round((rotation_z % (2 * math.pi)) / (math.pi / 2))) % 4
    location_by_quarter_turn = (
        (0.0, 0.0, 0.0),
        (0.0, 1.0, 0.0),
        (1.0, 1.0, 0.0),
        (1.0, 0.0, 0.0),
    )
    rotation_by_quarter_turn = (
        0.0,
        -math.pi / 2,
        -math.pi,
        -3 * math.pi / 2,
    )

    for material in terrain.data.materials:
        mapping = next((node for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeMapping"), None)
        if mapping is None:
            continue
        mapping.inputs["Location"].default_value = location_by_quarter_turn[quarter_turn]
        mapping.inputs["Rotation"].default_value = (0.0, 0.0, rotation_by_quarter_turn[quarter_turn])
        mapping.inputs["Location"].keyframe_insert(data_path="default_value", frame=frame)
        mapping.inputs["Rotation"].keyframe_insert(data_path="default_value", frame=frame)


def animate_terrain(terrain: bpy.types.Object, texture_rotation: str, render_contract: dict, poses: tuple[tuple[float, float, float], ...]) -> None:
    for frame, (x, y, rotation_z) in enumerate(poses, start=render_contract["frame_start"]):
        terrain.location = (x, y, 0.0)
        terrain.rotation_euler = (0.0, 0.0, rotation_z)
        terrain.scale = (1.0, 1.0, 1.0)
        terrain.keyframe_insert(data_path="location", frame=frame)
        terrain.keyframe_insert(data_path="rotation_euler", frame=frame)
        terrain.keyframe_insert(data_path="scale", frame=frame)
        if texture_rotation == "cameraAlignedLegacy":
            # Keep texture north locked to the screen-space upper-right edge of
            # the tile while the terrain mesh rotates through slope variants.
            animate_legacy_camera_aligned_texture_rotation(terrain, frame, rotation_z)

    if terrain.animation_data and terrain.animation_data.action:
        terrain.animation_data.action.name = "TerrainAction.001"


def main() -> None:
    args = parse_args()
    scene_spec_path = Path(args.scene_spec).resolve()
    scene_spec = load_scene_spec(scene_spec_path)
    render_contract = get_render_contract(scene_spec)
    poses = get_poses(scene_spec)

    scene = clear_scene()
    output_dir = Path(args.output_dir).resolve()

    configure_scene(scene, args, output_dir, render_contract)
    create_camera(scene, render_contract)

    texture = None
    if args.render_kind == "textured":
        texture_path = Path(args.texture).resolve()
        texture = bpy.data.images.load(str(texture_path), check_existing=True)

    terrain = create_terrain(scene_spec, texture, args.render_kind, args.shading, args.texture_rotation, args.sampling_profile)
    animate_terrain(terrain, args.texture_rotation, render_contract, poses)

    scene.frame_set(render_contract["frame_start"])
    bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
