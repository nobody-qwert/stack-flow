/**
 * @fileoverview Edge rendering and connection visualization
 */

import { store } from '../core/store.js';

export class EdgeRenderer {
  constructor() {
    // Edge rendering state
  }

  renderEdges(state) {
    const svg = document.getElementById('edges');
    // Clear existing edge groups (but not temp connections)
    const existingEdges = svg.querySelectorAll('.edge-group');
    existingEdges.forEach(edge => edge.remove());
    
    state.diagram.edges.forEach(edge => {
      const edgeElement = this.createEdgeElement(edge, state);
      if (edgeElement) {
        svg.appendChild(edgeElement);
      }
    });
  }

  createEdgeElement(edge, state) {
    const fromNode = store.getNodeById(edge.from.nodeId);
    const toNode = store.getNodeById(edge.to.nodeId);
    
    if (!fromNode || !toNode) return null;
    
    // Find the variables to get their positions within the node
    const fromVariable = fromNode.variables.find(v => v.id === edge.from.portId);
    const toVariable = toNode.variables.find(v => v.id === edge.to.portId);
    
    if (!fromVariable || !toVariable) return null;
    
    // Compute anchors using actual DOM variable rows when available
const { fromX, fromY, toX, toY } = this.calculateEdgePositions(edge, fromVariable, toVariable, fromNode, toNode);
    
    // Create a group to hold both the visual path and the hit area
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'edge-group');
    g.dataset.edgeId = edge.id;
    
    // Generate the path data using the improved routing algorithm
const pathData = this.generateEdgePath(fromX, fromY, toX, toY, edge, fromVariable, toVariable);
    
    // Create invisible hit area path (wider stroke for easier clicking)
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', pathData);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '20'); // Wide invisible stroke for easy clicking
    hitPath.style.cursor = 'pointer';
    hitPath.style.pointerEvents = 'stroke';
    
    // Create visible path
    const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visiblePath.setAttribute('class', `edge ${edge.status || 'ok'}`);
    visiblePath.setAttribute('d', pathData);
    visiblePath.setAttribute('fill', 'none');
    visiblePath.setAttribute('stroke', '#666');
    visiblePath.setAttribute('stroke-width', '2'); // Visual stroke width
    visiblePath.style.pointerEvents = 'none'; // Let hit area handle clicks
    
    // Add arrowhead
    this.addArrowhead(visiblePath, edge.id);
    
    // Add paths to group (hit area first, then visible)
    g.appendChild(hitPath);
    g.appendChild(visiblePath);
    
    // Add click handler to the group
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Edge clicked, setting selection to:', edge.id);
      store.setSelection('edge', edge.id);
    });
    
    // Add selection styling
    if (state.selection.type === 'edge' && state.selection.ids.includes(edge.id)) {
      visiblePath.classList.add('selected');
    }
    
    return g;
  }

