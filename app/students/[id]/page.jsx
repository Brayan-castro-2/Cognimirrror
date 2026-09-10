'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePatientsDB } from '../../../hooks/usePatientsDB';
import StudentEvolutionDashboard from '../../../components/StudentEvolutionDashboard';
import ReactionDashboard from '../../../components/ReactionDashboard';
import MemoryDashboard from '../../../components/MemoryDashboard';
import { ArrowLeft, Activity, Brain, Calendar, Clock, ChevronRight, TrendingUp, Save, Clipboard, Plus, Trash } from 'lucide-react';

function LocalDataRestorer({ studentName, sessions }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    try {
      const localData = localStorage.getItem('cogniMirror_Patients');
      if (localData) {
        const localPatients = JSON.parse(localData);
        const lp = localPatients.find(x => 
          x.name.trim().toLowerCase().includes(studentName.trim().toLowerCase()) || 
          studentName.trim().toLowerCase().includes(x.name.trim().toLowerCase())
        );
        if (lp && lp.sessions) {
          const pending = sessions.filter(ss => {
            const hasCloudTurns = ss.rawTurnsData && ss.rawTurnsData.length > 0;
            if (hasCloudTurns) return false;

            const localSession = lp.sessions.find(ls => 
              ls.testType === ss.testType && 
              (ls.attemptNumber === ss.attemptNumber || Math.abs(new Date(ls.date) - new Date(ss.date)) < 60000)
            );
            return localSession && localSession.rawTurnsData && localSession.rawTurnsData.length > 0;
          });
          setPendingCount(pending.length);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [studentName, sessions]);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage('Parchando base de datos en la nube...');
    try {
      const { supabase } = await import('../../../utils/supabaseClient');
      const localData = localStorage.getItem('cogniMirror_Patients');
      const localPatients = JSON.parse(localData);
      const lp = localPatients.find(x => 
        x.name.trim().toLowerCase().includes(studentName.trim().toLowerCase()) || 
        studentName.trim().toLowerCase().includes(x.name.trim().toLowerCase())
      );

      let successCount = 0;
      for (const ss of sessions) {
        const hasCloudTurns = ss.rawTurnsData && ss.rawTurnsData.length > 0;
        if (hasCloudTurns) continue;

        const localSession = lp.sessions.find(ls => 
          ls.testType === ss.testType && 
          (ls.attemptNumber === ss.attemptNumber || Math.abs(new Date(ls.date) - new Date(ss.date)) < 60000)
        );

        if (localSession && localSession.rawTurnsData && localSession.rawTurnsData.length > 0) {
          const telemetry = localSession.rawTurnsData;
          const statsPayload = {
            ...(ss.stats || {}),
            rawTurnsData: telemetry
          };

          await supabase.from('sesiones_clinicas')
            .update({ estadisticas_json: statsPayload })
            .eq('id', ss.sessionId);

          if (ss.testType === 'reaction') {
            const rows = telemetry.map(t => ({
              id_sesion: ss.sessionId,
              nivel: t.round || t.level || 0,
              tiempo_reaccion_ms: t.time !== undefined ? t.time : (t.latencyMs !== undefined ? t.latencyMs : null),
              cara_esperada: t.expected || t.expectedFace,
              cara_girada: t.actualFace || t.userFace || null,
              es_correcto: t.status === 'Ok' || t.status === 'Corregido' || t.isCorrect || false,
              timestamp_local: new Date(t.timestamp || Date.now()).toISOString()
            }));
            await supabase.from('resultados_juego_reaccion').insert(rows);
          } else if (ss.testType === 'memory') {
            const rows = telemetry.map(t => ({
              id_sesion: ss.sessionId,
              nivel: t.level || 0,
              intento: t.trial || 'A',
              cara_esperada: t.expectedFace || t.expected || null,
              cara_girada: t.userFace || t.actualFace || null,
              es_correcto: t.isCorrect !== undefined ? t.isCorrect : (t.status === 'Ok' || t.status === 'Corregido'),
              latencia_ms: t.latencyMs !== undefined ? t.latencyMs : (t.time || null),
              array_latencias_intra: t.moveLatencies || null,
              tipo_error: t.errorType || null,
              timestamp_local: new Date(t.timestamp || Date.now()).toISOString()
            }));
            await supabase.from('resultados_juego_memoria').insert(rows);
          }
          successCount++;
        }
      }
      setSyncMessage(`¡Completado! Se inyectaron ${successCount} sesiones con éxito.`);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error(e);
      setSyncMessage('Error durante la restauración: ' + e.message);
      setIsSyncing(false);
    }
  };

  if (pendingCount === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 w-full shadow-lg relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
      <div>
        <h3 className="text-amber-400 font-black text-lg flex items-center gap-2">
          Datos Locales de Sesión Detectados
        </h3>
        <p className="text-slate-400 text-sm mt-1">
          Encontramos {pendingCount} sesión(es) en la caché local de este navegador.
        </p>
        {syncMessage && (
          <p className="text-emerald-400 font-bold text-xs mt-2 uppercase tracking-wider animate-pulse">
            {syncMessage}
          </p>
        )}
      </div>
      {!isSyncing && (
        <button 
          onClick={handleSync}
          className="px-5 py-3 bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-black font-black uppercase text-[10px] tracking-widest rounded-xl shrink-0 cursor-pointer"
        >
          Restaurar Datos Locales
        </button>
      )}
    </div>
  );
}

export default function StudentProfileDashboard() {
  const params = useParams();
  const router = useRouter();
  const { getPatient: getStudent, updatePatient: updateStudent } = usePatientsDB();
  const student = getStudent(params.id);

  const [activeTab, setActiveTab] = useState('reaction');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLabel, setFilterLabel] = useState('All');
  
  const [selectedSessionRecord, setSelectedSessionRecord] = useState(null);

  // Formulario Ficha del Alumno (SaaS PIE)
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [diagnosticoNee, setDiagnosticoNee] = useState('');
  const [nuevaObservacion, setNuevaObservacion] = useState('');
  const [historialClinico, setHistorialClinico] = useState([]);
  const [isSavingFicha, setIsSavingFicha] = useState(false);

  useEffect(() => {
    if (student) {
      setFechaNacimiento(student.fechaNacimiento || '');
      setDiagnosticoNee(student.diagnosticoNee || '');
      setHistorialClinico(student.historialClinico || []);
    }
  }, [student]);

  if (!student) {
    return (
      <div className="min-h-screen bg-[#07080f] text-white flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Estudiante no encontrado</h2>
        <button onClick={() => router.push('/students')} className="px-6 py-2 bg-indigo-600 rounded-xl">Volver al Directorio</button>
      </div>
    );
  }

  const handleSaveFicha = async () => {
    setIsSavingFicha(true);
    const updates = {
      fechaNacimiento,
      diagnosticoNee,
      historialClinico
    };
    const ok = await updateStudent(student.id, updates);
    setIsSavingFicha(false);
    if (ok) {
      alert('¡Ficha escolar del estudiante guardada correctamente!');
    } else {
      alert('Error al guardar la ficha del estudiante.');
    }
  };

  const handleAddObservacion = () => {
    if (!nuevaObservacion.trim()) return;
    const newNote = {
      id: `note-${Date.now()}`,
      fecha: new Date().toISOString(),
      nota: nuevaObservacion.trim()
    };
    setHistorialClinico(prev => [newNote, ...prev]);
    setNuevaObservacion('');
  };

  const handleDeleteObservacion = (noteId) => {
    if (confirm('¿Estás seguro de eliminar esta observación del historial?')) {
      setHistorialClinico(prev => prev.filter(n => n.id !== noteId));
    }
  };

  const tabSessions = student.sessions.filter(s => (s.testType || 'reaction') === activeTab);

  const filteredHistory = tabSessions.filter(s => {
    const matchLabel = filterLabel === 'All' || s.clinicalLabel.includes(filterLabel);
    const matchSearch = s.sessionId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        new Date(s.date).toLocaleDateString().includes(searchTerm);
    return matchLabel && matchSearch;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const studentForEvolution = {
    ...student,
    sessions: tabSessions
  };

  return (
    <div className="min-h-screen bg-[#07080f] text-slate-200 font-sans pb-20">
      
      {/* Header Superior */}
      <div className="bg-[#13161e] border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <button onClick={() => router.push('/students')} className="flex items-center gap-2 text-white/40 hover:text-indigo-400 text-sm mb-3 transition-colors cursor-pointer">
              <ArrowLeft size={16} /> Volver al Directorio
            </button>
            <h1 className="text-3xl font-black text-white flex items-center gap-3">
              {student.name}
            </h1>
            <p className="text-slate-400 mt-1">
              Registrado el: {new Date(student.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* TABS (Reaction vs Memory) */}
          <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 w-fit">
            <button 
              onClick={() => setActiveTab('reaction')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${activeTab === 'reaction' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <Activity size={18} /> Reacción
            </button>
            <button 
              onClick={() => setActiveTab('memory')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${activeTab === 'memory' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <Brain size={18} /> Memoria
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LADO IZQUIERDO: DETALLES DE LA SESIÓN Y EVOLUTIVOS (col-8) */}
        <div className="lg:col-span-8 space-y-10">
          
          <LocalDataRestorer studentName={student.name} sessions={tabSessions} />

          {/* Evolutivo */}
          <section>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <TrendingUp size={20} className={activeTab === 'reaction' ? 'text-indigo-400' : 'text-purple-400'} /> 
              Evolución Longitudinal
            </h2>
            <div className="overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-3xl border border-white/10">
              <StudentEvolutionDashboard 
                patient={studentForEvolution} 
                hideHeader={true} 
              />
            </div>
          </section>

          {/* Historial */}
          <section>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Clock size={20} className="text-slate-400" /> Historial de Evaluaciones
              </h2>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  placeholder="Buscar..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#13161e] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-64"
                />
                <select 
                  value={filterLabel}
                  onChange={(e) => setFilterLabel(e.target.value)}
                  className="bg-[#13161e] border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">Todas las etiquetas</option>
                  <option value="Línea Base">Línea Base</option>
                  <option value="Seguimiento">Seguimiento</option>
                  <option value="Familiarización">Familiarización</option>
                </select>
              </div>
            </div>

            <div className="bg-[#13161e] rounded-3xl border border-white/10 overflow-hidden shadow-inner">
              {filteredHistory.length === 0 ? (
                <div className="p-10 text-center text-slate-500">
                  No se encontraron sesiones registradas.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-4 font-semibold">Ensayo</th>
                      <th className="px-6 py-4 font-semibold">Etiqueta PIE</th>
                      <th className="px-6 py-4 font-semibold">Fecha y Hora</th>
                      <th className="px-6 py-4 font-semibold">Rendimiento Promedio</th>
                      <th className="px-6 py-4 font-semibold text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredHistory.map(session => (
                      <tr 
                        key={session.sessionId} 
                        className="hover:bg-white/5 transition-colors group cursor-pointer"
                        onClick={() => setSelectedSessionRecord(session)}
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-white">Evaluación {session.attemptNumber}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                            session.clinicalLabel.includes('Base') ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 
                            session.clinicalLabel.includes('Seguimiento') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          }`}>
                            {session.clinicalLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {new Date(session.date).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-white font-mono">
                            {session.stats?.averageReactionTime || Math.round((session.stats?.tiempo_promedio_por_mano?.L + session.stats?.tiempo_promedio_por_mano?.R) / 2) || '-'} ms
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Ver Análisis <ChevronRight size={14} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

        </div>

        {/* LADO DERECHO: FICHA DE ESTUDIANTE / NEE (col-4) */}
        <div className="lg:col-span-4 space-y-6">
          
          <div className="bg-[#13161e] border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl relative text-left">
            <h3 className="text-lg font-black text-white border-b border-white/5 pb-3 flex items-center gap-2">
              <Clipboard size={18} className="text-indigo-400" />
              Ficha del Alumno PIE
            </h3>

            <div className="space-y-4">
              {/* Fecha Nacimiento */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Fecha de Nacimiento</label>
                <input 
                  type="date"
                  value={fechaNacimiento}
                  onChange={(e) => setFechaNacimiento(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                />
              </div>

              {/* Diagnostico NEE */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Diagnóstico NEE</label>
                <select
                  value={diagnosticoNee}
                  onChange={(e) => setDiagnosticoNee(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="">Seleccione Diagnóstico NEE...</option>
                  <option value="TDAH">TDAH (Déficit Atencional)</option>
                  <option value="TEA">TEA (Espectro Autista)</option>
                  <option value="Funcionamiento Limite">Funcionamiento Límite</option>
                  <option value="DIL">Discapacidad Intelectual Leve</option>
                  <option value="DEA">Dificultad de Aprendizaje (DEA)</option>
                  <option value="Otro">Otro Diagnóstico</option>
                </select>
              </div>

              <button
                onClick={handleSaveFicha}
                disabled={isSavingFicha}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-lg shadow-indigo-600/10"
              >
                <Save size={14} />
                {isSavingFicha ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>

          {/* Historial Clínico de Observaciones */}
          <div className="bg-[#13161e] border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl relative text-left">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-white/5 pb-2">
              Historial de Observaciones
            </h3>

            {/* Crear nueva nota */}
            <div className="space-y-2">
              <textarea
                value={nuevaObservacion}
                onChange={(e) => setNuevaObservacion(e.target.value)}
                placeholder="Añade observaciones cualitativas, conductas atencionales, distractores..."
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-all resize-none placeholder:text-slate-600"
              />
              <button
                onClick={handleAddObservacion}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-[10px] tracking-wider uppercase rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer w-full"
              >
                <Plus size={12} />
                Agregar Nota
              </button>
            </div>

            {/* Listado de notas */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {historialClinico.length === 0 ? (
                <p className="text-slate-600 text-xs italic text-center py-4">No hay notas registradas para este estudiante.</p>
              ) : (
                historialClinico.map((note) => (
                  <div key={note.id} className="bg-black/20 border border-white/5 rounded-xl p-3.5 space-y-1.5 relative group">
                    <button 
                      onClick={() => handleDeleteObservacion(note.id)}
                      className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Eliminar Nota"
                    >
                      <Trash size={12} />
                    </button>
                    <span className="text-[9px] font-mono text-slate-500 block">
                      {new Date(note.fecha).toLocaleDateString()} {new Date(note.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed font-light whitespace-pre-wrap">{note.nota}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* MODAL: Radiografía del Turno */}
      {selectedSessionRecord && (
        <div className="fixed inset-0 z-50 bg-[#07080f] overflow-y-auto">
          {activeTab === 'reaction' ? (
            <ReactionDashboard
              playerName={student.name}
              date={selectedSessionRecord.date}
              rawTurnsData={selectedSessionRecord.rawTurnsData}
              latencyOffset={selectedSessionRecord.stats?.latencyOffset || 0}
              onExit={() => setSelectedSessionRecord(null)}
              recordId={selectedSessionRecord.sessionId}
              attemptNumber={selectedSessionRecord.attemptNumber}
              clinicalLabel={selectedSessionRecord.clinicalLabel}
              patient={student}
              metrics={selectedSessionRecord.metrics || selectedSessionRecord.stats}
              stats={selectedSessionRecord.stats}
            />
          ) : (
            <MemoryDashboard
              record={{
                ...selectedSessionRecord,
                playerName: student.name,
                patient: student
              }}
              onExit={() => setSelectedSessionRecord(null)}
            />
          )}
        </div>
      )}

    </div>
  );
}
