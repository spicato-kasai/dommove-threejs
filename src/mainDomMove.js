import "./style.css";
import * as THREE from "three";

const MAX_DPR = 1.5;

class ImageItem {
	constructor(domImage, scene, textureLoader) {
		this.domImage = domImage;
		this.mesh = null;
		this.scene = scene;
		this.textureLoader = textureLoader;
	}

	async load() {
		// 画像をテクスチャとして読み込む
		const texture = await new Promise((resolve, reject) => {
			this.textureLoader.load(this.domImage.currentSrc || this.domImage.src, resolve, undefined, reject);
		});
		texture.colorSpace = THREE.SRGBColorSpace;

		// ライティングを考慮しないマテリアル
		const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
		const geometry = new THREE.PlaneGeometry(1, 1);
		this.mesh = new THREE.Mesh(geometry, material);
		this.scene.add(this.mesh);
	}

	sync(viewportWidth, canvasHeight) {
		if (!this.mesh) return;

		// getBoundingClientRectで要素の寸法と、そのビューポートに対する相対位置に関する情報を DOMRect オブジェクトで返します。
		const rect = this.domImage.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;

		// 大きさを渡す
		this.mesh.scale.set(w, h, 1);

		// 位置を渡す
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
		const clicked = this.items.find(({ domImage }) => domImage === e.target);
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
		this.dragging.style.transform = `translate(${this.baseX + dx}px, ${this.baseY + dy}px)`;
	}

	onTouchMove(e) {
		if (!this.dragging) return;
		e.preventDefault();

		const touch = e.touches[0];
		const dx = touch.clientX - this.startX;
		const dy = touch.clientY - this.startY;
		this.dragging.style.transform = `translate(${this.baseX + dx}px, ${this.baseY + dy}px)`;
	}

	onTouchStart(e) {
		const touch = e.touches[0];
		// タッチした座標にある要素を取得
		const target = document.elementFromPoint(touch.clientX, touch.clientY);
		const clicked = this.items.find(({ domImage }) => domImage === target);
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
	}

	render() {
		this.items.forEach((item) => item.sync(this.viewportWidth, this.canvasHeight));
		this.renderer.render(this.scene, this.camera);
		requestAnimationFrame(this.render);
	}
}

window.addEventListener("DOMContentLoaded", async () => {
	const layer = document.querySelector("#webgl-layer");
	const image1 = document.querySelector("#image1 img");
	const image2 = document.querySelector("#image2 img");
	const domImages = [];
	if (image1) domImages.push(image1);
	if (image2) domImages.push(image2);

	if (!layer || domImages.length === 0) return;

	const app = new ScrollSyncApp(layer, domImages);
	await app.init();
});
