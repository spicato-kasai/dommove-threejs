import "pathseg";
import "./style.css";
import * as THREE from "three";
import { Engine, World, Bodies, Body, Svg, Common } from "matter-js";

const MAX_DPR = 1.5;

class ImageItem {
	constructor(domImage, scene, textureLoader) {
		this.domImage = domImage;
		this.mesh = null;
		this.scene = scene;
		this.textureLoader = textureLoader;
		this.body = null;
	}

	async load() {
		let texture;
		if (this.domImage.classList.contains("svg-image1-item")) {
			const svgText = new XMLSerializer().serializeToString(this.domImage);
			const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
			const svgUrl = URL.createObjectURL(svgBlob);

			try {
				texture = await new Promise((resolve, reject) => {
					this.textureLoader.load(svgUrl, resolve, undefined, reject);
				});
			} finally {
				URL.revokeObjectURL(svgUrl);
			}
		} else {
			texture = await new Promise((resolve, reject) => {
				this.textureLoader.load(this.domImage.currentSrc || this.domImage.src, resolve, undefined, reject);
			});
		}
		texture.colorSpace = THREE.SRGBColorSpace;

		// ライティングを考慮しないマテリアル
		const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
		const geometry = new THREE.PlaneGeometry(1, 1);
		this.mesh = new THREE.Mesh(geometry, material);
		this.scene.add(this.mesh);
	}

	sync(viewportWidth, canvasHeight) {
		if (!this.mesh) return;

		const rect = this.domImage.getBoundingClientRect();

		// 物理演算中は初期サイズを固定（回転時の外接矩形変化を無視）
		const w = this.body ? this.baseW : rect.width;
		const h = this.body ? this.baseH : rect.height;

		this.mesh.scale.set(w, h, 1);

		if (this.body) {
			this.mesh.position.set(this.body.position.x - viewportWidth / 2, canvasHeight / 2 - this.body.position.y, 0);
			this.mesh.rotation.z = -this.body.angle;
			return;
		}

		const centerX = rect.left + w / 2 - viewportWidth / 2;
		const centerY = canvasHeight / 2 - (rect.top + h / 2);
		this.mesh.position.set(centerX, centerY, 0);
	}
}

class ScrollSyncApp {
	constructor(layer, domImages) {
		this.layer = layer;

		this.scene = new THREE.Scene();
		// 平行投影を表現できるカメラです。このカメラには遠近感がないので、手前にある3Dオブジェクトも奥にある3Dオブジェクトも同じ大きさで表示されます。
		this.camera = new THREE.OrthographicCamera();
		this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.domElement.id = "webgl-canvas";
		this.layer.appendChild(this.renderer.domElement);

		const loader = new THREE.TextureLoader();
		this.items = domImages.map((img) => new ImageItem(img, this.scene, loader));

		this.viewportWidth = 0;
		this.viewportHeight = 0;
		this.canvasHeight = 0;

		this.render = this.render.bind(this);
		this.onResize = this.onResize.bind(this);

		// 現在掴んでいる要素
		this.dragging = null;
		this.startX = 0;
		this.startY = 0;
		this.baseX = 0;
		this.baseY = 0;

		// マウス操作
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onMouseDown = this.onMouseDown.bind(this);
		this.onMouseUp = this.onMouseUp.bind(this);
		this.onTouchStart = this.onTouchStart.bind(this);
		this.onTouchMove = this.onTouchMove.bind(this);
		this.onTouchEnd = this.onTouchEnd.bind(this);

		// Matter.jsの物理エンジンの初期化
		this.engine = Engine.create();
		this.engine.gravity.y = 1;
	}

	async init() {
		await Promise.all(this.items.map((item) => item.load()));
		window.addEventListener("resize", this.onResize, { passive: true });
		window.addEventListener("mousedown", this.onMouseDown);
		window.addEventListener("mousemove", this.onMouseMove);
		window.addEventListener("mouseup", this.onMouseUp);
		window.addEventListener("touchstart", this.onTouchStart, { passive: false });
		window.addEventListener("touchmove", this.onTouchMove, { passive: false });
		window.addEventListener("touchend", this.onTouchEnd);
		// 各画像にクリック可能スタイル
		this.items.forEach(({ domImage }) => {
			domImage.style.cursor = "pointer";
		});

		this.onResize();
		this.render();
	}
	onMouseDown(e) {
		const clicked = this.items.find(({ domImage }) => domImage === e.target || domImage.contains(e.target));
		if (!clicked) return;

		e.preventDefault(); // ドラッグ中のテキスト選択などを防止

		// ドラッグ開始時のマウス座標を記録
		this.startX = e.clientX;
		this.startY = e.clientY;

		// 現在のtransform値を取得（累積移動量を保持するため）
		const matrix = new DOMMatrix(window.getComputedStyle(clicked.domImage).transform);
		this.baseX = matrix.m41;
		this.baseY = matrix.m42;

		this.dragging = clicked.domImage;
		this.dragging.style.cursor = "grabbing";
	}

	onMouseUp() {
		if (!this.dragging) return;
		this.dragging.style.cursor = "pointer";
		this.dragging = null;
	}

	onMouseMove(e) {
		if (!this.dragging) return;

		const dx = e.clientX - this.startX;
		const dy = e.clientY - this.startY;

		const item = this.items.find(({ domImage }) => domImage === this.dragging);
		if (item?.body) {
			const tx = this.baseX + dx;
			const ty = this.baseY + dy;
			Body.setPosition(item.body, {
				x: item.baseCenterX + tx,
				y: item.baseCenterY + ty,
			});
			Body.setVelocity(item.body, { x: 0, y: 0 });
			return;
		}

		this.dragging.style.transform = `translate(${this.baseX + dx}px, ${this.baseY + dy}px)`;
	}

