import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier2d-compat";
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
function clean(pts) {
	const out = [];
	const EPS = 0.001;

	for (const p of pts) {
		const x = p[0],
			y = p[1];
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

		const last = out[out.length - 1];
		if (last) {
			const dx = last[0] - x;
			const dy = last[1] - y;
			if (dx * dx + dy * dy < EPS * EPS) continue;
		}

		out.push([x, y]);
	}

	return out;
}

(async () => {
	await RAPIER.init();

	const box = document.getElementById("box");
	const box2 = document.getElementById("box2");
	const stone1 = document.querySelector(".stone1");
	const stone2 = document.querySelector(".stone2");

	// ===== 物理ワールド =====
	const world = new RAPIER.World({ x: 0, y: -9.8 });

	// ===== 初期位置 =====
	const rect = box.getBoundingClientRect();
	const cx = rect.left + rect.width / 2;
	const cy = rect.top + rect.height / 2;
	const rect2 = box2.getBoundingClientRect();
	const cx2 = rect2.left + rect2.width / 2;
	const cy2 = rect2.top + rect2.height / 2;
	// stone1はSVGなので、中心を計算してからDOM座標に変換する必要がある
	const path = stone1.querySelector("path");
	const vb = stone1.viewBox.baseVal;
	const path2 = stone2.querySelector("path");
	const vb2 = stone2.viewBox.baseVal;

	// SVG内の中心

	// DOM座標へ変換
	const rect3 = stone1.getBoundingClientRect();

	const cx3 = window.innerWidth / 2;
	const cy3 = window.innerHeight / 2;

	const rawVerts = pathToVertices(path, 2, 120);

	// viewBox基準で正規化（中心ではなく原点固定）
	const verts = rawVerts.map(([x, y]) => [(x - vb.x - vb.width / 2) / SCALE, (y - vb.y - vb.height / 2) / SCALE]);
	// DOM座標へ変換
	const rect4 = stone2.getBoundingClientRect();

	const cx4 = window.innerWidth / 2;
	const cy4 = window.innerHeight / 2;

	const rawVerts2 = pathToVertices(path2, 2, 120);

	// viewBox基準で正規化（中心ではなく原点固定）
	const verts4 = rawVerts2.map(([x, y]) => [(x - vb2.x - vb2.width / 2) / SCALE, (y - vb2.y - vb2.height / 2) / SCALE]);

	// ===== 剛体 =====
	const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx), toPhysY(cy)).setLinearDamping(5).setAngularDamping(5).setCcdEnabled(true));
	const body2 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx2), toPhysY(cy2)).setLinearDamping(5).setAngularDamping(5).setCcdEnabled(true));
	const body3 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx3), toPhysY(cy3)).setLinearDamping(5).setAngularDamping(5).setCcdEnabled(true));
	const body4 = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(toPhysX(cx4), toPhysY(cy4)).setLinearDamping(5).setAngularDamping(5).setCcdEnabled(true));

	// ===== コライダー =====
	world.createCollider(RAPIER.ColliderDesc.cuboid(rect.width / 2 / SCALE, rect.height / 2 / SCALE), body);
	world.createCollider(RAPIER.ColliderDesc.cuboid(rect2.width / 2 / SCALE, rect2.height / 2 / SCALE), body2);
	// stone1
	const cleaned = clean(verts);
	const flat = cleaned.flat();

	const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(flat));

	if (hull) {
		hull.setDensity(1);
		world.createCollider(hull, body3);
	}

	// stone2
	const cleaned2 = clean(verts4);
	const flat2 = cleaned2.flat();

	const hull2 = RAPIER.ColliderDesc.convexHull(new Float32Array(flat2));

	if (hull2) {
		hull2.setDensity(1);
		world.createCollider(hull2, body4);
	}
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
	let dragging4 = false;
	box.addEventListener("mousedown", (e) => {
		dragging = true;
		body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	box2.addEventListener("mousedown", (e) => {
		dragging2 = true;
		body2.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	stone1.addEventListener("mousedown", (e) => {
		dragging3 = true;
		body3.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	stone2.addEventListener("mousedown", (e) => {
		dragging4 = true;
		body4.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased);
	});
	window.addEventListener("mousemove", (e) => {
		if (!dragging && !dragging2 && !dragging3 && !dragging4) return;

		const clamp = (val, min, max) => Math.max(min, Math.min(max, val)); // 画面外に出ないようにクランプ
		const x = clamp(e.clientX, 0, window.innerWidth);
		const y = clamp(e.clientY, 0, window.innerHeight);

		if (dragging) {
			body.setNextKinematicTranslation({
				x: toPhysX(x),
				y: toPhysY(y),
			});
		}
		if (dragging2) {
			body2.setNextKinematicTranslation({
				x: toPhysX(x),
				y: toPhysY(y),
			});
		}
		if (dragging3) {
			body3.setNextKinematicTranslation({
				x: toPhysX(x),
				y: toPhysY(y),
			});
		}
		if (dragging4) {
			body4.setNextKinematicTranslation({
				x: toPhysX(x),
				y: toPhysY(y),
			});
		}
	});

	window.addEventListener("mouseup", () => {
		if (!dragging && !dragging2 && !dragging3 && !dragging4) return;

		if (dragging) {
			dragging = false;
			body.setBodyType(RAPIER.RigidBodyType.Dynamic);
		}
		if (dragging2) {
			dragging2 = false;
			body2.setBodyType(RAPIER.RigidBodyType.Dynamic);
		}
		if (dragging3) {
			dragging3 = false;
			body3.setBodyType(RAPIER.RigidBodyType.Dynamic);
		}
		if (dragging4) {
			dragging4 = false;
			body4.setBodyType(RAPIER.RigidBodyType.Dynamic);
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

		// stone2
		const pos4 = body4.translation();
		const angle4 = body4.rotation();
		const x4 = toPixX(pos4.x);
		const y4 = toPixY(pos4.y);
		stone2.style.transform = `translate(${x4 - rect4.width / 2}px, ${y4 - rect4.height / 2}px) rotate(${-angle4}rad)`;

		requestAnimationFrame(loop);
	}
	loop();
})();
