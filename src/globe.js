import * as THREE from 'three';

const RADIUS = 5;
const TILE_SIZE = 0.62;
const AUTO_ROTATE_SPEED = 0.035; // radians/sec, spin around Y
const AUTO_TILT_SPEED = 0.09; // radians/sec, phase speed for the tilt oscillation
const MAX_TILT = 0.55; // radians — how far the globe leans, so top/bottom tiles pass into view
const IDLE_RESUME_MS = 3500; // how long after a manual drag before auto-rotate resumes

// create the sphere 
function fibonacciSpherePoints(count, radius) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // -1..1
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;

    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;

    points.push(new THREE.Vector3(x, y, z).multiplyScalar(radius));
  }

  return points;
}

export class AlbumGlobe {
  constructor(canvas) {
    this.canvas = canvas;
    this.onTileClick = null;
    this.autoRotate = true;
    this.tiltPhase = 0;
    this.resumeTimer = null;
    this.tiles = [];

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 13);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hovered = null;

    this._addLights();
    this._addWireframeSphere();
    this._addDragRotation();

    this.canvas.addEventListener('pointermove', this._onPointerMove.bind(this));
    this.canvas.addEventListener('click', this._onClick.bind(this));

    this._resize();
    window.addEventListener('resize', this._resize.bind(this));

    this._lastTime = performance.now();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _addLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const point = new THREE.PointLight(0xffffff, 0.6);
    point.position.set(10, 10, 10);
    this.scene.add(point);
  }

  _addWireframeSphere() {
    const geometry = new THREE.SphereGeometry(RADIUS - 0.05, 32, 24);
    const material = new THREE.MeshBasicMaterial({
      color: 0x2a3a52,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  _addDragRotation() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.autoRotate = false;
      clearTimeout(this.resumeTimer);
    });
    window.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      // Resume the auto tour after a bit of idle time, so a stray drag
      // doesn't permanently stop you from seeing the rest of the globe.
      clearTimeout(this.resumeTimer);
      this.resumeTimer = setTimeout(() => {
        this.tiltPhase = 0;
        this.autoRotate = true;
      }, IDLE_RESUME_MS);
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.scene.rotation.y += dx * 0.005;
      this.scene.rotation.x += dy * 0.005;
      this.scene.rotation.x = Math.max(-1.2, Math.min(1.2, this.scene.rotation.x));
    });
  }

  // Album covers are loaded and each cover is a tile 
  loadAlbums(albums) {
    this._clearTiles();

    const points = fibonacciSpherePoints(albums.length, RADIUS);
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    albums.forEach((album, i) => {
      const position = points[i];
      const geometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
      const material = new THREE.MeshBasicMaterial({
        color: 0x333333,
        side: THREE.DoubleSide
      });
      const tile = new THREE.Mesh(geometry, material);
      tile.position.copy(position);
      tile.lookAt(position.clone().multiplyScalar(2)); // face outward along the normal
      tile.userData.album = album;
      tile.userData.baseScale = 1;

      this.scene.add(tile);
      this.tiles.push(tile);

      loader.load(
        album.artworkUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
        },
        undefined,
        () => {
        
        }
      );
    });
  }

  _clearTiles() {
    for (const tile of this.tiles) {
      tile.geometry.dispose();
      tile.material.map?.dispose();
      tile.material.dispose();
      this.scene.remove(tile);
    }
    this.tiles = [];
  }

  _onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onClick() {
    if (this.hovered && this.onTileClick) {
      this.onTileClick(this.hovered.userData.album);
    }
  }

  _updateHover() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.tiles);
    const nextHovered = intersections[0]?.object ?? null;

    if (nextHovered !== this.hovered) {
      if (this.hovered) this.hovered.scale.setScalar(1);
      if (nextHovered) nextHovered.scale.setScalar(1.35);
      this.hovered = nextHovered;
      this.canvas.style.cursor = nextHovered ? 'pointer' : 'grab';
    }
  }

  _resize() {
    const { clientWidth, clientHeight } = this.canvas.parentElement;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  _animate(time) {
    const dt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    if (this.autoRotate) {
      this.scene.rotation.y += AUTO_ROTATE_SPEED * dt;
      // Oscillating tilt on top of the spin so tiles near the poles drift
      // into view too, not just the equatorial band.
      this.tiltPhase += AUTO_TILT_SPEED * dt;
      this.scene.rotation.x = Math.sin(this.tiltPhase) * MAX_TILT;
    }

    this._updateHover();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._animate);
  }

  dispose() {
    clearTimeout(this.resumeTimer);
    this._clearTiles();
    this.renderer.dispose();
    window.removeEventListener('resize', this._resize.bind(this));
  }
}
