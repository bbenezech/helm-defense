#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { saveImageDataToImage } from "./lib/file.ts";
import {
  assertSceneAndTilesetContracts,
  buildCoverageFixtures,
  composeCoverage,
  getCanvasBounds,
  getCanonicalTileset,
  getElevationYOffsetPx,
  getFixturePlacements,
  type CoverageTileset,
  type CoverageFixture,
  type CoverageImage,
  type Placement,
} from "./lib/terrain-coverage-proof.ts";
import { rasterizeOwnershipFrames } from "./lib/terrain-ownership.ts";
import { createPackedTerrainCodec, type ResolveColorAtlas, type ResolveHit, type ResolveTraceCandidate } from "../three/codec.ts";

const __dirname = import.meta.dirname;
const DEFAULT_TILESET_DIRECTORY = path.resolve(__dirname, "../public/Grass_23-512x512");
const DEFAULT_REPORT_DIRECTORY = path.resolve(__dirname, "../tmp/three-resolve-report");

type ResolveCounts = {
  uncovered: number;
  stray: number;
  wrongOwner: number;
};

type FailureReason = "uncovered" | "stray" | "wrongOwner";
type ResolveTerrainMap = Parameters<typeof createPackedTerrainCodec>[0];
type ResolveTerrainTileset = Parameters<typeof createPackedTerrainCodec>[1];
type ResolveTerrainLayer = ResolveTerrainMap["layers"][number];

type ValidationSummary = {
  tilesetDirectory: string;
  reportDirectory: string;
  fixture: string;
  fixtures: Array<{ name: string; width: number; height: number; counts: ResolveCounts }>;
};

type PlacementReport = Placement & {
  level: number;
  octave: number;
  slice: number;
  packedX: number;
  packedY: number;
  textureX: number;
  textureY: number;
  painterRank: number;
};

type ResolveTraceCandidateReport = {
  ordinal: number;
  d: number;
  s: number;
  slice: number;
  packedX: number;
  packedY: number;
  textureX: number;
  textureY: number;
  localX: number;
  localY: number;
  shapeRef: number;
  painterRank: number;
  sampledAlpha: number;
  key: number;
  placementId: number | null;
  label: string | null;
};

type ResolveHitReport = {
  word: number;
  shapeRef: number;
  tileId: number;
  biomeIndex: number;
  painterRank: number;
  packedX: number;
  packedY: number;
  textureX: number;
  textureY: number;
  slice: number;
  key: number;
  screen: { x: number; y: number };
  rgba: [number, number, number, number];
  placement: PlacementReport;
};

type FirstFailureReport =
  | { status: "clean" }
  | {
      status: "failure";
      reason: FailureReason;
      worldX: number;
      worldY: number;
      canvasX: number;
      canvasY: number;
      oracleOwner: PlacementReport | null;
      actualHit: ResolveHitReport | null;
      trace: ResolveTraceCandidateReport[];
    };

type ResolveFixtureResult = {
  fixture: CoverageFixture;
  width: number;
  height: number;
  counts: ResolveCounts;
  oracleCoverage: CoverageImage;
  resolveCoverage: CoverageImage;
  firstFailure: FirstFailureReport;
};

function assertObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return Object.fromEntries(Object.entries(value));
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== "string") throw new Error(message);
  return value;
}

function assertNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) throw new Error(message);
  return value;
}

function assertArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function parseTilesetProperty(value: unknown, index: number): ResolveTerrainTileset["properties"][number] {
  const object = assertObject(value, `Invalid tileset property at index ${index}.`);
  const propertyValue = object["value"];
  if (typeof propertyValue !== "number" && typeof propertyValue !== "string") {
    throw new Error(`Invalid tileset property value at index ${index}.`);
  }

  return {
    name: assertString(object["name"], `Missing tileset property name at index ${index}.`),
    type: assertString(object["type"], `Missing tileset property type at index ${index}.`),
    value: propertyValue,
  };
}

function parseTilesetTile(value: unknown, index: number): ResolveTerrainTileset["tiles"][number] {
  const object = assertObject(value, `Invalid tileset tile at index ${index}.`);
  return {
    id: assertNumber(object["id"], `Missing tileset tile id at index ${index}.`),
    probability: assertNumber(object["probability"], `Missing tileset tile probability at index ${index}.`),
    properties: assertArray(object["properties"], `Missing tileset tile properties at index ${index}.`).map((property, propertyIndex) =>
      parseTilesetProperty(property, propertyIndex),
    ),
  };
}

