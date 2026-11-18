// Minimal ambient types for the subset of Marzipano 0.10 used by this package.
declare module "marzipano" {
  export interface ViewCoords {
    yaw: number;
    pitch: number;
  }

  export interface ViewParameters extends ViewCoords {
    fov: number;
    roll?: number;
  }

  export interface ScreenPoint {
    x: number;
    y: number;
  }

  export interface Tile {
    z: number;
  }

  export interface Listenable {
    // Marzipano event payloads vary per event, hence the loose signature.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener(type: string, listener: (...args: any[]) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeEventListener(type: string, listener: (...args: any[]) => void): void;
  }

  export interface ViewLimiter {
    (params: ViewParameters): ViewParameters;
  }

  export class RectilinearView implements Listenable {
    constructor(params?: Partial<ViewParameters>, limiter?: ViewLimiter | null);
    static limit: {
      traditional(maxResolution: number, maxVFov: number, maxHFov?: number): ViewLimiter;
    };
    yaw(): number;
    pitch(): number;
    fov(): number;
    parameters(): ViewParameters;
    setParameters(params: Partial<ViewParameters>): void;
    setYaw(yaw: number): void;
    setPitch(pitch: number): void;
    setFov(fov: number): void;
    offsetYaw(offset: number): void;
    offsetPitch(offset: number): void;
    offsetFov(offset: number): void;
    screenToCoordinates(point: ScreenPoint, result?: ViewCoords): ViewCoords;
    coordinatesToScreen(coords: ViewCoords, result?: ScreenPoint): ScreenPoint;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener(type: string, listener: (...args: any[]) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeEventListener(type: string, listener: (...args: any[]) => void): void;
  }

  export class EquirectGeometry {
    constructor(levels: Array<{ width: number }>);
  }

  export class CubeGeometry {
    constructor(levels: Array<{ tileSize: number; size: number; fallbackOnly?: boolean }>);
  }

  export class ImageUrlSource {
    constructor(sourceFromTile: (tile: Tile) => { url: string }, opts?: { concurrency?: number; retryDelay?: number });
    static fromString(url: string, opts?: { cubeMapPreviewUrl?: string; cubeMapPreviewFaceOrder?: string }): ImageUrlSource;
  }

  export interface TextureStore extends Listenable {}

  export interface Layer {
    textureStore(): TextureStore;
  }

  export interface Hotspot {
    domElement(): HTMLElement;
    position(): ViewCoords;
    setPosition(coords: ViewCoords): void;
    show(): void;
    hide(): void;
    destroy(): void;
  }

  export interface HotspotContainer {
    createHotspot(element: HTMLElement, coords: ViewCoords, opts?: object): Hotspot;
    destroyHotspot(hotspot: Hotspot): void;
    hasHotspot(hotspot: Hotspot): boolean;
    show(): void;
    hide(): void;
  }

  export interface Scene {
    view(): RectilinearView;
    layer(): Layer;
    hotspotContainer(): HotspotContainer;
    switchTo(opts?: { transitionDuration?: number }, done?: () => void): void;
    lookTo(params: Partial<ViewParameters>, opts?: { transitionDuration?: number }, done?: () => void): void;
  }

  export interface ViewerOptions {
    controls?: { mouseViewMode?: "drag" | "qtvr"; scrollZoom?: boolean; dragMode?: "pan" | "pinch" };
    stage?: { progressive?: boolean };
  }

  export class Viewer {
    constructor(element: HTMLElement, opts?: ViewerOptions);
    createScene(opts: {
      source: ImageUrlSource;
      geometry: EquirectGeometry | CubeGeometry;
      view: RectilinearView;
      pinFirstLevel?: boolean;
    }): Scene;
    destroyScene(scene: Scene): void;
    listScenes(): Scene[];
    scene(): Scene | null;
    view(): RectilinearView | null;
    updateSize(): void;
    destroy(): void;
  }
}
