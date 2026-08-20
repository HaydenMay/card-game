import * as THREE from "three";

export interface HorseColors {
  coat: number;
  mane: number;
  silks: number;
  cap: number;
}

const HOOF_COLOR = 0x2a2521;
const EYE_COLOR = 0x14100e;

const SHOULDER_Y = 1.02;
const UPPER_LEN = 0.5;
const LOWER_LEN = 0.46;
const HOOF_LEN = 0.06;

/** Metres of ground covered per stride, used to lock leg cadence to speed. */
const STRIDE_LENGTH = 6.8;

const TAU = Math.PI * 2;

function mat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
}

function ball(material: THREE.Material, sx: number, sy: number, sz: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), material);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  return mesh;
}

function taperedCylinder(
  material: THREE.Material,
  topRadius: number,
  bottomRadius: number,
  length: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, 7),
    material
  );
  mesh.castShadow = true;
  return mesh;
}

function saddleClothTexture(number: number, silks: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `#${silks.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), 32, 35);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface Leg {
  upper: THREE.Group;
  lower: THREE.Group;
  phase: number;
  front: boolean;
}

/**
 * A horse assembled entirely from primitives and animated procedurally — no
 * rigged asset or keyframe data. The gallop comes from driving each joint with
 * a phase-offset sine wave, with the stride cadence locked to ground speed so
 * the hooves don't skate.
 */
export class HorseModel {
  readonly root = new THREE.Group();

  private readonly body = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tailSegments: THREE.Group[] = [];
  private readonly legs: Leg[] = [];
  private readonly jockey = new THREE.Group();
  private readonly jockeyTorso = new THREE.Group();

  private stride = Math.random();
  private readonly neckBase: number;

  constructor(colors: HorseColors, saddleNumber: number) {
    const coatMat = mat(colors.coat);
    const maneMat = mat(colors.mane, 0.9);
    const hoofMat = mat(HOOF_COLOR, 0.6);
    const silksMat = mat(colors.silks, 0.7);
    const capMat = mat(colors.cap, 0.6);
    const skinMat = mat(0x6b4a37, 0.9);

    this.root.add(this.body);

    // Barrel, chest and rump: low-poly spheres read as a rounded body when
    // flat-shaded, and avoid the boxiness of a cuboid torso.
    const barrel = ball(coatMat, 0.3, 0.36, 0.6);
    barrel.position.set(0, SHOULDER_Y + 0.05, 0);
    const chest = ball(coatMat, 0.285, 0.345, 0.3);
    chest.position.set(0, SHOULDER_Y + 0.06, 0.48);
    const rump = ball(coatMat, 0.315, 0.35, 0.34);
    rump.position.set(0, SHOULDER_Y + 0.05, -0.55);
    this.body.add(barrel, chest, rump);

    // Neck pivots at the chest and carries the head group at its top. Kept
    // short and raked well forward — an upright neck reads as a llama.
    this.neckBase = 0.95;
    this.neck.position.set(0, SHOULDER_Y + 0.24, 0.58);
    this.neck.rotation.x = this.neckBase;
    const neckMesh = taperedCylinder(coatMat, 0.145, 0.235, 0.48);
    neckMesh.position.y = 0.24;
    this.neck.add(neckMesh);
    this.body.add(this.neck);

    this.head.position.y = 0.48;
    this.head.rotation.x = -this.neckBase + 0.3;
    const skull = ball(coatMat, 0.125, 0.155, 0.225);
    skull.position.set(0, 0.04, 0.04);
    const muzzle = ball(coatMat, 0.095, 0.105, 0.155);
    muzzle.position.set(0, -0.025, 0.26);
    const blaze = ball(mat(0xf2ece0, 0.9), 0.05, 0.055, 0.14);
    blaze.position.set(0, 0.055, 0.18);
    this.head.add(skull, muzzle, blaze);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 6), coatMat);
      ear.position.set(side * 0.072, 0.185, -0.02);
      ear.rotation.x = -0.15;
      ear.castShadow = true;
      this.head.add(ear);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat(EYE_COLOR, 0.3));
      eye.position.set(side * 0.108, 0.07, 0.12);
      this.head.add(eye);
    }

    // Forelock + mane: flattened wedges swept back so they lie along the
    // crest rather than standing up like a dinosaur's spines.
    const forelock = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 5), maneMat);
    forelock.position.set(0, 0.17, 0.05);
    forelock.rotation.x = 0.6;
    forelock.scale.x = 0.6;
    this.head.add(forelock);
    this.neck.add(this.head);

    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.078 - t * 0.016, 0.23, 5), maneMat);
      tuft.position.set(0, 0.06 + t * 0.38, -0.115 + t * 0.02);
      tuft.rotation.x = -1.9;
      tuft.scale.x = 0.9;
      tuft.castShadow = true;
      this.neck.add(tuft);
    }

    // Tail: a chain of tapering segments so it can trail and sway.
    let tailParent: THREE.Group = this.body;
    let tailOrigin = new THREE.Vector3(0, SHOULDER_Y + 0.2, -0.8);
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.copy(tailOrigin);
      // Slightly longer than the joint spacing so segments overlap rather
      // than reading as a chain of separate sticks.
      const mesh = taperedCylinder(maneMat, 0.055 - i * 0.011, 0.1 - i * 0.011, 0.22);
      mesh.position.y = -0.09;
      seg.add(mesh);
      tailParent.add(seg);
      this.tailSegments.push(seg);
      tailParent = seg;
      tailOrigin = new THREE.Vector3(0, -0.17, 0);
    }

    // Legs. Front and hind differ in bulk and in which way the joint folds.
    const legPositions: { x: number; z: number; front: boolean; phase: number }[] = [
      { x: -0.19, z: 0.45, front: true, phase: 0.48 },
      { x: 0.19, z: 0.45, front: true, phase: 0.6 },
      { x: -0.2, z: -0.5, front: false, phase: 0.0 },
      { x: 0.2, z: -0.5, front: false, phase: 0.12 },
    ];

    for (const spec of legPositions) {
      const upper = new THREE.Group();
      upper.position.set(spec.x, SHOULDER_Y, spec.z);

      const upperMesh = taperedCylinder(
        coatMat,
        spec.front ? 0.085 : 0.1,
        spec.front ? 0.125 : 0.175,
        UPPER_LEN
      );
      upperMesh.position.y = -UPPER_LEN / 2;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.y = -UPPER_LEN;
      const lowerMesh = taperedCylinder(coatMat, 0.05, 0.078, LOWER_LEN);
      lowerMesh.position.y = -LOWER_LEN / 2;
      lower.add(lowerMesh);

      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.055, HOOF_LEN, 7), hoofMat);
      hoof.position.y = -LOWER_LEN - HOOF_LEN / 2;
      hoof.castShadow = true;
      lower.add(hoof);

      upper.add(lower);
      this.body.add(upper);
      this.legs.push({ upper, lower, phase: spec.phase, front: spec.front });
    }

    // Saddle cloth carrying the runner's number.
    const clothMat = new THREE.MeshStandardMaterial({
      map: saddleClothTexture(saddleNumber, colors.silks),
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.28), clothMat);
      // Sits behind the rider's leg so the number stays readable.
      cloth.position.set(side * 0.3, SHOULDER_Y + 0.02, -0.12);
      cloth.rotation.y = side * Math.PI * 0.5;
      this.body.add(cloth);
    }

    // Jockey, crouched forward over the withers. Seated high enough that the
    // legs straddle the barrel instead of disappearing inside it.
    this.jockey.position.set(0, SHOULDER_Y + 0.46, 0.08);
    this.jockeyTorso.rotation.x = 0.88;
    // Seat and back as two masses, so the rider has a waist rather than
    // fusing with the arms into one undifferentiated cone.
    const seat = ball(silksMat, 0.155, 0.13, 0.145);
    seat.position.set(0, 0.0, -0.04);
    const torso = ball(silksMat, 0.15, 0.215, 0.135);
    torso.position.y = 0.15;
    this.jockeyTorso.add(seat, torso);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.4, 0.06);
    headGroup.rotation.x = -0.78;
    const jHead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), skinMat);
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.122, 9, 6, 0, TAU, 0, Math.PI * 0.62),
      capMat
    );
    helmet.position.y = 0.012;
    helmet.castShadow = true;
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.1), capMat);
    peak.position.set(0, 0.025, 0.115);
    headGroup.add(jHead, helmet, peak);
    this.jockeyTorso.add(headGroup);

    const breechesMat = mat(0xf4f1ea, 0.75);
    const bootMat = mat(0x241d18, 0.6);

    for (const side of [-1, 1]) {
      // Arms reach forward down the neck to the reins.
      // Thin and set well apart so the two arms stay distinct shapes.
      const arm = taperedCylinder(silksMat, 0.028, 0.036, 0.32);
      arm.position.set(side * 0.175, 0.1, 0.3);
      arm.rotation.x = 2.16;
      this.jockey.add(arm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 7, 5), skinMat);
      hand.position.set(side * 0.145, 0.01, 0.42);
      this.jockey.add(hand);

      // Thigh angles down and forward to a high knee. Kept slim — a thick
      // pale cylinder here reads as a plank strapped to the horse.
      const thigh = taperedCylinder(breechesMat, 0.042, 0.055, 0.22);
      thigh.position.set(side * 0.28, -0.075, 0.1);
      thigh.rotation.x = 2.03;
      this.jockey.add(thigh);

      // Shin folds back down from the knee into a short stirrup. This is the
      // part that actually reads as a leg from trackside, so it carries.
      const boot = taperedCylinder(bootMat, 0.055, 0.062, 0.26);
      boot.position.set(side * 0.295, -0.27, 0.14);
      boot.rotation.x = 0.5;
      this.jockey.add(boot);
    }

    this.jockey.add(this.jockeyTorso);
    this.body.add(this.jockey);

    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.castShadow = true;
    });
  }

  /**
   * Advances the gait. Everything is driven off `stride` — a normalised stride
   * counter incremented by distance travelled, so cadence scales with speed.
   */
  update(dt: number, speed: number, banking = 0): void {
    this.stride += (speed / STRIDE_LENGTH) * dt;
    const theta = this.stride * TAU;

    // Gallop: one suspension per stride, so the body rises and falls once per
    // cycle (a trot would be twice) with a matching fore/aft pitch rock.
    const airborne = Math.max(0, Math.sin(theta + 1.1));
    const effort = THREE.MathUtils.clamp(speed / 18, 0, 1);
    this.body.position.y = (0.03 * Math.sin(theta * 2) + 0.075 * airborne) * effort;
    this.body.rotation.x = 0.05 * Math.sin(theta + 2.2) * effort;

    for (const leg of this.legs) {
      const t = theta + leg.phase * TAU;
      // Stance sweeps the leg back (drive), swing carries it forward again.
      leg.upper.rotation.x = -0.72 * Math.cos(t) * effort;
      // The joint only folds while the hoof is off the ground, and folds
      // backwards at the knee up front, forwards at the hock behind.
      const fold = Math.max(0, -Math.sin(t));
      // Standing angle of the joint: the hind hock is permanently bent
      // forward, which is what gives a horse its cocked back legs.
      const rest = leg.front ? 0.12 : -0.34;
      leg.lower.rotation.x = rest + (leg.front ? 1.5 : -1.25) * fold * effort;
    }

    // Head and neck pump in counter-phase with the body — the give-away
    // motion that makes a gallop read as a gallop. The neck also reaches
    // further forward the faster the horse is going.
    this.neck.rotation.x = this.neckBase + 0.18 * effort + 0.12 * Math.sin(theta + 0.4) * effort;
    this.head.rotation.x =
      -this.neckBase + 0.3 - 0.12 * effort - 0.09 * Math.sin(theta + 0.9) * effort;

    // Tail streams out behind (positive X rotation swings it to -Z), each
    // segment lagging the one before it so it ripples.
    this.tailSegments.forEach((seg, i) => {
      const lag = theta - i * 0.5;
      const base = i === 0 ? 0.55 + 0.62 * effort : 0.06 + 0.04 * effort;
      seg.rotation.x = base + 0.06 * Math.sin(lag) * effort;
      seg.rotation.z = 0.06 * Math.sin(lag * 0.7 + i) * effort;
    });

    // Jockey rides the motion out of phase with the horse, knees absorbing it.
    this.jockeyTorso.rotation.x = 0.8 + 0.09 * Math.sin(theta + 3.0) * effort;
    this.jockey.position.y = SHOULDER_Y + 0.4 + 0.035 * Math.sin(theta + 2.4) * effort;

    // Lean into the turns.
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, banking, 1 - Math.exp(-dt * 4));
  }
}
