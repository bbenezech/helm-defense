import React from "react";
import type { CompassCardinal, CompassVector, ThreeCompassState } from "../../three/projection.ts";

type CompassRoseProps = {
  state: ThreeCompassState;
};

type CompassArm = {
  cardinal: CompassCardinal;
  label: string;
};

const COMPASS_ARMS: CompassArm[] = [
  { cardinal: "north", label: "N" },
  { cardinal: "east", label: "E" },
  { cardinal: "south", label: "S" },
  { cardinal: "west", label: "W" },
];

function normalizeVector(vector: CompassVector, label: CompassCardinal): CompassVector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) throw new Error(`Compass arm "${label}" must not be zero.`);

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function getCompassArmVector(state: ThreeCompassState, cardinal: CompassCardinal): CompassVector {
  switch (cardinal) {
    case "north":
      return normalizeVector(state.north, cardinal);
    case "east":
      return normalizeVector(state.east, cardinal);
    case "south":
      return normalizeVector(state.south, cardinal);
    case "west":
      return normalizeVector(state.west, cardinal);
    default:
      throw new Error(cardinal satisfies never);
  }
}

export function CompassRose({ state }: CompassRoseProps) {
  const center = 36;
  const armLength = 16;
  const labelRadius = 24;

  return (
    <div className="hud-compass" aria-label="Compass">
      <svg className="hud-compass-svg" viewBox="0 0 72 72" role="img" aria-hidden="true">
        <circle className="hud-compass-ring" cx={center} cy={center} r={28} />
        <circle className="hud-compass-core" cx={center} cy={center} r={3} />
        {COMPASS_ARMS.map((arm) => {
          const vector = getCompassArmVector(state, arm.cardinal);
          const armEndX = center + vector.x * armLength;
          const armEndY = center + vector.y * armLength;
          const labelX = center + vector.x * labelRadius;
          const labelY = center + vector.y * labelRadius;

          return (
            <React.Fragment key={arm.cardinal}>
              <line
                className={`hud-compass-arm hud-compass-arm-${arm.cardinal}`}
                x1={center}
                y1={center}
                x2={armEndX}
                y2={armEndY}
              />
              <text className="hud-compass-label" x={labelX} y={labelY} textAnchor="middle" dominantBaseline="central">
                {arm.label}
              </text>
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
}
