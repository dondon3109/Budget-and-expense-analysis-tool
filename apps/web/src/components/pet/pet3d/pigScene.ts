import { PET_REACTION_MOTION, type PetReaction } from "@zoption/shared";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

// PROTOTYPE: the Baby pig as a real 3D figure, modeled on a soft clay toy: a big round head on a
// chubby pear-shaped sitting body, ears that fold forward at the tips, little arms resting on the
// belly with slit hoof tips, stubby legs stretched forward showing round slit hoof soles,
// wide-set dark eyes with one highlight, a small oval snout, a thin smile, and soft blush, all in
// matte peach clay lit like a white studio product shot. The other species, stages, and health
// looks still draw the SVG figure (PetFigure.tsx) until this is approved and rolled out.

interface Palette {
  body: string;
  snout: string;
  nostril: string;
  hoof: string;
  blush: string;
}

const mix = (a: string, b: string, t: number) =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** The pig's original peach clay, before a pet color tints it. */
export const PIG_BODY = "#F4A08E";

/**
 * The pig's palette from its (tinted) body color. Each part keeps the same relation to the body as
 * on the reference clay figure: a deeper coral snout and blush, darker nostrils, and brown-maroon
 * hooves, so a tinted pig stays consistent.
 */
export function pigPalette(body: string): Palette {
  return {
    body,
    snout: mix(body, "#D4544A", 0.7),
    nostril: mix(body, "#9A3328", 0.6),
    hoof: mix(body, "#7E2E22", 0.72),
    blush: mix(body, "#D24A42", 0.6),
  };
}

/**
 * A fine, soft grain shared by every clay part: blurred noise used as a bump and roughness map, so
 * light breaks up across the surface like a soft-touch vinyl toy instead of sliding off plastic.
 */
let grain: THREE.CanvasTexture | null = null;
function clayGrain() {
  if (grain) return grain;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 118 + Math.random() * 20;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // Soften the speckle into a gentle grain.
  ctx.filter = "blur(1.2px)";
  ctx.drawImage(canvas, 0, 0);
  grain = new THREE.CanvasTexture(canvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(3, 2);
  return grain;
}

/**
 * Soft matte clay, like fondant: no shine, a barely-there grain, and a warm sheen at the edges
 * that stands in for light glowing through the surface.
 */
function clay(color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.9,
    roughnessMap: clayGrain(),
    bumpMap: clayGrain(),
    bumpScale: 0.03,
    metalness: 0,
    sheen: 0.25,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(mix(color, "#FFD2C2", 0.3)),
    ...extra,
  });
}

/** A soft round shadow texture for the floor under the pet. */
function contactShadow() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(70,50,48,0.5)");
  g.addColorStop(0.45, "rgba(70,50,48,0.22)");
  g.addColorStop(1, "rgba(70,50,48,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  // Read as sRGB; as linear data the dark shadow brightens into a pink haze on the white card.
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.1, 1.5),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

/** Marks a mesh to cast and receive the soft studio shadow. */
function shaded<T extends THREE.Mesh>(mesh: T) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A rounded limb from `from` to `to`: a group pivoting at `from` (so it can swing) holding a capsule
 * along the limb. `end` is the limb's tip in the group's own space, for its hoof.
 */
function limb(material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  const pivot = new THREE.Group();
  pivot.position.copy(from);
  const aim = new THREE.Group();
  const direction = to.clone().sub(from);
  const length = direction.length();
  aim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  pivot.add(aim);
  const capsule = shaded(
    new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.01), 12, 32),
      material,
    ),
  );
  capsule.position.y = length / 2;
  aim.add(capsule);
  return { pivot, aim, length };
}

/** A soft blush: a disc whose color fades out to its edge. */
function blushDisc(color: string) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.55, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.MeshBasicMaterial({
    color,
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
  });
}

/** A rounded triangle, extruded with a soft bevel, for an ear's two halves. */
function earPiece(material: THREE.Material, width: number, height: number, taper: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.quadraticCurveTo(-width * taper, height * 0.75, 0, height);
  shape.quadraticCurveTo(width * taper, height * 0.75, width / 2, 0);
  shape.quadraticCurveTo(0, -height * 0.06, -width / 2, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 6,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -0.015);
  return shaded(new THREE.Mesh(geometry, material));
}

/**
 * The layer for flat see-through planes (blush, floor, contact shadow). Only the color pass draws
 * them; the occlusion pass would read their flat edges as creases and outline them.
 */
const DECALS = 1;

