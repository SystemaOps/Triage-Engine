import React, { useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, TriageResult } from '../types';
import { Mic, FileText, CheckCircle, AlertCircle, Loader2, X, BrainCircuit, AlertTriangle, Activity, Sparkles, Headphones } from 'lucide-react';

interface VoiceTriageProcessingViewProps {
  userRole: Role;
}

type ProcessingPhase = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export default function VoiceTriageProcessingView({ userRole }: VoiceTriageProcessingViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(`voice-${Date.now()}`);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const allowedTypes = [
      'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4',
      'audio/m4a', 'audio/ogg', 'audio/webm', 'audio/flac',
      'audio/aac', 'audio/x-wav', 'audio/x-m4a',
    ];

    if (!allowedTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i)) {
      setErrorMessage('Unsupported audio format. Supported: WAV, MP3, M4A, OGG, WebM, FLAC, AAC.');
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage('File too large. Maximum size is 50 MB.');
      return;
    }

    setFile(selectedFile);
    setErrorMessage(null);
    setTriageResult(null);
    setPhase('idle');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleVoiceTriage = async () => {
    if (!file) return;

    setPhase('processing');
    setErrorMessage(null);

    try {
      // Unified voice-triage: STT transcription + LLM triage in one call
      const result = await api.voiceTriage.triage(file, file.name, sessionId);
      setTriageResult(result);
      setPhase('complete');
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : 'Voice triage failed');
    }
  };

  const resetAll = () => {
    setFile(null);
    setPhase('idle');
    setTriageResult(null);
    setErrorMessage(null);
    setSessionId(`voice-${Date.now()}`);
  };

  const urgencyTheme = (level: string) => {
    const themes: Record<string, { dot: string; bg: string; text: string; border: string; label: string }> = {
      emergency_referral: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Emergency Referral' },
      urgent_care: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Urgent Care' },
      doctor_consultation: { dot: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', label: 'Doctor Consultation' },
      self_care: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Self-care' },
    };
    return themes[level] || {
      dot: 'bg-slate-500', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200',
      label: level.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    };
  };

  // ── Phase: Idle (no file selected) ──
  if (!file) {
    return (
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div className="border-b border-slate-200 pb-5 mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Voice Triage Processor</h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload an audio recording of a patient's symptoms for unified voice-based triage.
            The system transcribes the audio via STT and runs the LLM triage pipeline in a single step.
          </p>
        </div>

        {/* Upload area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-2xl bg-gradient-to-br from-indigo-50/50 to-purple-50/50 hover:bg-white hover:border-indigo-400 transition-all cursor-pointer p-16 text-center group"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-500 flex items-center justify-center group-hover:shadow-lg group-hover:shadow-indigo-500/10 transition-all">
              <Sparkles size={40} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-700">
                Drop audio here for unified triage
              </p>
              <p className="text-sm text-slate-500 mt-1">
                or click to browse files — STT + LLM triage in one call
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono flex-wrap justify-center">
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">WAV</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">MP3</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">M4A</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">OGG</span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">FLAC</span>
              <span className="text-slate-300">|</span>
              <span>Max 50 MB</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
        </div>

        {errorMessage && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
            <AlertCircle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-rose-700">Error</p>
              <p className="text-xs text-rose-600 mt-1">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Pipeline info card */}
        <div className="mt-8 bg-indigo-50 border border-indigo-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <BrainCircuit size={20} className="text-indigo-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-indigo-800">Unified Voice → Triage Pipeline</h3>
              <p className="text-xs text-indigo-600 mt-1 leading-relaxed">
                Unlike the standard STT processor which requires a separate triage step, the 
                voice triage endpoint handles everything in one request: Whisper STT transcription 
                followed by Nemotron LLM clinical reasoning. The result includes urgency classification, 
                clinical reasoning, and red flag indicators.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── File selected — show audio details + triage button ──
  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="border-b border-slate-200 pb-5 mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Voice Triage Processor</h2>
          <p className="text-sm text-slate-500 mt-1">Review the audio file and initiate unified voice triage.</p>
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
        {/* ── Left: Audio Details ── */}
        <div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <Headphones size={16} className="text-indigo-500" />
              <span className="text-sm font-medium text-slate-700">{file.name}</span>
              <span className="text-[10px] text-slate-400 font-mono ml-auto">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center mx-auto mb-3">
                  <Sparkles size={40} className="text-indigo-500" />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                  <span className="px-2 py-1 bg-white rounded-md border border-slate-200">Unified Pipeline</span>
                  <span className="px-2 py-1 bg-white rounded-md border border-slate-200">STT → LLM</span>
                </div>
              </div>
            </div>
          </div>

          {/* Audio element for playback */}
          <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3">
            <audio
              controls
              src={URL.createObjectURL(file)}
              className="w-full h-10"
              onLoad={(e) => {
                const audio = e.currentTarget;
                const src = audio.src;
                audio.onloadedmetadata = () => URL.revokeObjectURL(src);
              }}
            >
              Your browser does not support the audio element.
            </audio>
          </div>

          {/* Voice Triage Button */}
          <button
            onClick={handleVoiceTriage}
            disabled={phase === 'processing'}
            className="w-full mt-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {phase === 'processing' ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                STT → LLM Triage Pipeline...
              </>
            ) : phase === 'complete' ? (
              <>
                <CheckCircle size={18} />
                Re-run Voice Triage
              </>
            ) : (
              <>
                <Mic size={18} />
                Run Voice Triage
              </>
            )}
          </button>

          {phase === 'processing' && (
            <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Loader2 size={20} className="animate-spin text-indigo-500" />
                <div>
                  <p className="text-xs font-semibold text-indigo-700">Processing voice triage</p>
                  <p className="text-[10px] text-indigo-500 mt-0.5">
                    Step 1: Whisper STT transcription → Step 2: Nemotron clinical reasoning
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Results Panel ── */}
        <div className="space-y-4">
          {/* Error State */}
          {phase === 'error' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle size={24} className="text-rose-500 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-700">Voice Triage Failed</h3>
                  <p className="text-xs text-rose-600 mt-1">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {phase === 'idle' && (
            <div className="flex flex-col items-center justify-center h-full border border-dashed border-slate-200 rounded-2xl bg-slate-50 p-8 text-center">
              <Mic size={48} className="text-slate-300 mb-4" />
              <p className="text-sm font-medium text-slate-500">Select audio and run voice triage</p>
              <p className="text-xs text-slate-400 mt-1">The unified pipeline will transcribe and analyze in one step.</p>
            </div>
          )}

          {/* Results */}
          {phase === 'complete' && triageResult && (
            <>
              {/* Triage Result Card */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <BrainCircuit size={16} className="text-indigo-500" />
                  <span className="text-sm font-bold text-slate-800">Voice Triage Result</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-auto">
                    {triageResult.latency_ms}ms
                  </span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Urgency Level Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                      urgencyTheme(triageResult.urgency_level).bg
                    } ${urgencyTheme(triageResult.urgency_level).text} ${urgencyTheme(triageResult.urgency_level).border}`}>
                      <span className={`w-2 h-2 rounded-full ${urgencyTheme(triageResult.urgency_level).dot}`} />
                      {urgencyTheme(triageResult.urgency_level).label}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Session: {triageResult.session_id.substring(0, 12)}...
                    </span>
                  </div>

                  {/* Reasoning */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Clinical Reasoning</h4>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed">
                      {triageResult.reasoning}
                    </div>
                  </div>

                  {/* Next Steps */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Recommended Next Steps</h4>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-700 leading-relaxed">
                      {triageResult.next_steps}
                    </div>
                  </div>

                  {/* Red Flags */}
                  {triageResult.red_flags && triageResult.red_flags.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-500 mb-1.5 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Red Flags
                      </h4>
                      <ul className="space-y-1">
                        {triageResult.red_flags.map((flag, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-rose-700">
                            <span className="text-rose-400 mt-0.5">•</span>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Disclaimer */}
                  <p className="text-[10px] text-slate-400 italic leading-relaxed">
                    {triageResult.disclaimer}
                  </p>
                </div>
              </div>

              {/* Pipeline summary */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Activity size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-800">Unified Pipeline Complete</h4>
                    <p className="text-[10px] text-emerald-600 mt-1 leading-relaxed">
                      Audio was transcribed via Whisper STT and analyzed through the Nemotron LLM 
                      triage pipeline in a single unified API call. No separate transcription step needed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Raw Response */}
              <details className="bg-slate-50 border border-slate-200 rounded-xl">
                <summary className="px-5 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none flex items-center gap-2">
                  <FileText size={14} />
                  Raw API Response
                </summary>
                <div className="px-5 pb-4">
                  <pre className="bg-slate-900 text-green-400 text-[10px] font-mono p-4 rounded-xl overflow-x-auto max-h-48">
                    {JSON.stringify(triageResult, null, 2)}
                  </pre>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
