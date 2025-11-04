import { state } from './state.js';

let minimapCtx = null;
let smallNoteImg = null;

// zoom/pan state and limits
let currentScale = 1;
const minScale = 0.5;
const maxScale = 3.0;
let currentX = 0; 
let currentY = 0; 
const PAN_LIMIT = 3000; // hard limit in screen px

// bounding box of all coords
function getContentBounds() {
    const wb = document.getElementById('whiteboard');
    if (!wb) return null;
    const notes = wb.querySelectorAll('.note');
    if (!notes.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    notes.forEach(n => {
        const x = parseFloat(n.style.left) || 0;
        const y = parseFloat(n.style.top) || 0;
        const w = parseFloat(n.style.width) || n.offsetWidth || 160;
        const h = parseFloat(n.style.height) || n.offsetHeight || 144;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    });
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
}

function clampPan() {
    const b = getContentBounds();
    if (!b) {
        currentX = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, currentX));
        currentY = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, currentY));
        return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = currentScale;
    const MARGIN = 100; // 100px from viewport edge

    const maxAllowedX = MARGIN - b.minX * s;
    const minAllowedX = (vw - MARGIN) - b.maxX * s;
    const maxAllowedY = MARGIN - b.minY * s;
    const minAllowedY = (vh - MARGIN) - b.maxY * s;

    if (minAllowedX > maxAllowedX) {
        const contentCenterX = ((b.minX + b.maxX) / 2) * s;
        currentX = vw / 2 - contentCenterX;
    } else {
        currentX = Math.max(minAllowedX, Math.min(maxAllowedX, currentX));
    }

    if (minAllowedY > maxAllowedY) {
        const contentCenterY = ((b.minY + b.maxY) / 2) * s;
        currentY = vh / 2 - contentCenterY;
    } else {
        currentY = Math.max(minAllowedY, Math.min(maxAllowedY, currentY));
    }

    currentX = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, currentX));
    currentY = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, currentY));
}

function updateTransform() {
    const wb = document.getElementById('whiteboard');
    if (!wb) return;
    clampPan();
    wb.style.transformOrigin = '0 0';
    wb.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
    state.zoom = currentScale;
    refreshMinimap();
}

function handleZoom(event) {
    // ignore zoom over ui
    if (event.target.closest('.toolbar') ||
        event.target.closest('.color-picker-popup') ||
        event.target.closest('.permanent-note') ||
        event.target.closest('.shortcuts-note') ||
        event.target.closest('#minimap') ||
        event.target.closest('#minimapContainer')) {
        return;
    }
    event.preventDefault();

    const wb = document.getElementById('whiteboard');
    if (!wb) return;

    // zoom towards mouse position
    const rect = wb.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    // content coords before zoom
    const cx = (mouseX - rect.left) / currentScale;
    const cy = (mouseY - rect.top) / currentScale;

    // compute new scale
    let newScale = currentScale + event.deltaY * -0.01;
    newScale = Math.max(minScale, Math.min(maxScale, newScale));
    if (newScale === currentScale) return;

    // adjust pan so the point under the cursor stays stable
    currentX = mouseX - cx * newScale;
    currentY = mouseY - cy * newScale;

    currentScale = newScale;
    updateTransform();
}

let isPanning = false;
let panStartX = 0, panStartY = 0;
let dragStartX = 0, dragStartY = 0;

function onPanStart(e) {
    // middle-click (button 1) anywhere, or left-click (button 0) only on background
    const isMiddleClick = e.button === 1;
    const isLeftClick = e.button === 0;
    
    if (!isMiddleClick && !isLeftClick) return; 
    
    if (e.target.closest('.toolbar') ||
        e.target.closest('.color-picker-popup') ||
        e.target.closest('.permanent-note') ||
        e.target.closest('.shortcuts-note') ||
        e.target.closest('#minimap') ||
        e.target.closest('#minimapContainer')) {
        return;
    }
    
    if (isLeftClick && e.target.closest('.note')) {
        return;
    }
    
    isPanning = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = currentX;
    panStartY = currentY;
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
}