function parseTilesetJson(value: unknown): ResolveTerrainTileset {
  const object = assertObject(value, "Invalid terrain tileset JSON.");
  const type = assertString(object["type"], "Missing tileset type.");
  if (type !== "tileset") throw new Error(`Invalid tileset type "${type}".`);

  return {
    type,
    name: assertString(object["name"], "Missing tileset name."),
    image: assertString(object["image"], "Missing tileset image."),
    tilewidth: assertNumber(object["tilewidth"], "Missing tileset tilewidth."),
    tileheight: assertNumber(object["tileheight"], "Missing tileset tileheight."),
    tilecount: assertNumber(object["tilecount"], "Missing tileset tilecount."),
    rows: assertNumber(object["rows"], "Missing tileset rows."),
    columns: assertNumber(object["columns"], "Missing tileset columns."),
    spacing: assertNumber(object["spacing"], "Missing tileset spacing."),
    margin: assertNumber(object["margin"], "Missing tileset margin."),
    imagewidth: assertNumber(object["imagewidth"], "Missing tileset imagewidth."),
    imageheight: assertNumber(object["imageheight"], "Missing tileset imageheight."),
    tiles: assertArray(object["tiles"], "Missing tileset tiles.").map((tile, index) => parseTilesetTile(tile, index)),
    version: assertString(object["version"], "Missing tileset version."),
    tiledversion: assertString(object["tiledversion"], "Missing tileset tiledversion."),
    properties: assertArray(object["properties"], "Missing tileset properties.").map((property, index) =>
      parseTilesetProperty(property, index),
    ),
  };
}

function toCoverageTileset(tileset: ResolveTerrainTileset): CoverageTileset {
  return {
    type: tileset.type,
    name: tileset.name,
    image: tileset.image,
    tilewidth: tileset.tilewidth,
    tileheight: tileset.tileheight,
    tilecount: tileset.tilecount,
    rows: tileset.rows,
    columns: tileset.columns,
    spacing: tileset.spacing,
    margin: tileset.margin,
    imagewidth: tileset.imagewidth,
    imageheight: tileset.imageheight,
    tiles: tileset.tiles.map((tile) => ({
      id: tile.id,
      probability: tile.probability,
      properties: tile.properties.map((property) => ({
        name: property.name,
        type: property.type,
        value: property.value,
      })),
    })),
    version: tileset.version,
    tiledversion: tileset.tiledversion,
    properties: tileset.properties.map((property) => ({
      name: property.name,
      type: property.type,
      value: property.value,
    })),
  };
}

function getLayerLevel(offsetY: number, elevationYOffsetPx: number): number {
  const level = -offsetY / elevationYOffsetPx;
  if (!Number.isInteger(level) || level < 0) {
    throw new Error(`Invalid layer offset ${offsetY}; expected a non-positive multiple of ${elevationYOffsetPx}.`);
  }

  return level;
}

function flattenRows(rows: number[][]): number[] {
  const flat: number[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    for (const [columnIndex, gid] of row.entries()) {
      if (!Number.isInteger(gid) || gid < 0) {
        throw new Error(`Invalid gid ${gid} at row ${rowIndex}, column ${columnIndex}.`);
      }
      flat.push(gid);
    }
  }

  return flat;
}

function createFixtureMapLayer(
  layer: CoverageFixture["layers"][number],
  layerIndex: number,
  elevationYOffsetPx: number,
): ResolveTerrainLayer {
  const firstRow = layer.rows[0];
  if (firstRow === undefined) throw new Error(`Fixture layer ${layerIndex} is empty.`);
  const width = firstRow.length;
  if (width === 0) throw new Error(`Fixture layer ${layerIndex} has an empty first row.`);

  for (const [rowIndex, row] of layer.rows.entries()) {
    if (row.length !== width) {
      throw new Error(`Fixture layer ${layerIndex} row ${rowIndex} width mismatch: expected ${width}, received ${row.length}.`);
    }
  }

  const level = getLayerLevel(layer.offsetY, elevationYOffsetPx);

  return {
    id: layerIndex + 1,
    name: `level-${level}`,
    opacity: 1,
    type: "tilelayer",
    visible: true,
    x: 0,
    y: 0,
    offsetx: 0,
    offsety: layer.offsetY,
    width,
    height: layer.rows.length,
    data: flattenRows(layer.rows),
    properties: [{ name: "level", type: "int", value: level }],
  };
}

