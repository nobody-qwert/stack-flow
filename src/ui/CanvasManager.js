/**
 * @fileoverview Canvas and pan/zoom functionality
 */

export class CanvasManager {
  constructor() {
    this.canvas = null;
    this.panzoom = null;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.scale = 1;
  }

  initCanvas() {
    this.canvas = document.getElementById('canvas');
    this.setupBasicPanZoom();
  }

  setupBasicPanZoom() {
    const content = document.getElementById('content');
    content.style.transformOrigin = '0 0';
    
    // Mouse wheel zoom - zoom relative to mouse position
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      // Get the bounding rect of the canvas
      const rect = this.canvas.getBoundingClientRect();
      
      // Mouse position relative to the canvas
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Compute world coordinates (content space) under the mouse BEFORE zoom
      const worldX = (mouseX - this.currentX) / this.scale;
      const worldY = (mouseY - this.currentY) / this.scale;
      
      // Compute new scale (clamped)
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(3, this.scale * delta));
      
      // Update translation so that the world point under the mouse stays fixed
      this.currentX = mouseX - worldX * newScale;
      this.currentY = mouseY - worldY * newScale;
      
      // Apply the new scale
      this.scale = newScale;
      
      // Apply the transformation
      content.style.transform = `matrix(${this.scale}, 0, 0, ${this.scale}, ${this.currentX}, ${this.currentY})`;
    }, { passive: false });
    
    // Mouse pan - only if not dragging a node or connecting
    this.canvas.addEventListener('mousedown', (e) => {
      // Only left mouse button should pan
      if (e.button !== 0) return;

      // If a node drag or connection is in progress, do not pan
      if (this.isDraggingNode || this.isConnecting) return;

      // Don't pan if clicking on a node, node header, or variable port
      if (e.target.closest('.node') || e.target.closest('.variable-port')) {
        return;
      }
      
      if (e.target === this.canvas || e.target === content) {
        this.isPanning = true;
        this.startX = e.clientX - this.currentX;
        this.startY = e.clientY - this.currentY;
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.currentX = e.clientX - this.startX;
        this.currentY = e.clientY - this.startY;
        content.style.transform = `matrix(${this.scale}, 0, 0, ${this.scale}, ${this.currentX}, ${this.currentY})`;
      }
    });
    
    document.addEventListener('mouseup', () => {
      this.isPanning = false;
    });
  }

  setDragState(isDragging) {
    this.isDraggingNode = isDragging;
  }

  setConnectionState(isConnecting) {
    this.isConnecting = isConnecting;
  }
}
