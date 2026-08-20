import * as THREE from "three";
import { type CardMesh3D, createCardMesh } from "./CardMesh";
import { Easing, tweenManager, wait } from "./Tween";
import { BATTLE_SLOT, TableScene } from "./TableScene";
import type { Card } from "../game/Card";
import type { PlayerId, RoundResult } from "../game/WarGame";

const REVEAL_MS = 420;
const CLASH_MS = 220;
const BURN_SLIDE_MS = 300;
const STRIKE_MS = 220;
const RECOVER_MS = 260;
const SWEEP_MS = 520;
const LUNGE_DISTANCE = 1.0;

function potPosition(index: number): THREE.Vector3 {
  const row = Math.floor(index / 6);
  const col = index % 6;
  const a = Math.sin(index * 12.9898) * 43758.5453;
  const jitterX = ((a - Math.floor(a)) - 0.5) * 0.12;
  return new THREE.Vector3(-0.6 + col * 0.24 + jitterX, 0.02 + index * 0.009, -1.15 - row * 0.26);
}

export class BattleController {
  private potMeshes: CardMesh3D[] = [];
  private potIndex = 0;

  constructor(private scene: TableScene) {}

  private spawnFromPile(player: PlayerId, card: Card): CardMesh3D {
    const mesh = createCardMesh(card);
    const start = this.scene.pileTopPosition(player);
    mesh.group.position.copy(start);
    mesh.group.rotation.x = Math.PI / 2;
    this.scene.battleGroup.add(mesh.group);
    return mesh;
  }

  private async revealToSlot(mesh: CardMesh3D, player: PlayerId): Promise<void> {
    const start = mesh.group.position.clone();
    const target = BATTLE_SLOT[player];
    await tweenManager.tween(
      REVEAL_MS,
      (t) => {
        mesh.group.position.lerpVectors(start, target, t);
        mesh.group.position.y += Math.sin(t * Math.PI) * 0.5;
        mesh.group.rotation.x = THREE.MathUtils.lerp(Math.PI / 2, 0, t);
      },
      Easing.easeOutQuad
    );
    mesh.group.position.copy(target);
    mesh.group.rotation.x = 0;
  }

  private async slideToPot(mesh: CardMesh3D): Promise<void> {
    const start = mesh.group.position.clone();
    const target = potPosition(this.potIndex++);
    await tweenManager.tween(
      BURN_SLIDE_MS,
      (t) => {
        mesh.group.position.lerpVectors(start, target, t);
        mesh.group.position.y += Math.sin(t * Math.PI) * 0.25;
      },
      Easing.easeOutQuad
    );
    mesh.group.position.copy(target);
    this.potMeshes.push(mesh);
  }

  private async moveToPot(mesh: CardMesh3D): Promise<void> {
    const start = mesh.group.position.clone();
    const target = potPosition(this.potIndex++);
    await tweenManager.tween(
      BURN_SLIDE_MS,
      (t) => {
        mesh.group.position.lerpVectors(start, target, t);
        mesh.group.position.y += Math.sin(t * Math.PI) * 0.35;
        mesh.group.rotation.x = THREE.MathUtils.lerp(0, Math.PI / 2, t);
      },
      Easing.easeOutQuad
    );
    mesh.group.position.copy(target);
    mesh.group.rotation.x = Math.PI / 2;
    this.potMeshes.push(mesh);
  }

  private async clash(meshA: CardMesh3D, meshB: CardMesh3D): Promise<void> {
    const baseA = meshA.group.position.clone();
    const baseB = meshB.group.position.clone();
    await tweenManager.tween(
      CLASH_MS,
      (t) => {
        const push = Math.sin(t * Math.PI) * 0.22;
        meshA.group.position.x = baseA.x + push;
        meshB.group.position.x = baseB.x - push;
      },
      Easing.easeInOutQuad
    );
    this.spawnImpactFlash(new THREE.Vector3(0, 0.5, 0), 0xffe08a);
    meshA.group.position.copy(baseA);
    meshB.group.position.copy(baseB);
  }

  private spawnImpactFlash(position: THREE.Vector3, color: number): void {
    const geo = new THREE.RingGeometry(0.05, 0.18, 24);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(position);
    this.scene.battleGroup.add(ring);
    tweenManager
      .tween(
        380,
        (t) => {
          const s = 1 + t * 3.5;
          ring.scale.set(s, s, s);
          mat.opacity = 0.9 * (1 - t);
        },
        Easing.easeOutQuad
      )
      .then(() => {
        this.scene.battleGroup.remove(ring);
        geo.dispose();
        mat.dispose();
      });
  }