function onPanMove(e) {
    if (!isPanning) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    currentX = panStartX + dx;
    currentY = panStartY + dy;
    updateTransform();
}

function onPanEnd() {
    if (!isPanning) return;
    isPanning = false;
    document.body.style.cursor = '';
}

// ensure canvas has size
export function refreshMinimap() {
    const minimap = document.getElementById('minimap');
    if (!minimap) return;
    const cw = minimap.clientWidth;
    const ch = minimap.clientHeight;
    if (cw && ch) {
        if (minimap.width !== cw) minimap.width = cw;
        if (minimap.height !== ch) minimap.height = ch;
        if (!minimapCtx) minimapCtx = minimap.getContext('2d');
        updateMinimap();
    }
}

function updateMinimap() {
    if (!minimapCtx) return;
    const minimap = document.getElementById('minimap');
    const whiteboard = document.getElementById('whiteboard');
    if (!minimap || !whiteboard) return;

    minimapCtx.clearRect(0, 0, minimap.width, minimap.height);

    const scale = Math.min(minimap.width / window.innerWidth, minimap.height / window.innerHeight);
    const viewportW = Math.max(1, Math.floor(window.innerWidth * scale));
    const viewportH = Math.max(1, Math.floor(window.innerHeight * scale));
    const viewportX = Math.floor((minimap.width - viewportW) / 2);
    const viewportY = Math.floor((minimap.height - viewportH) / 2);

    const notes = whiteboard.querySelectorAll('.note');
    notes.forEach(note => {
        const rect = note.getBoundingClientRect();
        const x = viewportX + (rect.left * scale);
        const y = viewportY + (rect.top * scale);
        const w = Math.max(4, rect.width * scale * 0.3);
        const h = Math.max(4, rect.height * scale * 0.3);
        if (smallNoteImg && smallNoteImg.complete) {
            minimapCtx.drawImage(smallNoteImg, x, y, w, h);
        } else {
            minimapCtx.fillStyle = '#666';
            minimapCtx.fillRect(x, y, w, h);
        }
    });
}

export function initZoom() {
    const minimap = document.getElementById('minimap');
    const minimapContainer = document.getElementById('minimapContainer');
    const minimapClose = document.getElementById('minimapClose');

    const zoomControls = document.getElementById('zoom-controls');
    if (zoomControls && zoomControls.parentNode) {
        zoomControls.parentNode.removeChild(zoomControls);
    }

    smallNoteImg = new Image();
    smallNoteImg.src = '../img/small.png';

    if (minimap) {
        minimapCtx = minimap.getContext('2d');
        refreshMinimap();
        smallNoteImg.onload = () => {
            refreshMinimap();
        };
        window.addEventListener('resize', refreshMinimap);
    }

    minimapClose?.addEventListener('click', (e) => {
        e.stopPropagation();
        minimapContainer.style.display = 'none';
    });

    // dragging minimap 
    let isDragging = false;
    let dragStartX2 = 0, dragStartY2 = 0;
    let contStartX = 0, contStartY = 0;

    minimapContainer?.addEventListener('mousedown', (e) => {
        if (e.target === minimap || e.target === minimapClose) return;
        isDragging = true;
        dragStartX2 = e.clientX;
        dragStartY2 = e.clientY;

        const rect = minimapContainer.getBoundingClientRect();
        minimapContainer.style.left = rect.left + 'px';
        minimapContainer.style.top = rect.top + 'px';
        minimapContainer.style.right = '';
        minimapContainer.style.bottom = '';

        contStartX = rect.left;
        contStartY = rect.top;
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX2;
        const dy = e.clientY - dragStartY2;
        minimapContainer.style.left = (contStartX + dx) + 'px';
        minimapContainer.style.top = (contStartY + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // zoom and pan
    window.addEventListener('wheel', handleZoom, { passive: false });
    document.addEventListener('mousedown', onPanStart);
    document.addEventListener('mousemove', onPanMove);
    document.addEventListener('mouseup', onPanEnd);

    currentScale = state.zoom || 1;
    updateTransform();
    refreshMinimap();
    setInterval(refreshMinimap, 1000);
}
