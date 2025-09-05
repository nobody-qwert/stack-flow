/**
 * @fileoverview API JSON import service
 */

import { NODE_TYPES, IO_TYPES, createNode, createApiMetadata } from '../core/types.js';
import { generateNodeId, generateVariableId } from '../core/id.js';
import { flattenJson, createVariablesFromJson, parseApiEndpoint } from '../core/normalizeTypes.js';

/**
 * Import API endpoint from example JSON
 * @param {Object} input - Import input
 * @param {string} input.title - API endpoint title (e.g., "POST /api/users")
 * @param {Object} [input.request] - Request JSON example
 * @param {Object} [input.response] - Response JSON example
 * @param {Object} [input.single] - Single JSON (treated as response by default)
 * @param {boolean} [input.treatSingleAsRequest] - Treat single JSON as request
 * @param {Object} [input.position] - Canvas position
 * @returns {Object} Created node
 */
export function importApiFromJson(input) {
  const {
    title = 'API Endpoint',
    request,
    response,
    single,
    treatSingleAsRequest = false,
    position = { x: 100, y: 100 }
  } = input;

  // Parse method and URL from title
  const { method, url } = parseApiEndpoint(title);
  
  // Create the node
  const node = createNode(NODE_TYPES.API, `${method} ${url}`, position);
  node.id = generateNodeId();
  node.metadata = createApiMetadata(method, url);
  
  const variables = [];

  // Process request data
  let requestData = request;
  if (!requestData && single && treatSingleAsRequest) {
    requestData = single;
  }

  if (requestData && typeof requestData === 'object') {
    const flatRequest = flattenJson(requestData);
    const requestVars = createVariablesFromJson(flatRequest, IO_TYPES.IN);
    
    requestVars.forEach(variable => {
      variable.id = generateVariableId();
      variables.push(variable);
    });
  }

  // Process response data
  let responseData = response;
  if (!responseData && single && !treatSingleAsRequest) {
    responseData = single;
  }

  if (responseData && typeof responseData === 'object') {
    const flatResponse = flattenJson(responseData);
    const responseVars = createVariablesFromJson(flatResponse, IO_TYPES.OUT);
    
    responseVars.forEach(variable => {
      variable.id = generateVariableId();
      variables.push(variable);
    });
  }

  node.variables = variables;
  return node;
}

/**
 * Parse JSON string safely
 * @param {string} jsonString - JSON string to parse
 * @returns {Object|null} Parsed object or null if invalid
 */
export function parseJsonSafely(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Invalid JSON:', error.message);
    return null;
  }
}

/**
 * Show API import dialog and return promise with user input
 * @returns {Promise<Object|null>} User input or null if cancelled
 */
export function showApiImportDialog() {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'import-dialog';
    dialog.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog-content">
          <h3>Import API Endpoint</h3>
          
          <div class="form-group">
            <label for="apiTitle">Endpoint (e.g., "POST /api/users"):</label>
            <input type="text" id="apiTitle" placeholder="GET /api/endpoint" value="GET /api/data">
          </div>
          
          <div class="form-group">
            <label>
              <input type="radio" name="jsonType" value="single" checked>
              Single JSON (response)
            </label>
            <label>
              <input type="radio" name="jsonType" value="both">
              Request & Response
            </label>
          </div>
          
          <div id="singleJsonGroup">
            <div class="form-group">
              <label>
                <input type="checkbox" id="treatAsRequest">
                Treat as request instead of response
              </label>
            </div>
            <div class="form-group">
              <label for="singleJson">JSON Example:</label>
              <textarea id="singleJson" rows="8" placeholder='{"key": "value"}'></textarea>
            </div>
          </div>
          
          <div id="bothJsonGroup" style="display: none;">
            <div class="form-group">
              <label for="requestJson">Request JSON (optional):</label>
              <textarea id="requestJson" rows="6" placeholder='{"input": "data"}'></textarea>
            </div>
            <div class="form-group">
              <label for="responseJson">Response JSON (optional):</label>
              <textarea id="responseJson" rows="6" placeholder='{"output": "result"}'></textarea>
            </div>
          </div>
          
          <div class="dialog-actions">
            <button id="cancelBtn">Cancel</button>
            <button id="importBtn" class="primary">Import</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Handle radio button changes
    const radioButtons = dialog.querySelectorAll('input[name="jsonType"]');
    const singleGroup = dialog.getElementById('singleJsonGroup');
    const bothGroup = dialog.getElementById('bothJsonGroup');

    radioButtons.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === 'single') {
          singleGroup.style.display = 'block';
          bothGroup.style.display = 'none';
        } else {
          singleGroup.style.display = 'none';
          bothGroup.style.display = 'block';
        }
      });
    });

    // Handle buttons
    dialog.getElementById('cancelBtn').addEventListener('click', () => {
      document.body.removeChild(dialog);
      resolve(null);
    });

    dialog.getElementById('importBtn').addEventListener('click', () => {
      const title = dialog.getElementById('apiTitle').value.trim();
      const jsonType = dialog.querySelector('input[name="jsonType"]:checked').value;
      
      let result = { title };

      if (jsonType === 'single') {
        const singleJsonText = dialog.getElementById('singleJson').value.trim();
        const treatAsRequest = dialog.getElementById('treatAsRequest').checked;
        
        if (singleJsonText) {
          const singleJson = parseJsonSafely(singleJsonText);
          if (singleJson) {
            result.single = singleJson;
            result.treatSingleAsRequest = treatAsRequest;
          }
        }
      } else {
        const requestJsonText = dialog.getElementById('requestJson').value.trim();
        const responseJsonText = dialog.getElementById('responseJson').value.trim();
        
        if (requestJsonText) {
          const requestJson = parseJsonSafely(requestJsonText);
          if (requestJson) {
            result.request = requestJson;
          }
        }
        
        if (responseJsonText) {
          const responseJson = parseJsonSafely(responseJsonText);
          if (responseJson) {
            result.response = responseJson;
          }
        }
      }

      document.body.removeChild(dialog);
      resolve(result);
    });

    // Focus the title input
    dialog.getElementById('apiTitle').focus();
  });
}