function createFixtureTerrainMap(
  fixture: CoverageFixture,
  tileset: ResolveTerrainTileset,
  elevationYOffsetPx: number,
): ResolveTerrainMap {
  const firstLayer = fixture.layers[0];
  if (firstLayer === undefined) throw new Error(`Fixture "${fixture.name}" does not contain any layers.`);
  const firstRow = firstLayer.rows[0];
  if (firstRow === undefined) throw new Error(`Fixture "${fixture.name}" first layer does not contain any rows.`);
  const mapTileHeight = tileset.tileheight - elevationYOffsetPx * 2;

  return {
    type: "map",
    orientation: "isometric",
    renderorder: "right-down",
    width: firstRow.length,
    height: firstLayer.rows.length,
    tilewidth: tileset.tilewidth,
    tileheight: mapTileHeight,
    layers: fixture.layers.map((layer, layerIndex) => createFixtureMapLayer(layer, layerIndex, elevationYOffsetPx)),
    tilesets: [{ firstgid: 1, ...tileset }],
  };
}

function createOracleAtlas(
  tileset: ResolveTerrainTileset,
  oracleFrames: ReturnType<typeof rasterizeOwnershipFrames>,
): ResolveColorAtlas {
  const data = new Uint8Array(tileset.imagewidth * tileset.imageheight * 4);

  for (let tileIndex = 0; tileIndex < tileset.tilecount; tileIndex++) {
    const frame = oracleFrames[tileIndex];
    if (frame === undefined) throw new Error(`Missing oracle frame ${tileIndex}.`);
    if (frame.width !== tileset.tilewidth || frame.height !== tileset.tileheight) {
      throw new Error(
        `Oracle frame ${tileIndex} size mismatch: expected ${tileset.tilewidth}x${tileset.tileheight}, received ${frame.width}x${frame.height}.`,
      );
    }

    const column = tileIndex % tileset.columns;
    const row = Math.floor(tileIndex / tileset.columns);
    const tileLeft = tileset.margin + column * (tileset.tilewidth + tileset.spacing);
    const tileTop = tileset.margin + row * (tileset.tileheight + tileset.spacing);

    for (let localY = 0; localY < frame.height; localY++) {
      for (let localX = 0; localX < frame.width; localX++) {
        const alpha = frame.coverage[localY * frame.width + localX] === 1 ? 255 : 0;
        const atlasX = tileLeft + localX;
        const atlasY = tileTop + localY;
        const dataIndex = (atlasY * tileset.imagewidth + atlasX) * 4;
        data[dataIndex] = 255;
        data[dataIndex + 1] = 255;
        data[dataIndex + 2] = 255;
        data[dataIndex + 3] = alpha;
      }
    }
  }

  return {
    data,
    width: tileset.imagewidth,
    height: tileset.imageheight,
    depth: 1,
  };
}

function getPackedPlacementKey(packedX: number, packedY: number, slice: number): string {
  return `${packedX}:${packedY}:${slice}`;
}

function buildPlacementReports(
  fixture: CoverageFixture,
  tileset: CoverageTileset,
  stackOrigin: { x: number; y: number },
  elevationYOffsetPx: number,
): PlacementReport[] {
  const placements = getFixturePlacements(fixture.layers, tileset);
  const reports: PlacementReport[] = [];
  let placementIndex = 0;

  for (const [layerIndex, layer] of fixture.layers.entries()) {
    const level = getLayerLevel(layer.offsetY, elevationYOffsetPx);
    const octave = Math.floor(level / 8);
    const slice = level % 8;

    for (const [mapY, row] of layer.rows.entries()) {
      for (const [mapX, gid] of row.entries()) {
        if (gid <= 0) continue;

        const placement = placements[placementIndex];
        if (placement === undefined) {
          throw new Error(`Missing placement ${placementIndex} for fixture "${fixture.name}".`);
        }

        if (
          placement.layerIndex !== layerIndex ||
          placement.mapX !== mapX ||
          placement.mapY !== mapY ||
          placement.gid !== gid
        ) {
          throw new Error(
            `Placement proof drift at index ${placementIndex}: expected L${layerIndex}:${mapX},${mapY} gid ${gid}, received ${placement.label}.`,
          );
        }

        const packedX = mapX - 2 * octave;
        const packedY = mapY - 2 * octave;
        reports.push({
          ...placement,
          level,
          octave,
          slice,
          packedX,
          packedY,
          textureX: packedX + stackOrigin.x,
          textureY: packedY + stackOrigin.y,
          painterRank: placement.placementId,
        });
        placementIndex++;
      }
    }
  }

  if (placementIndex !== placements.length) {
    throw new Error(
      `Placement proof length mismatch for fixture "${fixture.name}": used ${placementIndex}, expected ${placements.length}.`,
    );
  }

  return reports;
}

