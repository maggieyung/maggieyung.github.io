import { state } from './state.js';
import { refreshMinimap } from './zoom.js'; 

export function initToolbar() {
    const penBtn = document.getElementById('penBtn');
    const pencilBtn = document.getElementById('pencilBtn');
    const eraserBtn = document.getElementById('eraserBtn');
    const sizeSlider = document.getElementById('sizeSlider');
    const sizeValue = document.getElementById('sizeValue');
    const flowSlider = document.getElementById('flowSlider');
    const flowValue = document.getElementById('flowValue');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    const mapBtn = document.getElementById('mapBtn');

    // default pencil settings
    state.toolSettings.pencil = { size: 28, flow: 0.5, opacity: 1 };

    const syncSlidersFromTool = () => {
        const t = state.toolSettings[state.drawingMode] || { size: 1, flow: 1, opacity: 1 };
        if (sizeSlider)  { sizeSlider.value = String(t.size); sizeValue.textContent = t.size; }
        if (flowSlider)  { flowSlider.value = String(Math.round(t.flow * 100)); flowValue.textContent = Math.round(t.flow * 100); }
        if (opacitySlider){ opacitySlider.value = String(Math.round(t.opacity * 100)); opacityValue.textContent = Math.round(t.opacity * 100); }
    };

    penBtn.addEventListener('click', () => {
        state.drawingMode = 'pen';
        penBtn.classList.add('active');
        pencilBtn.classList.remove('active');
        eraserBtn.classList.remove('active');
        syncSlidersFromTool();
    });

    pencilBtn.addEventListener('click', () => {
        state.drawingMode = 'pencil';
        pencilBtn.classList.add('active');
        penBtn.classList.remove('active');
        eraserBtn.classList.remove('active');
        syncSlidersFromTool();
    });

    eraserBtn.addEventListener('click', () => {
        state.drawingMode = 'eraser';
        eraserBtn.classList.add('active');
        penBtn.classList.remove('active');
        pencilBtn.classList.remove('active');
        syncSlidersFromTool();
    });

    // max pen and eraser
    if (sizeSlider) sizeSlider.max = "50";

    sizeSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10) || 1;
        if (state.drawingMode === 'pen') {
            state.toolSettings.pen.size = v;
        } else if (state.drawingMode === 'eraser') {
            state.toolSettings.eraser.size = v;
        }
        sizeValue.textContent = v;
    });

    flowSlider.addEventListener('input', (e) => {
        const v = (parseInt(e.target.value, 10) || 0) / 100;
        state.toolSettings[state.drawingMode].flow = v;
        flowValue.textContent = Math.round(v * 100);
    });

    opacitySlider.addEventListener('input', (e) => {
        const v = (parseInt(e.target.value, 10) || 0) / 100;
        state.toolSettings[state.drawingMode].opacity = v;
        opacityValue.textContent = Math.round(v * 100);
    });

    mapBtn.addEventListener('click', () => {
        const minimapContainer = document.getElementById('minimapContainer');
        const isVisible = minimapContainer.style.display !== 'none';
        minimapContainer.style.display = isVisible ? 'none' : 'block';
        mapBtn.classList.toggle('active');
        if (!isVisible) requestAnimationFrame(() => refreshMinimap());
    });

    // shortcuts popup toggle
    const shortcutsBtn = document.getElementById('shortcutsBtn');
    const shortcutsPopup = document.getElementById('shortcutsPopup');
    const shortcutsClose = document.getElementById('shortcutsClose');

    shortcutsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = shortcutsPopup.style.display !== 'none';
        if (!isVisible) {
            const toolbarRect = document.querySelector('.toolbar').getBoundingClientRect();
            shortcutsPopup.style.left = (toolbarRect.right + 10) + 'px';
            shortcutsPopup.style.top = (toolbarRect.top) + 'px';
        }
        shortcutsPopup.style.display = isVisible ? 'none' : 'block';
    });

    shortcutsClose?.addEventListener('click', (e) => {
        e.stopPropagation();
        shortcutsPopup.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
        if (!shortcutsPopup.contains(e.target) && e.target !== shortcutsBtn) {
            shortcutsPopup.style.display = 'none';
        }
    });

    initCustomColorPicker();
    // sliders
    syncSlidersFromTool();

    // pencil brush
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            state.drawingMode = 'pencil';
            pencilBtn.classList.add('active');
            penBtn.classList.remove('active');
            eraserBtn.classList.remove('active');
            syncSlidersFromTool();
            e.preventDefault();
        }
    });

    // draggable toolbar
    const toolbar = document.querySelector('.toolbar');
    let isToolbarDragging = false;
    let toolbarDragStartX, toolbarDragStartY, toolbarStartLeft, toolbarStartTop;

    toolbar?.addEventListener('mousedown', (e) => {
        const interactiveTags = ['BUTTON', 'INPUT', 'SELECT', 'LABEL', 'TEXTAREA'];
        if (interactiveTags.includes(e.target.tagName)) return;
        isToolbarDragging = true;
        toolbarDragStartX = e.clientX;
        toolbarDragStartY = e.clientY;
        const rect = toolbar.getBoundingClientRect();
        toolbarStartLeft = rect.left;
        toolbarStartTop = rect.top;
        toolbar.style.position = 'absolute';
        toolbar.style.zIndex = 1000;
    });

    document.addEventListener('mousemove', (e) => {
        if (isToolbarDragging) {
            toolbar.style.left = (toolbarStartLeft + e.clientX - toolbarDragStartX) + 'px';
            toolbar.style.top = (toolbarStartTop + e.clientY - toolbarDragStartY) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isToolbarDragging = false;
    });
}