/** The color pass: the scene with its decal planes, which the occlusion pass leaves out. */
class ColorPass extends RenderPass {
  override render(...args: Parameters<RenderPass["render"]>) {
    this.camera.layers.enable(DECALS);
    super.render(...args);
    this.camera.layers.disable(DECALS);
  }
}

/**
 * A hoof cap over the round end of a limb of `limbRadius`: a dark, gently domed disc (a lathe, so it
 * shades smoothly) with a slit cut in from its rim, which reads as a pig's cloven hoof. `slit` is
 * how far the cut reaches toward the center (1 reaches it). The slit turns to face `toward` (a
 * world direction), so it shows on the visible side of each limb.
 */
function hoofCap(
  material: THREE.Material,
  slitMaterial: THREE.Material,
  aim: THREE.Object3D,
  limbRadius: number,
  slit: number,
  toward: THREE.Vector3,
) {
  // The cap's back sits where the limb's rounded end is still 89% of its full width, inset a little so
  // a rim of the limb shows around it; its front follows that rounded end, a little flatter, as a
  // sole is, and just proud of it.
  const back = 0.45 * limbRadius;
  const radius = Math.sqrt(limbRadius ** 2 - back ** 2) * 0.92;
  const rim = limbRadius * 0.1;
  const height = (rho: number) =>
    rim + Math.max(Math.sqrt(Math.max(limbRadius ** 2 - rho ** 2, 0)) - back, 0) * 0.85;
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(radius * 0.97, 0)];
  for (let i = 0; i <= 6; i += 1) {
    const a = (i / 6) * (Math.PI / 2);
    profile.push(
      new THREE.Vector2(
        radius - rim + Math.cos(a - Math.PI / 2) * rim,
        rim + Math.sin(a - Math.PI / 2) * rim,
      ),
    );
  }
  for (let i = 1; i <= 16; i += 1) {
    const rho = (radius - rim) * (1 - i / 16);
    profile.push(new THREE.Vector2(rho, height(rho)));
  }
  const cap = new THREE.Group();
  cap.add(shaded(new THREE.Mesh(new THREE.LatheGeometry(profile, 64), material)));

  // The slit: a fine dark groove laid into the dome from the rim, along the cap's -z.
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const rho = (radius - rim * 0.4) * (1 - (slit * i) / 8);
    points.push(new THREE.Vector3(0, height(rho) - limbRadius * 0.01, -rho));
  }
  const groove = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, limbRadius * 0.045, 8, false),
    slitMaterial,
  );
  cap.add(groove);

  const local = toward.clone().applyQuaternion(aim.quaternion.clone().invert());
  cap.rotation.y = Math.atan2(-local.x, -local.z);
  return { cap, back };
}

// Where the head sits; the idle breath bobs it around this height.
const HEAD_Y = 1.74;

