'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Brain, Zap, Target, LayoutGrid } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { exportRawTelemetryExcel, exportAllMemoryHistoryExcel } from '../utils/exportExcel';

function analyzeMemoryData(telemetry = [], maxLevel = 2) {
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  
  const correctRTs = telemetry.filter(t => t.isCorrect).map(t => t.latencyMs);
  const avgLatency = avg(correctRTs);
  
  const totalMoves = telemetry.length;
  const errors = telemetry.filter(t => !t.isCorrect).length;
  const accuracy = totalMoves > 0 ? Math.round(((totalMoves - errors) / totalMoves) * 100) : 0;
  
  // Working Memory Span
  let spanCategory = 'Bajo';
  if (maxLevel > 6) spanCategory = 'Superior';
  else if (maxLevel >= 4) spanCategory = 'Promedio';

  let speedCategory = 'Lenta';
  if (avgLatency > 0 && avgLatency < 600) speedCategory = 'Rápida';
  else if (avgLatency <= 1000) speedCategory = 'Normal';

  return {
    avgLatency,
    accuracy,
    totalErrors: errors,
    totalMoves,
    spanCategory,
    speedCategory
  };
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 text-sm">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-50">
          <div className={`w-3 h-3 rounded-full ${data.isCorrect ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="font-black text-slate-800">{label}</span>
          <span className="text-slate-400 text-xs ml-auto">Nivel {data.level}</span>
        </div>
        <p className="text-slate-600">
          Tiempo: <span className="font-bold text-slate-900">{data.latencyMs} ms</span>
        </p>
        {!data.isCorrect && (
          <p className="text-rose-600 font-semibold mt-1">Error: Giró {data.userFace} (Esperaba {data.expectedFace})</p>
        )}
      </div>
    );
  }
  return null;
};

export default function MemoryDashboard({ record, onRestart, onExit }) {
  const { playerName, date } = record;
  const telemetry = record.telemetry || record.rawTurnsData || [];
  const metrics = record.metrics || record.stats || {};
  const m = analyzeMemoryData(telemetry, metrics?.maxLevelReached || 2);
  
  const [note, setNote] = useState(record.anotacion_clinica || '');
  const [savingNote, setSavingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [roundComments, setRoundComments] = useState({});
  const [statsJson, setStatsJson] = useState({});
  
  const recordId = record.sessionId || record.id;

  useEffect(() => {
    if (!recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')) return;
    async function loadNote() {
      const { data, error } = await supabase
        .from('sesiones_clinicas')
        .select('anotacion_clinica, estadisticas_json')
        .eq('id', recordId)
        .single();
      if (!error && data) {
        if (data.anotacion_clinica) {
          setNote(data.anotacion_clinica);
        }
        if (data.estadisticas_json) {
          setStatsJson(data.estadisticas_json);
          setRoundComments(data.estadisticas_json.roundComments || {});
        }
      }
    }
    loadNote();
  }, [recordId]);

  const handleSaveNote = async () => {
    if (!recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')) {
      setSaveStatus('No se puede guardar nota en una sesión local o de práctica.');
      return;
    }
    setSavingNote(true);
    setSaveStatus('');
    try {
      const { error } = await supabase
        .from('sesiones_clinicas')
        .update({ anotacion_clinica: note })
        .eq('id', recordId);
      if (error) throw error;
      setSaveStatus('Observación guardada con éxito.');
    } catch (e) {
      console.error('Error saving note:', e);
      setSaveStatus('Error al guardar la observación.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveRoundComment = async (roundKey, commentText) => {
    if (!recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')) return;
    const newComments = { ...roundComments, [roundKey]: commentText };
    setRoundComments(newComments);
    const updatedStats = { ...statsJson, roundComments: newComments };
    setStatsJson(updatedStats);
    try {
      const { error } = await supabase
        .from('sesiones_clinicas')
        .update({ estadisticas_json: updatedStats })
        .eq('id', recordId);
      if (error) throw error;
    } catch (e) {
      console.error('Error saving round comment:', e);
    }
  };

  const handlePrint = () => window.print();

  const handleExportRawTelemetry = async () => {
    await exportRawTelemetryExcel({
      sessionData: {
        id: recordId || 'sesion-' + Date.now(),
        date,
        telemetry
      },
      playerName
    });
  };

  const handleExportExcel = async () => {
    await exportAllMemoryHistoryExcel([record]);
  };

  const d = date ? new Date(date) : new Date();
  const formattedDate = `${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })} a las ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;

  const chartData = (telemetry || []).map((t, idx) => ({
    name: `Mov ${idx + 1}`,
    latencyMs: t.latencyMs,
    level: t.level,
    isCorrect: t.isCorrect,
    expectedFace: t.expectedFace,
    userFace: t.userFace
  }));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans p-4 md:p-8 report-container">
      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .report-container { padding: 0 !important; }
        }
      `}</style>

      {/* HEADER */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3 flex-wrap">
            Reporte Memory Mirror
            {(metrics?.isKeyboardMode || metrics?.modo_evaluacion === 'teclado_sin_cubo' || record?.clinicalLabel?.includes('Modo Teclado')) && (
              <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                ⌨️ Modo Teclado (Sin Cubo)
              </span>
            )}
          </h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">
            Estudiante: <span className="text-purple-600 font-bold">{playerName || 'Anónimo'}</span>
            <span className="mx-2 text-slate-300">|</span>
            {formattedDate}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap md:flex-nowrap flex-shrink-0 no-print">
          {onRestart && (
            <button onClick={onRestart} className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all text-sm">
              Rehacer
            </button>
          )}
          <button onClick={handleExportExcel} className="px-4 py-2 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700 shadow-sm transition-all text-sm flex items-center gap-2">
            Excel Clínico
          </button>
          <button onClick={handleExportRawTelemetry} className="px-4 py-2 rounded-xl bg-sky-600 font-bold text-white hover:bg-sky-700 shadow-sm transition-all text-sm flex items-center gap-2" title="Descargar log crudo e inalterable de sensores BLE para auditoría">
            Telemetría Cruda
          </button>
          <button onClick={onExit} className="px-4 py-2 rounded-xl bg-purple-600 font-bold text-white hover:bg-purple-700 shadow shadow-purple-200 transition-all text-sm">
            ← Finalizar
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-6">

        {/* METRICS CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-500">
              <Brain size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Capacidad Memoria</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black text-slate-800">Nivel {metrics?.maxLevelReached || 2}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 font-medium border-t border-slate-50 pt-2">Perfil: <strong className="text-purple-600">{m.spanCategory}</strong></p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
              <Target size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Precisión General</p>
              <p className="text-3xl font-black text-slate-800">{m.accuracy}%</p>
            </div>
            <p className="text-xs text-slate-500 font-medium border-t border-slate-50 pt-2">Errores totales: <strong className="text-rose-600">{m.totalErrors}</strong></p>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
              <Zap size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Velocidad Motora</p>
              <p className="text-3xl font-black text-slate-800">{m.avgLatency > 0 ? `${m.avgLatency} ms` : '—'}</p>
            </div>
            <p className="text-xs text-slate-500 font-medium border-t border-slate-50 pt-2">Perfil: <strong className="text-amber-600">{m.speedCategory}</strong></p>
          </div>
          
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
              <LayoutGrid size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Secuencia Más Larga</p>
              <p className="text-3xl font-black text-slate-800">{metrics?.maxLevelReached ? metrics.maxLevelReached : 2} caras</p>
            </div>
            <p className="text-xs text-slate-500 font-medium border-t border-slate-50 pt-2">Mantenidas en memoria de trabajo</p>
          </div>
        </div>

        {/* CHART */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              Curva de Aprendizaje y Latencia
            </h2>
            <p className="text-sm text-slate-500 mt-1">Evolución de la latencia (ms) a medida que aumenta la dificultad cognitiva (Nivel).</p>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit="ms" />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={m.avgLatency} stroke="#cbd5e1" strokeDasharray="5 5" label={{ position: 'insideTopLeft', value: 'Promedio', fill: '#94a3b8', fontSize: 12 }} />
                
                <Line 
                  type="monotone" 
                  dataKey="latencyMs" 
                  stroke="#a855f7" 
                  strokeWidth={3} 
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (!payload || !cx || !cy) return null;
                    return (
                      <circle 
                        cx={cx} cy={cy} r={5} 
                        fill={payload.isCorrect ? "#a855f7" : "#ef4444"} 
                        stroke="white" strokeWidth={2} 
                        key={`dot-${payload.name}`} 
                      />
                    );
                  }}
                  activeDot={{ r: 8, strokeWidth: 0 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BITÁCORA CLÍNICA */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 no-print">
          <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
            Bitácora Clínica (Observación Cualitativa)
          </h2>
          <p className="text-sm text-slate-500 mb-4 font-medium">Registra anotaciones clínicas sobre la conducta, distractores, nivel de tolerancia a la frustración o fatiga atencional del estudiante.</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escribe aquí observaciones cualitativas para el expediente del alumno..."
            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all text-slate-800 font-medium"
            disabled={!recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')}
          />
          <div className="flex justify-between items-center mt-3">
            <span className={`text-xs font-semibold ${saveStatus.includes('éxito') ? 'text-emerald-600' : 'text-rose-600'}`}>
              {saveStatus}
            </span>
            <button
              onClick={handleSaveNote}
              disabled={savingNote || !recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-bold rounded-lg text-xs tracking-wider transition-all cursor-pointer text-white"
            >
              {savingNote ? 'Guardando...' : 'GUARDAR OBSERVACIÓN'}
            </button>
          </div>
        </div>

        {/* ── SECCIÓN 2: RADIOGRAFÍA POR MOVIMIENTOS ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8 mt-6 page-break-before">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            Radiografía por Movimientos
          </h2>
          <div className="space-y-3">
            {(telemetry || []).map((t, idx) => {
              let statusText = '', borderLine = '', dot = '';

              if (t.isCorrect) {
                statusText = `Acierto. Tiempo de reacción: ${t.latencyMs} ms.`;
                borderLine = 'border-emerald-100 bg-emerald-50/40';
                dot = 'bg-emerald-500';
              } else {
                statusText = `Error de secuencia. Giraste ${t.userFace} pero se esperaba ${t.expectedFace}.`;
                borderLine = 'border-rose-200 bg-rose-50/60';
                dot = 'bg-rose-500';
              }

              return (
                <div key={idx} className={`flex gap-4 p-4 rounded-xl border ${borderLine} transition-all`}>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                    <div className={`w-3 h-3 rounded-full ${dot}`} />
                    {idx < (telemetry.length - 1) && <div className="w-px flex-1 bg-slate-200 min-h-[16px]" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-black text-slate-500 text-sm">Nivel {t.level} (Intento {t.trial}) - Movimiento {idx + 1}</span>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5 font-semibold">
                          Esperado: {t.expectedFace}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700">{statusText}</p>
                    
                    {/* Bitácora por Movimiento */}
                    <div className="mt-2 flex items-center gap-2 no-print">
                      <input
                        type="text"
                        value={roundComments[`move-${idx}`] || ''}
                        placeholder="Agregar nota para este movimiento..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setRoundComments(prev => ({ ...prev, [`move-${idx}`]: val }));
                        }}
                        onBlur={(e) => handleSaveRoundComment(`move-${idx}`, e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-purple-500 focus:bg-white transition-all font-medium"
                        disabled={!recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')}
                      />
                    </div>
                    {roundComments[`move-${idx}`] && (
                      <p className="text-xs text-purple-600 font-bold mt-1 bg-purple-50/50 px-2.5 py-1 rounded-lg border border-purple-100/50 print-only">
                        Nota del clínico: {roundComments[`move-${idx}`]}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
