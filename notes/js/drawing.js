import { state } from './state.js';

// global eyedropper preview
let globalEyedropperPreview = document.getElementById('eyedropperPreviewCircle');
if (!globalEyedropperPreview) {
    globalEyedropperPreview = document.createElement('div');
    globalEyedropperPreview.id = 'eyedropperPreviewCircle';
    globalEyedropperPreview.className = 'eyedropper-preview';
    globalEyedropperPreview.style.display = 'none';
    globalEyedropperPreview.style.position = 'fixed';
    globalEyedropperPreview.style.zIndex = '10001';
    document.body.appendChild(globalEyedropperPreview);
}

// 3D objects
export function showEyedropperPreviewGlobal(x, y, color) {
    if (!globalEyedropperPreview) return;
    const offsetX = 20;
    const offsetY = -36;
    globalEyedropperPreview.style.left = (x + offsetX) + 'px';
    globalEyedropperPreview.style.top = (y + offsetY) + 'px';
    globalEyedropperPreview.style.background = color;
    globalEyedropperPreview.style.display = 'block';
}

export function hideEyedropperPreviewGlobal() {
    if (!globalEyedropperPreview) return;
    globalEyedropperPreview.style.display = 'none';
}


// default pen tool settings
if (!state.toolSettings) state.toolSettings = {};
state.toolSettings.pen = state.toolSettings.pen || { size: 2, flow: 0.38, opacity: 1 };

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

// pressure curve function
function applyPressureCurve(pressure) {
    const amount = state.pressureCurveAmount || 1.2;
    return Math.pow(pressure, 1.0 / amount);
}

// pencil brush image
const pencilBrushImg = new Image();
pencilBrushImg.src = '../../img/brush.png';
let pencilBrushLoaded = false;
pencilBrushImg.onload = () => { pencilBrushLoaded = true; };

