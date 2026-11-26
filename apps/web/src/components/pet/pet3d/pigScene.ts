import { PET_REACTION_MOTION, type PetReaction } from "@zoption/shared";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

import { onSurface, PIG_BONES, PIG_FACE, pigMesh } from "./pigShape";

// PROTOTYPE: the Baby pig as a real 3D figure, modeled on a soft clay toy (the shape is in
// pigShape.ts): one seamless, smoothly blended body in matte pastel peach with a soft velvet sheen,
// a deeper snout with deep nostrils, rose-brown split hooves and round soles, wide-set glossy brown
// eyes with one highlight, a thin smile, and soft blush, lit like a bright white studio product
// shot. The other species, stages, and health looks still draw the SVG figure (PetFigure.tsx)
// until this is approved and rolled out.

interface Palette {
  body: string;
  snout: string;
  nostril: string;
  hoof: string;
  blush: string;
}

const mix = (a: string, b: string, t: number) =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** The pig's original pastel peach, before a pet color tints it. */
export const PIG_BODY = "#EEBDAE";

/**
 * The pig's palette from its (tinted) body color. Each part keeps the same relation to the body as
 * on the reference clay toy: a slightly deeper snout, deep rose nostrils and blush, and rose-brown
 * hooves, so a tinted pig stays consistent.
 */
export function pigPalette(body: string): Palette {
  return {
    body,
    snout: mix(body, "#EE7C68", 0.7),
    nostril: mix(body, "#A3302A", 0.85),
    hoof: mix(body, "#8A3326", 0.9),
    blush: mix(body, "#E8685A", 0.75),
  };
}

/**
 * Per-vertex colors from the mesh's regions (snout, nostril, blush) in this palette. The hooves
 * are painted by the material (softSkin), which keeps their edges sharp.
 */
function pigColors(regions: Float32Array, o: Palette) {
  const body = new THREE.Color(o.body);
  const snout = new THREE.Color(o.snout);
  const nostril = new THREE.Color(o.nostril);
  const blush = new THREE.Color(o.blush);
  const colors = new Float32Array(regions.length);
  const c = new THREE.Color();
  for (let v = 0; v < regions.length / 3; v += 1) {
    c.copy(body)
      .lerp(blush, regions[v * 3 + 2]! * 0.85)
      .lerp(snout, regions[v * 3]!)
      .lerp(nostril, regions[v * 3 + 1]!);
    colors.set([c.r, c.g, c.b], v * 3);
  }
  return colors;
}

/**
 * Soft matte clay with a velvet sheen, like a flocked vinyl toy: light rolls off its edges in a
 * pale glow instead of a shine, and some of the surface color is added back everywhere, as light
 * scattering inside soft material would. The squared term adds back more of the color's own hue
 * than of its lightness, so the shadows stay a warm, saturated pink and never go grey.
 */
function softSkin(o: Palette) {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0,
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(mix(o.body, "#FFF4EE", 0.6)),
  });
  material.onBeforeCompile = (shader) => {
    // The hoof caps and soles: the hoof color cut at the hoof field's 0.5 level, antialiased over
    // one pixel, so the edge is as crisp as the eyes' however coarse the mesh is there. The toes'
    // split line lets 35% of the body color back through.
    shader.uniforms.hoofColor = { value: new THREE.Color(o.hoof) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 hoof;\nvarying vec2 vHoof;")
      .replace("#include <color_vertex>", "#include <color_vertex>\n\tvHoof = hoof;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 hoofColor;\nvarying vec2 vHoof;",
      )
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n\tfloat hoofEdge = fwidth( vHoof.x ) * 0.75;\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, hoofColor, smoothstep( 0.5 - hoofEdge, 0.5 + hoofEdge, vHoof.x ) * ( 1.0 - 0.35 * vHoof.y ) );",
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.08 + diffuseColor.rgb * diffuseColor.rgb * 0.62;",
    );
    // Wrapped light: each light reaches a little past the side facing it and fades out flat, the
    // way it scatters into soft material, so its edge never draws a hard line across a curve.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
        "float lit = saturate( ( dot( geometryNormal, directLight.direction ) + 0.12 ) / 1.12 );\n\tfloat dotNL = lit * lit;",
      ),
    );
  };
  return material;
}

