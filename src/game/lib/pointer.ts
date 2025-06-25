import { GameScene } from "../scene/game.js";

const SCROLL_BOUNDARY = 100; // pixels from edge to start scrolling
const SCROLL_SPEED = 2;

const _world = new Phaser.Math.Vector2();

let x = -1; // Pointer screen position
let y = -1; // Pointer screen position

// Pointer dragging state
let startX = 0;
let startY = 0;
let worldStartX = 0;
let worldStartY = 0;

// Selection dragging state
const SELECTION_DRAG_BUTTON = 0; // Left mouse button
let isSelectionPointerDown = false;
let isSelectionDragging = false;
const selectionRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);

// Camera dragging state
let isCameraPointerDown = false;
let isCameraDragging = false;
let cameraInitialScrollX = 0;
let cameraInitialScrollY = 0;

// Click detection state
const CLICK_MOVE_THRESHOLD_SQUARED = 2 * 2;
const CLICK_DURATION_THRESHOLD = 200; // Max ms pointer can be down for a quick click

// Inertia state
let velocityX = 0; // Scroll velocity in pixels per second
let velocityY = 0;
const dampingFactor = 0.95; // Damping factor for inertia in squared pixels per minute
const minInertiaStopVelocitySquared = 5 * 5;

let pointerHistory: { x: number; y: number; time: number }[] = [];
const pointerHistorySize = 5;

function addToPointerHistory(pointer: Phaser.Input.Pointer) {
  x = pointer.x;
  y = pointer.y;

  pointerHistory.push({ x: x, y: y, time: Date.now() });
  if (pointerHistory.length > pointerHistorySize) pointerHistory.shift();
}

function onPointerUp(pointer: Phaser.Input.Pointer) {
  x = pointer.x;
  y = pointer.y;

  isCameraPointerDown = false;
  isSelectionPointerDown = false;
  const diffX = x - startX;
  const diffY = y - startY;
  const magDiff = diffX * diffX + diffY * diffY;
  const moved = magDiff > CLICK_MOVE_THRESHOLD_SQUARED;

  if (isCameraDragging) {
    isCameraDragging = false; // End dragging state
    pointer.manager.setDefaultCursor("default");

    if (pointerHistory.length >= 2) {
      const lastPoint = pointerHistory[pointerHistory.length - 1];
      const firstRelevantPointIndex = Math.max(0, pointerHistory.length - pointerHistorySize);
      const firstPoint = pointerHistory[firstRelevantPointIndex];
      const timeDeltaSeconds = (lastPoint.time - firstPoint.time) / 1000.0;

      if (timeDeltaSeconds > 0.0001) {
        velocityX = (lastPoint.x - firstPoint.x) / timeDeltaSeconds;
        velocityY = (lastPoint.y - firstPoint.y) / timeDeltaSeconds;
      } else {
        velocityX = 0;
        velocityY = 0;
      }
    } else {
      velocityX = 0;
      velocityY = 0;
    }

    pointerHistory = [];
  } else if (isSelectionDragging) {
    isSelectionDragging = false;
    pointer.manager.setDefaultCursor("default");
    pointer.manager.events.emit("selection", selectionRect);
  } else {
    const duration = pointer.getDuration();
    const press = duration > CLICK_DURATION_THRESHOLD;

    if (!moved && !press) {
      if (pointer.locked) {
        const world = pointer.camera.getWorldPoint(x, y, _world);
        pointer.x = x;
        pointer.y = y;
        pointer.worldX = world.x;
        pointer.worldY = world.y;
      }
      pointer.manager.events.emit("click", pointer);
    }
  }
}

function onPointerDown(pointer: Phaser.Input.Pointer) {
  x = pointer.x;
  y = pointer.y;

  isSelectionPointerDown = false;
  isCameraPointerDown = false;
  isCameraDragging = false;
  startX = x;
  startY = y;
  const world = pointer.camera.getWorldPoint(x, y, _world);
  worldStartX = world.x;
  worldStartY = world.y;

  if (pointer.button !== SELECTION_DRAG_BUTTON) {
    isCameraPointerDown = true;
    isCameraDragging = false;
    velocityX = 0;
    velocityY = 0;

    cameraInitialScrollX = pointer.camera.scrollX;
    cameraInitialScrollY = pointer.camera.scrollY;

    pointerHistory = [];
    addToPointerHistory(pointer);
  } else if (pointer.button === SELECTION_DRAG_BUTTON || pointer.wasTouch) {
    isSelectionPointerDown = true;
    isSelectionDragging = false;
  }
}

