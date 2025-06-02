import { GameScene } from "../GameScene";
import { UIScene } from "../UIScene";

const SCROLL_BOUNDARY = 100; // pixels from edge to start scrolling
const SCROLL_SPEED = 2;
const USE_POINTER_LOCK = true;
const TOUCH_DRAG_ACTION: "camera" | "selection" = "camera"; // Touch action for dragging

const _world = new Phaser.Math.Vector2();

let x = 0; // Pointer screen position
let y = 0; // Pointer screen position

// Pointer dragging state
let startX = 0;
let startY = 0;
let worldStartX = 0;
let worldStartY = 0;

// Selection dragging state
const SELECTION_DRAG_BUTTON = 0; // Left mouse button
let isSelectionPointerDown = false;
let isSelectionDragging = false;
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
let velocityX = 0; // Scroll velocity in pixels per second
let velocityY = 0;
let dampingFactor = 0.95; // Damping factor for inertia in squared pixels per minute
let minInertiaStopVelocitySquared = 5 * 5;

let pointerHistory: { x: number; y: number; time: number }[] = [];
let pointerHistorySize = 5;

function addToPointerHistory(x: number, y: number) {
  pointerHistory.push({ x: x, y: y, time: Date.now() });
  if (pointerHistory.length > pointerHistorySize) pointerHistory.shift();
}

function onPointerUp(pointer: Phaser.Input.Pointer) {
  isCameraPointerDown = false;
  isSelectionPointerDown = false;
  const diffX = x - startX;
  const diffY = y - startY;
  const magDiff = diffX * diffX + diffY * diffY;
  const moved = magDiff > CLICK_MOVE_THRESHOLD_SQUARED;

  if (isCameraDragging) {
    isCameraDragging = false; // End dragging state
    const uiScene = pointer.camera.scene.game.scene.getScene("UIScene") as UIScene;
    uiScene.changeCursor(pointer, "default");

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
    const uiScene = pointer.camera.scene.game.scene.getScene("UIScene") as UIScene;
    uiScene.changeCursor(pointer, "default");

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
  isSelectionPointerDown = false;
  isCameraPointerDown = false;
  isCameraDragging = false;
  startX = x;
  startY = y;
  const world = pointer.camera.getWorldPoint(x, y, _world);
  worldStartX = world.x;
  worldStartY = world.y;

  if (!pointer.locked && USE_POINTER_LOCK && pointer.button === 0) pointer.manager.mouse?.requestPointerLock();

  if (pointer.button === CAMERA_DRAG_BUTTON || (TOUCH_DRAG_ACTION === "camera" && pointer.wasTouch)) {
    isCameraPointerDown = true;
    isCameraDragging = false;
    velocityX = 0;
    velocityY = 0;

    cameraInitialScrollX = pointer.camera.scrollX;
    cameraInitialScrollY = pointer.camera.scrollY;

    pointerHistory = [];
    addToPointerHistory(x, y);
  } else if (pointer.button === SELECTION_DRAG_BUTTON || (TOUCH_DRAG_ACTION === "selection" && pointer.wasTouch)) {
    isSelectionPointerDown = true;
    isSelectionDragging = false;
  }
}

function onPointerMove(pointer: Phaser.Input.Pointer) {
  x = Phaser.Math.Clamp(pointer.locked ? x + pointer.movementX : pointer.x, 0, pointer.camera.width);
  y = Phaser.Math.Clamp(pointer.locked ? y + pointer.movementY : pointer.y, 0, pointer.camera.height);

  if (isCameraPointerDown || isSelectionPointerDown) {
    const diffX = x - startX;
    const diffY = y - startY;
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
      addToPointerHistory(x, y);

      if (isCameraDragging) {
        // no-op, already dragging
      } else if (moved) {
        isCameraDragging = true;
        const uiScene = pointer.camera.scene.game.scene.getScene("UIScene") as UIScene;
        uiScene.changeCursor(pointer, "grab");
      }
    } else if (isSelectionPointerDown) {
      if (isSelectionDragging) {
        // no-op, already dragging
      } else if (moved) {
        isSelectionDragging = true;
        const uiScene = pointer.camera.scene.game.scene.getScene("UIScene") as UIScene;
        uiScene.changeCursor(pointer, "crosshair");
      }
    }
  }
}

function update(input: Phaser.Input.InputPlugin) {
  const camera = input.cameras.main;
  const uiScene = input.scene.game.scene.getScene("UIScene") as UIScene;

  return function (this: GameScene, time: number, delta: number) {
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
        .lineStyle(2, 0x00ff00, 0.8)
        .fillStyle(0x00ff00, 0.15)
        .fillRectShape(selectionRect)
        .strokeRectShape(selectionRect);
    } else if (this.selectionGraphics.visible) this.selectionGraphics.setVisible(false);

    if (input.mouse?.locked) uiScene.moveLockedCursor(input.activePointer, x, y);
  };
}

export function setupPointer(scene: GameScene) {
  const input = scene.input;
  input.on("pointerdown", onPointerDown);
  input.on("pointermove", onPointerMove);
  input.on("pointerup", onPointerUp);
  input.on("pointerupoutside", onPointerUp);

  input.setDefaultCursor("auto");

  return update(input);
}
