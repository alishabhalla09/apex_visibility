import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import * as ort from 'onnxruntime-web';
import type { Detection } from '../types';

// Set up ONNX webassembly paths
try {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
} catch (e) {
  console.error('Failed to set ONNX WASM path:', e);
}

export class CVEngine {
  private cocoModel: cocoSsd.ObjectDetection | null = null;
  private onnxSession: ort.InferenceSession | null = null;
  private onnxClassNames: string[] = [];
  
  // Simulation variables
  private simObjects: Array<{
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
    className: string;
    speed: number;
    defectType?: string;
    severity?: 'minor' | 'major' | 'critical';
    confidence: number;
  }> = [];
  private nextSimId = 1;

  // Gap window control — conveyor alternates between ACTIVE and GAP phases
  private simPhase: 'active' | 'gap' = 'active';
  private simPhaseUntil = Date.now() + 5000; // start with 5s active
  private simSpawnAccumulator = 0;

  public async loadCocoSSD(onProgress?: (progress: number) => void): Promise<void> {
    if (this.cocoModel) return;
    
    try {
      onProgress?.(20);
      await tf.ready();
      onProgress?.(50);
      this.cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
      onProgress?.(100);
    } catch (e) {
      console.error('Error loading COCO-SSD:', e);
      throw e;
    }
  }

