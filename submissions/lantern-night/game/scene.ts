/** Canvas renderer for Lantern Night. Pure presentation: outcomes come from the SDK client. */
import { spriteFrame, type GenerationSprites } from "@rarefriends/friendsdk/sprites";

export const VIEW = { width: 960, height: 640 } as const;
export const FRIEND = { x: 480, feet: 484, scale: 6 } as const;
export type Phase = "idle" | "charging" | "rising" | "descending" | "reveal";

export type SceneState = Readonly<{
  phase: Phase;
  /** Scene-clock milliseconds when the phase began. */
  phaseStart: number;
  charge: number;
  outcome: number | null;
  holding: boolean;
  inventory: readonly number[];
  paper: string;
  reducedMotion: boolean;
}>;

export const TIMING = {
  charge: 900,
  rise: { full: 2600, reduced: 700 },
  descend: { full: 1500, reduced: 500 },
} as const;

export const GIFT_STYLE = [
  { color: "#fff3b0", glow: "rgba(255,243,176,0.45)" },
  { color: "#dfe7ff", glow: "rgba(200,215,255,0.5)" },
  { color: "#8ee7ff", glow: "rgba(142,231,255,0.55)" },
  { color: "#ffd24a", glow: "rgba(255,196,64,0.8)" },
] as const;

type Ember = { x: number; y: number; vx: number; vy: number; life: number };
type Drifter = { x: number; y: number; speed: number; sway: number; size: number; paper: string };

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}

const rand = seeded(0x4c4e54);
const STARS = Array.from({ length: 140 }, () => ({ x: rand() * VIEW.width, y: rand() * 380, r: rand() * 1.4 + 0.3, phase: rand() * 6.28 }));
const WINDOWS = Array.from({ length: 26 }, () => ({ x: rand() * VIEW.width, y: 452 + rand() * 30, w: 2 + rand() * 3 }));
/** Fixed sky slots for kept gifts so the constellation grows stably. */
const SKY_SLOTS = Array.from({ length: 4 }, (_, kind) => {
  const pick = seeded(0x51 + kind * 97);
  return Array.from({ length: 40 }, () => ({ x: 40 + pick() * 880, y: 70 + pick() * 250, phase: pick() * 6.28 }));
});

export const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
export const riseMs = (reduced: boolean) => reduced ? TIMING.rise.reduced : TIMING.rise.full;
export const descendMs = (reduced: boolean) => reduced ? TIMING.descend.reduced : TIMING.descend.full;

/** Held lantern position above the Friend's head. */
const HELD = { x: FRIEND.x, y: FRIEND.feet - 136 };
const SKY_TOP = 96;

export function lanternPath(progress: number) {
  const p = ease(progress);
  return { x: HELD.x + Math.sin(progress * 5.2) * 38 * progress, y: HELD.y - (HELD.y - SKY_TOP) * p, scale: 1 - 0.55 * p };
}

