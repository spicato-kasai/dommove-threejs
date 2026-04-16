import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier2d-compat";
import decomp from "poly-decomp";
const SCALE = 100;
const worldWidth = window.innerWidth / SCALE;
const worldHeight = window.innerHeight / SCALE;
const toPhysX = (x) => (x - window.innerWidth / 2) / SCALE;
const toPhysY = (y) => -(y - window.innerHeight / 2) / SCALE;
const toPixX = (x) => x * SCALE + window.innerWidth / 2;
const toPixY = (y) => -y * SCALE + window.innerHeight / 2;

// SVGパスをサンプリングして頂点配列を生成
function pathToVertices(pathEl, minStep = 6, maxPoints = 60) {
	const total = pathEl.getTotalLength();
	const step = Math.max(minStep, total / maxPoints);
	const verts = [];
	for (let i = 0; i <= total; i += step) {
		const pt = pathEl.getPointAtLength(i);
		verts.push([pt.x, pt.y]);
	}
	return verts;
}

(async () => {
	await RAPIER.init();

	const box = document.getElementById("box");
	const box2 = document.getElementById("box2");
	const stone1 = document.querySelector(".stone1");

	// ===== 物理ワールド =====
	const world = new RAPIER.World({ x: 0, y: -9.8 });

	// ===== 初期位置 =====
	const rect = box.getBoundingClientRect();
	const cx = rect.left + rect.width / 2;
	const cy = rect.top + rect.height / 2;
	const rect2 = box2.getBoundingClientRect();
	const cx2 = rect2.left + rect2.width / 2;
	const cy2 = rect2.top + rect2.height / 2;
	const rect3 = stone1.getBoundingClientRect();
	const cx3 = rect3.left + rect3.width / 2;
	const cy3 = rect3.top + rect3.height / 2;
	const path = stone1.querySelector("path");
	const vb = stone1.viewBox.baseVal;
	const sx = rect3.width / vb.width;
	const sy = rect3.height / vb.height;
	const rawVerts = pathToVertices(path, 6, 60);
	// SVG座標→物理座標へ変換
	const verts = rawVerts.map(([x, y]) => [((x - vb.x) * sx) / SCALE, ((y - vb.y) * sy) / SCALE]);

	// ===== 剛体 =====
	const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx), toPhysY(cy)).setLinearDamping(5).setAngularDamping(5).setCcdEnabled(true));
	const body2 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx2), toPhysY(cy2)).setLinearDamping(5).setAngularDamping(5).setCcdEnabled(true));
	const body3 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx3), toPhysY(cy3)).setLinearDamping(5).setAngularDamping(5).setCcdEnabled(true));

	// ===== コライダー =====
	world.createCollider(RAPIER.ColliderDesc.cuboid(rect.width / 2 / SCALE, rect.height / 2 / SCALE), body);
	world.createCollider(RAPIER.ColliderDesc.cuboid(rect2.width / 2 / SCALE, rect2.height / 2 / SCALE), body2);
	world.createCollider(RAPIER.ColliderDesc.cuboid(rect3.width / 2 / SCALE, rect3.height / 2 / SCALE), body3);

	// ===== 床 =====
	const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -worldHeight / 2));
	world.createCollider(RAPIER.ColliderDesc.cuboid(worldWidth, 0.2), floor);
	// ===== 左右の壁 =====
	const wallThickness = 0.2; // 薄い壁

	const leftWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-worldWidth / 2 - wallThickness, 0));
	world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight), leftWall);

	// 右壁
	const rightWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(worldWidth / 2 + wallThickness, 0));
	world.createCollider(RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight), rightWall);

	// ===== ドラッグ =====
	let dragging = false;
	let dragging2 = false;
	let dragging3 = false;
	box.addEventListener("mousedown", (e) => {
		dragging = true;
		body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	box2.addEventListener("mousedown", (e) => {
		dragging2 = true;
		body2.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	window.addEventListener("mousemove", (e) => {
		if (!dragging && !dragging2) return;

		if (dragging) {
			body.setNextKinematicTranslation({
				x: toPhysX(e.clientX),
				y: toPhysY(e.clientY),
			});
		}
		if (dragging2) {
			body2.setNextKinematicTranslation({
				x: toPhysX(e.clientX),
				y: toPhysY(e.clientY),
			});
		}
	});

	window.addEventListener("mouseup", () => {
		if (!dragging && !dragging2) return;

		if (dragging) {
			dragging = false;
			body.setBodyType(RAPIER.RigidBodyType.Dynamic);
		}
		if (dragging2) {
			dragging2 = false;
			body2.setBodyType(RAPIER.RigidBodyType.Dynamic);
		}
	});

	// ===== ループ =====
	function loop() {
		world.step();
		// 上昇中は少し加速させるここで重力を調整
		if (body.linvel().y < 0) {
			body.setGravityScale(1.5, true);
		} else {
			body.setGravityScale(1.8, true);
		}
		const pos = body.translation();
		const angle = body.rotation();

		const x = toPixX(pos.x);
		const y = toPixY(pos.y);

		box.style.transform = `translate(${x - rect.width / 2}px, ${y - rect.height / 2}px) rotate(${-angle}rad)`;

		// box2
		const pos2 = body2.translation();
		const angle2 = body2.rotation();
		const x2 = toPixX(pos2.x);
		const y2 = toPixY(pos2.y);
		box2.style.transform = `translate(${x2 - rect2.width / 2}px, ${y2 - rect2.height / 2}px) rotate(${-angle2}rad)`;
		box2.style.transform = `translate(${x2 - rect2.width / 2}px, ${y2 - rect2.height / 2}px) rotate(${-angle2}rad)`;

		// stone1
		const pos3 = body3.translation();
		const angle3 = body3.rotation();
		const x3 = toPixX(pos3.x);
		const y3 = toPixY(pos3.y);
		stone1.style.transform = `translate(${x3 - rect3.width / 2}px, ${y3 - rect3.height / 2}px) rotate(${-angle3}rad)`;

		requestAnimationFrame(loop);
	}
	loop();
})();
