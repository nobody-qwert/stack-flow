/**
 * @fileoverview UUID generation utilities
 */

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a short ID for display purposes
 * @returns {string} Short ID string
 */
export function generateShortId() {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Check if a string is a valid UUID
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid UUID
 */
export function isValidId(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return typeof id === 'string' && uuidRegex.test(id);
}

/**
 * Generate a prefixed ID for specific entity types
 * @param {string} prefix - Prefix for the ID
 * @returns {string} Prefixed ID
 */
export function generatePrefixedId(prefix) {
  return `${prefix}_${generateShortId()}`;
}

// Convenience functions for specific entity types
export const generateNodeId = () => generatePrefixedId('node');
export const generateVariableId = () => generatePrefixedId('var');
export const generateEdgeId = () => generatePrefixedId('edge');
