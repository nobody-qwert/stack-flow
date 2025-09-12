/**
 * @fileoverview Inspector panel for editing node and variable properties
 */

import { store } from '../core/store.js';
import { generateVariableId } from '../core/id.js';
import { createVariable } from '../core/types.js';

export class Inspector {
  constructor() {
    // Inspector state
  }

  renderInspector(state) {
    const inspectorBody = document.getElementById('inspectorBody');
    
    console.log('renderInspector called with selection:', state.selection);
    
    if (state.selection.type === 'node' && state.selection.ids.length === 1) {
      const nodeId = state.selection.ids[0];
      const node = store.getNodeById(nodeId);
      
      console.log('Found node for inspector:', node);
      
      if (node) {
        inspectorBody.innerHTML = this.createNodeInspectorHTML(node);
        this.setupNodeInspectorHandlers(node);
        return;
      }
    }
    
    // Default inspector content
    inspectorBody.innerHTML = '<p>Select a node, field, or edge to edit details.</p>';
  }

  createNodeInspectorHTML(node) {
    return `
      <div class="form-group">
        <label for="nodeTitle">Title:</label>
        <input type="text" id="nodeTitle" value="${node.title}">
      </div>
      
      <div class="form-group">
        <div class="variable-controls">
          <button id="deleteNode" class="danger-light" title="Delete this Module">Delete Module</button>
        </div>
      </div>
      
      <label class="inspector-toggle" style="margin-bottom: 12px;">
        <input type="checkbox" id="nodeHideTypes" ${node.showVariableTypes === false ? 'checked' : ''} />
        <span>Always hide field types</span>
      </label>
      
      <div class="form-group">
        <label>Fields:</label>
        <div class="variable-controls">
          <button id="addVariable">Add Field</button>
        </div>
        <div class="variables-list">
          ${node.variables.map(variable => `
            <div class="variable-item" data-variable-id="${variable.id}">
              <button type="button" class="var-drag-handle" title="Drag to reorder" tabindex="0" aria-label="Reorder" style="width:10px;height:18px;min-width:10px;display:flex;align-items:center;justify-content:center;color:#777;border:1px dashed #ccc;border-radius:2px;background:#fff;user-select:none;padding:0;margin-right:2px;font-size:10px;line-height:1;opacity:0.7">⋮</button>
              <div class="variable-edit-row">
                <input type="text" class="var-name-input" value="${variable.name}" placeholder="Field name">
                <select class="var-type-select">
                  <option value="string" ${variable.dataType === 'string' ? 'selected' : ''}>String</option>
                  <option value="number" ${variable.dataType === 'number' ? 'selected' : ''}>Number</option>
                  <option value="boolean" ${variable.dataType === 'boolean' ? 'selected' : ''}>Boolean</option>
                  <option value="datetime" ${variable.dataType === 'datetime' ? 'selected' : ''}>DateTime</option>
                  <option value="uuid" ${variable.dataType === 'uuid' ? 'selected' : ''}>UUID</option>
                  <option value="json" ${variable.dataType === 'json' ? 'selected' : ''}>JSON</option>
                  <option value="array" ${variable.dataType === 'array' ? 'selected' : ''}>Array</option>
                </select>
                <button class="var-color-btn" data-variable-id="${variable.id}" title="Change color" style="background: ${variable.color || '#f8f9fa'}; width: 20px; height: 20px; border: 1px solid #ccc; border-radius: 3px; padding: 0; margin: 0 2px;"></button>
                <button class="delete-var-btn" title="Delete field">×</button>
              </div>
              ${variable.description ? `<div class="variable-description"><small>${variable.description}</small></div>` : ''}
            </div>
          `).join('')}
        </div>        
      </div>
    `;
  }