function buildPig(o: Palette) {
  const root = new THREE.Group();
  const bodyMat = clay(o.body);
  const snoutMat = clay(o.snout, { roughness: 0.85 });
  const hoofMat = clay(o.hoof, { roughness: 0.8, sheen: 0.3 });
  const slitMat = clay(mix(o.hoof, "#2A0E08", 0.5), { roughness: 0.9 });

  // Body: one smooth pear, wide at the seat and narrowing up to the neck.
  const body = new THREE.Group();
  root.add(body);
  const profile = new THREE.SplineCurve(
    [
      [0, 0.04],
      [0.6, 0.06],
      [0.88, 0.24],
      [0.96, 0.5],
      [0.9, 0.8],
      [0.74, 1.06],
      [0.5, 1.24],
      [0, 1.32],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
  ).getPoints(40);
  const torso = shaded(new THREE.Mesh(new THREE.LatheGeometry(profile, 72), bodyMat));
  torso.scale.z = 0.94;
  body.add(torso);

  // Little arms resting on the belly, each ending in a slit hoof cap.
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = limb(
      bodyMat,
      new THREE.Vector3(side * 0.62, 1.0, 0.36),
      new THREE.Vector3(side * 0.3, 0.64, 0.8),
      0.15,
    );
    const hoof = hoofCap(hoofMat, slitMat, arm.aim, 0.15, 1, new THREE.Vector3(0, 0.4, 1));
    hoof.cap.position.y = arm.length - hoof.back;
    arm.aim.add(hoof.cap);
    body.add(arm.pivot);
    arms.push(arm.pivot);
  }

  // Stubby legs stretched forward, showing round hoof soles to the front.
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = limb(
      bodyMat,
      new THREE.Vector3(side * 0.46, 0.3, 0.26),
      new THREE.Vector3(side * 0.68, 0.27, 0.9),
      0.26,
    );
    const sole = hoofCap(hoofMat, slitMat, leg.aim, 0.26, 0.3, new THREE.Vector3(0, 1, 0));
    sole.cap.position.y = leg.length - sole.back;
    leg.aim.add(sole.cap);
    body.add(leg.pivot);
    legs.push(leg.pivot);
  }

  // Head: wide and round, a little flatter than tall, sitting on the body.
  const head = new THREE.Group();
  head.position.set(0, HEAD_Y, 0.04);
  root.add(head);
  const skull = shaded(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), bodyMat));
  skull.scale.set(1.12, 0.86, 0.96);
  head.add(skull);

  // Ears: an upright base on the top corners whose tip folds forward and down.
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.74, 0.56, 0.06);
    const base = new THREE.Group();
    base.rotation.set(0.75, 0, side * -0.55);
    base.add(earPiece(bodyMat, 0.56, 0.3, 0.42));
    const fold = new THREE.Group();
    fold.position.y = 0.26;
    fold.rotation.x = 1.0;
    fold.add(earPiece(bodyMat, 0.4, 0.28, 0.2));
    base.add(fold);
    ear.add(base);
    head.add(ear);
    ears.push(ear);
  }

  // Snout: a small oval a shade deeper than the face, its oval nostrils riding along.
  const snout = new THREE.Group();
  snout.position.set(0, -0.24, 0.9);
  head.add(snout);
  const disc = shaded(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), snoutMat));
  disc.scale.set(0.35, 0.235, 0.17);
  snout.add(disc);
  const nostrilMat = new THREE.MeshStandardMaterial({ color: o.nostril, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), nostrilMat);
    nostril.scale.set(0.05, 0.082, 0.03);
    nostril.position.set(side * 0.115, 0, 0.155);
    snout.add(nostril);
  }

  // Eyes: dark glossy beads, wide-set and low, each with one bright highlight.
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: "#1B110F",
    roughness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const highlight = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), eyeMat);
    eye.scale.set(0.16, 0.17, 0.085);
    eye.position.set(side * 0.43, -0.06, 0.86);
    eye.rotation.y = side * 0.45;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), highlight);
    spark.scale.set(0.3, 0.3, 0.3);
    spark.position.set(0.34, 0.36, 0.86);
    eye.add(spark);
    head.add(eye);
    eyes.push(eye);
  }

  // Blush: big soft discs on the cheeks.
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.36), blushDisc(o.blush));
    cheek.position.set(side * 0.7, -0.36, 0.62);
    cheek.rotation.y = side * 0.85;
    cheek.layers.set(DECALS);
    head.add(cheek);
  }

  // Mouth: a thin U smile that gives way to an open, happy mouth (with a tongue) on a tap.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.09, 0.02, -0.02),
    new THREE.Vector3(-0.045, -0.025, 0),
    new THREE.Vector3(0, -0.035, 0.005),
    new THREE.Vector3(0.045, -0.025, 0),
    new THREE.Vector3(0.09, 0.02, -0.02),
  ]);
  const smile = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 32, 0.011, 8, false),
    new THREE.MeshStandardMaterial({ color: "#6B2F2C", roughness: 0.7 }),
  );
  smile.position.set(0, -0.52, 0.76);
  head.add(smile);
  const open = new THREE.Group();
  open.position.set(0, -0.54, 0.73);
  const throat = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshStandardMaterial({ color: "#5a1f2b", roughness: 0.7 }),
  );
  throat.scale.set(0.09, 0.07, 0.05);
  const tongue = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.MeshStandardMaterial({ color: "#f07c90", roughness: 0.6 }),
  );
  tongue.scale.set(0.06, 0.035, 0.035);
  tongue.position.set(0, -0.03, 0.025);
  open.add(throat, tongue);
  open.scale.setScalar(0.001);
  head.add(open);

  return { root, body, head, ears, eyes, arms, legs, snout, smile, open };
}

/** A running pig scene: `react` plays a tap's reaction, `dispose` frees the GPU resources. */
export interface PigScene {
  react(reaction: PetReaction): void;
  dispose(): void;
}

/**
 * A damped spring chasing a moving target. Parts on springs (ears, legs, snout, head) follow the
 * body a beat late and settle with a small wobble, which is what makes the motion read as alive
 * rather than a rigid toy being moved.
 */