/** A soft round shadow texture for the floor under the pet. */
function contactShadow() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(90,60,56,0.42)");
  g.addColorStop(0.45, "rgba(90,60,56,0.18)");
  g.addColorStop(1, "rgba(90,60,56,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  // Read as sRGB; as linear data the dark shadow brightens into a pink haze on the white card.
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.9),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.002, 0.25);
  return mesh;
}

/**
 * The layer for flat see-through planes (floor, contact shadow). Only the color pass draws them;
 * the occlusion pass would read their flat edges as creases and outline them.
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

/** Orients `object` so its +z faces along `normal`. */
function facing(object: THREE.Object3D, normal: readonly [number, number, number]) {
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(...normal).normalize(),
  );
}

/**
 * An eye: a glossy dark-brown bead with a lighter brown rim, set into the face along its surface
 * normal, with one bright highlight to the upper right. Its group scales on y to blink.
 */
function eye(side: number, head: THREE.Object3D, headAt: THREE.Vector3) {
  const { point, normal } = onSurface(side * PIG_FACE.eye.x, PIG_FACE.eye.y);
  const group = new THREE.Group();
  group.position.set(point[0], point[1], point[2]).sub(headAt);
  group.position.addScaledVector(new THREE.Vector3(...normal), -0.03);
  facing(group, normal);
  const glossy = (color: string) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
  const iris = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), glossy("#4B2418"));
  iris.scale.set(0.2, 0.21, 0.075);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), glossy("#140907"));
  pupil.scale.set(0.176, 0.186, 0.073);
  pupil.position.z = 0.008;
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 10),
    new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  );
  spark.scale.set(0.05, 0.054, 0.02);
  spark.position.set(0.06, 0.068, 0.075);
  group.add(iris, pupil, spark);
  head.add(group);
  return group;
}

/** The mouth: a thin U smile that gives way to an open, happy mouth (with a tongue) on a tap. */
function mouth(head: THREE.Object3D, headAt: THREE.Vector3) {
  const { y, halfWidth } = PIG_FACE.smile;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const x = -halfWidth + (2 * halfWidth * i) / 8;
    const u = x / halfWidth;
    const { point, normal } = onSurface(x, y - 0.034 * (1 - u * u));
    points.push(
      new THREE.Vector3(...point).addScaledVector(new THREE.Vector3(...normal), 0.004).sub(headAt),
    );
  }
  const smile = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.012, 8, false),
    new THREE.MeshStandardMaterial({ color: "#6E3029", roughness: 0.7 }),
  );
  head.add(smile);

  const { point, normal } = onSurface(0, y - 0.03);
  const open = new THREE.Group();
  open.position.set(point[0], point[1], point[2]).sub(headAt);
  facing(open, normal);
  const throat = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshStandardMaterial({ color: "#5a1f2b", roughness: 0.7 }),
  );
  throat.scale.set(0.09, 0.07, 0.04);
  const tongue = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.MeshStandardMaterial({ color: "#f07c90", roughness: 0.6 }),
  );
  tongue.scale.set(0.06, 0.035, 0.03);
  tongue.position.set(0, -0.03, 0.02);
  open.add(throat, tongue);
  open.scale.setScalar(0.001);
  head.add(open);
  return { smile, open };
}

function bone(name: string, bones: THREE.Bone[]) {
  return bones[PIG_BONES.findIndex((b) => b.name === name)]!;
}

