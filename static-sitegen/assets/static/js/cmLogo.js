// CMLogoRenderer - 3D SVG logo renderer using Three.js
// This script should be loaded after Three.js and SVGLoader

window.addEventListener('load', () => {
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

      window.addEventListener('resize', this.onWindowResize.bind(this));

      this.animate = this.animate.bind(this);
      this.animate();

      this.loadSVG();
    }

    loadSVG() {
      // Use the same path as in the test page
      const svgURL = '/assets/static/img/bunny-punx.svg';

      fetch(svgURL)
        .then(response => {
          if (!response.ok) {
            console.error('Failed to load SVG:', response.status);
            // Try alternative path as fallback
            return fetch('assets/static/img/bunny-punx.svg');
          }
          return response.text();
        })
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
    }

    animate() {
      requestAnimationFrame(this.animate);
      if (this.svgParentGroup) {
        this.svgParentGroup.rotation.y += 0.01;
      }
      this.renderer.render(this.scene, this.camera);
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
