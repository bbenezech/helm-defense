export const WORLD_UNIT_PER_METER = 16; // World unit per meter. With our camera, 1px on x = 1 world unit
export const ENEMY_SPRITE = "enemy"; // Enemy sprite key
export const CANNON_SPRITE = "cannon"; // Cannon sprite key
export const BULLET_SPRITE = "bullet"; // Bullet sprite key
export const PARTICLE_SPRITE = "particle";
export const PIXEL_CANNON_SPRITE = "pixel-cannon";
export const CANNON_WHEELS_SPRITE = "cannon-wheels";
export const CANNON_WHEELS_SPRITE_ROTATION = Math.PI * 1.5; // to make it face right
export const FLARES = "flares";
export const PLAY_SOUNDS: boolean = true;
export const GRAVITY_SI = 9.81;
export const GRAVITY_WORLD = new Phaser.Math.Vector3(0, 0, -GRAVITY_SI * WORLD_UNIT_PER_METER);

const TWELVE_POUND_BULLET_SI = { speed: 440, mass: 6, radius: 0.06 };

const SLOW_BALLISTIC_FACTOR = 8; // slower ballistics so that it looks fun

// make a bullet with the same impact, but with a scaled speed
// - speed is scaled down by factor
// - mass is scaled up by factor^2 to compensate for the slower speed on impact
// - radius is scaled up by factor^2/3 to keep the impact visually realistic with the fake mass
function getBullet(bulletSI: { speed: number; mass: number; radius: number }, factor: number) {
  const speedSI = bulletSI.speed / factor;
  const speed = speedSI * WORLD_UNIT_PER_METER;
  const mass = bulletSI.mass * factor * factor;
  const radiusSI = bulletSI.radius * Math.pow(factor, 2 / 3);
  const radius = Math.ceil(radiusSI * WORLD_UNIT_PER_METER);
  const sqRadius = radius * radius;
  const invMass = 1 / mass;

  return { speedSI, speed, mass, radiusSI, radius, sqRadius, invMass };
}

export const BULLET = getBullet(TWELVE_POUND_BULLET_SI, SLOW_BALLISTIC_FACTOR);

export const VISIBLE_UPDATE_INTERVAL_MS = 1; // Target 120 FPS when visible
export const INVISIBLE_UPDATE_INTERVAL_MS = 100; // Target 10 FPS when invisible

// Angle (θ): The camera's pitch angle measured downwards from the horizontal plane (0° = horizontal, 90° = straight down).

// Orthographic Projection: A standard projection where parallel lines remain parallel.
// Y-Compression (sin θ): Represents how much the worldY axis (depth) is visually compressed along the screen's Y-axis relative to the worldX axis. A factor of 1 means no compression; 0.5 means it appears half as long.
// Z-Influence (cos θ): Represents how much worldZ (height) shifts the point along the screen's Y-axis (positive cos θ means positive worldZ decreases screenY, assuming screen Y increases downwards).
// Approximate Formula: screenY ≈ worldY * sin(θ) - worldZ * cos(θ)

// Floor-Aligned Projection (Y=1): A modified projection common in games where the Y-compression is removed (Y-Factor is forced to 1) for simpler ground-plane mapping.
// Z-Influence (cot θ): The adjusted factor for worldZ needed to maintain the original visual slant relative to the uncompressed worldY. (cot θ = cos θ / sin θ).
// Approximate Formula: screenY ≈ worldY * 1.0 - worldZ * cot(θ)

// Angle                 <---- Orthographic Projection ---->                <-- Floor-Aligned (Y=1) -->
// Perspective Name      (degrees)   Y-Compression   Z-Influence            Z-Influence                    Notes
//                       (θ)         (`sin θ`)       (`cos θ`)              (`cot θ`)
// ------------------    ---------   -------------   -----------            -----------                    ----------------------------------------------------------------------
// trueTopDown           90.0°       1.0000          0.0000                 0.0000                         No perspective effect. Z has no influence on screen Y position.
// zelda-high            85.0°       0.9962          0.0872                 0.0875                         Very slight perspective. Y barely compressed. Low Z influence.
// zelda-low             75.0°       0.9659          0.2588                 0.2679                         Mild perspective, common in many older JRPGs.
// threeQuarter          60.0°       0.8660          0.5000                 0.5774                         Significant perspective. Y noticeably compressed. Balanced Z influence.
// oblique               45.0°       0.7071          0.7071                 1.0000                         Balanced Orthographic factors. Floor-Aligned Z-factor matches Cavalier.
// trueIsometric         35.264°     0.5774          0.8165                 1.4142                         Mathematically precise Isometric angle. High Z influence.
// pixelArtIsometric     30.0°       0.5000          0.8660                 1.7321                         Common game Isometric. Y compressed by half. Very high Z influence.
export const PERSPECTIVE_INDEX = {
  // in parentheses: the ratio z/y lengths in non axonometric projection, length of the z axis in axonometric projection
  topDown: 90,
  zeldaHigh: 85,
  zeldaLow: 75,
  threeQuarter: 60,
  oblique: 45,
  trueIsometric: 35.264,
  pixelArtIsometric: 30, // arctan(sin(30°)) is equal to ≈26.565° and forms a 2:1 pixel ratio https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Isometric_camera_view_30_degrees_color.png/1920px-Isometric_camera_view_30_degrees_color.png
  platformer: 10,
};

export const PERSPECTIVES = Object.keys(PERSPECTIVE_INDEX) as (keyof typeof PERSPECTIVE_INDEX)[];
