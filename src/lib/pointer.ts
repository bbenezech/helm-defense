import { GameScene } from "../GameScene";

const SCROLL_BOUNDARY = 100; // pixels from edge to start scrolling
const SCROLL_SPEED = 14; // pixels per frame

const TOUCH_DRAG_ACTION: "camera" | "selection" = "camera"; // Touch action for dragging

// Pointer dragging state
let startX = 0;
let startY = 0;
let endX = 0;
let endY = 0;
let worldStartX = 0;
let worldEndX = 0;
let worldStartY = 0;
let worldEndY = 0;

// Selection dragging state
const SELECTION_DRAG_BUTTON = 0; // Left mouse button
let isSelectionPointerDown = false;
let isSelectionDragging = false;
let isSelectionGraphicsOnScreen = false;
let selectionRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);

// Camera dragging state
const CAMERA_DRAG_BUTTON = 2; // Right mouse button
let isCameraPointerDown = false;
let isCameraDragging = false;
let cameraInitialScrollX = 0;
let cameraInitialScrollY = 0;

// Click detection state
let CLICK_MOVE_THRESHOLD_SQUARED = 2 * 2;
let CLICK_DURATION_THRESHOLD = 200; // Max ms pointer can be down for a quick click

// Inertia state
let isInertiaScrolling = false;
let velocityX = 0; // Velocity in pixels per second
let velocityY = 0;
let dampingFactor = 0.95; // Damping factor for inertia in squared pixels per minute
let minInertiaStartVelocitySquared = 100 * 100;
let minInertiaStopVelocitySquared = 5 * 5;

// Pointer history
let pointerHistory: { x: number; y: number; time: number }[] = [];
let pointerHistorySize = 5;

function addToPointerHistory(x: number, y: number) {
  pointerHistory.push({ x: x, y: y, time: Date.now() });
  if (pointerHistory.length > pointerHistorySize) pointerHistory.shift();
}

