/**
 * @fileoverview Basic validation utilities (no automatic validation)
 */

import { DATA_TYPES, EDGE_STATUS } from '../core/types.js';

/**
 * Check if two data types are compatible for connections
 * This is just for visual feedback, not enforcement
 * @param {string} fromType - Source data type
 * @param {string} toType - Target data type
 * @returns {string} Compatibility status ('ok', 'warn', 'error')
 */
export function checkTypeCompatibility(fromType, toType) {
  if (!fromType || !toType) {
    return EDGE_STATUS.WARN;
  }

  // Exact match is always OK
  if (fromType === toType) {
    return EDGE_STATUS.OK;
  }

  // Some loose compatibility rules for visual feedback only
  const compatiblePairs = [
    [DATA_TYPES.STRING, DATA_TYPES.UUID],
    [DATA_TYPES.UUID, DATA_TYPES.STRING],
    [DATA_TYPES.NUMBER, DATA_TYPES.STRING],
    [DATA_TYPES.BOOLEAN, DATA_TYPES.STRING],
    [DATA_TYPES.DATETIME, DATA_TYPES.STRING],
    [DATA_TYPES.JSON, DATA_TYPES.STRING]
  ];

  const isCompatible = compatiblePairs.some(([type1, type2]) =>
    (fromType === type1 && toType === type2) ||
    (fromType === type2 && toType === type1)
  );

  return isCompatible ? EDGE_STATUS.WARN : EDGE_STATUS.ERROR;
}

/**
 * Get a human-readable description of type compatibility
 * @param {string} status - Compatibility status
 * @param {string} fromType - Source type
 * @param {string} toType - Target type
 * @returns {string} Description
 */
export function getCompatibilityDescription(status, fromType, toType) {
  switch (status) {
    case EDGE_STATUS.OK:
      return `Types match: ${fromType} → ${toType}`;
    case EDGE_STATUS.WARN:
      return `Types are compatible: ${fromType} → ${toType}`;
    case EDGE_STATUS.ERROR:
      return `Types may be incompatible: ${fromType} → ${toType}`;
    default:
      return 'Unknown compatibility';
  }
}

/**
 * Simple validation for node titles
 * @param {string} title - Node title
 * @returns {boolean} True if valid
 */
export function isValidNodeTitle(title) {
  return typeof title === 'string' && title.trim().length > 0;
}

/**
 * Simple validation for variable names
 * @param {string} name - Variable name
 * @returns {boolean} True if valid
 */
export function isValidVariableName(name) {
  return typeof name === 'string' && name.trim().length > 0;
}
