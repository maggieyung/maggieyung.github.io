import { state } from './state.js';
import { NOTE_W, NOTE_H } from './constants.js';

let globalNotesRef = null;
let globalBoard = null;

// screen coords to whiteboard content
function screenToWhiteboard(screenX, screenY) {
    const wb = document.getElementById('whiteboard');
    const rect = wb.getBoundingClientRect();
    const zoom = state.zoom || 1;
    return {
        x: (screenX - rect.left) / zoom,
        y: (screenY - rect.top) / zoom
    };
}

export function initContextMenu(notesRef, board) {
    globalNotesRef = notesRef;
    globalBoard = board;
    
    // context menu on page
    document.addEventListener('contextmenu', (e) => {
        // if right-clicking on a note
        const noteEl = e.target.closest('.note');
        if (noteEl) {
            e.preventDefault();
            const noteId = noteEl.getAttribute('data-id');
            showContextMenu(e.clientX, e.clientY, noteId);
        } else {
            e.preventDefault();
            showBoardContextMenu(e.clientX, e.clientY);
        }
    });
    
    document.addEventListener('click', () => {
        if (state.contextMenu) {
            state.contextMenu.remove();
            state.contextMenu = null;
        }
    });
}

export function showBoardContextMenu(x, y) {
    if (state.contextMenu) state.contextMenu.remove();

    state.contextMenu = document.createElement('div');
    state.contextMenu.className = 'context-menu';
    state.contextMenu.style.left = x + 'px';
    state.contextMenu.style.top = y + 'px';

    const textNoteItem = document.createElement('div');
    textNoteItem.className = 'context-menu-item';
    textNoteItem.textContent = 'New Text';
    textNoteItem.onclick = (e) => {
        e.stopPropagation();
        const pos = screenToWhiteboard(x, y);
        const noteX = pos.x - NOTE_W / 2;
        const noteY = pos.y - NOTE_H / 2;
        const newRef = globalNotesRef.push();
        state.pendingFocusId = newRef.key;
        newRef.set({ type: 'text', text: '', x: noteX, y: noteY, timestamp: Date.now() });
        state.contextMenu.remove();
        state.contextMenu = null;
    };

    const paintNoteItem = document.createElement('div');
    paintNoteItem.className = 'context-menu-item';
    paintNoteItem.textContent = 'New Paint';
    paintNoteItem.onclick = (e) => {
        e.stopPropagation();
        const pos = screenToWhiteboard(x, y);
        const noteX = pos.x - NOTE_W / 2;
        const noteY = pos.y - NOTE_H / 2;
        const newRef = globalNotesRef.push();
        newRef.set({ type: 'draw', data: '', x: noteX, y: noteY, timestamp: Date.now() });
        state.contextMenu.remove();
        state.contextMenu = null;
    };

    state.contextMenu.appendChild(textNoteItem);
    state.contextMenu.appendChild(paintNoteItem);
    document.body.appendChild(state.contextMenu);
}

export function showContextMenu(x, y, noteId) {
    if (state.contextMenu) state.contextMenu.remove();

    state.contextMenu = document.createElement('div');
    state.contextMenu.className = 'context-menu';
    state.contextMenu.style.left = x + 'px';
    state.contextMenu.style.top = y + 'px';

    const moveItem = createMoveMenuItem(noteId);
    const resizeItem = createResizeMenuItem(noteId);
    const deleteItem = createDeleteMenuItem(noteId);

    state.contextMenu.appendChild(moveItem);
    state.contextMenu.appendChild(resizeItem);
    state.contextMenu.appendChild(deleteItem);
    document.body.appendChild(state.contextMenu);
}