function createEmptyCoverage(width: number, height: number): CoverageImage {
  return {
    width,
    height,
    counts: new Uint16Array(width * height),
    ownerIds: new Int32Array(width * height).fill(-1),
  };
}

function createCoverageImage(coverage: CoverageImage, color: [number, number, number]) {
  const data = new Uint8ClampedArray(coverage.width * coverage.height * 4);

  for (let index = 0; index < coverage.counts.length; index++) {
    const pixelIndex = index * 4;
    if (coverage.counts[index] === 0) {
      data[pixelIndex + 3] = 0;
      continue;
    }

    data[pixelIndex] = color[0];
    data[pixelIndex + 1] = color[1];
    data[pixelIndex + 2] = color[2];
    data[pixelIndex + 3] = 255;
  }

  return { data, width: coverage.width, height: coverage.height, channels: 4 as const };
}

function createDiffImage(result: ResolveFixtureResult) {
  const data = new Uint8ClampedArray(result.width * result.height * 4);

  for (let index = 0; index < result.oracleCoverage.counts.length; index++) {
    const oracleCount = result.oracleCoverage.counts[index];
    const actualCount = result.resolveCoverage.counts[index];
    const pixelIndex = index * 4;

    let rgba: [number, number, number, number] = [255, 0, 255, 255];
    if (oracleCount === 0 && actualCount === 0) rgba = [0, 0, 0, 0];
    else if (oracleCount > 0 && actualCount === 0) rgba = [0, 120, 255, 255];
    else if (oracleCount === 0 && actualCount > 0) rgba = [255, 64, 64, 255];
    else if (result.oracleCoverage.ownerIds[index] !== result.resolveCoverage.ownerIds[index]) rgba = [255, 140, 0, 255];
    else rgba = [32, 200, 32, 255];

    data[pixelIndex] = rgba[0];
    data[pixelIndex + 1] = rgba[1];
    data[pixelIndex + 2] = rgba[2];
    data[pixelIndex + 3] = rgba[3];
  }

  return { data, width: result.width, height: result.height, channels: 4 as const };
}

function convertTraceCandidate(
  candidate: ResolveTraceCandidate,
  placementByPackedKey: Map<string, PlacementReport>,
): ResolveTraceCandidateReport {
  const placement = placementByPackedKey.get(getPackedPlacementKey(candidate.packedX, candidate.packedY, candidate.slice));

  return {
    ordinal: candidate.ordinal,
    d: candidate.d,
    s: candidate.s,
    slice: candidate.slice,
    packedX: candidate.packedX,
    packedY: candidate.packedY,
    textureX: candidate.textureX,
    textureY: candidate.textureY,
    localX: candidate.localX,
    localY: candidate.localY,
    shapeRef: candidate.shapeRef,
    painterRank: candidate.painterRank,
    sampledAlpha: candidate.sampledAlpha,
    key: candidate.key,
    placementId: placement === undefined ? null : placement.placementId,
    label: placement === undefined ? null : placement.label,
  };
}

function convertResolveHit(hit: ResolveHit, placementByPackedKey: Map<string, PlacementReport>): ResolveHitReport {
  const placement = placementByPackedKey.get(getPackedPlacementKey(hit.packedX, hit.packedY, hit.slice));
  if (placement === undefined) {
    throw new Error(`Missing placement metadata for packed hit ${hit.packedX},${hit.packedY},${hit.slice}.`);
  }

  return {
    word: hit.word,
    shapeRef: hit.shapeRef,
    tileId: hit.tileId,
    biomeIndex: hit.biomeIndex,
    painterRank: hit.painterRank,
    packedX: hit.packedX,
    packedY: hit.packedY,
    textureX: hit.textureX,
    textureY: hit.textureY,
    slice: hit.slice,
    key: hit.key,
    screen: hit.screen,
    rgba: hit.rgba,
    placement,
  };
}

