import * as THREE from "three";
import { CARD_HEIGHT, CARD_WIDTH, createCardBackMesh } from "./CardMesh";
import { tweenManager } from "./Tween";
import type { PlayerId } from "../game/WarGame";

export const PILE_POS: Record<PlayerId, THREE.Vector3> = {
  A: new THREE.Vector3(-3.1, 0, 2.1),
  B: new THREE.Vector3(3.1, 0, 2.1),
};

export const BATTLE_SLOT: Record<PlayerId, THREE.Vector3> = {
  A: new THREE.Vector3(-0.95, CARD_HEIGHT / 2 + 0.05, 0),
  B: new THREE.Vector3(0.95, CARD_HEIGHT / 2 + 0.05, 0),
};

export const WAR_ROW_DIR: Record<PlayerId, number> = { A: -1, B: 1 };

const MAX_PILE_VISUAL = 16;

// The scene is composed for a landscape-ish view, with the piles placed at a
// fixed horizontal offset from center. A PerspectiveCamera's `fov` is its
// *vertical* field of view, so left unadjusted, the horizontal extent visible
// grows or shrinks with the aspect ratio: on a narrow (portrait) screen the
// piles get cropped out entirely, and on a very wide-but-short screen
// (landscape phone) they drift inward as a fraction of screen width, into
// the path of the centered UI panel. Solving for the vertical FOV that keeps
// the *horizontal* extent constant at the reference aspect fixes both —
// piles land at the same screen fraction at every aspect ratio.
const BASE_FOV = 42;
const REFERENCE_ASPECT = 1280 / 800;
const MIN_FOV = 15;
const MAX_FOV = 100;

function fovForAspect(aspect: number): number {
  const baseFovRad = THREE.MathUtils.degToRad(BASE_FOV);
  const newFovRad = 2 * Math.atan(Math.tan(baseFovRad / 2) * (REFERENCE_ASPECT / aspect));
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(newFovRad), MIN_FOV, MAX_FOV);
}

function jitter(seed: number): { x: number; z: number; ry: number } {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 12345.678;
  const fracA = a - Math.floor(a);
  const fracB = b - Math.floor(b);
  return {
    x: (fracA - 0.5) * 0.08,
    z: (fracB - 0.5) * 0.08,
    ry: (fracA - 0.5) * 0.3,
  };
}

export class TableScene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  battleGroup = new THREE.Group();

  private pileGroups: Record<PlayerId, THREE.Group> = { A: new THREE.Group(), B: new THREE.Group() };
  private container: HTMLElement;
  private clock = new THREE.Clock();
  private frameCallbacks: ((dt: number) => void)[] = [];

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene.background = new THREE.Color(0x0d1420);
    this.scene.fog = new THREE.Fog(0x0d1420, 10, 22);

    const initialAspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(fovForAspect(initialAspect), initialAspect, 0.1, 100);
    this.camera.position.set(0, 6.4, 7.6);
    this.camera.lookAt(0, 0.3, -0.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.setupTable();

    this.scene.add(this.pileGroups.A, this.pileGroups.B, this.battleGroup);

    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("orientationchange", () => this.onResize());
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0x8899bb, 0.55);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff2d8, 1.4);
    key.position.set(3, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    this.scene.add(key);

    const rim = new THREE.PointLight(0x6ea8ff, 1.2, 15);
    rim.position.set(-2, 3, -3);
    this.scene.add(rim);

    const glow = new THREE.PointLight(0xff8a4c, 0.9, 8);
    glow.position.set(0, 1.5, 1);
    this.scene.add(glow);
  }

  private setupTable() {
    const tableGeo = new THREE.CircleGeometry(6, 64);
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x123324, roughness: 0.85, metalness: 0.05 });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    this.scene.add(table);

    const ringGeo = new THREE.RingGeometry(5.9, 6.15, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xd9b25c, roughness: 0.5, metalness: 0.4 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    this.scene.add(ring);

    const centerLineGeo = new THREE.PlaneGeometry(0.04, 5.2);
    const centerLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 });
    const centerLine = new THREE.Mesh(centerLineGeo, centerLineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.002;
    this.scene.add(centerLine);
  }

  onFrame(cb: (dt: number) => void): void {
    this.frameCallbacks.push(cb);
  }

  start(): void {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      tweenManager.update(dt * 1000);
      for (const cb of this.frameCallbacks) cb(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setPileCount(player: PlayerId, count: number): void {
    const group = this.pileGroups[player];
    const target = Math.min(MAX_PILE_VISUAL, count);
    while (group.children.length < target) {
      const i = group.children.length;
      const mesh = createCardBackMesh();
      const j = jitter(i + (player === "A" ? 0 : 1000));
      mesh.position.set(PILE_POS[player].x + j.x, 0.012 + i * 0.008, PILE_POS[player].z + j.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = j.ry;
      group.add(mesh);
    }
    while (group.children.length > target) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
    }
  }

  pileTopPosition(player: PlayerId): THREE.Vector3 {
    const n = this.pileGroups[player].children.length;
    const j = jitter(n + (player === "A" ? 0 : 1000));
    return new THREE.Vector3(PILE_POS[player].x + j.x, 0.02 + n * 0.008, PILE_POS[player].z + j.z);
  }

  cardWidth = CARD_WIDTH;
  cardHeight = CARD_HEIGHT;
}
