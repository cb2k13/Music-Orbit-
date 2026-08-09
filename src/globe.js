import * as THREE from 'three';

const RADIUS = 5;
const TILE_SIZE = 0.62;
const AUTO_ROTATE_SPEED = 0.035; 
const AUTO_TILT_SPEED = 0.09; 
const MAX_TILT = 0.55; 
const FIT_MARGIN = 1.00; 


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
    this.dragging = false;
    this.tiltPhase = 0;
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

    // ResizeObserver (rather than window's 'resize' event) is what actually
    // fires reliably on mobile — address bar show/hide, orientation change,
    // and font-load reflows don't always trigger 'resize', which is what
    // causes the camera's aspect ratio to go stale and the globe to render
    // stretched into an oval.
    this._resize();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.canvas.parentElement);

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
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      if (!this.dragging) return;
      this.dragging = false;
      // Resync the tilt oscillation's phase to wherever the manual drag
      // left rotation.x, so it continues smoothly instead of jumping.
      const ratio = THREE.MathUtils.clamp(this.scene.rotation.x / MAX_TILT, -1, 1);
      this.tiltPhase = Math.asin(ratio);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      // Added on top of the continuous auto-spin below, not instead of it —
      // the globe never stops turning, dragging just nudges it further.
      this.scene.rotation.y += dx * 0.005;
      this.scene.rotation.x += dy * 0.005;
      this.scene.rotation.x = Math.max(-1.2, Math.min(1.2, this.scene.rotation.x));
    });
  }

  // Loads album artwork as textures and places one tile per album on the sphere.
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
          // Leave the fallback dark tile in place if artwork fails to load.
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
    if (!clientWidth || !clientHeight) return; // parent not laid out yet — skip, ResizeObserver will fire again

    this.camera.aspect = clientWidth / clientHeight;
    // Pull the camera back on narrow/portrait viewports so the full sphere
    // stays framed instead of getting cropped or looking off-balance —
    // without this, a fixed camera distance tuned for desktop leaves very
    // little breathing room on a tall phone screen.
    this.camera.position.z = this._fitDistance();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  // Distance needed so a sphere of FIT_RADIUS stays fully inside the
  // camera's frustum in both dimensions, for the current aspect ratio.
  _fitDistance() {
    const fitRadius = RADIUS + TILE_SIZE; // account for tiles poking past the sphere surface
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const distanceForHeight = fitRadius / Math.sin(vFov / 2);
    const distanceForWidth = fitRadius / Math.sin(hFov / 2);
    return Math.max(distanceForHeight, distanceForWidth) * FIT_MARGIN;
  }

  _animate(time) {
    const dt = (time - this._lastTime) / 1000;
    this._lastTime = time;

    // Always spinning, even while dragging — a drag adds to this rather
    // than pausing it, so the globe never actually stops turning.
    this.scene.rotation.y += AUTO_ROTATE_SPEED * dt;

    if (!this.dragging) {
      // Oscillating tilt on top of the spin so tiles near the poles drift
      // into view too, not just the equatorial band. Paused only while
      // actively dragging, so a manual tilt isn't fought over.
      this.tiltPhase += AUTO_TILT_SPEED * dt;
      this.scene.rotation.x = Math.sin(this.tiltPhase) * MAX_TILT;
    }

    this._updateHover();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._animate);
  }

  dispose() {
    this._resizeObserver?.disconnect();
    this._clearTiles();
    this.renderer.dispose();
  }
}