  public async loadCustomONNX(
    modelFile: File | ArrayBuffer,
    classNames: string[],
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      onProgress?.(20);
      let arrayBuffer: ArrayBuffer;
      if (modelFile instanceof File) {
        arrayBuffer = await modelFile.arrayBuffer();
      } else {
        arrayBuffer = modelFile;
      }
      onProgress?.(60);

      const uint8Array = new Uint8Array(arrayBuffer);
      this.onnxSession = await ort.InferenceSession.create(uint8Array, {
        executionProviders: ['wasm'],
      });
      
      this.onnxClassNames = classNames.length > 0 
        ? classNames 
        : ['defect', 'scratch', 'dent', 'crack']; // Default fallbacks
      
      onProgress?.(100);
    } catch (e) {
      console.error('Error loading custom ONNX model:', e);
      throw e;
    }
  }

  public unloadONNX(): void {
    this.onnxSession = null;
    this.onnxClassNames = [];
  }

  public async detect(
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    modelType: 'coco-ssd' | 'face-api' | 'custom-onnx' | 'simulation',
    confidenceThreshold = 0.5,
    nmsThreshold = 0.45
  ): Promise<Detection[]> {
    if (modelType === 'simulation' || modelType === 'face-api') {
      return this.runSimulationDetection(confidenceThreshold);
    }

    if (modelType === 'coco-ssd') {
      if (!this.cocoModel) {
        throw new Error('COCO-SSD model is not loaded');
      }
      const rawDetections = await this.cocoModel.detect(source);
      return rawDetections
        .filter((d) => d.score >= confidenceThreshold)
        .map((d) => ({
          bbox: d.bbox as [number, number, number, number], // [x, y, w, h]
          classId: 0, // coco-ssd mapping is string-based
          className: d.class,
          confidence: d.score,
        }));
    }

    if (modelType === 'custom-onnx') {
      if (!this.onnxSession) {
        throw new Error('ONNX inference session is not active');
      }
      return this.runONNXInference(source, confidenceThreshold, nmsThreshold);
    }

    return [];
  }

  /**
   * Run custom ONNX YOLOv8 Inference.
   */
  private async runONNXInference(
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    confThreshold: number,
    nmsThreshold: number
  ): Promise<Detection[]> {
    const session = this.onnxSession!;
    const inputWidth = 640;
    const inputHeight = 640;

    // Create offscreen canvas to scale and extract image pixels
    const canvas = document.createElement('canvas');
    canvas.width = inputWidth;
    canvas.height = inputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(source, 0, 0, inputWidth, inputHeight);

    const imgData = ctx.getImageData(0, 0, inputWidth, inputHeight);
    const float32Data = new Float32Array(3 * inputWidth * inputHeight);

    // Normalize and transpose: HWC to CHW (R, G, B channels separated)
    for (let i = 0; i < imgData.data.length / 4; i++) {
      const r = imgData.data[i * 4] / 255.0;
      const g = imgData.data[i * 4 + 1] / 255.0;
      const b = imgData.data[i * 4 + 2] / 255.0;

      float32Data[i] = r; // Red channel
      float32Data[inputWidth * inputHeight + i] = g; // Green channel
      float32Data[2 * inputWidth * inputHeight + i] = b; // Blue channel
    }

    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, inputWidth, inputHeight]);

    // YOLOv8 models usually have input name 'images'
    const inputName = session.inputNames[0];
    const feeds = { [inputName]: inputTensor };
    
    const outputMap = await session.run(feeds);
    const outputName = session.outputNames[0];
    const outputTensor = outputMap[outputName];
    
    // YOLOv8 output size: [1, 84, 8400] (84 dimensions: 4 coordinates + 80 class probabilities)
    const data = outputTensor.data as Float32Array;
    const dims = outputTensor.dims; // [1, num_channels, num_anchors] (e.g. [1, 84, 8400] or [1, 5, 8400])
    
    const numChannels = dims[1]; // channels (e.g. 4 coordinates + classes)
    const numAnchors = dims[2]; // anchors (usually 8400)
    
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    const scaleX = sourceWidth / inputWidth;
    const scaleY = sourceHeight / inputHeight;

    const candidates: Detection[] = [];

    // Parse predictions
    for (let col = 0; col < numAnchors; col++) {
      // Coordinates of bounding box: cx, cy, w, h
      const cx = data[col];
      const cy = data[numAnchors + col];
      const w = data[2 * numAnchors + col];
      const h = data[3 * numAnchors + col];

      // Class confidence scores start at channel index 4
      let maxScore = -1;
      let maxClassId = -1;
      for (let ch = 4; ch < numChannels; ch++) {
        const score = data[ch * numAnchors + col];
        if (score > maxScore) {
          maxScore = score;
          maxClassId = ch - 4;
        }
      }

      if (maxScore > confThreshold) {
        // Convert center x,y,w,h to top-left x,y,w,h in source resolution
        const x = (cx - w / 2) * scaleX;
        const y = (cy - h / 2) * scaleY;
        const width = w * scaleX;
        const height = h * scaleY;

        candidates.push({
          bbox: [x, y, width, height],
          classId: maxClassId,
          className: this.onnxClassNames[maxClassId] || `class_${maxClassId}`,
          confidence: maxScore,
        });
      }
    }

    // Apply Non-Maximum Suppression (NMS)
    return this.applyNMS(candidates, nmsThreshold);
  }

  private applyNMS(detections: Detection[], threshold: number): Detection[] {
    // Sort by confidence descending
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const selected: Detection[] = [];
    const active = new Array(sorted.length).fill(true);

    const getIoU = (boxA: [number, number, number, number], boxB: [number, number, number, number]) => {
      const x1 = Math.max(boxA[0], boxB[0]);
      const y1 = Math.max(boxA[1], boxB[1]);
      const x2 = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
      const y2 = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

      if (x2 <= x1 || y2 <= y1) return 0;

      const inter = (x2 - x1) * (y2 - y1);
      const areaA = boxA[2] * boxA[3];
      const areaB = boxB[2] * boxB[3];
      const union = areaA + areaB - inter;
      return union === 0 ? 0 : inter / union;
    };

    for (let i = 0; i < sorted.length; i++) {
      if (!active[i]) continue;
      selected.push(sorted[i]);
      for (let j = i + 1; j < sorted.length; j++) {
        if (active[j]) {
          const iou = getIoU(sorted[i].bbox, sorted[j].bbox);
          if (iou > threshold) {
            active[j] = false;
          }
        }
      }
    }

    return selected;
  }

  /**
   * Generates simulated product flows across a conveyor belt.
   * Alternates between ACTIVE (items flowing) and GAP (empty belt) phases
   * to make presence/absence detection meaningful.
   */
  private runSimulationDetection(
    confThreshold: number
  ): Detection[] {
    // Return detections with realistic jitter for currently active simObjects
    return this.simObjects.map((obj) => {
      const jitterX = (Math.random() - 0.5) * 4;
      const jitterY = (Math.random() - 0.5) * 4;
      const jitterW = (Math.random() - 0.5) * 3;
      const jitterH = (Math.random() - 0.5) * 3;

      return {
        bbox: [
          obj.x + jitterX,
          obj.y + jitterY,
          obj.w + jitterW,
          obj.h + jitterH,
        ] as [number, number, number, number],
        classId: obj.defectType ? 1 : 0,
        className: obj.className,
        confidence: obj.confidence - Math.random() * 0.05,
      };
    }).filter(d => d.confidence >= confThreshold);
  }

  /**
   * Updates the positions of simulation elements, spawns new items,
   * and draws the complete animated conveyor belt background + PCB images.
   * Runs at 60fps in the animation frame loop.
   */
  public updateAndDrawSimulation(
    canvas: HTMLCanvasElement,
    presenceStatus: 'present' | 'absent' | 'idle'
  ): void {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const now = Date.now();
    const isGap = presenceStatus === 'absent';

    // 1. Draw Conveyor Belt Lane Background
    const floorGrad = ctx.createLinearGradient(0, 0, 0, h);
    floorGrad.addColorStop(0, '#1e293b');
    floorGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, w, h);

    // Status indicator text at top
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = isGap ? '#ef4444' : '#10b981';
    ctx.fillText(
      isGap ? '⚠  GAP — NO ITEM DETECTED' : '◉  ACTIVE — CONVEYOR RUNNING',
      12, 22
    );

    // Phase indicator bar at top
    ctx.fillStyle = isGap ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.08)';
    ctx.fillRect(0, 0, w, 30);
    ctx.strokeStyle = isGap ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, 30);

    // Conveyor track lane — dimmer during gap
    ctx.fillStyle = isGap ? '#1e293b' : '#334155';
    ctx.fillRect(0, h * 0.4, w, h * 0.25);
    ctx.strokeStyle = isGap ? '#334155' : '#475569';
    ctx.lineWidth = 4;
    ctx.strokeRect(-5, h * 0.4, w + 10, h * 0.25);

    // Roller lines — slower / dimmer during gap
    const speed = isGap ? 5 : 20;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    for (let rx = (Date.now() / speed) % 80; rx < w; rx += 80) {
      ctx.beginPath();
      ctx.moveTo(rx, h * 0.4);
      ctx.lineTo(rx, h * 0.65);
      ctx.stroke();
    }

    // WAITING overlay text in belt area during gap
    if (isGap) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = 'rgba(239,68,68,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText('— WAITING FOR ITEM —', w / 2, h * 0.55);
      ctx.textAlign = 'left';
    }

    // 2. Physics: Phase switching
    if (now > this.simPhaseUntil) {
      if (this.simPhase === 'active') {
        this.simPhase = 'gap';
        this.simPhaseUntil = now + 2000 + Math.random() * 3000;
      } else {
        this.simPhase = 'active';
        this.simPhaseUntil = now + 4000 + Math.random() * 4000;
      }
    }

    // 3. Physics: Spawn items only during ACTIVE phase
    if (this.simPhase === 'active') {
      this.simSpawnAccumulator++;
      // Spawn one item every ~40 frames (~0.67s at 60fps) when active
      if (this.simSpawnAccumulator >= 40 && this.simObjects.length < 5) {
        this.simSpawnAccumulator = 0;

        const isDefect = Math.random() < 0.15; // 15% defect rate
        const defectTypes = ['scratch', 'dent', 'crack', 'missing_part'];
        const defectType = isDefect ? defectTypes[Math.floor(Math.random() * defectTypes.length)] : undefined;
        
        let severity: 'minor' | 'major' | 'critical' | undefined;
        if (isDefect) {
          const rand = Math.random();
          severity = rand > 0.85 ? 'critical' : rand > 0.5 ? 'major' : 'minor';
        }

        this.simObjects.push({
          id: this.nextSimId++,
          x: -80,
          y: h * 0.45 + (Math.random() - 0.5) * 60,
          w: 60 + Math.random() * 40,
          h: 60 + Math.random() * 40,
          className: isDefect ? defectType! : 'electronic_board',
          speed: 2.5 + Math.random() * 2,
          defectType,
          severity,
          confidence: 0.82 + Math.random() * 0.17,
        });
      }
    }

    // 4. Physics: Move objects across belt and remove off-screen ones
    this.simObjects = this.simObjects
      .map(obj => ({ ...obj, x: obj.x + obj.speed }))
      .filter(obj => obj.x < w + 100);

    // 5. Drawing: Render procedural products
    this.simObjects.forEach((obj) => {
      this.drawProceduralPCB(ctx, obj.x, obj.y, obj.w, obj.h, !!obj.defectType, obj.defectType);
    });
  }

  /**
   * Draws a procedurally generated electronic circuit board (PCB)
   * on the conveyor simulation canvas, with visual representations of defects.
   */
  private drawProceduralPCB(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isDefect: boolean,
    defectType?: string
  ): void {
    ctx.save();

    // 1. Draw Green Solder Mask Board Base
    ctx.fillStyle = '#064e3b'; // deep industrial green
    ctx.fillRect(x, y, w, h);

    // Beveled corner / edge board border highlight
    ctx.strokeStyle = '#10b981'; // bright green highlight border
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);

    // 2. Copper Contacts along the top and bottom edges (golden pads)
    ctx.fillStyle = '#d97706'; // copper gold
    const padW = 3;
    const padH = 5;
    for (let px = x + 8; px < x + w - 8; px += 7) {
      ctx.fillRect(px, y + 1, padW, padH); // top pads
      ctx.fillRect(px, y + h - 1 - padH, padW, padH); // bottom pads
    }

    // 3. Copper Solder Tracks (Traces)
    ctx.strokeStyle = '#047857'; // lighter trace green
    ctx.lineWidth = 1;
    
    // Horizontal traces
    ctx.beginPath();
    ctx.moveTo(x + 10, y + h * 0.3);
    ctx.lineTo(x + w * 0.4, y + h * 0.3);
    ctx.lineTo(x + w * 0.5, y + h * 0.5);
    ctx.lineTo(x + w - 10, y + h * 0.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 10, y + h * 0.7);
    ctx.lineTo(x + w * 0.3, y + h * 0.7);
    ctx.lineTo(x + w * 0.45, y + h * 0.45);
    ctx.lineTo(x + w - 10, y + h * 0.45);
    ctx.stroke();

    // 4. Integrated Circuit (Main MCU chip)
    const chipW = w * 0.35;
    const chipH = h * 0.35;
    const chipX = x + (w - chipW) / 2;
    const chipY = y + (h - chipH) / 2;

    ctx.fillStyle = '#0f172a'; // slate-900 chip packaging
    ctx.fillRect(chipX, chipY, chipW, chipH);

    // Chip notch indicator
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(chipX, chipY + chipH / 2, 2, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    // Silver MCU pins
    ctx.fillStyle = '#94a3b8'; // silver pins
    for (let pinX = chipX + 3; pinX < chipX + chipW - 2; pinX += 5) {
      ctx.fillRect(pinX, chipY - 2, 1.5, 2); // top pins
      ctx.fillRect(pinX, chipY + chipH, 1.5, 2); // bottom pins
    }

    // 5. Discrete Components (Capacitors and Resistors)
    // Tantalum Capacitor (Yellow/Amber box)
    ctx.fillStyle = '#b45309'; // amber
    ctx.fillRect(x + 8, y + 8, 7, 10);
    ctx.fillStyle = '#d97706'; // positive bar indicator
    ctx.fillRect(x + 8, y + 8, 7, 2.5);

    // Resistors (Small black/silver packs)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + w - 15, y + 8, 5, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x + w - 15, y + 8, 5, 1.5);
    ctx.fillRect(x + w - 15, y + 8 + 6.5, 5, 1.5);

    // Second Chip (Unless it is missing_part defect)
    if (defectType !== 'missing_part') {
      ctx.fillStyle = '#1e293b'; // EEPROM chip
      ctx.fillRect(x + 8, y + h - 18, 12, 10);
      ctx.fillStyle = '#64748b'; // pins
      for (let px = x + 10; px < x + 19; px += 3) {
        ctx.fillRect(px, y + h - 20, 1.2, 2);
        ctx.fillRect(px, y + h - 8, 1.2, 2);
      }
    } else {
      // Missing chip outline (exposed copper pads indicating part is absent)
      ctx.strokeStyle = '#d97706'; // copper pads outline
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 8, y + h - 18, 12, 10);
      
      // Draw copper solder pads on board where chip pins would sit
      ctx.fillStyle = '#d97706';
      for (let px = x + 10; px < x + 19; px += 3) {
        ctx.fillRect(px, y + h - 20, 1.2, 1.5);
        ctx.fillRect(px, y + h - 9.5, 1.2, 1.5);
      }
    }

    // 6. Draw Visual Defects
    if (isDefect) {
      if (defectType === 'scratch') {
        // Long diagonal bright scratch
        ctx.strokeStyle = '#f1f5f9'; // white scratch path
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 5);
        ctx.lineTo(x + w - 10, y + h - 10);
        ctx.stroke();

        ctx.strokeStyle = '#ef4444'; // red outline highlight
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (defectType === 'dent') {
        // Depressed dark indentation shadow
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(x + w * 0.3, y + h * 0.35, 7, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#b91c1c'; // rust red dent border
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (defectType === 'crack') {
        // Jagged black fracture lines crossing board
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.6, y);
        ctx.lineTo(x + w * 0.55, y + h * 0.35);
        ctx.lineTo(x + w * 0.65, y + h * 0.65);
        ctx.lineTo(x + w * 0.5, y + h);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

export const cvEngine = new CVEngine();
