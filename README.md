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

### Testing
Run `npm test` to execute Jest tests verifying the endpoint functionality.

### Project Structure
- `server.js`: Main Express server.
- `data/thoughts.json`: JSON storage for thoughts (initially empty array).
- `thoughts.test.js`: Unit tests using Supertest.
- `package.json`: Dependencies and scripts.

Future versions will add plans, retrieval, and more features without breaking v1.0 compatibility.