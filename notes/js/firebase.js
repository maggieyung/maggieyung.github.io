export const firebaseConfig = {
    apiKey: "AIzaSyDu3L4WmMTBhSDCAw4060nKsv1961a8OIc",
    authDomain: "notes-9879e.firebaseapp.com",
    databaseURL: "https://notes-9879e-default-rtdb.firebaseio.com",
    projectId: "notes-9879e",
    storageBucket: "notes-9879e.firebasestorage.app",
    messagingSenderId: "764305636861",
    appId: "1:764305636861:web:0db4a28d821b7e7a3aad94"
};

export function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.database();
    db.ref('notes').on('child_added', (snapshot) => {
       
    });
    return db;
}

// cursors

export function setupCollaborativeCursors(db, userId, getWhiteboardInfo) {
    //{ boardId, x, y, drawing, zoom }
    let lastSent = 0;
    document.addEventListener('mousemove', (e) => {
        const now = Date.now();
        // updates 60fps (every 16ms)
        if (now - lastSent < 16) return;
        lastSent = now;
        const info = getWhiteboardInfo ? getWhiteboardInfo(e) : {};
        db.ref('cursors/' + userId).set({
            boardId: info.boardId || null,
            x: info.x != null ? info.x : e.pageX,
            y: info.y != null ? info.y : e.pageY,
            drawing: !!info.drawing,
            zoom: info.zoom || 1,
            ts: now,
            active: true // active cursor
        });
    });

    // mark cursor inactive on page unload
    window.addEventListener('beforeunload', () => {
        db.ref('cursors/' + userId).set({ active: false });
    });

    // listen for all active cursors 
    db.ref('cursors').on('value', (snapshot) => {
        const cursors = snapshot.val() || {};
        document.querySelectorAll('.collab-cursor').forEach(el => el.remove());
        Object.entries(cursors).forEach(([uid, pos]) => {
            if (uid === userId) return;
            if (!pos.active) return; 
            const wb = document.querySelector(`[data-board-id="${pos.boardId}"]`) || document.getElementById('whiteboard');
            if (!wb) return;
            const rect = wb.getBoundingClientRect();
            let cursor = document.createElement('div');
            cursor.className = 'collab-cursor';
            cursor.style.position = 'absolute';
            cursor.style.left = (rect.left + pos.x * (pos.zoom || 1)) + 'px';
            cursor.style.top = (rect.top + pos.y * (pos.zoom || 1)) + 'px';
            cursor.style.width = (12 * (pos.zoom || 1)) + 'px';
            cursor.style.height = (12 * (pos.zoom || 1)) + 'px';
            cursor.style.borderRadius = '50%';
            cursor.style.background = pos.drawing ? 'rgba(189, 162, 162, 0.1)' : 'rgba(209, 209, 209, 0.1)';
            cursor.style.border = pos.drawing ? '2px solid #e4247d' : '1px solid #533f74ff';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = 9999;
            cursor.title = pos.boardId ? `Board: ${pos.boardId}` : '';
            document.body.appendChild(cursor);
        });
    });
}

// real-time updates

export function listenForNotes(db, callback) {
    db.ref('notes').on('child_added', (snapshot) => {
        callback(snapshot.val());
    });
    db.ref('notes').on('child_changed', (snapshot) => {
        callback(snapshot.val());
    });
    db.ref('notes').on('child_removed', (snapshot) => {
        callback(null, snapshot.key);
    });
}



// integration 
const db = initFirebase();
const userId = Math.random().toString(36).substr(2, 9);
setupCollaborativeCursors(db, userId, function(e) {
    // board id and mouse position relative to whiteboard
    const wb = document.getElementById('whiteboard');
    const rect = wb.getBoundingClientRect();
    const zoom = window.whiteboardZoom || 1;
    return {
        boardId: wb.dataset.boardId || 'main',
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
        drawing: window.isDrawing,
        zoom: zoom
    };
});
