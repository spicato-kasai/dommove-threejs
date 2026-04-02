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
		this.offsetX = 0;
		this.offsetY = 0;

		// マウス操作
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onMouseClick = this.onMouseClick.bind(this);
	}

	async init() {
		await Promise.all(this.items.map((item) => item.load()));
		window.addEventListener("resize", this.onResize, { passive: true });
		window.addEventListener("mousemove", this.onMouseMove);
		window.addEventListener("click", this.onMouseClick);

		// 各画像にクリック可能スタイル
		this.items.forEach(({ domImage }) => {
			domImage.style.cursor = "pointer";
		});

		this.onResize();
		this.render();
	}
	onMouseClick(e) {
		if (this.dragging) {
			// 2回目のクリック → 置く
			this.dragging.style.cursor = "pointer";
			this.dragging = null;
			return;
		}

		// クリックした要素が画像かチェック
		const clicked = this.items.find(({ domImage }) => domImage === e.target);
		if (!clicked) return;

		const rect = clicked.domImage.getBoundingClientRect();
		// fixed化する前にサイズを固定
		clicked.domImage.style.width = `${rect.width}px`;
		clicked.domImage.style.height = `${rect.height}px`;
		this.offsetX = e.clientX - rect.left;
		this.offsetY = e.clientY - rect.top;
		this.dragging = clicked.domImage;
		this.dragging.style.cursor = "grabbing";
	}

	onMouseMove(e) {
		if (!this.dragging) return;

		const x = e.clientX - this.offsetX;
		const y = e.clientY - this.offsetY;
		this.dragging.style.position = "fixed";
		this.dragging.style.left = `${x}px`;
		this.dragging.style.top = `${y}px`;
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
