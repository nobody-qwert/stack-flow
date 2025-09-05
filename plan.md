# Data Flow Designer - Implementation Plan

## Overview
A modular, maintainable HTML-based data flow diagram tool that allows users to create visual representations of API endpoints, Postgres tables, and GUI elements with their variables, and connect them to show data flow and traceability across a software stack.

## Architecture Principles
- **Separation of concerns**: strict Model (state) / Services (logic) / View (render) / Controllers (user interactions)
- **Event-driven**: lightweight pub/sub event bus; no tight coupling between modules
- **Command pattern**: undo/redo stack for node/variable/edge operations
- **Pure functions** for parsing/validation; side effects isolated in controllers/services
- **ES Modules + JSDoc** types for maintainability, no bundling required
- **Small, well-documented modules** with unit-testable cores

## File Structure
```
index.html
assets/
  styles.css
  vendor/ (CDN-delivered or vendored) jsPlumb, panzoom
src/
  core/
    types.js          (Node, Variable, Edge, enums, helpers; JSDoc typedefs)
    store.js          (immutable-ish state container + selectors)
    eventBus.js       (pub/sub)
    commandStack.js   (undo/redo)
    id.js             (uuid utilities)
    normalizeTypes.js (Postgres→normalized mapping; JSON inference)
  services/
    importApi.js      (JSON example → variables, flattening)
    importPg.js       (PG descriptor → columns)
    importGui.js      (GUI descriptor → elements)
    validate.js       (compatibility, direction rules)
    persistence.js    (export/import diagram, LocalStorage autosave)
    lineage.js        (trace computations)
  ui/
    canvas/
      canvasView.js   (pan/zoom, grid, selection box)
      nodeView.js     (render API/Table/GUI nodes, grouped slots)
      portView.js     (render ports next to variables)
      edgeView.js     (render edges; selection; labels; status color)
    panels/
      palette.js      (add nodes, importers)
      inspector.js    (node/var/edge details, sample toggle)
      topbar.js       (new/import/export/autosave/search)
    controllers/
      interactionController.js (drag nodes; multi-select; keyboard)
      connectorController.js   (create/modify edges; live validation)
      selectionController.js   (single/multi selection state)
app.js              (bootstrap wiring: create store, bus, controllers, initial render)
```

## Core Data Model

### Node
```javascript
{
  id: string,           // uuid
  type: "api"|"table"|"gui",
  title: string,        // e.g., "POST /v1/chat", "public.events", "ChatForm"
  position: {x: number, y: number},
  variables: Variable[],
  metadata: object      // type-specific data
}
```

### Variable (slot/port)
```javascript
{
  id: string,           // uuid
  name: string,
  dataType: string,     // normalized types
  io: "in"|"out"|"both",
  sampleValue?: any,    // hidden by default in UI
  description?: string
}
```

### Edge (connection)
```javascript
{
  id: string,           // uuid
  from: {nodeId: string, portId: string},
  to: {nodeId: string, portId: string},
  transform?: string,   // optional mapping expression
  status?: "ok"|"warn"|"error"  // type-compatibility result
}
```

### Diagram Export/Import Format
```javascript
{
  "version": "0.1",
  "nodes": [Node, ...],
  "edges": [Edge, ...]
}
```

## Type System and Compatibility Rules

### Core Normalized Types
- `string`, `number`, `boolean`, `datetime`, `uuid`, `json`, `array`

### Postgres Mapping Examples
- `text/varchar` → `string`
- `int/bigint/numeric` → `number`
- `boolean` → `boolean`
- `timestamp/timestamptz` → `datetime`
- `uuid` → `uuid`
- `json/jsonb` → `json`

### Compatibility Checks (MVP)
- `string` ↔ `text/varchar` OK
- `number` ↔ `int/bigint/numeric` OK
- `boolean` ↔ `boolean` OK
- `datetime` ↔ `timestamp` OK
- `uuid` ↔ `uuid` OK
- `json` ↔ `jsonb` OK
- `array` requires same inner type or warn

### Direction Rules (MVP default)
- `API.out` → `TABLE.variable` (persist)
- `TABLE.variable` → `GUI.variable` (display/binding)
- `GUI.variable` → `API.in` (form submit) [optional but supported]
- Visual feedback: incompatible connections show warn/error color and tooltip

