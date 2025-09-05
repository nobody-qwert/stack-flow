/**
 * @fileoverview Type normalization and mapping utilities
 */

import { DATA_TYPES } from './types.js';

// Postgres type mappings to normalized types
export const POSTGRES_TYPE_MAP = {
  // String types
  'text': DATA_TYPES.STRING,
  'varchar': DATA_TYPES.STRING,
  'char': DATA_TYPES.STRING,
  'character': DATA_TYPES.STRING,
  'character varying': DATA_TYPES.STRING,
  'bpchar': DATA_TYPES.STRING,
  
  // Number types
  'integer': DATA_TYPES.NUMBER,
  'int': DATA_TYPES.NUMBER,
  'int4': DATA_TYPES.NUMBER,
  'bigint': DATA_TYPES.NUMBER,
  'int8': DATA_TYPES.NUMBER,
  'smallint': DATA_TYPES.NUMBER,
  'int2': DATA_TYPES.NUMBER,
  'decimal': DATA_TYPES.NUMBER,
  'numeric': DATA_TYPES.NUMBER,
  'real': DATA_TYPES.NUMBER,
  'float4': DATA_TYPES.NUMBER,
  'double precision': DATA_TYPES.NUMBER,
  'float8': DATA_TYPES.NUMBER,
  'money': DATA_TYPES.NUMBER,
  
  // Boolean types
  'boolean': DATA_TYPES.BOOLEAN,
  'bool': DATA_TYPES.BOOLEAN,
  
  // Date/time types
  'timestamp': DATA_TYPES.DATETIME,
  'timestamptz': DATA_TYPES.DATETIME,
  'timestamp with time zone': DATA_TYPES.DATETIME,
  'timestamp without time zone': DATA_TYPES.DATETIME,
  'date': DATA_TYPES.DATETIME,
  'time': DATA_TYPES.DATETIME,
  'timetz': DATA_TYPES.DATETIME,
  'time with time zone': DATA_TYPES.DATETIME,
  'time without time zone': DATA_TYPES.DATETIME,
  'interval': DATA_TYPES.DATETIME,
  
  // UUID type
  'uuid': DATA_TYPES.UUID,
  
  // JSON types
  'json': DATA_TYPES.JSON,
  'jsonb': DATA_TYPES.JSON,
  
  // Array types (will be handled specially)
  'array': DATA_TYPES.ARRAY,
  'text[]': DATA_TYPES.ARRAY,
  'integer[]': DATA_TYPES.ARRAY,
  'varchar[]': DATA_TYPES.ARRAY
};

/**
 * Normalize a Postgres type to our standard type system
 * @param {string} pgType - Postgres type name
 * @returns {string} Normalized type
 */
export function normalizePostgresType(pgType) {
  if (!pgType || typeof pgType !== 'string') {
    return DATA_TYPES.STRING;
  }
  
  const cleanType = pgType.toLowerCase().trim();
  
  // Handle array types
  if (cleanType.endsWith('[]')) {
    return DATA_TYPES.ARRAY;
  }
  
  // Handle varchar with length specification
  if (cleanType.startsWith('varchar(') || cleanType.startsWith('character varying(')) {
    return DATA_TYPES.STRING;
  }
  
  // Handle numeric with precision/scale
  if (cleanType.startsWith('numeric(') || cleanType.startsWith('decimal(')) {
    return DATA_TYPES.NUMBER;
  }
  
  return POSTGRES_TYPE_MAP[cleanType] || DATA_TYPES.STRING;
}

/**
 * Infer type from a JavaScript value
 * @param {*} value - Value to analyze
 * @returns {string} Inferred type
 */
export function inferTypeFromValue(value) {
  if (value === null || value === undefined) {
    return DATA_TYPES.STRING;
  }
  
  const type = typeof value;
  
  switch (type) {
    case 'string':
      // Check for UUID pattern
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        return DATA_TYPES.UUID;
      }
      
      // Check for ISO datetime pattern
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return DATA_TYPES.DATETIME;
      }
      
      return DATA_TYPES.STRING;
      
    case 'number':
      return DATA_TYPES.NUMBER;
      
    case 'boolean':
      return DATA_TYPES.BOOLEAN;
      
    case 'object':
      if (Array.isArray(value)) {
        return DATA_TYPES.ARRAY;
      }
      return DATA_TYPES.JSON;
      
    default:
      return DATA_TYPES.STRING;
  }
}

