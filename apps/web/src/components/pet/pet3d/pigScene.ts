import { PET_REACTION_MOTION, type PetReaction } from "@zoption/shared";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// PROTOTYPE: the Baby pig as a real 3D figure, built from rounded primitives with a soft clay
// material and lit like a studio product shot. The other species, stages, and health looks still
// draw the SVG figure (PetFigure.tsx) until this is approved and rolled out.

interface Palette {
  body: string;
  belly: string;
  snout: string;
  nostril: string;
}

const mix = (a: string, b: string, t: number) =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** The pig's palette from its (tinted) body color. */
export function pigPalette(body: string): Palette {
  return {
    body,
    belly: mix(body, "#FFFFFF", 0.45),
    snout: mix(body, "#FFFFFF", 0.22),
    nostril: mix(body, "#3A1020", 0.45),
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

/** Soft matte clay: no clearcoat shine, a velvety sheen at the edges, and a fine grain. */
function clay(color: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.82,
    roughnessMap: clayGrain(),
    bumpMap: clayGrain(),
    bumpScale: 0.12,
    metalness: 0,
    sheen: 0.7,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(mix(color, "#FFFFFF", 0.55)),
    ...extra,
  });
}

function blob(
  material: THREE.Material,
  scale: [number, number, number],
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  segments = 64,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, segments / 2), material);
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A soft round shadow texture for the floor under the pet. */
function contactShadow() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(60,30,45,0.55)");
  g.addColorStop(0.45, "rgba(60,30,45,0.25)");
  g.addColorStop(1, "rgba(60,30,45,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.3),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

function buildPig(o: Palette) {
  const root = new THREE.Group();
  const bodyMat = clay(o.body);
  const bellyMat = clay(o.belly, { roughness: 0.7 });
  const snoutMat = clay(o.snout, { roughness: 0.55 });

  // Body: a small soft bean sitting on the floor.
  const body = new THREE.Group();
  root.add(body);
  body.add(blob(bodyMat, [0.62, 0.5, 0.55], [0, 0.48, 0]));
  body.add(blob(bellyMat, [0.42, 0.34, 0.3], [0, 0.44, 0.3]));
  // Stubby front legs and back haunches, each on a joint at its top so it can swing and kick.
  const legs: THREE.Group[] = [];
  const haunches: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.26, 0.4, 0.3);
    leg.add(blob(bodyMat, [0.17, 0.24, 0.18], [0, -0.2, 0]));
    body.add(leg);
    legs.push(leg);
    const haunch = new THREE.Group();
    haunch.position.set(side * 0.4, 0.34, -0.05);
    haunch.add(blob(bodyMat, [0.22, 0.2, 0.26], [side * 0.06, -0.14, 0]));
    body.add(haunch);
    haunches.push(haunch);
  }

  // Head: big and round, most of the figure.
  const head = new THREE.Group();
  head.position.set(0, 1.28, 0.05);
  root.add(head);
  head.add(blob(bodyMat, [1.04, 0.86, 0.9], [0, 0, 0], [0, 0, 0], 96));

  // Snout: a flattened rounded disc on the front of the face, its nostrils riding along when it
  // twitches or squishes.
  const snout = new THREE.Group();
  snout.position.set(0, -0.2, 0.8);
  head.add(snout);
  snout.add(blob(snoutMat, [0.3, 0.22, 0.16], [0, 0, 0]));
  const nostrilMat = new THREE.MeshStandardMaterial({ color: o.nostril, roughness: 0.6 });
  for (const side of [-1, 1])
    snout.add(blob(nostrilMat, [0.05, 0.085, 0.04], [side * 0.1, 0, 0.135]));

  // Floppy ears that tip out and forward.
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.66, 0.56, 0.12);
    ear.rotation.set(0.75, 0, side * -1.05);
    const flap = blob(bodyMat, [0.26, 0.36, 0.09], [0, 0.22, 0]);
    ear.add(flap);
    head.add(ear);
    ears.push(ear);
  }

  // Eyes: glossy glass beads set wide.
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: "#24140c",
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
  });
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = blob(eyeMat, [0.17, 0.19, 0.1], [side * 0.4, 0.08, 0.75], [0, side * 0.42, 0]);
    eye.castShadow = false;
    // Catchlights: a big soft window reflection and a small glint, like a glass bead.
    const glint = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const big = blob(glint, [0.36, 0.3, 0.4], [-0.3, 0.34, 0.86], [0, 0, -0.5], 24);
    const small = blob(glint, [0.15, 0.13, 0.3], [0.34, -0.38, 0.84], [0, 0, 0], 16);
    big.castShadow = small.castShadow = false;
    eye.add(big, small);
    head.add(eye);
    eyes.push(eye);
  }

  // Blush: soft translucent discs on the cheeks.
  const blushMat = new THREE.MeshBasicMaterial({
    color: "#ff7f9b",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const cheek = blob(
      blushMat,
      [0.15, 0.08, 0.03],
      [side * 0.66, -0.14, 0.6],
      [0, side * 0.85, 0],
    );
    cheek.castShadow = false;
    head.add(cheek);
  }

  // Mouth: a small "w" smile that gives way to an open, happy mouth (with a tongue) on a tap.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.12, 0.02, -0.02),
    new THREE.Vector3(-0.06, -0.04, -0.01),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, -0.04, -0.01),
    new THREE.Vector3(0.12, 0.02, -0.02),
  ]);
  const smile = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 32, 0.012, 8, false),
    new THREE.MeshStandardMaterial({ color: "#3a1f25", roughness: 0.6 }),
  );
  smile.position.set(0, -0.46, 0.78);
  head.add(smile);
  const open = new THREE.Group();
  open.position.set(0, -0.5, 0.74);
  open.add(
    blob(
      new THREE.MeshStandardMaterial({ color: "#5a1f2b", roughness: 0.7 }),
      [0.1, 0.08, 0.06],
      [0, 0, 0],
      [0, 0, 0],
      32,
    ),
    blob(
      new THREE.MeshStandardMaterial({ color: "#f07c90", roughness: 0.6 }),
      [0.065, 0.04, 0.04],
      [0, -0.035, 0.03],
      [0, 0, 0],
      24,
    ),
  );
  open.scale.setScalar(0.001);
  head.add(open);

  return { root, body, head, ears, eyes, legs, haunches, snout, smile, open };
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;

  const camera = new THREE.PerspectiveCamera(26, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
  camera.position.set(0, 1.5, 7.2);
  camera.lookAt(0, 1.08, 0);

  // Studio lighting: a big soft key from the upper left, a cool fill, and a rim from behind.
  const key = new THREE.DirectionalLight("#fff6ee", 1.7);
  key.position.set(-1.2, 5, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 14;
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const fill = new THREE.DirectionalLight("#e8f0ff", 0.6);
  fill.position.set(3, 1.5, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight("#ffffff", 1.1);
  rim.position.set(0, 3, -4);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight("#ffffff", "#ffe2d2", 0.85));
  const bounce = new THREE.DirectionalLight("#ffe9de", 0.45);
  bounce.position.set(0, -1, 4);
  scene.add(bounce);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ opacity: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const shadow = contactShadow();
  scene.add(shadow);

  const pet = buildPig(pigPalette(body));
  scene.add(pet.root);

  // Springs for the parts that follow the body. Ears are loose and wobbly, legs a little firmer.
  const earSprings = [new Spring(140, 6), new Spring(140, 6)];
  const legSpring = new Spring(160, 12);
  const haunchSpring = new Spring(160, 12);
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
    pet.head.position.y = 1.28 + Math.sin((t / BREATH) * Math.PI * 2 - 0.5) * 0.012;
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
      ear.rotation.z = side * -(1.05 + droop) + Math.sin(t * 1.4 + i * 1.7) * 0.04;
      ear.rotation.x = 0.75 + droop * 0.4;
    });

    // Legs swing forward and the haunches splay while airborne, with a paddle during a dance.
    const tuck = legSpring.step(lift * 1.4, dt);
    const splay = haunchSpring.step(lift * 1.1, dt);
    const paddle = reaction?.kind === "combo" ? Math.sin(t * 22) * 0.25 * Math.min(lift * 4, 1) : 0;
    pet.legs.forEach((leg, i) => {
      leg.rotation.x = -tuck + (i === 0 ? paddle : -paddle) + Math.sin(t * 0.8 + i) * 0.02;
    });
    pet.haunches.forEach((haunch, i) => {
      haunch.rotation.z = (i === 0 ? -1 : 1) * splay * 0.6;
    });

    // The snout squishes on landing and twitches on its own every few seconds.
    if (t > twitchAt + 0.45) twitchAt = t + 2.5 + Math.random() * 4;
    const twitching = t > twitchAt ? Math.sin(((t - twitchAt) / 0.45) * Math.PI * 4) : 0;
    const squish = snoutSpring.step(-rise * 0.03, dt);
    pet.snout.scale.set(1 - squish * 0.5 + twitching * 0.04, 1 + squish - twitching * 0.05, 1);
    pet.snout.position.y = -0.2 + twitching * 0.012;
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
    const eyeOpen = blinking ? 0.02 : 0.19 * (1 - joy * 0.75);
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
    renderer.dispose();
  };
  if (still) {
    pose(0);
    renderer.render(scene, camera);
    return { react: () => {}, dispose };
  }
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    pose(clock.getElapsedTime());
    renderer.render(scene, camera);
  });
  return {
    react(kind) {
      reaction = { kind, start: clock.getElapsedTime() };
    },
    dispose,
  };
}
