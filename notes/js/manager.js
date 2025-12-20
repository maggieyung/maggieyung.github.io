import { state } from './state.js';
import { NOTE_W, NOTE_H } from './constants.js';
import { showContextMenu } from './menu.js';
import { setupDrawingCanvas } from './drawing.js';
import { attachEdgeInteractions, startResize, getEdge } from './resize.js';
import { setupCubeCanvas } from './cube3d.js';
import { setupStroke3D } from './stroke3d.js';
import { setupSphere2D } from './sphere2d.js';

export function createNoteElement(text, x, y, id, type = 'text', data = '', ts = Date.now(), notesRef) {
    const note = document.createElement('div');
    note.className = 'note';
    note.style.left = x + 'px';
    note.style.top = y + 'px';
    note.setAttribute('data-id', id);
    
    if (type === 'draw') {
        note.setAttribute('data-type', 'draw');
    }

    const header = createNoteHeader(ts);
    note.appendChild(header);

    setupHeaderInteractions(header);
    
    note.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, id);
    });

    if (type === 'text') {
        const content = createTextContent(text, id, notesRef);
        note.appendChild(content);
    } else if (type === 'draw') {
        const canvas = document.createElement('canvas');
        canvas.className = 'draw-canvas';
        note.appendChild(canvas);
        setupDrawingCanvas(canvas, id, data, notesRef);
        setupDrawNoteInteractions(note);
    } else if (type === 'cube') {
        note.setAttribute('data-type', 'cube');
        const canvas = document.createElement('canvas');
        canvas.className = 'cube-canvas';
        note.appendChild(canvas);

        setTimeout(() => setupCubeCanvas(note, id, data, notesRef), 10);
        setupDrawNoteInteractions(note);
    } else if (type === 'gstroke') {
        note.setAttribute('data-type', 'gstroke');
        const canvas = document.createElement('canvas');
        canvas.className = 'gstroke-canvas';
        note.appendChild(canvas);
        setTimeout(() => setupStroke3D(note, id, data, notesRef), 10);
        setupDrawNoteInteractions(note);
    } else if (type === 'sphere2d') {
        note.setAttribute('data-type', 'sphere2d');
        const canvas = document.createElement('canvas');
        canvas.className = 'sphere2d-canvas';
        note.appendChild(canvas);
        setTimeout(() => setupSphere2D(note, id, data, notesRef), 10);
        setupDrawNoteInteractions(note);
    } else if (type === 'image') {
        note.setAttribute('data-type', 'image');
        const img = document.createElement('img');
        img.className = 'note-image';
        img.src = data;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        note.appendChild(img);
    }

    setupNoteInteractions(note, id, notesRef);
    attachEdgeInteractions(note);

    return note;
}

function createNoteHeader(ts) {
    const header = document.createElement('div');
    header.className = 'note-header';
    const dt = new Date(ts);
    const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    header.innerHTML = `<span>${dateStr} ${timeStr}</span>`;
    return header;
}

function setupHeaderInteractions(header) {
    header.addEventListener('mouseenter', () => {
        if (!state.isHoveringInteractive) {
            document.body.classList.add('hovering');
            state.isHoveringInteractive = true;
        }
    });
    header.addEventListener('mouseleave', () => {
        if (state.isHoveringInteractive) {
            document.body.classList.remove('hovering');
            state.isHoveringInteractive = false;
        }
    });
}

