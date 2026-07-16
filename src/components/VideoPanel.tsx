import React, { useRef, useEffect, useState } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import { cvEngine } from '../services/cvEngine';
import { ObjectTracker } from '../services/tracker';
import type { Point } from '../types';
import { 
  Camera, 
  Upload, 
  Play, 
  Pause, 
  CameraOff, 
  CheckSquare, 
  PenTool, 
  Tv
} from 'lucide-react';

export const VideoPanel: React.FC = () => {
  const {
    webcamActive,
    isPaused,
    setIsPaused,
    currentFeedSource,
    setFeedSource,
    feedUrl,
    settings,
    activeTracks,
    updateTracks,
    updatePerformanceStats,
    countingZones,
    isDrawing,
    drawingType,
    currentDrawingPoints,
    startDrawing,
    addDrawingPoint,
    finishDrawing,
    cancelDrawing,
    stats,
    presenceStatus,
  } = useDashboardStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const trackerRef = useRef<ObjectTracker>(new ObjectTracker());
  const animationFrameId = useRef<number | null>(null);
  const frameCount = useRef<number>(0);
  const fpsInterval = useRef<any>(null);
  const frameCounter = useRef<number>(0); // Running index to skip frames

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isDrawingNameOpen, setIsDrawingNameOpen] = useState(false);
  const [zoneName, setZoneName] = useState('');
  
  // Simulated canvas buffer for drawing the simulated conveyor belt background
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize simulation board generator
  useEffect(() => {
    if (!simCanvasRef.current) {
      simCanvasRef.current = document.createElement('canvas');
      simCanvasRef.current.width = 640;
      simCanvasRef.current.height = 480;
    }
  }, []);

  // Fetch available camera sources
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then((deviceList) => {
        const videoDevices = deviceList.filter((d) => d.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      })
      .catch((err) => console.warn('Could not enumerate cameras:', err));
  }, []);

  // Setup webcam stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    if (webcamActive && currentFeedSource === 'webcam' && videoRef.current) {
      const constraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId }, width: 640, height: 480 }
          : { width: 640, height: 480 },
      };

      navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
          activeStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.warn(e));
          }
        })
        .catch((err) => {
          console.error('Error opening camera:', err);
          alert('Could not access camera. Falling back to simulator.');
          setFeedSource('simulation');
        });
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [webcamActive, selectedDeviceId, currentFeedSource]);

  // Track FPS separately
  useEffect(() => {
    fpsInterval.current = setInterval(() => {
      const currentFps = frameCount.current;
      updatePerformanceStats(currentFps, stats.latency);
      frameCount.current = 0;
    }, 1000);

    return () => {
      if (fpsInterval.current) clearInterval(fpsInterval.current);
    };
  }, [stats.latency]);

  // Main canvas rendering / CV frame loop
  useEffect(() => {
    const processFrame = async () => {
      if (isPaused) {
        animationFrameId.current = requestAnimationFrame(processFrame);
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const video = videoRef.current;
      
      let sourceElement: HTMLVideoElement | HTMLCanvasElement | null = null;
      let width = 640;
      let height = 480;

      if (currentFeedSource === 'simulation') {
        sourceElement = simCanvasRef.current;
      } else if (video && video.readyState >= 2) {
        sourceElement = video;
        width = video.videoWidth;
        height = video.videoHeight;
      }

      if (canvas && ctx && sourceElement) {
        // Adjust display canvas resolution
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        // Draw video frame or simulation output
        if (currentFeedSource === 'simulation') {
          cvEngine.updateAndDrawSimulation(simCanvasRef.current!, presenceStatus);
          ctx.drawImage(simCanvasRef.current!, 0, 0);
        } else {
          ctx.drawImage(sourceElement, 0, 0, width, height);
        }

        frameCount.current++;
        frameCounter.current++;

        // Run object detection model based on sampling skip rate
        if (frameCounter.current % settings.frameSamplingRate === 0) {
          const startTime = performance.now();
          
          try {
            const detections = await cvEngine.detect(
              sourceElement,
              settings.modelType as any,
              settings.confidenceThreshold,
              settings.nmsThreshold
            );

            const duration = Math.round(performance.now() - startTime);

            // Update tracker with detected boxes
            const tracks = trackerRef.current.update(detections);

            // Define crop function to save defect thumbnails
            const getCropBase64 = (bbox: [number, number, number, number]): string | undefined => {
              try {
                const [bx, by, bw, bh] = bbox;
                // Clamp coordinates to image boundaries
                const x = Math.max(0, bx);
                const y = Math.max(0, by);
                const w = Math.min(width - x, bw);
                const h = Math.min(height - y, bh);

                if (w <= 0 || h <= 0) return undefined;

                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = w;
                cropCanvas.height = h;
                const cropCtx = cropCanvas.getContext('2d');
                if (!cropCtx) return undefined;
                
                cropCtx.drawImage(sourceElement!, x, y, w, h, 0, 0, w, h);
                return cropCanvas.toDataURL('image/jpeg', 0.85);
              } catch (e) {
                return undefined;
              }
            };

            // Feed updated tracking coordinates into the Zustand store
            updateTracks(tracks, getCropBase64);
            updatePerformanceStats(stats.fps, duration);

          } catch (e) {
            console.error('CV Inference Frame Error:', e);
          }
        }

        // Render annotations overlay
        drawOverlay(ctx);
      }

      animationFrameId.current = requestAnimationFrame(processFrame);
    };

    animationFrameId.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [currentFeedSource, isPaused, settings, countingZones, isDrawing, currentDrawingPoints]);

  // Render counting gates, bounding boxes, motion history on top of video canvas
  const drawOverlay = (ctx: CanvasRenderingContext2D) => {
    // 1. Draw Counting Zones / Gates
    countingZones.forEach((zone) => {
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 3;
      ctx.fillStyle = `${zone.color}20`; // Transparent fill

      if (zone.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(zone.points[0].x, zone.points[0].y);
        ctx.lineTo(zone.points[1].x, zone.points[1].y);
        ctx.stroke();

        // Label name
        ctx.fillStyle = zone.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`Gate: ${zone.name}`, zone.points[0].x, zone.points[0].y - 8);
      } else {
        ctx.beginPath();
        ctx.moveTo(zone.points[0].x, zone.points[0].y);
        for (let i = 1; i < zone.points.length; i++) {
          ctx.lineTo(zone.points[i].x, zone.points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        ctx.fillStyle = zone.color;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`Zone: ${zone.name}`, zone.points[0].x, zone.points[0].y - 8);
      }
    });

    // 2. Draw Bounding Boxes + Trails
    activeTracks.forEach((track) => {
      const [x, y, w, h] = track.bbox;
      const isDefect = track.status === 'fail';

      // Pick outline color: Green=Pass, Red=Critical Defect, Orange=Major, Yellow=Minor
      let boxColor = '#10b981'; // Green
      if (isDefect) {
        boxColor = track.severity === 'critical' 
          ? '#ef4444' // Red
          : track.severity === 'major' 
          ? '#f97316' // Orange
          : '#eab308'; // Yellow
      }

      // Draw bounding box
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x, y, w, h);

      // Label background
      ctx.fillStyle = boxColor;
      ctx.font = 'bold 11px monospace';
      const label = `${track.id} [${isDefect ? (track.defectClass || 'defect').toUpperCase() : track.className.toUpperCase()}] ${(track.confidence * 100).toFixed(0)}%`;
      const textWidth = ctx.measureText(label).width;

      ctx.fillRect(x - 1.25, y - 18, textWidth + 10, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 4, y - 5);

      // Draw historical movement trail (breadcrumbs)
      if (track.history.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = `${boxColor}90`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(track.history[0].x, track.history[0].y);
        for (let i = 1; i < track.history.length; i++) {
          ctx.lineTo(track.history[i].x, track.history[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash

        // Draw dot at current center
        const lastPt = track.history[track.history.length - 1];
        ctx.fillStyle = boxColor;
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // 3. Draw active drawing path feedback
    if (isDrawing && currentDrawingPoints.length > 0) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.fillStyle = '#ef444430';

      ctx.beginPath();
      ctx.moveTo(currentDrawingPoints[0].x, currentDrawingPoints[0].y);
      for (let i = 1; i < currentDrawingPoints.length; i++) {
        ctx.lineTo(currentDrawingPoints[i].x, currentDrawingPoints[i].y);
      }
      ctx.stroke();

      // Draw markers for endpoints
      currentDrawingPoints.forEach((pt) => {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  };



  // Click handler to register coordinate nodes on canvas overlay
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    // Scale client coords to match canvas source resolution coords
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const point: Point = { x, y };

    if (drawingType === 'line') {
      if (currentDrawingPoints.length === 0) {
        addDrawingPoint(point);
      } else {
        // Complete the line
        addDrawingPoint(point);
        promptForZoneName();
      }
    } else if (drawingType === 'zone') {
      addDrawingPoint(point);
    }
  };

  const promptForZoneName = () => {
    setZoneName(`Gate ${countingZones.length + 1}`);
    setIsDrawingNameOpen(true);
  };

  const handleFinishDrawing = () => {
    finishDrawing(zoneName || `Gate ${countingZones.length + 1}`);
    setIsDrawingNameOpen(false);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      trackerRef.current.reset();
      setFeedSource('video', url);
    }
  };

  const triggerCaptureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `cv-snapshot-${Date.now()}.png`;
    link.href = url;
    link.click();
  };

  return (
    <div className="flex flex-col gap-3 w-full" ref={containerRef}>
      {/* Input Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl flex flex-wrap gap-3 items-center justify-between">
        
        {/* Input Source selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { id: 'simulation', label: 'Simulator', icon: <Tv className="h-3.5 w-3.5" />, action: () => setFeedSource('simulation') },
            { id: 'webcam', label: 'Webcam', icon: <Camera className="h-3.5 w-3.5" />, action: () => { trackerRef.current.reset(); setFeedSource('webcam'); } },
            { id: 'video', label: 'Video File', icon: <Upload className="h-3.5 w-3.5" />, action: () => fileInputRef.current?.click() },
          ].map(src => (
            <button
              key={src.id}
              onClick={src.action}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                currentFeedSource === src.id
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/5'
                  : 'bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              {src.icon}<span>{src.label}</span>
            </button>
          ))}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleVideoUpload}
            accept="video/*"
            className="hidden"
          />
        </div>

        {/* Webcam Selector Dropdown */}
        {currentFeedSource === 'webcam' && devices.length > 1 && (
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-[11px] rounded-xl px-3 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${devices.indexOf(device) + 1}`}
              </option>
            ))}
          </select>
        )}

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
              isPaused
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200'
            }`}
            title={isPaused ? 'Resume Inference' : 'Pause Inference'}
          >
            {isPaused ? <><Play className="h-3.5 w-3.5" /><span>Resume</span></> : <><Pause className="h-3.5 w-3.5" /><span>Pause</span></>}
          </button>
          
          <button
            onClick={triggerCaptureSnapshot}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:text-slate-200 hover:border-slate-600 transition-all"
          >
            <span>📸 Snapshot</span>
          </button>
        </div>
      </div>

      {/* Main Canvas & Drawing HUD Area */}
      <div className="relative bg-slate-950 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-slate-800 aspect-[4/3] flex items-center justify-center">
        {/* Hidden video element used to query frames */}
        {currentFeedSource !== 'simulation' && (
          <video
            ref={videoRef}
            src={currentFeedSource === 'video' ? feedUrl || undefined : undefined}
            loop
            muted
            playsInline
            className="hidden"
          />
        )}

        {/* Overlay Canvas containing video frame + BB annotations */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`max-w-full max-h-full h-full object-contain ${
            isDrawing ? 'cursor-crosshair border-2 border-red-500/50' : 'cursor-default'
          }`}
        />

        {/* Loading overlay for Vision model weights */}
        {settings.modelType !== 'simulation' && !cvEngine['cocoModel'] && settings.modelType === 'coco-ssd' && (
          <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-3">
            <CameraOff className="h-10 w-10 text-slate-500 animate-bounce" />
            <p className="text-sm font-bold tracking-wide text-slate-300">Loading Object Detection Engine...</p>
          </div>
        )}

        {/* Scan line overlay for cinematic effect */}
        <div className="scan-overlay" />

        {/* HUD for Zone Gate Drawing Tool */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none z-10">
          <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-700/60 flex items-center gap-2">
            <span className="text-[9px] uppercase font-black tracking-widest text-slate-500">Gates</span>
            
            <button
              onClick={() => startDrawing('line')}
              disabled={isDrawing}
              className={`p-1.5 rounded-lg text-xs font-bold transition ${
                isDrawing && drawingType === 'line' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
              title="Draw Line Gate"
            >
              <PenTool className="h-3 w-3" />
            </button>

            <button
              onClick={() => startDrawing('zone')}
              disabled={isDrawing}
              className={`p-1.5 rounded-lg text-xs font-bold transition ${
                isDrawing && drawingType === 'zone' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
              title="Draw Polygon Zone"
            >
              <CheckSquare className="h-3 w-3" />
            </button>

            {isDrawing && (
              <>
                {drawingType === 'zone' && currentDrawingPoints.length >= 3 && (
                  <button
                    onClick={promptForZoneName}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black px-2 py-1 rounded-lg"
                  >
                    Finish
                  </button>
                )}
                <button
                  onClick={cancelDrawing}
                  className="bg-red-500 hover:bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-lg"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Real-time Diagnostics HUD Overlay — top right */}
        <div className="absolute top-3 right-3 pointer-events-none bg-slate-900/90 backdrop-blur-md px-3 py-2.5 rounded-xl border border-slate-700/60 text-[10px] font-mono text-slate-300 flex flex-col gap-1.5 select-none z-10">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">LIVE FEED</span>
          </div>
          <div className="flex justify-between gap-5">
            <span className="text-slate-600">Source</span>
            <span className="text-emerald-400 uppercase font-bold">{currentFeedSource}</span>
          </div>
          <div className="flex justify-between gap-5">
            <span className="text-slate-600">Model</span>
            <span className="text-sky-400 uppercase font-bold">{settings.modelType}</span>
          </div>
          <div className="flex justify-between gap-5">
            <span className="text-slate-600">FPS</span>
            <span className="font-bold text-white">{stats.fps}</span>
          </div>
          <div className="flex justify-between gap-5">
            <span className="text-slate-600">Latency</span>
            <span className={`font-bold ${stats.latency > 100 ? 'text-red-400' : stats.latency > 50 ? 'text-amber-400' : 'text-white'}`}>{stats.latency}ms</span>
          </div>
          <div className="flex justify-between gap-5">
            <span className="text-slate-600">Tracks</span>
            <span className="font-bold text-white">{activeTracks.length}</span>
          </div>
        </div>

        {/* Bottom center live count badge */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700/60 flex items-center gap-3 pointer-events-none z-10">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Tracks</span>
          <span className="text-lg font-black text-white font-mono">{activeTracks.length}</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Defects</span>
          <span className="text-lg font-black font-mono text-red-400">{activeTracks.filter(t => t.status === 'fail').length}</span>
        </div>
      </div>

      {/* Drawing Gate Name Dialog */}
      {isDrawingNameOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl shadow-black/60 max-w-sm w-full animate-slide-in">
            <h3 className="text-base font-black text-white mb-1">💾 Save Counting Gate</h3>
            <p className="text-xs text-slate-500 mb-5">Assign a descriptive label for this virtual gate scanner.</p>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="e.g. Conveyor Output Line"
              autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white mb-5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { cancelDrawing(); setIsDrawingNameOpen(false); }}
                className="px-4 py-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-400"
              >
                Discard
              </button>
              <button
                onClick={handleFinishDrawing}
                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 transition-all"
              >
                Save Gate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
