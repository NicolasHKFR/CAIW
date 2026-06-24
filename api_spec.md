# API Specification & Communication Contract

This document defines the REST API endpoints and WebSocket channels for communication between the React frontend and the local FastAPI backend. Both layers must implement and adhere strictly to these schemas.

---

## 1. Projects & Designs API

### GET `/api/projects`
Retrieves a list of all local projects saved in the SQLite database.
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "name": "Scandinavian Apartment",
      "original_prompt": "90m2 modern apartment with 2 bedrooms",
      "created_at": "2026-06-22T21:30:00Z",
      "updated_at": "2026-06-22T21:35:00Z"
    }
  ]
  ```

### POST `/api/projects`
Creates a new blank project.
- **Request Body**:
  ```json
  {
    "name": "New Project Workspace",
    "original_prompt": "Create a modern 80m2 apartment"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "name": "New Project Workspace",
    "original_prompt": "Create a modern 80m2 apartment",
    "created_at": "2026-06-22T21:38:00Z",
    "updated_at": "2026-06-22T21:38:00Z"
  }
  ```

### DELETE `/api/projects/{id}`
Deletes a project and all associated designs and asset files.
- **Response (204 No Content)**

---

## 2. Design Versions & Layout API

### GET `/api/projects/{project_id}/designs`
Retrieves all generated design versions (snapshots) for a project.
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "a50c822e-1e4e-4f7f-8326-857eb05949d0",
      "project_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "version": 1,
      "json_definition": {
        "buildingType": "apartment",
        "totalSurfaceArea": 90,
        "style": "scandinavian",
        "rooms": [...]
      },
      "rendering_image_path": "/assets/3fa85f64-5717-4562-b3fc-2c963f66afa6/version_1_render.png",
      "floor_plan_image_path": "/assets/3fa85f64-5717-4562-b3fc-2c963f66afa6/version_1_layout.png",
      "created_at": "2026-06-22T21:30:00Z"
    }
  ]
  ```

### PUT `/api/projects/{project_id}/designs/{version}`
Updates a specific layout's Room coordinates. This is called when the user drags/modifies walls or repositions furniture inside the React Canvas editor.
- **Request Body**:
  ```json
  {
    "json_definition": {
      "buildingType": "apartment",
      "totalSurfaceArea": 90,
      "style": "scandinavian",
      "rooms": [
        {
          "id": "living_room",
          "type": "living_room",
          "targetArea": 35,
          "x": 0,
          "y": 0,
          "w": 7,
          "h": 5,
          "furniture": [
            { "id": "sofa_1", "name": "sofa", "x": 1.2, "y": 2.0, "width": 2.2, "length": 0.9 }
          ]
        }
      ]
    }
  }
  ```
- **Response (200 OK)**: Returns the updated Design record, and triggers a lightweight recalculation of paths and metrics.

---

## 3. Real-Time Generation WebSocket (`/api/ws/chat`)

Because AI layout solving and image generation can take up to 30–60 seconds, the frontend uses a WebSocket channel to trigger generations and monitor progress in real-time.

### A. Client Request Payload (Initiating generation)
Sent by the React client to initiate a chat message and trigger a new layout:
```json
{
  "project_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "message": "Move the bathroom adjacent to the hallway and regenerate"
}
```

### B. Server Response Payload (Streaming updates)
The server streams progress and status logs during generation:

#### 1. Status Update (Parsing prompt)
```json
{
  "event": "progress",
  "status": "parsing",
  "message": "AI is parsing your request and analyzing requirements..."
}
```

#### 2. Status Update (Constraint Solving)
```json
{
  "event": "progress",
  "status": "solving",
  "message": "Arranging rooms and validating connectivity rules..."
}
```

#### 3. Status Update (Image Rendering)
```json
{
  "event": "progress",
  "status": "rendering",
  "message": "Generating photorealistic interior style concept images (this may take 20-30s)..."
}
```

#### 4. Generation Complete
Sent once the SQLite record, layout coordinates, and Stable Diffusion renderings are fully saved:
```json
{
  "event": "complete",
  "design": {
    "version": 2,
    "json_definition": { ... },
    "rendering_image_path": "/assets/3fa85f64-5717-4562-b3fc-2c963f66afa6/version_2_render.png"
  },
  "message": "I've successfully generated the layout and concept design! What do you think?"
}
```

#### 5. Generation Error
Sent if the layout solver fails to resolve constraints or if the AI model fails:
```json
{
  "event": "error",
  "message": "Could not satisfy layout rules: The minimum size constraint for the living room (35m²) exceeds the available footprint."
}
```

---

## 4. Local Settings API

Allows fetching and updating config settings without user login. Stored locally in SQLite or `config.json`.

### GET `/api/settings`
- **Response (200 OK)**:
  ```json
  {
    "mock_mode": false,
    "llm_provider": "ollama",
    "llm_endpoint": "http://localhost:11434",
    "llm_model": "mistral",
    "image_provider": "local_sd",
    "image_endpoint": "http://localhost:7860",
    "openai_api_key": "",
    "replicate_api_key": ""
  }
  ```

### PUT `/api/settings`
- **Request Body**: (Same structure as GET response)
- **Response (200 OK)**: Confirms settings were saved locally.