function initCustomColorPicker() {
    const colorSelector = document.getElementById('colorSelector');
    const colorPreview = document.getElementById('colorPreview');
    const colorPickerPopup = document.getElementById('colorPickerPopup');
    const colorPickerClose = document.getElementById('colorPickerClose');
    const colorWheel = document.getElementById('colorWheel');
    const ctx = colorWheel.getContext('2d');
    
    const centerX = colorWheel.width / 2;
    const centerY = colorWheel.height / 2;
    const outerRadius = colorWheel.width / 2 - 5;
    const innerRadius = outerRadius * 0.8;
    const squareSize = innerRadius * Math.sqrt(2) * 0.9;
    
    let currentHue = 0;
    let currentSaturation = 100;
    let currentLightness = 50;
    let isMouseDown = false;

    const squareIndicator = document.createElement('div');
    squareIndicator.className = 'color-indicator';
    squareIndicator.style.display = 'block';
    colorPickerPopup.appendChild(squareIndicator);

    const ringIndicator = document.createElement('div');
    ringIndicator.className = 'color-indicator-ring';
    ringIndicator.style.display = 'block';
    colorPickerPopup.appendChild(ringIndicator);

    function drawColorPicker(hue) {
        ctx.clearRect(0, 0, colorWheel.width, colorWheel.height);
        
        // hue ring
        for (let angle = 0; angle < 360; angle += 0.5) {
            const startAngle = (angle + 90) * Math.PI / 180;
            const endAngle = (angle + 90.5) * Math.PI / 180;
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius, startAngle, endAngle);
            ctx.arc(centerX, centerY, outerRadius, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
            ctx.fill();
        }
        
        // saturation/lightness square
        const halfSquare = squareSize / 2;
        const squareX = centerX - halfSquare;
        const squareY = centerY - halfSquare;
        
        for (let x = 0; x < squareSize; x++) {
            const saturation = (x / squareSize) * 100;
            for (let y = 0; y < squareSize; y++) {
                const lightness = 100 - (y / squareSize) * 100;
                ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                ctx.fillRect(squareX + x, squareY + y, 1, 1);
            }
        }
        
        updateRingIndicator();
    }

    function updateRingIndicator() {
        const angle = (currentHue + 90) * Math.PI / 180;
        const radius = (innerRadius + outerRadius) / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const rect = colorWheel.getBoundingClientRect();
        const popupRect = colorPickerPopup.getBoundingClientRect();
        ringIndicator.style.left = (rect.left - popupRect.left + x - 5) + 'px';
        ringIndicator.style.top = (rect.top - popupRect.top + y - 5) + 'px';
    }

    function updateSquareIndicator(canvasX, canvasY) {
        const rect = colorWheel.getBoundingClientRect();
        const popupRect = colorPickerPopup.getBoundingClientRect();
        squareIndicator.style.left = (rect.left - popupRect.left + canvasX - 5) + 'px';
        squareIndicator.style.top = (rect.top - popupRect.top + canvasY - 5) + 'px';
    }

    function hslToHex(h, s, l) {
        const tempDiv = document.createElement('div');
        tempDiv.style.color = `hsl(${h}, ${s}%, ${l}%)`;
        document.body.appendChild(tempDiv);
        const rgb = window.getComputedStyle(tempDiv).color.match(/\d+/g);
        document.body.removeChild(tempDiv);
        return '#' + rgb.map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }

    function updateColorAtPosition(x, y) {
        const rect = colorWheel.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;
        const dx = canvasX - centerX;
        const dy = canvasY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= innerRadius && distance <= outerRadius) {
            let hue = Math.atan2(dy, dx) * 180 / Math.PI - 90;
            if (hue < 0) hue += 360;
            currentHue = hue;
            drawColorPicker(currentHue);
            const hex = hslToHex(currentHue, currentSaturation, currentLightness);
            state.brushColor = hex;
            colorPreview.style.backgroundColor = hex;
            return;
        }
        
        const halfSquare = squareSize / 2;
        const squareX = centerX - halfSquare;
        const squareY = centerY - halfSquare;
        
        if (canvasX >= squareX && canvasX <= squareX + squareSize && 
            canvasY >= squareY && canvasY <= squareY + squareSize) {
            currentSaturation = ((canvasX - squareX) / squareSize) * 100;
            currentLightness = 100 - ((canvasY - squareY) / squareSize) * 100;
            const hex = hslToHex(currentHue, currentSaturation, currentLightness);
            state.brushColor = hex;
            colorPreview.style.backgroundColor = hex;
            updateSquareIndicator(canvasX, canvasY);
        }
    }

    let isDragging = false;
    let dragStartX, dragStartY, popupStartX, popupStartY;

    colorPickerPopup.addEventListener('mousedown', (e) => {
        if (e.target === colorWheel || e.target === colorPickerClose) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = colorPickerPopup.getBoundingClientRect();
        popupStartX = rect.left;
        popupStartY = rect.top;
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            colorPickerPopup.style.left = (popupStartX + e.clientX - dragStartX) + 'px';
            colorPickerPopup.style.top = (popupStartY + e.clientY - dragStartY) + 'px';
        }
    });

    document.addEventListener('mouseup', () => isDragging = false);

    colorWheel.addEventListener('mouseenter', () => {
        document.body.classList.add('mini-cursor');
        document.body.classList.remove('hovering');
    });

    colorWheel.addEventListener('mouseleave', () => {
        document.body.classList.remove('mini-cursor');
    });

    colorWheel.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        updateColorAtPosition(e.clientX, e.clientY);
    });

    colorWheel.addEventListener('mousemove', (e) => {
        if (isMouseDown) updateColorAtPosition(e.clientX, e.clientY);
    });

    colorWheel.addEventListener('mouseup', () => isMouseDown = false);
    colorWheel.addEventListener('mouseleave', () => isMouseDown = false);

    colorPickerClose.addEventListener('click', (e) => {
        e.stopPropagation();
        colorPickerPopup.style.display = 'none';
    });

    colorSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = colorPickerPopup.style.display !== 'none';
        if (!isVisible) {
            const rect = colorSelector.getBoundingClientRect();
            colorPickerPopup.style.left = rect.left + 'px';
            colorPickerPopup.style.top = (rect.bottom + 5) + 'px';
            const halfSquare = squareSize / 2;
            updateSquareIndicator(centerX + halfSquare * (currentSaturation / 100), 
                                 centerY + halfSquare * (1 - currentLightness / 100));
            updateRingIndicator();
        }
        colorPickerPopup.style.display = isVisible ? 'none' : 'block';
    });

    drawColorPicker(currentHue);
    const halfSquare = squareSize / 2;
    updateSquareIndicator(centerX + halfSquare, centerY + halfSquare * 0.5);
    updateRingIndicator();
    colorPreview.style.backgroundColor = state.brushColor;
}