function createTextContent(text, id, notesRef) {
    const content = document.createElement('div');
    content.className = 'note-text';
    content.contentEditable = true;
    content.textContent = text;
    
    let previousText = text;
    let updateTimeout = null;
    let isApplyingRemoteUpdate = false;
    
    content.onfocus = () => {
        previousText = content.textContent;
    };
    
    // debounced push text update
    const pushTextUpdate = () => {
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            const newText = content.textContent;
            if (newText !== previousText) {
                notesRef.child(id).child('textUpdates').push({ 
                    text: newText,
                    timestamp: Date.now()
                });
                previousText = newText;
            }
        }, 500);
    };
    
    // every input
    content.addEventListener('input', () => {
        if (!isApplyingRemoteUpdate) {
            pushTextUpdate();
        }
    });
    
    content.onblur = () => {
        const newText = content.textContent;

        if (updateTimeout) clearTimeout(updateTimeout);
        if (newText !== previousText) {
            notesRef.child(id).child('textUpdates').push({ 
                text: newText,
                timestamp: Date.now()
            });
            previousText = newText;
            
            // save text edit action to history
            state.actionHistory.push({
                type: 'textEdit',
                noteId: id,
                previousText: previousText,
                newText: newText
            });
            if (state.actionHistory.length > (state.maxActionHistorySize || 50)) {
                state.actionHistory.shift();
            }
            state.actionRedoHistory = [];
        }
    };
    
    // mark remote updates 
    content._applyRemoteUpdate = (newText) => {
        isApplyingRemoteUpdate = true;
        
        // save current cursor position
        const selection = window.getSelection();
        let cursorOffset = 0;
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(content);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            cursorOffset = preCaretRange.toString().length;
        }
        
        // update text
        content.textContent = newText;
        previousText = newText;
        
        // cursor position
        cursorOffset = Math.min(cursorOffset, newText.length);
        try {
            const range = document.createRange();
            const sel = window.getSelection();
            range.setStart(content.firstChild || content, Math.min(cursorOffset, (content.firstChild?.length || 0)));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {
            try {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(content);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (_) {}
        }
        
        isApplyingRemoteUpdate = false;
    };
    
    // listen for remote text updates
    if (!state.textListeners) state.textListeners = {};
    if (!state.textListeners[id]) {
        state.textListeners[id] = true;
        notesRef.child(id).child('textUpdates').on('child_added', (snapshot) => {
            const updateId = snapshot.key;
            const update = snapshot.val();
            if (update && update.text !== undefined) {
                if (content && content._applyRemoteUpdate) {
                    content._applyRemoteUpdate(update.text);
                } else if (content) {
                    content.textContent = update.text;
                }
            }
        });
    }
    
    return content;
}

function setupDrawNoteInteractions(note) {
    note.addEventListener('mouseenter', (e) => {
        if (!e.target.classList.contains('note-header') && !e.target.closest('.note-header')) {
            document.body.classList.add('mini-cursor');
            document.body.classList.remove('hovering');
            state.isHoveringInteractive = false;
        }
    });
    
    note.addEventListener('mousemove', (e) => {
        if (e.target.classList.contains('note-header') || e.target.closest('.note-header')) {
            document.body.classList.remove('mini-cursor');
            if (!state.isHoveringInteractive) {
                document.body.classList.add('hovering');
                state.isHoveringInteractive = true;
            }
        } else {
            if (!document.body.classList.contains('mini-cursor')) {
                document.body.classList.add('mini-cursor');
                document.body.classList.remove('hovering');
                state.isHoveringInteractive = false;
            }
        }
    });
    
    note.addEventListener('mouseleave', () => {
        document.body.classList.remove('mini-cursor');
        if (state.isHoveringInteractive) {
            document.body.classList.remove('hovering');
            state.isHoveringInteractive = false;
        }
    });
}

function setupNoteInteractions(note, id, notesRef) {
    note.onmousedown = function(e) {
        // track move start for undo/redo
        note._moveStart = {
            x: parseInt(note.style.left, 10) || 0,
            y: parseInt(note.style.top, 10) || 0
        };
        // handle resize mode if selected note
        if (state.resizeModeEnabled && state.resizeModeNoteId === id) {
            const edge = getEdge(note, e.clientX, e.clientY);
            if (edge) {
                // track resize start for undo/redo
                note._resizeStartW = parseInt(note.style.width, 10) || note.offsetWidth;
                note._resizeStartH = parseInt(note.style.height, 10) || note.offsetHeight;
                startResize(note, id, edge, e, notesRef);
                return;
            }
        }
    };

    note.onmouseup = function(e) {
        // track move end 
        const start = note._moveStart;
        const endX = parseInt(note.style.left, 10) || 0;
        const endY = parseInt(note.style.top, 10) || 0;
        if (start && (start.x !== endX || start.y !== endY)) {
            state.actionHistory.push({
                type: 'move',
                noteId: id,
                from: { x: start.x, y: start.y },
                to: { x: endX, y: endY }
            });
            if (state.actionHistory.length > (state.maxActionHistorySize || 50)) {
                state.actionHistory.shift();
            }
            state.actionRedoHistory = [];
        }
        note._moveStart = null;
    };
}

// apply size to note element
export function applySize(note, w, h) {
    note.style.width = Math.max(100, w) + 'px';
    note.style.height = Math.max(100, h) + 'px';
    const canvas = note.querySelector('.draw-canvas');
    if (canvas) {
        requestAnimationFrame(() => {
            const newW = canvas.clientWidth;
            const newH = canvas.clientHeight;
            if (canvas.width !== newW || canvas.height !== newH) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(canvas, 0, 0);
                
                canvas.width = newW;
                canvas.height = newH;
                
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, newW, newH);
                ctx.drawImage(tempCanvas, 0, 0);
            }
        });
    }
}