function onPointerMove(pointer: Phaser.Input.Pointer) {
  x = pointer.x;
  y = pointer.y;

  if (isCameraPointerDown || isSelectionPointerDown) {
    const diffX = x - startX;
    const diffY = y - startY;
    const magDiff = diffX * diffX + diffY * diffY;
    const moved = magDiff > CLICK_MOVE_THRESHOLD_SQUARED;

    if (!pointer.isDown) {
      console.warn("No pointer down detected, resetting pointer drag state");
      onPointerUp(pointer);
    }
    if (!pointer.camera) {
      console.warn("No camera detected, resetting pointer drag state");
      onPointerUp(pointer);
    }

    if (isCameraPointerDown) {
      addToPointerHistory(pointer);

      if (isCameraDragging) {
        // no-op, already dragging
      } else if (moved) {
        isCameraDragging = true;
        pointer.manager.setDefaultCursor("grab");
      }
    } else if (isSelectionPointerDown) {
      if (isSelectionDragging) {
        // no-op, already dragging
      } else if (moved) {
        isSelectionDragging = true;
        pointer.manager.setDefaultCursor("crosshair");
      }
    }
  }
}

const chromium = (window as any).chrome !== undefined;
const firefox = (document.body.style as any).MozAppearance !== undefined;
const safari = (window as any).safari !== undefined;

let lastDetectedScroll: "wheel" | "pan" | undefined;
let lastLikelyScroll: "wheel" | "pan" | undefined;
// can be improved by using a frequency analysis of events
function identifyScrollEvent(event: WheelEvent): "wheel" | "pan" {
  const e = event as WheelEvent & { wheelDeltaY?: number };

  // 100% sure
  const wheelCertain = Math.floor(e.deltaY) !== e.deltaY || e.deltaMode !== 0;
  if (wheelCertain) return (lastDetectedScroll = lastLikelyScroll = "wheel");
  const panCertain = e.deltaX !== 0 || e.deltaY === 0;
  if (panCertain) return (lastDetectedScroll = lastLikelyScroll = "pan");

  // e.deltaX is 0, there is a good chance this is a wheel event, but we need to detect vertical panning nonetheless

  // 99% sure
  const wheelVeryLikely = firefox
    ? e.wheelDeltaY! % 48 === 0
    : chromium
      ? e.wheelDeltaY! % 120 === 0
      : safari
        ? e.wheelDeltaY! === 12 || e.wheelDeltaY! === -12
        : false;
  const panVeryLikely = Math.abs(e.deltaY) < (firefox ? 16 : 4);
  const oldLastLikelyScroll = lastLikelyScroll;
  lastLikelyScroll = panVeryLikely ? "pan" : wheelVeryLikely ? "wheel" : lastLikelyScroll;

  if (wheelVeryLikely && lastDetectedScroll === "wheel") return "wheel";
  if (wheelVeryLikely && oldLastLikelyScroll === "wheel") return "wheel";
  if (panVeryLikely && lastDetectedScroll === "pan") return "pan";
  if (panVeryLikely && oldLastLikelyScroll === "pan") return "pan";

  // prefer continuity with the last detected scroll type
  if (lastDetectedScroll && lastDetectedScroll === oldLastLikelyScroll) return lastDetectedScroll;

  if (panVeryLikely) return "pan";
  if (wheelVeryLikely) return "wheel";

  return lastDetectedScroll || lastLikelyScroll || "wheel";
}

function onWheel(this: GameScene, pointer: Phaser.Input.Pointer) {
  const event = pointer.event;
  event.preventDefault();

  let type: "wheel" | "pan" | "pinch" = "wheel";
  if (event.ctrlKey) {
    type = "pinch";
  } else if (event instanceof WheelEvent) {
    type = identifyScrollEvent(event);
  } else if (event instanceof TouchEvent) {
    console.warn("TouchEvent detected in onWheel, this should not happen");
    return;
  } else if (event instanceof MouseEvent) {
    console.warn("MouseEvent detected in onWheel, this should not happen");
    return;
  }

  if (type === "pinch") {
    this.changeZoomContinuous(pointer.deltaY * 10);
  } else if (type === "wheel") {
    this.changeZoomContinuous(pointer.deltaY);
  } else if (type === "pan") {
    pointer.camera.scrollX += pointer.deltaX;
    pointer.camera.scrollY += pointer.deltaY;
  } else {
    throw new Error(type satisfies never);
  }
}

function onPointerLeave(this: Phaser.Cameras.Scene2D.Camera, event: MouseEvent) {
  // Scroll at full speed when pointer leaves the camera
  x = Phaser.Math.Clamp(event.clientX, 0, this.width);
  y = Phaser.Math.Clamp(event.clientY, 0, this.height);
}

