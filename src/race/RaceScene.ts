import * as THREE from "three";
import { OvalTrack } from "./Track";
import { HorseModel } from "./Horse";
import { RaceSim, START_DISTANCE, type HorseSpec } from "./RaceSim";

export type CameraMode = "broadcast" | "chase" | "aerial" | "wire";

const BASE_FOV = 45;
const REFERENCE_ASPECT = 1280 / 800;

/**
 * Widens the vertical FOV as the viewport narrows, so the same horizontal
 * slice of the world stays visible. Below MIN_FRAMING_ASPECT it stops
 * widening: insisting on the full landscape width on a tall phone pushes the
 * camera into a ~100 degree fisheye and shrinks the horses to specks. Past
 * that point a strung-out field may run past the edges, which the running
 * order panel covers for.
 */
const MIN_FRAMING_ASPECT = 0.9;

function fovForAspect(aspect: number): number {
  const effective = Math.max(aspect, MIN_FRAMING_ASPECT);
  const rad = THREE.MathUtils.degToRad(BASE_FOV);
  const adjusted = 2 * Math.atan(Math.tan(rad / 2) * (REFERENCE_ASPECT / effective));
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(adjusted), 20, 80);
}

export class RaceScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly track = new OvalTrack(70, 40, 9);

  cameraMode: CameraMode = "broadcast";

  private readonly container: HTMLElement;
  private readonly sun: THREE.DirectionalLight;
  private readonly horses = new Map<number, HorseModel>();
  private readonly gate = new THREE.Group();
  private readonly finishLineDistance: number;
  private readonly camTarget = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.container = container;
    this.finishLineDistance = this.track.wrap(START_DISTANCE + 612);

    const sky = new THREE.Color(0x8fc4e8);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 120, 340);

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(fovForAspect(aspect), aspect, 0.1, 600);
    this.camera.position.set(0, 12, -70);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x4a6b3a, 0.85);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
    this.sun.position.set(30, 60, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    // A tight frustum that follows the field keeps shadows crisp instead of
    // smearing a single map across the whole 390m oval.
    const cam = this.sun.shadow.camera;
    cam.left = -26;
    cam.right = 26;
    cam.top = 26;
    cam.bottom = -26;
    cam.near = 1;
    cam.far = 160;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.buildWorld();

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => this.resize());
  }

  private buildWorld(): void {
    const { track } = this;

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x4f7f3f, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const dirt = new THREE.Mesh(
      track.buildRibbon(-track.halfWidth, track.halfWidth, 0),
      new THREE.MeshStandardMaterial({ color: 0xa87048, roughness: 1 })
    );
    dirt.receiveShadow = true;
    this.scene.add(dirt);

    const infield = new THREE.Mesh(
      new THREE.ShapeGeometry(this.infieldShape()),
      new THREE.MeshStandardMaterial({ color: 0x5b8f45, roughness: 1 })
    );
    infield.rotation.x = -Math.PI / 2;
    infield.position.y = 0.01;
    infield.receiveShadow = true;
    this.scene.add(infield);

    for (const offset of [-track.halfWidth, track.halfWidth]) {
      const rail = new THREE.Mesh(
        new THREE.TubeGeometry(track.buildLaneCurve(offset), 260, 0.08, 6, true),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.6 })
      );
      rail.position.y = 1.05;
      this.scene.add(rail);

      const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.05, 6);
      const postMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.7 });
      const posts = new THREE.InstancedMesh(postGeo, postMat, 80);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 80; i++) {
        const p = track.sample((i / 80) * track.perimeter, offset).position;
        m.makeTranslation(p.x, 0.52, p.z);
        posts.setMatrixAt(i, m);
      }
      this.scene.add(posts);
    }

    this.buildFinishLine();
    this.buildGrandstand();
    this.buildStartGate();
  }

  private infieldShape(): THREE.Shape {
    const shape = new THREE.Shape();
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const p = this.track.sample((i / steps) * this.track.perimeter, -this.track.halfWidth).position;
      // ShapeGeometry lives in XY before we rotate it flat, so Z maps to -Y.
      if (i === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    }
    return shape;
  }

  private buildFinishLine(): void {
    const { track } = this;
    const s = this.finishLineDistance;
    const inner = track.sample(s, -track.halfWidth).position;
    const outer = track.sample(s, track.halfWidth).position;

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(track.halfWidth * 2, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    );
    line.position.set((inner.x + outer.x) / 2, 0.02, (inner.z + outer.z) / 2);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -track.sample(s).heading;
    this.scene.add(line);

    const postMat = new THREE.MeshStandardMaterial({ color: 0xd8332f, roughness: 0.6 });
    for (const p of [inner, outer]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8), postMat);
      post.position.set(p.x, 2.2, p.z);
      post.castShadow = true;
      this.scene.add(post);
    }
  }

  private buildGrandstand(): void {
    const { track } = this;
    const anchor = track.sample(this.finishLineDistance, track.halfWidth + 16).position;
    const heading = track.sample(this.finishLineDistance).heading;

    const stand = new THREE.Group();
    stand.position.copy(anchor);
    stand.rotation.y = heading;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(70, 7, 16),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.9 })
    );
    base.position.y = 3.5;
    base.castShadow = true;
    base.receiveShadow = true;
    stand.add(base);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(72, 0.7, 18),
      new THREE.MeshStandardMaterial({ color: 0x3f5d78, roughness: 0.7 })
    );
    roof.position.y = 10.5;
    roof.castShadow = true;
    stand.add(roof);

    for (const x of [-34, 34]) {
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 10.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xd6cfc0, roughness: 0.9 })
      );
      column.position.set(x, 5.25, -7);
      stand.add(column);
    }

    // Terraced crowd, instanced so a few thousand spectators stay cheap.
    const crowdGeo = new THREE.BoxGeometry(0.42, 0.72, 0.42);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true });
    const rows = 7;
    const perRow = 74;
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, rows * perRow);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < perRow; c++) {
        const x = -33 + (c / (perRow - 1)) * 66 + (r % 2) * 0.4;
        matrix.makeTranslation(x, 7.4 + r * 0.55, -2 - r * 1.5);
        crowd.setMatrixAt(i, matrix);
        color.setHSL(Math.random(), 0.55, 0.45 + Math.random() * 0.25);
        crowd.setColorAt(i, color);
        i++;
      }
    }
    stand.add(crowd);
    this.scene.add(stand);
  }

  private buildStartGate(): void {
    const { track } = this;
    const sample = track.sample(START_DISTANCE);
    this.gate.position.copy(sample.position);
    this.gate.rotation.y = sample.heading;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3f4a55, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(track.halfWidth * 2, 0.5, 0.5), frameMat);
    body.position.y = 2.6;
    this.gate.add(body);

    for (let i = 0; i <= 6; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.8, 0.5), frameMat);
      post.position.set(-track.halfWidth + (i / 6) * track.halfWidth * 2, 1.4, 0);
      post.castShadow = true;
      this.gate.add(post);
    }
    this.scene.add(this.gate);
  }

  setGateVisible(visible: boolean): void {
    this.gate.visible = visible;
  }

  addHorses(field: HorseSpec[]): void {
    for (const model of this.horses.values()) this.scene.remove(model.root);
    this.horses.clear();

    field.forEach((spec, i) => {
      const model = new HorseModel(
        { coat: spec.coat, mane: spec.mane, silks: spec.silks, cap: spec.cap },
        i + 1
      );
      this.horses.set(spec.id, model);
      this.scene.add(model.root);
    });
  }

  /** Places every horse on its lane and advances its gait. */
  syncHorses(sim: RaceSim, dt: number): void {
    for (const runner of sim.runners) {
      const model = this.horses.get(runner.spec.id);
      if (!model) continue;
      const s = START_DISTANCE + runner.distance;
      const sample = this.track.sample(s, runner.lane);
      model.root.position.copy(sample.position);
      model.root.rotation.y = sample.heading;
      const banking = -sample.curvature * runner.speed * 0.55;
      model.update(dt, runner.speed, banking);
    }
  }

  updateCamera(sim: RaceSim, dt: number): void {
    const order = sim.order();
    const leader = order[0];
    const laneCentre = sim.runners.reduce((sum, r) => sum + r.lane, 0) / sim.runners.length;

    // Frame the field by its extremes rather than its average, so a stretched
    // -out field doesn't push the leader off the edge of the shot.
    let lead = -Infinity;
    let tail = Infinity;
    for (const r of sim.runners) {
      if (r.distance > lead) lead = r.distance;
      if (r.distance < tail) tail = r.distance;
    }
    const packDistance = (lead + tail) / 2;
    const spread = lead - tail;

    const packPoint = this.track.sample(START_DISTANCE + packDistance, laneCentre).position;
    let desired: THREE.Vector3;
    let lookAt = packPoint.clone().setY(1.2);
    let responsiveness = 3.5;

    switch (this.cameraMode) {
      case "chase": {
        const behind = this.track.sample(START_DISTANCE + leader.distance - 11, leader.lane).position;
        desired = behind.clone().setY(3.4);
        lookAt = this.track
          .sample(START_DISTANCE + leader.distance + 6, leader.lane)
          .position.setY(1.4);
        responsiveness = 5;
        break;
      }
      case "aerial": {
        desired = this.track
          .sample(START_DISTANCE + packDistance - 26, laneCentre)
          .position.setY(38 + spread * 0.35);
        responsiveness = 2.2;
        break;
      }
      case "wire": {
        // Head-on: sits down the track ahead of the leader looking back, so
        // the field runs straight at the lens. Anchoring it to the winning
        // post instead would frame empty track for most of the race.
        desired = this.track
          .sample(START_DISTANCE + lead + 34, laneCentre)
          .position.setY(3.0);
        responsiveness = 3;
        break;
      }
      case "broadcast":
      default: {
        // Tracking truck running inside the rail, level with the field, easing
        // back as the runners string out so the whole field stays in shot.
        desired = this.track
          .sample(
            START_DISTANCE + packDistance + 2,
            -(this.track.halfWidth + 13 + spread * 0.42)
          )
          .position.setY(5.6 + spread * 0.12);
        break;
      }
    }

    const smoothing = 1 - Math.exp(-dt * responsiveness);
    this.camera.position.lerp(desired, smoothing);
    this.camTarget.lerp(lookAt, smoothing);
    this.camera.lookAt(this.camTarget);

    // Keep the shadow frustum centred on the action.
    this.sun.position.set(packPoint.x + 30, 60, packPoint.z + 20);
    this.sun.target.position.copy(packPoint);
    this.sun.target.updateMatrixWorld();
  }

  /** Snaps the camera to the field instead of easing in from the last race. */
  resetCamera(sim: RaceSim): void {
    for (let i = 0; i < 40; i++) this.updateCamera(sim, 0.1);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = fovForAspect(aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