  private async attackAndImpact(meshA: CardMesh3D, meshB: CardMesh3D, winner: PlayerId): Promise<void> {
    const attacker = winner === "A" ? meshA : meshB;
    const defender = winner === "A" ? meshB : meshA;

    const attackerBase = attacker.group.position.clone();
    const defenderBase = defender.group.position.clone();
    const dir = new THREE.Vector3().subVectors(defenderBase, attackerBase).normalize();
    const strike = attackerBase.clone().addScaledVector(dir, LUNGE_DISTANCE);
    const sign = Math.sign(dir.x) || 1;

    await tweenManager.tween(
      STRIKE_MS,
      (t) => {
        attacker.group.position.lerpVectors(attackerBase, strike, t);
        attacker.group.rotation.z = -sign * t * 0.3;
      },
      Easing.easeInQuad
    );

    this.spawnImpactFlash(defender.group.position.clone(), 0xff5a3c);

    await Promise.all([
      tweenManager.tween(
        RECOVER_MS,
        (t) => {
          attacker.group.position.lerpVectors(strike, attackerBase, t);
          attacker.group.rotation.z = -sign * (1 - t) * 0.3;
        },
        Easing.easeOutQuad
      ),
      tweenManager.tween(
        220,
        (t) => {
          defender.group.position.x = defenderBase.x + sign * 0.16 * t;
          defender.group.rotation.z = sign * 0.4 * t;
          defender.group.rotation.y = t * 0.5;
          const s = 1 - 0.2 * t;
          defender.group.scale.set(s, s, s);
        },
        Easing.easeOutQuad
      ),
    ]);
  }

  private async sweepToPile(meshes: CardMesh3D[], winner: PlayerId): Promise<void> {
    const promises = meshes.map(async (mesh, i) => {
      await wait(i * 25);
      const start = mesh.group.position.clone();
      const target = this.scene.pileTopPosition(winner);
      target.y += i * 0.006;
      await tweenManager.tween(
        SWEEP_MS,
        (t) => {
          mesh.group.position.lerpVectors(start, target, t);
          mesh.group.position.y += Math.sin(t * Math.PI) * 1.1;
          mesh.group.rotation.x = THREE.MathUtils.lerp(mesh.group.rotation.x, Math.PI / 2, t);
          mesh.group.rotation.z = THREE.MathUtils.lerp(mesh.group.rotation.z, 0, t);
          mesh.group.rotation.y = THREE.MathUtils.lerp(mesh.group.rotation.y, 0, t);
        },
        Easing.easeInQuad
      );
      this.scene.battleGroup.remove(mesh.group);
      mesh.dispose();
    });
    await Promise.all(promises);
  }

  async playRound(result: RoundResult, onLog: (msg: string) => void): Promise<void> {
    this.potMeshes = [];
    this.potIndex = 0;

    let currentA = this.spawnFromPile("A", result.initial.A);
    let currentB = this.spawnFromPile("B", result.initial.B);
    await Promise.all([this.revealToSlot(currentA, "A"), this.revealToSlot(currentB, "B")]);
    onLog(`${result.initial.A.label} vs ${result.initial.B.label}`);

    let ranOut: PlayerId | null = null;

    for (const stage of result.warStages) {
      onLog("Tie! War is declared.");
      await this.clash(currentA, currentB);
      await Promise.all([this.moveToPot(currentA), this.moveToPot(currentB)]);

      const burnMeshes = [
        ...stage.faceDown.A.map((c) => this.spawnFromPile("A", c)),
        ...stage.faceDown.B.map((c) => this.spawnFromPile("B", c)),
      ];
      await Promise.all(burnMeshes.map((m) => this.slideToPot(m)));

      if (stage.ranOutOf) {
        ranOut = stage.ranOutOf;
        onLog(`Player ${stage.ranOutOf} has no cards left for the war!`);
        break;
      }

      const flipA = this.spawnFromPile("A", stage.flipUp.A!);
      const flipB = this.spawnFromPile("B", stage.flipUp.B!);
      await Promise.all([this.revealToSlot(flipA, "A"), this.revealToSlot(flipB, "B")]);
      onLog(`War cards: ${stage.flipUp.A!.label} vs ${stage.flipUp.B!.label}`);
      currentA = flipA;
      currentB = flipB;
    }

    if (!ranOut) {
      onLog(`Player ${result.winner} wins the ${result.warStages.length ? "war" : "round"}!`);
      await this.attackAndImpact(currentA, currentB, result.winner);
      await this.sweepToPile([currentA, currentB, ...this.potMeshes], result.winner);
    } else {
      await this.sweepToPile([...this.potMeshes], result.winner);
    }
  }
}
