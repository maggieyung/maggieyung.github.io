import { initFirebase, setupCollaborativeCursors } from './firebase.js';
import { state } from './state.js';
import { NOTE_W, NOTE_H } from './constants.js';
import { initToolbar, initBrushPreview } from './ui.js';
import { initContextMenu } from './menu.js';
import { createNoteElement, applySize } from './manager.js';
import { initResizeModeListener } from './resize.js';
import { undo, redo } from './drawing.js';
import { initZoom } from './zoom.js';
import { cleanupCube } from './cube3d.js';
import { cleanupStroke3D } from './stroke3d.js';
import { cleanupSphere2D } from './sphere2d.js';

const db = initFirebase();
const notesRef = db.ref('notes');
const imagesRef = db.ref('images');
const board = document.getElementById('whiteboard');

initToolbar();
initBrushPreview();
initContextMenu(notesRef, imagesRef, board);
initResizeModeListener();
initZoom();

notesRef.on('child_added', (snapshot) => {
    const noteData = snapshot.val();
    const note = createNoteElement(
        noteData.text || '',
        noteData.x,
        noteData.y,
        snapshot.key,
        noteData.type || 'text',
        noteData.data || '',
        noteData.timestamp || Date.now(),
        notesRef
    );
    applySize(note, (noteData.w || NOTE_W), (noteData.h || NOTE_H));
    board.appendChild(note);
    if (state.pendingFocusId === snapshot.key) {
        const editable = note.querySelector('.note-text');
        if (editable) editable.focus();
        state.pendingFocusId = null;
    }
});

notesRef.on('child_removed', (snapshot) => {
    const noteId = snapshot.key;
    const noteEl = document.querySelector(`[data-id="${noteId}"]`); // find note element
    if (noteEl) {
        // cleanup cube / stroke3d / sphere
        const noteType = noteEl.getAttribute('data-type');
        if (noteType === 'cube') cleanupCube(noteId);
        if (noteType === 'gstroke') cleanupStroke3D(noteId);
        if (noteType === 'sphere2d') cleanupSphere2D(noteId);
        
        if (state.resizeModeEnabled && state.resizeModeNoteId === noteId) {
            state.resizeModeEnabled = false;
            state.resizeModeNoteId = null;
            document.body.classList.remove('mini-cursor');
        }
        if (state.moveModeEnabled && state.moveModeNoteId === noteId) {
            state.moveModeEnabled = false;
            state.moveModeNoteId = null;
        }
        noteEl.remove();
    }
});

// images listeners
imagesRef.on('child_added', (snapshot) => {
    const imageData = snapshot.val();
    const imageEl = createImageElement(
        imageData.data,
        imageData.x,
        imageData.y,
        snapshot.key,
        imageData.w || 200,
        imageData.h || 200,
        imagesRef
    );
    board.appendChild(imageEl);
});

imagesRef.on('child_removed', (snapshot) => {
    const imageId = snapshot.key;
    const imageEl = document.querySelector(`[data-image-id="${imageId}"]`);
    if (imageEl) {
        if (state.resizeModeEnabled && state.resizeModeNoteId === imageId) {
            state.resizeModeEnabled = false;
            state.resizeModeNoteId = null;
            document.body.classList.remove('mini-cursor');
        }
        if (state.moveModeEnabled && state.moveModeNoteId === imageId) {
            state.moveModeEnabled = false;
            state.moveModeNoteId = null;
        }
        imageEl.remove();
    }
});

function createImageElement(data, x, y, id, w, h, imagesRef) {
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    imageContainer.style.left = x + 'px';
    imageContainer.style.top = y + 'px';
    imageContainer.style.width = w + 'px';
    imageContainer.style.height = h + 'px';
    imageContainer.setAttribute('data-image-id', id);

    const img = document.createElement('img');
    img.src = data;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.draggable = false;
    imageContainer.appendChild(img);

    imageContainer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        // dragging in move mode
        if (!state.moveModeEnabled || state.moveModeNoteId !== id) {
            e.preventDefault();
            return;
        }
    });

    // context menu 
    imageContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showImageContextMenu(e.clientX, e.clientY, id, imagesRef, imageContainer);
    });

    return imageContainer;
}

