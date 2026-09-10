'use client';
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Brain, Zap, Activity, Eye, TrendingUp } from 'lucide-react';
import { ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { exportReactionMirrorExcel, exportRawTelemetryExcel } from '../utils/exportExcel';
import { analyzeData, calcPostInhibitorySlow } from '../utils/analytics';

// ─────────────────────────────────────────────────────────────
// (AnalyzeData and calcPostInhibitorySlow moved to utils/analytics.js)
// ─────────────────────────────────────────────────────────────

function StatRow({ label, value, color = 'text-slate-700' }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

function ErrorBadge({ label, count, color }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${color}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-lg font-black">{count}</span>
    </div>
  );
}

const CustomDot = (props) => {
  const { cx, cy, payload, dataKey } = props;
  if (!payload || !cx || !cy || !dataKey) return null;
  
  const data = payload[`${dataKey}_data`];
  if (!data) return null;
  
  const { isNogoSuccess, isNogoFail, isCommission, isGoOmission } = data;

  if (isNogoSuccess) {
    return <circle cx={cx} cy={cy} r={6} fill="#fef08a" stroke="#eab308" strokeWidth={2} />;
  }
  if (isNogoFail) {
    return (
      <g transform={`translate(${cx-6},${cy-6})`}>
        <path d="M0,0 L12,12 M12,0 L0,12" stroke="#ef4444" strokeWidth={3} strokeLinecap="round" />
      </g>
    );
  }
  if (isCommission) {
    return <rect x={cx-5} y={cy-5} width={10} height={10} fill="#f97316" stroke="white" strokeWidth={1} />;
  }
  if (isGoOmission) {
    return (
      <g transform={`translate(${cx-6},${cy-6})`}>
        <path d="M0,0 L12,12 M12,0 L0,12" stroke="#b91c1c" strokeWidth={3} strokeLinecap="round" opacity={0.6} />
      </g>
    );
  }
  
  return <circle cx={cx} cy={cy} r={5} fill="#22c55e" stroke="white" strokeWidth={1.5} />;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 text-sm min-w-[200px] flex flex-col gap-3">
        <div className="font-black text-slate-800 pb-2 border-b border-slate-50">{label}</div>
        {payload.map((entry, idx) => {
          const data = entry.payload[`${entry.dataKey}_data`];
          if (!data) return null;
          
          const { isNogoSuccess, isNogoFail, isCommission, isGoOmission } = data;
          let statusLabel = 'Acierto Normal';
          let dotColor = 'bg-emerald-500';
          if (isNogoSuccess) { statusLabel = 'Inhibición Exitosa'; dotColor = 'bg-yellow-400'; }
          if (isNogoFail) { statusLabel = 'Fallo No-Go (Impulsividad)'; dotColor = 'bg-red-500'; }
          if (isGoOmission) { statusLabel = 'Omisión (Inatención)'; dotColor = 'bg-slate-400'; }
          if (isCommission) { statusLabel = 'Error Dirección (Visomotor)'; dotColor = 'bg-orange-500'; }

          let handLabel = 'No-Go';
          const isL = entry.dataKey.includes('rtL') || (entry.dataKey.includes('rtEvent') && data.expectedFace === 'L');
          const isR = entry.dataKey.includes('rtR') || (entry.dataKey.includes('rtEvent') && data.expectedFace === 'R');
          if (isL) handLabel = 'Izquierda (L)';
          if (isR) handLabel = 'Derecha (R)';

          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${dotColor}`} />
                <span className="font-bold text-slate-700">{handLabel}</span>
                <span className="text-slate-400 text-xs ml-auto">{statusLabel}</span>
              </div>
              <p className="text-slate-600 mb-1 ml-5">
                Tiempo: <span className="font-bold text-slate-900">{data.actualRt ? `${data.actualRt} ms` : 'N/A'}</span>
              </p>
              {data.postDiffText && (
                <div className="mt-1 ml-5 bg-amber-50 text-amber-700 p-2 rounded-lg text-xs font-semibold flex items-start gap-2">
                  <TrendingUp size={14} className="mt-0.5" />
                  <span>Post-Error Slowing:<br/>{data.postDiffText}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function ReactionDashboard({ 
  playerName, 
  date, 
  rawTurnsData, 
  latencyOffset, 
  onRestart, 
  onExit, 
  recordId,
  attemptNumber,
  clinicalLabel,
  patient,
  metrics = {},
  stats = {}
}) {
  const [chartFilter, setChartFilter] = useState('ALL');
  const [showAllTurns, setShowAllTurns] = useState(false);

  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [roundComments, setRoundComments] = useState({});
  const [statsJson, setStatsJson] = useState({});

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
  
  const isDemoData = !rawTurnsData || rawTurnsData.length === 0;
  const actualTurnsData = useMemo(() => {
    if (!isDemoData) return rawTurnsData;
    return [
      { round: 1, type: 'GO', expected: 'L', actualFace: 'L', time: 385, status: 'Ok' },
      { round: 2, type: 'GO', expected: 'R', actualFace: 'R', time: 412, status: 'Ok' },
      { round: 3, type: 'NOGO', expected: 'U', actualFace: null, time: 0, status: 'Ok', fail: false },
      { round: 4, type: 'GO', expected: 'L', actualFace: 'L', time: 356, status: 'Ok' },
      { round: 5, type: 'GO', expected: 'R', actualFace: 'L', time: 490, status: 'Error de Lado', firstMoveWrong: true },
      { round: 6, type: 'NOGO', expected: 'D', actualFace: 'D', time: 240, status: 'Fallo de Inhibición', fail: true, isFalseStart: true },
      { round: 7, type: 'GO', expected: 'L', actualFace: 'L', time: 395, status: 'Ok' },
      { round: 8, type: 'GO', expected: 'R', actualFace: 'R', time: 374, status: 'Ok' },
      { round: 9, type: 'NOGO', expected: 'U', actualFace: null, time: 0, status: 'Ok', fail: false },
      { round: 10, type: 'GO', expected: 'L', actualFace: 'L', time: 420, status: 'Ok' }
    ];
  }, [rawTurnsData, isDemoData]);

  const m = analyzeData(actualTurnsData);
  const pis = calcPostInhibitorySlow(actualTurnsData, m.avgTotal || 0);
  
  const handlePrint = () => window.print();

  const handleExportExcel = async () => {
    await exportReactionMirrorExcel({
      playerName,
      date,
      metrics: m,
      postInhibitory: pis,
      rawTurnsData: actualTurnsData,
      chartElementId: 'turn-chart-container'
    });
  };

  const handleExportRawTelemetry = async () => {
    await exportRawTelemetryExcel({
      sessionData: {
        id: recordId || 'sesion-' + Date.now(),
        date,
        rawTurnsData: actualTurnsData
      },
      playerName
    });
  };

  const d = date ? new Date(date) : new Date();
  const formattedDate = `${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })} a las ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;

  const faceName = (f) => f === 'L' ? 'Roja (L)' : f === 'R' ? 'Naranja (R)' : f;
  const ms = (v) => v !== null && v > 0 ? `${v} ms` : '—';

  const chartData = [];
  let leftIdx = 0;
  let rightIdx = 0;
  let nogoIdx = 0;

  (actualTurnsData || []).forEach((t, globalIdx) => {
    const expected = t.expected || t.expectedFace;
    const rt = t.time || t.reactionTimeMs;
    const type = t.type || (t.isOmission || t.isFalseStart || (expected !== 'L' && expected !== 'R') ? 'NOGO' : 'GO');
    
    let postDiffText = null;
    if (globalIdx > 0) {
      const prev = actualTurnsData[globalIdx-1];
      const prevNoGoFail = prev.type === 'NOGO' ? prev.fail : prev.isFalseStart;
      const prevGoOmission = prev.type === 'GO' ? prev.timeout : (prev.isOmission && (prev.expectedFace === 'L' || prev.expectedFace === 'R'));
      if ((prevNoGoFail || prevGoOmission) && rt > 0) {
        const diff = rt - (m.avgTotal || 0);
        postDiffText = diff > 0 ? `+${diff}ms (Ralentización)` : `${diff}ms (Aceleración)`;
      }
    }

    const isNogoFail = type === 'NOGO' ? t.fail : t.isFalseStart;
    const isNogoSuccess = type === 'NOGO' ? !t.fail : (expected !== 'L' && expected !== 'R' && !t.isFalseStart);
    const isGoOmission = type === 'GO' ? t.timeout : (t.isOmission && (expected === 'L' || expected === 'R'));
    const isCommission = type === 'GO' ? t.errors > 0 : (t.firstMoveWrong && !t.isFalseStart && !t.isOmission);

    const actualRt = rt > 0 ? rt : null;
    const finalVal = rt > 0 ? rt : (isNogoFail ? 100 : 2000);

    let rowIdx = 0;
    if (expected === 'L') rowIdx = leftIdx++;
    else if (expected === 'R') rowIdx = rightIdx++;
    else rowIdx = nogoIdx++;

    if (!chartData[rowIdx]) {
      chartData[rowIdx] = {
        name: `Intento ${rowIdx + 1}`,
        baselineAvg: m.avgTotal || 300,
      };
    }

    const cellData = {
      actualRt,
      originalType: type,
      expectedFace: expected,
      fail: t.fail,
      isFalseStart: t.isFalseStart,
      timeout: t.timeout,
      isOmission: t.isOmission,
      errors: t.errors,
      firstMoveWrong: t.firstMoveWrong,
      postDiffText,
      isNogoFail,
      isNogoSuccess,
      isGoOmission,
      isCommission
    };

    if (expected === 'L') {
      chartData[rowIdx].rtLLine = actualRt;
      chartData[rowIdx].rtLEvent = finalVal;
      chartData[rowIdx].rtLEvent_data = cellData;
    } else if (expected === 'R') {
      chartData[rowIdx].rtRLine = actualRt;
      chartData[rowIdx].rtREvent = finalVal;
      chartData[rowIdx].rtREvent_data = cellData;
    } else {
      chartData[rowIdx].rtNOGOLine = actualRt;
      chartData[rowIdx].rtNOGOEvent = finalVal;
      chartData[rowIdx].rtNOGOEvent_data = cellData;
    }
  });

  const chronologicalChartData = (actualTurnsData || []).map((t, idx) => {
    const expected = t.expected || t.expectedFace;
    const rt = t.time || t.reactionTimeMs;
    const type = t.type || (t.isOmission || t.isFalseStart || (expected !== 'L' && expected !== 'R') ? 'NOGO' : 'GO');

    const isNogoFail = type === 'NOGO' ? t.fail : t.isFalseStart;
    const isNogoSuccess = type === 'NOGO' ? !t.fail : (expected !== 'L' && expected !== 'R' && !t.isFalseStart);
    const isGoOmission = type === 'GO' ? t.timeout : (t.isOmission && (expected === 'L' || expected === 'R'));
    const isCommission = type === 'GO' ? t.errors > 0 : (t.firstMoveWrong && !t.isFalseStart && !t.isOmission);

    const actualRt = rt > 0 ? rt : null;
    const finalVal = rt > 0 ? rt : (isNogoFail ? 100 : 2000);

    return {
      name: `T${idx + 1}`,
      rtLine: actualRt,
      rtEvent: finalVal,
      rtEvent_data: {
        actualRt,
        expectedFace: expected,
        isNogoFail, isNogoSuccess, isGoOmission, isCommission
      }
    };
  });

  const filteredChartData = chartData.map(d => {
    const res = { ...d };
    if (chartFilter === 'L') { res.rtRLine = null; res.rtREvent = null; res.rtNOGOLine = null; res.rtNOGOEvent = null; }
    if (chartFilter === 'R') { res.rtLLine = null; res.rtLEvent = null; res.rtNOGOLine = null; res.rtNOGOEvent = null; }
    if (chartFilter === 'NOGO') { res.rtLLine = null; res.rtLEvent = null; res.rtRLine = null; res.rtREvent = null; }
    return res;
  });

  const errorData = [
    { name: 'Impulsividad (No-Go Fallido)', value: m.falseStartCount, fill: '#ef4444' },
    { name: 'Falla Visomotora (Error Cara)', value: m.commissionCount, fill: '#f97316' },
    { name: 'Lapsos Inatención (Omisión)', value: m.omissionCount, fill: '#94a3b8' }
  ];

  // Datos Longitudinales (Línea Base vs Actual/Histórico)
  let longitudinalData = null;
  if (patient && patient.sessions && patient.sessions.length >= 2 && attemptNumber >= 3) {
    // Buscar la línea base (attemptNumber 2)
    const baseSession = patient.sessions.find(s => s.attemptNumber === 2);
    if (baseSession && baseSession.stats) {
      // Comparar promedios
      const baseAvg = Math.round((baseSession.stats.tiempo_promedio_por_mano?.L + baseSession.stats.tiempo_promedio_por_mano?.R) / 2) || baseSession.stats.averageReactionTime || 0;
      
      longitudinalData = patient.sessions
        .filter(s => s.attemptNumber >= 2 && s.attemptNumber <= attemptNumber)
        .sort((a, b) => a.attemptNumber - b.attemptNumber)
        .map(s => {
          const avg = Math.round((s.stats.tiempo_promedio_por_mano?.L + s.stats.tiempo_promedio_por_mano?.R) / 2) || s.stats.averageReactionTime || 0;
          return {
            name: s.attemptNumber === 2 ? 'Línea Base' : `Intento ${s.attemptNumber}`,
            tiempo_promedio: avg,
            baseline: baseAvg
          };
        });
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans p-4 md:p-8 report-container">
      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .report-container { padding: 0 !important; background: white !important; }
          .bg-white { border: 1px solid #e2e8f0 !important; box-shadow: none !important; }
          .bg-slate-800 { background: #1e293b !important; color: white !important; -webkit-print-color-adjust: exact; }
          .text-indigo-600 { color: #4f46e5 !important; }
          .text-emerald-600 { color: #059669 !important; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3 flex-wrap">
            Reporte Reaction Mirror
            {attemptNumber && (
              <span className={`text-sm px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                attemptNumber === 1 ? 'bg-slate-200 text-slate-600' :
                attemptNumber === 2 ? 'bg-indigo-100 text-indigo-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                Intento {attemptNumber} • {clinicalLabel}
              </span>
            )}
            {(Boolean(metrics?.isKeyboardMode) || metrics?.modo_evaluacion === 'teclado_sin_cubo' || Boolean(stats?.isKeyboardMode) || stats?.modo_evaluacion === 'teclado_sin_cubo' || statsJson?.isKeyboardMode || statsJson?.modo_evaluacion === 'teclado_sin_cubo' || (clinicalLabel && clinicalLabel.includes('Modo Teclado'))) && (
              <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                ⌨️ Modo Teclado (Sin Cubo)
              </span>
            )}
          </h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">
            Estudiante: <span className="text-indigo-600 font-bold">{playerName || 'Anónimo'}</span>
            <span className="mx-2 text-slate-300">|</span>
            {formattedDate}
          </p>
          {latencyOffset > 0 ? (
            <p className="text-xs text-emerald-600 mt-1 font-bold flex items-center gap-1">
              <Zap size={12} className="fill-emerald-600" />
              Tiempos compensados (−{latencyOffset} ms) para precisión clínica.
            </p>
          ) : (
            <p className="text-xs text-amber-600 mt-1 font-bold flex items-center gap-1">
              Sin calibrar. Los resultados incluyen latencia de hardware.
            </p>
          )}
          {isDemoData && (
            <p className="text-xs text-indigo-600 mt-1.5 font-bold flex items-center gap-1">
              Usando telemetría de simulación clínica (sin registros atómicos en la base de datos).
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap md:flex-nowrap flex-shrink-0 no-print">
          <button onClick={onRestart} className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 shadow-sm transition-all text-sm">
            Rehacer
          </button>
          <button onClick={handlePrint} className="px-4 py-2 rounded-xl bg-slate-800 font-bold text-white hover:bg-slate-900 shadow-sm transition-all text-sm flex items-center gap-2">
            PDF
          </button>
          <button onClick={handleExportExcel} className="px-4 py-2 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700 shadow-sm transition-all text-sm flex items-center gap-2">
            Excel Clínico
          </button>
          <button onClick={handleExportRawTelemetry} className="px-4 py-2 rounded-xl bg-sky-600 font-bold text-white hover:bg-sky-700 shadow-sm transition-all text-sm flex items-center gap-2" title="Descargar log crudo e inalterable de sensores BLE para auditoría">
            Telemetría Cruda
          </button>
          <button onClick={onExit} className="px-4 py-2 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-700 shadow shadow-indigo-200 transition-all text-sm">
            ← Finalizar
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {longitudinalData && longitudinalData.length > 1 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4">
              <TrendingUp className="text-indigo-500" />
              Evolución Longitudinal vs. Línea Base
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={longitudinalData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} tick={{fontSize: 12, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={50} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" name="Tiempo Promedio (ms)" dataKey="tiempo_promedio" stroke="#4f46e5" strokeWidth={4} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 8 }} />
                  <Line type="monotone" name="Línea Base Reference" dataKey="baseline" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center font-medium">Comparación del tiempo de reacción promedio frente a tu primera evaluación válida (Línea Base).</p>
          </div>
        )}

        {/* ── SECCIÓN 1: 8 TARJETAS DE INSIGHTS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* Card 1: Consistencia Atencional (Variabilidad) - WIDE */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3 md:col-span-2 xl:col-span-2">
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                  <Activity size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Consistencia Atencional</p>
                  <p className={`text-xl font-black leading-tight ${m.consistencyColor}`}>{m.consistencyLevel} {m.consistencyIcon}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Desviación (SD)</p>
                <p className={`text-xl font-black ${m.consistencyColor}`}>{m.stdDev > 0 ? `±${m.stdDev} ms` : '—'}</p>
              </div>
            </div>
            
            <div className="h-32 w-full mt-2 border-t border-slate-50 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.consistenciaData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" hide />
                  <YAxis domain={['auto', 'auto']} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <ReferenceLine y={m.avgTotal} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Bar dataKey="rt" name="Tiempo" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Card 2: Fatiga Cognitiva - WIDE */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3 md:col-span-2 xl:col-span-2">
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Curva de Fatiga</p>
                  <p className={`text-xl font-black leading-tight ${m.fatigueColor}`}>{m.fatigueLevel}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Evolución</p>
                <p className={`text-xl font-black ${m.fatigueColor}`}>{m.fatiguePercent !== 0 ? `${m.fatiguePercent > 0 ? '+' : ''}${m.fatiguePercent}%` : '—'}</p>
              </div>
            </div>
            
            <div className="h-32 w-full mt-2 border-t border-slate-50 pt-3 flex relative">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={m.fatigaData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" hide />
                  <YAxis domain={['auto', 'auto']} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Line type="monotone" name="Mitad 1 (Inicio)" dataKey="m1" stroke="#34d399" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" name="Mitad 2 (Final)" dataKey="m2" stroke="#f87171" strokeWidth={3} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              <div className="absolute top-2 right-2 flex flex-col gap-1 text-[9px] font-bold uppercase bg-white/80 p-1 rounded backdrop-blur">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-emerald-400"></div> Mitad 1</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-red-400"></div> Mitad 2</div>
              </div>
            </div>
          </div>

          {/* Card 3: Perfil de Velocidad */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
              <Brain size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Costo de Inhibición</p>
              <p className="text-sm font-semibold text-slate-600 leading-tight h-10">{pis.interpretation}</p>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-3 mt-auto">
              <StatRow label="Costo de Recuperación" value={pis.postSuccessSlowing_ms !== null ? (pis.postSuccessSlowing_ms > 0 ? `+${pis.postSuccessSlowing_ms} ms` : `${pis.postSuccessSlowing_ms} ms`) : '—'} color="text-indigo-600" />
            </div>
          </div>

          {/* Card 5: Control Inhibitorio */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
              <Activity size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Control Inhibitorio</p>
              <p className={`text-2xl font-black ${m.controlColor}`}>{m.controlCategory}</p>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3 mt-auto">
              <ErrorBadge label="Falsos" count={m.falseStartCount} color={m.falseStartCount > 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-400'} />
              <ErrorBadge label="Omisión" count={m.omissionCount} color={m.omissionCount > 0 ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'} />
            </div>
          </div>

          {/* Card 6: Atención Sostenida */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center text-violet-500">
              <Eye size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Atención Sostenida</p>
              <p className="text-xl font-black text-slate-800 leading-tight">{m.attentionLevel}</p>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-3 mt-auto">
              <StatRow label="Esperas cortas" value={ms(m.avgShort)} color="text-violet-600" />
              <StatRow label="Esperas largas" value={ms(m.avgLong)}  color="text-slate-600" />
            </div>
          </div>

          {/* Card 7: Dominancia Motriz */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
              <Brain size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Dominancia Motriz</p>
              <p className="text-2xl font-black text-slate-800">{m.dominance} {m.dominanceIcon}</p>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-3 mt-auto">
              <StatRow label="Mano Izquierda (L)" value={ms(m.avgLeft)} color="text-red-600" />
              <StatRow label="Mano Derecha (R)"   value={ms(m.avgRight)} color="text-orange-500" />
            </div>
          </div>

          {/* Card 8: Asimetría Motriz */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
              <Zap size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Asimetría Motriz</p>
              <p className={`text-xl font-black leading-tight ${m.asymmetryColor}`}>{m.asymmetryLevel}</p>
            </div>
            <div className="space-y-1 border-t border-slate-100 pt-3 mt-auto">
              <StatRow label="Delta de Lateralidad" value={m.asymmetryDelta !== null ? `${m.asymmetryDelta} ms` : '—'} color={m.asymmetryColor} />
            </div>
          </div>

        </div>

        {/* ── SECCIÓN 2: GRÁFICOS CLINICOS AVANZADOS ── */}
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* CognitiveTimelineChart */}
            <div id="reaction-chart" className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
              <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    Variabilidad Intraindividual (Por Mano)
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Visualiza la consistencia de cada mano por separado.
                  </p>
                </div>
                <div className="flex bg-slate-100 rounded-lg p-1">
                  {['ALL', 'L', 'R', 'NOGO'].map(f => (
                    <button
                      key={f}
                      onClick={() => setChartFilter(f)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                        chartFilter === f ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {f === 'ALL' ? 'Todos' : f === 'L' ? 'Izquierda' : f === 'R' ? 'Derecha' : 'Omisiones'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div style={{ height: '350px', width: '100%' }} className="mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredChartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit=" ms" domain={[0, 2000]} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={m.avgTotal} stroke="#cbd5e1" strokeDasharray="5 5" label={{ position: 'insideTopLeft', value: 'Línea Base', fill: '#94a3b8', fontSize: 12 }} />
                    
                    {/* Líneas continuas solo para aciertos */}
                    <Line type="monotone" dataKey="rtLLine" stroke="#ef4444" strokeWidth={3} dot={false} activeDot={false} connectNulls={true} />
                    <Line type="monotone" dataKey="rtRLine" stroke="#f97316" strokeWidth={3} dot={false} activeDot={false} connectNulls={true} />
                    
                    {/* Eventos (Aciertos, Errores, Omisiones) flotantes sin línea */}
                    <Line type="monotone" dataKey="rtLEvent" stroke="none" dot={<CustomDot />} activeDot={{ r: 6, fill: '#ef4444' }} connectNulls={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="rtREvent" stroke="none" dot={<CustomDot />} activeDot={{ r: 6, fill: '#f97316' }} connectNulls={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="rtNOGOEvent" stroke="none" dot={<CustomDot />} activeDot={{ r: 6, fill: '#64748b' }} connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ErrorTypologyChart */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  Tipología de Errores
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Clasificación clínica de los fallos.
                </p>
              </div>
              
              <div className="h-[250px] w-full flex-1 mt-auto">
                {m.impulsivityErrors > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={110} stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={24} label={{ position: 'right', fill: '#475569', fontWeight: 'bold' }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-emerald-500">
                    <Activity size={48} className="opacity-20 mb-2" />
                    <p className="font-black text-lg">0 Errores</p>
                    <p className="text-xs text-emerald-600/70 uppercase tracking-widest mt-1">Perfil Perfecto</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ChronologicalChart */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col w-full">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                Curva Cronológica de Reacción (Secuencia)
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Visualiza el progreso turno a turno de principio a fin, evidenciando procesos de aprendizaje o fatiga cognitiva.
              </p>
            </div>
            
            <div style={{ height: '350px', width: '100%' }} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chronologicalChartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} unit=" ms" domain={[0, 2000]} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={m.avgTotal} stroke="#cbd5e1" strokeDasharray="5 5" label={{ position: 'insideTopLeft', value: 'Línea Base', fill: '#94a3b8', fontSize: 12 }} />
                  
                  {/* Línea continua solo para aciertos */}
                  <Line type="monotone" dataKey="rtLine" stroke="#6366f1" strokeWidth={3} dot={false} activeDot={false} connectNulls={true} />
                  
                  {/* Puntos de eventos (incluyendo errores y omisiones) */}
                  <Line type="monotone" dataKey="rtEvent" stroke="none" dot={<CustomDot />} activeDot={{ r: 6, fill: '#6366f1' }} connectNulls={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Leyenda del Timeline (Movida aquí abajo para aplicar a ambos gráficos) */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-6 pt-6 border-t border-slate-100 text-[10px] font-bold uppercase text-slate-500">
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Acierto Normal</div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full border-2 border-yellow-500" /> Inhibición Exitosa</div>
              <div className="flex items-center gap-1"><div className="text-red-500 text-xs font-bold font-mono">[X]</div> Impulsividad</div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 bg-orange-500" /> Falla Visomotora</div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Omisión</div>
            </div>
          </div>
        </div>

        {/* BITÁCORA CLÍNICA */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 no-print">
          <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
            Bitácora Clínica (Observación Cualitativa)
          </h2>
          <p className="text-sm text-slate-500 mb-4 font-medium">Registra observaciones cualitativas sobre la conducta, distractores, nivel de ansiedad o fatiga del estudiante durante el test de reacción.</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Escribe aquí observaciones cualitativas para el expediente del alumno..."
            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 font-medium"
            disabled={!recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')}
          />
          <div className="flex justify-between items-center mt-3">
            <span className={`text-xs font-semibold ${saveStatus.includes('éxito') ? 'text-emerald-600' : 'text-rose-600'}`}>
              {saveStatus}
            </span>
            <button
              onClick={handleSaveNote}
              disabled={savingNote || !recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed font-bold rounded-lg text-xs tracking-wider transition-all cursor-pointer text-white"
            >
              {savingNote ? 'Guardando...' : 'GUARDAR OBSERVACIÓN'}
            </button>
          </div>
        </div>

        {/* ── SECCIÓN 3: RADIOGRAFÍA POR TURNOS ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            Radiografía por Turnos
          </h2>
          <div className="space-y-3">
            {(showAllTurns ? actualTurnsData : (actualTurnsData || []).slice(0, 15)).map((t, idx, arr) => {
              const waitSec = (t.waitTimeMs ? t.waitTimeMs / 1000 : 1).toFixed(1);
              let statusText = '', borderLine = '', dot = '';

              const isNogoFail = t.type === 'NOGO' ? t.fail : t.isFalseStart;
              const isGoOmission = t.type === 'GO' ? t.timeout : (t.isOmission && (t.expectedFace === 'L' || t.expectedFace === 'R'));
              const isCommission = t.type === 'GO' ? t.errors > 0 : (t.firstMoveWrong && !t.isFalseStart && !t.isOmission);
              const isCorr = t.type ? (t.status === 'Ok' || t.status === 'Corregido') : t.isCorrect;
              const rt = t.time || t.reactionTimeMs;

              if (isNogoFail) {
                statusText = `Te anticipaste al estímulo. Fallo de inhibición (Impulsividad).`;
                borderLine = 'border-rose-200 bg-rose-50/60';
                dot = 'bg-rose-500';
              } else if (isGoOmission) {
                statusText = 'No respondiste a tiempo (Omisión/Inatención).';
                borderLine = 'border-amber-200 bg-amber-50/60';
                dot = 'bg-amber-500';
              } else if (isCommission) {
                statusText = `Te equivocaste de mano, pero corregiste. Reacción final: ${rt} ms.`;
                borderLine = 'border-blue-200 bg-blue-50/60';
                dot = 'bg-blue-500';
              } else if (!isCorr && t.type !== 'NOGO') {
                statusText = 'Te equivocaste de cara y se acabó el tiempo.';
                borderLine = 'border-red-200 bg-red-50/60';
                dot = 'bg-red-500';
              } else {
                statusText = t.type === 'NOGO' ? 'Inhibición correcta. (Sin movimiento)' : `Acierto. Tiempo de reacción: ${rt} ms.`;
                borderLine = 'border-emerald-100 bg-emerald-50/40';
                dot = 'bg-emerald-500';
              }

              return (
                <div key={idx} className={`flex gap-4 p-4 rounded-xl border ${borderLine} transition-all`}>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                    <div className={`w-3 h-3 rounded-full ${dot}`} />
                    {idx < (arr.length - 1) && <div className="w-px flex-1 bg-slate-200 min-h-[16px]" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-black text-slate-500 text-sm">Turno {t.round || t.turn || idx + 1}</span>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-slate-100 text-slate-700 rounded px-2 py-0.5 font-semibold">
                          Estímulo: {faceName(t.expected || t.expectedFace)}
                        </span>
                        {t.actualFace && (
                          <span className={`rounded px-2 py-0.5 font-semibold ${t.status === 'Ok' || t.status === 'Corregido' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            Girado: {faceName(t.actualFace)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700">{statusText}</p>
                    
                    {/* Bitácora por Ronda */}
                    <div className="mt-2 flex items-center gap-2 no-print">
                      <input
                        type="text"
                        value={roundComments[t.round || t.turn || idx + 1] || ''}
                        placeholder="Agregar nota para este turno..."
                        onChange={(e) => {
                          const val = e.target.value;
                          setRoundComments(prev => ({ ...prev, [t.round || t.turn || idx + 1]: val }));
                        }}
                        onBlur={(e) => handleSaveRoundComment(t.round || t.turn || idx + 1, e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                        disabled={!recordId || String(recordId).startsWith('local-') || String(recordId).startsWith('warmup-')}
                      />
                    </div>
                    {roundComments[t.round || t.turn || idx + 1] && (
                      <p className="text-xs text-indigo-600 font-bold mt-1 bg-indigo-50/50 px-2.5 py-1 rounded-lg border border-indigo-100/50 print-only">
                        Nota del clínico: {roundComments[t.round || t.turn || idx + 1]}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {actualTurnsData.length > 15 && (
            <div className="flex justify-center pt-4 border-t border-slate-100 mt-4 no-print">
              <button
                onClick={() => setShowAllTurns(!showAllTurns)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                {showAllTurns ? 'Mostrar menos' : `Ver más (${actualTurnsData.length - 15} turnos restantes)`}
              </button>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 4: GLOSARIO Y METODOLOGÍA CLÍNICA ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8 mt-6 page-break-before">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            Glosario y Metodología Clínica
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 text-sm text-slate-600">
            <div>
              <h3 className="font-bold text-slate-800 mb-1 text-base">Consistencia Atencional (Variabilidad)</h3>
              <p className="mb-2"><strong>Qué significa:</strong> Mide qué tan estables son los tiempos de reacción a lo largo de la prueba. Tiempos erráticos pueden indicar "microlapsus" de atención, comunes en perfiles como el TDAH.</p>
              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100"><strong>Cálculo:</strong> Desviación Estándar (SD) matemática de todos los tiempos de reacción de los aciertos correctos.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-1 text-base">Curva de Fatiga (Fatiga Cognitiva)</h3>
              <p className="mb-2"><strong>Qué significa:</strong> Evalúa la capacidad de mantener el nivel de alerta. Un decaimiento severo indica que el estudiante pierde el foco sostenido con el paso de los minutos.</p>
              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100"><strong>Cálculo:</strong> Diferencia porcentual entre el tiempo promedio de la primera mitad de los turnos (cronológicamente) vs. la segunda mitad.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-1 text-base">Costo de Inhibición (Post-Inhibitory Slowing)</h3>
              <p className="mb-2"><strong>Qué significa:</strong> El "gasto de batería" cognitivo que sufre el cerebro tras activar el freno inhibitorio (ver un estímulo trampa y no actuar). Demuestra cuánto cuesta volver a la velocidad normal.</p>
              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100"><strong>Cálculo:</strong> Diferencia (ms) entre el tiempo de reacción del turno inmediatamente posterior a un estímulo No-Go y la velocidad promedio base.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-1 text-base">Control Inhibitorio (Impulsividad)</h3>
              <p className="mb-2"><strong>Qué significa:</strong> La capacidad del estudiante de frenar un instinto automático motor. Altos niveles de "Falsos" evidencian una impulsividad significativa.</p>
              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100"><strong>Cálculo:</strong> Sumatoria directa de errores por anticipación en turnos No-Go (Falsos) o falta de reacción (Omisiones).</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-1 text-base">Atención Sostenida (Tolerancia a la Espera)</h3>
              <p className="mb-2"><strong>Qué significa:</strong> Evalúa si el estudiante se dispersa durante los intervalos de espera largos. Tiempos mucho más lentos en esperas largas sugieren dificultad para sostener el foco sin estímulos rápidos.</p>
              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100"><strong>Cálculo:</strong> Comparación del tiempo promedio en turnos con esperas antes de la señal &lt;1.8s frente a esperas &gt;1.8s.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-1 text-base">Asimetría Motriz (Lateralidad)</h3>
              <p className="mb-2"><strong>Qué significa:</strong> Compara la eficiencia de reacción cruzada. Una brecha gigante puede ser un biomarcador de problemas de mielinización en el cuerpo calloso o dificultades de planificación motora.</p>
              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100"><strong>Cálculo:</strong> Delta absoluto (diferencia en milisegundos) entre el tiempo promedio de respuesta de la mano izquierda y derecha.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