function createMoveMenuItem(noteId) {
    const moveItem = document.createElement('div');
    moveItem.className = 'context-menu-item';
    moveItem.textContent = 'Move';
    moveItem.onclick = (e) => {
        e.stopPropagation();
        
        // clear active
        if (state.resizeModeEnabled && state.resizeModeNoteId !== noteId) {
            const oldNote = document.querySelector(`[data-id="${state.resizeModeNoteId}"]`);
            if (oldNote) {
                oldNote.classList.remove('resize-mode');
                oldNote.querySelectorAll('.resize-circle').forEach(c => c.remove());
            }
            state.resizeModeEnabled = false;
            state.resizeModeNoteId = null;
        }
        
        const noteEl = document.querySelector(`[data-id="${noteId}"]`);
        if (noteEl) {
            state.moveModeEnabled = true;
            state.moveModeNoteId = noteId;
            noteEl.classList.add('dragging');
            
            const movePreview = (e) => {
                // move note
                if (state.moveModeNoteId !== noteId) return;
                
                const pos = screenToWhiteboard(e.clientX, e.clientY);
                const newX = pos.x - noteEl.offsetWidth / 2;
                const newY = pos.y - noteEl.offsetHeight / 2;
                noteEl.style.left = newX + 'px';
                noteEl.style.top = newY + 'px';
            };
            
            const finalizeMove = (e) => {
                // if active note
                if (state.moveModeNoteId !== noteId) return;
                
                const x = parseInt(noteEl.style.left);
                const y = parseInt(noteEl.style.top);
                globalNotesRef.child(noteId).update({ x, y });
                noteEl.classList.remove('dragging');
                state.moveModeEnabled = false;
                state.moveModeNoteId = null;
                document.removeEventListener('mousemove', movePreview);
                document.removeEventListener('click', finalizeMove);
            };
            
            document.addEventListener('mousemove', movePreview);
            setTimeout(() => {
                document.addEventListener('click', finalizeMove);
            }, 100);
        }
        
        state.contextMenu.remove();
        state.contextMenu = null;
    };
    return moveItem;
}

function createResizeMenuItem(noteId) {
    const resizeItem = document.createElement('div');
    resizeItem.className = 'context-menu-item';
    resizeItem.textContent = 'Resize';
    resizeItem.onclick = (e) => {
        e.stopPropagation();
        
        // clear active modes
        if (state.resizeModeEnabled && state.resizeModeNoteId !== noteId) {
            const oldNote = document.querySelector(`[data-id="${state.resizeModeNoteId}"]`);
            if (oldNote) {
                oldNote.classList.remove('resize-mode');
                oldNote.querySelectorAll('.resize-circle').forEach(c => c.remove());
            }
        }
        if (state.moveModeEnabled && state.moveModeNoteId !== noteId) {
            const oldNote = document.querySelector(`[data-id="${state.moveModeNoteId}"]`);
            if (oldNote) oldNote.classList.remove('dragging');
            state.moveModeEnabled = false;
            state.moveModeNoteId = null;
        }
        
        state.resizeModeEnabled = true;
        state.resizeModeNoteId = noteId;
        
        const noteEl = document.querySelector(`[data-id="${noteId}"]`);
        if (noteEl) {
            noteEl.classList.add('resize-mode');
            
            noteEl.querySelectorAll('.resize-circle').forEach(c => c.remove());
            
            const circleTopRight = document.createElement('div');
            circleTopRight.className = 'resize-circle';
            circleTopRight.style.top = '-8px';
            circleTopRight.style.right = '-8px';
            
            const circleBottomLeft = document.createElement('div');
            circleBottomLeft.className = 'resize-circle';
            circleBottomLeft.style.bottom = '-8px';
            circleBottomLeft.style.left = '-8px';
            
            noteEl.appendChild(circleTopRight);
            noteEl.appendChild(circleBottomLeft);
        }
        
        state.contextMenu.remove();
        state.contextMenu = null;
    };
    return resizeItem;
}

function createDeleteMenuItem(noteId) {
    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item';
    deleteItem.textContent = 'Delete Note';
    deleteItem.onclick = (e) => {
        e.stopPropagation();
        
        // note data
        globalNotesRef.child(noteId).once('value', (snapshot) => {
            const noteData = snapshot.val();
            if (noteData) {
                // save delete action to history
                state.actionHistory.push({
                    type: 'delete',
                    noteId: noteId,
                    noteData: noteData
                });
                if (state.actionHistory.length > (state.maxActionHistorySize || 50)) {
                    state.actionHistory.shift();
                }
                state.actionRedoHistory = [];
            }

            // delete note
            globalNotesRef.child(noteId).remove();
        });
        
        state.contextMenu.remove();
        state.contextMenu = null;
    };
    return deleteItem;
}