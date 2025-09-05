/**
 * @fileoverview Postgres table import service
 */

import { NODE_TYPES, IO_TYPES, createNode, createTableMetadata } from '../core/types.js';
import { generateNodeId, generateVariableId } from '../core/id.js';
import { normalizePostgresType, formatTableTitle } from '../core/normalizeTypes.js';

/**
 * Import Postgres table from descriptor JSON
 * @param {Object} input - Import input
 * @param {string} [input.schema] - Schema name
 * @param {string} input.table - Table name
 * @param {Array} input.columns - Column definitions
 * @param {Object} [input.position] - Canvas position
 * @returns {Object} Created node
 */
export function importTableFromJson(input) {
  const {
    schema = 'public',
    table = 'untitled_table',
    columns = [],
    position = { x: 100, y: 100 }
  } = input;

  // Create the node
  const title = formatTableTitle(schema, table);
  const node = createNode(NODE_TYPES.TABLE, title, position);
  node.id = generateNodeId();
  node.metadata = createTableMetadata(schema, table);
  
  const variables = [];
  const primaryKeys = [];

  // Process columns
  columns.forEach(column => {
    const {
      name,
      type,
      nullable = true,
      pk = false,
      fk = false,
      defaultValue
    } = column;

    if (!name) return;

    const variable = {
      id: generateVariableId(),
      name: name.trim(),
      dataType: normalizePostgresType(type),
      io: IO_TYPES.BOTH, // Table columns can be both input and output
      sampleValue: defaultValue,
      description: undefined
    };

    // Add metadata for constraints
    if (!nullable || pk || fk) {
      const constraints = [];
      if (pk) {
        constraints.push('PK');
        primaryKeys.push(name);
      }
      if (fk) constraints.push('FK');
      if (!nullable) constraints.push('NOT NULL');
      
      if (constraints.length > 0) {
        variable.description = constraints.join(', ');
      }
    }

    variables.push(variable);
  });

  // Update metadata with primary keys
  if (primaryKeys.length > 0) {
    node.metadata.pk = primaryKeys;
  }

  node.variables = variables;
  return node;
}

/**
 * Show Postgres import dialog and return promise with user input
 * @returns {Promise<Object|null>} User input or null if cancelled
 */
export function showPgImportDialog() {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'import-dialog';
    dialog.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog-content">
          <h3>Import Postgres Table</h3>
          
          <div class="form-group">
            <label for="pgSchema">Schema:</label>
            <input type="text" id="pgSchema" placeholder="public" value="public">
          </div>
          
          <div class="form-group">
            <label for="pgTable">Table Name:</label>
            <input type="text" id="pgTable" placeholder="table_name" required>
          </div>
          
          <div class="form-group">
            <label for="pgJson">Table Descriptor JSON:</label>
            <textarea id="pgJson" rows="12" placeholder='{
  "schema": "public",
  "table": "events",
  "columns": [
    {"name": "id", "type": "uuid", "pk": true, "nullable": false},
    {"name": "session_id", "type": "uuid", "nullable": false},
    {"name": "timestamp", "type": "timestamptz"},
    {"name": "user_id", "type": "text"},
    {"name": "data", "type": "jsonb"}
  ]
}'></textarea>
          </div>
          
          <div class="dialog-actions">
            <button id="cancelBtn">Cancel</button>
            <button id="importBtn" class="primary">Import</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Handle buttons
    dialog.getElementById('cancelBtn').addEventListener('click', () => {
      document.body.removeChild(dialog);
      resolve(null);
    });

    dialog.getElementById('importBtn').addEventListener('click', () => {
      const schema = dialog.getElementById('pgSchema').value.trim() || 'public';
      const table = dialog.getElementById('pgTable').value.trim();
      const jsonText = dialog.getElementById('pgJson').value.trim();
      
      if (!table) {
        alert('Table name is required');
        return;
      }

      let result = { schema, table, columns: [] };

      if (jsonText) {
        try {
          const parsed = JSON.parse(jsonText);
          
          // Extract from parsed JSON
          if (parsed.schema) result.schema = parsed.schema;
          if (parsed.table) result.table = parsed.table;
          if (Array.isArray(parsed.columns)) {
            result.columns = parsed.columns;
          }
        } catch (error) {
          alert('Invalid JSON: ' + error.message);
          return;
        }
      }

      document.body.removeChild(dialog);
      resolve(result);
    });

    // Focus the table input
    dialog.getElementById('pgTable').focus();
  });
}

/**
 * Create a sample table descriptor for demonstration
 * @returns {Object} Sample table descriptor
 */
export function createSampleTableDescriptor() {
  return {
    schema: 'public',
    table: 'events',
    columns: [
      { name: 'session_id', type: 'uuid', nullable: false, pk: false },
      { name: 'readable_timestamp', type: 'timestamptz', nullable: true },
      { name: 'user_id', type: 'text', nullable: true },
      { name: 'organization_id', type: 'text', nullable: true },
      { name: 'project_name', type: 'text', nullable: true },
      { name: 'model_name', type: 'text', nullable: true },
      { name: 'agent_name', type: 'text', nullable: true },
      { name: 'input_token_count', type: 'integer', nullable: true },
      { name: 'output_token_count', type: 'integer', nullable: true },
      { name: 'response_time', type: 'integer', nullable: true }
    ]
  };
}
