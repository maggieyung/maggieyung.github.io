import { initFirebase } from './firebase.js';
import { state } from './state.js';
import { NOTE_W, NOTE_H } from './constants.js';
import { initToolbar, initBrushPreview } from './ui.js';
import { initContextMenu } from './menu.js';
import { createNoteElement, applySize } from './manager.js';
import { initResizeModeListener } from './resize.js';
import { undo, redo } from './drawing.js';
import { initZoom } from './zoom.js';

const db = initFirebase();
const notesRef = db.ref('notes');
const board = document.getElementById('whiteboard');

initToolbar();
initBrushPreview();
initContextMenu(notesRef, board);
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

notesRef.on('child_changed', (snapshot) => {
    const noteData = snapshot.val();
    const noteEl = document.querySelector(`[data-id="${snapshot.key}"]`);
    if (!noteEl) return;
    
    noteEl.style.left = noteData.x + 'px';
    noteEl.style.top = noteData.y + 'px';
    applySize(noteEl, (noteData.w || NOTE_W), (noteData.h || NOTE_H));
    
    const type = noteData.type || 'text';
    if (type === 'text') {
        const t = noteEl.querySelector('.note-text');
        if (t) t.textContent = noteData.text || '';
    } else if (type === 'draw') {
        const c = noteEl.querySelector('.draw-canvas');
        if (c && noteData.data && !state.activeDrawingNotes.has(snapshot.key)) {
            const ctx = c.getContext('2d');
            const img = new Image();
            img.onload = () => {
                if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
                    c.width = c.clientWidth; 
                    c.height = c.clientHeight;
                }
                ctx.clearRect(0,0,c.width,c.height);
                ctx.drawImage(img, 0, 0, c.width, c.height);
            };
            img.src = noteData.data;
        }
    }
});

notesRef.on('child_removed', (snapshot) => {
    const noteEl = document.querySelector(`[data-id="${snapshot.key}"]`);
    if (noteEl) noteEl.remove();
});

// convert screen coords to whiteboard content coords
function screenToWhiteboard(screenX, screenY) {
    const wb = document.getElementById('whiteboard');
    const rect = wb.getBoundingClientRect();
    const zoom = state.zoom || 1;
    
    return {
        x: (screenX - rect.left) / zoom,
        y: (screenY - rect.top) / zoom
    };
}

// save action to history
function saveAction(action) {
    state.actionHistory.push(action);
    if (state.actionHistory.length > state.maxActionHistorySize) {
        state.actionHistory.shift();
    }
    state.actionRedoHistory = []; // clear redo when new action is made
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

    
    // if hovering over a draw canvas
    const hoverDrawNote = document.querySelector('.note[data-type="draw"]:hover');
    
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        
        // draw undo
        if (hoverDrawNote && !editing) {
            const noteId = hoverDrawNote.getAttribute('data-id');
            undo(noteId, notesRef);
        } else if (!editing) {
            // action undo
            performUndo();
        }
        return;
    }
    
    if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || 
        (e.key === 'y' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        
        // draw redo
        if (hoverDrawNote && !editing) {
            const noteId = hoverDrawNote.getAttribute('data-id');
            redo(noteId, notesRef);
        } else if (!editing) {
            // action redo
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
    
    // save firebase and history
    try {
        const url = canvas.toDataURL('image/png');
        notesRef.child(noteId).update({ type: 'draw', data: url });
        
        // add to undo history
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
    if (e.target.classList.contains('note-text') || e.target.classList.contains('draw-canvas')) return;
    
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
    if (state.resizeModeEnabled && 
        state.resizeModeNoteId !== clickedNoteId && 
        !e.target.classList.contains('resize-circle')) {
        const noteEl = document.querySelector(`[data-id="${state.resizeModeNoteId}"]`);
        if (noteEl) {
            noteEl.classList.remove('resize-mode');
            noteEl.querySelectorAll('.resize-circle').forEach(c => c.remove());
        }
        state.resizeModeEnabled = false;
        state.resizeModeNoteId = null;
        document.body.classList.remove('mini-cursor');
    }
    
    // exit move mode
    if (state.moveModeEnabled && state.moveModeNoteId !== clickedNoteId) {
        const noteEl = document.querySelector(`[data-id="${state.moveModeNoteId}"]`);
        if (noteEl) {
            noteEl.classList.remove('dragging');
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
