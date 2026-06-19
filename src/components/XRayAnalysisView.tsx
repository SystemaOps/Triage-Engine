import React, { useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, XRayClassifyResponse, TriageResult } from '../types';
import { Upload, FileText, Activity, CheckCircle, AlertCircle, Loader2, X, Search, Bone, BrainCircuit, Save, AlertTriangle, ArrowRight } from 'lucide-react';

interface XRayAnalysisViewProps {
  userRole: Role;
}

type Phase = 'idle' | 'processing' | 'complete' | 'error';

const TARGETS = [
  { id: 'chest', label: 'Chest X-Ray', desc: 'Diagnostic chest radiograph' },
  { id: 'bone', label: 'Bone X-Ray', desc: 'Musculoskeletal radiograph' },
  { id: 'dental', label: 'Dental X-Ray', desc: 'Dental/panoramic radiograph' },
  { id: 'spine', label: 'Spine X-Ray', desc: 'Spinal radiograph' },
];

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

export default function XRayAnalysisView({ userRole }: XRayAnalysisViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<XRayClassifyResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [target, setTarget] = useState('chest');
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

  const handleFileSelect = useCallback((f: File) => {
    if (!['image/png','image/jpeg','image/jpg','image/webp','image/tiff'].includes(f.type)) {
      setErrorMessage('Unsupported file type.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) { setErrorMessage('File too large (max 10 MB).'); return; }
    setFile(f);
    setErrorMessage(null);
    setResult(null);
    setPhase('idle');
    setPreviewUrl(URL.createObjectURL(f));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  }, [handleFileSelect]);

  const handleProcess = async () => {
    if (!file) return;
    // Reset triage state when re-processing
    setTriageResult(null);
    setTriagePhase('idle');
    setTriageError(null);
    setChiefComplaint('');
    setSaveWithTriageStatus('idle');
    setPhase('processing');
    setErrorMessage(null);
    try {
      const r = await api.xray.classify(file, file.name, target);
      setResult(r);
      setPhase('complete');
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : 'Classification failed');
    }
  };

  const handleSaveReport = async () => {
    if (!result || !patientId.trim()) return;
    setSaveStatus('saving');
    try {
      const flat = flattenData(result.data);
      const rawData = Object.entries(flat)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      await api.xray.saveReport({
        patientId: patientId.trim(),
        patientName: patientName.trim() || 'Unknown Patient',
        target,
        rawData,
        confidence: 0.88,
      });
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to save X-Ray report:', err);
    }
  };

  // ── Triage Analysis Pipeline ──

  const handleRunTriage = async () => {
    if (!result) return;
    const flat = flattenData(result.data);
    const findings = Object.entries(flat)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
      .join(', ');
    const fullText = Object.entries(flat)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
      .join('\n');

    setTriagePhase('running');
    setTriageError(null);
    try {
      const symptomsText = chiefComplaint.trim() || findings.substring(0, 500) || 'X-ray imaging analysis requested';
      const triage = await api.llm.triage({
        symptoms: symptomsText,
        patient_case: `X-Ray Classification (${TARGETS.find(t => t.id === target)?.label}):\n${fullText}`.substring(0, 2000),
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
      const rawData = Object.entries(flat)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      await api.xray.saveReportWithTriage({
        patientId: patientId.trim(),
        patientName: patientName.trim() || 'Unknown Patient',
        target,
        rawData,
        confidence: 0.88,
        triageResult,
      });
      setSaveWithTriageStatus('saved');
    } catch (err) {
      setSaveWithTriageStatus('error');
      console.error('Failed to save X-Ray report with triage:', err);
    }
  };

  const resetAll = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null); setPhase('idle'); setResult(null); setErrorMessage(null);
    setPatientId(''); setPatientName(''); setSaveStatus('idle'); setSaveWithTriageStatus('idle');
    setTriageResult(null); setTriagePhase('idle'); setTriageError(null); setChiefComplaint('');
  };

  if (!file) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="border-b border-slate-200 pb-5 mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">X-Ray Classification</h2>
          <p className="text-sm text-slate-500 mt-1">Upload a radiograph to classify medical conditions.</p>
        </div>

        <div className="mb-6">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Imaging Target</label>
          <div className="grid grid-cols-4 gap-3">
            {TARGETS.map(t => (
              <button key={t.id} onClick={() => setTarget(t.id)}
                className={`px-4 py-3 rounded-xl text-left border transition-all ${
                  target === t.id ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>
                <Bone size={18} className="mb-1" />
                <div className="text-sm font-bold">{t.label}</div>
                <div className="text-[10px] text-slate-400">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-white hover:border-indigo-400 transition-all cursor-pointer p-16 text-center group">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-100 transition-all">
              <Upload size={32} />
            </div>
            <p className="text-base font-semibold text-slate-700">Drop radiograph image here<br /><span className="text-sm font-normal text-slate-500">or click to browse</span></p>
            <div className="flex gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">PNG</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">JPEG</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">DICOM</span>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} className="hidden" />
        </div>
        {errorMessage && <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{errorMessage}</div>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="border-b border-slate-200 pb-5 mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">X-Ray Classification</h2>
          <p className="text-sm text-slate-500 mt-1">{TARGETS.find(t => t.id === target)?.label}</p>
        </div>
        <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"><X size={14} /> New Upload</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <FileText size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-700">{file.name}</span>
              <span className="text-[10px] text-slate-400 font-mono ml-auto">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
            <div className="bg-slate-50 flex items-center justify-center p-4">
              {previewUrl && <img src={previewUrl} alt="X-ray preview" className="max-w-full max-h-[400px] object-contain rounded-lg shadow-sm" />}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
            <Activity size={14} /> Target: {TARGETS.find(t => t.id === target)?.label}
          </div>
          <button onClick={handleProcess} disabled={phase === 'processing'}
            className="w-full mt-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
            {phase === 'processing' ? <><Loader2 size={18} className="animate-spin" /> Classifying...</> : <><BrainCircuit size={18} /> Classify X-Ray</>}
          </button>
        </div>

        <div className="space-y-4">
          {phase === 'processing' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-8 text-center">
              <Loader2 size={40} className="animate-spin text-indigo-500 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-indigo-700">Analyzing Radiograph</h3>
              <p className="text-sm text-indigo-500 mt-1">Classifying via unified triage API pipeline...</p>
            </div>
          )}
          {phase === 'error' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-3">
              <AlertCircle size={24} className="text-rose-500 flex-shrink-0" />
              <div><h3 className="text-sm font-semibold text-rose-700">Classification Failed</h3><p className="text-xs text-rose-600 mt-1">{errorMessage}</p></div>
            </div>
          )}
          {phase === 'complete' && result && (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Activity size={16} className="text-emerald-500" />
                  <span className="text-sm font-bold text-slate-800">Classification Results</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-auto">{result.target}</span>
                </div>
                <div className="p-5">
                  {Object.keys(result.data).length === 0 ? (
                    <div className="text-center py-6 text-slate-400"><p className="text-sm font-medium">No findings returned</p></div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(flattenData(result.data)).map(([key, value]) => (
                        <div key={key} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</div>
                          <div className="text-base font-bold text-slate-800 font-mono mt-1">{String(value ?? '—')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

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

                {triagePhase === 'idle' && (
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Chief Complaint (Optional)</label>
                      <textarea
                        value={chiefComplaint}
                        onChange={(e) => setChiefComplaint(e.target.value)}
                        placeholder="e.g., persistent cough, chest pain, shortness of breath"
                        rows={2}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700 placeholder:text-slate-400 resize-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1.5">The classification findings will be sent for triage analysis. Add a chief complaint to provide clinical context.</p>
                    </div>
                    <button onClick={handleRunTriage}
                      className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
                      <BrainCircuit size={16} /> Analyze Findings with LLM
                    </button>
                  </div>
                )}

                {triagePhase === 'running' && (
                  <div className="p-8 text-center">
                    <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-indigo-700">Analyzing with LLM</h3>
                    <p className="text-xs text-indigo-500 mt-1">Running triage on X-ray classification findings...</p>
                  </div>
                )}

                {triagePhase === 'error' && (
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-rose-700">Triage Analysis Failed</p>
                        <p className="text-xs text-rose-600 mt-1">{triageError}</p>
                        <button onClick={() => setTriagePhase('idle')} className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">Try again</button>
                      </div>
                    </div>
                  </div>
                )}

                {triagePhase === 'complete' && triageResult && (
                  <div className="p-5 space-y-4">
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
                      <span className="text-xs text-slate-400 font-mono">Session: {triageResult.session_id.substring(0, 12)}...</span>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Reasoning</h4>
                      <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">{triageResult.reasoning}</div>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Next Steps</h4>
                      <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">{triageResult.next_steps}</div>
                    </div>
                    {triageResult.red_flags.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-500 mb-1.5 flex items-center gap-1.5"><AlertTriangle size={12} /> Red Flags</h4>
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
                    <p className="text-[10px] text-slate-400 italic leading-relaxed">{triageResult.disclaimer}</p>
                    <button onClick={() => setTriagePhase('idle')}
                      className="w-full py-2 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-all">
                      Re-run with different chief complaint
                    </button>
                  </div>
                )}
              </div>

              <details className="bg-slate-50 border border-slate-200 rounded-xl">
                <summary className="px-5 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 flex items-center gap-2"><Search size={14} />Raw API Response</summary>
                <div className="px-5 pb-4"><pre className="bg-slate-900 text-green-400 text-[10px] font-mono p-4 rounded-xl overflow-x-auto max-h-48">{JSON.stringify(result.data, null, 2)}</pre></div>
              </details>

              {/* ── Save Section ── */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Save size={16} className="text-indigo-500" /> Save to Firestore</h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Patient ID *</label>
                    <input type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)}
                      placeholder="e.g., patient-123"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700 placeholder:text-slate-400" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Patient Name</label>
                    <input type="text" value={patientName} onChange={(e) => setPatientName(e.target.value)}
                      placeholder="Optional"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700 placeholder:text-slate-400" />
                  </div>
                </div>

                <button onClick={handleSaveReport} disabled={saveStatus === 'saving' || saveStatus === 'saved' || !patientId.trim()}
                  className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                    saveStatus === 'saved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50'
                  }`}>
                  {saveStatus === 'saving' ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : saveStatus === 'saved' ? <><CheckCircle size={16} /> Report Saved</> : <><Save size={16} /> Save as Radiology Report</>}
                </button>

                {saveStatus === 'error' && <p className="text-xs text-rose-600">Failed to save report.</p>}

                {triagePhase === 'complete' && triageResult && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-dashed border-slate-200" /></div>
                      <div className="relative flex justify-center"><span className="bg-white px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Or save with triage</span></div>
                    </div>
                    <button onClick={handleSaveWithTriage} disabled={saveWithTriageStatus === 'saving' || saveWithTriageStatus === 'saved' || !patientId.trim()}
                      className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
                        saveWithTriageStatus === 'saved' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/20'
                      }`}>
                      {saveWithTriageStatus === 'saving' ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : saveWithTriageStatus === 'saved' ? <><CheckCircle size={16} /> Saved with Triage Analysis</> : <><ArrowRight size={16} /> Save Report + Triage Analysis</>}
                    </button>
                    {saveWithTriageStatus === 'error' && <p className="text-xs text-rose-600">Failed to save with triage.</p>}
                  </>
                )}
              </div>
            </>
          )}
          {phase === 'idle' && !file && (
            <div className="flex flex-col items-center justify-center h-full border border-dashed border-slate-200 rounded-2xl bg-slate-50 p-8 text-center">
              <Bone size={48} className="text-slate-300 mb-4" />
              <p className="text-sm font-medium text-slate-500">Select an imaging target and upload a radiograph</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
