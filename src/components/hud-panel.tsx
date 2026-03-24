import React from "react";
import { MAX_THREE_ALIASING_RADIUS_TILES, MIN_THREE_ALIASING_RADIUS_TILES, type ThreeSeaDebugView } from "../../three/app.ts";
import fpsBus from "../store/fps.ts";
import hudPanelStore, {
  createClosedHudPanelSections,
  createDefaultHudPanelSections,
  type HudPanelSections,
} from "../store/hud-panel.ts";
import scoreStore from "../store/score.ts";
import threeDebugViewStore from "../store/three-debug-view.ts";
import threeLightingStore from "../store/three-lighting.ts";
import threeSeaDebugViewStore from "../store/three-sea-debug-view.ts";
import threeSeaStore from "../store/three-sea.ts";
import threeTerrainStore, {
  MAX_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE,
  MAX_THREE_TERRAIN_CORNER_NOISE_SCALE,
  MAX_THREE_TERRAIN_OCTAVE_MIX,
  MAX_THREE_TERRAIN_OCTAVE_SCALE,
  MIN_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE,
  MIN_THREE_TERRAIN_CORNER_NOISE_SCALE,
  MIN_THREE_TERRAIN_OCTAVE_MIX,
  MIN_THREE_TERRAIN_OCTAVE_SCALE,
  THREE_TERRAIN_CORNER_NOISE_AMPLITUDE_STEP,
  THREE_TERRAIN_CORNER_NOISE_SCALE_STEP,
  THREE_TERRAIN_OCTAVE_MIX_STEP,
  THREE_TERRAIN_OCTAVE_SCALE_STEP,
} from "../store/three-terrain.ts";
import timeScaleStore from "../store/time-scale.ts";
import threeCompassStore from "../store/three-compass.ts";
import { CompassRose } from "./compass-rose.tsx";
import { useBusValue, useStoreValue } from "./useStore.ts";

type HudPanelSectionKey = keyof HudPanelSections;

type HudSectionProps = {
  title: string;
  sectionKey: HudPanelSectionKey;
  children: React.ReactNode;
};

type HudSliderProps = {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

type HudColorProps = {
  label: string;
  colorHex: number;
  onChange: (colorHex: number) => void;
};

type HudButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function HudButton({ label, active, onClick }: HudButtonProps) {
  return (
    <button type="button" className="hud-button" data-active={active} onClick={onClick}>
      {label}
    </button>
  );
}

function HudSlider({ label, valueLabel, min, max, step, value, onChange }: HudSliderProps) {
  return (
    <label className="hud-control">
      <span className="hud-control-label">
        {label} <strong>{valueLabel}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
    </label>
  );
}

function HudColor({ label, colorHex, onChange }: HudColorProps) {
  return (
    <label className="hud-color-row">
      <span className="hud-control-label">{label}</span>
      <input
        className="hud-color-input"
        type="color"
        value={formatColorInputValue(colorHex)}
        onChange={(event) => onChange(parseColorInputValue(event.currentTarget.value))}
      />
    </label>
  );
}

function HudSection({ title, sectionKey, children }: HudSectionProps) {
  const hudPanelState = useStoreValue(hudPanelStore);
  const isOpen = hudPanelState.sections[sectionKey];

  return (
    <section className="hud-section">
      <button
        type="button"
        className="hud-section-toggle"
        data-open={isOpen}
        onClick={() =>
          hudPanelStore.set((current) => ({
            ...current,
            sections: {
              ...current.sections,
              [sectionKey]: !current.sections[sectionKey],
            },
          }))
        }
      >
        <span>{title}</span>
        <span>{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? <div className="hud-section-body">{children}</div> : null}
    </section>
  );
}

function formatColorInputValue(colorHex: number): string {
  return `#${colorHex.toString(16).padStart(6, "0")}`;
}

function parseColorInputValue(value: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`Invalid color input "${value}".`);
  const parsed = Number.parseInt(value.slice(1), 16);
  if (!Number.isInteger(parsed)) throw new Error(`Invalid color input "${value}".`);
  return parsed;
}