function resolveFixture(
  fixture: CoverageFixture,
  tileset: ResolveTerrainTileset,
  oracleFrames: ReturnType<typeof rasterizeOwnershipFrames>,
): ResolveFixtureResult {
  const coverageTileset = toCoverageTileset(tileset);
  const elevationYOffsetPx = getElevationYOffsetPx(coverageTileset);
  const terrainMap = createFixtureTerrainMap(fixture, tileset, elevationYOffsetPx);
  const codec = createPackedTerrainCodec(terrainMap, tileset, elevationYOffsetPx, 0);
  const oracleAtlas = createOracleAtlas(tileset, oracleFrames);
  const placements = getFixturePlacements(fixture.layers, coverageTileset);
  const bounds = getCanvasBounds(placements, tileset.tilewidth, tileset.tileheight);
  const oracleCoverage = composeCoverage(placements, oracleFrames, bounds);
  const resolveCoverage = createEmptyCoverage(bounds.width, bounds.height);
  const placementReports = buildPlacementReports(fixture, coverageTileset, codec.stack.origin, elevationYOffsetPx);
  const placementById = new Map<number, PlacementReport>();
  const placementByPackedKey = new Map<string, PlacementReport>();

  for (const report of placementReports) {
    placementById.set(report.placementId, report);
    const packedKey = getPackedPlacementKey(report.packedX, report.packedY, report.slice);
    if (placementByPackedKey.has(packedKey)) {
      throw new Error(`Duplicate packed placement key ${packedKey} in fixture "${fixture.name}".`);
    }
    placementByPackedKey.set(packedKey, report);
  }

  const counts: ResolveCounts = { uncovered: 0, stray: 0, wrongOwner: 0 };
  let firstFailure: FirstFailureReport = { status: "clean" };

  for (let canvasY = 0; canvasY < bounds.height; canvasY++) {
    for (let canvasX = 0; canvasX < bounds.width; canvasX++) {
      const worldX = bounds.minX + canvasX;
      const worldY = bounds.minY + canvasY;
      const pixelIndex = canvasY * bounds.width + canvasX;
      const oracleCount = oracleCoverage.counts[pixelIndex];
      if (oracleCount > 1) {
        throw new Error(
          `Fixture "${fixture.name}" oracle overlap at canvas pixel ${canvasX},${canvasY} (${worldX},${worldY}).`,
        );
      }

      const trace = codec.traceVisibleTile(oracleAtlas, worldX, worldY);
      let actualOwnerId = -1;
      if (trace.winner !== null) {
        const actualPlacement = placementByPackedKey.get(
          getPackedPlacementKey(trace.winner.packedX, trace.winner.packedY, trace.winner.slice),
        );
        if (actualPlacement === undefined) {
          throw new Error(
            `Resolved packed hit ${trace.winner.packedX},${trace.winner.packedY},${trace.winner.slice} is missing placement metadata.`,
          );
        }
        actualOwnerId = actualPlacement.placementId;
        resolveCoverage.counts[pixelIndex] = 1;
        resolveCoverage.ownerIds[pixelIndex] = actualOwnerId;
      }

      const oracleOwnerId = oracleCoverage.ownerIds[pixelIndex];
      let reason: FailureReason | null = null;
      if (oracleCount > 0 && actualOwnerId === -1) {
        counts.uncovered++;
        reason = "uncovered";
      } else if (oracleCount === 0 && actualOwnerId !== -1) {
        counts.stray++;
        reason = "stray";
      } else if (oracleCount === 1 && actualOwnerId !== -1 && oracleOwnerId !== actualOwnerId) {
        counts.wrongOwner++;
        reason = "wrongOwner";
      }

      if (reason === null || firstFailure.status === "failure") continue;

      let oracleOwner: PlacementReport | null = null;
      if (oracleOwnerId !== -1) {
        const placement = placementById.get(oracleOwnerId);
        if (placement === undefined) {
          throw new Error(`Missing oracle placement ${oracleOwnerId} for fixture "${fixture.name}".`);
        }
        oracleOwner = placement;
      }

      firstFailure = {
        status: "failure",
        reason,
        worldX,
        worldY,
        canvasX,
        canvasY,
        oracleOwner,
        actualHit: trace.winner === null ? null : convertResolveHit(trace.winner, placementByPackedKey),
        trace: trace.candidates.map((candidate) => convertTraceCandidate(candidate, placementByPackedKey)),
      };
    }
  }

  return {
    fixture,
    width: bounds.width,
    height: bounds.height,
    counts,
    oracleCoverage,
    resolveCoverage,
    firstFailure,
  };
}