/**
 * Infer type from JSON property name (heuristic)
 * @param {string} propertyName - Property name to analyze
 * @returns {string} Inferred type
 */
export function inferTypeFromPropertyName(propertyName) {
  if (!propertyName || typeof propertyName !== 'string') {
    return DATA_TYPES.STRING;
  }
  
  const name = propertyName.toLowerCase();
  
  // UUID patterns
  if (name.includes('id') || name.includes('uuid')) {
    return DATA_TYPES.UUID;
  }
  
  // Timestamp patterns
  if (name.includes('time') || name.includes('date') || name.includes('created') || 
      name.includes('updated') || name.includes('modified')) {
    return DATA_TYPES.DATETIME;
  }
  
  // Number patterns
  if (name.includes('count') || name.includes('total') || name.includes('amount') ||
      name.includes('price') || name.includes('cost') || name.includes('number') ||
      name.includes('size') || name.includes('length') || name.includes('weight')) {
    return DATA_TYPES.NUMBER;
  }
  
  // Boolean patterns
  if (name.startsWith('is_') || name.startsWith('has_') || name.startsWith('can_') ||
      name.startsWith('should_') || name.includes('enabled') || name.includes('active')) {
    return DATA_TYPES.BOOLEAN;
  }
  
  return DATA_TYPES.STRING;
}

/**
 * Flatten a nested JSON object using dot notation
 * @param {Object} obj - Object to flatten
 * @param {string} prefix - Prefix for keys
 * @param {number} maxDepth - Maximum nesting depth
 * @returns {Object} Flattened object
 */
export function flattenJson(obj, prefix = '', maxDepth = 3) {
  const result = {};
  
  if (maxDepth <= 0 || obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { [prefix || 'value']: obj };
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(result, flattenJson(value, newKey, maxDepth - 1));
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}

/**
 * Create variables from flattened JSON object
 * @param {Object} flatObj - Flattened object
 * @param {string} ioType - IO type for variables
 * @returns {Array} Array of variable objects (without IDs)
 */
export function createVariablesFromJson(flatObj, ioType = 'out') {
  return Object.entries(flatObj).map(([name, value]) => {
    const inferredFromValue = inferTypeFromValue(value);
    const inferredFromName = inferTypeFromPropertyName(name);
    
    // Prefer type inferred from value, fall back to name-based inference
    const dataType = inferredFromValue !== DATA_TYPES.STRING ? inferredFromValue : inferredFromName;
    
    return {
      id: null, // Will be set by ID generator
      name,
      dataType,
      io: ioType,
      sampleValue: value,
      description: undefined
    };
  });
}

/**
 * Parse API method and URL from a string
 * @param {string} input - Input string like "POST /api/users" or just "/api/users"
 * @returns {Object} Parsed method and URL
 */
export function parseApiEndpoint(input) {
  if (!input || typeof input !== 'string') {
    return { method: 'GET', url: '' };
  }
  
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  
  if (parts.length >= 2) {
    const method = parts[0].toUpperCase();
    const url = parts.slice(1).join(' ');
    
    // Validate HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    if (validMethods.includes(method)) {
      return { method, url };
    }
  }
  
  // If no valid method found, assume it's just a URL
  return { method: 'GET', url: trimmed };
}

/**
 * Generate a title for a table from schema and table name
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @returns {string} Formatted title
 */
export function formatTableTitle(schema, table) {
  if (!table) return 'Untitled Table';
  if (!schema || schema === 'public') return table;
  return `${schema}.${table}`;
}

/**
 * Validate and clean a variable name
 * @param {string} name - Variable name
 * @returns {string} Cleaned name
 */
export function cleanVariableName(name) {
  if (!name || typeof name !== 'string') {
    return 'unnamed';
  }
  
  // Replace invalid characters with underscores
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/^[0-9]/, '_$&') // Don't start with number
    .substring(0, 50); // Limit length
}