export function setupDrawingCanvas(canvas, id, data, notesRef) {
    requestAnimationFrame(() => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        const ctx = canvas.getContext('2d', { alpha: true });
        
        // anti-aliasing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        if (!state.undoHistory[id]) {
            state.undoHistory[id] = [];
            state.redoHistory[id] = [];
            // save initial blank canvas as first history entry
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            saveToHistory(id, canvas);
        }

        if (data) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                saveToHistory(id, canvas);
            };
            img.src = data;
        }

        let drawing = false;
        let currentPath = [];
        let savedCanvas = null;

        // listen for undo/redo during drawing
        const handleUndoRedoDuringStroke = (e) => {
            if (!drawing) return;
            const isUndo = e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey;
            const isRedo = ((e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
                            (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)));
            if (isUndo || isRedo) {
                e.preventDefault();
                e.stopPropagation();
                // cancel current stroke
                drawing = false;
                currentPath = [];
                savedCanvas = null;
                // undo/redo
                if (isUndo) undo(id, notesRef);
                else redo(id, notesRef);
            }
        };
        document.addEventListener('keydown', handleUndoRedoDuringStroke);

        // eyedropper preview circle 
        function showEyedropperPreview(x, y, color) {
            showEyedropperPreviewGlobal(x, y, color);
        }
        function hideEyedropperPreview() {
            hideEyedropperPreviewGlobal();
        }

        const start = (ev) => {
            if (state.drawingMode === 'eyeDropper') {
                const p = getPos(ev, canvas);
                const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
                const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
                const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
                state.brushColor = hex;
                // update color preview and eyedropper preview
                window.dispatchEvent(new CustomEvent('brushColorChange', { detail: hex }));
                // switch to pen tool
                state.drawingMode = 'pen';
                document.body.style.cursor = '';
                hideEyedropperPreview();
                window.dispatchEvent(new CustomEvent('eyedropperColorSelected'));
                return;
            }
            drawing = true;
            state.activeDrawingNotes.add(id);
            const p = getPos(ev, canvas);
            const pressure = (ev.pressure !== undefined && ev.pressure > 0) ? ev.pressure : 1.0;
            state.redoHistory[id] = [];
            // current canvas state 
            savedCanvas = ctx.getImageData(0, 0, canvas.width, canvas.height);
            currentPath = [{ x: p.x, y: p.y, pressure }];
        };
        
        const move = (ev) => {
            if (!drawing) return;
            const p = getPos(ev, canvas);
            const pressure = (ev.pressure !== undefined && ev.pressure > 0) ? ev.pressure : 1.0;

            if (currentPath.length > 0) {
                const lastP = currentPath[currentPath.length - 1];
                const dist = Math.hypot(p.x - lastP.x, p.y - lastP.y);
                if (dist < 0.5) return;
            }

            currentPath.push({ x: p.x, y: p.y, pressure });

            // restore canvas to saved state
            if (savedCanvas) ctx.putImageData(savedCanvas, 0, 0);

            //  pencil size
            let tool = state.toolSettings?.[state.drawingMode] || { size: 1, flow: 1, opacity: 1 };
            if (state.drawingMode === 'pencil') {
                const sizeSlider = document.getElementById('sizeSlider');
                if (sizeSlider) {
                    tool = { ...tool, size: parseInt(sizeSlider.value, 10) || 1 };
                }
            }

            if (state.drawingMode === 'eraser') {
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                ctx.strokeStyle = state.brushColor;
            }
            const opacity = clamp01(tool.opacity);
            const flow = clamp01(tool.flow);

            // offscreen buffer
            if (!move._strokeCanvas) {
                move._strokeCanvas = document.createElement('canvas');
                move._strokeCanvas.width = canvas.width;
                move._strokeCanvas.height = canvas.height;
            }
            const strokeCanvas = move._strokeCanvas;
            if (strokeCanvas.width !== canvas.width || strokeCanvas.height !== canvas.height) {
                strokeCanvas.width = canvas.width;
                strokeCanvas.height = canvas.height;
            }
            const strokeCtx = strokeCanvas.getContext('2d', { alpha: true });
            strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
            strokeCtx.imageSmoothingEnabled = true;
            strokeCtx.imageSmoothingQuality = 'high';
            strokeCtx.lineCap = 'round';
            strokeCtx.lineJoin = 'round';

            // anti-aliased 
            if (state.drawingMode === 'pencil' && pencilBrushLoaded) {
                // single offscreen canvas for tinting

                const maxBrushSize = 128; //
                if (!move._offCanvas) {
                    move._offCanvas = document.createElement('canvas');
                    move._offCanvas.width = maxBrushSize;
                    move._offCanvas.height = maxBrushSize;
                }
                const offCanvas = move._offCanvas;
                const offCtx = offCanvas.getContext('2d');

                const step = Math.max(0.2, tool.size * 0.15);
                let prev = currentPath[0];
                for (let i = 1; i < currentPath.length; i++) {
                    const curr = currentPath[i];
                    const dx = curr.x - prev.x;
                    const dy = curr.y - prev.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist === 0) continue;
                    const count = Math.max(1, Math.ceil(dist / step));
                    const stampAlpha = 1 - Math.pow(1 - flow, 1 / count);
                    for (let j = 0; j <= count; j++) {
                        const t = count === 0 ? 1 : j / count;
                        const x = prev.x + dx * t;
                        const y = prev.y + dy * t;
                        const pressureInterp = prev.pressure + (curr.pressure - prev.pressure) * t;
                        const curvedPressure = applyPressureCurve(pressureInterp);
                        const size = Math.max(0.1, tool.size * curvedPressure);

                        // resize offscreen canvas if needed
                        if (offCanvas.width !== Math.ceil(size) || offCanvas.height !== Math.ceil(size)) {
                            offCanvas.width = Math.ceil(size);
                            offCanvas.height = Math.ceil(size);
                        }
                        offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
                        offCtx.drawImage(pencilBrushImg, 0, 0, offCanvas.width, offCanvas.height);

                        // tint pixels
                        offCtx.globalCompositeOperation = 'source-in';
                        offCtx.fillStyle = state.brushColor;
                        offCtx.globalAlpha = 1;
                        offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
                        offCtx.globalCompositeOperation = 'source-over';

                        strokeCtx.save();
                        strokeCtx.globalAlpha = clamp01(stampAlpha);
                        strokeCtx.translate(x, y);
                        strokeCtx.drawImage(offCanvas, -size / 2, -size / 2, size, size);
                        strokeCtx.restore();
                    }
                    prev = curr;
                }
            } else {
                strokeCtx.globalCompositeOperation = 'source-over';
                strokeCtx.strokeStyle = (state.drawingMode === 'eraser') ? 'rgba(0,0,0,1)' : state.brushColor;
                strokeCtx.globalAlpha = flow;
                
                if (currentPath.length < 2) {
                    const curvedPressure = applyPressureCurve(currentPath[0].pressure ?? pressure);
                    const size = Math.max(0.1, tool.size * curvedPressure);
                    strokeCtx.beginPath();
                    strokeCtx.arc(currentPath[0].x, currentPath[0].y, size / 2, 0, Math.PI * 2);
                    strokeCtx.fillStyle = (state.drawingMode === 'eraser') ? 'rgba(0,0,0,1)' : state.brushColor;
                    strokeCtx.fill();
                } else {
                    for (let i = 0; i < currentPath.length - 1; i++) {
                        const p1 = currentPath[i];
                        const p2 = currentPath[i + 1];
                        const pressure1 = applyPressureCurve(p1.pressure ?? pressure);
                        const pressure2 = applyPressureCurve(p2.pressure ?? pressure);
                        const width1 = Math.max(0.1, tool.size * pressure1);
                        const width2 = Math.max(0.1, tool.size * pressure2);
                        const avgWidth = (width1 + width2) / 2;
                        strokeCtx.lineWidth = avgWidth;
                        if (i === 0) { strokeCtx.beginPath(); strokeCtx.moveTo(p1.x, p1.y); }
                        if (i < currentPath.length - 2) {
                            const xc = (p2.x + currentPath[i + 2].x) / 2;
                            const yc = (p2.y + currentPath[i + 2].y) / 2;
                            strokeCtx.quadraticCurveTo(p2.x, p2.y, xc, yc);
                        } else {
                            strokeCtx.lineTo(p2.x, p2.y);
                        }
                        strokeCtx.stroke();
                    }
                }
            }

            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.globalCompositeOperation = (state.drawingMode === 'eraser') ? 'destination-out' : 'source-over';
            ctx.drawImage(strokeCanvas, 0, 0);
            ctx.restore();
        };
        
        const end = () => {
            if (!drawing) return;
            drawing = false;
            const endedPath = [...currentPath];
            currentPath = [];
            savedCanvas = null;

            if (state.drawSaveTimeouts[id]) clearTimeout(state.drawSaveTimeouts[id]);
            state.drawSaveTimeouts[id] = setTimeout(() => {
                state.activeDrawingNotes.delete(id);
                try {
                    // serialize stroke data instead of full canvas
                    const stroke = {
                        points: endedPath,
                        tool: state.drawingMode,
                        color: state.brushColor,
                        size: state.toolSettings?.[state.drawingMode]?.size || 2,
                        flow: state.toolSettings?.[state.drawingMode]?.flow || 0.38,
                        opacity: state.toolSettings?.[state.drawingMode]?.opacity || 1,
                        timestamp: Date.now()
                    };
                    // send stroke event to firebase
                    notesRef.child(id).child('strokes').push(stroke);
                    saveToHistory(id, canvas);
                } catch (_) {}
                delete state.drawSaveTimeouts[id];
            }, 300);
        };
        
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', (ev) => {
            if (state.drawingMode === 'eyeDropper') {
                const p = getPos(ev, canvas);
                const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
                const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
                const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
                showEyedropperPreview(ev.clientX, ev.clientY, hex);
            } else {
                hideEyedropperPreview();
                move(ev);
            }
        });
        canvas.addEventListener('mouseup', (ev) => {
            end(ev);
            hideEyedropperPreview();
        });
        canvas.addEventListener('mouseleave', (ev) => {
            end(ev);
            hideEyedropperPreview();
        });
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e.touches[0]); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (state.drawingMode === 'eyeDropper') {
                const touch = e.touches[0];
                const p = getPos(touch, canvas);
                const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
                const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
                const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
                showEyedropperPreview(touch.clientX, touch.clientY, hex);
            } else {
                hideEyedropperPreview();
                move(e.touches[0]);
            }
        }, { passive: false });
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); end(); hideEyedropperPreview(); }, { passive: false });

        // real-time listener for drawing and text updates
        listenForDrawingUpdates(notesRef, id, canvas);
    });
}