async function writeFixtureDiagnostics(reportDirectory: string, result: ResolveFixtureResult) {
  const fixtureDirectory = path.join(reportDirectory, result.fixture.name);
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  await Promise.all([
    saveImageDataToImage(createCoverageImage(result.oracleCoverage, [255, 255, 255]), path.join(fixtureDirectory, "oracle.png")),
    saveImageDataToImage(createCoverageImage(result.resolveCoverage, [0, 255, 255]), path.join(fixtureDirectory, "resolve.png")),
    saveImageDataToImage(createDiffImage(result), path.join(fixtureDirectory, "diff.png")),
  ]);
  fs.writeFileSync(path.join(fixtureDirectory, "summary.json"), JSON.stringify(result.counts, null, 2));
  fs.writeFileSync(path.join(fixtureDirectory, "first-failure.json"), JSON.stringify(result.firstFailure, null, 2));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: bun run validate:three-resolve [tileset-directory] [options]")
    .command(
      "$0 [tileset-directory]",
      "Validate the Three packed terrain resolver against the ownership oracle",
      (yargsBuilder) =>
        yargsBuilder.positional("tileset-directory", {
          type: "string",
          default: DEFAULT_TILESET_DIRECTORY,
          describe: "Directory containing tileset.json",
        }),
    )
    .option("fixture", {
      type: "string",
      default: "example",
      describe: 'Coverage fixture name to validate. Use "all" to run every fixture.',
    })
    .option("report-dir", {
      type: "string",
      default: DEFAULT_REPORT_DIRECTORY,
      describe: "Directory for diagnostic images and trace JSON.",
    })
    .help()
    .alias("h", "help")
    .strict()
    .parse();

  const tilesetDirectory = path.resolve(String(argv["tileset-directory"]));
  const reportDirectory = path.resolve(String(argv["report-dir"]));
  const fixtureFilter = String(argv.fixture);
  const tilesetJsonPath = path.join(tilesetDirectory, "tileset.json");

  if (!fs.existsSync(tilesetJsonPath)) throw new Error(`Missing tileset.json in ${tilesetDirectory}.`);

  fs.rmSync(reportDirectory, { recursive: true, force: true });
  fs.mkdirSync(reportDirectory, { recursive: true });

  const tilesetJson = JSON.parse(fs.readFileSync(tilesetJsonPath, "utf8"));
  const actualTileset = parseTilesetJson(tilesetJson);
  const actualCoverageTileset = toCoverageTileset(actualTileset);
  const canonicalTileset = getCanonicalTileset(actualCoverageTileset);
  assertSceneAndTilesetContracts(actualCoverageTileset, canonicalTileset);
  const fixtures = buildCoverageFixtures(canonicalTileset);
  const selectedFixtures =
    fixtureFilter === "all" ? fixtures : fixtures.filter((fixture) => fixture.name === fixtureFilter);

  if (selectedFixtures.length === 0) {
    throw new Error(
      `Unknown fixture "${fixtureFilter}". Available fixtures: ${fixtures.map((fixture) => fixture.name).join(", ")}`,
    );
  }

  const oracleFrames = rasterizeOwnershipFrames();
  const results: ResolveFixtureResult[] = [];

  for (const fixture of selectedFixtures) {
    console.log(`Resolving fixture ${fixture.name}...`);
    const result = resolveFixture(fixture, actualTileset, oracleFrames);
    results.push(result);
    await writeFixtureDiagnostics(reportDirectory, result);
    console.log(
      `${fixture.name}: uncovered=${result.counts.uncovered}, stray=${result.counts.stray}, wrongOwner=${result.counts.wrongOwner}`,
    );
  }

  const summary: ValidationSummary = {
    tilesetDirectory,
    reportDirectory,
    fixture: fixtureFilter,
    fixtures: results.map((result) => ({
      name: result.fixture.name,
      width: result.width,
      height: result.height,
      counts: result.counts,
    })),
  };
  fs.writeFileSync(path.join(reportDirectory, "summary.json"), JSON.stringify(summary, null, 2));

  const failureCount = results.filter(
    (result) => result.counts.uncovered > 0 || result.counts.stray > 0 || result.counts.wrongOwner > 0,
  ).length;
  if (failureCount > 0) {
    throw new Error(`Three resolve validation failed for ${failureCount}/${results.length} fixtures. See ${reportDirectory}.`);
  }

  console.log(`Three resolve validation passed for ${results.length} fixtures. Diagnostics: ${reportDirectory}`);
}

await main();
