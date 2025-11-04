import { state } from './state.js';
import { EDGE_MARGIN, ASPECT_RATIO, MIN_W } from './constants.js';

export function getEdge(note, clientX, clientY) {
    const r = note.getBoundingClientRect();
    const left = clientX - r.left;
    const top = clientY - r.top;
    const right = r.right - clientX;
    const bottom = r.bottom - clientY;
    
    const nearL = left <= EDGE_MARGIN && left >= -EDGE_MARGIN;
    const nearR = right <= EDGE_MARGIN && right >= -EDGE_MARGIN;
    const nearT = top <= EDGE_MARGIN && top >= -EDGE_MARGIN;
    const nearB = bottom <= EDGE_MARGIN && bottom >= -EDGE_MARGIN;

    if ((nearL && nearT)) return 'nw';
    if ((nearR && nearT)) return 'ne';
    if ((nearL && nearB)) return 'sw';
    if ((nearR && nearB)) return 'se';
    if (nearL) return 'w';
    if (nearR) return 'e';
    if (nearT) return 'n';
    if (nearB) return 's';
    return '';
}

export function startResize(note, id, edge, e, notesRef) {
    state.isResizing = true;
    note.classList.add('resizing');
    const r = note.getBoundingClientRect();
    state.resizeState = {
        id,
        note,
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: parseInt(note.style.left, 10) || r.left,
        startTop: parseInt(note.style.top, 10) || r.top,
        startW: parseInt(note.style.width, 10) || r.width,
        startH: parseInt(note.style.height, 10) || r.height,
        cachedDraw: null,
        notesRef
    };
    const canvas = note.querySelector('.draw-canvas');
    if (canvas) {
        try { state.resizeState.cachedDraw = canvas.toDataURL('image/png'); } catch (_) {}
    }
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
}

function onResizeMove(e) {
    if (!state.resizeState) return;
    const { note, edge, startX, startY, startLeft, startTop, startW, startH, cachedDraw } = state.resizeState;
    let newLeft = startLeft, newTop = startTop, newW = startW, newH = startH;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (edge.includes('e') || edge.includes('w')) {
        if (edge.includes('e')) {
            newW = startW + dx;
        } else {
            newW = startW - dx;
        }
        newH = newW / ASPECT_RATIO;
    } else {
        if (edge.includes('s')) {
            newH = startH + dy;
        } else {
            newH = startH - dy;
        }
        newW = newH * ASPECT_RATIO;
    }

    newW = Math.max(MIN_W, Math.min(state.noteMaxWidth, newW));
    newH = newW / ASPECT_RATIO;

    if (edge.includes('w')) {
        newLeft = startLeft + (startW - newW);
    }
    if (edge.includes('n')) {
        newTop = startTop + (startH - newH);
    }

    note.style.left = newLeft + 'px';
    note.style.top = newTop + 'px';
    note.style.width = newW + 'px';
    note.style.height = newH + 'px';

    const canvas = note.querySelector('.draw-canvas');
    if (canvas && cachedDraw) {
        requestAnimationFrame(() => {
            const cw = canvas.clientWidth;
            const ch = canvas.clientHeight;
            if (canvas.width !== cw || canvas.height !== ch) {
                const oldW = canvas.width;
                const oldH = canvas.height;
                
                canvas.width = cw;
                canvas.height = ch;
                
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, cw, ch);
                    ctx.drawImage(img, 0, 0, oldW, oldH, 0, 0, oldW, oldH);
                };
                img.src = cachedDraw;
            }
        });
    }
}

function onResizeEnd() {
    if (!state.resizeState) return;
    const { id, note, notesRef } = state.resizeState;
    note.classList.remove('resizing');
    const w = parseInt(note.style.width, 10) || 160;
    const h = parseInt(note.style.height, 10) || 144;
    const x = parseInt(note.style.left, 10) || 0;
    const y = parseInt(note.style.top, 10) || 0;

    const canvas = note.querySelector('.draw-canvas');
    if (canvas) {
        try {
            const url = canvas.toDataURL('image/png');
            notesRef.child(id).update({ w, h, x, y, data: url });
        } catch (_) {
            notesRef.child(id).update({ w, h, x, y });
        }
    } else {
        notesRef.child(id).update({ w, h, x, y });
    }

    state.resizeState = null;
    state.isResizing = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
}

export function attachEdgeInteractions(note) {
    const isDrawNote = note.getAttribute('data-type') === 'draw';
    
    note.addEventListener('mousemove', (e) => {
        if (state.isResizing) return;
        
        if (!state.resizeModeEnabled) {
            if (e.target.classList.contains('note-header') || e.target.closest('.note-header')) {
                if (!state.isHoveringInteractive) {
                    document.body.classList.add('hovering');
                    state.isHoveringInteractive = true;
                }
            } else {
                if (state.isHoveringInteractive) {
                    document.body.classList.remove('hovering');
                    state.isHoveringInteractive = false;
                }
            }
        }
    });
    
    note.addEventListener('mouseleave', () => {
        if (state.isHoveringInteractive) {
            document.body.classList.remove('hovering');
            state.isHoveringInteractive = false;
        }
        if (!isDrawNote && !state.resizeModeEnabled) {
            document.body.classList.remove('mini-cursor');
        }
    });
}

export function initResizeModeListener() {
    document.addEventListener('mousemove', (e) => {
        if (!state.resizeModeEnabled || state.isResizing || !state.resizeModeNoteId) return;
        
        const noteEl = document.querySelector(`[data-id="${state.resizeModeNoteId}"]`);
        if (!noteEl) return;
        
        const edge = getEdge(noteEl, e.clientX, e.clientY);
        
        if (edge) {
            if (!document.body.classList.contains('mini-cursor')) {
                document.body.classList.add('mini-cursor');
                document.body.classList.remove('hovering');
                state.isHoveringInteractive = false;
            }
        } else {
            const isDrawNote = noteEl.getAttribute('data-type') === 'draw';
            if (!isDrawNote || !e.target.closest(`[data-id="${state.resizeModeNoteId}"]`)) {
                if (document.body.classList.contains('mini-cursor')) {
                    document.body.classList.remove('mini-cursor');
                }
            }
        }
    });
}