// apply stroke to canvas
function applyStroke(canvas, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    const ctx = canvas.getContext('2d');
    const tool = stroke.tool || 'pen';
    const color = stroke.color || '#000000';
    const size = stroke.size || 2;
    const flow = stroke.flow || 0.38;
    const opacity = stroke.opacity || 1;
    
    ctx.save();
    ctx.globalAlpha = clamp01(opacity);
    ctx.globalCompositeOperation = (tool === 'eraser') ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = (tool === 'eraser') ? 'rgba(0,0,0,1)' : color;
    
    const points = stroke.points;
    if (points.length === 1) {
        const p = points[0];
        const pressure = applyPressureCurve(p.pressure || 1.0);
        const w = Math.max(0.1, size * pressure);
        ctx.beginPath();
        ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
        ctx.fillStyle = (tool === 'eraser') ? 'rgba(0,0,0,1)' : color;
        ctx.fill();
    } else {
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const pressure1 = applyPressureCurve(p1.pressure || 1.0);
            const pressure2 = applyPressureCurve(p2.pressure || 1.0);
            const width1 = Math.max(0.1, size * pressure1);
            const width2 = Math.max(0.1, size * pressure2);
            const avgWidth = (width1 + width2) / 2;
            ctx.lineWidth = avgWidth;
            if (i === 0) { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); }
            if (i < points.length - 2) {
                const xc = (p2.x + points[i + 2].x) / 2;
                const yc = (p2.y + points[i + 2].y) / 2;
                ctx.quadraticCurveTo(p2.x, p2.y, xc, yc);
            } else {
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();
        }
    }
    ctx.restore();
}