export function createScene(canvas: HTMLCanvasElement, sprites: GenerationSprites | null) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw the festival.");
  const ctx = context;
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = VIEW.width * ratio; canvas.height = VIEW.height * ratio;
  let embers: Ember[] = [];
  const drifters: Drifter[] = [];
  let lastEmber = 0;

  function drawSky(now: number, reduced: boolean) {
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    sky.addColorStop(0, "#050819"); sky.addColorStop(0.45, "#141a45"); sky.addColorStop(0.72, "#3b2a5c"); sky.addColorStop(0.8, "#5a3a5e");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = "#fff";
    for (const star of STARS) {
      ctx.globalAlpha = reduced ? 0.7 : 0.45 + 0.4 * Math.sin(now / 900 + star.phase);
      ctx.fillRect(star.x, star.y, star.r, star.r);
    }
    ctx.globalAlpha = 1;
    // Moon
    const moon = ctx.createRadialGradient(812, 92, 4, 812, 92, 90);
    moon.addColorStop(0, "rgba(255,244,214,0.35)"); moon.addColorStop(1, "rgba(255,244,214,0)");
    ctx.fillStyle = moon; ctx.fillRect(700, 0, 230, 200);
    ctx.fillStyle = "#fff4d6"; ctx.beginPath(); ctx.arc(812, 92, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#141a45"; ctx.beginPath(); ctx.arc(824, 84, 22, 0, Math.PI * 2); ctx.fill();
  }

  function drawLand() {
    ctx.fillStyle = "#1c1840";
    ctx.beginPath(); ctx.moveTo(0, 470);
    ctx.bezierCurveTo(180, 420, 330, 470, 520, 448); ctx.bezierCurveTo(700, 428, 820, 460, 960, 440);
    ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill();
    ctx.fillStyle = "#ffc76b";
    for (const light of WINDOWS) ctx.fillRect(light.x, light.y, light.w, light.w);
    ctx.fillStyle = "#0b0a22";
    ctx.beginPath(); ctx.moveTo(0, 548);
    ctx.bezierCurveTo(200, 505, 330, 478, 480, 478); ctx.bezierCurveTo(640, 478, 780, 515, 960, 548);
    ctx.lineTo(960, 640); ctx.lineTo(0, 640); ctx.fill();
    // Grass tufts on the hill edge
    ctx.strokeStyle = "#221f4d"; ctx.lineWidth = 2;
    for (let x = 300; x < 680; x += 23) { ctx.beginPath(); ctx.moveTo(x, 481 + Math.abs(x - 480) / 14); ctx.lineTo(x + 4, 472 + Math.abs(x - 480) / 14); ctx.stroke(); }
  }

  function glow(x: number, y: number, radius: number, color: string) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawLantern(x: number, y: number, scale: number, paper: string, light: number) {
    if (light > 0) glow(x, y, 70 * scale * (0.6 + light * 0.6), `rgba(255,180,90,${0.55 * light})`);
    const w = 30 * scale, top = 22 * scale, h = 38 * scale;
    ctx.fillStyle = paper; ctx.globalAlpha = 0.45 + 0.55 * light;
    ctx.beginPath();
    ctx.moveTo(x - top / 2, y - h / 2); ctx.lineTo(x + top / 2, y - h / 2);
    ctx.quadraticCurveTo(x + w / 2 + 4 * scale, y, x + w / 2 - 2 * scale, y + h / 2);
    ctx.lineTo(x - w / 2 + 2 * scale, y + h / 2);
    ctx.quadraticCurveTo(x - w / 2 - 4 * scale, y, x - top / 2, y - h / 2);
    ctx.fill(); ctx.globalAlpha = 1;
    if (light > 0) { ctx.fillStyle = `rgba(255,250,220,${0.7 * light})`; ctx.fillRect(x - 4 * scale, y - 6 * scale, 8 * scale, 16 * scale); }
    ctx.strokeStyle = "rgba(60,20,20,0.5)"; ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y + h / 2); ctx.stroke();
    ctx.fillStyle = "#3a1f1f"; ctx.fillRect(x - w / 2 + 2 * scale, y + h / 2, w - 4 * scale, 3 * scale);
  }

  function drawGift(kind: number, x: number, y: number, size: number, alpha = 1) {
    const style = GIFT_STYLE[kind] ?? GIFT_STYLE[0];
    ctx.globalAlpha = alpha;
    glow(x, y, size * 2.6, style.glow);
    ctx.fillStyle = style.color; ctx.beginPath();
    if (kind === 0) {
      for (let i = 0; i < 10; i++) { const r = i % 2 ? size * 0.45 : size; const a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      ctx.fill();
    } else if (kind === 1) {
      ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(x + size * 0.45, y - size * 0.3, size * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (kind === 2) {
      const tail = ctx.createLinearGradient(x, y, x - size * 4, y - size * 2);
      tail.addColorStop(0, style.color); tail.addColorStop(1, "rgba(142,231,255,0)");
      ctx.fillStyle = tail; ctx.moveTo(x, y - size * 0.6); ctx.lineTo(x - size * 4, y - size * 2); ctx.lineTo(x, y + size * 0.6); ctx.fill();
      ctx.fillStyle = style.color; ctx.beginPath(); ctx.arc(x, y, size * 0.7, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.globalAlpha = 1; drawLantern(x, y, size / 14, "#ffd24a", 1); ctx.globalAlpha = alpha;
    }
    ctx.globalAlpha = 1;
  }

  function drawFriend(now: number, state: SceneState) {
    const celebrating = state.phase === "reveal" && state.outcome !== null;
    const hop = celebrating && !state.reducedMotion ? Math.abs(Math.sin(now / (state.outcome! >= 2 ? 140 : 220))) * (state.outcome! >= 2 ? 26 : 12) : 0;
    const bob = state.phase === "charging" && !state.reducedMotion ? Math.sin(now / 90) * 1.5 : 0;
    const size = 16 * FRIEND.scale, left = FRIEND.x - size / 2, top = FRIEND.feet - size + 6 - hop + bob;
    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(FRIEND.x, FRIEND.feet + 2, 34 - hop / 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (!sprites) return;
    const frameIndex = state.reducedMotion ? 0 : Math.floor(now / 160) % 8;
    const rows = spriteFrame(sprites, "down", false, frameIndex).frame.rows;
    const s = FRIEND.scale;
    const pixels: [number, number][] = [];
    rows.forEach((row, py) => [...row].forEach((pixel, px) => { if (pixel === "#") pixels.push([px, py]); }));
    // Canonical look: dark mask with a light one-pixel halo, lit warm by the lantern.
    ctx.fillStyle = "#ffe9c2";
    for (const [px, py] of pixels) ctx.fillRect(left + px * s - s, top + py * s - s, s * 3, s * 3);
    ctx.fillStyle = "#101020";
    for (const [px, py] of pixels) ctx.fillRect(left + px * s, top + py * s, s, s);
  }

  function spawnEmbers(x: number, y: number, now: number, reduced: boolean) {
    if (reduced || now - lastEmber < 45) return;
    lastEmber = now;
    embers.push({ x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.6, life: 1 });
  }

  function drawEmbers(dt: number) {
    embers = embers.filter(ember => (ember.life -= dt / 1400) > 0);
    for (const ember of embers) {
      ember.x += ember.vx * dt / 16; ember.y += ember.vy * dt / 16;
      ctx.fillStyle = `rgba(255,${120 + Math.round(ember.life * 100)},60,${ember.life})`;
      ctx.fillRect(ember.x, ember.y, 3, 3);
    }
  }

  function drawDrifters(now: number, dt: number, reduced: boolean) {
    for (const drifter of drifters) {
      if (!reduced) { drifter.y -= drifter.speed * dt / 16; if (drifter.y < -30) drifter.y = 440; }
      drawLantern(drifter.x + (reduced ? 0 : Math.sin(now / 1200 + drifter.sway) * 8), drifter.y, drifter.size, drifter.paper, 0.8);
    }
  }

  function drawConstellation(now: number, inventory: readonly number[], reduced: boolean) {
    inventory.forEach((count, kind) => {
      SKY_SLOTS[kind].slice(0, Math.min(count, 40)).forEach(slot => {
        drawGift(kind, slot.x, slot.y, kind === 3 ? 8 : 5, reduced ? 0.85 : 0.65 + 0.3 * Math.sin(now / 700 + slot.phase));
      });
    });
  }

  let previous = 0;
  return {
    /** A launched lantern keeps drifting in the background for the rest of the session. */
    addDrifter(paper: string) {
      if (drifters.length >= 24) drifters.shift();
      drifters.push({ x: 60 + Math.random() * 840, y: 150 + Math.random() * 280, speed: 0.1 + Math.random() * 0.12, sway: Math.random() * 6, size: 0.3 + Math.random() * 0.25, paper });
    },
    draw(now: number, state: SceneState) {
      const dt = previous ? Math.min(64, now - previous) : 16; previous = now;
      ctx.setTransform(canvas.width / VIEW.width, 0, 0, canvas.height / VIEW.height, 0, 0);
      drawSky(now, state.reducedMotion);
      drawConstellation(now, state.inventory, state.reducedMotion);
      drawDrifters(now, dt, state.reducedMotion);
      drawLand();
      const elapsed = now - state.phaseStart;
      if (state.phase === "idle" || state.phase === "charging") {
        const light = state.phase === "charging" ? state.charge : 0;
        if (state.holding || state.phase === "charging") drawLantern(HELD.x, HELD.y, 1.3, state.paper, light);
      } else if (state.phase === "rising") {
        const progress = Math.min(1, elapsed / riseMs(state.reducedMotion));
        const at = lanternPath(progress);
        drawLantern(at.x, at.y, at.scale * 1.3, state.paper, 1);
        spawnEmbers(at.x, at.y + 20 * at.scale, now, state.reducedMotion);
        ctx.globalAlpha = Math.max(0, 1 - progress * 1.2); ctx.fillStyle = "#ffb070"; ctx.font = "bold 16px ui-monospace, monospace"; ctx.textAlign = "center";
        ctx.fillText("0.1 RF wick burned", at.x, at.y + 50 * at.scale + 14); ctx.globalAlpha = 1;
      } else if (state.phase === "descending" && state.outcome !== null) {
        const progress = ease(elapsed / descendMs(state.reducedMotion));
        const end = lanternPath(1);
        drawGift(state.outcome, end.x + (HELD.x - end.x) * progress, end.y + (HELD.y + 20 - end.y) * progress, 16, 1);
      } else if (state.phase === "reveal" && state.outcome !== null) {
        drawGift(state.outcome, HELD.x, HELD.y + 20, 18, 1);
      }
      drawEmbers(dt);
      drawFriend(now, state);
    },
  };
}