## Box Types

### API Endpoint
- **Title**: "METHOD URL" (e.g., "POST /v1/chat")
- **Metadata**: `{method: "GET|POST|...", url: string, auth?: string}`
- **Variables**: mark `io="in"` or `"out"` (separate groups in the box)
- **Importer**: from example JSON payload(s). Optionally two payloads: "request" (in) and "response" (out)
- **Nested JSON**: flatten strategy using dot notation (`user_id`, `profile.name` → `"profile.name"`)

### Postgres Table
- **Title**: "schema.table" (e.g., "public.events")
- **Metadata**: `{schema: string, table: string, pk?: string[]}`
- **Variables**: columns with dataType + constraints (nullable, pk, fk)
- **Importer**: from simple JSON table descriptor (not DB connection)

### GUI View
- **Title**: "ViewName" (e.g., "ChatForm", "ChatTranscript")
- **Metadata**: `{route?: string, framework?: string}`
- **Variables**: elements with name + elementType (input, textarea, table.column, label, etc.)
- **Palette**: quick-add common elements; user can rename

## On-Screen Connection Editing (First-Class Features)

### Create Connections
- Drag from source port to target port
- Live color feedback: green (ok), amber (warn), red (blocked)
- Disallow drop unless overridden for incompatible types

### Modify Connections
- **Reattach endpoints**: drag an endpoint handle of a selected edge to a new port; re-validate
- **Delete**: select edge and press Delete/Backspace; also via context menu
- **Reroute**: click "Reroute" in context menu to recompute orthogonal path
- **Labels/transform**: double-click edge to edit transform text (mapping note) in inspector
- **Direction**: arrowheads show flow; optional "flip" in context menu if allowed by io rules
- **Selection**: edges selectable; shift-click for multi-select; ESC clears selection
- **Snap/avoidance**: edges prefer orthogonal routing; nodes have magnetic ports for clean orthogonal connectors

### Bend Points (Phase 2)
- Alt+click on edge to add/remove midpoints for manual shaping

## UI/UX Layout

### Left Sidebar
- **Palette**: New API / Table / GUI
- **Importers**:
  - API: paste example JSON for request/response → generates variables with inferred types and sample values
  - Postgres: paste JSON descriptor → generates columns
  - GUI: add common elements or paste minimal JSON
- **Library**: saved templates/snippets (later phase)

### Canvas
- Pan/zoom, snap-to-grid (optional)
- Boxes with group headers per variable category (API in/out)
- Variable rows: name, type badge, sample toggle button (eye icon)
- Ports: small circles to drag connections

### Right Inspector
- Edit node title and metadata
- Manage variables (add/edit/remove; set type, io, sample)
- Edge inspector when selecting a connection (view compatibility, optional transform text field)

### Top Bar
- New, Import JSON, Export JSON
- Autosave toggle (LocalStorage)
- Search box (filter nodes/variables by name)

## Import Formats (Initial)

### API from Example JSON (request/response)
```javascript
{
  "request": { /* JSON example */ },
  "response": { /* JSON example */ }
}
```
- If only a single JSON is provided, default to `io="out"` (response) unless user selects "treat as request"

### Postgres Table Descriptor JSON
```javascript
{
  "schema": "public",
  "table": "events",
  "columns": [
    { "name": "session_id", "type": "uuid", "nullable": false, "pk": false },
    { "name": "readable_timestamp", "type": "timestamptz" },
    { "name": "user_id", "type": "text" },
    // ...
  ]
}
```

### GUI Descriptor (optional; can create via UI)
```javascript
{
  "view": "ChatForm",
  "elements": [
    { "name": "session_id", "elementType": "hidden", "io": "in" },
    { "name": "prompt", "elementType": "textarea", "io": "in" },
    { "name": "response", "elementType": "label", "io": "out" }
  ]
}
```

## Lineage and Traceability

### Click Any Variable Slot
- Highlight upstream/downstream edges and nodes
- Breadcrumb of path (e.g., `GUI.ChatForm.prompt → API.POST /chat.request.prompt → TABLE.public.events.prompt`)