function update(input: Phaser.Input.InputPlugin) {
  const camera = input.cameras.main;

  return function (this: GameScene, _time: number, delta: number) {
    if (x === -1 && y === -1) return; // pointer not active on the camera yet

    let scrollXDiff = 0;
    let scrollYDiff = 0;

    if (isCameraDragging) {
      const diffX = x - startX;
      const diffY = y - startY;
      const deltaX = diffX / camera.zoom;
      const deltaY = diffY / camera.zoom;
      camera.scrollX = cameraInitialScrollX - deltaX;
      camera.scrollY = cameraInitialScrollY - deltaY;
    } else {
      if (velocityX !== 0 || velocityY !== 0) {
        const deltaTimeSeconds = delta / 1000.0;
        const damping = Math.pow(dampingFactor, deltaTimeSeconds * 60);
        scrollXDiff += -(velocityX / camera.zoom) * deltaTimeSeconds;
        scrollYDiff += -(velocityY / camera.zoom) * deltaTimeSeconds;

        velocityX *= damping;
        velocityY *= damping;
        const squaredVelocity = velocityX * velocityX + velocityY * velocityY;
        if (squaredVelocity < minInertiaStopVelocitySquared) {
          velocityX = 0;
          velocityY = 0;
        }
      }

      // edge scrolling
      let scrollXRatio = 0;
      let scrollYRatio = 0;

      if (x < SCROLL_BOUNDARY) {
        scrollXRatio = -(SCROLL_BOUNDARY - x) / SCROLL_BOUNDARY;
      } else if (x > camera.width - SCROLL_BOUNDARY) {
        scrollXRatio = (x - (camera.width - SCROLL_BOUNDARY)) / SCROLL_BOUNDARY;
      }

      if (scrollXRatio !== 0)
        scrollXDiff += (scrollXRatio >= 0 ? 1 : -1) * scrollXRatio * scrollXRatio * delta * SCROLL_SPEED;

      if (y < SCROLL_BOUNDARY) {
        scrollYRatio = -(SCROLL_BOUNDARY - y) / SCROLL_BOUNDARY;
      } else if (y > camera.height - SCROLL_BOUNDARY) {
        scrollYRatio = (y - (camera.height - SCROLL_BOUNDARY)) / SCROLL_BOUNDARY;
      }

      if (scrollYRatio !== 0)
        scrollYDiff += (scrollYRatio >= 0 ? 1 : -1) * scrollYRatio * scrollYRatio * delta * SCROLL_SPEED;

      if (scrollXDiff !== 0 || scrollYDiff !== 0)
        camera.setScroll(camera.scrollX + scrollXDiff, camera.scrollY + scrollYDiff);
    }

    if (isSelectionDragging) {
      const world = camera.getWorldPoint(x, y, _world);
      const worldX = world.x;
      const worldY = world.y;

      if (!this.selectionGraphics.visible) this.selectionGraphics.setVisible(true).setDepth(1000000);

      selectionRect.setTo(
        Math.min(worldStartX, worldX),
        Math.min(worldStartY, worldY),
        Math.abs(worldStartX - worldX),
        Math.abs(worldStartY - worldY),
      );
      this.selectionGraphics
        .clear()
        .lineStyle(1 / this.zoom, 0xffffff, 1)
        .fillStyle(0xffffff, 0.05)
        .fillRectShape(selectionRect)
        .strokeRectShape(selectionRect);
    } else if (this.selectionGraphics.visible) this.selectionGraphics.setVisible(false);
  };
}

export function createPointer(scene: GameScene) {
  const camera = scene.cameras.main;

  const onMouseLeave = onPointerLeave.bind(camera);
  document.addEventListener("mouseleave", onMouseLeave);
  scene.input.on("pointerout", onPointerLeave, scene);
  scene.input.on("pointerdown", onPointerDown, scene);
  scene.input.on("pointermove", onPointerMove, scene);
  scene.input.on("pointerup", onPointerUp, scene);
  scene.input.on("pointerupoutside", onPointerUp, scene);
  scene.input.on("wheel", onWheel, scene);

  const updatePointer = update(scene.input);
  function destroyPointer() {
    document.removeEventListener("mouseleave", onMouseLeave);
    scene.input.off("pointerdown", onPointerDown, scene);
    scene.input.off("pointermove", onPointerMove, scene);
    scene.input.off("pointerup", onPointerUp, scene);
    scene.input.off("pointerupoutside", onPointerUp, scene);
    scene.input.off("wheel", onWheel, scene);
  }

  return { updatePointer, destroyPointer };
}