function enableImageResize(container, id, imagesRef) {
    // existing handles
    container.querySelectorAll('.image-resize-handle').forEach(h => h.remove());
    
    // resize handles
    const handle = document.createElement('div');
    handle.className = 'image-resize-handle';
    container.appendChild(handle);
    container.classList.add('resize-mode');

    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = container.offsetWidth;
        startHeight = container.offsetHeight;
    });

    const moveHandler = (e) => {
        if (!isResizing) return;
        const zoom = state.zoom || 1;
        const dx = (e.clientX - startX) / zoom;
        const dy = (e.clientY - startY) / zoom;
        const newWidth = Math.max(50, startWidth + dx);
        const newHeight = Math.max(50, startHeight + dy);
        container.style.width = newWidth + 'px';
        container.style.height = newHeight + 'px';
    };

    const upHandler = () => {
        if (isResizing) {
            isResizing = false;
            const w = parseInt(container.style.width);
            const h = parseInt(container.style.height);
            imagesRef.child(id).update({ w, h });
        }
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
}

function showImageContextMenu(x, y, imageId, imagesRef, imageContainer) {
    if (state.contextMenu) state.contextMenu.remove();

    state.contextMenu = document.createElement('div');
    state.contextMenu.className = 'context-menu';
    state.contextMenu.style.left = x + 'px';
    state.contextMenu.style.top = y + 'px';

    const moveItem = document.createElement('div');
    moveItem.className = 'context-menu-item';
    moveItem.textContent = 'Move';
    moveItem.onclick = (e) => {
        e.stopPropagation();
        
        // clear active modes
        document.querySelectorAll('.image-container.resize-mode').forEach(el => {
            el.classList.remove('resize-mode');
            el.querySelectorAll('.image-resize-handle').forEach(h => h.remove());
        });
        document.querySelectorAll('.image-container.dragging').forEach(el => {
            el.classList.remove('dragging');
        });
        
        if (state.resizeModeEnabled && state.resizeModeNoteId) {
            const noteEl = document.querySelector(`[data-id="${state.resizeModeNoteId}"]`);
            if (noteEl) {
                noteEl.classList.remove('resize-mode');
                noteEl.querySelectorAll('.resize-circle').forEach(c => c.remove());
            }
            state.resizeModeEnabled = false;
        }
        if (state.moveModeEnabled && state.moveModeNoteId) {
            const noteEl = document.querySelector(`[data-id="${state.moveModeNoteId}"]`);
            if (noteEl) noteEl.classList.remove('dragging');
        }
        
        state.moveModeEnabled = true;
        state.moveModeNoteId = imageId;
        imageContainer.classList.add('dragging');
        
        const movePreview = (e) => {
            if (state.moveModeNoteId !== imageId) return;
            
            const pos = screenToWhiteboard(e.clientX, e.clientY);
            const newX = pos.x - imageContainer.offsetWidth / 2;
            const newY = pos.y - imageContainer.offsetHeight / 2;
            imageContainer.style.left = newX + 'px';
            imageContainer.style.top = newY + 'px';
        };
        
        const finalizeMove = (e) => {
            if (state.moveModeNoteId !== imageId) return;
            
            const x = parseInt(imageContainer.style.left);
            const y = parseInt(imageContainer.style.top);
            imagesRef.child(imageId).update({ x, y });
            imageContainer.classList.remove('dragging');
            state.moveModeEnabled = false;
            state.moveModeNoteId = null;
            document.removeEventListener('mousemove', movePreview);
            document.removeEventListener('click', finalizeMove);
        };
        
        document.addEventListener('mousemove', movePreview);
        setTimeout(() => {
            document.addEventListener('click', finalizeMove);
        }, 100);
        
        state.contextMenu.remove();
        state.contextMenu = null;
    };

    const resizeItem = document.createElement('div');
    resizeItem.className = 'context-menu-item';
    resizeItem.textContent = 'Resize';
    resizeItem.onclick = (e) => {
        e.stopPropagation();
        
        // clear any other active resize modes
        document.querySelectorAll('.image-container.resize-mode').forEach(el => {
            el.classList.remove('resize-mode');
            el.querySelectorAll('.image-resize-handle').forEach(h => h.remove());
        });
        
        if (state.resizeModeEnabled && state.resizeModeNoteId) {
            const noteEl = document.querySelector(`[data-id="${state.resizeModeNoteId}"]`);
            if (noteEl) {
                noteEl.classList.remove('resize-mode');
                noteEl.querySelectorAll('.resize-circle').forEach(c => c.remove());
            }
        }
        
        state.resizeModeEnabled = true;
        state.resizeModeNoteId = imageId;
        enableImageResize(imageContainer, imageId, imagesRef);
        
        state.contextMenu.remove();
        state.contextMenu = null;
    };

    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.textContent = 'Delete Image';
    deleteItem.onclick = (e) => {
        e.stopPropagation();
        imagesRef.child(imageId).remove();
        state.contextMenu.remove();
        state.contextMenu = null;
    };

    state.contextMenu.appendChild(moveItem);
    state.contextMenu.appendChild(resizeItem);
    state.contextMenu.appendChild(deleteItem);
    document.body.appendChild(state.contextMenu);
}