export function listenForDrawingUpdates(notesRef, noteId, canvas) {
    // track applied strokes 
    if (!state.appliedStrokes) state.appliedStrokes = {};
    if (!state.appliedStrokes[noteId]) state.appliedStrokes[noteId] = new Set();
    
    // listen for new stroke events
    notesRef.child(noteId).child('strokes').on('child_added', (snapshot) => {
        const strokeId = snapshot.key;
        const stroke = snapshot.val();
        
        if (!state.appliedStrokes[noteId].has(strokeId)) {
            state.appliedStrokes[noteId].add(strokeId);
            applyStroke(canvas, stroke);
        }
    });
    
    // listen for text updates 
    notesRef.child(noteId).child('textUpdates').on('child_added', (snapshot) => {
        const updateId = snapshot.key;
        const update = snapshot.val();
        if (update && update.text !== undefined) {
            const textEl = canvas.parentElement?.querySelector('.note-text');
            if (textEl && textEl._applyRemoteUpdate) {
                // use the special method to avoid re-triggering input
                textEl._applyRemoteUpdate(update.text);
            } else if (textEl) {
                textEl.textContent = update.text;
            }
        }
    });
}

// slider changes
const sizeSlider = document.getElementById('sizeSlider');
const flowSlider = document.getElementById('flowSlider');
const opacitySlider = document.getElementById('opacitySlider');

function updatePencilSettings() {
    state.toolSettings.pencil = state.toolSettings.pencil || { size: 1, flow: 1, opacity: 1 };
    if (sizeSlider) state.toolSettings.pencil.size = parseInt(sizeSlider.value, 10) || 1;
    if (flowSlider) state.toolSettings.pencil.flow = (parseInt(flowSlider.value, 10) || 0) / 100;
    if (opacitySlider) state.toolSettings.pencil.opacity = (parseInt(opacitySlider.value, 10) || 0) / 100;
}

if (sizeSlider) {
    sizeSlider.addEventListener('input', (e) => {
        if (state.drawingMode === 'pencil') updatePencilSettings();
    });
}
if (flowSlider) {
    flowSlider.addEventListener('input', (e) => {
        if (state.drawingMode === 'pencil') updatePencilSettings();
    });
}
if (opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
        if (state.drawingMode === 'pencil') updatePencilSettings();
    });
}

function saveToHistory(id, canvas) {
    try {
        const imageData = canvas.toDataURL('image/png');
        if (!state.undoHistory[id]) {
            state.undoHistory[id] = [];
        }
        // push if different from last snapshot
        const last = state.undoHistory[id][state.undoHistory[id].length - 1];
        if (imageData !== last) {
            state.undoHistory[id].push(imageData);
            if (state.undoHistory[id].length > state.maxHistorySize) {
                state.undoHistory[id].shift();
            }
        }
    } catch (_) {}
}

export function undo(noteId, notesRef) { 
    if (!state.undoHistory[noteId] || state.undoHistory[noteId].length <= 1) {
        return;
    }

    const current = state.undoHistory[noteId].pop();
    if (!state.redoHistory[noteId]) {
        state.redoHistory[noteId] = [];
    }
    state.redoHistory[noteId].push(current);

    const previous = state.undoHistory[noteId][state.undoHistory[noteId].length - 1];

    // update canvas
    const noteEl = document.querySelector(`[data-id="${noteId}"]`);
    const canvas = noteEl?.querySelector('.draw-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = previous;
    }

    // update firebase 
    notesRef.child(noteId).update({ type: 'draw', data: previous, updatedAt: Date.now() });
}

export function redo(noteId, notesRef) {
    if (!state.redoHistory[noteId] || state.redoHistory[noteId].length === 0) {
        return;
    }

    const next = state.redoHistory[noteId].pop();
    state.undoHistory[noteId].push(next);

    // update canvas
    const noteEl = document.querySelector(`[data-id="${noteId}"]`);
    const canvas = noteEl?.querySelector('.draw-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = next;
    }

    // update firebase 
    notesRef.child(noteId).update({ type: 'draw', data: next, updatedAt: Date.now() });
}

function getPos(ev, canvas) {
    const r = canvas.getBoundingClientRect();
    const zoom = state.zoom || 1; 
    return {
        x: (ev.clientX - r.left) / zoom,
        y: (ev.clientY - r.top) / zoom
    };
}