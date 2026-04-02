import "./style.css";
import * as THREE from "three";

// 必要なモジュールを読み込み
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

window.addEventListener(
	"DOMContentLoaded",
	async () => {
		const wrapper = document.querySelector("#game");
		const app = new ThreeApp(wrapper);
		await app.load();
		app.init();
		app.render();
	},
	false,
);

class ThreeApp {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0xfffff0);
		this.camera = new THREE.PerspectiveCamera(45, wrapper.clientWidth / wrapper.clientHeight, 0.1, 1000);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
		wrapper.appendChild(this.renderer.domElement);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.camera.position.set(1, 0, 5);
	}

	async load() {
		// 追加のリソース読み込みがあればここに
	}

	init() {
		const geometry = new THREE.TorusGeometry(1, 0.4, 16, 100);
		const material = new THREE.MeshBasicMaterial({ color: 0x2194ce });
		const sphere = new THREE.Mesh(geometry, material);
		this.scene.add(sphere);
	}

	render() {
		this.renderer.render(this.scene, this.camera);
		this.controls.update();
		requestAnimationFrame(this.render.bind(this));
	}
}
