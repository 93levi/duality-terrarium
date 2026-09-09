// Adapted from moss x kanji FINAL's public/three-scene/js/scene.js — same renderer/camera/
// OrbitControls setup and tuning, but sized to a CONTAINER instead of the whole window, since this
// scene mounts into the home page's terrarium slot, not a standalone full-page demo. Uses
// ResizeObserver (not a `window resize` listener) for the same reason apps/web/src/viewer/scene.js
// does: a container's size can be unknown for a moment on first mount, and only ResizeObserver
// reliably re-fires once it's known.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// Returns everything main.js needs, plus a `disposeResize()` to stop the ResizeObserver — the
// renderer/controls themselves are disposed by the caller (see terrarium.js's dispose()), since
// this function's job is just building them, not owning their whole lifecycle.
export function createScene(container) {
  // ─────────────────────────────────────────────────────────────────────────────
  // SCENE - Base container for all 3D objects
  // ─────────────────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x07090b) // Very dark blue-black background
  scene.fog = new THREE.FogExp2(0x07090b, 0.12) // Exponential fog for depth perception

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDERER - WebGL output to canvas
  // ─────────────────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // Cap for performance

  // Shadow mapping for realistic lighting
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap // Soft shadows (better quality)

  // Color space and tone mapping for realistic appearance
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping // Cinematic tone mapping
  renderer.toneMappingExposure = 1.8 // Exposure adjustment

  container.appendChild(renderer.domElement)

  // ─────────────────────────────────────────────────────────────────────────────
  // CAMERA - Perspective view
  // ─────────────────────────────────────────────────────────────────────────────
  // Positioned to show the small terrarium scene from a good viewing angle.
  // Initial position is overridden by the entrance animation in terrarium.js.
  const w0 = container.clientWidth || 1
  const h0 = container.clientHeight || 1
  const camera = new THREE.PerspectiveCamera(55, w0 / h0, 0.01, 80)
  camera.position.set(0.5, 1.8, 2.8)

  // ─────────────────────────────────────────────────────────────────────────────
  // ORBIT CONTROLS - User interaction and auto-rotation
  // ─────────────────────────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.18, 0) // Orbit center (slight offset from origin)

  // Distance constraints — must encompass every animated camera position (birds-eye ≈ 8.3,
  // entrance start ≈ 9.3) or controls.update() will clamp/snap the camera mid-swoop.
  controls.minDistance = 0.7
  controls.maxDistance = 12.0

  controls.minPolarAngle = 0.05 // Prevent flipping over the top
  controls.maxPolarAngle = Math.PI * 0.52 // Allow a low ground-scraping view later

  controls.enableDamping = true
  controls.dampingFactor = 0.06

  controls.enableZoom = false // Zoom handled manually in terrarium.js for responsive pinch behaviour

  controls.autoRotate = true
  controls.autoRotateSpeed = 0.7 // Slow, gentle rotation

  controls.update()

  // ─────────────────────────────────────────────────────────────────────────────
  // CLOCK - Tracks elapsed time for animations
  // ─────────────────────────────────────────────────────────────────────────────
  const clock = new THREE.Clock()

  // ─────────────────────────────────────────────────────────────────────────────
  // RESIZE HANDLING - Adapt to the container's own size, not the window's
  // ─────────────────────────────────────────────────────────────────────────────
  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  resizeObserver.observe(container)

  function disposeResize() {
    resizeObserver.disconnect()
  }

  // Composer is null — terrarium.js uses direct renderer.render() without post-processing, same as
  // the source demo.
  const composer = null

  return { scene, camera, renderer, composer, controls, clock, disposeResize }
}