function onPointerUp(pointer: Phaser.Input.Pointer) {
  isCameraPointerDown = false;
  isSelectionPointerDown = false;
  worldEndX = pointer.worldX;
  worldEndY = pointer.worldY;
  endX = pointer.x;
  endY = pointer.y;
  const diffX = pointer.x - startX;
  const diffY = pointer.y - startY;
  const magDiff = diffX * diffX + diffY * diffY;
  const moved = magDiff > CLICK_MOVE_THRESHOLD_SQUARED;

  if (isCameraDragging) {
    isCameraDragging = false; // End dragging state
    pointer.manager.setDefaultCursor("auto");

    if (pointerHistory.length >= 2) {
      const lastPoint = pointerHistory[pointerHistory.length - 1];
      const firstRelevantPointIndex = Math.max(
        0,
        pointerHistory.length - pointerHistorySize
      );
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

    if (
      velocityX * velocityX + velocityY * velocityY >
      minInertiaStartVelocitySquared
    ) {
      isInertiaScrolling = true;
    } else {
      velocityX = 0;
      velocityY = 0;
    }

    pointerHistory = [];
  } else if (isSelectionDragging) {
    isSelectionDragging = false;

    console.log(
      `Selection rect world: x ${selectionRect.x}, y ${selectionRect.y}, width ${selectionRect.width}, height ${selectionRect.height}`
    );
    pointer.manager.events.emit("selection", selectionRect);
    pointer.manager.setDefaultCursor("auto");
  } else {
    const duration = pointer.getDuration();
    const button = pointer.button;
    const press = duration > CLICK_DURATION_THRESHOLD;
    const buttonName =
      button === 0
        ? "left"
        : button === 1
        ? "middle"
        : button === 2
        ? "right"
        : button;

    if (!moved) {
      console.log(`${buttonName} ${press ? "press" : "click"}`, pointer);
      pointer.manager.events.emit(press ? "press" : "click", pointer);
    }
  }
}

function onPointerDown(pointer: Phaser.Input.Pointer) {
  isSelectionPointerDown = false;
  isCameraPointerDown = false;
  isCameraDragging = false;
  isInertiaScrolling = false;
  worldStartX = pointer.worldX;
  worldStartY = pointer.worldY;
  worldEndX = pointer.worldX;
  worldEndY = pointer.worldY;
  startX = pointer.x;
  startY = pointer.y;
  endX = pointer.x;
  endY = pointer.y;

  if (
    pointer.button === CAMERA_DRAG_BUTTON ||
    (TOUCH_DRAG_ACTION === "camera" && pointer.wasTouch)
  ) {
    isCameraPointerDown = true;
    isCameraDragging = false;
    pointer.manager.setDefaultCursor("auto");
    isInertiaScrolling = false;
    velocityX = 0;
    velocityY = 0;

    cameraInitialScrollX = pointer.camera.scrollX;
    cameraInitialScrollY = pointer.camera.scrollY;

    pointerHistory = [];
    addToPointerHistory(pointer.x, pointer.y);
  } else if (
    pointer.button === SELECTION_DRAG_BUTTON ||
    (TOUCH_DRAG_ACTION === "selection" && pointer.wasTouch)
  ) {
    isSelectionPointerDown = true;
    isSelectionDragging = false;
  }
}

function onPointerMove(pointer: Phaser.Input.Pointer) {
  if (isCameraPointerDown || isSelectionPointerDown) {
    worldEndX = pointer.worldX;
    worldEndY = pointer.worldY;
    endX = pointer.x;
    endY = pointer.y;
    const diffX = endX - startX;
    const diffY = endY - startY;
    const magDiff = diffX * diffX + diffY * diffY;
    const moved = magDiff > CLICK_MOVE_THRESHOLD_SQUARED;

    if (!pointer.isDown) {
      console.log("No pointer down detected, resetting pointer drag state");
      onPointerUp(pointer);
    }
    if (!pointer.camera) {
      console.warn("No camera detected, resetting pointer drag state");
      onPointerUp(pointer);
    }

    if (isCameraPointerDown) {
      addToPointerHistory(pointer.x, pointer.y);

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

function update(input: Phaser.Input.InputPlugin) {
  return function (this: GameScene, time: number, delta: number) {
    const camera = input.cameras.main;
    if (isInertiaScrolling) {
      const deltaTimeSeconds = delta / 1000.0;
      const damping = Math.pow(dampingFactor, deltaTimeSeconds * 60);
      camera.scrollX -= (velocityX / camera.zoom) * deltaTimeSeconds;
      camera.scrollY -= (velocityY / camera.zoom) * deltaTimeSeconds;
      endX = input.x;
      endY = input.y;
      const worldPoint = camera.getWorldPoint(input.x, input.y);
      worldEndX = worldPoint.x;
      worldEndY = worldPoint.y;

      velocityX *= damping;
      velocityY *= damping;
      if (
        velocityX * velocityX + velocityY * velocityY <
        minInertiaStopVelocitySquared
      ) {
        isInertiaScrolling = false;
        velocityX = 0;
        velocityY = 0;
      }
    }

    if (input.isOver && !isCameraDragging && !isCameraPointerDown) {
      if (input.x < SCROLL_BOUNDARY) {
        const ratio = (SCROLL_BOUNDARY - input.x) / SCROLL_BOUNDARY;
        camera.scrollX -= SCROLL_SPEED * ratio * ratio;
      } else if (input.x > camera.width - SCROLL_BOUNDARY) {
        const ratio =
          (input.x - (camera.width - SCROLL_BOUNDARY)) / SCROLL_BOUNDARY;
        camera.scrollX += SCROLL_SPEED * ratio * ratio;
      }
      if (input.y < SCROLL_BOUNDARY) {
        const ratio = (SCROLL_BOUNDARY - input.y) / SCROLL_BOUNDARY;
        camera.scrollY -= SCROLL_SPEED * ratio * ratio;
      } else if (input.y > camera.height - SCROLL_BOUNDARY) {
        const ratio =
          (input.y - (camera.height - SCROLL_BOUNDARY)) / SCROLL_BOUNDARY;
        camera.scrollY += SCROLL_SPEED * ratio * ratio;
      }

      endX = input.x;
      endY = input.y;
      const worldPoint = camera.getWorldPoint(input.x, input.y);
      worldEndX = worldPoint.x;
      worldEndY = worldPoint.y;
    }

    if (isCameraDragging) {
      const diffX = endX - startX;
      const diffY = endY - startY;
      const deltaX = diffX / camera.zoom;
      const deltaY = diffY / camera.zoom;
      camera.scrollX = cameraInitialScrollX - deltaX;
      camera.scrollY = cameraInitialScrollY - deltaY;
    }

    if (isSelectionGraphicsOnScreen) {
      this.selectionGraphics.clear();
      isSelectionGraphicsOnScreen = false;
    }

    if (isSelectionDragging) {
      selectionRect.setTo(
        Math.min(worldStartX, worldEndX),
        Math.min(worldStartY, worldEndY),
        Math.abs(worldStartX - worldEndX),
        Math.abs(worldStartY - worldEndY)
      );
      this.selectionGraphics.lineStyle(2, 0x00ff00, 0.8);
      this.selectionGraphics.fillStyle(0x00ff00, 0.15);
      this.selectionGraphics.fillRectShape(selectionRect);
      this.selectionGraphics.strokeRectShape(selectionRect);
      isSelectionGraphicsOnScreen = true;
    }
  };
}

export function setupPointer(input: Phaser.Input.InputPlugin) {
  input.on("pointerdown", onPointerDown);
  input.on("pointermove", onPointerMove);
  input.on("pointerup", onPointerUp);
  input.on("pointerupoutside", onPointerUp);

  input.setDefaultCursor("auto");

  return update(input);
}