function buildPig(o: Palette) {
  const root = new THREE.Group();
  const shape = pigMesh();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(shape.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(shape.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(pigColors(shape.regions, o), 3));
  geometry.setAttribute("hoof", new THREE.BufferAttribute(shape.hoofs, 2));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(shape.skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.BufferAttribute(shape.skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));

  // The rig: every bone at its pivot, so turning one swings its part around the joint.
  const bones = PIG_BONES.map(() => new THREE.Bone());
  PIG_BONES.forEach(({ at, parent }, i) => {
    const from = PIG_BONES[parent]?.at ?? [0, 0, 0];
    bones[i]!.position.set(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
    if (parent >= 0) bones[parent]!.add(bones[i]!);
  });
  const skin = new THREE.SkinnedMesh(geometry, softSkin(o));
  // It casts the floor shadow but takes none itself: a shadow map speckles a curved surface, and
  // the ambient occlusion pass already darkens the creases more softly.
  skin.castShadow = true;
  // The hop and the dance carry the pig past its rest bounds; never cull it.
  skin.frustumCulled = false;
  skin.add(bones[0]!);
  skin.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton(bones));
  root.add(skin);

  const head = bone("head", bones);
  const headAt = new THREE.Vector3(...PIG_BONES[2]!.at);
  const eyes = [eye(-1, head, headAt), eye(1, head, headAt)];
  const { smile, open } = mouth(head, headAt);

  return {
    root,
    body: bone("body", bones),
    head,
    ears: [bone("earL", bones), bone("earR", bones)],
    snout: bone("snout", bones),
    arms: [bone("armL", bones), bone("armR", bones)],
    legs: [bone("legL", bones), bone("legR", bones)],
    eyes,
    smile,
    open,
  };
}

// Where the head and snout bones rest; the idle breath and twitch move them around these.
const HEAD_Y = PIG_BONES[2]!.at[1];
const SNOUT_Y = PIG_BONES[5]!.at[1] - HEAD_Y;

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
const FIGURE_HEIGHT = 3;

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
  scene.environmentIntensity = 0.15;

  // Framed with headroom above the ears for the hop and the dance.
  const camera = new THREE.PerspectiveCamera(25, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
  camera.position.set(0, 2.0, 9.4);
  camera.lookAt(0, 1.66, 0.2);

  // Bright white studio lighting like a product shot: a strong key low from the right that leaves
  // the left side in warm shade, a rim behind, a glow along the right edge, and a little bounce
  // from the floor. There is no fill: the material's scattered
  // light (softSkin) keeps the shaded side pastel instead.
  const key = new THREE.DirectionalLight("#ffffff", 5.2);
  key.position.set(10, 3.5, 2.5);
  scene.add(key);
  // The floor shadow comes from a faint light high above instead, so it stays a short soft pool
  // inside the frame: from the low key it would stretch past the canvas edge and end in a line.
  const caster = new THREE.DirectionalLight("#ffffff", 0.01);
  caster.position.set(1.6, 6, 2.4);
  caster.castShadow = true;
  caster.shadow.mapSize.set(1024, 1024);
  caster.shadow.radius = 10;
  caster.shadow.camera.left = -3;
  caster.shadow.camera.right = 2;
  caster.shadow.camera.top = 3.4;
  caster.shadow.camera.bottom = -1;
  caster.shadow.bias = -0.0005;
  caster.shadow.normalBias = 0.05;
  scene.add(caster);
  const rim = new THREE.DirectionalLight("#ffffff", 0.9);
  rim.position.set(0, 3, -4);
  scene.add(rim);
  // The edge glow sits far enough behind that it only rims the right side: from the side it would
  // shine through the body (nothing casts shadows on the figure) onto the inside of the left arm.
  const edge = new THREE.DirectionalLight("#fff8f4", 3);
  edge.position.set(3, 1.5, -3);
  scene.add(edge);
  const bounce = new THREE.DirectionalLight("#ffece4", 0.8);
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
  occlusion.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1, thickness: 1, scale: 2 });
  // A tight denoise keeps each crease shadow a crisp line instead of a smudge.
  occlusion.updatePdMaterial({ radius: 4 });
  // Above 1 the blend pushes the deepest creases (under the ears) negative, which tone mapping
  // turns grey-blue.
  occlusion.blendIntensity = 0.75;
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
    pet.snout.position.y = SNOUT_Y + twitching * 0.012;
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
    const eyeOpen = blinking ? 0.12 : 1 - joy * 0.75;
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