// save actions to history
function saveAction(action) {
    state.actionHistory.push(action);
    if (state.actionHistory.length > (state.maxActionHistorySize || 50)) {
        state.actionHistory.shift();
    }
    state.actionRedoHistory = [];
}

// convert screen coordinates to whiteboard coordinates
function screenToWhiteboard(screenX, screenY) {
    const wb = document.getElementById('whiteboard');
    const rect = wb.getBoundingClientRect();
    const zoom = state.zoom || 1;
    return {
        x: (screenX - rect.left) / zoom,
        y: (screenY - rect.top) / zoom
    };
}

document.addEventListener('keydown', (e) => {
    // ignore tool shortcuts if editing a text field
    const activeEl = document.activeElement;
    const editingField = activeEl && (
        activeEl.isContentEditable ||
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA'
    );
    if (!editingField) {
        // tool shortcuts 
        if (e.key === 'b' || e.key === 'B') {
            state.drawingMode = 'pen';
            const penBtn = document.getElementById('penBtn');
            const pencilBtn = document.getElementById('pencilBtn');
            const eraserBtn = document.getElementById('eraserBtn');
            penBtn?.classList.add('active');
            pencilBtn?.classList.remove('active');
            eraserBtn?.classList.remove('active');
            const t = state.toolSettings.pen;
            const sizeSlider = document.getElementById('sizeSlider'); const sizeValue = document.getElementById('sizeValue');
            const flowSlider = document.getElementById('flowSlider'); const flowValue = document.getElementById('flowValue');
            const opacitySlider = document.getElementById('opacitySlider'); const opacityValue = document.getElementById('opacityValue');
            if (sizeSlider)  { sizeSlider.value = String(t.size); sizeValue.textContent = t.size; }
            if (flowSlider)  { flowSlider.value = String(Math.round(t.flow * 100)); flowValue.textContent = Math.round(t.flow * 100); }
            if (opacitySlider){ opacitySlider.value = String(Math.round(t.opacity * 100)); opacityValue.textContent = Math.round(t.opacity * 100); }
            e.preventDefault();
            return;
        }
        if (e.key === 'e' || e.key === 'E') {
            state.drawingMode = 'eraser';
            const penBtn = document.getElementById('penBtn');
            const pencilBtn = document.getElementById('pencilBtn');
            const eraserBtn = document.getElementById('eraserBtn');
            eraserBtn?.classList.add('active');
            penBtn?.classList.remove('active');
            pencilBtn?.classList.remove('active');
            const t = state.toolSettings.eraser;
            const sizeSlider = document.getElementById('sizeSlider'); const sizeValue = document.getElementById('sizeValue');
            const flowSlider = document.getElementById('flowSlider'); const flowValue = document.getElementById('flowValue');
            const opacitySlider = document.getElementById('opacitySlider'); const opacityValue = document.getElementById('opacityValue');
            if (sizeSlider)  { sizeSlider.value = String(t.size); sizeValue.textContent = t.size; }
            if (flowSlider)  { flowSlider.value = String(Math.round(t.flow * 100)); flowValue.textContent = Math.round(t.flow * 100); }
            if (opacitySlider){ opacitySlider.value = String(Math.round(t.opacity * 100)); opacityValue.textContent = Math.round(t.opacity * 100); }
            e.preventDefault();
            return;
        }
    }

    // flip canvas horizontally
    if (e.key === 'h' || e.key === 'H') {
        const hoverDraw = document.querySelector('.note[data-type="draw"]:hover');
        if (hoverDraw) {
            e.preventDefault();
            const noteId = hoverDraw.getAttribute('data-id');
            flipCanvasHorizontally(noteId, notesRef);
        }
        return;
    }

    // ctrl/cmd+z and ctrl/cmd+y for drawing notes (regardless of hover)
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        // find most recently active drawing note
        let noteId = null;
        if (state.activeDrawingNotes && state.activeDrawingNotes.size > 0) {
            
            noteId = Array.from(state.activeDrawingNotes).slice(-1)[0];
        } else {
            const drawNotes = document.querySelectorAll('.note[data-type="draw"]');
            if (drawNotes.length > 0) {
                noteId = drawNotes[drawNotes.length - 1].getAttribute('data-id');
            }
        }
        if (noteId) {
            undo(noteId, notesRef);
        } else {
            // action undo for non-drawing notes
            performUndo();
        }
        return;
    }

    if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || 
        (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        // find most recently active drawing note
        let noteId = null;
        if (state.activeDrawingNotes && state.activeDrawingNotes.size > 0) {
            noteId = Array.from(state.activeDrawingNotes).slice(-1)[0];
        } else {
            const drawNotes = document.querySelectorAll('.note[data-type="draw"]');
            if (drawNotes.length > 0) {
                noteId = drawNotes[drawNotes.length - 1].getAttribute('data-id');
            }
        }
        if (noteId) {
            redo(noteId, notesRef);
        } else {
            performRedo();
        }
        return;
    }

    if (editing) return;

    let x, y;
    if (state.lastMouse) {
        const pos = screenToWhiteboard(state.lastMouse.x, state.lastMouse.y);
        x = pos.x - NOTE_W / 2;
        y = pos.y - NOTE_H / 2;
    } else {
        const pos = screenToWhiteboard(window.innerWidth / 2, window.innerHeight / 2);
        x = pos.x - NOTE_W / 2;
        y = pos.y - NOTE_H / 2;
    }

    if (e.key === 'n' || e.key === 'N') {
        const newRef = notesRef.push();
        const noteId = newRef.key;
        state.pendingFocusId = noteId;
        const noteData = { type: 'text', text: '', x, y, timestamp: Date.now() };
        newRef.set(noteData);
        
        // save action
        saveAction({
            type: 'create',
            noteId: noteId,
            noteData: noteData
        });
    } else if (e.key === 'd' || e.key === 'D') {
        const newRef = notesRef.push();
        const noteId = newRef.key;
        const noteData = { type: 'draw', data: '', x, y, timestamp: Date.now() };
        newRef.set(noteData);
        
        // save action
        saveAction({
            type: 'create',
            noteId: noteId,
            noteData: noteData
        });
    } else if (e.key === 'i' || e.key === 'I') {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = (evt) => {
            const file = evt.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const newRef = imagesRef.push();
                    newRef.set({ data: e.target.result, x, y, w: 200, h: 200 });
                };
                reader.readAsDataURL(file);
            }
        };
        fileInput.click();
    }
});