class Spring {
  value = 0;
  velocity = 0;
  constructor(
    private stiffness: number,
    private damping: number,
  ) {}
  step(target: number, dt: number) {
    this.velocity += (this.stiffness * (target - this.value) - this.damping * this.velocity) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

/** A reaction's keyed value at progress `p`, eased between keys so the motion has no corners. */
function keyed(at: number[], values: number[], p: number) {
  for (let i = 1; i < at.length; i += 1) {
    if (p > at[i]!) continue;
    const q = (p - at[i - 1]!) / (at[i]! - at[i - 1]! || 1);
    const eased = q * q * (3 - 2 * q);
    return values[i - 1]! + (values[i]! - values[i - 1]!) * eased;
  }
  return values[values.length - 1]!;
}

// A reaction's hop is a fraction of the figure's height, as in the SVG figure's CSS.
const FIGURE_HEIGHT = 2.6;

/**
 * Renders the pig into `canvas` and animates it unless `still`: an idle life (breathing, a head
 * that wanders, ears that sway and now and then flick, a nose that twitches, a blink), and each
 * tap's reaction played inside the scene so the whole body follows through.
 */
export function mountPigScene(
  canvas: HTMLCanvasElement,
  { body, still }: { body: string; still: boolean },
): PigScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  // Neutral tone mapping keeps the clay's peach hue; ACES drains its saturation toward grey.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.4;

  const camera = new THREE.PerspectiveCamera(26, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
  camera.position.set(0, 1.55, 6.9);
  camera.lookAt(0, 1.3, 0);

  // White studio lighting: a strong key from the upper left and only a little fill, so the clay
  // shades from light to dark across its curves and reads as round, plus a rim behind.
  const key = new THREE.DirectionalLight("#fff6ee", 2.4);
  key.position.set(-2.2, 4.6, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 8;
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#fff4f0", 0.35);
  fill.position.set(3, 1.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight("#ffffff", 1.1);
  rim.position.set(0, 3, -4);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight("#fff3ee", "#f2b5a5", 0.35));
  const bounce = new THREE.DirectionalLight("#ffe9de", 0.25);
  bounce.position.set(0, -1, 4);
  scene.add(bounce);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ opacity: 0.035 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.layers.set(DECALS);
  scene.add(floor);
  const shadow = contactShadow();
  shadow.layers.set(DECALS);
  scene.add(shadow);

  const pet = buildPig(pigPalette(body));
  scene.add(pet.root);

  // Ambient occlusion darkens the creases (under the chin, where the arms and legs meet the body,
  // inside the ears) the way a real toy shades where light can't reach, which is most of what makes
  // the clay read as solid. The passes keep the canvas's transparent background.
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);
  composer.addPass(new ColorPass(scene, camera));
  const occlusion = new GTAOPass(scene, camera, width, height);
  occlusion.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 2 });
  occlusion.blendIntensity = 1;
  composer.addPass(occlusion);
  composer.addPass(new OutputPass());

  // Springs for the parts that follow the body. Ears are loose and wobbly, legs a little firmer.
  const earSprings = [new Spring(140, 6), new Spring(140, 6)];
  const legSpring = new Spring(160, 12);
  const armSpring = new Spring(160, 12);
  const snoutSpring = new Spring(260, 9);
  const nodSpring = new Spring(90, 9);

  const BREATH = 3.6;
  const BLINK = 3.4;
  let reaction: { kind: PetReaction; start: number } | null = null;
  let lastLift = 0;
  let lastTime = 0;
  // Idle moments, each scheduled a few seconds apart so the pet never loops like a machine.
  let twitchAt = 1.5;
  let flickAt = 3;

