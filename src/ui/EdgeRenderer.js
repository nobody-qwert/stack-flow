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
    const { fromX, fromY, toX, toY } = this.calculateEdgePositions(fromVariable, toVariable, fromNode, toNode);
    
    // Create a group to hold both the visual path and the hit area
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'edge-group');
    g.dataset.edgeId = edge.id;
    
    // Generate the path data using the improved routing algorithm
    const pathData = this.generateEdgePath(fromX, fromY, toX, toY, fromVariable, toVariable);
    
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

  calculateEdgePositions(fromVariable, toVariable, fromNode, toNode) {
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
        const fromPortEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"] .variable-port.out`);
        const toPortEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"] .variable-port.in`);
        
        if (fromPortEl && toPortEl) {
          // Use the actual port positions to determine which side to connect from
          const fromPortRect = fromPortEl.getBoundingClientRect();
          const toPortRect = toPortEl.getBoundingClientRect();
          
          // Determine if ports are on left or right side of their nodes
          const fromPortIsLeft = fromPortEl.classList.contains('in');
          const toPortIsLeft = toPortEl.classList.contains('in');
          
          // Connect from the exact port positions, not just node edges
          if (fromPortIsLeft) {
            fromX = (fromNodeRect.left - contentRect.left) / contentScale;
          } else {
            fromX = (fromNodeRect.right - contentRect.left) / contentScale;
          }
          
          if (toPortIsLeft) {
            toX = (toNodeRect.left - contentRect.left) / contentScale;
          } else {
            toX = (toNodeRect.right - contentRect.left) / contentScale;
          }
          
          // Override Y position to use exact port Y coordinate
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
        const fromPortEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"] .variable-port.out`);
        const toPortEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"] .variable-port.in`);
        
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

  generateEdgePath(fromX, fromY, toX, toY, fromVariable, toVariable) {
    // Determine connection sides based on actual port positions
    let fromSide = 'right'; // default
    let toSide = 'left'; // default
    
    // Try to determine actual port sides from DOM elements
    const fromPortEl = document.querySelector(`.variable[data-variable-id="${fromVariable.id}"] .variable-port.out`);
    const toPortEl = document.querySelector(`.variable[data-variable-id="${toVariable.id}"] .variable-port.in`);
    
    if (fromPortEl && toPortEl) {
      // Determine sides based on port classes and positions
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
    
    // IMPROVED SMOOTH ASYMPTOTIC BEZIER ROUTING ALGORITHM
    const asymptoteLength = 50; // Length of straight sections that act as asymptotes
    
    // Calculate start and end sections (asymptotes)
    const startX = fromSide === 'right' ? fromX + asymptoteLength : fromX - asymptoteLength;
    const endX = toSide === 'left' ? toX - asymptoteLength : toX + asymptoteLength;
    
    // Calculate the routing based on the connection geometry
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Determine routing strategy based on connection layout
    const isSimpleLeftToRight = fromSide === 'right' && toSide === 'left' && dx > 0;
    const isSameSideConnection = fromSide === toSide;
    const isBackwardsConnection = (fromSide === 'right' && toSide === 'left' && dx < 0) || 
                                  (fromSide === 'left' && toSide === 'right' && dx > 0);
    
    // Calculate adaptive control distances based on geometry
    const baseControlDistance = Math.min(Math.max(60, distance * 0.25), 150);
    const verticalInfluence = Math.min(Math.abs(dy) * 0.3, 100);
    const horizontalInfluence = Math.min(Math.abs(dx) * 0.2, 100);
    
    let pathData;
    
    if (isSimpleLeftToRight) {
      // Simple smooth curve for straightforward left-to-right connections
      const controlDistance = baseControlDistance + verticalInfluence;
      const fromControlX = startX + controlDistance;
      const toControlX = endX - controlDistance;
      
      pathData = `M ${fromX} ${fromY} 
                 L ${startX} ${fromY}
                 C ${fromControlX} ${fromY}, ${toControlX} ${toY}, ${endX} ${toY}
                 L ${toX} ${toY}`;
    } else if (isSameSideConnection) {
      // Same-side connections: create a smooth loop that goes around
      const routingOffset = Math.max(120, Math.abs(dy) * 0.5 + 100);
      const routingX = fromSide === 'right' ? 
        Math.max(fromX, toX) + routingOffset : 
        Math.min(fromX, toX) - routingOffset;
      
      // Use smooth curves with proper control point spacing
      const controlDistance = Math.max(80, routingOffset * 0.4);
      const midY = fromY + (toY - fromY) * 0.5;
      
      // Create a smooth S-curve with well-spaced control points
      pathData = `M ${fromX} ${fromY} 
                 L ${startX} ${fromY}
                 C ${startX + controlDistance * (fromSide === 'right' ? 1 : -1)} ${fromY}, 
                   ${routingX - controlDistance * (fromSide === 'right' ? 1 : -1)} ${fromY + (midY - fromY) * 0.7}, 
                   ${routingX} ${midY}
                 C ${routingX + controlDistance * (toSide === 'left' ? -1 : 1)} ${midY + (toY - midY) * 0.3}, 
                   ${endX - controlDistance * (toSide === 'left' ? -1 : 1)} ${toY}, 
                   ${endX} ${toY}
                 L ${toX} ${toY}`;
    } else if (isBackwardsConnection) {
      // Backwards connections: create a smooth arc that avoids sharp angles
      const routingOffset = Math.max(150, Math.abs(dy) * 0.6 + 120);
      const routingX = fromSide === 'right' ? 
        Math.max(fromX, toX) + routingOffset : 
        Math.min(fromX, toX) - routingOffset;
      
      // Create a wide, smooth arc
      const controlDistance = Math.max(100, routingOffset * 0.5);
      const arcHeight = Math.max(80, Math.abs(dy) * 0.4 + 60);
      const midY = fromY + (toY - fromY) * 0.5;
      const arcY = midY + (fromY < toY ? -arcHeight : arcHeight);
      
      pathData = `M ${fromX} ${fromY} 
                 L ${startX} ${fromY}
                 C ${startX + controlDistance * (fromSide === 'right' ? 1 : -1)} ${fromY}, 
                   ${routingX - controlDistance * (fromSide === 'right' ? 1 : -1)} ${arcY}, 
                   ${routingX} ${arcY}
                 C ${routingX + controlDistance * (toSide === 'left' ? -1 : 1)} ${arcY}, 
                   ${endX - controlDistance * (toSide === 'left' ? -1 : 1)} ${toY}, 
                   ${endX} ${toY}
                 L ${toX} ${toY}`;
    } else {
      // Standard routing for other cases
      const needsComplexRouting = Math.abs(dy) > 150 || Math.abs(dx) < 100;
      
      if (needsComplexRouting) {
        // Multi-segment routing with smooth transitions
        const midX = startX + (endX - startX) * 0.5;
        const controlDistance = Math.max(60, Math.min(Math.abs(dx) * 0.3, Math.abs(dy) * 0.2, 120));
        
        // Create a smooth path with three segments
        const segment1EndX = midX - controlDistance;
        const segment2StartX = midX + controlDistance;
        
        pathData = `M ${fromX} ${fromY} 
                   L ${startX} ${fromY}
                   C ${startX + controlDistance} ${fromY}, 
                     ${segment1EndX} ${fromY}, 
                     ${segment1EndX} ${fromY + (toY - fromY) * 0.2}
                   L ${segment1EndX} ${toY - (toY - fromY) * 0.2}
                   C ${segment1EndX} ${toY}, 
                     ${segment2StartX} ${toY}, 
                     ${endX - controlDistance} ${toY}
                   C ${endX} ${toY}, ${endX} ${toY}, ${endX} ${toY}
                   L ${toX} ${toY}`;
      } else {
        // Simple smooth curve for normal cases
        const controlDistance = baseControlDistance + horizontalInfluence + verticalInfluence;
        const fromControlX = startX + (endX > startX ? controlDistance : -controlDistance);
        const toControlX = endX - (endX > startX ? controlDistance : -controlDistance);
        
        pathData = `M ${fromX} ${fromY} 
                   L ${startX} ${fromY}
                   C ${fromControlX} ${fromY}, ${toControlX} ${toY}, ${endX} ${toY}
                   L ${toX} ${toY}`;
      }
    }

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