export function initBrushPreview() {
    const brushPreview = document.getElementById('brushPreview');
    let isOverCanvas = false;

    const getCurrentBrushSize = () => {
        const tool = state.toolSettings?.[state.drawingMode] || { size: state.brushSize };
        return tool.size * 2;
    };

    const updatePreview = (clientX, clientY, target) => {
        const isCanvas = target && target.classList.contains('draw-canvas');
        if (isCanvas) {
            if (!isOverCanvas) {
                brushPreview.classList.add('active');
                isOverCanvas = true;
            }
            const size = getCurrentBrushSize();
            brushPreview.style.width = size + 'px';
            brushPreview.style.height = size + 'px';
            brushPreview.style.left = (clientX - size / 2) + 'px';
            brushPreview.style.top = (clientY - size / 2) + 'px';
        } else if (isOverCanvas) {
            brushPreview.classList.remove('active');
            isOverCanvas = false;
        }
    };

    document.addEventListener('mousemove', (e) => updatePreview(e.clientX, e.clientY, e.target));
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target) updatePreview(touch.clientX, touch.clientY, target);
        }
    }, { passive: true });

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target) updatePreview(touch.clientX, touch.clientY, target);
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        brushPreview.classList.remove('active');
        isOverCanvas = false;
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        brushPreview.classList.remove('active');
        isOverCanvas = false;
    }, { passive: true });

    // preview size
    document.getElementById('penBtn')?.addEventListener('click', () => {
        brushPreview.style.width = getCurrentBrushSize() + 'px';
        brushPreview.style.height = getCurrentBrushSize() + 'px';
    });
    document.getElementById('eraserBtn')?.addEventListener('click', () => {
        brushPreview.style.width = getCurrentBrushSize() + 'px';
        brushPreview.style.height = getCurrentBrushSize() + 'px';
    });
}