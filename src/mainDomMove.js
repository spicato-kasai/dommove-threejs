import "./style.css";
import * as THREE from "three";
import photoUrl from "./calender_image.jpg";

const MAX_DPR = 1.5;

// JPGをbase64に変換するユーティリティ
async function toBase64(url) {
	const res = await fetch(url);
	const blob = await res.blob();
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.readAsDataURL(blob);
	});
}

class ImageItem {
	constructor(domImage, scene, textureLoader) {
		this.domImage = domImage;
		this.mesh = null;
		this.scene = scene;
		this.textureLoader = textureLoader;
		this.isSvg = domImage instanceof SVGSVGElement || domImage.namespaceURI === "http://www.w3.org/2000/svg";
	}

	async load() {
		let texture;
		const isTargetSvg = this.isSvg && this.domImage.classList.contains("svg-image1-item");

		if (isTargetSvg) {
			// 写真をbase64に変換してSVGのpatternとして埋め込む
			const base64Url = await toBase64(photoUrl);

			const svgClone = this.domImage.cloneNode(true);
			const svgNS = "http://www.w3.org/2000/svg";

			const vb = svgClone.viewBox?.baseVal;
			const svgW = vb && vb.width ? vb.width : svgClone.width?.baseVal?.value || this.domImage.clientWidth;
			const svgH = vb && vb.height ? vb.height : svgClone.height?.baseVal?.value || this.domImage.clientHeight;

			const defs = document.createElementNS(svgNS, "defs");
			const pattern = document.createElementNS(svgNS, "pattern");
			pattern.setAttribute("id", "photoPattern");
			pattern.setAttribute("patternUnits", "userSpaceOnUse");
			pattern.setAttribute("width", String(svgW));
			pattern.setAttribute("height", String(svgH));

			const image = document.createElementNS(svgNS, "image");
			image.setAttribute("href", base64Url);
			image.setAttribute("x", "0");
			image.setAttribute("y", "0");
			image.setAttribute("width", String(svgW));
			image.setAttribute("height", String(svgH));
			image.setAttribute("preserveAspectRatio", "xMidYMid meet");

			pattern.appendChild(image);
			defs.appendChild(pattern);
			svgClone.insertBefore(defs, svgClone.firstChild);

			const path = svgClone.querySelector("path");
			if (path) path.setAttribute("fill", "url(#photoPattern)");

			const svgText = new XMLSerializer().serializeToString(svgClone);
			const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
			const svgUrl = URL.createObjectURL(svgBlob);

			try {
				texture = await new Promise((resolve, reject) => {
					this.textureLoader.load(svgUrl, resolve, undefined, reject);
				});
			} finally {
				URL.revokeObjectURL(svgUrl);
			}
		} else if (this.isSvg) {
			// 通常SVG（写真なし）
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

		// getBoundingClientRectは回転後のAABBを返すので
		// 回転なしの本来のサイズはclientWidth/clientHeightから取る
		const w = this.domImage.clientWidth;
		const h = this.domImage.clientHeight;

		this.mesh.scale.set(w, h, 1);

		// rectの中心はAABBの中心 = 回転後も正しい中心座標
		const centerX = rect.left + rect.width / 2 - viewportWidth / 2;
		const centerY = canvasHeight / 2 - (rect.top + rect.height / 2);
		this.mesh.position.set(centerX, centerY, 0);

		// DOMのtransformから回転角度を取り出す
		const matrix = new DOMMatrix(window.getComputedStyle(this.domImage).transform);
		this.mesh.rotation.z = Math.atan2(matrix.m21, matrix.m11);
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

		// 物理演算用の境界メッシュ（床 + 左右壁）
		this.floorMesh = null;
		this.leftWallMesh = null;
		this.rightWallMesh = null;

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

		// 角度管理
		this.rotationMap = new WeakMap();
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
			this.rotationMap.set(domImage, 0); // 初期角度は0度
		});

		this.onResize();
		this.render();
	}
	onMouseDown(e) {
		const clicked = this.items.find(({ domImage }) => domImage === e.target || domImage.contains(e.target));
		if (!clicked) return;
		e.preventDefault();
		this.startX = e.clientX;
		this.startY = e.clientY;
		this._hasMoved = false; // ← 追加
		const matrix = new DOMMatrix(window.getComputedStyle(clicked.domImage).transform);
		this.baseX = matrix.m41;
		this.baseY = matrix.m42;
		this.dragging = clicked.domImage;
		this.dragging.style.cursor = "grabbing";
	}

	onMouseUp() {
		if (!this.dragging) return;
		if (!this._hasMoved) {
			const rot = ((this.rotationMap.get(this.dragging) ?? 0) + 45) % 360; // クリックだけで45度回転させる。360度まわれば0度に戻る。
			this.rotationMap.set(this.dragging, rot);
			this.dragging.style.transform = `translate(${this.baseX}px, ${this.baseY}px) rotate(${rot}deg)`;
		}
		this.dragging.style.cursor = "pointer";
		this.dragging = null;
	}

	onMouseMove(e) {
		if (!this.dragging) return;
		const dx = e.clientX - this.startX;
		const dy = e.clientY - this.startY;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._hasMoved = true;
		if (!this._hasMoved) return;
		const rot = this.rotationMap.get(this.dragging) ?? 0;
		this.dragging.style.transform = `translate(${this.baseX + dx}px, ${this.baseY + dy}px) rotate(${rot}deg)`;
	}

	onTouchMove(e) {
		if (!this.dragging) return;
		e.preventDefault();

		const touch = e.touches[0];
		const dx = touch.clientX - this.startX;
		const dy = touch.clientY - this.startY;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._hasMoved = true;
		if (!this._hasMoved) return; // ← 追加
		const rot = this.rotationMap.get(this.dragging) ?? 0; // ← 追加
		this.dragging.style.transform = `translate(${this.baseX + dx}px, ${this.baseY + dy}px) rotate(${rot}deg)`;
	}

	onTouchStart(e) {
		const touch = e.touches[0];
		// タッチした座標にある要素を取得
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

		this._hasMoved = false;
	}

	onTouchEnd() {
		if (!this.dragging) return;
		if (!this._hasMoved) {
			const rot = ((this.rotationMap.get(this.dragging) ?? 0) + 45) % 360;
			this.rotationMap.set(this.dragging, rot);
			this.dragging.style.transform = `translate(${this.baseX}px, ${this.baseY}px) rotate(${rot}deg)`;
		}
		this.dragging = null;
	}

	onResize() {
		this.viewportWidth = window.innerWidth;
		this.viewportHeight = window.innerHeight;
		this.canvasHeight = this.viewportHeight;

		this.camera.near = -1000;
		this.camera.far = 1000;
		this.camera.updateProjectionMatrix();

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
	const svg1 = document.querySelector(".svg-image1-item");
	const domImages = [];
	if (image1) domImages.push(image1);
	if (image2) domImages.push(image2);
	if (svg1) domImages.push(svg1);

	if (!layer || domImages.length === 0) return;

	const app = new ScrollSyncApp(layer, domImages);
	await app.init();
});
