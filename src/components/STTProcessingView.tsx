import React, { useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, SttTranscribeResponse } from '../types';
import { FileText, Mic, CheckCircle, AlertCircle, Loader2, Save, X, Headphones, Search, BrainCircuit, AlertTriangle, Activity, ArrowRight, Play, Pause, Sparkles } from 'lucide-react';

interface STTProcessingViewProps {
  userRole: Role;
}

type ProcessingPhase = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export default function STTProcessingView({ userRole }: STTProcessingViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [result, setResult] = useState<SttTranscribeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveWithTriageStatus, setSaveWithTriageStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Triage data comes bundled with the transcription from the unified voice-triage endpoint
  const triageData = result?.triage ?? null;

  // ── TTS (Text-to-Speech) State ──
  const [ttsPhase, setTtsPhase] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

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
    setResult(null);
    setPhase('idle');
    setSaveStatus('idle');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleTranscribe = async () => {
    if (!file) return;

    setPhase('processing');
    setErrorMessage(null);

    try {
      // Routes through unified API voice-triage endpoint (STT + LLM triage in one call)
      const sttResult = await api.stt.transcribe(file, file.name);
      setResult(sttResult);
      setPhase('complete');
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : 'Transcription failed');
    }
  };

  const handleSaveTranscript = async () => {
    if (!result || !patientId.trim()) return;

    setSaveStatus('saving');
    try {
      await api.stt.saveTranscript({
        patientId: patientId.trim(),
        patientName: patientName.trim() || 'Unknown Patient',
        transcriptText: result.text,
        language: result.language,
        model: result.model,
        sessionId: result.sessionId,
        confidence: 0.88,
      });
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to save transcript:', err);
    }
  };

  const handleSaveWithTriage = async () => {
    if (!result || !triageData || !patientId.trim()) return;

    setSaveWithTriageStatus('saving');
    try {
      await api.stt.saveTranscriptWithTriage({
        patientId: patientId.trim(),
        patientName: patientName.trim() || 'Unknown Patient',
        transcriptText: result.text,
        language: result.language,
        model: result.model,
        sessionId: result.sessionId,
        confidence: 0.88,
        triageResult: {
          session_id: triageData.session_id,
          urgency_level: triageData.urgency_level,
          reasoning: triageData.reasoning,
          next_steps: triageData.next_steps,
          red_flags: triageData.red_flags,
          disclaimer: triageData.disclaimer,
          latency_ms: triageData.latency_ms,
        },
      });
      setSaveWithTriageStatus('saved');
    } catch (err) {
      setSaveWithTriageStatus('error');
      console.error('Failed to save transcript with triage:', err);
    }
  };

  // ── TTS: Speak Transcription ──

  const handleSpeakTranscription = async () => {
    if (!result || !result.text.trim()) return;

    if (ttsAudioUrl) {
      URL.revokeObjectURL(ttsAudioUrl);
      setTtsAudioUrl(null);
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }

    setTtsPhase('loading');

    try {
      const blob = await api.tts.synthesizeStream({
        text: result.text.substring(0, 4096),
        voice: 'nova',
        model: 'tts-1',
        speed: 1.0,
      });
      const url = URL.createObjectURL(blob);
      setTtsAudioUrl(url);

      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }

      const audio = new Audio(url);
      ttsAudioRef.current = audio;

      audio.onended = () => {
        setTtsPhase('idle');
        URL.revokeObjectURL(url);
        setTtsAudioUrl(null);
      };

      audio.onplay = () => setTtsPhase('playing');
      audio.onerror = () => {
        setTtsPhase('error');
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch (err) {
      setTtsPhase('error');
      console.error('TTS playback failed:', err);
    }
  };

  const handleStopTts = () => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (ttsAudioUrl) {
      URL.revokeObjectURL(ttsAudioUrl);
      setTtsAudioUrl(null);
    }
    setTtsPhase('idle');
  };

  const resetAll = () => {
    handleStopTts();
    setFile(null);
    setPhase('idle');
    setResult(null);
    setErrorMessage(null);
    setPatientId('');
    setPatientName('');
    setSaveStatus('idle');
    setSaveWithTriageStatus('idle');
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null || seconds === undefined) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Speech-to-Text Processor</h2>
          <p className="text-sm text-slate-500 mt-1">
            Upload an audio recording for unified voice processing. The system transcribes via Whisper STT
            and runs LLM triage analysis through the unified API pipeline — all in a single call.
          </p>
        </div>

        {/* Upload area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-teal-50/50 hover:bg-white hover:border-emerald-400 transition-all cursor-pointer p-16 text-center group"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:bg-emerald-100 transition-all">
              <Mic size={32} />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-700">
                Drop your audio file here
              </p>
              <p className="text-sm text-slate-500 mt-1">
                or click to browse files — unified STT + triage
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

        <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
          <Sparkles size={18} className="text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-indigo-700">Unified Pipeline</p>
            <p className="text-[10px] text-indigo-600 mt-0.5">
              Audio is processed through the unified API voice-triage endpoint — Whisper STT transcription
              followed by Nemotron LLM clinical reasoning. The result includes both the clinical text and
              triage analysis (urgency, reasoning, red flags).
            </p>
          </div>
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

  // ── File selected — show audio details + transcribe button ──
  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="border-b border-slate-200 pb-5 mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Speech-to-Text Processor</h2>
          <p className="text-sm text-slate-500 mt-1">Review the audio file and initiate unified voice triage processing.</p>
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
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center mx-auto mb-3">
                  <Sparkles size={40} className="text-emerald-500" />
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

          {/* Transcribe Button */}
          <button
            onClick={handleTranscribe}
            disabled={phase === 'processing'}
            className="w-full mt-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            {phase === 'processing' ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                STT → LLM Pipeline...
              </>
            ) : phase === 'complete' ? (
              <>
                <CheckCircle size={18} />
                Re-process Audio
              </>
            ) : (
              <>
                <Mic size={18} />
                Process Audio
              </>
            )}
          </button>

          {phase === 'processing' && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Loader2 size={20} className="animate-spin text-emerald-500" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Processing via unified API</p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">
                    Step 1: Whisper STT → Step 2: Nemotron LLM triage
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Results Panel ── */}
        <div className="space-y-4">
          {/* Processing Status */}
          {phase === 'processing' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <Loader2 size={40} className="animate-spin text-emerald-500 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-emerald-700">Processing via Unified API</h3>
              <p className="text-sm text-emerald-500 mt-1">
                STT transcription + LLM triage pipeline running...
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
              {/* Clinical Text Card */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <FileText size={16} className="text-emerald-500" />
                  <span className="text-sm font-bold text-slate-800">Clinical Analysis</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-auto">
                    {formatDuration(result.processingTime)}
                  </span>
                </div>
                <div className="p-5">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[350px] overflow-y-auto">
                    {result.text || (
                      <span className="text-slate-400 italic">No clinical text returned.</span>
                    )}
                  </div>

                  {/* TTS: Speak Text */}
                  {result.text && (
                    <div className="mt-3 flex items-center gap-2">
                      {ttsPhase === 'loading' ? (
                        <div className="flex items-center gap-2 text-xs text-emerald-500">
                          <Loader2 size={14} className="animate-spin" />
                          Generating speech...
                        </div>
                      ) : ttsPhase === 'playing' ? (
                        <button
                          onClick={handleStopTts}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-all"
                        >
                          <Pause size={14} />
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={handleSpeakTranscription}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all"
                        >
                          <Play size={14} />
                          Speak Text
                        </button>
                      )}
                      {ttsPhase === 'error' && (
                        <span className="text-[10px] text-rose-500">TTS playback failed</span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {result.text.length > 4096 ? '(truncated to 4096 chars)' : `${result.text.length} chars`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Triage Results (from unified voice-triage pipeline) ── */}
              {triageData && (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3 border-b border-indigo-100 flex items-center gap-2">
                    <BrainCircuit size={16} className="text-indigo-600" />
                    <span className="text-sm font-bold text-indigo-800">LLM Triage Analysis</span>
                    <span className="text-[10px] text-indigo-400 font-mono ml-auto">
                      Latency: {triageData.latency_ms}ms
                    </span>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Urgency Badge */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        urgencyTheme(triageData.urgency_level).bg
                      } ${urgencyTheme(triageData.urgency_level).text} ${urgencyTheme(triageData.urgency_level).border}`}>
                        <span className={`w-2 h-2 rounded-full ${urgencyTheme(triageData.urgency_level).dot}`} />
                        {urgencyTheme(triageData.urgency_level).label}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Session: {triageData.session_id.substring(0, 12)}...
                      </span>
                    </div>

                    {/* Reasoning */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Clinical Reasoning</h4>
                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed">
                        {triageData.reasoning}
                      </div>
                    </div>

                    {/* Next Steps */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Recommended Next Steps</h4>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-700 leading-relaxed">
                        {triageData.next_steps}
                      </div>
                    </div>

                    {/* Red Flags */}
                    {triageData.red_flags && triageData.red_flags.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-500 mb-1.5 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Red Flags
                        </h4>
                        <ul className="space-y-1">
                          {triageData.red_flags.map((flag, i) => (
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
                      {triageData.disclaimer}
                    </p>
                  </div>
                </div>
              )}

              {/* Pipeline Info Banner */}
              {triageData && (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Activity size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-800">Unified Pipeline Complete</h4>
                      <p className="text-[10px] text-emerald-600 mt-1 leading-relaxed">
                        Audio was processed through the unified API voice-triage endpoint — Whisper STT
                        transcription followed by Nemotron LLM clinical reasoning in a single call.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Session Metadata */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Session', value: result.sessionId.substring(0, 12) + '...' },
                  { label: 'Model', value: result.model },
                  { label: 'Processing Time', value: formatDuration(result.processingTime) },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{item.label}</div>
                    <div className="text-xs font-mono font-bold text-slate-700 mt-0.5 truncate">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Raw Response */}
              <details className="bg-slate-50 border border-slate-200 rounded-xl">
                <summary className="px-5 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none flex items-center gap-2">
                  <Search size={14} />
                  Raw API Response
                </summary>
                <div className="px-5 pb-4">
                  <pre className="bg-slate-900 text-green-400 text-[10px] font-mono p-4 rounded-xl overflow-x-auto max-h-48">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              </details>

              {/* ── Save as Report Section ── */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Save size={16} className="text-emerald-500" />
                  <span className="text-sm font-bold text-slate-800">Save to Firestore</span>
                </div>
                <div className="p-5 space-y-4">
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

                  {/* Save as Report */}
                  <button
                    onClick={handleSaveTranscript}
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
                      <><Save size={16} /> Save as Report</>
                    )}
                  </button>

                  {saveStatus === 'error' && (
                    <p className="text-xs text-rose-600">Failed to save report.</p>
                  )}

                  {/* Save with Triage */}
                  {triageData && (
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
                          <><CheckCircle size={16} /> Saved with Triage</>
                        ) : (
                          <><ArrowRight size={16} /> Save Report + Triage Analysis</>
                        )}
                      </button>

                      {saveWithTriageStatus === 'error' && (
                        <p className="text-xs text-rose-600">Failed to save with triage.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
