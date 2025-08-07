precision highp float;
#define COS45 0.70710678118
#define SIN45 0.70710678118
#define RAD_IN_DEGRE 0.017453292519943295 // PI / 180
#define PI 3.14159265358979323846 // Pi constant
uniform sampler2D uMainSampler;                 // The rendered game scene
uniform sampler2D iChannel0;                    // The packed surface data (Normals in RGB, Height in Alpha)
uniform vec2 uSurfaceTexelSize;                 // The size of a single texel in the surface texture
uniform vec2 uResolution;                       // Screen resolution
uniform float uCameraAngle;
uniform vec2 uMainTexelSize;                    // The size of a single texel in the main texture (1/uResolution)
uniform vec2 uCameraWorld;                      // Camera's top-left corner in world coordinates
uniform float uCameraZoomInv;                   // Camera zoom level inverse
uniform vec2 uCameraPointer;                    // Pointer position in screen coordinates
uniform float uSurfaceMinHeight;                // Minimum surface height
uniform float uSurfaceMaxHeight;                // Maximum surface height
uniform float uSurfaceHeightImpactOnScreenY;    // The factor by which one unit of height affects the Y coordinate in screen space
uniform vec2 uMapHalfTileInv;                   // Inverse half-tile dimensions for coordinate math
uniform vec2 uMapSizeInTileInv;                 // Inverse dimensions of the map in tiles
uniform float uTime;                            // Current time in seconds for animation
varying vec2 outTexCoord;                       // uMainSampler texture coordinates
const mat3 rotation45 = mat3(vec3(COS45, -SIN45, 0.0), vec3(SIN45, COS45, 0.0), vec3(0.0, 0.0, 1.0));
const int ITERATIONS = 200;                       // Iterations for the binary search

const vec3 sunDirection = normalize(vec3(0.4, -1., .7)); // Surface to sun
const vec3 sunColor = vec3(.99, 0.98, 0.82);
const vec3 skyColor = vec3(0.53, 0.81, .98);
const vec3 sunRimColor = vec3(0.8, 0.85, 1.0);
const vec3 midGreyColor = vec3(0.5);

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 mod7(vec3 x) {
  return x - floor(x * (1.0 / 7.0)) * 7.0;
}

