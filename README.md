# Real-Time Object & Defect Counter Dashboard

A polished, production-ready computer vision application built with **React (Vite)**, **TypeScript**, and **Tailwind CSS v4** that performs real-time in-browser object detection, object tracking, boundary/zone counting, and quality assurance defect analysis.

## Key Features

1. **Flexible Video Sources**: Support for live webcam feeds, local uploaded mp4 files, and an integrated **Production Line Simulator** (for demoing defect rates without hardware).
2. **Edge CV Engine**: In-browser inference utilizing:
   - **TensorFlow.js** (loading the lightweight MobileNet-based COCO-SSD).
   - **ONNX Runtime Web** (running custom user-uploaded YOLOv8 `.onnx` models).
3. **Persistent Tracking**: A lightweight tracker based on Intersection-over-Union (IoU) greedy matching to assign persistent unique IDs to moving objects, ensuring each unique object is counted exactly once.
4. **Custom Scanner Boundaries**:
   - **Line-Crossing Mode**: Counts objects whose movement vector intersects a custom drawn scanner line.
   - **Zone Entry Mode**: Counts objects that cross from outside to inside a custom drawn polygon zone (Ray-Casting PNPOLY algorithm).
5. **Quality Control Badging**: Evaluates defect status (PASS/FAIL), grades severity (Minor, Major, Critical), triggers sound alarms (Web Audio API synthesis), and alerts when defect rates exceed safe limits.
6. **Data Storage & Reports**: Saved sessions browser backed by **IndexedDB**, CSV logs exports, and fully structured compiled **PDF Reports** (jsPDF).

---

## Getting Started

### Prerequisites

- **Node.js** (v18.0.0 or higher recommended)
- **npm** (v9.0.0 or higher)

### Run Locally

1. **Navigate to the project directory**:
   ```bash
   cd cv-defect-dashboard
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.

---

## Swapping in Custom ONNX Models

The dashboard is engineered to parse standard **YOLOv8** models converted to ONNX format.

1. **Select Uploader**: In the **Settings Panel**, change the **Vision Model Engine** to `Custom ONNX Model`.
2. **Provide Class Labels**: Input a comma-separated list of your model's classes in order (e.g. `crack, scratch, dent, rust`) so the parser can match indexes with labels.
3. **Upload Model**: Click `Choose ONNX File` and select your compiled `.onnx` model (e.g. `yolov8n.onnx`).
4. **Inference Pipeline**:
   - The engine scales the input source to `640x640`.
   - Passes the Float32 tensor shape `[1, 3, 640, 640]` normalized between `[0, 1]` to ONNX Runtime Web.
   - Decodes output shape `[1, 84, 8400]` (or `[1, classes+4, 8400]`), extracts bounding box centers and class probabilities, and filters them using Non-Maximum Suppression (NMS) entirely client-side.

---

## How it Works

### 1. Bounding Box Tracking (IoU Greedy Matcher)
To prevent double-counting as objects move across frames:
- An **Intersection over Union (IoU)** coefficient is calculated between all active tracked objects and newly detected boxes in the current frame.
- Detections are paired with existing tracks greedily (highest overlap first) if `IoU >= 0.25`.
- Unmatched detections are spawned as new persistent track IDs (e.g. `TRK-001`).
- If an object is temporarily occluded or missed, the tracker holds its state for up to **15 frames** (`maxLostFrames`) before deletion.

### 2. Line Crossing Mathematics
Determined using line segment intersection check (using vector cross product orientations):
- We define a gate line segment $AB$ drawn by the user.
- We check the object's recent motion path segment $CD$ (its center point coordinates from the previous frame to the current frame).
- If segments $AB$ and $CD$ intersect, a crossing event is logged, and the object's ID is marked as counted for that gate.

### 3. Polygon Zone Entry Mathematics (Ray-Casting)
Determined using the PNPOLY ray-casting algorithm:
- We shoot an imaginary ray horizontally from the object's center coordinates.
- We count the number of times the ray intersects the polygon zone segments.
- If the intersections count is odd, the point is inside the polygon.
- An entry event is triggered when the previous point was outside and the current point is inside.
