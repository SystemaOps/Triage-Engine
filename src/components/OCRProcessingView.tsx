import React, { useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, OcrProcessResponse, TriageResult } from '../types';
import { Upload, FileText, Activity, CheckCircle, AlertCircle, Loader2, Save, X, BrainCircuit, Search, AlertTriangle, ArrowRight } from 'lucide-react';

interface OCRProcessingViewProps {
  userRole: Role;
}

function flattenData(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value).forEach(([subKey, subValue]) => {
        result[subKey] = subValue;
      });
    } else {
      result[key] = value;
    }
  });
  return result;
}

export default function OCRProcessingView({ userRole }: OCRProcessingViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [result, setResult] = useState<OcrProcessResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveWithTriageStatus, setSaveWithTriageStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ── Triage Analysis State ──
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [triagePhase, setTriagePhase] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [triageError, setTriageError] = useState<string | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/tiff'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setErrorMessage('Unsupported file type. Please upload a PNG, JPEG, WebP, or TIFF image.');
      return;
    }

    // Validate file size (10MB max)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMessage('File too large. Maximum size is 10 MB.');
      return;
    }

    setFile(selectedFile);
    setErrorMessage(null);
    setResult(null);
    setPhase('idle');
    setSaveStatus('idle');

    // Generate preview
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleProcess = async () => {
    if (!file) return;

    // Reset triage state when re-processing a new image
    setTriageResult(null);
    setTriagePhase('idle');
    setTriageError(null);
    setChiefComplaint('');
    setSaveWithTriageStatus('idle');

    setPhase('processing');
    setErrorMessage(null);

    try {
      const ocrResult = await api.ocr.process(file, file.name);
      setResult(ocrResult);
      setPhase('complete');
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : 'OCR processing failed');
    }
  };

  const handleSaveReport = async () => {
    if (!result || !patientId.trim()) return;

    setSaveStatus('saving');
    try {
      // Build raw text from extracted data
      const flat = flattenData(result.data);
      const rawText = Object.entries(flat)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      await api.ocr.saveReport({
        patientId: patientId.trim(),
        patientName: patientName.trim() || 'Unknown Patient',
        extractedData: flat,
        rawText,
        confidence: 0.85,
      });
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to save OCR report:', err);
    }
  };

  // ── Triage Analysis Pipeline ──

  const handleRunTriage = async () => {
    if (!result) return;

    // Build a lab values summary from the extracted data
    const flat = flattenData(result.data);
    const labSummary = Object.entries(flat)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
      .join(', ');

    const fullOcrText = Object.entries(flat)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
      .join('\n');

    setTriagePhase('running');
    setTriageError(null);

    try {
      // Send the lab values as patient_case + any user-entered chief complaint
      const symptomsText = chiefComplaint.trim() || labSummary.substring(0, 500) || 'Lab report analysis requested';
      const triage = await api.llm.triage({
        symptoms: symptomsText,
        patient_case: `Blood Report Lab Values:\n${fullOcrText}`.substring(0, 2000),
        chief_complaint: chiefComplaint.trim() || undefined,
      });
      setTriageResult(triage);
      setTriagePhase('complete');
    } catch (err) {
      setTriagePhase('error');
      setTriageError(err instanceof Error ? err.message : 'Triage analysis failed');
    }
  };

  const handleSaveWithTriage = async () => {
    if (!result || !triageResult || !patientId.trim()) return;

    setSaveWithTriageStatus('saving');
    try {
      const flat = flattenData(result.data);
      const rawText = Object.entries(flat)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      await api.ocr.saveReportWithTriage({
        patientId: patientId.trim(),
        patientName: patientName.trim() || 'Unknown Patient',
        extractedData: flat,
        rawText,
        confidence: 0.85,
        triageResult,
      });
      setSaveWithTriageStatus('saved');
    } catch (err) {
      setSaveWithTriageStatus('error');
      console.error('Failed to save OCR report with triage:', err);
    }
  };

  const resetAll = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setPhase('idle');
    setResult(null);
    setErrorMessage(null);
    setPatientId('');
    setPatientName('');
    setSaveStatus('idle');
    setSaveWithTriageStatus('idle');
    setTriageResult(null);
    setTriagePhase('idle');
    setTriageError(null);
    setChiefComplaint('');
  };

  // ── Phase: Idle (no file selected) ──
  if (!file) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="border-b border-slate-200 pb-5 mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">OCR Blood Report Processor</h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload a blood report image to extract glucose, WBC, hemoglobin, and other lab values via the unified triage API.
          </p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-white hover:border-indigo-400 transition-all cursor-pointer p-16 text-center group"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-100 transition-all">
              <Upload size={32} />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-700">
                Drop your blood report image here
              </p>
              <p className="text-sm text-slate-500 mt-1">
                or click to browse files
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">PNG</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">JPEG</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">WebP</span>
              <span className="text-slate-300">|</span>
              <span>Max 10 MB</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/tiff"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
        </div>

        {errorMessage && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <AlertCircle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-rose-700">Upload Error</p>
              <p className="text-xs text-rose-600 mt-1">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── File selected — show preview + process button ──
  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="border-b border-slate-200 pb-5 mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">OCR Blood Report Processor</h2>
          <p className="text-sm text-slate-500 mt-1">Review the uploaded image and process it for OCR extraction.</p>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
        >
          <X size={14} />
          New Upload
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left: Image Preview ── */}
        <div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <FileText size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-700">{file.name}</span>
              <span className="text-[10px] text-slate-400 font-mono ml-auto">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <div className="bg-slate-50 flex items-center justify-center p-4">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Blood report preview"
                  className="max-w-full max-h-[400px] object-contain rounded-lg shadow-sm"
                />
              )}
            </div>
          </div>

          {/* Process Button */}
          <button
            onClick={handleProcess}
            disabled={phase === 'processing' || phase === 'uploading'}
            className="w-full mt-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {phase === 'processing' ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Processing with ML OCR...
              </>
            ) : phase === 'complete' ? (
              <>
                <CheckCircle size={18} />
                Re-process Image
              </>
            ) : (
              <>
                <BrainCircuit size={18} />
                Process with OCR
              </>
            )}
          </button>
        </div>

        {/* ── Right: Results Panel ── */}
        <div className="space-y-4">
          {/* Processing Status */}
          {phase === 'processing' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-8 text-center">
              <Loader2 size={40} className="animate-spin text-indigo-500 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-indigo-700">Processing Image</h3>
              <p className="text-sm text-indigo-500 mt-1">
                Processing image through unified triage API pipeline...
              </p>
            </div>
          )}

          {/* Error State */}
          {phase === 'error' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle size={24} className="text-rose-500 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-700">Processing Failed</h3>
                  <p className="text-xs text-rose-600 mt-1">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {phase === 'complete' && result && (
            <>
              {/* Extracted Values */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Activity size={16} className="text-emerald-500" />
                  <span className="text-sm font-bold text-slate-800">Extracted Lab Values</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-auto">
                    {new Date(result.processedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="p-5">
                  {Object.keys(result.data).length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <p className="text-sm font-medium">No values extracted</p>
                      <p className="text-xs mt-1">The OCR service returned empty results. Try a clearer image.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(flattenData(result.data)).map(([key, value]) => (
                        <div
                          key={key}
                          className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 hover:border-slate-200 transition-all"
                        >
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            {key.replace(/_/g, ' ')}
                          </div>
                          <div className="text-lg font-bold text-slate-800 font-mono mt-1">
                            {String(value ?? '—')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Raw Response */}
              <details className="bg-slate-50 border border-slate-200 rounded-xl">
                <summary className="px-5 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none flex items-center gap-2">
                  <Search size={14} />
                  Raw API Response
                </summary>
                <div className="px-5 pb-4">
                  <pre className="bg-slate-900 text-green-400 text-[10px] font-mono p-4 rounded-xl overflow-x-auto max-h-48">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              </details>

              {/* ════════════════════════════════════════════ */}
              {/* ── LLM TRIAGE ANALYSIS PIPELINE ── */}
              {/* ════════════════════════════════════════════ */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-indigo-100 flex items-center gap-2">
                  <BrainCircuit size={16} className="text-indigo-600" />
                  <span className="text-sm font-bold text-indigo-800">LLM Triage Analysis</span>
                  <span className="text-[10px] text-indigo-400 font-mono ml-auto">
                    {triageResult && `Latency: ${triageResult.latency_ms}ms`}
                  </span>
                </div>

                {/* Chief complaint input + Run button */}
                {triagePhase === 'idle' && (
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Chief Complaint (Optional)
                      </label>
                      <textarea
                        value={chiefComplaint}
                        onChange={(e) => setChiefComplaint(e.target.value)}
                        placeholder="e.g., fatigue, chest pain, shortness of breath"
                        rows={2}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700 placeholder:text-slate-400 resize-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        The extracted lab values will be sent for triage analysis. Add a chief complaint to provide clinical context.
                      </p>
                    </div>
                    <button
                      onClick={handleRunTriage}
                      className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                    >
                      <BrainCircuit size={16} />
                      Analyze Lab Values with LLM
                    </button>
                  </div>
                )}

                {/* Processing */}
                {triagePhase === 'running' && (
                  <div className="p-8 text-center">
                    <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-indigo-700">Analyzing Lab Values with LLM</h3>
                    <p className="text-xs text-indigo-500 mt-1">Running triage on extracted lab data...</p>
                  </div>
                )}

                {/* Triage Error */}
                {triagePhase === 'error' && (
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-rose-700">Triage Analysis Failed</p>
                        <p className="text-xs text-rose-600 mt-1">{triageError}</p>
                        <button
                          onClick={() => setTriagePhase('idle')}
                          className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Triage Results */}
                {triagePhase === 'complete' && triageResult && (
                  <div className="p-5 space-y-4">
                    {/* Urgency Badge */}
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                        triageResult.urgency_level === 'Emergency'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : triageResult.urgency_level === 'Urgent'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : triageResult.urgency_level === 'Doctor'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        <Activity size={14} />
                        {triageResult.urgency_level}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Session: {triageResult.session_id.substring(0, 12)}...
                      </span>
                    </div>

                    {/* Reasoning */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Reasoning</h4>
                      <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                        {triageResult.reasoning}
                      </div>
                    </div>

                    {/* Next Steps */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Next Steps</h4>
                      <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                        {triageResult.next_steps}
                      </div>
                    </div>

                    {/* Red Flags */}
                    {triageResult.red_flags.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-500 mb-1.5 flex items-center gap-1.5">
                          <AlertTriangle size={12} />
                          Red Flags
                        </h4>
                        <div className="space-y-1">
                          {triageResult.red_flags.map((flag, i) => (
                            <div key={i} className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                              <span className="text-rose-500 text-xs mt-0.5">•</span>
                              <span className="text-xs text-rose-700">{flag}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Disclaimer */}
                    <p className="text-[10px] text-slate-400 italic leading-relaxed">
                      {triageResult.disclaimer}
                    </p>

                    {/* Re-run button */}
                    <button
                      onClick={() => setTriagePhase('idle')}
                      className="w-full py-2 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-all"
                    >
                      Re-run with different chief complaint
                    </button>
                  </div>
                )}
              </div>

              {/* ── Save as Report Section ── */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Save size={16} className="text-indigo-500" />
                  Save to Firestore
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Patient ID *</label>
                    <input
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      placeholder="e.g., patient-123"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Patient Name</label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="Optional"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                {/* Save Report Only */}
                <button
                  onClick={handleSaveReport}
                  disabled={saveStatus === 'saving' || saveStatus === 'saved' || !patientId.trim()}
                  className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    saveStatus === 'saved'
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <><Loader2 size={16} className="animate-spin" /> Saving...</>
                  ) : saveStatus === 'saved' ? (
                    <><CheckCircle size={16} /> Report Saved</>
                  ) : (
                    <><Save size={16} /> Save as OCR Report</>
                  )}
                </button>

                {saveStatus === 'error' && (
                  <p className="text-xs text-rose-600">Failed to save report.</p>
                )}

                {/* Save with Triage (only visible after triage is complete) */}
                {triagePhase === 'complete' && triageResult && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-dashed border-slate-200" />
                      </div>
                      <div className="relative flex justify-center">
                        <span className="bg-white px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Or save with triage
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleSaveWithTriage}
                      disabled={saveWithTriageStatus === 'saving' || saveWithTriageStatus === 'saved' || !patientId.trim()}
                      className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                        saveWithTriageStatus === 'saved'
                          ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/20'
                      }`}
                    >
                      {saveWithTriageStatus === 'saving' ? (
                        <><Loader2 size={16} className="animate-spin" /> Saving...</>
                      ) : saveWithTriageStatus === 'saved' ? (
                        <><CheckCircle size={16} /> Saved with Triage Analysis</>
                      ) : (
                        <><ArrowRight size={16} /> Save Report + Triage Analysis</>
                      )}
                    </button>

                    {saveWithTriageStatus === 'error' && (
                      <p className="text-xs text-rose-600">Failed to save report with triage.</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
