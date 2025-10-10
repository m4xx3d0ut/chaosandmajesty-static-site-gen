// CMLogoRenderer - 3D SVG logo renderer using Three.js
// This script should be loaded after Three.js and SVGLoader

window.addEventListener('load', () => {
  const globalObject = typeof window !== 'undefined' ? window : null;

  function ensureGlobalControlStub() {
    if (!globalObject) {
      return null;
    }
    if (globalObject.cmLogoControl && typeof globalObject.cmLogoControl === 'object') {
      return globalObject.cmLogoControl;
    }

    const pendingReasons = new Set();
    let controller = null;

    const stub = {
      setController(nextController) {
        controller = nextController;
        if (!controller || typeof controller.pause !== 'function') {
          return;
        }
        if (pendingReasons.size > 0) {
          pendingReasons.forEach(reason => {
            try {
              controller.pause(reason);
            } catch (err) {
              console.error('Failed to apply pending pause reason', reason, err);
            }
          });
          pendingReasons.clear();
        }
      },
      pause(reason) {
        const key = reason || 'manual';
        if (controller && typeof controller.pause === 'function') {
          controller.pause(key);
          return;
        }
        pendingReasons.add(key);
      },
      resume(reason) {
        const key = reason || 'manual';
        if (controller && typeof controller.resume === 'function') {
          controller.resume(key);
          return;
        }
        pendingReasons.delete(key);
      },
      toggleManualPause() {
        if (controller && typeof controller.toggleManualPause === 'function') {
          controller.toggleManualPause();
          return;
        }
        if (pendingReasons.has('manual')) {
          pendingReasons.delete('manual');
        } else {
          pendingReasons.add('manual');
        }
      },
      isPaused() {
        if (controller && typeof controller.isPaused === 'function') {
          return controller.isPaused();
        }
        return pendingReasons.size > 0;
      }
    };

    globalObject.cmLogoControl = stub;
    return stub;
  }

  const globalControl = ensureGlobalControlStub();

  class CMLogoRenderer {
    constructor(container) {
      this.container = container || document.body;
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;

      // Scene setup
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x000000);

      // Camera setup (farther back to fit big SVGs)
      this.camera = new THREE.PerspectiveCamera(85, this.width / this.height, 0.1, 5000);
      this.camera.position.z = 250; // Large Z for safety

      // Renderer setup
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(this.width, this.height);
      const maxPixelRatio = 2.0; // or 2.0 for sharper but still fast
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
      this.container.appendChild(this.renderer.domElement);

      // Lighting
      const ambient = new THREE.AmbientLight(0xffffff, 0.3);
      this.scene.add(ambient);

      const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
      dir1.position.set(1, 2, 2);
      this.scene.add(dir1);

      const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
      dir2.position.set(-1, -1, 2);
      this.scene.add(dir2);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
      hemi.position.set(0, 100, 0);
      this.scene.add(hemi);

      this.onWindowResize = this.onWindowResize.bind(this);
      window.addEventListener('resize', this.onWindowResize);

      this.pauseReasons = new Set();
      this.animationFrameId = null;
      this.rotationSpeed = 0.01;
      this.animate = this.animate.bind(this);
      this.handleContainerClick = this.handleContainerClick.bind(this);
      this.handleContainerKey = this.handleContainerKey.bind(this);

      this.setupInteractivity();
      this.updatePausedStateAttributes();
      this.startAnimation();
      this.loadSVG();
      this.registerWithGlobalControl();
    }

    loadSVG() {
      const defaultPath = '/assets/static/img/bunny-punx.svg';
      const requestedPath = (globalObject && globalObject.cmLogoSvgPath) ? globalObject.cmLogoSvgPath : defaultPath;
      const fallbackCandidates = [requestedPath];
      if (!fallbackCandidates.includes(defaultPath)) {
        fallbackCandidates.push(defaultPath);
      }
      const relativeFallback = 'assets/static/img/bunny-punx.svg';
      if (!fallbackCandidates.includes(relativeFallback)) {
        fallbackCandidates.push(relativeFallback);
      }

      const fetchSequentially = (paths) => {
        if (!paths.length) {
          return Promise.reject(new Error('Unable to load SVG for CM logo.'));
        }
        const nextPath = paths.shift();
        return fetch(nextPath).then(response => {
          if (!response.ok) {
            throw new Error('Failed to load SVG from ' + nextPath + ' (' + response.status + ')');
          }
          return response.text();
        }).catch(error => {
          console.error('CM logo SVG fetch failed for', nextPath, error);
          return fetchSequentially(paths);
        });
      };

      fetchSequentially(fallbackCandidates.slice())
        .then(svgText => {
          const loader = new THREE.SVGLoader();
          const svgData = loader.parse(svgText);

          // Parent group for centering and rotation
          const parentGroup = new THREE.Group();
          this.scene.add(parentGroup);

          // SVG group for geometry
          const svgGroup = new THREE.Group();

          svgData.paths.forEach(path => {
            const shapes = THREE.SVGLoader.createShapes(path);
            shapes.forEach(shape => {
              const geometry = new THREE.ExtrudeGeometry(shape, {
                depth: 10,
                bevelEnabled: false,
                curveSegments: 6 // Reduce for much lower geometry load!
              });
              const material = new THREE.MeshPhysicalMaterial({
                color: 0x66ff00,
                metalness: 0.6,
                roughness: 0.25,
                clearcoat: 0.7,
                clearcoatRoughness: 0.1,
                reflectivity: 0.5,
                sheen: 1.0,
                sheenColor: new THREE.Color(0x88ff88)
              });
              const mesh = new THREE.Mesh(geometry, material);
              svgGroup.add(mesh);
            });
          });

          // Scale SVG down and flip if needed (start with upright)
          svgGroup.scale.set(0.8, -0.8, 0.8);

          // Center SVG group at (0,0,0)
          const box = new THREE.Box3().setFromObject(svgGroup);
          const center = box.getCenter(new THREE.Vector3());
          svgGroup.position.sub(center);

          // Add to parent group
          parentGroup.add(svgGroup);

          // Store parent group for animation
          this.svgParentGroup = parentGroup;
          this.renderOnce();
        })
        .catch(error => {
          console.error('Error loading SVG:', error);
        });
    }

    onWindowResize() {
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      this.renderOnce();
    }

    startAnimation() {
      if (this.animationFrameId !== null || this.pauseReasons.size > 0) {
        return;
      }
      this.animationFrameId = requestAnimationFrame(this.animate);
    }

    stopAnimation() {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    animate() {
      this.animationFrameId = null;

      if (this.pauseReasons.size > 0) {
        this.updatePausedStateAttributes();
        return;
      }

      if (this.svgParentGroup) {
        this.svgParentGroup.rotation.y += this.rotationSpeed;
      }
      this.renderer.render(this.scene, this.camera);
      this.animationFrameId = requestAnimationFrame(this.animate);
    }

    pause(reason = 'manual') {
      const priorSize = this.pauseReasons.size;
      this.pauseReasons.add(reason);
      if (this.pauseReasons.size === priorSize) {
        return;
      }
      this.stopAnimation();
      this.renderOnce();
      this.updatePausedStateAttributes();
    }

    resume(reason = 'manual') {
      const removed = this.pauseReasons.delete(reason);
      if (!removed) {
        return;
      }
      if (this.pauseReasons.size === 0) {
        this.startAnimation();
      }
      this.updatePausedStateAttributes();
    }

    toggleManualPause() {
      if (this.pauseReasons.has('manual')) {
        this.resume('manual');
      } else {
        this.pause('manual');
      }
    }

    isPaused() {
      return this.pauseReasons.size > 0;
    }

    renderOnce() {
      try {
        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.error('Failed to render CM logo frame', err);
      }
    }

    setupInteractivity() {
      if (!this.container) {
        return;
      }
      this.container.classList.add('cm-logo-interactive');
      if (!this.container.hasAttribute('tabindex')) {
        this.container.setAttribute('tabindex', '0');
      }
      this.container.setAttribute('role', 'button');
      this.container.setAttribute('aria-label', this.container.getAttribute('aria-label') || 'Toggle CM logo animation');
      this.container.addEventListener('click', this.handleContainerClick);
      this.container.addEventListener('keydown', this.handleContainerKey);
    }

    handleContainerClick(event) {
      event.preventDefault();
      this.toggleManualPause();
    }

    handleContainerKey(event) {
      if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Enter') {
        event.preventDefault();
        this.toggleManualPause();
      }
    }

    updatePausedStateAttributes() {
      if (!this.container) {
        return;
      }
      const paused = this.pauseReasons.size > 0;
      this.container.classList.toggle('is-paused', paused);
      this.container.setAttribute('aria-pressed', paused ? 'true' : 'false');
      if (this.container.dataset) {
        this.container.dataset.logoPaused = paused ? 'true' : 'false';
      }
    }

    registerWithGlobalControl() {
      if (globalControl && typeof globalControl.setController === 'function') {
        globalControl.setController(this);
      }
    }
  }

  // Attach to your container (change ID if needed)
  const container = document.getElementById('cm-logo-container');
  if (container) {
    new CMLogoRenderer(container);
  } else {
    console.warn('Container #cm-logo-container not found');
  }
});