	onTouchMove(e) {
		if (!this.dragging) return;
		e.preventDefault();

		const touch = e.touches[0];
		const dx = touch.clientX - this.startX;
		const dy = touch.clientY - this.startY;

		const item = this.items.find(({ domImage }) => domImage === this.dragging);
		if (item?.body) {
			const tx = this.baseX + dx;
			const ty = this.baseY + dy;
			Body.setPosition(item.body, {
				x: item.baseCenterX + tx,
				y: item.baseCenterY + ty,
			});
			Body.setVelocity(item.body, { x: 0, y: 0 });
			return;
		}

		this.dragging.style.transform = `translate(${this.baseX + dx}px, ${this.baseY + dy}px)`;
	}

	onTouchStart(e) {
		const touch = e.touches[0];
		const target = document.elementFromPoint(touch.clientX, touch.clientY);
		const clicked = this.items.find(({ domImage }) => domImage === target || domImage.contains(target));
		if (!clicked) return;

		e.preventDefault(); // スクロールを抑制

		const matrix = new DOMMatrix(window.getComputedStyle(clicked.domImage).transform);
		this.baseX = matrix.m41;
		this.baseY = matrix.m42;
		this.startX = touch.clientX;
		this.startY = touch.clientY;
		this.dragging = clicked.domImage;
	}

	onTouchEnd() {
		this.dragging = null;
	}

	setupPhysics() {
		World.clear(this.engine.world, false);

		this.items.forEach((item) => {
			const rect = item.domImage.getBoundingClientRect();
			const w = Math.max(1, rect.width);
			const h = Math.max(1, rect.height);
			const x = rect.left + w / 2;
			const y = rect.top + h / 2;

			item.baseW = w;
			item.baseH = h;
			item.baseCenterX = x;
			item.baseCenterY = y;
			item.body = null;

			if (item.domImage.classList.contains("svg-image1-item")) {
				const path = item.domImage.querySelector("path");
				const vb = item.domImage.viewBox?.baseVal;

				if (path && vb && vb.width > 0 && vb.height > 0) {
					const sx = w / vb.width;
					const sy = h / vb.height;

					const verts = Svg.pathToVertices(path, 6).map((v) => ({
						x: v.x * sx,
						y: v.y * sy,
					}));

					if (verts.length >= 3) {
						const minX = Math.min(...verts.map((v) => v.x));
						const maxX = Math.max(...verts.map((v) => v.x));
						const minY = Math.min(...verts.map((v) => v.y));
						const maxY = Math.max(...verts.map((v) => v.y));
						const cx = (minX + maxX) / 2;
						const cy = (minY + maxY) / 2;

						const localVerts = verts.map((v) => ({ x: v.x - cx, y: v.y - cy }));

						item.body = Bodies.fromVertices(x, y, [localVerts], { restitution: 0.8, friction: 0.1, frictionAir: 0.01 }, true);
					}
				}
			}

			if (!item.body) {
				item.body = Bodies.rectangle(x, y, w, h, {
					restitution: 0.8,
					friction: 0.1,
					frictionAir: 0.01,
				});
			}

			World.add(this.engine.world, item.body);
		});

		const t = 120;
		const vw = this.viewportWidth;
		const vh = this.canvasHeight;
		World.add(this.engine.world, [
			Bodies.rectangle(vw / 2, -t / 2, vw + t * 2, t, { isStatic: true }),
			Bodies.rectangle(vw / 2, vh + t / 2, vw + t * 2, t, { isStatic: true }),
			Bodies.rectangle(-t / 2, vh / 2, t, vh + t * 2, { isStatic: true }),
			Bodies.rectangle(vw + t / 2, vh / 2, t, vh + t * 2, { isStatic: true }),
		]);
	}

	onResize() {
		this.viewportWidth = window.innerWidth;
		this.viewportHeight = window.innerHeight;
		this.canvasHeight = this.viewportHeight;

		this.layer.style.height = `${this.canvasHeight}px`;

		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
		this.renderer.setSize(this.viewportWidth, this.canvasHeight, false);

		this.camera.left = -this.viewportWidth / 2;
		this.camera.right = this.viewportWidth / 2;
		this.camera.top = this.canvasHeight / 2;
		this.camera.bottom = -this.canvasHeight / 2;
		this.camera.near = -1000;
		this.camera.far = 1000;
		this.camera.updateProjectionMatrix();
		// 物理エンジンの設定を更新
		this.setupPhysics();
	}

	syncDomFromBody(item) {
		if (!item.body) return;
		const dx = item.body.position.x - item.baseCenterX;
		const dy = item.body.position.y - item.baseCenterY;
		item.domImage.style.transform = `translate(${dx}px, ${dy}px) rotate(${item.body.angle}rad)`;
	}

	render() {
		// 物理エンジンを更新
		Engine.update(this.engine, 1000 / 60);

		this.items.forEach((item) => {
			item.sync(this.viewportWidth, this.canvasHeight);
			this.syncDomFromBody(item);
		});

		this.renderer.render(this.scene, this.camera);
		requestAnimationFrame(this.render);
	}
}

window.addEventListener("DOMContentLoaded", async () => {
	const layer = document.querySelector("#webgl-layer");
	const image1 = document.querySelector("#image1 img");
	const image2 = document.querySelector("#image2 img");
	const svg1 = document.querySelector(".svg-image1-item");
	const domImages = [];
	if (image1) domImages.push(image1);
	if (image2) domImages.push(image2);
	if (svg1) domImages.push(svg1);

	if (!layer || domImages.length === 0) return;

	const app = new ScrollSyncApp(layer, domImages);
	await app.init();
});
