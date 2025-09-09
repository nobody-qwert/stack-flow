/**
 * @fileoverview Command pattern implementation for undo/redo functionality
 */

import { eventBus } from './eventBus.js';

class CommandStack {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxStackSize = 100;
  }

  /**
   * Execute a command and add it to the undo stack
   * @param {Object} command - Command object with execute/undo methods
   */
  execute(command) {
    try {
      // Execute the command
      command.execute();
      
      // Add to undo stack
      this.undoStack.push(command);
      
      // Clear redo stack since we've made a new change
      this.redoStack = [];
      
      // Limit stack size
      if (this.undoStack.length > this.maxStackSize) {
        this.undoStack.shift();
      }
      
      this.emitStackChange();
    } catch (error) {
      console.error('Error executing command:', error);
      throw error;
    }
  }

  /**
   * Undo the last command
   * @returns {boolean} True if undo was successful
   */
  undo() {
    if (this.undoStack.length === 0) {
      return false;
    }

    const command = this.undoStack.pop();
    
    try {
      command.undo();
      this.redoStack.push(command);
      this.emitStackChange();
      return true;
    } catch (error) {
      console.error('Error undoing command:', error);
      // Put the command back on the stack if undo failed
      this.undoStack.push(command);
      throw error;
    }
  }

  /**
   * Redo the last undone command
   * @returns {boolean} True if redo was successful
   */
  redo() {
    if (this.redoStack.length === 0) {
      return false;
    }

    const command = this.redoStack.pop();
    
    try {
      command.execute();
      this.undoStack.push(command);
      this.emitStackChange();
      return true;
    } catch (error) {
      console.error('Error redoing command:', error);
      // Put the command back on the redo stack if execute failed
      this.redoStack.push(command);
      throw error;
    }
  }

  /**
   * Check if undo is available
   * @returns {boolean} True if can undo
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   * @returns {boolean} True if can redo
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Clear both stacks
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.emitStackChange();
  }

  /**
   * Get the description of the next undo command
   * @returns {string|null} Command description or null
   */
  getUndoDescription() {
    const command = this.undoStack[this.undoStack.length - 1];
    return command?.description || null;
  }

  /**
   * Get the description of the next redo command
   * @returns {string|null} Command description or null
   */
  getRedoDescription() {
    const command = this.redoStack[this.redoStack.length - 1];
    return command?.description || null;
  }

  /**
   * Emit stack change event
   */
  emitStackChange() {
    eventBus.emit('command:stack_change', {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoDescription: this.getUndoDescription(),
      redoDescription: this.getRedoDescription()
    });
  }
}

// Command factory functions
export const createCommand = (description, executeFunc, undoFunc) => ({
  description,
  execute: executeFunc,
  undo: undoFunc
});

// Specific command creators
export const createAddNodeCommand = (store, node) => createCommand(
  'Add node',
  () => store.addNode(node),
  () => store.deleteNode(node.id)
);

export const createDeleteNodeCommand = (store, nodeId) => {
  const node = store.getNodeById(nodeId);
  const connectedEdges = store.getEdgesForNode(nodeId);
  
  return createCommand(
    'Delete node',
    () => store.deleteNode(nodeId),
    () => {
      // Restore node
      if (node) {
        store.addNode(node);
        // Restore connected edges
        connectedEdges.forEach(edge => store.addEdge(edge));
      }
    }
  );
};

export const createUpdateNodeCommand = (store, nodeId, updates, previousValues) => {
  const node = store.getNodeById(nodeId);
  
  return createCommand(
    'Update node',
    () => store.updateNode(nodeId, updates),
    () => store.updateNode(nodeId, previousValues)
  );
};

export const createMoveNodeCommand = (store, nodeId, newPosition, oldPosition) => createCommand(
  'Move node',
  () => store.updateNode(nodeId, { position: newPosition }),
  () => store.updateNode(nodeId, { position: oldPosition })
);

export const createAddVariableCommand = (store, nodeId, variable) => createCommand(
  'Add variable',
  () => store.addVariable(nodeId, variable),
  () => store.deleteVariable(nodeId, variable.id)
);

export const createDeleteVariableCommand = (store, nodeId, variableId) => {
  const variable = store.getVariableById(nodeId, variableId);
  const connectedEdges = store.getEdgesForVariable(nodeId, variableId);
  
  return createCommand(
    'Delete variable',
    () => store.deleteVariable(nodeId, variableId),
    () => {
      // Restore variable
      if (variable) {
        store.addVariable(nodeId, variable);
        // Restore connected edges
        connectedEdges.forEach(edge => store.addEdge(edge));
      }
    }
  );
};

export const createUpdateVariableCommand = (store, nodeId, variableId, updates, previousValues) => createCommand(
  'Update variable',
  () => store.updateVariable(nodeId, variableId, updates),
  () => store.updateVariable(nodeId, variableId, previousValues)
);

export const createAddEdgeCommand = (store, edge) => createCommand(
  'Add connection',
  () => store.addEdge(edge),
  () => store.deleteEdge(edge.id)
);

export const createDeleteEdgeCommand = (store, edgeId) => {
  const edge = store.getEdgeById(edgeId);
  
  return createCommand(
    'Delete connection',
    () => store.deleteEdge(edgeId),
    () => {
      if (edge) {
        store.addEdge(edge);
      }
    }
  );
};

export const createUpdateEdgeCommand = (store, edgeId, updates, previousValues) => createCommand(
  'Update connection',
  () => store.updateEdge(edgeId, updates),
  () => store.updateEdge(edgeId, previousValues)
);

// Composite command for multiple operations
export const createCompositeCommand = (description, commands) => createCommand(
  description,
  () => commands.forEach(cmd => cmd.execute()),
  () => commands.slice().reverse().forEach(cmd => cmd.undo())
);

// Create singleton instance
export const commandStack = new CommandStack();

// Keyboard shortcut handlers
export const setupKeyboardShortcuts = () => {
  document.addEventListener('keydown', (event) => {
    // Ctrl+Z / Cmd+Z for undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      commandStack.undo();
    }
    
    // Ctrl+Y / Cmd+Shift+Z for redo
    if (((event.ctrlKey || event.metaKey) && event.key === 'y') ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')) {
      event.preventDefault();
      commandStack.redo();
    }
  });
};
