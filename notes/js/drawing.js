import { state } from './state.js';

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
        }
        
        if (data) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                saveToHistory(id, canvas);
            };
            img.src = data;
        } else {
            saveToHistory(id, canvas);
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

        const start = (ev) => {
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
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = state.brushColor;
            }
            ctx.globalAlpha = Math.max(0, Math.min(1, tool.flow * tool.opacity));

            //anti-aliased
            if (state.drawingMode === 'pencil' && pencilBrushLoaded) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
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

                        ctx.save();
                        ctx.globalAlpha = Math.max(0, Math.min(1, tool.flow * tool.opacity));
                        ctx.translate(x, y);
                        ctx.drawImage(offCanvas, -size / 2, -size / 2, size, size);
                        ctx.restore();
                    }
                    prev = curr;
                }
            } else {
                if (currentPath.length < 2) {
                    const curvedPressure = applyPressureCurve(currentPath[0].pressure ?? pressure);
                    const size = Math.max(0.1, tool.size * curvedPressure);
                    ctx.beginPath();
                    ctx.arc(currentPath[0].x, currentPath[0].y, size / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    for (let i = 0; i < currentPath.length - 1; i++) {
                        const p1 = currentPath[i];
                        const p2 = currentPath[i + 1];
                        const pressure1 = applyPressureCurve(p1.pressure ?? pressure);
                        const pressure2 = applyPressureCurve(p2.pressure ?? pressure);
                        const width1 = Math.max(0.1, tool.size * pressure1);
                        const width2 = Math.max(0.1, tool.size * pressure2);
                        const avgWidth = (width1 + width2) / 2;
                        ctx.lineWidth = avgWidth;
                        if (i === 0) { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); }
                        if (i < currentPath.length - 2) {
                            const xc = (p2.x + currentPath[i + 2].x) / 2;
                            const yc = (p2.y + currentPath[i + 2].y) / 2;
                            ctx.quadraticCurveTo(p2.x, p2.y, xc, yc);
                        } else {
                            ctx.lineTo(p2.x, p2.y);
                        }
                        ctx.stroke();
                    }
                }
            }

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        };
        
        const end = () => {
            if (!drawing) return;
            drawing = false;
            currentPath = [];
            savedCanvas = null;

            if (state.drawSaveTimeouts[id]) clearTimeout(state.drawSaveTimeouts[id]);
            state.drawSaveTimeouts[id] = setTimeout(() => {
                state.activeDrawingNotes.delete(id);
                try {
                    const url = canvas.toDataURL('image/png');
                    notesRef.child(id).update({ type: 'draw', data: url });
                    saveToHistory(id, canvas);
                } catch (_) {}
                delete state.drawSaveTimeouts[id];
            }, 300);
        };
        
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e.touches[0]); }, { passive: false });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0]); }, { passive: false });
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); end(); }, { passive: false });
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
        state.undoHistory[id].push(imageData);
        
        if (state.undoHistory[id].length > state.maxHistorySize) {
            state.undoHistory[id].shift();
        }
    } catch (_) {}
}

export function undo(noteId, notesRef) {
    if (!state.undoHistory[noteId] || state.undoHistory[noteId].length <= 1) return;

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
    notesRef.child(noteId).update({ type: 'draw', data: previous });
}

export function redo(noteId, notesRef) {
    if (!state.redoHistory[noteId] || state.redoHistory[noteId].length === 0) return;

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
    notesRef.child(noteId).update({ type: 'draw', data: next });
}

function getPos(ev, canvas) {
    const r = canvas.getBoundingClientRect();
    const zoom = state.zoom || 1; 
    return {
        x: (ev.clientX - r.left) / zoom,
        y: (ev.clientY - r.top) / zoom
    };
}
