import * as THREE from "three";

export interface TrackSample {
  position: THREE.Vector3;
  /** Y rotation for an object whose local forward is +Z. */
  heading: number;
  /** Signed curvature: 0 on the straights, ±1/radius through the turns. */
  curvature: number;
}

/**
 * A stadium-shaped (two straights + two semicircles) racing oval, parametrised
 * by distance travelled along the centreline. `laneOffset` is a lateral shift
 * from that centreline, positive being *outward* (away from the infield).
 */
export class OvalTrack {
  readonly straight: number;
  readonly radius: number;
  readonly halfWidth: number;
  readonly perimeter: number;

  private readonly segA: number;
  private readonly segB: number;
  private readonly segC: number;

  constructor(straight = 70, radius = 40, halfWidth = 9) {
    this.straight = straight;
    this.radius = radius;
    this.halfWidth = halfWidth;

    const arc = Math.PI * radius;
    this.segA = straight;
    this.segB = this.segA + arc;
    this.segC = this.segB + straight;
    this.perimeter = this.segC + arc;
  }

  wrap(distance: number): number {
    const p = this.perimeter;
    return ((distance % p) + p) % p;
  }

  sample(distance: number, laneOffset = 0): TrackSample {
    const s = this.wrap(distance);
    const L = this.straight;
    const R = this.radius;

    let x: number;
    let z: number;
    let dirX: number;
    let dirZ: number;
    let curvature = 0;

    if (s < this.segA) {
      x = -L / 2 + s;
      z = -R;
      dirX = 1;
      dirZ = 0;
    } else if (s < this.segB) {
      const a = -Math.PI / 2 + (s - this.segA) / R;
      x = L / 2 + R * Math.cos(a);
      z = R * Math.sin(a);
      dirX = -Math.sin(a);
      dirZ = Math.cos(a);
      curvature = 1 / R;
    } else if (s < this.segC) {
      x = L / 2 - (s - this.segB);
      z = R;
      dirX = -1;
      dirZ = 0;
    } else {
      const a = Math.PI / 2 + (s - this.segC) / R;
      x = -L / 2 + R * Math.cos(a);
      z = R * Math.sin(a);
      dirX = -Math.sin(a);
      dirZ = Math.cos(a);
      curvature = 1 / R;
    }

    // Outward normal is the heading rotated -90 degrees in the XZ plane.
    const nx = dirZ;
    const nz = -dirX;

    return {
      position: new THREE.Vector3(x + nx * laneOffset, 0, z + nz * laneOffset),
      heading: Math.atan2(dirX, dirZ),
      curvature,
    };
  }

  /** Builds a flat ribbon mesh spanning two lane offsets, for surfaces and lines. */
  buildRibbon(inner: number, outer: number, y: number, segments = 400): THREE.BufferGeometry {
    const positions: number[] = [];
    const step = this.perimeter / segments;

    for (let i = 0; i < segments; i++) {
      const s0 = i * step;
      const s1 = (i + 1) * step;
      const a = this.sample(s0, inner).position;
      const b = this.sample(s0, outer).position;
      const c = this.sample(s1, inner).position;
      const d = this.sample(s1, outer).position;

      // Wound counter-clockwise seen from above so the face points up.
      positions.push(a.x, y, a.z, d.x, y, d.z, b.x, y, b.z);
      positions.push(a.x, y, a.z, c.x, y, c.z, d.x, y, d.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  /** Closed curve following a lane, used for rails. */
  buildLaneCurve(laneOffset: number, points = 240): THREE.CatmullRomCurve3 {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < points; i++) {
      pts.push(this.sample((i / points) * this.perimeter, laneOffset).position);
    }
    return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.5);
  }
}
