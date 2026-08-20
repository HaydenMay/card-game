import * as THREE from "three";
import { type Card, isRedSuit } from "../game/Card";

export const CARD_WIDTH = 0.7;
export const CARD_HEIGHT = 1.0;

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const frontTextureCache = new Map<string, THREE.CanvasTexture>();
let backTexture: THREE.CanvasTexture | null = null;

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function getFrontTexture(card: Card): THREE.CanvasTexture {
  const cached = frontTextureCache.get(card.id);
  if (cached) return cached;

  const W = 256;
  const H = 366;
  const { canvas, ctx } = makeCanvas(W, H);

  roundedRect(ctx, 2, 2, W - 4, H - 4, 20);
  ctx.fillStyle = "#f8f5ec";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#d9d2bd";
  ctx.stroke();

  const color = isRedSuit(card.suit) ? "#c0392b" : "#1a1a1a";
  ctx.fillStyle = color;

  ctx.font = "bold 48px Georgia, serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(card.label, 22, 16);
  ctx.font = "40px Georgia, serif";
  ctx.fillText(SUIT_SYMBOL[card.suit], 22, 68);

  ctx.save();
  ctx.translate(W - 22, H - 16);
  ctx.rotate(Math.PI);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "bold 48px Georgia, serif";
  ctx.fillText(card.label, 0, 0);
  ctx.font = "40px Georgia, serif";
  ctx.fillText(SUIT_SYMBOL[card.suit], 0, 52);
  ctx.restore();

  ctx.font = "120px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(SUIT_SYMBOL[card.suit], W / 2, H / 2 + 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  frontTextureCache.set(card.id, texture);
  return texture;
}

function getBackTexture(): THREE.CanvasTexture {
  if (backTexture) return backTexture;
  const W = 256;
  const H = 366;
  const { canvas, ctx } = makeCanvas(W, H);

  roundedRect(ctx, 2, 2, W - 4, H - 4, 20);
  ctx.fillStyle = "#7a1f2b";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f2d98d";
  ctx.stroke();

  roundedRect(ctx, 16, 16, W - 32, H - 32, 14);
  ctx.strokeStyle = "rgba(242, 217, 141, 0.7)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.strokeStyle = "rgba(242, 217, 141, 0.35)";
  ctx.lineWidth = 2;
  const step = 18;
  for (let x = -H; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }

  ctx.fillStyle = "#f2d98d";
  ctx.font = "bold 30px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("WAR", W / 2, H / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  backTexture = texture;
  return texture;
}

export interface CardMesh3D {
  group: THREE.Group;
  card: Card;
  dispose(): void;
}

/** Builds a double-sided card: a front plane (face) and a back plane, joined at a thin spine. */
export function createCardMesh(card: Card): CardMesh3D {
  const group = new THREE.Group();

  const frontMat = new THREE.MeshStandardMaterial({
    map: getFrontTexture(card),
    roughness: 0.7,
    metalness: 0.05,
  });
  const backMat = new THREE.MeshStandardMaterial({
    map: getBackTexture(),
    roughness: 0.7,
    metalness: 0.05,
  });

  const geo = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);

  const front = new THREE.Mesh(geo, frontMat);
  front.position.z = 0.005;
  front.castShadow = true;
  front.receiveShadow = true;

  const back = new THREE.Mesh(geo, backMat);
  back.rotation.y = Math.PI;
  back.position.z = -0.005;
  back.castShadow = true;
  back.receiveShadow = true;

  group.add(front, back);

  return {
    group,
    card,
    dispose() {
      geo.dispose();
      frontMat.dispose();
      backMat.dispose();
    },
  };
}

export function createCardBackMesh(): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
  const mat = new THREE.MeshStandardMaterial({ map: getBackTexture(), roughness: 0.7, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
