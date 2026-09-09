// ===============================
//  TERRARIUM CONFIG
// ===============================

const TERRARIUM_CONFIG = {

    // -----------------------------
    // CAMERA SETTINGS
    // -----------------------------
    // The original had three more layers here (an intro fly-in, a spacebar-triggered "space
    // sequence" with its own sub-phases, drag/zoom controls) — all removed for this embedded About
    // page (kanji-terrarium's own apps/web/CLAUDE.md, "About overlay"): no interaction beyond page
    // scroll, so there's exactly one camera position, applied once at creation, never animated
    // toward or dragged away from. These alpha/beta/radius values ARE the original's own
    // `space_verticalView` — the framing the space sequence used to settle on once it finished —
    // just reached directly now instead of animated into.
    camera: {
      alpha: Math.PI / 2,
      beta: Math.PI / 2.1,
      radius: 19,
      target: new BABYLON.Vector3(0, 2, 0),
    },
  
    // -----------------------------
    // LIGHTING SETTINGS
    // -----------------------------
    lights: {
      hemiIntensity: 0.85,
      hemiGroundColor: new BABYLON.Color3(0.02, 0.05, 0.03),
  
      top: {
        intensity: 1.4,
        angle: Math.PI / 3,
        exponent: 1.5,
        range: 40,
      },
  
      rim: {
        intensity: 0.5,
      },
    },
  
    // -----------------------------
    // TERRARIUM SHELL (glass dome)
    // -----------------------------
    shell: {
      height: 12,
      diameter: 4.4,
      segments: 64,
      frontGlassRadius: 2.2,
    },
  
    // -----------------------------
    // BASE (wood / platform) – unused (no base mesh)
    // -----------------------------
    base: {
      radius: 2.3,
      height: 0.2,
    },
  
    // -----------------------------
    // GROUND (dirt mound) – currently unused
    // -----------------------------
    ground: {
      radius: 2.0,
      subdivisions: 4,
    },
  
    // -----------------------------
    // ROCKS
    // -----------------------------
    rocks: {
      count: 22,
      minScale: 0.15,
      maxScale: 0.4,
    },
  
    // -----------------------------
    // PLANTS / LEAF GENERATOR
    // -----------------------------
    plants: {
      strandCount: 100,
  
      minLeafLen: 0.2,
      maxLeafLen: 0.65,
  
      minLeafWidth: 0.07,
      maxLeafWidth: 0.16,
  
      minLeafOffset: 0.07,
      maxLeafOffset: 0.2,
  
      tipUpScale: 0.24,
      tipForwardJitter: 0.14,
  
      tiltXRange: 0.45,
      tiltYBias: 0.35,
      tiltZRange: 0.32,
    },
  
    // -----------------------------
    // ANIMATION
    // -----------------------------
    // introRotationSpeed/idleRotationSpeed (pre-space-sequence spins) and glassFadeDurationMs/
    // vineGrowDurationMs (space-sequence phase timings) are gone along with the phases that used
    // them — see the camera comment above. finalSpinSpeed is the only spin left: the original's own
    // "homepage" idle spin, now the page's only spin from the very first frame.
    animation: {
        swaySpeed: 1.2,
        swayAmplitude: 0.06,
        finalSpinSpeed: 0.0030,
      },
  
    // -----------------------------
    // GREEN ORB PULSE
    // -----------------------------
    orbs: {
      spawnIntervalMs: 450,
      lifespanMs: 2500,
      minRadius: 0.06,
      maxRadius: 0.18,
      verticalOffset: 7.2,
    },
  };
  
  // ------------------------------
  //  TERRARIUM BOOTSTRAP
  // ------------------------------
  window.addEventListener("DOMContentLoaded", function () {
    const canvas = document.getElementById("loader-canvas");
    if (!canvas) return;
  
    const engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
  
    // Scene-level refs
    let scene;
    let camera;
  
    // Node graph
    let columnRoot = null;
    let drum = null;
    let plantsParent = null;
  
    // Glass bits
    let shell = null;
    let frontGlass = null;
    let backGlass = null;
    let plasticMat = null;
    let glassFragMat = null;
    let glassFragments = [];
  
    // Orbs
    let orbMat = null;
    const orbCfg = TERRARIUM_CONFIG.orbs;
    let orbSpawnTimerMs = 0;
    const activeOrbs = [];
  
    // Animation state — just the plant sway timer now; the intro/space-sequence phase-tracking
    // variables (introTime/introDone, spaceAnimActive/spacePhase/etc., onSpaceSequenceComplete) are
    // gone along with the phases that used them.
    let swayTime = 0;

    // Shortcuts
    const camCfg = TERRARIUM_CONFIG.camera;
    const lightCfg = TERRARIUM_CONFIG.lights;
    const shellCfg = TERRARIUM_CONFIG.shell;
    const plantCfg = TERRARIUM_CONFIG.plants;
    const aCfg = TERRARIUM_CONFIG.animation;
    const baseCfg = TERRARIUM_CONFIG.base;
    const groundCfg = TERRARIUM_CONFIG.ground;
  
    const createScene = function () {
      scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
  
      // CAMERA — fixed, never dragged/zoomed (no attachControl call anywhere in this file).
      camera = new BABYLON.ArcRotateCamera(
        "camera",
        camCfg.alpha,
        camCfg.beta,
        camCfg.radius,
        camCfg.target.clone(),
        scene
      );
      camera.allowUpsideDown = true;
  
      // LIGHTING
      const hemi = new BABYLON.HemisphericLight(
        "hemi",
        new BABYLON.Vector3(0, 1, 0),
        scene
      );
      hemi.intensity = lightCfg.hemiIntensity;
      hemi.groundColor = lightCfg.hemiGroundColor;
  
      const topLight = new BABYLON.SpotLight(
        "topLight",
        new BABYLON.Vector3(-6, 8, -4),
        new BABYLON.Vector3(1, -1.5, 1),
        lightCfg.top.angle,
        8,
        scene
      );
      topLight.diffuse = new BABYLON.Color3(0.9, 0.98, 0.9);
      topLight.specular = new BABYLON.Color3(0.9, 0.9, 0.9);
      topLight.intensity = lightCfg.top.intensity;
      topLight.range = lightCfg.top.range;
  
      const jadeRim = new BABYLON.PointLight(
        "jadeRim",
        new BABYLON.Vector3(0, 2.2, 0),
        scene
      );
      jadeRim.diffuse = new BABYLON.Color3(0.18, 0.7, 0.35);
      jadeRim.intensity = lightCfg.rim.intensity;
  
      const glow = new BABYLON.GlowLayer("glow", scene);
      glow.intensity = 0.0;
  
      // ROOT NODES
      columnRoot = new BABYLON.TransformNode("columnRoot", scene);
      columnRoot.position = camCfg.target.clone();
  
      drum = new BABYLON.TransformNode("drum", scene);
      drum.parent = columnRoot;
  
      // MATERIALS
      plasticMat = new BABYLON.PBRMaterial("plasticMat", scene);
      plasticMat.metallic = 0.0;
      plasticMat.roughness = 0.12;
      plasticMat.alpha = 0.18;
      plasticMat.subSurface.isRefractionEnabled = true;
      plasticMat.subSurface.indexOfRefraction = 1.03;
      plasticMat.tintColor = new BABYLON.Color3(0.45, 0.9, 0.6);
      plasticMat.emissiveColor = new BABYLON.Color3(0.12, 0.7, 0.4);
      plasticMat.emissiveIntensity = 0.0;
  
      glassFragMat = plasticMat.clone("glassFragMat");
      glassFragMat.alpha = 0.2;
  
      const trayMat = new BABYLON.StandardMaterial("trayMat", scene);
      trayMat.diffuseColor = new BABYLON.Color3(0.0, 0.28, 0.12)
      trayMat.specularColor = new BABYLON.Color3(0.45, 0.5, 0.55);
  
      const darkMetalMat = new BABYLON.StandardMaterial("darkMetalMat", scene);
      darkMetalMat.diffuseColor = new BABYLON.Color3(0.09, 0.11, 0.12);
      darkMetalMat.specularColor = new BABYLON.Color3(0.5, 0.55, 0.6);
  
      const plantGreenA = new BABYLON.StandardMaterial("plantGreenA", scene);
      plantGreenA.diffuseColor = new BABYLON.Color3(0.05, 0.26, 0.14);
      plantGreenA.emissiveColor = new BABYLON.Color3(0.02, 0.14, 0.08);
      plantGreenA.emissiveIntensity = 0.0;
  
      const plantGreenB = new BABYLON.StandardMaterial("plantGreenB", scene);
      plantGreenB.diffuseColor = new BABYLON.Color3(0.035, 0.20, 0.11);
      plantGreenB.emissiveColor = new BABYLON.Color3(0.015, 0.12, 0.07);
      plantGreenB.emissiveIntensity = 0.0;
  
      const leafHighlightMat = new BABYLON.StandardMaterial("leafHighlight", scene);
      leafHighlightMat.diffuseColor = new BABYLON.Color3(0.55, 1.0, 0.72);
      leafHighlightMat.emissiveColor = new BABYLON.Color3(0.5, 0.95, 0.75);
      leafHighlightMat.emissiveIntensity = 0.0;
      leafHighlightMat.specularColor = BABYLON.Color3.Black();
  
      orbMat = new BABYLON.StandardMaterial("orbMat", scene);
      orbMat.diffuseColor = new BABYLON.Color3(0.0, 0.0, 0.0);
      orbMat.emissiveColor = new BABYLON.Color3(0.0, 0.0, 0.0);
      orbMat.specularColor = BABYLON.Color3.Black();
      orbMat.alpha = 0.9;
  
      // SHELL
      shell = BABYLON.MeshBuilder.CreateCylinder("shell", {
        height: shellCfg.height,
        diameter: shellCfg.diameter,
        tessellation: shellCfg.segments,
      }, scene);
      shell.rotation.z = Math.PI / 2;
      shell.material = plasticMat;
      shell.parent = drum;
  
      // front/back discs
      frontGlass = BABYLON.MeshBuilder.CreateDisc("frontGlass", {
        radius: shellCfg.frontGlassRadius,
        tessellation: shellCfg.segments,
      }, scene);
      frontGlass.rotation.z = Math.PI / 2;
      frontGlass.position.x = shellCfg.height * 0.5;
      frontGlass.material = plasticMat;
      frontGlass.parent = drum;
      frontGlass.visibility = 0;
  
      backGlass = frontGlass.clone("backGlass");
      backGlass.position.x = -shellCfg.height * 0.5;
      backGlass.visibility = 0;
  
      // GLASS SHARDS
      glassFragments = [];
      const fragCount = 1000;
      const length = shellCfg.height;
      const startX = -length / 2;
      const stepX = length / (fragCount - 1);
      const radius = shellCfg.diameter / 2;
  
      for (let i = 0; i < fragCount; i++) {
        const x = startX + i * stepX;
        const angle = Math.random() * Math.PI * 2;
        const y = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
  
        const shard = BABYLON.MeshBuilder.CreateBox("glassShard_" + i, {
          width: 0.18 + Math.random() * 0.12,
          height: 0.18 + Math.random() * 0.12,
          depth: 0.02 + Math.random() * 0.02,
        }, scene);
  
        shard.position = new BABYLON.Vector3(x, y, z);
        shard.parent = drum;
        shard.material = glassFragMat;
        shard.visibility = 0;
  
        const offset = i / (fragCount - 1);
        const jitter = (Math.random() - 0.5) * 0.15;
        const dirY = (Math.random() - 0.5) * 1.5;
        const dirZ = 0.4 + Math.random() * 1.2;
        const rotSpeed = (Math.random() - 0.5) * 3.0;
  
        glassFragments.push({
          mesh: shard,
          offset,
          jitter,
          dirY,
          dirZ,
          rotSpeed,
        });
      }
  
      // TRAYS
      const trayLength = 3.0;
      const trayDepth = 1.4;
      const trayHeight = 0.12;
      const trayPositions = [-3.0, 0.0, 3.0];
      const trays = [];
  
      trayPositions.forEach((x, index) => {
        const tray = BABYLON.MeshBuilder.CreateBox("tray_" + index, {
          width: trayLength,
          depth: trayDepth,
          height: trayHeight,
        }, scene);
        tray.position = new BABYLON.Vector3(x, -1.05, 0.0);
        tray.material = trayMat;
        tray.parent = drum;
        trays.push(tray);
  
        const lip = BABYLON.MeshBuilder.CreateBox("trayLip_" + index, {
          width: trayLength * 0.96,
          depth: trayDepth * 0.96,
          height: trayHeight * 0.7,
        }, scene);
        lip.position = new BABYLON.Vector3(x, -0.94, 0.0);
        lip.material = darkMetalMat;
        lip.parent = drum;
      });
  
      // PLANTS
      plantsParent = new BABYLON.TransformNode("plantsParent", scene);
      plantsParent.parent = drum;
  
      function createLeafPlane(position, scale, tilt, mat) {
        const leaf = BABYLON.MeshBuilder.CreatePlane("leaf", {
          size: 1,
          sideOrientation: BABYLON.Mesh.DOUBLESIDE,
        }, scene);
        leaf.position = position.clone();
        leaf.scaling = new BABYLON.Vector3(scale.x, scale.y, 1);
        leaf.rotation = new BABYLON.Vector3(tilt.x, tilt.y, tilt.z);
        leaf.material = mat;
        leaf.parent = plantsParent;
        return leaf;
      }
  
      function makeRng(seed) {
        let s = seed;
        return function () {
          const x = Math.sin(s++) * 10000;
          return x - Math.floor(x);
        };
      }
  
      function createFernFrond(rootPos, directionAngle, length, segments, sideBias, seed) {
        const rand = makeRng(seed);
  
        const path = [];
        const up = new BABYLON.Vector3(0, 1, 0);
        const forward = new BABYLON.Vector3(Math.cos(directionAngle), 0, Math.sin(directionAngle));
        const right = new BABYLON.Vector3(forward.z, 0, -forward.x);
  
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const curve = Math.sin(t * Math.PI) * 0.3;
          const droop = t * t * 0.22;
  
          const pos = rootPos
            .add(up.scale(t * length - droop))
            .add(forward.scale(t * length * 0.22))
            .add(right.scale(curve));
  
          path.push(pos);
  
          if (i > 1 && i < segments - 1) {
            const leafLength = BABYLON.Scalar.Lerp(plantCfg.maxLeafLen, plantCfg.minLeafLen, t);
            const leafWidth = BABYLON.Scalar.Lerp(plantCfg.maxLeafWidth, plantCfg.minLeafWidth, t);
            const leafOffset = BABYLON.Scalar.Lerp(plantCfg.maxLeafOffset, plantCfg.minLeafOffset, t);
  
            const side = (i % 2 === 0 ? 1 : -1) * sideBias;
            const sideVec = right.scale(side);
  
            const leafCenter = pos.add(sideVec.scale(leafOffset + rand() * 0.03));
            const tipUp = up
              .scale(plantCfg.tipUpScale)
              .add(forward.scale(plantCfg.tipForwardJitter * (rand() - 0.5)));
  
            const tiltX = (rand() - 0.5) * plantCfg.tiltXRange;
            const tiltY = directionAngle + (side > 0 ? 1 : -1) * plantCfg.tiltYBias;
            const tiltZ = (rand() - 0.5) * plantCfg.tiltZRange;
  
            const mat = rand() > 0.8
              ? leafHighlightMat
              : (rand() > 0.4 ? plantGreenA : plantGreenB);
  
            createLeafPlane(
              leafCenter.add(tipUp),
              new BABYLON.Vector3(leafWidth, leafLength, 1),
              new BABYLON.Vector3(tiltX, tiltY, tiltZ),
              mat
            );
          }
        }
  
        const rachis = BABYLON.MeshBuilder.CreateTube("fernRachis", {
          path,
          radius: 0.03,
          tessellation: 10,
        }, scene);
        rachis.material = plantGreenB;
        rachis.parent = plantsParent;
      }
  
      function createFernClump(center, baseRadius, frondCount, seed) {
        const rand = makeRng(seed);
        const baseY = center.y;
  
        const baseMoundCount = 18;
        for (let i = 0; i < baseMoundCount; i++) {
          const angle = rand() * Math.PI * 2;
          const r = baseRadius * (0.2 + rand() * 1.0);
          const px = center.x + Math.cos(angle) * r;
          const pz = center.z + Math.sin(angle) * r;
          const py = baseY + (rand() - 0.5) * 0.06;
  
          const lump = BABYLON.MeshBuilder.CreateIcoSphere("moss", {
            radius: 0.09 + rand() * 0.25,
            subdivisions: 3,
          }, scene);
          lump.position = new BABYLON.Vector3(px, py, pz);
          lump.material = rand() > 0.5 ? plantGreenA : plantGreenB;
          lump.parent = plantsParent;
        }
  
        const count = frondCount + Math.floor(rand() * 4);
        for (let f = 0; f < count; f++) {
          const angle = rand() * Math.PI * 2;
          const innerR = baseRadius * (0.1 + rand() * 0.6);
          const fx = center.x + Math.cos(angle) * innerR;
          const fz = center.z + Math.sin(angle) * innerR;
          const fy = baseY + 0.02 + rand() * 0.05;
  
          const root = new BABYLON.Vector3(fx, fy, fz);
          const length = 1.4 + rand() * 1.1;
          const segments = 18 + Math.floor(rand() * 7);
          const sideBias = 0.9 + rand() * 0.5;
  
          createFernFrond(root, angle, length, segments, sideBias, seed + f * 31);
        }
      }
  
      // FERNS ON TRAYS
      trays.forEach((tray, idx) => {
        const baseCenter = tray.position;
        const baseY = -0.95;
  
        createFernClump(
          new BABYLON.Vector3(baseCenter.x, baseY, baseCenter.z),
          trayDepth * 0.6,
          11,
          100 + idx * 300
        );
  
        createFernClump(
          new BABYLON.Vector3(baseCenter.x - trayLength * 0.3, baseY, baseCenter.z + 0.1),
          trayDepth * 0.55,
          9,
          200 + idx * 300
        );
        createFernClump(
          new BABYLON.Vector3(baseCenter.x + trayLength * 0.3, baseY, baseCenter.z - 0.1),
          trayDepth * 0.55,
          9,
          300 + idx * 300
        );
  
        createFernClump(
          new BABYLON.Vector3(baseCenter.x, baseY + 0.22, baseCenter.z + 0.65),
          trayDepth * 0.4,
          7,
          400 + idx * 300
        );
        createFernClump(
          new BABYLON.Vector3(baseCenter.x, baseY + 0.22, baseCenter.z - 0.65),
          trayDepth * 0.4,
          7,
          500 + idx * 300
        );
      });
  
      // FLOOR FERNS
      (function populateWildFloorFerns() {
        let seedBase = 900;
        for (let xi = -5; xi <= 5; xi += 1.0) {
          if (Math.random() < 0.9) {
            const x = xi + (Math.random() - 0.5) * 0.4;
            const z = (Math.random() - 0.5) * 2.0;
            createFernClump(
              new BABYLON.Vector3(x, -1.02, z),
              0.5 + Math.random() * 0.3,
              4 + Math.floor(Math.random() * 4),
              seedBase
            );
            seedBase += 37;
          }
        }
      })();
  
      // -----------------------------
      // ORBS
      // -----------------------------
      function spawnOrb(sign) {
        if (!columnRoot || !orbMat) return;
  
        const diameter = orbCfg.maxRadius * 2;
        const orb = BABYLON.MeshBuilder.CreateSphere("pulseOrb", {
          diameter,
          segments: 6,
        }, scene);
  
        orb.material = orbMat;
        orb.parent = columnRoot;
  
        const yBase = orbCfg.verticalOffset * sign;
        const jitterX = (Math.random() - 0.5) * 1.0;
        const jitterZ = (Math.random() - 0.5) * 1.0;
  
        orb.position = new BABYLON.Vector3(jitterX, yBase, jitterZ);
        orb.scaling = new BABYLON.Vector3(0.01, 0.01, 0.01);
  
        activeOrbs.push({
          mesh: orb,
          ageMs: 0,
        });
      }
  
      // Runs unconditionally now — the original only spawned orbs once the space sequence's own
      // "final spin" phase was reached; here that's the whole page's state from frame one, so the
      // guard that used to gate this on `finalSpinActive` is gone.
      function updateOrbs(deltaMs) {
        orbSpawnTimerMs += deltaMs;
        if (orbSpawnTimerMs >= orbCfg.spawnIntervalMs) {
          orbSpawnTimerMs = 0;
          spawnOrb(1);
          spawnOrb(-1);
        }
  
        for (let i = activeOrbs.length - 1; i >= 0; i--) {
          const orb = activeOrbs[i];
          orb.ageMs += deltaMs;
          const t = orb.ageMs / orbCfg.lifespanMs;
  
          if (t >= 1) {
            orb.mesh.dispose();
            activeOrbs.splice(i, 1);
            continue;
          }
  
          const grow = t < 0.5 ? (t / 0.5) : (1 - (t - 0.5) / 0.5);
          const radius = BABYLON.Scalar.Lerp(orbCfg.minRadius, orbCfg.maxRadius, grow);
          orb.mesh.scaling.set(radius, radius, radius);
  
          orb.mesh.position.y += (Math.sin(orb.ageMs * 0.005 * (orb.mesh.position.y > 0 ? 1 : -1))) * 0.003;
          orb.mesh.rotation.y += 0.003 * (orb.mesh.position.y > 0 ? 1 : -1);
        }
      }
  
      // -----------------------------
      // STATIC HOMEPAGE STATE
      // -----------------------------
      // Everything above this point (mesh/material/light construction) is untouched from the
      // original. What used to happen here — an automatic intro fly-in, then a spacebar-triggered
      // "space sequence" (pull back → glass shatters into shards → fly through → settle vertical) —
      // is gone entirely; see the camera/animation config comments above for why. This sets the
      // scene directly to what that whole sequence used to END at (its own PHASE 5 "homepage" state):
      // glass shell dissolved away, drum tilted to its final roll. Applied once, here, instead of
      // animated into.
      if (shell) shell.visibility = 0;
      if (frontGlass) frontGlass.visibility = 0;
      if (backGlass) backGlass.visibility = 0;
      if (plasticMat) plasticMat.alpha = 0;
      glassFragments.forEach((frag) => {
        frag.mesh.visibility = 0;
      });
      if (drum) drum.rotation.z = -Math.PI / 2;

      // -----------------------------
      // MAIN TICK — the original's own PHASE 5 idle spin + gentle plant sway + orb pulses, now the
      // page's only behavior from the first frame (no phase to reach it through any more).
      // -----------------------------
      scene.registerBeforeRender(() => {
        const deltaMs = scene.getEngine().getDeltaTime();
        const dt = deltaMs * 0.001;

        if (columnRoot) columnRoot.rotation.y += aCfg.finalSpinSpeed;
        if (drum) drum.rotation.y += aCfg.finalSpinSpeed;
        if (plantsParent) {
          swayTime += dt * aCfg.swaySpeed * 0.5;
          plantsParent.rotation.z = Math.sin(swayTime) * (aCfg.swayAmplitude * 0.5);
        }

        updateOrbs(deltaMs);
      });

      return scene;
    };

    const sceneInstance = createScene();

    // Render loop
    engine.runRenderLoop(function () {
      if (sceneInstance && sceneInstance.activeCamera) {
        sceneInstance.render();
      }
    });

    window.addEventListener("resize", function () {
      engine.resize();
    });
  });
  