  setupNodeInspectorHandlers(node) {
    console.log('setupNodeInspectorHandlers: start for node', node?.id);
    
    // Title input
    const titleInput = document.getElementById('nodeTitle');
    titleInput.addEventListener('change', () => {
      store.updateNode(node.id, { title: titleInput.value });
    });
    
    // Node "Always hide variable types" checkbox
    const nodeHideTypesChk = document.getElementById('nodeHideTypes');
    if (nodeHideTypesChk) {
      nodeHideTypesChk.addEventListener('change', () => {
        // checked => always hide (override), unchecked => follow global
        const value = nodeHideTypesChk.checked ? false : null;
        store.setNodeShowTypes(node.id, value);
      });
    }
    
    // Add variable button
    const addVariableBtn = document.getElementById('addVariable');
    addVariableBtn.addEventListener('click', () => {
      const variable = createVariable(`field_${node.variables.length + 1}`);
      variable.id = generateVariableId();
      store.addVariable(node.id, variable);
    });
    
    // Variable editing handlers
    const variableItems = document.querySelectorAll('.variable-item');
    variableItems.forEach(item => {
      const variableId = item.dataset.variableId;
      
      // Variable name input
      const nameInput = item.querySelector('.var-name-input');
      nameInput.addEventListener('change', () => {
        store.updateVariable(node.id, variableId, { name: nameInput.value });
      });
      
      // Variable type select
      const typeSelect = item.querySelector('.var-type-select');
      typeSelect.addEventListener('change', () => {
        store.updateVariable(node.id, variableId, { dataType: typeSelect.value });
      });
      
      // Color button handler
      const colorBtn = item.querySelector('.var-color-btn');
      if (colorBtn) {
        colorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showColorPalette(colorBtn, node.id, variableId);
        });
      }
      
      // Delete variable button
      const deleteBtn = item.querySelector('.delete-var-btn');
      deleteBtn.addEventListener('click', () => {
        if (confirm('Delete this field?')) {
          store.deleteVariable(node.id, variableId);
        }
      });
    });

    // Delete node button
    const deleteNodeBtn = document.getElementById('deleteNode');
    if (deleteNodeBtn) {
      deleteNodeBtn.addEventListener('click', () => {
        if (confirm('Delete this node and its connections?')) {
          store.deleteNode(node.id);
          const inspectorBody = document.getElementById('inspectorBody');
          if (inspectorBody) {
            inspectorBody.innerHTML = '<p>Select a node, field, or edge to edit details.</p>';
          }
        }
      });
    }

    // Setup variable reordering
    this.setupVariableReordering(node);
  }

  setupVariableReordering(node) {
    // Reordering: pointer-based drag using the grab handle + keyboard support
    const list = document.querySelector('.variables-list');
    if (!list) return;

    const getItems = () => Array.from(list.querySelectorAll('.variable-item'));

    let drag = null;

    // Delegated Alt+ArrowUp/Down keyboard reordering for any focused control within a row
    list.addEventListener('keydown', (e) => {
      const modOk = e.altKey || e.ctrlKey;
      if (!modOk) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const row = e.target.closest('.variable-item');
      if (!row) return;
      e.preventDefault();
      const items = getItems();
      const index = items.indexOf(row);
      if (index === -1) return;
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      store.moveVariable(node.id, row.dataset.variableId, index + delta);
    });

    const onMouseMove = (e) => {
      if (!drag) return;
      // Move ghost with cursor
      drag.ghost.style.top = (e.clientY - drag.ghostOffsetY) + 'px';
      drag.ghost.style.left = (e.clientX - drag.ghostOffsetX) + 'px';

      // Decide placeholder position by comparing cursor Y to item midpoints
      const items = getItems().filter(el => el !== drag.item);
      let insertBefore = null;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        const midY = r.top + r.height / 2;
        if (e.clientY < midY) {
          insertBefore = el;
          break;
        }
      }
      if (insertBefore) {
        list.insertBefore(drag.placeholder, insertBefore);
      } else {
        list.appendChild(drag.placeholder);
      }
    };

    const endDrag = () => {
      if (!drag) return;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', endDrag);

      // Compute final target index as the placeholder's index among items
      const siblings = Array.from(list.querySelectorAll('.variable-item, .drag-placeholder'));
      const toIndex = siblings.indexOf(drag.placeholder);

      // Cleanup visuals
      drag.ghost.remove();
      drag.item.classList.remove('dragging');
      drag.item.style.visibility = '';

      // Place the real item at the placeholder, then remove placeholder
      drag.placeholder.replaceWith(drag.item);

      // Commit to store
      const variableId = drag.item.dataset.variableId;
      if (variableId) {
        store.moveVariable(node.id, variableId, toIndex);
      }

      drag = null;
    };

    // Attach handlers to each grab handle
    const handles = list.querySelectorAll('.var-drag-handle');
    console.log('Inspector: found var-drag-handles =', handles.length);
    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = handle.closest('.variable-item');
        if (!item) return;

        const rect = item.getBoundingClientRect();

        // Floating ghost element following the cursor
        const ghost = item.cloneNode(true);
        ghost.style.position = 'fixed';
        ghost.style.top = rect.top + 'px';
        ghost.style.left = rect.left + 'px';
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        ghost.style.pointerEvents = 'none';
        ghost.style.opacity = '0.85';
        ghost.style.zIndex = '9999';
        ghost.classList.add('drag-ghost');
        document.body.appendChild(ghost);

        // Placeholder occupying space in the list
        const placeholder = document.createElement('div');
        placeholder.className = 'drag-placeholder';
        placeholder.style.height = rect.height + 'px';
        item.after(placeholder);

        // Hide the actual item but keep its position for replacement later
        item.classList.add('dragging');
        item.style.visibility = 'hidden';

        drag = {
          item,
          ghost,
          placeholder,
          ghostOffsetX: e.clientX - rect.left,
          ghostOffsetY: e.clientY - rect.top
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', endDrag);
      });

      // Keyboard reordering: Alt+ArrowUp / Alt+ArrowDown on handle
      handle.addEventListener('keydown', (e) => {
        if (!e.altKey) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const items = getItems();
        const item = handle.closest('.variable-item');
        const index = items.indexOf(item);
        if (index === -1) return;
        const delta = e.key === 'ArrowUp' ? -1 : 1;
        store.moveVariable(node.id, item.dataset.variableId, index + delta);
      });
    });

    // Also allow Alt+ArrowUp/Down when editing fields within the row
    list.querySelectorAll('.variable-item .var-name-input, .variable-item .var-type-select').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (!e.altKey) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const item = e.target.closest('.variable-item');
        const items = getItems();
        const index = items.indexOf(item);
        const delta = e.key === 'ArrowUp' ? -1 : 1;
        store.moveVariable(node.id, item.dataset.variableId, index + delta);
      });
    });
  }

  showColorPalette(colorBtn, nodeId, variableId) {
    // 16 preset colors (light pastels for good text contrast)
    const colors = [
      '#fde68a', '#fca5a5', '#f9a8d4', '#c7d2fe',
      '#a7f3d0', '#99f6e4', '#93c5fd', '#fcd34d',
      '#fca4b6', '#d8b4fe', '#fbcfe8', '#bfdbfe',
      '#bbf7d0', '#bae6fd', '#fecaca', '#fdecc8'
    ];
    
    // Remove any existing palette
    const existingPalette = document.querySelector('.color-palette');
    if (existingPalette) {
      existingPalette.remove();
    }
    
    // Create palette popup
    const palette = document.createElement('div');
    palette.className = 'color-palette';
    palette.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      width: 120px;
    `;
    
    // Position near the color button with viewport boundary checks
    const rect = colorBtn.getBoundingClientRect();
    const paletteWidth = 120;
    const paletteHeight = 120; // Approximate height for 4x4 grid + padding
    
    // Calculate initial position
    let left = rect.left;
    let top = rect.bottom + 4;
    
    // Check right boundary
    if (left + paletteWidth > window.innerWidth) {
      left = rect.right - paletteWidth;
    }
    
    // Check bottom boundary
    if (top + paletteHeight > window.innerHeight) {
      top = rect.top - paletteHeight - 4;
    }
    
    // Ensure it doesn't go off the left edge
    left = Math.max(4, left);
    
    // Ensure it doesn't go off the top edge
    top = Math.max(4, top);
    
    palette.style.left = `${left}px`;
    palette.style.top = `${top}px`;
    
    // Add "None" option
    const noneBtn = document.createElement('button');
    noneBtn.style.cssText = `
      width: 24px; height: 24px; border: 1px solid #ccc; border-radius: 3px;
      background: white; cursor: pointer; font-size: 10px; padding: 0;
    `;
    noneBtn.textContent = '×';
    noneBtn.title = 'No color';
    noneBtn.addEventListener('click', () => {
      store.updateVariable(nodeId, variableId, { color: null });
      palette.remove();
    });
    palette.appendChild(noneBtn);
    
    // Add color swatches
    colors.forEach(color => {
      const swatch = document.createElement('button');
      swatch.style.cssText = `
        width: 24px; height: 24px; border: 1px solid #ccc; border-radius: 3px;
        background: ${color}; cursor: pointer; padding: 0;
      `;
      swatch.addEventListener('click', () => {
        store.updateVariable(nodeId, variableId, { color });
        palette.remove();
      });
      palette.appendChild(swatch);
    });
    
    // Close on outside click
    const closeHandler = (e) => {
      if (!palette.contains(e.target) && e.target !== colorBtn) {
        palette.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    
    document.body.appendChild(palette);
  }
}
