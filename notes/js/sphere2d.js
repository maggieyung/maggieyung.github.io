import { state } from './state.js';
import { showEyedropperPreviewGlobal, hideEyedropperPreviewGlobal } from './drawing.js';

const sphereInstances = new Map();

function stripWhiteToAlpha(ctx, w, h, threshold = 250) {
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r >= threshold && g >= threshold && b >= threshold) data[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
}

export function setupSphere2D(container, id, data, notesRef) {
    const canvas = container.querySelector('.sphere2d-canvas');
    if (!canvas) return;

    const width = container.offsetWidth || 240;
    const height = container.offsetHeight || 240;
    canvas.width = width;
    canvas.height = height;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(5, 6, 4);
    scene.add(dir);

    // drawable texture for sphere
    const texSize = 1024;
    const drawCanvas = document.createElement('canvas');
    drawCanvas.width = texSize;
    drawCanvas.height = texSize;
    const drawCtx = drawCanvas.getContext('2d');

    let baseColor = '#ffffff';

    const texture = new THREE.CanvasTexture(drawCanvas);
    texture.anisotropy = 8;
    texture.needsUpdate = true;

    const geometry = new THREE.SphereGeometry(1.2, 96, 64);
    const overlayGeometry = geometry.clone();
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: baseColor,
        metalness: 0.1,
        roughness: 0.35,
        envMapIntensity: 0.4
    });
    const inkMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        color: '#ffffff',
        metalness: 0.1,
        roughness: 0.35,
        envMapIntensity: 0.4,
        transparent: true,
        depthWrite: false
    });
    const baseSphere = new THREE.Mesh(geometry, baseMaterial);
    const sphere = new THREE.Mesh(overlayGeometry, inkMaterial);
    sphere.scale.setScalar(1.0005);
    scene.add(baseSphere);
    scene.add(sphere);

    // restore rotation and drawing
    if (data) {
        try {
            const parsed = JSON.parse(data);
                if (parsed.baseColor) {
                    baseColor = parsed.baseColor;
                    baseMaterial.color.set(baseColor);
                }
                if (parsed.rotation) {
                sphere.rotation.x = parsed.rotation.x || 0;
                sphere.rotation.y = parsed.rotation.y || 0;
                sphere.rotation.z = parsed.rotation.z || 0;
                baseSphere.rotation.copy(sphere.rotation);
            }
            if (parsed.drawing) {
                const img = new Image();
                img.onload = () => {
                    drawCtx.drawImage(img, 0, 0, texSize, texSize);
                    stripWhiteToAlpha(drawCtx, texSize, texSize);
                    texture.needsUpdate = true;
                };
                img.src = parsed.drawing;
            }
        } catch (err) {
            console.warn(err);
        }
    } else {
        sphere.rotation.y = Math.PI / 6;
        baseSphere.rotation.copy(sphere.rotation);
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isRotating = false;
    let isDrawing = false;
    let prev = { x: 0, y: 0 };
    let lastUV = null;

    function save() {
        // save data
        notesRef.child(id).child('metadata').set({
            rotation: { x: sphere.rotation.x, y: sphere.rotation.y, z: sphere.rotation.z },
            baseColor,
            timestamp: Date.now()
        });
        // periodically save full drawing snapshot
        const snapshot = {
            drawing: drawCanvas.toDataURL(),
            timestamp: Date.now()
        };
        notesRef.child(id).child('drawingSnapshot').set(snapshot);
    }

    function castToSphere(e) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hit = raycaster.intersectObject(sphere);
        return hit.length ? hit[0] : null;
    }

    function drawAt(uv, isStart) {
        if (!uv) return;
        const tool = state.toolSettings?.[state.drawingMode] || { size: 2, flow: 1, opacity: 1 };
        const isEraser = state.drawingMode === 'eraser';
        const color = isEraser ? 'rgba(0,0,0,1)' : (state.brushColor || '#000000');
        const alpha = Math.max(0, Math.min(1, tool.flow * tool.opacity));
        const x = uv.x * texSize;
        const y = (1 - uv.y) * texSize; // flip v
        drawCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        drawCtx.lineWidth = tool.size;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.globalAlpha = alpha;
        drawCtx.strokeStyle = color;
        drawCtx.fillStyle = color;

        if (isStart || !lastUV) {
            drawCtx.beginPath();
            drawCtx.arc(x, y, tool.size / 2, 0, Math.PI * 2);
            drawCtx.fill();
        } else {
            const lx = lastUV.x * texSize;
            const ly = (1 - lastUV.y) * texSize;
            drawCtx.beginPath();
            drawCtx.moveTo(lx, ly);
            drawCtx.lineTo(x, y);
            drawCtx.stroke();
        }
        texture.needsUpdate = true;
    }

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (state.drawingMode === 'eyeDropper') {
            const hit = castToSphere(e);
            if (hit && baseSphere.material.color) {
                const colorHex = '#' + baseSphere.material.color.getHexString();
                state.brushColor = colorHex;
                window.dispatchEvent(new CustomEvent('brushColorChange', { detail: colorHex }));
                state.drawingMode = 'pen';
                document.body.style.cursor = '';
                hideEyedropperPreviewGlobal();
                window.dispatchEvent(new CustomEvent('eyedropperColorSelected'));
            }
            e.stopPropagation();
            return;
        }
        const hit = castToSphere(e);
        if (e.shiftKey || !hit) {
            isRotating = true;
            prev = { x: e.clientX, y: e.clientY };
        } else {
            isDrawing = true;
            lastUV = hit.uv;
            drawAt(hit.uv, true);
        }
        e.stopPropagation();
    });

    window.addEventListener('mouseup', () => {
        if (isRotating || isDrawing) save();
        isRotating = false;
        isDrawing = false;
        lastUV = null;
    });

    window.addEventListener('mousemove', (e) => {
        if (state.drawingMode === 'eyeDropper') {
            const hit = castToSphere(e);
            if (hit && baseSphere.material.color) {
                const colorHex = '#' + baseSphere.material.color.getHexString();
                showEyedropperPreviewGlobal(e.clientX, e.clientY, colorHex);
            }
            return;
        }
        hideEyedropperPreviewGlobal();
        if (isRotating) {
            const dx = e.clientX - prev.x;
            const dy = e.clientY - prev.y;
            prev = { x: e.clientX, y: e.clientY };
            const speed = 0.01;
            sphere.rotation.y += dx * speed;
            sphere.rotation.x += dy * speed;
            baseSphere.rotation.copy(sphere.rotation);
        } else if (isDrawing) {
            const hit = castToSphere(e);
            if (hit) {
                drawAt(hit.uv, false);
                lastUV = hit.uv;
            }
        }
    });

    // touch event support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const hit = castToSphere(touch);
        if (e.touches.length > 1 || !hit) {
            isRotating = true;
            prev = { x: touch.clientX, y: touch.clientY };
        } else {
            isDrawing = true;
            lastUV = hit.uv;
            drawAt(hit.uv, true);
        }
        e.stopPropagation();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (isRotating) {
            const dx = touch.clientX - prev.x;
            const dy = touch.clientY - prev.y;
            prev = { x: touch.clientX, y: touch.clientY };
            const speed = 0.01;
            sphere.rotation.y += dx * speed;
            sphere.rotation.x += dy * speed;
            baseSphere.rotation.copy(sphere.rotation);
        } else if (isDrawing) {
            const hit = castToSphere(touch);
            if (hit) {
                drawAt(hit.uv, false);
                lastUV = hit.uv;
            }
        }
        e.stopPropagation();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (isRotating || isDrawing) save();
        isRotating = false;
        isDrawing = false;
        lastUV = null;
    }, { passive: false });

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

    let raf;
    function loop() {
        raf = requestAnimationFrame(loop);
        renderer.render(scene, camera);
    }
    loop();

    // listen for updates
    notesRef.child(id).child('metadata').on('value', (snapshot) => {
        const meta = snapshot.val();
        if (meta) {
            if (meta.rotation) {
                sphere.rotation.x = meta.rotation.x || 0;
                sphere.rotation.y = meta.rotation.y || 0;
                sphere.rotation.z = meta.rotation.z || 0;
                baseSphere.rotation.copy(sphere.rotation);
            }
            if (meta.baseColor && meta.baseColor !== baseColor) {
                baseColor = meta.baseColor;
                baseMaterial.color.set(baseColor);
            }
        }
    });

    // listen for snapshot updates
    notesRef.child(id).child('drawingSnapshot').on('value', (snapshot) => {
        const snap = snapshot.val();
        if (snap && snap.drawing) {
            const img = new Image();
            img.onload = () => {
                drawCtx.drawImage(img, 0, 0, texSize, texSize);
                stripWhiteToAlpha(drawCtx, texSize, texSize);
                texture.needsUpdate = true;
            };
            img.src = snap.drawing;
        }
    });

    sphereInstances.set(id, {
            setBaseColor: (colorHex) => {
                baseColor = colorHex;
                baseMaterial.color.set(colorHex);
                save();
            },
        cleanup: () => {
            cancelAnimationFrame(raf);
            resizeObserver.disconnect();
            geometry.dispose();
            overlayGeometry.dispose();
            baseMaterial.dispose();
            inkMaterial.dispose();
            texture.dispose();
            renderer.dispose();
            sphereInstances.delete(id);
        }
    });
}
export function setSphereBaseColor(id, colorHex) {
    const inst = sphereInstances.get(id);
    if (inst && inst.setBaseColor) inst.setBaseColor(colorHex);
}

export function cleanupSphere2D(id) {
    const inst = sphereInstances.get(id);
    if (inst) inst.cleanup();
}