calculateEdgePositions(edge, fromVariable, toVariable, fromNode, toNode) {
    const content = document.getElementById('content');
    const contentRect = content.getBoundingClientRect();
    const transform = getComputedStyle(content).transform;
    let contentScale = 1;
    if (transform && transform !== 'none') {
      try {
        const m = new DOMMatrixReadOnly(transform);
        contentScale = m.a || 1;
      } catch (err) {
        contentScale = 1;
      }
    }
    
    const fromVarEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"]`);
    const toVarEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"]`);
    
    let fromX, fromY, toX, toY;
    
    if (fromVarEl && toVarEl) {
      const fromRect = fromVarEl.getBoundingClientRect();
      const toRect = toVarEl.getBoundingClientRect();
      
      // Get node elements and their positions
      const fromNodeEl = document.querySelector(`.node[data-node-id="${fromNode.id}"]`);
      const toNodeEl = document.querySelector(`.node[data-node-id="${toNode.id}"]`);
      
      if (fromNodeEl && toNodeEl) {
        const fromNodeRect = fromNodeEl.getBoundingClientRect();
        const toNodeRect = toNodeEl.getBoundingClientRect();
        
        // Keep Y at the variable row center
        fromY = (fromRect.top + fromRect.height / 2 - contentRect.top) / contentScale;
        toY = (toRect.top + toRect.height / 2 - contentRect.top) / contentScale;

        // Find the actual port elements to determine exact connection points
        const fromSelectorSide = edge?.from?.side || 'out';
        const toSelectorSide = edge?.to?.side || 'in';
        const fromPortEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"] .variable-port.${fromSelectorSide}`);
        const toPortEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"] .variable-port.${toSelectorSide}`);
        
        if (fromPortEl && toPortEl) {
          // Use the actual port positions to determine which side to connect from
          const fromPortRect = fromPortEl.getBoundingClientRect();
          const toPortRect = toPortEl.getBoundingClientRect();
          
          // Determine if ports are on left or right side of their nodes
          const fromPortIsLeft = fromPortEl.classList.contains('in');
          const toPortIsLeft = toPortEl.classList.contains('in');
          
          // Anchor at the node's outer edge (slightly outside) while keeping the port's Y center
          const edgeMargin = 1; // px offset outward so arrow stays visible outside node
          const marginUnits = edgeMargin / contentScale;

          fromX = (fromPortIsLeft
            ? (fromNodeRect.left - contentRect.left) / contentScale - marginUnits
            : (fromNodeRect.right - contentRect.left) / contentScale + marginUnits);
          toX = (toPortIsLeft
            ? (toNodeRect.left - contentRect.left) / contentScale - marginUnits
            : (toNodeRect.right - contentRect.left) / contentScale + marginUnits);

          // Keep Y anchored to exact port centers
          fromY = (fromPortRect.top + fromPortRect.height / 2 - contentRect.top) / contentScale;
          toY = (toPortRect.top + toPortRect.height / 2 - contentRect.top) / contentScale;
        } else {
          // Fallback: determine which sides to connect based on node positions
          const fromNodeCenterX = fromNodeRect.left + fromNodeRect.width / 2;
          const toNodeCenterX = toNodeRect.left + toNodeRect.width / 2;
          
          // Connect from the side that's closest to the target node
          if (fromNodeCenterX <= toNodeCenterX) {
            // From node is to the left, connect from right side to left side
            fromX = (fromNodeRect.right - contentRect.left) / contentScale;
            toX = (toNodeRect.left - contentRect.left) / contentScale;
          } else {
            // From node is to the right, connect from left side to right side  
            fromX = (fromNodeRect.left - contentRect.left) / contentScale;
            toX = (toNodeRect.right - contentRect.left) / contentScale;
          }
        }
      } else {
        // Fallback if nodes not found - still try to use port positions
        fromY = (fromRect.top + fromRect.height / 2 - contentRect.top) / contentScale;
        toY = (toRect.top + toRect.height / 2 - contentRect.top) / contentScale;
        
        // Try to find the actual port elements even in fallback
        const fromSelectorSide = edge?.from?.side || 'out';
        const toSelectorSide = edge?.to?.side || 'in';
        const fromPortEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"] .variable-port.${fromSelectorSide}`);
        const toPortEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"] .variable-port.${toSelectorSide}`);
        
        if (fromPortEl && toPortEl) {
          // Use the actual port positions for precise connections
          const fromPortRect = fromPortEl.getBoundingClientRect();
          const toPortRect = toPortEl.getBoundingClientRect();
          
          // Connect from the center of the actual ports
          fromX = (fromPortRect.left + fromPortRect.width / 2 - contentRect.left) / contentScale;
          toX = (toPortRect.left + toPortRect.width / 2 - contentRect.left) / contentScale;
        } else {
          // Final fallback - use variable centers
          fromX = (fromRect.left + fromRect.width / 2 - contentRect.left) / contentScale;
          toX = (toRect.left + toRect.width / 2 - contentRect.left) / contentScale;
        }
      }
    } else {
      // Fallback to approximate positions
      const fromNodeEl = document.querySelector(`.node[data-node-id="${fromNode.id}"]`);
      const toNodeEl = document.querySelector(`.node[data-node-id="${toNode.id}"]`);
      const fromNodeWidth = fromNodeEl ? fromNodeEl.getBoundingClientRect().width : (fromNode.width || 200);
      const toNodeWidth = toNodeEl ? toNodeEl.getBoundingClientRect().width : (toNode.width || 200);
      const nodeHeaderHeight = 30;
      const variableHeight = 25;
      const variableGroupHeaderHeight = 0;
      
      const fromVarIndex = fromNode.variables.indexOf(fromVariable);
      const toVarIndex = toNode.variables.indexOf(toVariable);
      
      fromY = fromNode.position.y + nodeHeaderHeight + variableGroupHeaderHeight + (fromVarIndex * variableHeight) + variableHeight / 2;
      toY = toNode.position.y + nodeHeaderHeight + variableGroupHeaderHeight + (toVarIndex * variableHeight) + variableHeight / 2;
      
      // Position edges left-to-right based on node positions
      const preferRight = fromNode.position.x <= toNode.position.x;
      fromX = fromNode.position.x + (preferRight ? fromNodeWidth : 0);
      toX = toNode.position.x + (preferRight ? 0 : toNodeWidth);
    }

    return { fromX, fromY, toX, toY };
  }

  generateEdgePath(fromX, fromY, toX, toY, edge, fromVariable, toVariable) {
    // Prefer persisted sides from the edge object (exact user-selected ports)
    let fromSide = edge?.from?.side ? (edge.from.side === 'in' ? 'left' : 'right') : 'right';
    let toSide = edge?.to?.side ? (edge.to.side === 'in' ? 'left' : 'right') : 'left';

    // Also look up port elements using those sides for geometry fallback/refinement
    const selFromSide = edge?.from?.side || 'out';
    const selToSide = edge?.to?.side || 'in';
    const fromPortEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"] .variable-port.${selFromSide}`);
    const toPortEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"] .variable-port.${selToSide}`);
    
    if ((!edge?.from?.side || !edge?.to?.side) && fromPortEl && toPortEl) {
      // Determine sides based on port classes and positions (fallback)
      const fromNodeEl = fromPortEl.closest('.node');
      const toNodeEl = toPortEl.closest('.node');
      
      if (fromNodeEl && toNodeEl) {
        const fromNodeRect = fromNodeEl.getBoundingClientRect();
        const toNodeRect = toNodeEl.getBoundingClientRect();
        const fromPortRect = fromPortEl.getBoundingClientRect();
        const toPortRect = toPortEl.getBoundingClientRect();
        
        // Determine which side of the node each port is on
        const fromNodeCenterX = fromNodeRect.left + fromNodeRect.width / 2;
        const toNodeCenterX = toNodeRect.left + toNodeRect.width / 2;
        
        fromSide = fromPortRect.left < fromNodeCenterX ? 'left' : 'right';
        toSide = toPortRect.left < toNodeCenterX ? 'left' : 'right';
      }
    }
    
    // SMOOTH SINGLE-BEZIER ROUTING (no sharp joins)
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.hypot(dx, dy);

    // Tangent directions at endpoints based on exact selected port sides
    const fromDir = fromSide === 'right' ? 1 : -1;
    const toDir = toSide === 'left' ? -1 : 1;

    // Adaptive control distance
    let control = Math.min(Math.max(60, distance * 0.35), 240);

    // Encourage broader curves for same-side or backwards connections
    const backwards = (fromSide === 'right' && toSide === 'left' && dx < 0) ||
                      (fromSide === 'left' && toSide === 'right' && dx > 0);
    if (fromSide === toSide) control = Math.max(control, 160);
    if (backwards) control = Math.max(control, 200);

    // Slight vertical easing to reduce flatness on steep angles
    const vEase = Math.sign(dy) * Math.min(60, Math.abs(dy) * 0.25);

    const c1x = fromX + fromDir * control;
    const c1y = fromY + vEase * 0.3;
    const c2x = toX + toDir * control;
    const c2y = toY - vEase * 0.3;

    const pathData = `M ${fromX} ${fromY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toX} ${toY}`;

    return pathData;
  }

  addArrowhead(visiblePath, edgeId) {
    const arrowId = `arrow-${edgeId}`;
    const svg = document.getElementById('edges');
    const defs = svg.querySelector('defs') || svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'defs'));
    
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', arrowId);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto');
    
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
    arrowPath.setAttribute('class', 'edge-arrow');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    
    visiblePath.setAttribute('marker-end', `url(#${arrowId})`);
  }
}
