export function setNormalizedVelocity(
  azymuthRad: number,
  altitudeRad: number,
  output: Phaser.Math.Vector3,
): Phaser.Math.Vector3 {
  const horizontalSpeed = Math.cos(altitudeRad);
  output.x = Math.cos(azymuthRad) * horizontalSpeed;
  output.y = Math.sin(azymuthRad) * horizontalSpeed;
  output.z = Math.sin(altitudeRad);
  return output;
}

export function altitudeRadFromVelocityVector(vector: Phaser.Math.Vector3): number {
  return Math.asin(Math.max(-1, Math.min(1, vector.z)));
}

export function azimuthRadFromVelocityVector(vector: Phaser.Math.Vector3): number {
  return Math.atan2(vector.y, vector.x);
}

const SCREEN_WIDTH = 13.75; // inches (approx. width of a 16" MacBook Pro screen)
const DISTANCE_TO_SCREEN = 22; // inches (approx. distance from the user to the screen)
export function cameraHeight(width: number) {
  return width * (DISTANCE_TO_SCREEN / SCREEN_WIDTH);
}