function flipCanvasHorizontally(noteId, notesRef) {
    const noteEl = document.querySelector(`[data-id="${noteId}"]`);
    const canvas = noteEl?.querySelector('.draw-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // create temporary canvas to store current image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);
    
    // clear and flip horizontally
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(tempCanvas, -canvas.width, 0);
    ctx.restore();
    
    // save local snapshot
    try {
        const url = canvas.toDataURL('image/png');
        if (!state.undoHistory[noteId]) state.undoHistory[noteId] = [];
        state.undoHistory[noteId].push(url);
        if (state.undoHistory[noteId].length > state.maxHistorySize) {
            state.undoHistory[noteId].shift();
        }
        state.redoHistory[noteId] = [];
    } catch (_) {}
}

function performUndo() {
    if (state.actionHistory.length === 0) return;
    
    const action = state.actionHistory.pop();
    state.actionRedoHistory.push(action);
    
    if (action.type === 'create') {
        // undo note creation 
        notesRef.child(action.noteId).remove();
    } else if (action.type === 'delete') {
        // undo note deletion 
        notesRef.child(action.noteId).set(action.noteData);
    } else if (action.type === 'textEdit') {
        // undo text edit
        notesRef.child(action.noteId).update({ text: action.previousText });
    }
}

function performRedo() {
    if (state.actionRedoHistory.length === 0) return;
    
    const action = state.actionRedoHistory.pop();
    state.actionHistory.push(action);
    
    if (action.type === 'create') {
        // redo note creation
        notesRef.child(action.noteId).set(action.noteData);
    } else if (action.type === 'delete') {
        // redo note deletion
        notesRef.child(action.noteId).remove();
    } else if (action.type === 'textEdit') {
        // redo text edit
        notesRef.child(action.noteId).update({ text: action.newText });
    }
}

board.addEventListener('dblclick', (e) => {
    if (e.target.classList.contains('note-text') || e.target.classList.contains('draw-canvas') || e.target.classList.contains('cube-canvas')) return;
    
    const pos = screenToWhiteboard(e.clientX, e.clientY);
    const x = pos.x - NOTE_W / 2;
    const y = pos.y - NOTE_H / 2;
    
    const newRef = notesRef.push();
    state.pendingFocusId = newRef.key;
    newRef.set({ type: 'text', text: '', x, y, timestamp: Date.now() });
});

document.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        document.body.classList.add('clicking');
    }
    
    const clickedNote = e.target.closest('.note');
    const clickedNoteId = clickedNote ? clickedNote.getAttribute('data-id') : null;
    
    // active text input
    const activeElement = document.activeElement;
    if (activeElement && activeElement.classList.contains('note-text')) {
        if (!e.target.closest('.note-text')) {
            activeElement.blur();
        }
    }

    // exit resize mode
    const clickedImage = e.target.closest('.image-container');
    const clickedImageId = clickedImage ? clickedImage.getAttribute('data-image-id') : null;
    
    if (state.resizeModeEnabled && 
        state.resizeModeNoteId !== clickedNoteId && 
        state.resizeModeNoteId !== clickedImageId &&
        !e.target.classList.contains('resize-circle') &&
        !e.target.classList.contains('image-resize-handle')) {
        const noteEl = document.querySelector(`[data-id="${state.resizeModeNoteId}"]`);
        if (noteEl) {
            noteEl.classList.remove('resize-mode');
            noteEl.querySelectorAll('.resize-circle').forEach(c => c.remove());
        }
        const imageEl = document.querySelector(`[data-image-id="${state.resizeModeNoteId}"]`);
        if (imageEl) {
            imageEl.classList.remove('resize-mode');
            imageEl.querySelectorAll('.image-resize-handle').forEach(h => h.remove());
        }
        state.resizeModeEnabled = false;
        state.resizeModeNoteId = null;
        document.body.classList.remove('mini-cursor');
    }
    
    // exit move mode
    if (state.moveModeEnabled && state.moveModeNoteId !== clickedNoteId && state.moveModeNoteId !== clickedImageId) {
        const noteEl = document.querySelector(`[data-id="${state.moveModeNoteId}"]`);
        if (noteEl) {
            noteEl.classList.remove('dragging');
        }
        const imageEl = document.querySelector(`[data-image-id="${state.moveModeNoteId}"]`);
        if (imageEl) {
            imageEl.classList.remove('dragging');
        }
        state.moveModeEnabled = false;
        state.moveModeNoteId = null;
    }
});

document.addEventListener('mouseup', (e) => {
    document.body.classList.remove('clicking');
});

document.addEventListener('mousemove', (e) => {
    state.lastMouse = { x: e.clientX, y: e.clientY };
});

// handle right click
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    document.body.classList.add('clicking');
    setTimeout(() => {
        document.body.classList.remove('clicking');
    }, 200);
});
