import { state } from './state.js';
import { showEyedropperPreviewGlobal, hideEyedropperPreviewGlobal } from './drawing.js';

// manage instances per note
const strokeInstances = new Map();

export function setupStroke3D(container, id, data, notesRef) {
    const canvas = container.querySelector('.gstroke-canvas');
    if (!canvas) return;

    const width = container.offsetWidth || 360;
    const height = container.offsetHeight || 320;
    canvas.width = width;
    canvas.height = height;

    // scene + renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.05, 200);
    const cameraTarget = new THREE.Vector3(0, 0, 0);
    camera.position.set(5, 4, 5);
    camera.lookAt(cameraTarget);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(6, 8, 4);
    scene.add(dir);

    // ground plane
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshStandardMaterial({ color: 0x666666, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.25;
    ground.receiveShadow = false;
    scene.add(ground);

    // stroke container
    const strokesGroup = new THREE.Group();
    scene.add(strokesGroup);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let currentDrawPlane = null; // camera-facing plane
    let isDrawing = false;
    let isOrbiting = false;
    let currentStroke = null;
    let currentPreview = null;

    // stored brush strokes
    let strokesData = [];

    function loadFromData(serialized) {
        if (!serialized) return;
        try {
            const parsed = JSON.parse(serialized);
            strokesData = parsed.strokes || [];
            if (parsed.camera) {
                camera.position.set(parsed.camera.x, parsed.camera.y, parsed.camera.z);
                camera.lookAt(cameraTarget);
            }
            strokesData.forEach((s, idx) => addStrokeMesh(s, idx));
        } catch (err) {
            console.warn('stroke3d: failed to parse data', err);
        }
    }

    function saveData() {
        // save camera position
        notesRef.child(id).child('metadata').set({
            camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            timestamp: Date.now()
        });
        // periodically save full strokes as backup
        notesRef.child(id).child('strokesSnapshot').set({
            strokes: strokesData,
            timestamp: Date.now()
        });
    }

    function addStrokeMesh(stroke, idx) {
        if (!stroke?.points?.length) return;
        const pts = stroke.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const curve = new THREE.CatmullRomCurve3(pts);
        const segments = Math.max(8, pts.length * 3);
        const radius = Math.max(0.001, (stroke.size || 2) * 0.01);
        const geom = new THREE.TubeGeometry(curve, segments, radius, 6, false);
        const mat = new THREE.MeshStandardMaterial({
            color: stroke.color || '#000000',
            transparent: true,
            opacity: stroke.opacity ?? 1,
            roughness: 0.6,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData.isStroke = true;
        mesh.userData.strokeIndex = idx;
        strokesGroup.add(mesh);
    }

    function removeStrokeAtIndex(idx) {
        if (idx < 0 || idx >= strokesData.length) return;
        const target = strokesGroup.children.find(m => m.userData?.strokeIndex === idx);
        if (target) {
            strokesGroup.remove(target);
            target.geometry?.dispose();
            target.material?.dispose();
        }
        strokesData.splice(idx, 1);
        // remaining meshes
        strokesGroup.children.forEach(m => {
            if (m.userData?.isStroke && typeof m.userData.strokeIndex === 'number' && m.userData.strokeIndex > idx) {
                m.userData.strokeIndex -= 1;
            }
        });
    }

    function eraseAtPoint(point) {
        if (!point) return;
        const tool = state.toolSettings?.[state.drawingMode] || { size: 5 };
        const radius = Math.max(0.05, (tool.size || 5) * 0.02);
        const temp = new THREE.Vector3();
        let removed = false;
        strokesGroup.children.slice().forEach(mesh => {
            if (!mesh.userData?.isStroke || !mesh.geometry?.attributes?.position) return;
            const pos = mesh.geometry.attributes.position;
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            const sphere = mesh.geometry.boundingSphere;
            const worldCenter = temp.set(sphere.center.x, sphere.center.y, sphere.center.z);
            mesh.localToWorld(worldCenter);
            const worldRadius = sphere.radius * mesh.scale.length();
            if (worldCenter.distanceTo(point) > worldRadius + radius) return;
            let min = Infinity;
            const v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
                v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
                mesh.localToWorld(v);
                const d = v.distanceTo(point);
                if (d < min) min = d;
                if (min <= radius) break;
            }
            if (min <= radius && typeof mesh.userData.strokeIndex === 'number') {
                removeStrokeAtIndex(mesh.userData.strokeIndex);
                removed = true;
            }
        });
        if (removed) saveData();
    }

    function hitTest(event) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        // if draw plane is locked
        if (currentDrawPlane) {
            const targetPoint = new THREE.Vector3();
            const hit = raycaster.ray.intersectPlane(currentDrawPlane, targetPoint);
            if (hit) return targetPoint.clone();
        }
        // fallback
        const intersects = raycaster.intersectObjects([ground]);
        return intersects.length ? intersects[0].point.clone() : null;
    }

    function hitTestStrokeMesh(event) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const strokeMeshes = strokesGroup.children.filter(m => m.userData?.isStroke);
        const hits = raycaster.intersectObjects(strokeMeshes, true);
        return hits.length ? hits[0].point.clone() : null;
    }

    function beginStroke(ev) {
        const point = (state.drawingMode === 'eraser') ? (hitTestStrokeMesh(ev) || hitTest(ev)) : hitTest(ev);
        if (!point) {
            // lock plane perpendicular to camera
            const normal = camera.getWorldDirection(new THREE.Vector3()).clone();
            currentDrawPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, cameraTarget);
            const retry = hitTest(ev);
            if (!retry) return;
            currentDrawPlane = currentDrawPlane.clone();
            return beginStroke(ev); 
        }
        if (state.drawingMode === 'eraser') {
            isDrawing = false;
            isOrbiting = false;
            isErasing = true;
            eraseAtPoint(point);
            return;
        }
        const planeNormal = camera.getWorldDirection(new THREE.Vector3()).clone();
        currentDrawPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, point);
        const tool = state.toolSettings?.[state.drawingMode] || { size: 1, flow: 1, opacity: 1 };
        const color = state.brushColor || '#000000';
        const opacity = Math.max(0, Math.min(1, tool.opacity ?? 1));
        currentStroke = {
            points: [point.clone()],
            color,
            size: tool.size || 2,
            opacity
        };
        const geom = new THREE.BufferGeometry().setFromPoints([point.clone(), point.clone()]);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        currentPreview = new THREE.Line(geom, mat);
        currentPreview.userData.isPreview = true;
        strokesGroup.add(currentPreview);
        isDrawing = true;
    }

    function continueStroke(ev) {
        if (isErasing) {
            const point = hitTestStrokeMesh(ev) || hitTest(ev);
            if (point) eraseAtPoint(point);
            return;
        }
        if (!isDrawing || !currentStroke) return;
        const point = hitTest(ev);
        if (!point) return;
        const last = currentStroke.points[currentStroke.points.length - 1];
        if (last.distanceTo(point) < 0.01) return;
        currentStroke.points.push(point.clone());
        if (currentPreview?.geometry) {
            currentPreview.geometry.setFromPoints(currentStroke.points);
            currentPreview.geometry.attributes.position.needsUpdate = true;
        }
    }

    function endStroke() {
        if (isErasing) {
            isErasing = false;
            currentDrawPlane = null;
            return;
        }
        if (!isDrawing || !currentStroke) return;
        // remove preview
        if (currentPreview) {
            strokesGroup.remove(currentPreview);
            currentPreview.geometry.dispose();
            currentPreview.material.dispose();
            currentPreview = null;
        }
        strokesData.push({
            points: currentStroke.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
            color: currentStroke.color,
            size: currentStroke.size,
            opacity: currentStroke.opacity
        });
        addStrokeMesh(currentStroke, strokesData.length - 1);
        saveData();
        currentStroke = null;
        isDrawing = false;
        currentDrawPlane = null;
    }

    let orbiting = false;
    let isErasing = false;
    let orbitStart = { x: 0, y: 0 };
    function beginOrbit(ev) {
        orbiting = true;
        orbitStart = { x: ev.clientX, y: ev.clientY };
    }
    function continueOrbit(ev) {
        if (!orbiting) return;
        const dx = ev.clientX - orbitStart.x;
        const dy = ev.clientY - orbitStart.y;
        orbitStart = { x: ev.clientX, y: ev.clientY };
        const radius = camera.position.distanceTo(cameraTarget);
        const theta = Math.atan2(camera.position.z, camera.position.x);
        const phi = Math.atan2(Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2), camera.position.y);
        const newTheta = theta - dx * 0.005;
        const newPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.005));
        const x = radius * Math.sin(newPhi) * Math.cos(newTheta);
        const y = radius * Math.cos(newPhi);
        const z = radius * Math.sin(newPhi) * Math.sin(newTheta);
        camera.position.set(x, y, z);
        camera.lookAt(cameraTarget);
    }
    function endOrbit() { orbiting = false; }

    canvas.addEventListener('mousedown', (e) => {
        if (state.drawingMode === 'eyeDropper') {
            state.brushColor = '#888888';
            window.dispatchEvent(new CustomEvent('brushColorChange', { detail: '#888888' }));
            state.drawingMode = 'pen';
            document.body.style.cursor = '';
            hideEyedropperPreviewGlobal();
            window.dispatchEvent(new CustomEvent('eyedropperColorSelected'));
            e.preventDefault();
            return;
        }
        if (e.button === 2 || e.button === 1 || e.shiftKey) {
            beginOrbit(e);
            e.preventDefault();
            return;
        }
        beginStroke(e);
    });
    canvas.addEventListener('mousemove', (e) => {
        if (state.drawingMode === 'eyeDropper') {
            showEyedropperPreviewGlobal(e.clientX, e.clientY, '#888888');
            return;
        }
        hideEyedropperPreviewGlobal();
        if (orbiting) {
            continueOrbit(e);
        } else {
            continueStroke(e);
        }
    });
    canvas.addEventListener('mouseup', (e) => {
        if (orbiting) endOrbit();
        endStroke();
    });
    canvas.addEventListener('mouseleave', () => {
        endStroke();
        endOrbit();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch event support 
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (e.touches.length > 1) {
            beginOrbit(touch);
        } else {
            beginStroke(touch);
        }
        e.stopPropagation();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (orbiting) {
            continueOrbit(touch);
        } else {
            continueStroke(touch);
        }
        e.stopPropagation();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (orbiting) endOrbit();
        endStroke();
    }, { passive: false });

    canvas.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        if (orbiting) endOrbit();
        endStroke();
    }, { passive: false });

    // restore saved data
    loadFromData(data);

    // resize
    function handleResize() {
        const w = container.offsetWidth || width;
        const h = container.offsetHeight || height;
        canvas.width = w;
        canvas.height = h;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // listen for metadata updates (camera position)
    notesRef.child(id).child('metadata').on('value', (snapshot) => {
        const meta = snapshot.val();
        if (meta && meta.camera) {
            camera.position.set(meta.camera.x, meta.camera.y, meta.camera.z);
        }
    });

    // listen for strokes snapshot updates
    notesRef.child(id).child('strokesSnapshot').on('value', (snapshot) => {
        const snap = snapshot.val();
        if (snap && snap.strokes && Array.isArray(snap.strokes)) {
            // clear existing strokes and reload
            strokesGroup.children.slice().forEach(child => strokesGroup.remove(child));
            strokesData = snap.strokes;
            strokesData.forEach((stroke, idx) => addStrokeMesh(stroke, idx));
        }
    });

    let rafId;
    function loop() {
        rafId = requestAnimationFrame(loop);
        renderer.render(scene, camera);
    }
    loop();

    strokeInstances.set(id, {
        cleanup: () => {
            cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
            strokesGroup.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
            renderer.dispose();
            strokeInstances.delete(id);
        }
    });
}

export function cleanupStroke3D(id) {
    const inst = strokeInstances.get(id);
    if (inst) inst.cleanup();
}
