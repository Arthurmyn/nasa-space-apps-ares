import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Terrain } from "../api/terrain.ts";
import type { RouteResponse } from "../api/types.ts";
import {
  buildTerrainMesh,
  contourInterval,
  lonLatToLocal,
  meshStride,
  sampleElevation,
} from "../lib/terrain.ts";

/** An HTML element that follows a point on the terrain (a label, a marker). */
export interface OverlayItem {
  id: string;
  el: HTMLElement;
  lon: number;
  lat: number;
}

export interface SceneOptions {
  container: HTMLElement;
  terrain: Terrain;
  route: RouteResponse;
  exaggeration: number;
  /** Called after each frame with the ground size of one screen pixel at the camera target, metres. */
  onScale?: (metresPerPixel: number) => void;
  /** Upper bound of mesh vertices; phones get fewer. */
  maxVertices: number;
}

const vertexShader = (exaggeration: number) => /* glsl */ `
  varying vec2 vUv;
  varying float vHeight;
  void main() {
    vUv = uv;
    vHeight = position.y / ${exaggeration.toFixed(2)};
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Hillshade tinted to the palette, steep cells (the red of slope.png) washed with the hazard colour,
// and thin contour lines every uInterval metres of elevation.
const fragmentShader = (baseM: number) => /* glsl */ `
  varying vec2 vUv;
  varying float vHeight;
  uniform sampler2D tHill;
  uniform sampler2D tSlope;
  uniform vec3 uDark;
  uniform vec3 uLight;
  uniform vec3 uHazard;
  uniform vec3 uLine;
  uniform float uInterval;
  void main() {
    vec4 hill = texture2D(tHill, vUv);
    if (hill.a < 0.5) discard;
    vec4 slope = texture2D(tSlope, vUv);
    // The textures are sRGB, so the values here are linear: the slope image's red is about 0.72 / 0.05.
    vec3 base = mix(uDark, uLight, pow(hill.r, 2.2));
    float steep = step(0.5, slope.r) * step(slope.g, 0.2) * step(0.5, slope.a);
    base = mix(base, uHazard, steep * 0.55);
    float h = (vHeight + ${baseM.toFixed(3)}) / uInterval;
    float d = abs(fract(h - 0.5) - 0.5) / max(fwidth(h), 1e-4);
    float line = 1.0 - clamp(d, 0.0, 1.0);
    vec3 col = mix(base, uLine, line * 0.32 * (1.0 + steep));
    gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
  }
