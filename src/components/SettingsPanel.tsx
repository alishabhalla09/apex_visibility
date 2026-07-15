import React, { useRef, useState } from 'react';
import { useDashboardStore } from '../context/DashboardStore';
import { cvEngine } from '../services/cvEngine';
import {
  Sliders, AlertCircle, Trash2, RotateCcw,
  Upload, FileCode, Cpu, Crosshair, Layers,
  CheckCircle2, Volume2, VolumeX
} from 'lucide-react';

export const SettingsPanel: React.FC = () => {
  const {
    settings,
    updateSettings,
    resetSessionCounters,
    setModelLoading,
    isModelLoading,
    modelLoadProgress,
    countingZones,
    clearCountingZones
  } = useDashboardStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [classNamesInput, setClassNamesInput] = useState('defect, scratch, dent, crack, missing_part');
  const [modelFileName, setModelFileName] = useState<string | null>(null);
  const [onnxError, setOnnxError] = useState<string | null>(null);
  const [onnxSuccess, setOnnxSuccess] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as 'coco-ssd' | 'face-api' | 'custom-onnx' | 'simulation';
    if (type === 'coco-ssd') {
      setModelLoading(true, 10);
      try {
        await cvEngine.loadCocoSSD((p) => setModelLoading(true, p));
        updateSettings({ modelType: 'coco-ssd' });
      } catch {
        alert('Failed to load COCO-SSD model. Check network connectivity.');
      } finally {
        setModelLoading(false);
      }
    } else {
      updateSettings({ modelType: type });
    }
  };

  const handleONNXUpload = async (file: File) => {
    setModelFileName(file.name);
    setOnnxError(null);
    setOnnxSuccess(false);
    setModelLoading(true, 10);
    const classes = classNamesInput.split(',').map(c => c.trim()).filter(Boolean);
    try {
      await cvEngine.loadCustomONNX(file, classes, (p) => setModelLoading(true, p));
      updateSettings({ modelType: 'custom-onnx' });
      setOnnxSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error parsing ONNX file.';
      setOnnxError(msg);
      setModelFileName(null);
    } finally {
      setModelLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleONNXUpload(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.name.endsWith('.onnx')) handleONNXUpload(f);
    else setOnnxError('Please drop a valid .onnx file.');
  };

  const handleReset = () => {
    if (window.confirm('Reset all running counts and clear event logs?')) {
      resetSessionCounters();
    }
  };

  const SliderRow = ({
    label, value, min, max, step, onChange, display, color = 'blue'
  }: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void; display: string; color?: string;
  }) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
        <span className={`text-xs font-black font-mono ${
          color === 'red' ? 'text-red-400' : color === 'emerald' ? 'text-emerald-400' : 'text-blue-400'
        }`}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-800"
        style={{ accentColor: color === 'red' ? '#ef4444' : color === 'emerald' ? '#10b981' : '#3b82f6' }}
      />
    </div>
  );

  const models = [
    { value: 'simulation', label: 'Production Line Simulator', icon: '🏭', desc: 'Demo mode — no camera needed' },
    { value: 'coco-ssd',   label: 'COCO-SSD Object Detector', icon: '📦', desc: '80-class general detection (TFJS)' },
    { value: 'custom-onnx', label: 'Custom YOLOv8 ONNX Model', icon: '🛠️', desc: 'Upload your own .onnx file' },
  ];

  const countModes = [
    { value: 'all',  label: 'Count All IDs',      icon: <Layers className="h-3.5 w-3.5" />,    desc: 'Count every new unique track ID' },
    { value: 'line', label: 'Line Crossing',      icon: <Crosshair className="h-3.5 w-3.5" />, desc: 'Count only on gate line cross' },
    { value: 'zone', label: 'Zone Entry',          icon: <Cpu className="h-3.5 w-3.5" />,       desc: 'Count on polygon zone entry' },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-800">
        <div className="p-1.5 bg-blue-500/10 rounded-lg">
          <Sliders className="h-4 w-4 text-blue-400" />
        </div>
        <div>
          <h2 className="text-sm font-black text-white">Vision Settings</h2>
          <p className="text-[10px] text-slate-500">Model, thresholds & counting logic</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* ── Model Selection ── */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vision Engine</span>
          <div className="flex flex-col gap-1.5">
            {models.map(m => (
              <button
                key={m.value}
                onClick={() => {
                  const e = { target: { value: m.value } } as React.ChangeEvent<HTMLSelectElement>;
                  handleModelChange(e);
                }}
                disabled={isModelLoading}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border text-left transition-all ${
                  settings.modelType === m.value
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <span className="text-base leading-none">{m.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{m.label}</p>
                  <p className="text-[9px] text-slate-500 truncate">{m.desc}</p>
                </div>
                {settings.modelType === m.value && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                )}
              </button>
            ))}
          </div>

          {/* Model loading progress */}
          {isModelLoading && (
            <div className="mt-1">
              <div className="flex justify-between text-[10px] text-blue-400 font-bold mb-1">
                <span className="animate-pulse">⚡ Loading model weights...</span>
                <span>{modelLoadProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                <div className="bg-blue-500 h-1 transition-all duration-300 rounded-full"
                  style={{ width: `${modelLoadProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Custom ONNX Uploader ── */}
        {settings.modelType === 'custom-onnx' && (
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upload ONNX Model</span>

            <div
              className={`drop-zone p-4 rounded-xl flex flex-col gap-2 ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="flex items-center gap-2 text-slate-400">
                <FileCode className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-bold text-slate-300">
                  {modelFileName ? `✓ ${modelFileName.slice(0, 22)}...` : 'Drop .onnx file or click Upload'}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-500 uppercase tracking-wider">Class names (comma separated)</label>
                <input
                  type="text"
                  value={classNamesInput}
                  onChange={e => setClassNamesInput(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="defect, scratch, crack..."
                />
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isModelLoading}
                className="flex items-center justify-center gap-2 w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-2 text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{modelFileName ? 'Replace Model File' : 'Choose .onnx File'}</span>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".onnx" className="hidden" />

              {onnxSuccess && (
                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>ONNX session active! Ready for inference.</span>
                </div>
              )}
              {onnxError && (
                <div className="flex items-start gap-1.5 text-red-400 text-[10px]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{onnxError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Threshold Sliders ── */}
        <div className="flex flex-col gap-3.5 border-t border-slate-800 pt-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Detection Thresholds</span>
          <SliderRow
            label="Confidence" value={settings.confidenceThreshold} min={0.1} max={0.95} step={0.05}
            display={`${Math.round(settings.confidenceThreshold * 100)}%`}
            onChange={v => updateSettings({ confidenceThreshold: v })}
          />
          <SliderRow
            label="NMS Overlap" value={settings.nmsThreshold} min={0.1} max={0.9} step={0.05}
            display={`${Math.round(settings.nmsThreshold * 100)}%`}
            onChange={v => updateSettings({ nmsThreshold: v })}
          />
          <SliderRow
            label="Defect Rate Alert" value={settings.defectRateAlertThreshold} min={1} max={25} step={1}
            display={`${settings.defectRateAlertThreshold}%`}
            onChange={v => updateSettings({ defectRateAlertThreshold: v })}
            color="red"
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Frame Skip Rate</span>
              <span className="text-xs font-black font-mono text-emerald-400">
                {settings.frameSamplingRate === 1 ? 'Every frame' : `1 / ${settings.frameSamplingRate}`}
              </span>
            </div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 5].map(n => (
                <button key={n}
                  onClick={() => updateSettings({ frameSamplingRate: n })}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black border transition-all ${
                    settings.frameSamplingRate === n
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {n}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Counting Mode ── */}
        <div className="flex flex-col gap-2 border-t border-slate-800 pt-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Counting Rule</span>
          <div className="flex flex-col gap-1.5">
            {countModes.map(m => (
              <button key={m.value}
                onClick={() => updateSettings({ countingMode: m.value as 'all' | 'line' | 'zone' })}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border text-left transition-all ${
                  settings.countingMode === m.value
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <span className={settings.countingMode === m.value ? 'text-emerald-400' : 'text-slate-500'}>
                  {m.icon}
                </span>
                <div className="flex-1">
                  <p className="text-xs font-bold">{m.label}</p>
                  <p className="text-[9px] text-slate-500">{m.desc}</p>
                </div>
                {settings.countingMode === m.value && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Bottom Actions ── */}
        <div className="flex flex-col gap-2 border-t border-slate-800 pt-4">
          {/* Audio toggle */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              {settings.audioAlertEnabled
                ? <Volume2 className="h-4 w-4 text-blue-400" />
                : <VolumeX className="h-4 w-4 text-slate-500" />
              }
              <span className="text-xs font-bold text-slate-400">Audio Alerts</span>
            </div>
            <button
              onClick={() => updateSettings({ audioAlertEnabled: !settings.audioAlertEnabled })}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                settings.audioAlertEnabled ? 'bg-blue-500' : 'bg-slate-700'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${
                settings.audioAlertEnabled ? 'left-5' : 'left-0.5'
              }`} />
            </button>
          </div>

          {countingZones.length > 0 && (
            <button onClick={clearCountingZones}
              className="flex items-center justify-center gap-2 border border-slate-700 hover:border-red-800/60 hover:bg-red-950/20 rounded-xl py-2 text-xs font-bold text-red-400 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All Gates ({countingZones.length})</span>
            </button>
          )}

          <button onClick={handleReset}
            className="flex items-center justify-center gap-2 border border-red-900/40 hover:bg-red-950/30 rounded-xl py-2 text-xs font-bold text-red-400 transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Session Counters</span>
          </button>
        </div>
      </div>
    </div>
  );
};
