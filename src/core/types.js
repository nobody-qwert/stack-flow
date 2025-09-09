/**
 * @fileoverview Core type definitions and JSDoc typedefs for the Data Flow Designer
 */

/**
 * @typedef {Object} Position
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} Variable
 * @property {string} id - Unique identifier
 * @property {string} name - Variable name
 * @property {string} dataType - Normalized data type
 * @property {*} [sampleValue] - Optional sample value (hidden by default)
 * @property {string} [description] - Optional description
 */

/**
 * @typedef {Object} Node
 * @property {string} id - Unique identifier
 * @property {string} title - Display title
 * @property {Position} position - Canvas position
 * @property {Variable[]} variables - Array of variables/slots
 * @property {Object} metadata - Type-specific metadata
 * @property {boolean|null} [showVariableTypes] - Per-node type visibility: null=follow global, true=always show, false=always hide
 */

/**
 * @typedef {Object} EdgeEndpoint
 * @property {string} nodeId - Node ID
 * @property {string} portId - Variable/port ID
 * @property {'in'|'out'} [side] - Exact port side selected by the user
 */

/**
 * @typedef {Object} Edge
 * @property {string} id - Unique identifier
 * @property {EdgeEndpoint} from - Source endpoint
 * @property {EdgeEndpoint} to - Target endpoint
 * @property {string} [transform] - Optional mapping expression
 * @property {'ok'|'warn'|'error'} [status] - Compatibility status
 */

/**
 * @typedef {Object} Diagram
 * @property {string} version - Schema version
 * @property {Node[]} nodes - Array of nodes
 * @property {Edge[]} edges - Array of edges
 */

/**
 * @typedef {Object} Selection
 * @property {'node'|'variable'|'edge'|null} type - Selection type
 * @property {string[]} ids - Selected item IDs
 */

/**
 * @typedef {Object} Command
 * @property {string} type - Command type
 * @property {Object} payload - Command data
 * @property {Function} execute - Execute function
 * @property {Function} undo - Undo function
 */

// Enums and constants


export const DATA_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  DATETIME: 'datetime',
  UUID: 'uuid',
  JSON: 'json',
  ARRAY: 'array'
};

export const EDGE_STATUS = {
  OK: 'ok',
  WARN: 'warn',
  ERROR: 'error'
};

export const SELECTION_TYPES = {
  NODE: 'node',
  VARIABLE: 'variable',
  EDGE: 'edge'
};

// Default values
export const DEFAULT_NODE_SIZE = { width: 200, height: 100 };
export const DEFAULT_CANVAS_SIZE = { width: 4000, height: 3000 };
export const GRID_SIZE = 20;

// Helper functions
export const createPosition = (x = 0, y = 0) => ({ x, y });

export const createVariable = (name, dataType = DATA_TYPES.STRING) => ({
  id: null, // Will be set by ID generator
  name,
  dataType,
  sampleValue: undefined,
  description: undefined,
  color: null // optional background color for variable row (hex or null)
});

export const createNode = (title, position = createPosition()) => ({
  id: null, // Will be set by ID generator
  title,
  position,
  variables: [],
  metadata: {},
  showVariableTypes: null // Default: follow global setting
});

export const createEdge = (from, to) => ({
  id: null, // Will be set by ID generator
  from,
  to,
  transform: undefined,
  status: EDGE_STATUS.OK
});

export const createDiagram = () => ({
  // Default in-memory schema version for new diagrams
  version: '1',
  title: 'Untitled diagram',
  nodes: [],
  edges: []
});

// Type validation helpers
export const isValidDataType = (dataType) => Object.values(DATA_TYPES).includes(dataType);
export const isValidEdgeStatus = (status) => Object.values(EDGE_STATUS).includes(status);

// Node type specific helpers


// Metadata templates for different node types
export const createApiMetadata = (method = 'GET', url = '') => ({
  method,
  url,
  auth: undefined
});

export const createTableMetadata = (schema = 'public', table = '') => ({
  schema,
  table,
  pk: []
});

export const createModuleMetadata = (route = '', framework = '') => ({
  route,
  framework
});

export const createGuiMetadata = createModuleMetadata;

// Helper function to determine if variable types should be shown for a node
export const shouldShowTypesForNode = (node, globalShowTypes) => {
  if (node.showVariableTypes === null || node.showVariableTypes === undefined) {
    return globalShowTypes; // Follow global setting
  }
  return node.showVariableTypes; // Use node-specific setting
};
