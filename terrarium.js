// ===============================
//  TERRARIUM CONFIG
// ===============================

const TERRARIUM_CONFIG = {

    // -----------------------------
    // CAMERA SETTINGS
    // -----------------------------
    camera: {
      // Final resting position after intro (loader idle)
      alpha: Math.PI / 2,
  beta: 0.9,
  radius: 11,

  // Let them get very close & very far
  lowerRadiusLimit: 0.3,   // was 4
  upperRadiusLimit: 80,    // was 20

  wheelPrecision: 1,
  wheelDeltaPercentage: 0.03, // a bit “finer” zoom feel (optional)

  target: new BABYLON.Vector3(0, 2, 0),
  
      // Intro animation (on loader show)
      startAlpha: -Math.PI / 4,
      startBeta: Math.PI / 2.7,
      startRadius: 2.2,
      introDurationMs: 5000,
  
      // SPACE sequence targets
      space_fullView: {
        alpha: Math.PI / 2,
        beta: 0.9,
        radius: 13,
        durationMs: 1500,
      },
      space_flyThrough: {
        radiusClose: 3.0,
        durationMs: 2500,
      },
      space_verticalView: {
        alpha: Math.PI / 2,
        beta: Math.PI / 2.1,
        radius: 19,      // ↑ from 15 for ~25% smaller look
        durationMs: 2000,
      }
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
    animation: {
        introRotationSpeed: 0.003,
        idleRotationSpeed: 0.0015,
      
        swaySpeed: 1.2,
        swayAmplitude: 0.06,
      
        glassFadeDurationMs: 5100, // ↓ from 2000
        vineGrowDurationMs: 600,   // ↓ from 2000
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
  
    // Animation state
    let swayTime = 0;
    let introTime = 0;
    let introDone = false;
  
    let spaceAnimActive = false;
    let spacePhase = 0;
    let spacePhaseTime = 0;
    let spacePhaseStarted = false;
    let finalSpinActive = false;
  
    let onSpaceSequenceComplete = null;
    let sequenceCompleteFired = false;
  
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
  
      // CAMERA
      camera = new BABYLON.ArcRotateCamera(
        "camera",
        camCfg.startAlpha,
        camCfg.startBeta,
        camCfg.startRadius,
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
  
      function updateOrbs(deltaMs) {
        if (!finalSpinActive) return;
  
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
      // INTRO & SPACE SEQUENCE
      // -----------------------------
      function updateIntro(dt) {
        if (introDone || spaceAnimActive) return;
  
        introTime += scene.getEngine().getDeltaTime();
        const t = Math.min(introTime / camCfg.introDurationMs, 1);
  
        camera.radius = BABYLON.Scalar.Lerp(camCfg.startRadius, camCfg.radius, t);
        camera.alpha  = BABYLON.Scalar.Lerp(camCfg.startAlpha,  camCfg.alpha,  t);
        camera.beta   = BABYLON.Scalar.Lerp(camCfg.startBeta,   camCfg.beta,   t);
  
        if (drum) {
          drum.rotation.y += aCfg.introRotationSpeed;
        }
        if (plantsParent) {
          swayTime += dt * aCfg.swaySpeed;
          plantsParent.rotation.z = Math.sin(swayTime) * aCfg.swayAmplitude;
        }
  
        if (t >= 1 && !introDone) {
          introDone = true;
  
          camera.lowerRadiusLimit = camCfg.lowerRadiusLimit;
          camera.upperRadiusLimit = camCfg.upperRadiusLimit;
          camera.lowerBetaLimit = null;
          camera.upperBetaLimit = null;
          camera.allowUpsideDown = true;
          camera.wheelPrecision = camCfg.wheelPrecision;
          camera.wheelDeltaPercentage = camCfg.wheelDeltaPercentage;
          camera.attachControl(canvas, true);
        }
      }
  
      function updateSpaceSequence(dt) {
        // Run while the main space animation *or* final spin is active
        if (!spaceAnimActive && !finalSpinActive) return;
  
        if (!spacePhaseStarted) {
          spacePhaseTime = 0;
          spacePhaseStarted = true;
        } else {
          spacePhaseTime += scene.getEngine().getDeltaTime();
        }
  
        const tPhase = (durationMs) => Math.min(spacePhaseTime / durationMs, 1);
  
        // PHASE 0: pull back to full view + tilt
        if (spacePhase === 0) {
          const d = camCfg.space_fullView.durationMs;
          const t = tPhase(d);
  
          camera.detachControl();
          camera.radius = BABYLON.Scalar.Lerp(
            camera.radius,
            camCfg.space_fullView.radius,
            0.1
          );
          camera.alpha = BABYLON.Scalar.Lerp(
            camera.alpha,
            camCfg.space_fullView.alpha,
            0.1
          );
          camera.beta = BABYLON.Scalar.Lerp(
            camera.beta,
            camCfg.space_fullView.beta,
            0.1
          );
  
          if (columnRoot) {
            columnRoot.rotation.x = BABYLON.Scalar.Lerp(columnRoot.rotation.x, 0.9, 0.15);
            columnRoot.rotation.y = BABYLON.Scalar.Lerp(columnRoot.rotation.y, 1.1, 0.15);
          }
  
          if (t >= 1) {
            spacePhase = 1;
            spacePhaseStarted = false;
          }
        }
  
        // PHASE 1: glass dissolves into shards
        else if (spacePhase === 1) {
          const d = aCfg.glassFadeDurationMs;
          const tGlobal = tPhase(d);
  
          const fade = 1 - tGlobal;
          if (plasticMat) {
            plasticMat.alpha = 0.18 * fade;
          }
          if (shell) {
            shell.visibility = fade > 0.2 ? 1 : 0;
          }
  
          glassFragments.forEach((frag) => {
            const { mesh, offset, jitter, dirY, dirZ, rotSpeed } = frag;
            const start = offset * 1.2;
            const localDuration = 0.55;
            let localT = (tGlobal - start) / localDuration;
            if (localT < 0) localT = 0;
            if (localT > 1) localT = 1;
  
            if (localT > 0) {
              mesh.visibility = 1;
  
              const explode = localT;
              const moveY = dirY * explode * 2.0;
              const moveZ = dirZ * explode * 2.0;
  
              mesh.position.y += moveY * dt * 12;
              mesh.position.z += moveZ * dt * 25;
  
              mesh.rotation.x += rotSpeed * dt;
              mesh.rotation.y += rotSpeed * 0.5 * dt;
            }
          });
  
          if (tGlobal >= 1) {
            if (shell) shell.visibility = 0;
            if (frontGlass) frontGlass.visibility = 0;
            if (backGlass) backGlass.visibility = 0;
            glassFragments.forEach((frag) => {
              frag.mesh.visibility = 0;
            });
  
            spacePhase = 2;
            spacePhaseStarted = false;
          }
        }
  
        // PHASE 2: fly-through
        else if (spacePhase === 2) {
          const d = camCfg.space_flyThrough.durationMs;
          const t = tPhase(d);
  
          const closeR = camCfg.space_flyThrough.radiusClose;
          camera.radius = BABYLON.Scalar.Lerp(
            camCfg.space_fullView.radius,
            closeR,
            t
          );
  
          camera.alpha += 0.02 * dt * 60;
          camera.beta = BABYLON.Scalar.Lerp(
            camCfg.space_fullView.beta,
            Math.PI / 3,
            t
          );
  
          if (plantsParent) {
            swayTime += dt * aCfg.swaySpeed * 1.5;
            plantsParent.rotation.z = Math.sin(swayTime) * aCfg.swayAmplitude * 1.5;
          }
  
          if (t >= 1) {
            spacePhase = 3;
            spacePhaseStarted = false;
          }
        }
  
        // PHASE 3: pull back + flip vertical
        else if (spacePhase === 3) {
          const d = camCfg.space_verticalView.durationMs;
          const t = tPhase(d);
  
          camera.radius = BABYLON.Scalar.Lerp(
            camera.radius,
            camCfg.space_verticalView.radius,
            0.08
          );
          camera.alpha = BABYLON.Scalar.Lerp(
            camera.alpha,
            camCfg.space_verticalView.alpha,
            0.08
          );
          camera.beta = BABYLON.Scalar.Lerp(
            camera.beta,
            camCfg.space_verticalView.beta,
            0.08
          );
  
          if (columnRoot) {
            columnRoot.rotation.x = BABYLON.Scalar.Lerp(columnRoot.rotation.x, 0, 0.12);
            columnRoot.rotation.y = BABYLON.Scalar.Lerp(columnRoot.rotation.y, 0, 0.12);
          }
  
          if (drum) {
            drum.rotation.z = BABYLON.Scalar.Lerp(drum.rotation.z, -Math.PI / 2, 0.12);
          }
  
          if (t >= 1) {
            spacePhase = 4;
            spacePhaseStarted = false;
          }
        }
  
        // PHASE 4: settle, enter final spin, fire callback
        else if (spacePhase === 4) {
          const d = aCfg.vineGrowDurationMs;
          const t = tPhase(d);
  
          if (t >= 1) {
            spacePhase = 5;
            spacePhaseStarted = false;
            finalSpinActive = true;
  
            if (!sequenceCompleteFired) {
              sequenceCompleteFired = true;
  
              if (typeof onSpaceSequenceComplete === "function") {
                onSpaceSequenceComplete();
              }
  
              window.dispatchEvent(new CustomEvent("TerrariumSequenceComplete"));
            }
          }
        }

                // PHASE 5: continuous idle "barber shop pole" spin on homepage
        else if (spacePhase === 5) {
          // Smooth spin around vertical axis
          if (columnRoot) {
            columnRoot.rotation.y += aCfg.finalSpinSpeed;
          }
          if (drum) {
            drum.rotation.y += aCfg.finalSpinSpeed;
          }

          // Optional: keep a bit of gentle plant sway
          if (plantsParent) {
            swayTime += dt * aCfg.swaySpeed * 0.5;
            plantsParent.rotation.z =
              Math.sin(swayTime) * (aCfg.swayAmplitude * 0.5);
          }
        }

      }
  
      // -----------------------------
      // MAIN TICK
      // -----------------------------
      scene.registerBeforeRender(() => {
        const deltaMs = scene.getEngine().getDeltaTime();
        const dt = deltaMs * 0.001;
  
        if (!spaceAnimActive) {
          updateIntro(dt);
  
          if (introDone && !spaceAnimActive && !finalSpinActive) {
            if (drum) {
              drum.rotation.y += aCfg.idleRotationSpeed;
            }
            if (plantsParent) {
              swayTime += dt * aCfg.swaySpeed;
              plantsParent.rotation.z = Math.sin(swayTime) * aCfg.swayAmplitude;
            }
          }
        }
  
        if (spaceAnimActive || finalSpinActive) {
          updateSpaceSequence(dt);
        }
  
        updateOrbs(deltaMs);
      });
  
      return scene;
    };
  
    const sceneInstance = createScene();
  
    // Public API for main.js
    window.startTerrariumSpaceSequence = function (onComplete) {
      if (!scene) return;
      if (spaceAnimActive || finalSpinActive) return;
  
      onSpaceSequenceComplete = (typeof onComplete === "function") ? onComplete : null;
      sequenceCompleteFired = false;
  
      spaceAnimActive = true;
      introDone = true;
      spacePhase = 0;
      spacePhaseTime = 0;
      spacePhaseStarted = false;
  
      if (camera) {
        camera.detachControl();
      }
  
      if (shell) {
        shell.visibility = 1;
        if (plasticMat) plasticMat.alpha = 0.18;
      }
    };
  
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
  