`;

function cssColor(name: string, fallback: string): Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new Color(value || fallback);
}

/** True when this browser can create a WebGL2 context, so the 3D HUD can run at all. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

/**
 * The 3D terrain of the HUD: a mesh from elevation.bin textured with the hillshade and slope images,
 * the planned route as a tube, and rotate/tilt/zoom controls. It renders only when something changed.
 */
export class TerrainScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly homeCamera = new Vector3();
  private readonly homeTarget = new Vector3();
  private overlay: Array<OverlayItem & { world: Vector3 }> = [];
  private frame = 0;
  private disposed = false;
  private readonly extent: number;

  constructor(private readonly opts: SceneOptions) {
    const { container, terrain, route, exaggeration } = opts;
    const { meta, range } = terrain;

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = "hud3d__canvas";
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(38, 1, 1, 10000);

    const stride = meshStride(meta.width, meta.height, opts.maxVertices);
    const mesh = buildTerrainMesh(meta, terrain.elevation, stride, range.mean, range.min, exaggeration);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(mesh.uvs, 2));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    geometry.computeBoundingSphere();

    const loader = new TextureLoader();
    const load = (url: string): Texture => {
      const tex = loader.load(url, () => this.requestRender());
      tex.colorSpace = SRGBColorSpace;
      this.disposables.push(tex);
      return tex;
    };
    const material = new ShaderMaterial({
      uniforms: {
        tHill: { value: load(terrain.hillshadeUrl) },
        tSlope: { value: load(terrain.slopeUrl) },
        uDark: { value: cssColor("--hud-terrain-dark", "#14111c") },
        uLight: { value: cssColor("--hud-terrain-light", "#8a7fa8") },
        uHazard: { value: cssColor("--hud-hazard", "#f87171") },
        uLine: { value: cssColor("--hud-contour", "#c4b5fd") },
        uInterval: { value: contourInterval(range.max - range.min) },
      },
      vertexShader: vertexShader(exaggeration),
      fragmentShader: fragmentShader(range.mean),
      side: DoubleSide,
    });
    this.disposables.push(geometry, material);
    this.scene.add(new Mesh(geometry, material));

    // World extent: used for the camera, the route tube radius and zoom limits.
    const w = meta.width * meta.cellM;
    const h = meta.height * meta.cellM;
    this.extent = Math.max(w, h);
    const cx = meta.xMinM + w / 2;
    const cz = -(meta.yMaxM - h / 2);

    this.addRoute(route, terrain);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false; // render on demand, no animation loop
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = this.extent * 0.08;
    this.controls.maxDistance = this.extent * 2.2;
    this.controls.screenSpacePanning = true;
    this.controls.target.set(cx, 0, cz);
    const dist = this.extent * 0.95;
    this.camera.position.set(cx, dist * Math.sin(Math.PI / 4), cz + dist * Math.cos(Math.PI / 4));
    this.controls.update();
    this.homeCamera.copy(this.camera.position);
    this.homeTarget.copy(this.controls.target);
    this.controls.addEventListener("change", () => this.requestRender());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private worldPoint(lon: number, lat: number, lift: number): Vector3 {
    const { terrain, exaggeration } = this.opts;
    const { x, y } = lonLatToLocal(terrain.meta, lon, lat);
    const z = sampleElevation(terrain.meta, terrain.elevation, x, y) ?? terrain.range.min;
    return new Vector3(x, (z - terrain.range.mean) * exaggeration + lift, -y);
  }

  private addRoute(route: RouteResponse, terrain: Terrain) {
    const radius = this.extent * 0.0032;
    const lift = radius * 1.6;
    // A few hundred points are plenty for a smooth line; thin out long polylines.
    const every = Math.max(1, Math.ceil(route.polyline.length / 500));
    const pts = route.polyline.filter((_, i) => i % every === 0 || i === route.polyline.length - 1).map((p) => this.worldPoint(p[0], p[1], lift));
    if (pts.length < 2) return;
    const curve = new CatmullRomCurve3(pts, false, "centripetal");
    const tube = new TubeGeometry(curve, Math.min(900, pts.length * 3), radius, 6, false);
    const color = cssColor("--hud-route", "#c4b5fd");
    const mat = new MeshBasicMaterial({ color });
    this.scene.add(new Mesh(tube, mat));
    this.disposables.push(tube, mat);

    // A small arrow just after the start, pointing along the route.
    const start = curve.getPoint(0.02);
    const ahead = curve.getPoint(0.045);
    const dir = ahead.clone().sub(start).normalize();
    const cone = new ConeGeometry(radius * 2.6, radius * 6, 12);
    const coneMat = new MeshBasicMaterial({ color });
    const arrow = new Mesh(cone, coneMat);
    arrow.position.copy(start);
    arrow.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    this.scene.add(arrow);
    this.disposables.push(cone, coneMat);
    void terrain;
  }

  /** Place HTML elements on the terrain; they follow the camera. */
  setOverlay(items: OverlayItem[]) {
    this.overlay = items.map((it) => ({ ...it, world: this.worldPoint(it.lon, it.lat, this.extent * 0.006) }));
    this.requestRender();
  }

  /** Move one overlay element (the current position) without rebuilding the others. */
  moveOverlay(id: string, lon: number, lat: number) {
    const it = this.overlay.find((o) => o.id === id);
    if (!it) return;
    it.lon = lon;
    it.lat = lat;
    it.world = this.worldPoint(lon, lat, this.extent * 0.006);
    this.requestRender();
  }

  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    const len = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, offset.length()));
    this.camera.position.copy(this.controls.target.clone().add(offset.setLength(len)));
    this.controls.update();
    this.requestRender();
  }

  resetView() {
    this.camera.position.copy(this.homeCamera);
    this.controls.target.copy(this.homeTarget);
    this.controls.update();
    this.requestRender();
  }

  centreOn(lon: number, lat: number) {
    const p = this.worldPoint(lon, lat, 0);
    const shift = p.clone().sub(this.controls.target);
    this.controls.target.add(shift);
    this.camera.position.add(shift);
    this.controls.update();
    this.requestRender();
  }

  requestRender() {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private resize() {
    const { container } = this.opts;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private render() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    const { container } = this.opts;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const v = new Vector3();
    for (const it of this.overlay) {
      v.copy(it.world).project(this.camera);
      const visible = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      it.el.style.display = visible ? "block" : "none";
      if (visible) it.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
    if (this.opts.onScale) {
      const dist = this.camera.position.distanceTo(this.controls.target);
      const worldPerPixel = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(1, h);
      this.opts.onScale(worldPerPixel);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
