import { state } from './state.js';
import { showEyedropperPreviewGlobal, hideEyedropperPreviewGlobal } from './drawing.js';

function stripWhiteToAlpha(ctx, w, h, threshold = 250) {
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r >= threshold && g >= threshold && b >= threshold) {
            data[i + 3] = 0;
        }
    }
    ctx.putImageData(img, 0, 0);
}

// store cube instances by note ID
const cubeInstances = new Map();

export function setupCubeCanvas(container, id, data, notesRef) {
    const canvas = container.querySelector('.cube-canvas');
    if (!canvas) return;

    const width = container.offsetWidth || 300;
    const height = container.offsetHeight || 300;
    
    canvas.width = width;
    canvas.height = height;

    // create three.js scene
    const scene = new THREE.Scene();

    // camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 3;

    // renderer
    const renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,
        alpha: true
    });
    renderer.setClearColor(0x000000, 0); 
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // base color
    let baseColor = '#ffffffff';

    // create 6 separate drawing canvases for each face
    const textureSize = 512;
    const faceCanvases = [];
    const faceTextures = [];
    const faceMaterials = [];
    
    for (let i = 0; i < 6; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = textureSize;
        canvas.height = textureSize;
        const ctx = canvas.getContext('2d');
        faceCanvases.push({ canvas, ctx });
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        faceTextures.push(texture);
        
        const material = new THREE.MeshPhongMaterial({ 
            map: texture,
            shininess: 30,
            specular: 0x222222,
            color: '#ffffff',
            transparent: true,
            depthWrite: false
        });
        faceMaterials.push(material);
    }

    // create cube with solid base and overlay for ink
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const overlayGeometry = geometry.clone();
    const baseMaterial = new THREE.MeshPhongMaterial({ color: baseColor, shininess: 30, specular: 0x222222 });
    const baseCube = new THREE.Mesh(geometry, baseMaterial);
    baseCube.rotation.z = Math.PI / 6; // 30 degrees
    scene.add(baseCube);

    const cube = new THREE.Mesh(overlayGeometry, faceMaterials);
    cube.rotation.copy(baseCube.rotation);
    cube.scale.setScalar(1.001); // slight offset to avoid z-fighting
    scene.add(cube);

    // lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // restore rotation and drawings from data if available
    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.baseColor) {
                baseColor = parsed.baseColor;
                baseMaterial.color.set(baseColor);
            }
            if (parsed.rotation) {
                baseCube.rotation.x = parsed.rotation.x || 0;
                baseCube.rotation.y = parsed.rotation.y || 0;
                baseCube.rotation.z = parsed.rotation.z || 0;
                cube.rotation.copy(baseCube.rotation);
            }
            if (parsed.faceDrawings) {
                parsed.faceDrawings.forEach((dataUrl, index) => {
                    if (dataUrl && faceCanvases[index]) {
                        const img = new Image();
                        img.onload = () => {
                            faceCanvases[index].ctx.drawImage(img, 0, 0);
                            stripWhiteToAlpha(faceCanvases[index].ctx, textureSize, textureSize);
                            faceTextures[index].needsUpdate = true;
                        };
                        img.src = dataUrl;
                    }
                });
            }
        } catch (e) {
            console.log('no saved data');
        }
    }

    // raycaster for detecting cube face clicks
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // interaction state
    let isDragging = false;
    let isDrawing = false;
    let previousMousePosition = { x: 0, y: 0 };
    let lastUV = null;
    let currentFaceIndex = -1;

    // mouse events for rotation and drawing
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // left click
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(cube);
            
            if (state.drawingMode === 'eyeDropper') {
                if (intersects.length > 0) {
                    const faceIndex = intersects[0].face.materialIndex;
                    const uv = intersects[0].uv;
                    
                    let colorHex = '#' + baseCube.material.color.getHexString();
                    if (faceCanvases[faceIndex]) {
                        const faceCanvas = faceCanvases[faceIndex].canvas;
                        const ctx = faceCanvases[faceIndex].ctx;
                        const x = Math.floor(uv.x * faceCanvas.width);
                        const y = Math.floor((1 - uv.y) * faceCanvas.height);
                        try {
                            const imageData = ctx.getImageData(x, y, 1, 1);
                            const data = imageData.data;
                            if (data[3] > 0) {
                                colorHex = '#' + [data[0], data[1], data[2]].map(x => x.toString(16).padStart(2, '0')).join('');
                            }
                        } catch (err) {
                        }
                    }
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
            
            // Shift+drag = rotate, normal drag = draw
            if (e.shiftKey) {
                isDragging = true;
                previousMousePosition = { x: e.clientX, y: e.clientY };
            } else if (intersects.length > 0) {
                isDrawing = true;
                currentFaceIndex = intersects[0].face.materialIndex;
                const uv = intersects[0].uv;
                lastUV = uv;
                drawOnTexture(uv.x, uv.y, currentFaceIndex, true);
            } else {
                isDragging = true;
                previousMousePosition = { x: e.clientX, y: e.clientY };
            }
            e.stopPropagation();
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (state.drawingMode === 'eyeDropper') {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(cube);
            if (intersects.length > 0) {
                const faceIndex = intersects[0].face.materialIndex;
                const uv = intersects[0].uv;
                
                // sample color from the face canvas
                let colorHex = '#' + baseCube.material.color.getHexString();
                if (faceCanvases[faceIndex]) {
                    const canvas = faceCanvases[faceIndex].canvas;
                    const ctx = faceCanvases[faceIndex].ctx;
                    const x = Math.floor(uv.x * canvas.width);
                    const y = Math.floor((1 - uv.y) * canvas.height);
                    try {
                        const imageData = ctx.getImageData(x, y, 1, 1);
                        const data = imageData.data;
                        if (data[3] > 0) {
                            colorHex = '#' + [data[0], data[1], data[2]].map(x => x.toString(16).padStart(2, '0')).join('');
                        }
                    } catch (err) {
                    }
                }
                showEyedropperPreviewGlobal(e.clientX, e.clientY, colorHex);
            } else {
                hideEyedropperPreviewGlobal();
            }
            e.stopPropagation();
            return;
        }
        hideEyedropperPreviewGlobal();
        if (isDrawing) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(cube);
            
            if (intersects.length > 0) {
                const faceIndex = intersects[0].face.materialIndex;
                // only draw if still on the same face
                if (faceIndex === currentFaceIndex) {
                    const uv = intersects[0].uv;
                    drawOnTexture(uv.x, uv.y, faceIndex, false);
                    lastUV = uv;
                }
            }
            e.stopPropagation();
        } else if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            const rotationSpeed = 0.01;
            cube.rotation.y += deltaX * rotationSpeed;
            cube.rotation.x += deltaY * rotationSpeed;
            baseCube.rotation.copy(cube.rotation);
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
            e.stopPropagation();
        }
    });

    const handleMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            saveData();
        }
        if (isDrawing) {
            isDrawing = false;
            lastUV = null;
            currentFaceIndex = -1;
            saveData();
        }
    };

    canvas.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseup', handleMouseUp);

    // touch event support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(cube);
        
        if (e.touches.length > 1) {
            isDragging = true;
            previousMousePosition = { x: touch.clientX, y: touch.clientY };
        } else if (intersects.length > 0) {
            isDrawing = true;
            currentFaceIndex = intersects[0].face.materialIndex;
            const uv = intersects[0].uv;
            lastUV = uv;
            drawOnTexture(uv.x, uv.y, currentFaceIndex, true);
        } else {
            isDragging = true;
            previousMousePosition = { x: touch.clientX, y: touch.clientY };
        }
        e.stopPropagation();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (isDrawing) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(cube);
            
            if (intersects.length > 0) {
                const faceIndex = intersects[0].face.materialIndex;
                if (faceIndex === currentFaceIndex) {
                    const uv = intersects[0].uv;
                    drawOnTexture(uv.x, uv.y, faceIndex, false);
                    lastUV = uv;
                }
            }
            e.stopPropagation();
        } else if (isDragging) {
            const deltaX = touch.clientX - previousMousePosition.x;
            const deltaY = touch.clientY - previousMousePosition.y;
            
            const rotationSpeed = 0.01;
            cube.rotation.y += deltaX * rotationSpeed;
            cube.rotation.x += deltaY * rotationSpeed;
            baseCube.rotation.copy(cube.rotation);
            
            previousMousePosition = { x: touch.clientX, y: touch.clientY };
            e.stopPropagation();
        }
    }, { passive: false });

    const handleTouchEnd = (e) => {
        e.preventDefault();
        if (isDragging) {
            isDragging = false;
            saveData();
        }
        if (isDrawing) {
            isDrawing = false;
            lastUV = null;
            currentFaceIndex = -1;
            saveData();
        }
    };

    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // draw on the texture of a specific face
    function drawOnTexture(uvX, uvY, faceIndex, isStart) {
        if (faceIndex < 0 || faceIndex >= 6) return;
        
        const { ctx } = faceCanvases[faceIndex];
        const x = uvX * textureSize;
        const y = (1 - uvY) * textureSize; // flip Y coordinate
        
        // get tool settings
        const tool = state.toolSettings?.[state.drawingMode] || { size: 1, flow: 1, opacity: 1 };
        
        if (state.drawingMode === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.fillStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = state.brushColor || '#000000';
            ctx.fillStyle = state.brushColor || '#000000';
        }
        
        // apply flow and opacity
        ctx.globalAlpha = Math.max(0, Math.min(1, tool.flow * tool.opacity));
        ctx.lineWidth = tool.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (isStart || !lastUV) {
            ctx.beginPath();
            ctx.arc(x, y, tool.size / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const lastX = lastUV.x * textureSize;
            const lastY = (1 - lastUV.y) * textureSize;
            
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
        
        // reset composite operation
        ctx.globalCompositeOperation = 'source-over';
        
        faceTextures[faceIndex].needsUpdate = true;
    }

    // save rotation and all face drawings to Firebase
    function saveData() {
        const faceDrawings = faceCanvases.map(fc => fc.canvas.toDataURL());
        const saveData = {
            rotation: {
                x: baseCube.rotation.x,
                y: baseCube.rotation.y,
                z: baseCube.rotation.z
            },
            faceDrawings: faceDrawings,
            baseColor
        };
        notesRef.child(id).update({ 
            data: JSON.stringify(saveData)
        });
    }

    // animation loop
    let animationFrameId;
    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    // handle resize
    function handleResize() {
        const newWidth = container.offsetWidth || 300;
        const newHeight = container.offsetHeight || 300;
        
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
        canvas.width = newWidth;
        canvas.height = newHeight;
    }

    const resizeObserver = new ResizeObserver(() => {
        handleResize();
    });
    resizeObserver.observe(container);

    cubeInstances.set(id, {
        scene,
        camera,
        renderer,
        cube,
        baseCube,
        animate,
        animationFrameId,
        resizeObserver,
        cleanup: () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
            geometry.dispose();
            overlayGeometry.dispose();
            baseMaterial.dispose();
            faceMaterials.forEach(mat => mat.dispose());
            faceTextures.forEach(tex => tex.dispose());
            renderer.dispose();
            cubeInstances.delete(id);
        },
        setBaseColor: (colorHex) => {
            baseColor = colorHex;
            baseMaterial.color.set(colorHex);
            saveData();
        }
    });

    return { scene, camera, renderer, cube, faceCanvases, faceTextures };
}

export function cleanupCube(id) {
    const instance = cubeInstances.get(id);
    if (instance) {
        instance.cleanup();
    }
}

export function setCubeBaseColor(id, colorHex) {
    const instance = cubeInstances.get(id);
    if (instance && instance.setBaseColor) {
        instance.setBaseColor(colorHex);
    }
}

// update zoom for all cubes
export function updateCubeZoom(zoom) {
    // canvas scale with its parent container
}
