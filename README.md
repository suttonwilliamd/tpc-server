# TPC Server

A Node.js/Express API for AI-human collaboration, starting with JSON file storage for thoughts and plans.

## v1.0 - Basic Thought Logger

### Setup and Usage
1. Install dependencies: `npm install`
2. Start the server: `node server.js`
3. The server runs on `http://localhost:3000`

### Endpoints
- **POST /thoughts**
  - **Description**: Creates a new thought entry.
  - **Request Body**: `{ "content": "string" }` (required, non-empty)
  - **Response**: 201 Created, `{ "id": "number", "content": "string", "timestamp": "ISO string" }`
  - **Errors**:
    - 400 Bad Request if content is missing or empty.
  - **Persistence**: Thoughts are appended to `data/thoughts.json` with auto-incrementing IDs starting from 1.
  - **Notes**: Duplicate content is allowed. No retrieval endpoint in v1.0 (internal testing uses temporary GET).

## v1.1 - Basic Plan Creator

### Endpoints
- **POST /plans**
  - **Description**: Creates a new plan entry.
  - **Request Body**: `{ "title": "string" (required, non-empty), "description": "string" (required, non-empty) }`
  - **Response**: 201 Created, `{ "id": number, "title": "string", "description": "string", "status": "proposed" }`
  - **Errors**:
    - 400 Bad Request if title or description is missing or empty.
  - **Persistence**: Plans are appended to `data/plans.json` with auto-incrementing IDs starting from 1 and a timestamp.
  - **Notes**: Duplicate titles are allowed. Status is set to "proposed". No retrieval endpoint in v1.1 (internal testing uses fs reads). v1.0 /thoughts endpoint remains unchanged.

### Testing
Run `npm test` to execute Jest tests verifying the endpoint functionality.

### Project Structure
- `server.js`: Main Express server.
- `data/thoughts.json`: JSON storage for thoughts (initially empty array).
- `data/plans.json`: JSON storage for plans (initially empty array).
- `thoughts.test.js`: Unit tests using Supertest.
- `plans.test.js`: Unit tests for plans endpoint using Supertest.
- `package.json`: Dependencies and scripts.

Future versions will add plans, retrieval, and more features without breaking v1.0 compatibility.

## v1.2 - Plan Status Updater

### Endpoints

- **PATCH /plans/:id**
  - **Description**: Updates the status of an existing plan.
  - **Request Body**: `{ "status": "in_progress" | "completed" }` (optional; if omitted, no change)
  - **Response**: 200 OK, `{ "status": "updated_status" }`
  - **Errors**:
    - 400 Bad Request if status is invalid (must be "proposed", "in_progress", or "completed").
    - 404 Not Found if plan ID does not exist.
  - **Persistence**: Updates the status in `data/plans.json`.
  - **Notes**: Status defaults to "proposed" on creation. This endpoint only updates status; other fields unchanged.

- **GET /plans/:id** (Temporary for testing)
  - **Description**: Retrieves a single plan by ID.
  - **Response**: 200 OK, full plan object.
  - **Errors**: 404 Not Found if plan ID does not exist.
  - **Notes**: Will be replaced by full list retrieval in v1.3. v1.0 /thoughts and v1.1 /plans endpoints remain unchanged.