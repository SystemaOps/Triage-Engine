import React, { useState, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, TtsVoice, TtsModel, TtsAudioFormat, TtsSynthesizeResponse, TTS_VOICES, TTS_MODELS } from '../types';
import { Volume2, Play, Pause, Loader2, CheckCircle, AlertCircle, Save, FileText, Mic, Headphones, Activity } from 'lucide-react';

interface TTSProcessingViewProps {
  userRole: Role;
}

export default function TTSProcessingView({ userRole }: TTSProcessingViewProps) {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<TtsVoice>('alloy');
  const [model, setModel] = useState<TtsModel>('tts-1');
  const [format, setFormat] = useState<TtsAudioFormat>('mp3');
  const [speed, setSpeed] = useState(1.0);
  const [phase, setPhase] = useState<'idle' | 'synthesizing' | 'complete' | 'error'>('idle');
  const [result, setResult] = useState<TtsSynthesizeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSynthesize = async () => {
    if (!text.trim()) return;

    setPhase('synthesizing');
    setErrorMessage(null);
    setResult(null);

    try {
      const ttsResult = await api.tts.synthesize({
        text: text.trim(),
        voice,
        model,
        responseFormat: format,
        speed,
      });
      setResult(ttsResult);
      setPhase('complete');
    } catch (err) {
      setPhase('error');
      setErrorMessage(err instanceof Error ? err.message : 'TTS synthesis failed');
    }
  };

  const handlePlayAudio = () => {
    if (!result?.audioBase64) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const mime = result.contentType || 'audio/mpeg';
    const byteCharacters = atob(result.audioBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mime });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    };

    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);

    audio.play().catch((err) => {
      console.error('Audio playback failed:', err);
      setIsPlaying(false);
    });
  };

  const handleStopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const resetAll = () => {
    setText('');
    setPhase('idle');
    setResult(null);
    setErrorMessage(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const charCount = text.length;
  const isOverLimit = charCount > 4096;

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      <div className="border-b border-slate-200 pb-5 mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Text-to-Speech Synthesizer</h2>
        <p className="text-sm text-slate-500 mt-1">
          Convert clinical notes, triage results, or patient instructions into natural-sounding speech using OpenAI TTS.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left: Input Controls ── */}
        <div className="space-y-5">
          {/* Voice Selection */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Headphones size={16} className="text-indigo-500" />
              Voice Settings
            </h3>
            <div className="space-y-4">
              {/* Voice Grid */}                  <div className="grid grid-cols-2 gap-2">
                {TTS_VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVoice(v.id)}
                    className={`px-3 py-2.5 rounded-xl text-left border transition-all ${
                      voice === v.id
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-sm font-bold">{v.label}</span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">{v.description}</span>
                  </button>
                ))}
              </div>

              {/* Model & Format */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value as TtsModel)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
                  >
                    <option value="tts-1">tts-1 (Low latency)</option>
                    <option value="tts-1-hd">tts-1-hd (High quality)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as TtsAudioFormat)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
                  >
                    <option value="mp3">MP3</option>
                    <option value="opus">Opus</option>
                    <option value="aac">AAC</option>
                    <option value="flac">FLAC</option>
                    <option value="wav">WAV</option>
                  </select>
                </div>
              </div>

              {/* Speed */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Speed: {speed.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.25"
                  max="4.0"
                  step="0.25"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                  <span>0.25x</span>
                  <span>1.0x</span>
                  <span>4.0x</span>
                </div>
              </div>
            </div>
          </div>

          {/* Text Input */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <FileText size={16} className="text-indigo-500" />
              Text to Synthesize
            </h3>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter clinical notes, triage instructions, or patient education text to convert to speech..."
              rows={6}
              className={`w-full text-sm border rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                isOverLimit ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 focus:border-indigo-500'
              } bg-white text-slate-700 placeholder:text-slate-400`}
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-[11px] font-mono ${isOverLimit ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                {charCount} / 4096
              </span>
              <button
                onClick={() => setText('')}
                className="text-[11px] text-slate-400 hover:text-slate-600 font-medium"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Synthesize Button */}
          <button
            onClick={handleSynthesize}
            disabled={phase === 'synthesizing' || !text.trim() || isOverLimit}
            className="w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {phase === 'synthesizing' ? (
              <><Loader2 size={18} className="animate-spin" /> Synthesizing with OpenAI TTS...</>
            ) : (
              <><Volume2 size={18} /> Synthesize Speech</>
            )}
          </button>
        </div>

        {/* ── Right: Results Panel ── */}
        <div className="space-y-4">
          {/* Processing */}
          {phase === 'synthesizing' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-8 text-center">
              <Loader2 size={40} className="animate-spin text-indigo-500 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-indigo-700">Generating Speech</h3>
              <p className="text-sm text-indigo-500 mt-1">Sending to OpenAI TTS engine...</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle size={24} className="text-rose-500 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-rose-700">Synthesis Failed</h3>
                  <p className="text-xs text-rose-600 mt-1">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {phase === 'complete' && result && (
            <>
              {/* Audio Player */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Volume2 size={16} className="text-emerald-500" />
                  <span className="text-sm font-bold text-slate-800">Audio Preview</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-auto">{result.voice} · {result.model}</span>
                </div>
                <div className="p-5">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mx-auto mb-4 shadow-lg">
                      {isPlaying ? (
                        <button onClick={handleStopAudio} className="w-full h-full flex items-center justify-center text-emerald-600 hover:text-emerald-700">
                          <Pause size={32} />
                        </button>
                      ) : (
                        <button onClick={handlePlayAudio} className="w-full h-full flex items-center justify-center text-emerald-600 hover:text-emerald-700">
                          <Play size={32} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono">
                      {isPlaying ? 'Playing...' : 'Click to play'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Synthesized Text Preview */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <FileText size={16} className="text-slate-400" />
                  <span className="text-sm font-bold text-slate-800">Synthesized Text</span>
                </div>
                <div className="p-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 leading-relaxed max-h-[200px] overflow-y-auto">
                    {text || <span className="italic text-slate-400">No text</span>}
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Voice', value: result.voice },
                  { label: 'Model', value: result.model },
                  { label: 'Format', value: result.contentType?.split('/')[1] || 'mp3' },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{item.label}</div>
                    <div className="text-xs font-mono font-bold text-slate-700 mt-0.5 truncate capitalize">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Usage Tip */}
              {userRole === 'clinician' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
                  <Activity size={18} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-indigo-700">
                    <p className="font-semibold mb-1">Clinical Use Case</p>
                    <p>Use TTS to generate audio patient instructions from triage results, or convert transcribed consultations into spoken summaries for patient review.</p>
                  </div>
                </div>
              )}

              {/* Re-synthesize */}
              <button
                onClick={() => { setPhase('idle'); setResult(null); }}
                className="w-full py-2 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-all"
              >
                Modify text and re-synthesize
              </button>
            </>
          )}

          {/* Empty State */}
          {phase === 'idle' && !text.trim() && (
            <div className="flex flex-col items-center justify-center h-full border border-dashed border-slate-200 rounded-2xl bg-slate-50 p-8 text-center">
              <Volume2 size={48} className="text-slate-300 mb-4" />
              <p className="text-sm font-medium text-slate-500">Enter text and click Synthesize</p>
              <p className="text-xs text-slate-400 mt-1">Choose a voice and configure settings on the left.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
