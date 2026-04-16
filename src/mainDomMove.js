class ImageItem {
	constructor(domImage) {
		this.domImage = domImage;
	}
}

class ScrollSyncApp {
	constructor(domImages) {
		this.items = domImages.map((img) => new ImageItem(img));
		this.dragging = null;
		this.startX = 0;
		this.startY = 0;
		this.baseX = 0;
		this.baseY = 0;
		this._hasMoved = false;
		this.rotationMap = new WeakMap();

		this.onMouseDown = this.onMouseDown.bind(this);
		this.onMouseMove = this.onMouseMove.bind(this);
		this.onMouseUp = this.onMouseUp.bind(this);
		this.onTouchStart = this.onTouchStart.bind(this);
		this.onTouchMove = this.onTouchMove.bind(this);
		this.onTouchEnd = this.onTouchEnd.bind(this);
	}

	init() {
		this.items.forEach(({ domImage }) => {
			domImage.style.cursor = "pointer";
			domImage.style.position = "absolute";
			this.rotationMap.set(domImage, 0);
		});

		window.addEventListener("mousedown", this.onMouseDown);
		window.addEventListener("mousemove", this.onMouseMove);
		window.addEventListener("mouseup", this.onMouseUp);
		window.addEventListener("touchstart", this.onTouchStart, { passive: false });
		window.addEventListener("touchmove", this.onTouchMove, { passive: false });
		window.addEventListener("touchend", this.onTouchEnd);
	}

	_getTranslate(domImage) {
		const matrix = new DOMMatrix(window.getComputedStyle(domImage).transform);
		return { x: matrix.m41, y: matrix.m42 };
	}

	_applyTransform(domImage, x, y, rot) {
		domImage.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
	}

	onMouseDown(e) {
		const clicked = this.items.find(({ domImage }) => domImage === e.target || domImage.contains(e.target));
		if (!clicked) return;
		e.preventDefault();
		this.startX = e.clientX;
		this.startY = e.clientY;
		this._hasMoved = false;
		const { x, y } = this._getTranslate(clicked.domImage);
		this.baseX = x;
		this.baseY = y;
		this.dragging = clicked.domImage;
		this.dragging.style.cursor = "grabbing";
	}

	onMouseMove(e) {
		if (!this.dragging) return;
		const dx = e.clientX - this.startX;
		const dy = e.clientY - this.startY;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._hasMoved = true;
		if (!this._hasMoved) return;
		const rot = this.rotationMap.get(this.dragging) ?? 0;
		this._applyTransform(this.dragging, this.baseX + dx, this.baseY + dy, rot);
	}

	onMouseUp() {
		if (!this.dragging) return;
		if (!this._hasMoved) {
			const rot = ((this.rotationMap.get(this.dragging) ?? 0) + 45) % 360;
			this.rotationMap.set(this.dragging, rot);
			this._applyTransform(this.dragging, this.baseX, this.baseY, rot);
		}
		this.dragging.style.cursor = "pointer";
		this.dragging = null;
	}

	onTouchStart(e) {
		const touch = e.touches[0];
		const target = document.elementFromPoint(touch.clientX, touch.clientY);
		const clicked = this.items.find(({ domImage }) => domImage === target || domImage.contains(target));
		if (!clicked) return;
		e.preventDefault();
		const { x, y } = this._getTranslate(clicked.domImage);
		this.baseX = x;
		this.baseY = y;
		this.startX = touch.clientX;
		this.startY = touch.clientY;
		this.dragging = clicked.domImage;
		this._hasMoved = false;
	}

	onTouchMove(e) {
		if (!this.dragging) return;
		e.preventDefault();
		const touch = e.touches[0];
		const dx = touch.clientX - this.startX;
		const dy = touch.clientY - this.startY;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._hasMoved = true;
		if (!this._hasMoved) return;
		const rot = this.rotationMap.get(this.dragging) ?? 0;
		this._applyTransform(this.dragging, this.baseX + dx, this.baseY + dy, rot);
	}

	onTouchEnd() {
		if (!this.dragging) return;
		if (!this._hasMoved) {
			const rot = ((this.rotationMap.get(this.dragging) ?? 0) + 45) % 360;
			this.rotationMap.set(this.dragging, rot);
			this._applyTransform(this.dragging, this.baseX, this.baseY, rot);
		}
		this.dragging = null;
	}
}

window.addEventListener("DOMContentLoaded", () => {
	const image1 = document.querySelector("#image1 img");
	const image2 = document.querySelector("#image2 img");
	const svg1 = document.querySelector(".svg-image1-item");
	const domImages = [image1, image2, svg1].filter(Boolean);

	if (domImages.length === 0) return;

	const app = new ScrollSyncApp(domImages);
	app.init();
});