  function pose(t: number) {
    const dt = Math.min(Math.max(t - lastTime, 0), 1 / 30);
    lastTime = t;

    // A tap's reaction: the hop, tilt, and squash keys the SVG figure uses, plus a joy curve that
    // opens the mouth and squints the eyes for a happy one.
    let lift = 0;
    let tilt = 0;
    let squash = 0;
    let joy = 0;
    if (reaction) {
      const motion = PET_REACTION_MOTION[reaction.kind];
      const p = (t - reaction.start) / (motion.ms / 1000);
      if (p >= 1) reaction = null;
      else {
        lift = -keyed(motion.at, motion.hop, p) * FIGURE_HEIGHT;
        tilt = (keyed(motion.at, motion.tilt, p) * Math.PI) / 180;
        squash = keyed(motion.at, motion.squash, p);
        if (reaction.kind === "happy" || reaction.kind === "combo") joy = Math.sin(Math.PI * p);
      }
    }
    const rise = dt > 0 ? (lift - lastLift) / dt : 0;
    lastLift = lift;

    const breath = Math.sin((t / BREATH) * Math.PI * 2);
    pet.root.position.y = lift;
    pet.root.rotation.z = tilt;
    const sy = 1 + squash;
    pet.root.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    pet.body.scale.set(1 + breath * 0.012, 1 + breath * 0.02, 1 + breath * 0.012);

    // The head rides a touch behind the breath, wanders slowly, and nods as the body moves.
    const nod = nodSpring.step(-rise * 0.05, dt);
    pet.head.position.y = HEAD_Y + Math.sin((t / BREATH) * Math.PI * 2 - 0.5) * 0.012;
    pet.head.rotation.x = Math.sin(t * 0.5) * 0.03 + nod;
    pet.head.rotation.z = Math.sin(t * 0.7) * 0.05 + Math.sin(t * 0.23) * 0.03;
    pet.head.rotation.y = Math.sin(t * 0.31) * 0.08;

    // Ears trail the body: rising swings them down, falling flicks them up, then they wobble.
    if (t > flickAt) {
      const ear = earSprings[Math.random() < 0.5 ? 0 : 1]!;
      ear.velocity -= 3.5;
      flickAt = t + 4 + Math.random() * 5;
    }
    pet.ears.forEach((ear, i) => {
      const side = i === 0 ? -1 : 1;
      const droop = earSprings[i]!.step(rise * 0.09, dt);
      ear.rotation.z = side * -droop * 0.8 + Math.sin(t * 1.4 + i * 1.7) * 0.04;
      ear.rotation.x = droop * 0.5;
    });

    // Legs lift while airborne and paddle during a dance.
    const tuck = legSpring.step(lift * 1.4, dt);
    const flap = armSpring.step(lift * 1.2, dt);
    const paddle = reaction?.kind === "combo" ? Math.sin(t * 22) * 0.25 * Math.min(lift * 4, 1) : 0;
    pet.legs.forEach((leg, i) => {
      leg.rotation.x = -tuck + (i === 0 ? paddle : -paddle) + Math.sin(t * 0.8 + i) * 0.02;
    });
    // Arms lift off the belly while airborne and wave during a dance.
    pet.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      arm.rotation.z = side * flap * 0.7 + side * Math.abs(paddle) * 0.6;
      arm.rotation.x = Math.sin(t * 0.9 + i * 2) * 0.03;
    });

    // The snout squishes on landing and twitches on its own every few seconds.
    if (t > twitchAt + 0.45) twitchAt = t + 2.5 + Math.random() * 4;
    const twitching = t > twitchAt ? Math.sin(((t - twitchAt) / 0.45) * Math.PI * 4) : 0;
    const squish = snoutSpring.step(-rise * 0.03, dt);
    pet.snout.scale.set(1 - squish * 0.5 + twitching * 0.04, 1 + squish - twitching * 0.05, 1);
    pet.snout.position.y = -0.24 + twitching * 0.012;
    pet.snout.rotation.z = twitching * 0.05;

    // The mouth opens into a happy smile with the joy curve.
    const openness = Math.max(joy, 0);
    pet.open.scale.set(openness, openness, openness || 0.001);
    pet.smile.scale.setScalar(1 - openness * 0.9);

    // The shadow shrinks while the pet is up.
    const s = 1 - lift * 0.9;
    shadow.scale.set(s, s, s);
    shadow.material.opacity = 0.5 + 0.5 * s;

    // Eyes squint shut with joy; otherwise a quick blink every few seconds.
    const blinking = t % BLINK > BLINK - 0.14;
    const eyeOpen = blinking ? 0.02 : 0.16 * (1 - joy * 0.75);
    for (const eye of pet.eyes) eye.scale.y = eyeOpen;
  }

  const dispose = () => {
    renderer.setAnimationLoop(null);
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
        material.dispose();
      }
    });
    grain?.dispose();
    grain = null;
    scene.environment?.dispose();
    pmrem.dispose();
    occlusion.dispose();
    composer.dispose();
    renderer.dispose();
  };
  if (still) {
    pose(0);
    composer.render();
    return { react: () => {}, dispose };
  }
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    pose(clock.getElapsedTime());
    composer.render();
  });
  return {
    react(kind) {
      reaction = { kind, start: clock.getElapsedTime() };
    },
    dispose,
  };
}