vec3 permute(vec3 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

// https://github.com/ashima/webgl-noise
float simplex(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
  0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
  -0.577350269189626,  // -1.0 + 2.0 * C.x
  0.024390243902439); // 1.0 / 41.0
// First corner
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  // Other corners
  vec2 i1;
  //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
  //i1.y = 1.0 - i1.x;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  // x0 = x0 - 0.0 + 0.0 * C.xx ;
  // x1 = x0 - i1 + 1.0 * C.xx ;
  // x2 = x0 - 1.0 + 2.0 * C.xx ;
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

// Permutations
  i = mod289(i); // Avoid truncation effects in permutation
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

// Gradients: 41 points uniformly over a line, mapped onto a diamond.
// The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

// Normalise gradients implicitly by scaling m
// Approximation of: m *= inversesqrt( a0*a0 + h*h );
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

// Compute final noise value at P
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// https://github.com/ashima/webgl-noise
vec2 voronoi(vec2 P) {
  const float K = 0.142857142857; // 1/7
  const float Ko = 0.428571428571; // 3/7
  const float jitter = 1.0; // Less gives more regular pattern

  vec2 Pi = mod289(floor(P));
  vec2 Pf = fract(P);
  vec3 oi = vec3(-1.0, 0.0, 1.0);
  vec3 of = vec3(-0.5, 0.5, 1.5);
  vec3 px = permute(Pi.x + oi);
  vec3 p = permute(px.x + Pi.y + oi); // p11, p12, p13
  vec3 ox = fract(p * K) - Ko;
  vec3 oy = mod7(floor(p * K)) * K - Ko;
  vec3 dx = Pf.x + 0.5 + jitter * ox;
  vec3 dy = Pf.y - of + jitter * oy;
  vec3 d1 = dx * dx + dy * dy; // d11, d12 and d13, squared
  p = permute(px.y + Pi.y + oi); // p21, p22, p23
  ox = fract(p * K) - Ko;
  oy = mod7(floor(p * K)) * K - Ko;
  dx = Pf.x - 0.5 + jitter * ox;
  dy = Pf.y - of + jitter * oy;
  vec3 d2 = dx * dx + dy * dy; // d21, d22 and d23, squared
  p = permute(px.z + Pi.y + oi); // p31, p32, p33
  ox = fract(p * K) - Ko;
  oy = mod7(floor(p * K)) * K - Ko;
  dx = Pf.x - 1.5 + jitter * ox;
  dy = Pf.y - of + jitter * oy;
  vec3 d3 = dx * dx + dy * dy; // d31, d32 and d33, squared
	// Sort out the two smallest distances (F1, F2)
  vec3 d1a = min(d1, d2);
  d2 = max(d1, d2); // Swap to keep candidates for F2
  d2 = min(d2, d3); // neither F1 nor F2 are now in d3
  d1 = min(d1a, d2); // F1 is now in d1
  d2 = max(d1a, d2); // Swap to keep candidates for F2
  d1.xy = (d1.x < d1.y) ? d1.xy : d1.yx; // Swap if smaller
  d1.xz = (d1.x < d1.z) ? d1.xz : d1.zx; // F1 is in d1.x
  d1.yz = min(d1.yz, d2.yz); // F2 is now not in d2.yz
  d1.y = min(d1.y, d1.z); // nor in  d1.z
  d1.y = min(d1.y, d2.x); // F2 is in d1.y, we're done.
  return sqrt(d1.xy);
}

vec2 worldToMapUV(vec2 world) {
  vec2 tileCoord;
  tileCoord.x = (world.x * uMapHalfTileInv.x + world.y * uMapHalfTileInv.y) * 0.5 - 1.0;
  tileCoord.y = (world.y * uMapHalfTileInv.y - world.x * uMapHalfTileInv.x) * 0.5;
  return tileCoord * uMapSizeInTileInv;
}

float getWorldYAtGround(vec2 worldFloor) {
  float minY = worldFloor.y;
  float maxY = worldFloor.y + (uSurfaceMaxHeight - uSurfaceMinHeight) * uSurfaceHeightImpactOnScreenY;
  float worldGroundY;
  float height;
  vec4 surface;

  for(int i = 0; i < ITERATIONS; i++) {
    worldGroundY = (minY + maxY) * 0.5;
    surface = texture2D(iChannel0, worldToMapUV(vec2(worldFloor.x, worldGroundY)));
    height = surface.a * (uSurfaceMaxHeight - uSurfaceMinHeight) + uSurfaceMinHeight;
    float occlusionPoint = worldGroundY - height * uSurfaceHeightImpactOnScreenY;
    float isOccluded = step(worldFloor.y, occlusionPoint);
    maxY = mix(maxY, worldGroundY, isOccluded);
    minY = mix(worldGroundY, minY, isOccluded);
  }

  worldGroundY = (minY + maxY) * 0.5;

  return worldGroundY;
}

vec4 averageSurfaceSamples(vec2 mapUV, float sampleDist) {
  // vec4 surface0 = texture2D(iChannel0, mapUV);
  vec4 surface1 = texture2D(iChannel0, mapUV + vec2(0.0, uSurfaceTexelSize.y * sampleDist));
  vec4 surface2 = texture2D(iChannel0, mapUV + vec2(0.0, -uSurfaceTexelSize.y * sampleDist));
  vec4 surface3 = texture2D(iChannel0, mapUV + vec2(uSurfaceTexelSize.x * sampleDist, 0.0));
  vec4 surface4 = texture2D(iChannel0, mapUV + vec2(-uSurfaceTexelSize.x * sampleDist, 0.0));
  return (surface1 + surface2 + surface3 + surface4) * .25;
}

vec3 contrast(vec3 color, float contrast) {
  return (color - midGreyColor) * contrast + midGreyColor;
}

vec3 expose(vec3 color, float exposure) {
  // exposure > 3.0 lightens the scene
  return vec3(1.0) - exp(-color * exposure);
}

void main() {
  vec4 originalColor = texture2D(uMainSampler, outTexCoord);
  float cameraElevation = uCameraAngle * RAD_IN_DEGRE;
  vec3 viewDirection = normalize(vec3(0.0, sin(cameraElevation), cos(cameraElevation))); // Surface to camera
  float alpha = step(0.01, max(originalColor.r, max(originalColor.g, originalColor.b)));

  vec2 worldFloor = uCameraWorld + (vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) * uCameraZoomInv);
  vec2 worldGround = vec2(worldFloor.x, getWorldYAtGround(worldFloor));

  vec4 surface = averageSurfaceSamples(worldToMapUV(worldGround), 0.5);
  float normalizedSurfaceHeight = surface.a;
  // float surfaceHeight = normalizedSurfaceHeight * (uSurfaceMaxHeight - uSurfaceMinHeight) + uSurfaceMinHeight;
  vec3 surfaceNormal = rotation45 * (surface.rgb * 2.0 - 1.0); // compensate for isometric rotation

  float rimDot = 1.0 - abs(dot(viewDirection, surfaceNormal));
  float rimAmount = smoothstep(.2, .35, rimDot);
  float ambientAmount = ((normalizedSurfaceHeight * .2) + .8);
  // vec3 sunDirection = normalize(vec3((uCameraPointer * uMainTexelSize - .5) * 2., .5));
  float diffuseAmount = max(dot(surfaceNormal, sunDirection), 0.0);
  vec3 litColor = (ambientAmount * skyColor + contrast(diffuseAmount * sunColor, 2.)) + diffuseAmount * rimAmount * sunRimColor;

  vec4 finalColor = vec4(originalColor.rgb * litColor, 1.);

  // vec4 debugSurface = vec4(surfaceNormal * 0.5 + 0.5, surface.a);
  // float pointerDistance = distance(outTexCoord, uCameraPointer * uMainTexelSize) * uCameraZoomInv;
  // float pointerDistanceSmoothStep = step(0.2, pointerDistance);
  // finalColor = mix(debugSurface, finalColor, pointerDistanceSmoothStep);

  finalColor *= alpha;

  gl_FragColor = finalColor;
}
