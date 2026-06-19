import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { ModelWeight, Role } from '../types';
import { useAuth } from '../context/AuthContext';

export default function ModelManagementView({ userRole }: { userRole: Role }) {
  const { user: currentUser } = useAuth();
  const [models, setModels] = useState<ModelWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  // High-Density Configuration Arrays (Client Override States)
  const [consensusThreshold, setConsensusThreshold] = useState(85);
  const [contextWindow, setContextWindow] = useState(8); // Representing 8K

  // Live Firestore Sync
  useEffect(() => {
    const unsubscribe = api.modelWeights.subscribeToModelWeights((data) => {
      // Sort so active models bubble to the top of the deck
      const sorted = [...data].sort((a, b) => (a.status === 'active' ? -1 : 1));
      setModels(sorted);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handlePromoteSequence = async (modelId: string) => {
    setPromotingId(modelId);
    
    try {        await api.modelWeights.promoteModel(modelId, currentUser?.uid || 'unknown');
      // On success, Firestore subscription will push the updated model list
    } catch (err) {
      console.error("Model promotion vector rejected:", err);
    } finally {
      setPromotingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Structural Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Neural Weight & Inference Layer</h2>
        <p className="text-sm text-slate-500">Manage real-time weights, consensus confidence limits, and track edge-routing matrices.</p>
      </div>

      {/* Modern Control Array Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Consensus Slide Widget */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Consensus Threshold</span>
            <span className="text-sm font-mono font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg">
              {consensusThreshold}% Confidence
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Minimum alignment floor required across the localized agent cluster before bypassing physician verification steps.
          </p>
          <div className="relative pt-2">
            <input 
              type="range" min="50" max="99" 
              value={consensusThreshold} 
              onChange={(e) => setConsensusThreshold(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-950"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1.5">
              <span>50% (Permissive)</span>
              <span>99% (Strict)</span>
            </div>
          </div>
        </div>

        {/* Context Window Bound Widget */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Context Window Bound</span>
            <span className="text-sm font-mono font-bold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg">
              {contextWindow}K Tokens
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Dynamic cap mapping for historical patient records processing. Higher bounds scale VRAM allocation footprints.
          </p>
          <div className="relative pt-2">
            <input 
              type="range" min="2" max="16" step="2"
              value={contextWindow} 
              onChange={(e) => setContextWindow(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-950"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1.5">
              <span>2K (Low Bandwidth)</span>
              <span>16K (Deep History)</span>
            </div>
          </div>
        </div>

        {/* Hardware Memory Map Tile */}
        <div className="bg-slate-900 border border-slate-950 rounded-2xl p-5 shadow-sm text-white flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aggregated Compute Matrix</span>
              <h3 className="text-2xl font-black font-mono tracking-tight text-white mt-1">23.8 GB <span className="text-xs font-normal text-slate-400">/ 32 GB</span></h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 uppercase">
              ROCm Loaded
            </span>
          </div>
          <div className="space-y-1.5 mt-4">
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full" style={{ width: '74.3%' }} />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>VRAM Footprint Capacity</span>
              <span>74.3% Allocated</span>
            </div>
          </div>
        </div>

      </div>

      <hr className="border-slate-100" />

      {/* Model Grid Core Deployment Deck */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Neural Network Weights Registry</h3>
          <span className="text-xs font-mono text-slate-500">{models.length} Nodes Registered</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm font-mono text-slate-400 animate-pulse">STREAMING LIVE WEIGHT CONFIGURATIONS...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {models.map((model) => (
              <div 
                key={model.id}
                className={`bg-white border rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between relative overflow-hidden ${
                  model.status === 'active' ? 'border-emerald-200 ring-1 ring-emerald-100/50' : 'border-slate-100'
                }`}
              >
                {/* Deployment Matrix State Line */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-slate-900">{model.tag}</h4>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                        model.type === 'triage' ? 'bg-blue-50 text-blue-600' :
                        model.type === 'classifier' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {model.type}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-400">{model.id}</p>
                  </div>

                  {/* Clean Status Badging */}
                  <div className="flex items-center space-x-1.5 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      model.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                      model.status === 'shadow' ? 'bg-blue-400' : 'bg-slate-300'
                    }`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{model.status}</span>
                  </div>
                </div>

                {/* Telemetry Performance Metrics Strip */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50/60 rounded-xl p-3 my-4 border border-slate-50 font-mono text-center">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Buffer Bound</span>
                    <span className="text-xs font-bold text-slate-700">{model.contextWindow}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Avg Latency</span>
                    <span className="text-xs font-bold text-slate-700">{model.avgInferenceTime}ms</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Consensus Target</span>
                    <span className="text-xs font-bold text-emerald-600">{model.accuracyRate}%</span>
                  </div>
                </div>

                {/* Bottom Control Link Trigger */}
                <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                  <span className="text-[11px] font-mono text-slate-400">
                    Est: ${(model.tokenCostPerM || 0).toFixed(2)} / M tokens
                  </span>

                  {model.status === 'shadow' && (
                    <button
                      onClick={() => handlePromoteSequence(model.id)}
                      disabled={promotingId !== null}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border shadow-sm transition-all ${
                        promotingId === model.id 
                          ? 'bg-slate-100 text-slate-400 border-transparent animate-pulse cursor-not-allowed'
                          : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {promotingId === model.id ? 'Compiling Weights...' : 'Promote to Production'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
