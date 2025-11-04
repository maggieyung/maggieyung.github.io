export const state = {
    draggedNote: null,
    offsetX: 0,
    offsetY: 0,
    pendingFocusId: null, 
    contextMenu: null, 
    isHoveringInteractive: false,
    lastMouse: null,
    isResizing: false,
    resizeState: null,
    resizeModeEnabled: false,
    resizeModeNoteId: null,
    activeDrawingNotes: new Set(),
    drawSaveTimeouts: {},
    moveModeEnabled: false,
    moveModeNoteId: null,
    drawingMode: 'pen',
    brushSize: 2,
    brushColor: '#000000',
    brushOpacity: 1,
    // tool settings
    toolSettings: {
        pen:   { size: 1,  flow: 0.15, opacity: 1 },
        eraser:{ size: 20, flow: 1.0,  opacity: 1, max: 50 }
    },
    brushMax: 200, // global max for pen
    pressureCurveAmount: 1.2, // linear, >1 = more sensitive, <1 = less sensitive
    noteMaxWidth: 1280,
    noteMaxHeight: 1152,
    undoHistory: {},  
    redoHistory: {},  
    maxHistorySize: 50,
    actionHistory: [],
    actionRedoHistory: [],
    maxActionHistorySize: 50,
    zoom: 1,
    minZoom: 0.25,
    maxZoom: 4
};
