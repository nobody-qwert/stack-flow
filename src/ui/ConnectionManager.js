/**
 * @fileoverview Connection management for port-to-port connections
 */

import { store } from '../core/store.js';
import { generateEdgeId } from '../core/id.js';

export class ConnectionManager {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
    this.isConnecting = false;
    this.connectionState = null;
  }

  makePortConnectable(portElement, variable) {
    let isConnecting = false;
    let connectionLine = null;
    let hotPortEl = null; // preview target port while connecting
    
    const handleMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      isConnecting = true;
      this.isConnecting = true;
      this.canvasManager.setConnectionState(true);
      
      // Create temporary connection line (overlay, red dashed, above nodes)
      const svg = document.getElementById('edgesOverlay') || document.getElementById('edges');
      connectionLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      connectionLine.setAttribute('class', 'temp-connection');
      connectionLine.setAttribute('stroke', '#dc3545');
      connectionLine.setAttribute('stroke-width', '2');
      connectionLine.setAttribute('stroke-dasharray', '6,6');
      
      // Get the variable row edge position relative to the content container
      const content = document.getElementById('content');
      content.classList.add('connecting');
      const contentRect = content.getBoundingClientRect();
      const transform = getComputedStyle(content).transform;
      let contentScale = 1;
      if (transform && transform !== 'none') {
        try { const m = new DOMMatrixReadOnly(transform); contentScale = m.a || 1; } catch (err) { contentScale = 1; }
      }
      const portRect = portElement.getBoundingClientRect();
      const varRow = portElement.closest('.variable');
      const varRect = varRow ? varRow.getBoundingClientRect() : portRect;
      
      // Start the connection from the exact center of the clicked port
      const startX = (portRect.left + portRect.width / 2 - contentRect.left) / contentScale;
      const startY = (portRect.top + portRect.height / 2 - contentRect.top) / contentScale;
      
      connectionLine.setAttribute('x1', startX);
      connectionLine.setAttribute('y1', startY);
      connectionLine.setAttribute('x2', startX);
      connectionLine.setAttribute('y2', startY);
      
      svg.appendChild(connectionLine);
      // Visual: origin port filled while mouse is held down
      portElement.classList.add('port-active');
      
      // Store connection state
      const fromSide = portElement.dataset.portSide;
      this.connectionState = {
        fromVariable: variable,
        fromPort: portElement,
        fromSide,
        startX,
        startY
      };
      
      // Mark eligible/ineligible ports during connect
      const allPorts = document.querySelectorAll('.variable-port');
      const originNodeEl = portElement.closest('.node');
      allPorts.forEach(p => {
        const pNode = p.closest('.node');
        // Disable all ports within the same node as the origin and the origin port itself
        if (pNode === originNodeEl || p === portElement) {
          p.classList.add('ineligible');
          p.classList.remove('eligible');
        } else {
          p.classList.add('eligible');
          p.closest('.variable')?.classList.add('eligible-target');
        }
      });
    };
    
    const handleMouseMove = (e) => {
      if (!isConnecting || !connectionLine) return;
      
      // Get mouse position relative to content container
      const content = document.getElementById('content');
      const contentRect = content.getBoundingClientRect();
      const transform = getComputedStyle(content).transform;
      let contentScale = 1;
      if (transform && transform !== 'none') {
        try { const m = new DOMMatrixReadOnly(transform); contentScale = m.a || 1; } catch (err) { contentScale = 1; }
      }
      const currentX = (e.clientX - contentRect.left) / contentScale;
      const currentY = (e.clientY - contentRect.top) / contentScale;
      
      connectionLine.setAttribute('x2', currentX);
      connectionLine.setAttribute('y2', currentY);

      // Highlight a valid target port under cursor while dragging
      const hovered = document.elementFromPoint(e.clientX, e.clientY)?.closest('.variable-port');
      const fromSide = this.connectionState?.fromSide;
      const originNodeEl = portElement.closest('.node');

      const isValidTarget = (el) => {
        if (!el) return false;
        const nodeEl = el.closest('.node');
        if (!nodeEl || nodeEl === originNodeEl) return false;
        return true;
      };

      // Update hot target highlight
      if (hotPortEl && hotPortEl !== hovered) {
        hotPortEl.classList.remove('port-hot');
        hotPortEl = null;
      }
      if (isValidTarget(hovered)) {
        if (hotPortEl !== hovered) {
          hotPortEl = hovered;
          hotPortEl.classList.add('port-hot');
        }
      }
    };
    
    const handleMouseUp = (e) => {
      if (!isConnecting) return;
      
      isConnecting = false;
      this.isConnecting = false;
      this.canvasManager.setConnectionState(false);
      
      // Clear connecting UI state
      const content = document.getElementById('content');
      content.classList.remove('connecting');
      
      // Remove temporary line
      if (connectionLine) {
        connectionLine.remove();
        connectionLine = null;
      }

      // Clear port fill feedback (origin + hot target)
      portElement.classList.remove('port-active');
      if (hotPortEl) {
        hotPortEl.classList.remove('port-hot');
        hotPortEl = null;
      }
      
      // Check if we dropped on another port
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const targetPort = targetElement?.closest('.variable-port');

      // Clear guidance classes
      document.querySelectorAll('.variable-port.eligible, .variable-port.ineligible').forEach(p => p.classList.remove('eligible','ineligible'));
      document.querySelectorAll('.variable.eligible-target').forEach(el => el.classList.remove('eligible-target'));
      
      if (targetPort && targetPort !== portElement) {
        const targetVariableId = targetPort.dataset.variableId;
        const targetNodeElement = targetPort.closest('.node');
        const targetNodeId = targetNodeElement?.dataset.nodeId;
        const currentNodeElement = portElement.closest('.node');
        const currentNodeId = currentNodeElement?.dataset.nodeId;

        // Allow connections between any ports as long as nodes differ
        if (targetNodeId && targetVariableId && targetNodeId !== currentNodeId) {
          this.createConnection(
            this.connectionState.fromVariable,
            targetNodeId,
            targetVariableId,
            this.connectionState.fromSide,
            targetPort.dataset.portSide
          );
        }
      }
      
      // Clear connection state
      this.connectionState = null;
      
      // Remove global listeners
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    portElement.addEventListener('mousedown', (e) => {
      handleMouseDown(e);
      // Add global listeners only when connecting
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  createConnection(fromVariable, toNodeId, toVariableId, fromSide, toSide) {
    // Find the from node
    const state = store.getState();
    const fromNode = state.diagram.nodes.find(node =>
      node.variables.some(v => v.id === fromVariable.id)
    );
    
    if (!fromNode) return;
    
    // Create edge with exact selected port sides
    const edge = {
      id: generateEdgeId(),
      from: { nodeId: fromNode.id, portId: fromVariable.id, side: fromSide },
      to: { nodeId: toNodeId, portId: toVariableId, side: toSide },
      status: 'ok'
    };
    
    store.addEdge(edge);
    console.log('Created connection:', edge);
  }
}