function formatSeaDebugLabel(view: ThreeSeaDebugView): string {
  switch (view) {
    case "final":
      return "Final";
    case "water-depth":
      return "Depth";
    case "water-normal":
      return "Normal";
    case "foam":
      return "Foam";
    case "caustics":
      return "Caustics";
    case "underwater-transmittance":
      return "Trans";
    default:
      throw new Error(view satisfies never);
  }
}

function areAllHudPanelSectionsCollapsed(sections: HudPanelSections): boolean {
  return (
    !sections.quick &&
    !sections.lighting &&
    !sections.terrain &&
    !sections.waves &&
    !sections.foam &&
    !sections.optics &&
    !sections.caustics &&
    !sections.colors &&
    !sections.quality
  );
}

export function HudPanel() {
  const fps = useBusValue(fpsBus);
  const score = useStoreValue(scoreStore);
  const timeScale = useStoreValue(timeScaleStore);
  const hudPanelState = useStoreValue(hudPanelStore);
  const threeDebugView = useStoreValue(threeDebugViewStore);
  const threeLighting = useStoreValue(threeLightingStore);
  const threeCompass = useStoreValue(threeCompassStore);
  const threeSea = useStoreValue(threeSeaStore);
  const threeSeaDebugView = useStoreValue(threeSeaDebugViewStore);
  const threeTerrain = useStoreValue(threeTerrainStore);
  const allSectionsCollapsed = areAllHudPanelSectionsCollapsed(hudPanelState.sections);

  return (
    <div className="hud">
      <div className="hud-top">
        <div>SCORE {score}</div>
        <div
          className="interactive"
          onClick={() => timeScaleStore.togglePause()}
          onDoubleClick={() => timeScaleStore.reset()}
        >
          TimeScale {Math.round(timeScale * 100)}%
        </div>
        <div>FPS {fps === undefined ? " - " : Math.round(fps)}</div>
        <div className="hud-top-actions">
          {hudPanelState.isOpen ? (
            <button
              type="button"
              className="hud-top-button"
              data-active={false}
              onClick={() =>
                hudPanelStore.set((current) => ({
                  ...current,
                  sections: allSectionsCollapsed ? createDefaultHudPanelSections() : createClosedHudPanelSections(),
                }))
              }
            >
              {allSectionsCollapsed ? "Open Defaults" : "Collapse All"}
            </button>
          ) : null}
          <button
            type="button"
            className="hud-top-button"
            data-active={hudPanelState.isOpen}
            onClick={() =>
              hudPanelStore.set((current) => ({
                ...current,
                isOpen: !current.isOpen,
              }))
            }
          >
            Controls
          </button>
        </div>
      </div>

      <aside className="hud-panel" data-open={hudPanelState.isOpen}>
        <div className="hud-panel-scroll">
          <HudSection title="Quick" sectionKey="quick">
            <div className="hud-control">
              <span className="hud-control-label">
                Terrain Debug <strong>{threeDebugView === "beauty" ? "Beauty" : "Checker"}</strong>
              </span>
              <div className="hud-button-row">
                <HudButton label="Beauty" active={threeDebugView === "beauty"} onClick={() => threeDebugViewStore.set("beauty")} />
                <HudButton label="Checker" active={threeDebugView === "checker"} onClick={() => threeDebugViewStore.set("checker")} />
              </div>
            </div>
            <div className="hud-control">
              <span className="hud-control-label">
                Sea Mode <strong>{threeSea.mode === "sea" ? "Sea" : "Off"}</strong>
              </span>
              <div className="hud-button-row">
                <HudButton label="Off" active={threeSea.mode === "off"} onClick={() => threeSeaStore.set((current) => ({ ...current, mode: "off" }))} />
                <HudButton label="Sea" active={threeSea.mode === "sea"} onClick={() => threeSeaStore.set((current) => ({ ...current, mode: "sea" }))} />
              </div>
            </div>
            <div className="hud-control">
              <span className="hud-control-label">
                Sea Debug <strong>{formatSeaDebugLabel(threeSeaDebugView)}</strong>
              </span>
              <div className="hud-button-grid">
                <HudButton label="Final" active={threeSeaDebugView === "final"} onClick={() => threeSeaDebugViewStore.set("final")} />
                <HudButton label="Depth" active={threeSeaDebugView === "water-depth"} onClick={() => threeSeaDebugViewStore.set("water-depth")} />
                <HudButton label="Normal" active={threeSeaDebugView === "water-normal"} onClick={() => threeSeaDebugViewStore.set("water-normal")} />
                <HudButton label="Foam" active={threeSeaDebugView === "foam"} onClick={() => threeSeaDebugViewStore.set("foam")} />
                <HudButton label="Caustics" active={threeSeaDebugView === "caustics"} onClick={() => threeSeaDebugViewStore.set("caustics")} />
                <HudButton
                  label="Trans"
                  active={threeSeaDebugView === "underwater-transmittance"}
                  onClick={() => threeSeaDebugViewStore.set("underwater-transmittance")}
                />
              </div>
            </div>
            <HudSlider
              label="Water Level"
              valueLabel={`${threeSea.waterLevelLevels.toFixed(2)} levels`}
              min={-2}
              max={8}
              step={0.05}
              value={threeSea.waterLevelLevels}
              onChange={(waterLevelLevels) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  waterLevelLevels,
                }))
              }
            />
            <HudSlider
              label="Foam Width"
              valueLabel={`${threeSea.foamWidthLevels.toFixed(2)} levels`}
              min={0.05}
              max={1.5}
              step={0.01}
              value={threeSea.foamWidthLevels}
              onChange={(foamWidthLevels) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foamWidthLevels,
                }))
              }
            />
            <div className="hud-button-row">
              <HudButton label="BOTW Calm Coast" active={false} onClick={() => threeSeaStore.reset()} />
            </div>
          </HudSection>

          <HudSection title="Lighting" sectionKey="lighting">
            <HudSlider
              label="Sun Azimuth"
              valueLabel={`${Math.round(threeLighting.sunAzimuthDeg)}°`}
              min={-180}
              max={180}
              step={1}
              value={threeLighting.sunAzimuthDeg}
              onChange={(sunAzimuthDeg) =>
                threeLightingStore.set((current) => ({
                  ...current,
                  sunAzimuthDeg,
                }))
              }
            />
            <HudSlider
              label="Sun Elevation"
              valueLabel={`${Math.round(threeLighting.sunElevationDeg)}°`}
              min={5}
              max={85}
              step={1}
              value={threeLighting.sunElevationDeg}
              onChange={(sunElevationDeg) =>
                threeLightingStore.set((current) => ({
                  ...current,
                  sunElevationDeg,
                }))
              }
            />
            <HudSlider
              label="Ambient"
              valueLabel={threeLighting.ambient.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              value={threeLighting.ambient}
              onChange={(ambient) =>
                threeLightingStore.set((current) => ({
                  ...current,
                  ambient,
                }))
              }
            />
            <HudSlider
              label="Aliasing Radius"
              valueLabel={`${threeLighting.aliasingRadiusTiles.toFixed(3)} tiles`}
              min={MIN_THREE_ALIASING_RADIUS_TILES}
              max={MAX_THREE_ALIASING_RADIUS_TILES}
              step={0.005}
              value={threeLighting.aliasingRadiusTiles}
              onChange={(aliasingRadiusTiles) =>
                threeLightingStore.set((current) => ({
                  ...current,
                  aliasingRadiusTiles,
                }))
              }
            />
          </HudSection>

          <HudSection title="Terrain" sectionKey="terrain">
            <HudSlider
              label="Corner Noise Scale"
              valueLabel={threeTerrain.cornerNoiseScale.toFixed(1)}
              min={MIN_THREE_TERRAIN_CORNER_NOISE_SCALE}
              max={MAX_THREE_TERRAIN_CORNER_NOISE_SCALE}
              step={THREE_TERRAIN_CORNER_NOISE_SCALE_STEP}
              value={threeTerrain.cornerNoiseScale}
              onChange={(cornerNoiseScale) =>
                threeTerrainStore.set((current) => ({
                  ...current,
                  cornerNoiseScale,
                }))
              }
            />
            <HudSlider
              label="Corner Noise Amplitude"
              valueLabel={threeTerrain.cornerNoiseAmplitude.toFixed(3)}
              min={MIN_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE}
              max={MAX_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE}
              step={THREE_TERRAIN_CORNER_NOISE_AMPLITUDE_STEP}
              value={threeTerrain.cornerNoiseAmplitude}
              onChange={(cornerNoiseAmplitude) =>
                threeTerrainStore.set((current) => ({
                  ...current,
                  cornerNoiseAmplitude,
                }))
              }
            />
            <HudSlider
              label="Octave Scale"
              valueLabel={threeTerrain.octaveScale.toFixed(2)}
              min={MIN_THREE_TERRAIN_OCTAVE_SCALE}
              max={MAX_THREE_TERRAIN_OCTAVE_SCALE}
              step={THREE_TERRAIN_OCTAVE_SCALE_STEP}
              value={threeTerrain.octaveScale}
              onChange={(octaveScale) =>
                threeTerrainStore.set((current) => ({
                  ...current,
                  octaveScale,
                }))
              }
            />
            <HudSlider
              label="Octave Mix"
              valueLabel={threeTerrain.octaveMix.toFixed(2)}
              min={MIN_THREE_TERRAIN_OCTAVE_MIX}
              max={MAX_THREE_TERRAIN_OCTAVE_MIX}
              step={THREE_TERRAIN_OCTAVE_MIX_STEP}
              value={threeTerrain.octaveMix}
              onChange={(octaveMix) =>
                threeTerrainStore.set((current) => ({
                  ...current,
                  octaveMix,
                }))
              }
            />
            <div className="hud-button-row">
              <HudButton label="Reset Terrain" active={false} onClick={() => threeTerrainStore.reset()} />
            </div>
          </HudSection>

          <HudSection title="Waves" sectionKey="waves">
            <div className="hud-subtitle">Swell A</div>
            <HudSlider
              label="Amplitude"
              valueLabel={`${threeSea.swellA.amplitudeLevels.toFixed(3)} levels`}
              min={0}
              max={0.5}
              step={0.005}
              value={threeSea.swellA.amplitudeLevels}
              onChange={(amplitudeLevels) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellA: { ...current.swellA, amplitudeLevels },
                }))
              }
            />
            <HudSlider
              label="Wavelength"
              valueLabel={`${threeSea.swellA.wavelengthTiles.toFixed(2)} tiles`}
              min={0.5}
              max={40}
              step={0.1}
              value={threeSea.swellA.wavelengthTiles}
              onChange={(wavelengthTiles) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellA: { ...current.swellA, wavelengthTiles },
                }))
              }
            />
            <HudSlider
              label="Speed"
              valueLabel={threeSea.swellA.speed.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.swellA.speed}
              onChange={(speed) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellA: { ...current.swellA, speed },
                }))
              }
            />
            <HudSlider
              label="Direction"
              valueLabel={`${threeSea.swellA.directionDeg.toFixed(0)}°`}
              min={-180}
              max={180}
              step={1}
              value={threeSea.swellA.directionDeg}
              onChange={(directionDeg) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellA: { ...current.swellA, directionDeg },
                }))
              }
            />

            <div className="hud-subtitle">Swell B</div>
            <HudSlider
              label="Amplitude"
              valueLabel={`${threeSea.swellB.amplitudeLevels.toFixed(3)} levels`}
              min={0}
              max={0.5}
              step={0.005}
              value={threeSea.swellB.amplitudeLevels}
              onChange={(amplitudeLevels) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellB: { ...current.swellB, amplitudeLevels },
                }))
              }
            />
            <HudSlider
              label="Wavelength"
              valueLabel={`${threeSea.swellB.wavelengthTiles.toFixed(2)} tiles`}
              min={0.5}
              max={40}
              step={0.1}
              value={threeSea.swellB.wavelengthTiles}
              onChange={(wavelengthTiles) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellB: { ...current.swellB, wavelengthTiles },
                }))
              }
            />
            <HudSlider
              label="Speed"
              valueLabel={threeSea.swellB.speed.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.swellB.speed}
              onChange={(speed) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellB: { ...current.swellB, speed },
                }))
              }
            />
            <HudSlider
              label="Direction"
              valueLabel={`${threeSea.swellB.directionDeg.toFixed(0)}°`}
              min={-180}
              max={180}
              step={1}
              value={threeSea.swellB.directionDeg}
              onChange={(directionDeg) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  swellB: { ...current.swellB, directionDeg },
                }))
              }
            />

            <div className="hud-subtitle">Chop</div>
            <HudSlider
              label="Amplitude"
              valueLabel={`${threeSea.chop.amplitudeLevels.toFixed(3)} levels`}
              min={0}
              max={0.5}
              step={0.005}
              value={threeSea.chop.amplitudeLevels}
              onChange={(amplitudeLevels) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  chop: { ...current.chop, amplitudeLevels },
                }))
              }
            />
            <HudSlider
              label="Wavelength"
              valueLabel={`${threeSea.chop.wavelengthTiles.toFixed(2)} tiles`}
              min={0.5}
              max={40}
              step={0.1}
              value={threeSea.chop.wavelengthTiles}
              onChange={(wavelengthTiles) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  chop: { ...current.chop, wavelengthTiles },
                }))
              }
            />
            <HudSlider
              label="Speed"
              valueLabel={threeSea.chop.speed.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.chop.speed}
              onChange={(speed) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  chop: { ...current.chop, speed },
                }))
              }
            />
            <HudSlider
              label="Direction"
              valueLabel={`${threeSea.chop.directionDeg.toFixed(0)}°`}
              min={-180}
              max={180}
              step={1}
              value={threeSea.chop.directionDeg}
              onChange={(directionDeg) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  chop: { ...current.chop, directionDeg },
                }))
              }
            />

            <div className="hud-subtitle">Ripple</div>
            <HudSlider
              label="Normal Strength"
              valueLabel={threeSea.ripple.normalStrength.toFixed(2)}
              min={0}
              max={1}
              step={0.01}
              value={threeSea.ripple.normalStrength}
              onChange={(normalStrength) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  ripple: { ...current.ripple, normalStrength },
                }))
              }
            />
            <HudSlider
              label="Scale"
              valueLabel={threeSea.ripple.scale.toFixed(2)}
              min={0.5}
              max={20}
              step={0.1}
              value={threeSea.ripple.scale}
              onChange={(scale) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  ripple: { ...current.ripple, scale },
                }))
              }
            />
            <HudSlider
              label="Speed"
              valueLabel={threeSea.ripple.speed.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.ripple.speed}
              onChange={(speed) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  ripple: { ...current.ripple, speed },
                }))
              }
            />
          </HudSection>

          <HudSection title="Foam" sectionKey="foam">
            <HudSlider
              label="Shore Strength"
              valueLabel={threeSea.foam.shoreStrength.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.foam.shoreStrength}
              onChange={(shoreStrength) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foam: { ...current.foam, shoreStrength },
                }))
              }
            />
            <HudSlider
              label="Crest Strength"
              valueLabel={threeSea.foam.crestStrength.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.foam.crestStrength}
              onChange={(crestStrength) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foam: { ...current.foam, crestStrength },
                }))
              }
            />
            <HudSlider
              label="Softness"
              valueLabel={threeSea.foam.softness.toFixed(2)}
              min={0.05}
              max={1}
              step={0.01}
              value={threeSea.foam.softness}
              onChange={(softness) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foam: { ...current.foam, softness },
                }))
              }
            />
            <HudSlider
              label="Voronoi Scale"
              valueLabel={threeSea.foam.voronoiScale.toFixed(2)}
              min={0.5}
              max={10}
              step={0.1}
              value={threeSea.foam.voronoiScale}
              onChange={(voronoiScale) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foam: { ...current.foam, voronoiScale },
                }))
              }
            />
            <HudSlider
              label="Voronoi Jitter"
              valueLabel={threeSea.foam.voronoiJitter.toFixed(2)}
              min={0}
              max={1}
              step={0.01}
              value={threeSea.foam.voronoiJitter}
              onChange={(voronoiJitter) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foam: { ...current.foam, voronoiJitter },
                }))
              }
            />
            <HudSlider
              label="Flow Speed"
              valueLabel={threeSea.foam.flowSpeed.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.foam.flowSpeed}
              onChange={(flowSpeed) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foam: { ...current.foam, flowSpeed },
                }))
              }
            />
            <HudSlider
              label="Warp Strength"
              valueLabel={threeSea.foam.warpStrength.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.foam.warpStrength}
              onChange={(warpStrength) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  foam: { ...current.foam, warpStrength },
                }))
              }
            />
          </HudSection>

          <HudSection title="Optics" sectionKey="optics">
            <HudSlider
              label="Surface Opacity"
              valueLabel={threeSea.surfaceOpacity.toFixed(2)}
              min={0}
              max={1}
              step={0.01}
              value={threeSea.surfaceOpacity}
              onChange={(surfaceOpacity) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  surfaceOpacity,
                }))
              }
            />
            <HudSlider
              label="Absorption Depth"
              valueLabel={`${threeSea.absorptionDepthLevels.toFixed(2)} levels`}
              min={0.1}
              max={4}
              step={0.05}
              value={threeSea.absorptionDepthLevels}
              onChange={(absorptionDepthLevels) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  absorptionDepthLevels,
                }))
              }
            />
            <HudSlider
              label="Bottom Visibility"
              valueLabel={threeSea.bottomVisibility.toFixed(2)}
              min={0}
              max={1}
              step={0.01}
              value={threeSea.bottomVisibility}
              onChange={(bottomVisibility) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  bottomVisibility,
                }))
              }
            />
            <HudSlider
              label="Refraction Strength"
              valueLabel={`${threeSea.refractionStrengthPx.toFixed(2)} px`}
              min={0}
              max={12}
              step={0.1}
              value={threeSea.refractionStrengthPx}
              onChange={(refractionStrengthPx) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  refractionStrengthPx,
                }))
              }
            />
            <HudSlider
              label="Fresnel Power"
              valueLabel={threeSea.fresnelPower.toFixed(2)}
              min={0.5}
              max={8}
              step={0.1}
              value={threeSea.fresnelPower}
              onChange={(fresnelPower) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  fresnelPower,
                }))
              }
            />
            <HudSlider
              label="Fresnel Strength"
              valueLabel={threeSea.fresnelStrength.toFixed(2)}
              min={0}
              max={1}
              step={0.01}
              value={threeSea.fresnelStrength}
              onChange={(fresnelStrength) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  fresnelStrength,
                }))
              }
            />
            <HudSlider
              label="Specular Strength"
              valueLabel={threeSea.specularStrength.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.specularStrength}
              onChange={(specularStrength) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  specularStrength,
                }))
              }
            />
            <HudSlider
              label="Glint Tightness"
              valueLabel={threeSea.glintTightness.toFixed(0)}
              min={1}
              max={128}
              step={1}
              value={threeSea.glintTightness}
              onChange={(glintTightness) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  glintTightness,
                }))
              }
            />
          </HudSection>

          <HudSection title="Caustics" sectionKey="caustics">
            <HudSlider
              label="Strength"
              valueLabel={threeSea.caustics.strength.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.caustics.strength}
              onChange={(strength) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  caustics: { ...current.caustics, strength },
                }))
              }
            />
            <HudSlider
              label="Scale"
              valueLabel={threeSea.caustics.scale.toFixed(2)}
              min={0.5}
              max={12}
              step={0.1}
              value={threeSea.caustics.scale}
              onChange={(scale) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  caustics: { ...current.caustics, scale },
                }))
              }
            />
            <HudSlider
              label="Speed"
              valueLabel={threeSea.caustics.speed.toFixed(2)}
              min={0}
              max={2}
              step={0.01}
              value={threeSea.caustics.speed}
              onChange={(speed) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  caustics: { ...current.caustics, speed },
                }))
              }
            />
            <HudSlider
              label="Depth Fade"
              valueLabel={`${threeSea.caustics.depthFadeLevels.toFixed(2)} levels`}
              min={0.1}
              max={4}
              step={0.05}
              value={threeSea.caustics.depthFadeLevels}
              onChange={(depthFadeLevels) =>
                threeSeaStore.set((current) => ({
                  ...current,
                  caustics: { ...current.caustics, depthFadeLevels },
                }))
              }
            />
          </HudSection>

          <HudSection title="Colors" sectionKey="colors">
            <HudColor label="Shallow" colorHex={threeSea.shallowColor} onChange={(shallowColor) => threeSeaStore.set((current) => ({ ...current, shallowColor }))} />
            <HudColor label="Deep" colorHex={threeSea.deepColor} onChange={(deepColor) => threeSeaStore.set((current) => ({ ...current, deepColor }))} />
            <HudColor label="Foam" colorHex={threeSea.foamColor} onChange={(foamColor) => threeSeaStore.set((current) => ({ ...current, foamColor }))} />
            <HudColor
              label="Caustics"
              colorHex={threeSea.causticsColor}
              onChange={(causticsColor) => threeSeaStore.set((current) => ({ ...current, causticsColor }))}
            />
            <HudColor
              label="Sky Reflection"
              colorHex={threeSea.skyReflectionColor}
              onChange={(skyReflectionColor) => threeSeaStore.set((current) => ({ ...current, skyReflectionColor }))}
            />
          </HudSection>

          <HudSection title="Quality" sectionKey="quality">
            <div className="hud-control">
              <span className="hud-control-label">
                Wave Octaves <strong>{threeSea.quality.waveOctaves}</strong>
              </span>
              <div className="hud-button-row">
                <HudButton
                  label="2"
                  active={threeSea.quality.waveOctaves === 2}
                  onClick={() =>
                    threeSeaStore.set((current) => ({
                      ...current,
                      quality: { ...current.quality, waveOctaves: 2 },
                    }))
                  }
                />
                <HudButton
                  label="3"
                  active={threeSea.quality.waveOctaves === 3}
                  onClick={() =>
                    threeSeaStore.set((current) => ({
                      ...current,
                      quality: { ...current.quality, waveOctaves: 3 },
                    }))
                  }
                />
              </div>
            </div>
            <div className="hud-control">
              <span className="hud-control-label">
                Voronoi Octaves <strong>{threeSea.quality.voronoiOctaves}</strong>
              </span>
              <div className="hud-button-row">
                <HudButton
                  label="1"
                  active={threeSea.quality.voronoiOctaves === 1}
                  onClick={() =>
                    threeSeaStore.set((current) => ({
                      ...current,
                      quality: { ...current.quality, voronoiOctaves: 1 },
                    }))
                  }
                />
                <HudButton
                  label="2"
                  active={threeSea.quality.voronoiOctaves === 2}
                  onClick={() =>
                    threeSeaStore.set((current) => ({
                      ...current,
                      quality: { ...current.quality, voronoiOctaves: 2 },
                    }))
                  }
                />
              </div>
            </div>
          </HudSection>
        </div>
      </aside>

      {threeCompass === null ? null : <CompassRose state={threeCompass} />}
    </div>
  );
}
