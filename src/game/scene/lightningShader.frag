precision highp float;

uniform sampler2D uMainSampler;                 // The rendered game scene
uniform sampler2D iChannel0;                    // The packed surface data (Normals in RGB, Height in Alpha)
uniform vec2 uSurfaceTexelSize;                 // The size of a single texel in the surface texture
uniform vec2 uMainTexelSize;                    // The size of a single texel in the main texture
uniform vec2 uResolution;                       // Screen resolution
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

const int ITERATIONS = 8;                       // Iterations for the binary search

const float PI = 3.14159;
const float DEGREES_TO_RADIANS = PI / 180.0;
const float COS45 = 0.70710678118;
const float SIN45 = 0.70710678118;
const mat3 rotation45 = mat3(vec3(COS45, -SIN45, 0.0), vec3(SIN45, COS45, 0.0), vec3(0.0, 0.0, 1.0));

const vec3 viewDirection = normalize(vec3(0.0, sin(30.0 * DEGREES_TO_RADIANS), cos(30.0 * DEGREES_TO_RADIANS))); // Surface to camera
const vec3 sunDirection = normalize(vec3(0.4, -1., .7)); // Surface to sun

const vec3 sunColor = vec3(.99, 0.98, 0.82);
const vec3 skyColor = vec3(0.53, 0.81, .98);
const vec3 sunRimColor = vec3(0.8, 0.85, 1.0);
const vec3 midGreyColor = vec3(0.5);

vec2 screenToSurfaceUV(vec2 screen) {
    vec2 tileCoord;
    tileCoord.x = (screen.x * uMapHalfTileInv.x + screen.y * uMapHalfTileInv.y) * 0.5 - 1.0;
    tileCoord.y = (screen.y * uMapHalfTileInv.y - screen.x * uMapHalfTileInv.x) * 0.5;
    return tileCoord * uMapSizeInTileInv;
}

float getSurfaceScreenYAt(vec2 screen) {
    float minScreenY = screen.y;
    float maxScreenY = screen.y + (uSurfaceMaxHeight - uSurfaceMinHeight) * uSurfaceHeightImpactOnScreenY;
    float screenY;
    float height;
    vec4 surface;

    for(int i = 0; i < ITERATIONS; i++) {
        screenY = (minScreenY + maxScreenY) * 0.5;
        surface = texture2D(iChannel0, screenToSurfaceUV(vec2(screen.x, screenY)));
        height = surface.a * (uSurfaceMaxHeight - uSurfaceMinHeight) + uSurfaceMinHeight;
        float occlusionPoint = screenY - height * uSurfaceHeightImpactOnScreenY;
        float isOccluded = step(screen.y, occlusionPoint);
        maxScreenY = mix(maxScreenY, screenY, isOccluded);
        minScreenY = mix(screenY, minScreenY, isOccluded);
    }

    return (minScreenY + maxScreenY) * 0.5;
}

vec4 averageSurfaceSamples(vec2 surfaceUV, float sampleDist) {
    vec4 surface0 = texture2D(iChannel0, surfaceUV);
    vec4 surface1 = texture2D(iChannel0, surfaceUV + vec2(0.0, uSurfaceTexelSize.y * sampleDist));
    vec4 surface2 = texture2D(iChannel0, surfaceUV + vec2(0.0, -uSurfaceTexelSize.y * sampleDist));
    vec4 surface3 = texture2D(iChannel0, surfaceUV + vec2(uSurfaceTexelSize.x * sampleDist, 0.0));
    vec4 surface4 = texture2D(iChannel0, surfaceUV + vec2(-uSurfaceTexelSize.x * sampleDist, 0.0));
    return (surface0 + surface1 + surface2 + surface3 + surface4) * 0.2;
}

vec3 contrast(vec3 color, float contrast) {
    return (color - midGreyColor) * contrast + midGreyColor;
}

// exposure > 3.0 lightens the scene
vec3 expose(vec3 color, float exposure) {
    return vec3(1.0) - exp(-color * exposure);
}

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    vec2 screen = uCameraWorld + (vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) * uCameraZoomInv);
    float surfaceScreenY = getSurfaceScreenYAt(screen);
    vec2 surfaceUV = screenToSurfaceUV(vec2(screen.x, surfaceScreenY));
    vec4 rawSurface = averageSurfaceSamples(surfaceUV, 0.5);
    float normalizedHeight = rawSurface.a;
    float height = normalizedHeight * (uSurfaceMaxHeight - uSurfaceMinHeight) + uSurfaceMinHeight;
    vec3 normal = rotation45 * (rawSurface.rgb * 2.0 - 1.0); // compensate for iso rotation

    float rimDot = 1.0 - abs(dot(viewDirection, normal));
    float rimAmount = smoothstep(.2, .7, rimDot);

    // Uncomment for debugging
    // vec3 sunDirection = normalize(vec3((uCameraPointer * uMainTexelSize - .5) * 2., .5));

    float ambientAmount = ((normalizedHeight * .4) + .6);
    float diffuseAmount = max(dot(normal, sunDirection), 0.0);

    vec3 litColor = (ambientAmount * skyColor + contrast(diffuseAmount * sunColor, 2.)) + diffuseAmount * rimAmount * sunRimColor;
    vec4 finalColor = vec4(color.rgb * litColor, 1.);

    // Uncomment for debugging
    // vec4 debugSurface = vec4(normal * 0.5 + 0.5, rawSurface.a);
    // float pointerDistance = distance(outTexCoord, uCameraPointer * uMainTexelSize) * uCameraZoomInv;
    // float pointerDistanceSmoothStep = smoothstep(0.2, 0.4, pointerDistance);
    // gl_FragColor = mix(debugSurface, finalColor, pointerDistanceSmoothStep);

    gl_FragColor = finalColor;
}
