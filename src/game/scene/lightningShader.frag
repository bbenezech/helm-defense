precision highp float;

uniform sampler2D uMainSampler; // The rendered game scene
uniform sampler2D iChannel0;    // The packed surface data (Normals in RGB, Height in Alpha)
uniform vec2 uSurfaceTexelSize; // The size of a single texel in the surface texture
uniform vec2 uMainTexelSize;    // The size of a single texel in the main texture
uniform vec2 uResolution;       // Screen resolution
uniform vec2 uCameraWorld;      // Camera's top-left corner in world coordinates
uniform float uZoomInv;         // Camera zoom level inverse
uniform vec2 uPointer;          // Pointer position in screen coordinates
uniform vec2 uMapTileSizeInv;   // Inverse dimensions of the map in tiles
uniform float uMinHeight;       // Minimum surface height
uniform float uMaxHeight;       // Maximum surface height
uniform vec2 uHalfTileInv;      // Inverse half-tile dimensions for coordinate math
uniform float uHeightImpactOnY; // The factor by which the height affects the Y coordinate in screen space

varying vec2 outTexCoord;       // uMainSampler texture coordinates

const int ITERATIONS = 8;       // Iterations for the binary search

const float COS45 = 0.70710678118;
const float SIN45 = 0.70710678118;
mat3 rotation45 = mat3(vec3(COS45, -SIN45, 0.0), vec3(SIN45, COS45, 0.0), vec3(0.0, 0.0, 1.0));

vec2 screenToSurfaceUV(vec2 screen) {
    vec2 tileCoord;
    tileCoord.x = (screen.x * uHalfTileInv.x + screen.y * uHalfTileInv.y) * 0.5 - 1.0;
    tileCoord.y = (screen.y * uHalfTileInv.y - screen.x * uHalfTileInv.x) * 0.5;
    return tileCoord * uMapTileSizeInv;
}

float getSurfaceScreenYAt(vec2 screen) {
    float minScreenY = screen.y;
    float maxScreenY = screen.y + (uMaxHeight - uMinHeight) * uHeightImpactOnY;
    float screenY;
    float height;
    vec4 surface;

    for(int i = 0; i < ITERATIONS; i++) {
        screenY = (minScreenY + maxScreenY) * 0.5;
        surface = texture2D(iChannel0, screenToSurfaceUV(vec2(screen.x, screenY)));
        height = surface.a * (uMaxHeight - uMinHeight) + uMinHeight;
        float occlusionPoint = screenY - height * uHeightImpactOnY;
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

void main() {
    vec4 color = texture2D(uMainSampler, outTexCoord);
    vec2 screen = uCameraWorld + (vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) * uZoomInv);
    float surfaceScreenY = getSurfaceScreenYAt(screen);
    vec2 surfaceUV = screenToSurfaceUV(vec2(screen.x, surfaceScreenY));
    vec4 rawSurface = averageSurfaceSamples(surfaceUV, 0.5);
    float height = rawSurface.a * (uMaxHeight - uMinHeight) + uMinHeight;
    vec3 normal = rotation45 * (rawSurface.rgb * 2.0 - 1.0); // compensate for iso rotation

    vec4 debugSurface = vec4(normal * 0.5 + 0.5, rawSurface.a);
    float pointerDistance = distance(outTexCoord, uPointer * uMainTexelSize) * uZoomInv;
    float lightAmount = smoothstep(0.2, 0.4, pointerDistance);

    gl_FragColor = mix(debugSurface, color, lightAmount);
}
