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
 * @property {'api'|'table'|'gui'} type - Node type
 * @property {string} title - Display title
 * @property {Position} position - Canvas position
 * @property {Variable[]} variables - Array of variables/slots
 * @property {Object} metadata - Type-specific metadata
 */

/**
 * @typedef {Object} EdgeEndpoint
 * @property {string} nodeId - Node ID
 * @property {string} portId - Variable/port ID
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
export const NODE_TYPES = {
  API: 'api',
  TABLE: 'table',
  GUI: 'gui'
};


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

export const createNode = (type, title, position = createPosition()) => ({
  id: null, // Will be set by ID generator
  type,
  title,
  position,
  variables: [],
  metadata: {}
});

export const createEdge = (from, to) => ({
  id: null, // Will be set by ID generator
  from,
  to,
  transform: undefined,
  status: EDGE_STATUS.OK
});

export const createDiagram = () => ({
  version: '0.1',
  nodes: [],
  edges: []
});

// Type validation helpers
export const isValidNodeType = (type) => Object.values(NODE_TYPES).includes(type);
export const isValidDataType = (dataType) => Object.values(DATA_TYPES).includes(dataType);
export const isValidEdgeStatus = (status) => Object.values(EDGE_STATUS).includes(status);

// Node type specific helpers
export const getNodeTypeColor = (type) => {
  switch (type) {
    case NODE_TYPES.API: return '#28a745';
    case NODE_TYPES.TABLE: return '#dc3545';
    case NODE_TYPES.GUI: return '#ffc107';
    default: return '#6c757d';
  }
};


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

export const createGuiMetadata = (route = '', framework = '') => ({
  route,
  framework
});
