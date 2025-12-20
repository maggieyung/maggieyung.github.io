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
    const cursorRef = db.ref('cursors/' + userId);
    const connectedRef = db.ref('.info/connected');
    const FRAME_INTERVAL_MS = 16;
    const HEARTBEAT_MS = 10 * 1000;
    const STALE_RENDER_MS = 20 * 1000;
    const STALE_PRUNE_MS = 60 * 1000;
    let lastSent = 0;
    let lastPayload = null;
    const cursorSkins = {};

    const otherCursorSprites = ['/img/cursormini_rain1.png', '/img/cursormini_rain2.png', '/img/cursormini_rain3.png','/img/cursormini_rain4.png','/img/cursormini_rain5.png'];

    // remove cursors on disconnect
    connectedRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
            cursorRef.onDisconnect().remove().catch(() => {});
            const now = Date.now();
            const payload = lastPayload || {
                boardId: null,
                x: 0,
                y: 0,
                drawing: false,
                zoom: 1,
                ts: now,
                active: true
            };
            cursorRef.set(payload);
        }
    });

    function sendCursorUpdate(info, fallbackEvent) {
        const now = Date.now();
        const source = info || {};
        const transform = window.whiteboardTransform || {};
        const scale = transform.scale || window.whiteboardZoom || 1;
        const tx = transform.tx || 0;
        const ty = transform.ty || 0;
        const fx = fallbackEvent ? (fallbackEvent.clientX - tx) / scale : 0;
        const fy = fallbackEvent ? (fallbackEvent.clientY - ty) / scale : 0;
        const payload = {
            boardId: source.boardId || null,
            x: source.x != null ? source.x : fx,
            y: source.y != null ? source.y : fy,
            drawing: !!source.drawing,
            zoom: source.zoom || scale,
            ts: now,
            active: true
        };
        lastPayload = payload;
        cursorRef.set(payload);
    }

    document.addEventListener('mousemove', (e) => {
        const now = Date.now();
        // updates 60fps (every 16ms)
        if (now - lastSent < FRAME_INTERVAL_MS) return;
        lastSent = now;
        const info = getWhiteboardInfo ? getWhiteboardInfo(e) : {};
        sendCursorUpdate(info, e);
    });

    const heartbeatId = setInterval(() => {
        if (!lastPayload) return;
        cursorRef.update({ ts: Date.now(), active: true }).catch(() => {});
    }, HEARTBEAT_MS);

    const cleanup = () => {
        clearInterval(heartbeatId);
        cursorRef.remove().catch(() => {});
    };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);

    // listen for all active cursors 
    function renderCursors(cursors) {
        document.querySelectorAll('.collab-cursor').forEach(el => el.remove());
        const now = Date.now();
        Object.entries(cursors).forEach(([uid, pos]) => {
            if (!pos || !pos.active) return;
            if (uid === userId) return; // do not render own cursor
            if (!pos.ts || (now - pos.ts > STALE_RENDER_MS)) return; // ignore stale cursors
            const wb = document.querySelector(`[data-board-id="${pos.boardId}"]`) || document.getElementById('whiteboard');
            if (!wb) return;
            const transform = window.whiteboardTransform || {};
            const scale = transform.scale || window.whiteboardZoom || 1;
            const tx = transform.tx || 0;
            const ty = transform.ty || 0;
            const screenX = tx + (pos.x || 0) * scale;
            const screenY = ty + (pos.y || 0) * scale;
            let cursor = document.createElement('div');
            cursor.className = 'collab-cursor';
            cursor.style.position = 'absolute';
            // render at consistent screen location
            cursor.style.left = screenX + 'px';
            cursor.style.top = screenY + 'px';
            cursor.style.width = '10px';
            cursor.style.height = '10px';
            cursor.style.borderRadius = '50%';
            cursor.style.background = pos.drawing ? 'rgba(189, 162, 162, 0.1)' : 'rgba(209, 209, 209, 0.1)';
            cursor.style.border = pos.drawing ? '2px solid #e4247d' : '1px solid #533f74ff';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = 9999;
            cursor.title = pos.boardId ? `Board: ${pos.boardId}` : '';
            // mini img
            const img = document.createElement('img');
            const sprite = cursorSkins[uid] || (cursorSkins[uid] = otherCursorSprites[Math.floor(Math.random() * otherCursorSprites.length)]);
            img.src = sprite;
            img.alt = 'cursor';
            img.style.position = 'absolute';
            img.style.left = '110%'; // offset
            img.style.top = '55%';   
            img.style.transform = 'translate(-10%, -50%)';
            img.style.width = '14px';
            img.style.height = '14px';
            img.style.pointerEvents = 'none';
            cursor.appendChild(img);
            document.body.appendChild(cursor);
        });
    }

    let lastCursors = {};
    db.ref('cursors').on('value', (snapshot) => {
        lastCursors = snapshot.val() || {};
        renderCursors(lastCursors);
    });

    // re-render cursors
    window.addEventListener('zoomchange', () => {
        renderCursors(lastCursors);
    });
    // delete inactive cursors 
    const pruneId = setInterval(() => {
        db.ref('cursors').once('value').then(snapshot => {
            const cursors = snapshot.val() || {};
            const now = Date.now();
            Object.entries(cursors).forEach(([uid, pos]) => {
                const ts = pos && pos.ts ? pos.ts : 0;
                const isStale = now - ts > STALE_PRUNE_MS;
                if (isStale) {
                    db.ref('cursors/' + uid).remove();
                }
            });
        });
    }, STALE_PRUNE_MS);

    window.addEventListener('beforeunload', () => clearInterval(pruneId));
    window.addEventListener('pagehide', () => clearInterval(pruneId));
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
    const transform = window.whiteboardTransform || {};
    const zoom = transform.scale || window.whiteboardZoom || 1;
    const tx = transform.tx || 0;
    const ty = transform.ty || 0;
    return {
        boardId: wb.dataset.boardId || 'main',
        x: (e.clientX - tx) / zoom,
        y: (e.clientY - ty) / zoom,
        drawing: window.isDrawing,
        zoom: zoom
    };
});