### Export Lineage Report (Phase 2)
- CSV/JSON listing mappings: `source[node.variable] → target[node.variable]` with types and notes

## Validation and UX Safeguards

### While Dragging to Connect
- Show live compatibility status (green/amber/red)
- Disallow drop if hard-incompatible unless user overrides

### On Import/Update
- Normalize/merge variables (avoid duplicates by name, optional)
- Warn on conflicting types

## Implementation Phases

### Phase 1 (MVP)
- Static SPA scaffold (index.html, styles.css, app.js)
- Core data model + store
- Create/drag nodes; pan/zoom canvas
- Variables list and port rendering
- Connect edges with direction/type checks
- Toggle sample values hidden/visible per variable
- Importers: API example JSON (flatten), Postgres descriptor JSON
- Export/Import full diagram JSON; autosave to LocalStorage
- Basic lineage highlight on variable click

### Phase 2 (Usability + Reporting)
- Edge inspector with optional transform annotation
- Search/filter nodes/variables
- Validation summary panel (incompatible links, missing types)
- Export lineage/mapping CSV
- Quick templates for GUI elements

### Phase 3 (Advanced)
- OpenAPI import (select endpoint → request/response → variables)
- Parse Postgres DDL text (CREATE TABLE) into descriptor
- Grouping/Swimlanes (API, Data, UI zones)
- Minimap, auto-layout options
- Shareable permalink (backend optional) or file-based presets

## Example Node Representations

### API Endpoint (from your example)
- **Node**: `type="api"`, `title="POST /sessions"`
- **Variables (out)**: `session_id:uuid`, `readable_timestamp:datetime`, `user_id:string`, `organization_id:string`, `project_name:string`, `model_name:string`, `agent_name:string`, `input_token_count:number`, `output_token_count:number`, `response_time:number`
- Each variable retains `sampleValue`; default UI hides samples

### Postgres Table
- **Node**: `type="table"`, `title="public.events"`
- **Columns**: `session_id:uuid (pk?)`, `readable_timestamp:timestamptz→datetime`, `user_id:text→string`, etc.

### GUI View
- **Node**: `type="gui"`, `title="ChatTranscript"`
- **Elements**: `session_id:hidden (in)`, `readable_timestamp:label (out)`, `response:label (out)`

## Technology Stack

### Libraries (Default)
- **Connectors/edges/anchors**: jsPlumb Community via CDN (stable, supports endpoint drag/reattach, styles, events)
- **Pan/zoom**: panzoom for canvas container
- **No framework**: plain DOM + small helper utilities

### Maintainability Choices
- **ES Modules + JSDoc** typedefs in `src/core/types.js` for editor intellisense
- **Linting/formatting**: ESLint + Prettier configs (no build step)
- **Commands (undo/redo)**: `addNode`, `updateNode`, `addVar`, `updateVar`, `addEdge`, `updateEdge`, `deleteEdge`, etc. All routed through `commandStack` for consistent history
- **Event channels** (examples): `"node:add"`, `"node:update"`, `"edge:add"`, `"edge:update"`, `"edge:remove"`, `"selection:change"`, `"persist:autosave"`
- **Views are stateless** and driven by store selectors; controllers translate UI actions → commands

## Security/Privacy
- Entirely client-side; no network calls
- Data persists only in LocalStorage or exported JSON files the user downloads

## Acceptance Criteria for "Modify Connections on Screen"

User can:
- Create a connection by dragging from a port to another
- Select an edge (visible selection state)
- Drag either endpoint to a different compatible port to reattach
- Delete an edge with keyboard or context menu
- See immediate validation feedback while dragging
- Optional: edit edge label/transform (Phase 2)

## Open Questions Resolved

- **Library preference**: jsPlumb Community (MIT) via CDN for fast, robust connectors
- **Language**: Plain JS ES modules (simpler, no build) with JSDoc types
- **JSON flattening**: Dot notation for nested objects (configurable)
- **API imports**: Start with example JSON only for MVP, consider OpenAPI later
- **Postgres input**: JSON descriptors for MVP, DDL parsing later
- **Allowed link directions**: Enable GUI→API.in (forms) in MVP, in addition to API.out→TABLE and TABLE→GUI
- **Persistence**: LocalStorage autosave on/off plus manual JSON export/import
