'use client';

import { useState, useEffect } from 'react';
import SimonGame from './SimonGame';
import MemoryDashboard from './MemoryDashboard';
import OnboardingForm from './OnboardingForm';
import TutorialPhase from './TutorialPhase';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { motion, AnimatePresence } from 'framer-motion';
import PasscodeModal from './PasscodeModal';
import { usePatientsDB } from '../hooks/usePatientsDB';
import StudentSelector from './StudentSelector';
import ConfirmModal from './ConfirmModal';
import { Brain, Keyboard } from 'lucide-react';

function CountdownPhase({ onComplete }) {
  const [count, setCount] = useState(3);
  const { isKeyboardMode } = useBluetoothCube();

  useEffect(() => {
    if (count === 0) {
      const timer = setTimeout(() => onComplete(), 600);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onComplete]);

  useEffect(() => {
    const onKey = (e) => {
      if (isKeyboardMode && (e.key === 'Enter' || e.key === ' ')) {
        onComplete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isKeyboardMode, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#07080f]/95 text-white absolute inset-0 z-50">
      <div className="text-center flex flex-col items-center">
        <AnimatePresence mode="wait">
          <motion.h1 
            key={count}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className={`text-[12rem] font-black leading-none drop-shadow-[0_0_40px_rgba(168,85,247,0.5)] ${count === 0 ? 'text-green-400 drop-shadow-[0_0_40px_rgba(74,222,128,0.5)]' : 'text-purple-500'}`}
          >
            {count > 0 ? count : '¡YA!'}
          </motion.h1>
        </AnimatePresence>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 bg-white/5 border border-white/10 p-6 rounded-2xl max-w-lg w-full backdrop-blur-md shadow-2xl"
        >
          <p className="text-xs font-black text-white/50 uppercase tracking-[0.3em] mb-4">Preparación</p>
          <p className="text-xl sm:text-2xl font-bold leading-relaxed text-white/90">
            {isKeyboardMode 
              ? 'Observa atentamente la secuencia en el cubo y luego repítela usando las teclas o los 6 botones de colores.'
              : 'Prepárate... Observa atentamente el cubo y memoriza la secuencia de colores.'}
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function StepMenu({ onNext, onHistory, activePatient, setActivePatientId, patients, createPatient }) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { isConnected, isKeyboardMode, toggleKeyboardMode } = useBluetoothCube();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-10 px-6 text-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/20 blur-[120px]" />
      </div>

      <div className="relative flex flex-col items-center gap-3 sm:gap-4 scale-90 sm:scale-100">
        <Brain size={64} className="text-purple-400 drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]" />
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          Memory{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400">
            Mirror
          </span>
        </h1>
        <p className="text-white/50 text-sm sm:text-lg max-w-[280px] sm:max-w-sm leading-relaxed">
          Evalúa tu memoria visoespacial de trabajo y precisión de movimiento guiado.
        </p>
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col gap-4">
        <StudentSelector 
          patients={patients}
          onSelect={setActivePatientId}
          onCreate={async (name) => {
            const newP = await createPatient(name);
            if (newP && newP.id) setActivePatientId(newP.id);
          }}
        />

        {/* Modo Teclado (Sin Cubo) */}
        <div className={`p-4 rounded-2xl flex flex-col gap-2.5 text-left border transition-all ${
          isKeyboardMode 
            ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]' 
            : 'bg-white/5 border-white/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className={`w-4 h-4 ${isKeyboardMode ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className={`text-xs font-bold ${isKeyboardMode ? 'text-amber-300' : 'text-slate-300'}`}>
                Modo Teclado (Sin Cubo)
              </span>
            </div>
            <button
              type="button"
              onClick={toggleKeyboardMode}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                isKeyboardMode ? 'bg-amber-500 text-black shadow-md' : 'bg-white/10 text-white/50 hover:bg-white/20'
              }`}
            >
              {isKeyboardMode ? 'ACTIVADO' : 'DESACTIVADO'}
            </button>
          </div>
          {isKeyboardMode ? (
            <div className="space-y-1.5 text-[11px] text-amber-200/90 leading-relaxed">
              <p className="font-semibold text-white bg-amber-500/10 p-2 rounded-xl border border-amber-500/20">
                ⌨️ Controles: Usa las teclas (U, D, A, R, F, B o 1 al 6) o haz clic en los 6 botones cromáticos en pantalla para replicar la secuencia.
              </p>
              <p className="text-[10px] text-amber-300/80 font-mono">
                ⚠️ Auditoría Clínica: Esta evaluación quedará guardada indicando explícitamente que se realizó sin cubo mediante teclado.
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ¿No tienes el cubo inteligente a mano? Activa este modo para evaluar usando el teclado y los 6 botones de colores en pantalla.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onNext}
            disabled={!activePatient || !acceptedTerms}
            className={`
              relative group px-10 py-5 rounded-2xl font-bold text-xl text-white
              transition-all duration-200 ease-out shadow-[0_0_40px_rgba(168,85,247,0.4)]
              ${(activePatient && acceptedTerms)
                ? isKeyboardMode 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:shadow-[0_0_60px_rgba(245,158,11,0.6)] hover:scale-105 active:scale-95 text-black cursor-pointer'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-[0_0_60px_rgba(168,85,247,0.6)] hover:scale-105 active:scale-95 cursor-pointer' 
                : 'bg-white/10 text-white/40 cursor-not-allowed shadow-none'}
            `}
          >
            {isKeyboardMode ? 'Iniciar Test (Modo Teclado)' : 'Iniciar Test'}
          </button>

          <button
            onClick={() => onNext('practice')}
            disabled={!activePatient}
            className={`
              w-full py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-[0.2em] transition-all border flex items-center justify-center gap-2
              ${activePatient
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 hover:scale-105 shadow-[0_0_20px_rgba(6,182,212,0.2)] cursor-pointer'
                : 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed shadow-none'}
            `}
          >
            Modo Entrenamiento / Práctica
          </button>

          <button
            onClick={onHistory}
            className="w-full py-4 rounded-2xl font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm uppercase tracking-widest border border-white/5 cursor-pointer"
          >
            Ver Historial Clínico
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center max-w-sm mx-auto gap-3 text-left bg-white/5 border border-white/5 p-4 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border border-white/20 bg-white/5 appearance-none checked:bg-purple-600 checked:border-purple-500 relative flex-shrink-0 transition-colors after:content-['✓'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-white after:font-black after:text-[12px] after:opacity-0 checked:after:opacity-100"
            />
            <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
              Comprendo y Acepto
            </span>
          </label>
          <p className="text-[10px] text-gray-500 leading-relaxed text-justify">
            "Al iniciar esta evaluación, autorizo el procesamiento temporal de mis datos para la generación del Reporte Ejecutivo Neuromotriz. Acepto que mis métricas de interacción sean encriptadas, estrictamente anonimizadas y desvinculadas de mi identidad, para ser utilizadas en total cumplimiento de la Ley N° 19.628 sobre Protección de la Vida Privada."
          </p>
        </div>
      </div>
    </div>
  );
}

function StepHistory({ onBack, onOpenReport, patients, deletePatient, deleteSession }) {
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null, payload: null });

  const confirmDeleteSession = (patientId, sessionId) => {
    setConfirmModal({
      isOpen: true,
      type: 'session',
      payload: { patientId, sessionId },
      title: 'Eliminar Sesión',
      message: '¿Estás seguro de eliminar este registro? Esta acción es irreversible.'
    });
  };

  const confirmDeletePatient = (patientId, name) => {
    setConfirmModal({
      isOpen: true,
      type: 'patient',
      payload: { patientId },
      title: `Eliminar a ${name}`,
      message: '¿Estás seguro de eliminar este estudiante y todas sus sesiones asociadas? Esta acción es irreversible.'
    });
  };

  const handleConfirm = () => {
    if (confirmModal.type === 'session') {
      deleteSession(confirmModal.payload.patientId, confirmModal.payload.sessionId);
    } else if (confirmModal.type === 'patient') {
      deletePatient(confirmModal.payload.patientId);
    }
    setConfirmModal({ isOpen: false, type: null, payload: null });
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen p-6 pt-20 max-w-2xl mx-auto w-full relative">
      <div className="flex items-center justify-between w-full mb-8">
        <h2 className="text-3xl font-black text-white">Historial</h2>
      </div>

      <div className="w-full space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        {patients.length === 0 ? (
          <p className="text-white/30 text-center py-20">No hay estudiantes registrados aún.</p>
        ) : (
          patients.map(patient => (
            <div key={patient.id} className="bg-white/5 border border-white/10 p-5 rounded-2xl flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-bold text-xl">{patient.name}</h3>
                </div>
                <button 
                  onClick={() => confirmDeletePatient(patient.id, patient.name)}
                  className="text-red-500/40 hover:text-red-400 transition-colors p-1"
                  title="Eliminar Estudiante"
                >
                  Eliminar
                </button>
              </div>

              {patient.sessions.filter(s => s.testType === 'memory').length === 0 ? (
                <p className="text-white/30 text-sm italic">Sin sesiones de Memory Mirror.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {patient.sessions.filter(s => s.testType === 'memory').sort((a, b) => new Date(b.date) - new Date(a.date)).map(session => (
                    <div 
                      key={session.sessionId || session.id}
                      className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/5 group hover:border-purple-500/30 transition-all cursor-pointer"
                    >
                      <div className="flex-1" onClick={() => onOpenReport({ ...session, playerName: patient.name, patient })}>
                        <p className="text-purple-400 font-black text-sm uppercase tracking-wide">
                          {session.clinicalLabel}
                        </p>
                        <p className="text-white/40 text-xs">
                          {new Date(session.date).toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right" onClick={() => onOpenReport({ ...session, playerName: patient.name, patient })}>
                          <p className="text-white font-bold text-sm">Corsi: {session.stats?.maxLevelReached || 2}</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); confirmDeleteSession(patient.id, session.id); }}
                          className="opacity-0 group-hover:opacity-100 text-red-500/40 hover:text-red-400 transition-all p-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <button onClick={onBack} className="mt-8 text-white/40 hover:text-white transition-colors font-bold uppercase tracking-widest text-xs cursor-pointer">
        ← Volver al Menú
      </button>

      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, type: null, payload: null })}
      />
    </div>
  );
}

export default function MemoryGameView({ onExit, subjectId, etiquetaEstudio, isWarmupUrl = false, isDemoMode = false }) {
  const [step, setStep] = useState('menu');
  const [isWarmupMode, setIsWarmupMode] = useState(false);
  const { isKeyboardMode } = useBluetoothCube();
  
  const {
    patients,
    activePatientId,
    setActivePatientId,
    createPatient,
    addSession,
    deletePatient,
    deleteSession,
    getPatient
  } = usePatientsDB();

  const activePatient = getPatient(activePatientId);

  const [selectedRecord, setSelectedRecord] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);



  // Efecto de Auto-onboarding para el Modo Evaluador
  useEffect(() => {
    if (!subjectId || patients.length === 0) return;

    const autoOnboarding = async () => {
      // Evitar bucle si ya está seleccionado
      const currentPatient = getPatient(activePatientId);
      if (currentPatient && currentPatient.idSujeto === subjectId) return;

      // Buscar si el paciente ya existe por su idSujeto
      let p = patients.find(x => x.idSujeto === subjectId);
      
      if (!p) {
        // Intentar buscarlo por nombre por si acaso
        p = patients.find(x => x.name.trim().toLowerCase() === `sujeto ${subjectId}`.toLowerCase());
      }

      if (!p) {
        console.log(`[Evaluador] Creando nuevo perfil para sujeto: ${subjectId}`);
        p = await createPatient(`Sujeto ${subjectId}`, subjectId);
      }

      if (p && p.id) {
        setActivePatientId(p.id);
        setIsWarmupMode(isWarmupUrl);
        setSessionStartTime(Date.now());
        setSessionMeta({
          fatiga: 'No',
          sueno: 'Bueno',
          horasSueno: '8',
          medicamentos: 'No',
          observaciones: isWarmupUrl ? 'Sesión de práctica clínica' : 'Evaluación rápida de estudio'
        });
        setStep('playing');
      }
    };

    autoOnboarding();
  }, [subjectId, patients, activePatientId, getPatient, createPatient, setActivePatientId, isWarmupUrl]);

  // Seguridad Modo Kiosco
  const [isPasscodeOpen, setIsPasscodeOpen] = useState(false);
  const [onPasscodeSuccess, setOnPasscodeSuccess] = useState(() => () => {});

  const triggerSecurity = (action) => {
    const isKioscoActive = typeof window !== 'undefined' && localStorage.getItem('cognimirror_kiosco_active') === 'true';
    if (!isKioscoActive) {
      action();
      return;
    }

    setOnPasscodeSuccess(() => () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cognimirror_kiosco_active');
      }
      action();
    });
    setIsPasscodeOpen(true);
  };

  return (
    <div className="relative min-h-screen bg-[#07080f] overflow-hidden font-sans">
      <button
        onClick={() => {
          triggerSecurity(() => {
            if (step === 'view_report' || step === 'history') {
              setStep('menu');
            } else {
              localStorage.removeItem('cognimirror_kiosco_active');
              onExit();
            }
          });
        }}
        className="absolute top-5 left-5 z-50 flex items-center gap-2 px-3 py-2 rounded-lg text-white/40 hover:text-white/80 text-sm hover:bg-white/5 transition-all duration-150 no-print cursor-pointer"
      >
        ← Volver
      </button>

      {step === 'menu' && (
        <StepMenu 
          onNext={(mode) => {
            if (typeof window !== 'undefined') {
              localStorage.setItem('cognimirror_kiosco_active', 'true');
            }
            setSessionStartTime(Date.now());
            if (mode === 'practice') {
              setIsWarmupMode(true);
              setSessionMeta({ observaciones: 'Sesión de Entrenamiento / Práctica' });
              setStep('playing');
            } else {
              setIsWarmupMode(false);
              setStep('tutorial');
            }
          }} 
          onHistory={() => setStep('history')}
          activePatient={activePatient}
          setActivePatientId={setActivePatientId}
          patients={patients}
          createPatient={createPatient}
        />
      )}

      {step === 'history' && (
        <StepHistory 
          onBack={() => setStep('menu')} 
          onOpenReport={(record) => {
            setSelectedRecord(record);
            setStep('view_report');
          }} 
          patients={patients}
          deletePatient={deletePatient}
          deleteSession={deleteSession}
        />
      )}

      {step === 'view_report' && selectedRecord && (
        <MemoryDashboard
          record={selectedRecord}
          onRestart={() => triggerSecurity(() => setStep('menu'))}
          onExit={() => triggerSecurity(() => setStep('history'))}
        />
      )}

      {step === 'tutorial' && (
        <TutorialPhase onCompleteTutorial={() => setStep('questions')} />
      )}
      
      {step === 'questions' && (
        <OnboardingForm 
          playerName={activePatient?.name || 'Estudiante'} 
          onComplete={(data) => { 
            setSessionMeta(data); 
            setStep('playing'); 
          }} 
        />
      )}

      {step === 'playing' && (
        <SimonGame
          playerName={activePatient?.name || 'Estudiante'}
          sessionMeta={sessionMeta}
          sessionStartTime={sessionStartTime}
          isDemoMode={isDemoMode}
          onExit={async (record) => { 
            if (record) {
              const enrichedRecord = { ...record, playerName: activePatient?.name };
              
              if (!isWarmupMode) {
                // Guardar la sesión automáticamente con soporte de estudio y sujeto
                const baseLabel = etiquetaEstudio ? 'Evaluación Oficial' : (sessionMeta?.clinicalLabel || 'Línea Base');
                const finalClinicalLabel = baseLabel + (isKeyboardMode ? ' [Modo Teclado - Sin Cubo]' : '');

                const saved = await addSession(activePatientId, {
                  testType: 'memory',
                  attemptNumber: sessionMeta?.attemptNumber || 1,
                  clinicalLabel: finalClinicalLabel,
                  etiquetaEstudio: etiquetaEstudio,
                  idSujeto: subjectId || (activePatient?.idSujeto || null),
                  stats: {
                    ...record.metrics,
                    isKeyboardMode: !!isKeyboardMode,
                    modo_evaluacion: isKeyboardMode ? 'teclado_sin_cubo' : 'cubo_bluetooth',
                    cubo_conectado: !isKeyboardMode
                  },
                  telemetry: record.telemetry,
                  date: new Date().toISOString()
                });
                if (saved && saved.sessionId) {
                  enrichedRecord.sessionId = saved.sessionId;
                }
              } else {
                console.log('[Práctica] Sesión de práctica finalizada. No se guarda en Supabase.');
              }

              setSelectedRecord(enrichedRecord);
              setStep('view_report');
            } else {
              // Si aborta el juego a mitad de camino, requerir PIN de supervisor
              triggerSecurity(() => {
                localStorage.removeItem('cognimirror_kiosco_active');
                if (subjectId) {
                  window.location.href = `/evaluador?subjectId=${subjectId}`;
                } else {
                  setStep('menu'); 
                }
                setSessionMeta(null);
              });
            }
          }}
        />
      )}

      {/* Modal de Kiosco */}
      <PasscodeModal
        isOpen={isPasscodeOpen}
        onClose={() => setIsPasscodeOpen(false)}
        onVerify={onPasscodeSuccess}
      />
    </div>
  );
}
