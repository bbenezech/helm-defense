import Phaser from "phaser";

/**
 * Creates a sprite-less, procedural crater mark on the ground.
 * The crater has an open entry, can be rotated to the impact direction,
 * and stretched to simulate perspective. It fades out over time.
 *
 * @param scene The Phaser.Scene to add the crater to.
 * @param x The world x-coordinate of the impact.
 * @param y The world y-coordinate of the impact.
 * @param options Configuration for the crater's appearance and behavior.
 * @param options.angle The angle of impact in radians. The crater's opening will face this direction.
 * @param options.radius The base radius of the crater (default: 20).
 * @param options.stretch How much to stretch the crater along the impact axis (e.g., 1.5 for a long crater).
 * @param options.duration The time in milliseconds for the crater to fade out (default: 5000).
 * @param options.color The main color of the crater (default: 0x000000 for black).
 */
export function createCraterMark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: {
    rotation: number;
    radius?: number;
    stretchX?: number;
    stretchY?: number;
    duration?: number;
    color?: number;
  },
) {
  const { rotation, radius = 20, stretchX = 1, stretchY = 1, duration = 5000, color = 0x000000 } = options;

  // 1. Create the Container. This will handle the final position and rotation.
  const container = scene.add.container(x, y);
  container.scaleX = stretchX; // Apply initial stretch to the container
  container.scaleY = stretchY; // Apply initial stretch to the container

  // 2. Create the Graphics object. This will be a child of the container.
  // We will draw and stretch it, but not rotate it directly.
  const craterGraphics = scene.add.graphics(); // Created at (0,0) relative to container
  container.add(craterGraphics);

  craterGraphics.rotation = rotation + Math.PI; // Rotate the graphics to match the impact direction
  // 2. Draw the Crater Shape
  // The 'opening' will be 60 degrees wide (PI/3 radians).
  // We calculate the start and end angles for the arc.
  const openingAngle = Math.PI / 3;
  const startAngle = openingAngle / 2;
  const endAngle = 2 * Math.PI - openingAngle / 2;

  // Draw the main, semi-transparent blast mark (the soft outer edge).
  // A wide line style with low alpha gives a nice "blast shadow" effect.
  craterGraphics.lineStyle(radius * 0.6, color, 0.3);
  craterGraphics.beginPath();
  craterGraphics.arc(0, 0, radius, startAngle, endAngle);
  craterGraphics.strokePath();

  // Draw the sharper, more defined inner crater rim.
  // A thinner line with higher alpha.
  craterGraphics.lineStyle(3, color, 0.5);
  craterGraphics.beginPath();
  craterGraphics.arc(0, 0, radius * 0.8, startAngle, endAngle);
  craterGraphics.strokePath();

  // 3. Animate and Destroy
  // Add a tween to fade the crater's alpha to 0 and then destroy it.
  // This is crucial for performance to avoid accumulating thousands of objects.
  scene.tweens.add({
    targets: container,
    alpha: 0,
    ease: "Power1",
    duration: duration,
    onComplete: () => {
      container.destroy(); // Clean up the GameObject
    },
  });

  return container;
}
