'use client'; // Necesario en Next.js App Router

import ReactionGame from './ReactionGame';
import ExecutiveReport from './ExecutiveReport';
import ReactionDashboard from './ReactionDashboard';
import OnboardingForm from './OnboardingForm';
import TutorialPhase from './TutorialPhase';
import Cube3DViewer from './Cube3DViewer';
import FreeCubeExplorer from './FreeCubeExplorer';
import PreTestModal from './PreTestModal';
import QuickInsightsModal from './QuickInsightsModal';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PasscodeModal from './PasscodeModal';
import { usePatientsDB } from '../hooks/usePatientsDB';
import StudentSelector from './StudentSelector';
import ConfirmModal from './ConfirmModal';
import StudentEvolutionDashboard from './StudentEvolutionDashboard';
import { Zap, Sparkles, Compass, Hand, Activity, ArrowRight, Play, ShieldCheck, CheckCircle2, History, Keyboard } from 'lucide-react';

function CountdownPhase({ onComplete, gameMode = 'official' }) {
  const [phase, setPhase] = useState('waiting');
  const [count, setCount] = useState(3);
  const { subscribeToMoves, isKeyboardMode } = useBluetoothCube();
  const moveHistory = useRef([]);

  useEffect(() => {
    if (phase !== 'counting') return;
    if (count === 0) {
      const timer = setTimeout(() => onComplete(), 600);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, phase, onComplete]);

  useEffect(() => {
    if (phase === 'counting') return;
    const unsub = subscribeToMoves((movimiento) => {
      const now = Date.now();
      moveHistory.current.push({ m: movimiento, t: now });
      moveHistory.current = moveHistory.current.filter(x => now - x.t < 3500);

      const lTotal = moveHistory.current.filter(x => x.m === 'L' || x.m === "L'").length;
      if (lTotal >= 2) {
        setPhase('counting');
      }
    });
    return unsub;
  }, [subscribeToMoves, phase]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' || (isKeyboardMode && (e.key === ' ' || e.key === 'Spacebar'))) {
        setPhase('counting');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isKeyboardMode]);

  const isLevel2 = gameMode === 'single_face';
  const isLevel3 = gameMode === 'bilateral_pure';
  const isLevel4 = gameMode === 'official';

  return (
    <div className="flex flex-col items-center justify-start min-h-[100dvh] py-12 overflow-y-auto overflow-x-hidden bg-[#07080f]/95 text-white absolute inset-0 z-50">
      <div className="text-center flex flex-col items-center my-auto">
        {phase === 'waiting' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center w-full max-w-2xl px-4"
          >
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-[0.1em] mb-3 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              REGLAS DEL TEST
            </h1>
            <p className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-widest mb-8">
              {isLevel2 && 'NIVEL 2 // TIEMPO DE REACCIÓN SIMPLE (1 CARA)'}
              {isLevel3 && 'NIVEL 3 // VELOCIDAD Y COORDINACIÓN BIMANUAL (2 CARAS)'}
              {isLevel4 && 'NIVEL 4 // REACTION MIRROR CLÍNICO (GO / NO-GO)'}
            </p>

            <div className="w-full flex flex-col gap-4 mb-10">
              {/* Regla Rojo (Mano Izquierda) - Presente en todos los niveles */}
              <div className="flex items-center gap-6 bg-[#111218] border border-white/5 rounded-2xl p-5 shadow-lg">
                <div className="w-14 h-14 rounded-xl bg-red-600 shadow-[0_0_20px_rgba(220,38,38,0.4)] flex-shrink-0 flex items-center justify-center text-white font-black text-lg">
                  {isKeyboardMode ? (isLevel2 ? 'ESP' : 'A') : ''}
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="text-red-500 font-black tracking-widest uppercase mb-1">
                    SI ES ROJO {isKeyboardMode && (isLevel2 ? '→ BARRA ESPACIADORA O TECLA A' : '→ TECLA A')}
                  </span>
                  <span className="text-white/80 text-sm font-medium">
                    {isKeyboardMode 
                      ? (isLevel2 ? 'Presiona la BARRA ESPACIADORA o tecla A (o clic en pantalla) lo más rápido posible.' : 'Presiona la tecla A (Mano Izquierda) o botón Rojo en pantalla lo más rápido posible.')
                      : 'Gira la cara ROJA (Mano Izquierda) lo más rápido posible.'}
                  </span>
                </div>
              </div>

              {/* Regla Naranjo (Mano Derecha) - Presente en Nivel 3 y 4 */}
              {(isLevel3 || isLevel4) && (
                <div className="flex items-center gap-6 bg-[#111218] border border-white/5 rounded-2xl p-5 shadow-lg">
                  <div className="w-14 h-14 rounded-xl bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)] flex-shrink-0 flex items-center justify-center text-white font-black text-lg">
                    {isKeyboardMode ? 'L' : ''}
                  </div>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-orange-500 font-black tracking-widest uppercase mb-1">
                      SI ES NARANJO {isKeyboardMode && '→ TECLA L'}
                    </span>
                    <span className="text-white/80 text-sm font-medium">
                      {isKeyboardMode
                        ? 'Presiona la tecla L (Mano Derecha) o botón Naranja en pantalla lo más rápido posible.'
                        : 'Gira la cara NARANJA (Mano Derecha) lo más rápido posible.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Regla No-Go Naranjo (Cara contraria) - ÚNICAMENTE para Nivel 2 */}
              {isLevel2 && (
                <div className="flex items-center gap-6 bg-[#111218] border border-white/5 rounded-2xl p-5 shadow-lg">
                  <div className="w-14 h-14 rounded-xl bg-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)] flex-shrink-0 flex items-center justify-center text-black font-black text-xl">
                    ✋
                  </div>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-orange-400 font-black tracking-widest uppercase mb-1">SI ES NARANJO (CARA CONTRARIA)</span>
                    <span className="text-red-400 font-black text-sm uppercase">
                      {isKeyboardMode 
                        ? '¡NO PRESIONES NINGUNA TECLA! INHIBE TU RESPUESTA (NO-GO).'
                        : '¡NO MUEVAS NADA! INHIBE TU RESPUESTA (NO-GO).'}
                    </span>
                  </div>
                </div>
              )}

              {/* Regla No-Go (Azul/Verde) - ÚNICAMENTE presente en Nivel 4 */}
              {isLevel4 && (
                <div className="flex items-center gap-6 bg-[#111218] border border-white/5 rounded-2xl p-5 shadow-lg">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-b from-blue-400 to-emerald-400 shadow-[0_0_20px_rgba(147,197,253,0.3)] flex-shrink-0 flex items-center justify-center text-black font-black text-xl">
                    ✋
                  </div>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-blue-400 font-black tracking-widest uppercase mb-1">SI ES OTRO COLOR (AZUL / VERDE)</span>
                    <span className="text-red-400 font-black text-sm uppercase">
                      {isKeyboardMode
                        ? '¡NO PRESIONES NINGUNA TECLA! INHIBE TU RESPUESTA MOTOR.'
                        : '¡NO MUEVAS NADA! INHIBE TU RESPUESTA MOTOR.'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmación */}
            {isKeyboardMode ? (
              <div className="w-full bg-[#181309] border border-amber-500/40 rounded-2xl p-6 flex flex-col items-center shadow-lg">
                <span className="text-amber-400 font-black tracking-[0.2em] text-[10px] uppercase mb-1 flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5" />
                  Modo Teclado (Sin Cubo) Activo
                </span>
                <span className="text-white font-black text-lg md:text-xl uppercase tracking-wide text-center">
                  PRESIONA ENTER O ESPACIO PARA COMENZAR
                </span>
                <span className="text-[11px] text-amber-300/70 font-mono mt-1">
                  ⚠️ Esta evaluación se guardará con la indicación clínica de realizada con teclado.
                </span>
                <button 
                  onClick={() => setPhase('counting')} 
                  className="mt-4 px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 cursor-pointer"
                >
                  Comenzar Evaluación con Teclado →
                </button>
              </div>
            ) : (
              <>
                <div className="w-full bg-[#0a0b10] border border-red-500/20 rounded-2xl p-6 flex flex-col items-center">
                  <span className="text-red-500/80 font-black tracking-[0.2em] text-[10px] uppercase mb-2">Confirmar Lectura</span>
                  <span className="text-white/80 font-black text-lg md:text-xl uppercase tracking-wide text-center">
                    MUEVE 2 VECES LA CARA ROJA (L2)<br/>O PRESIONA ENTER PARA COMENZAR
                  </span>
                </div>
                
                <button onClick={() => setPhase('counting')} className="mt-6 opacity-40 text-xs hover:opacity-100 transition-opacity uppercase tracking-widest border border-white/20 px-6 py-2.5 rounded-full font-bold cursor-pointer">
                  Comenzar Manualmente →
                </button>
              </>
            )}
          </motion.div>
        ) : (
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
        )}
        
        {phase === 'counting' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 bg-white/5 border border-white/10 p-6 rounded-2xl max-w-lg w-full backdrop-blur-md shadow-2xl"
          >
            <p className="text-xs font-black text-white/50 uppercase tracking-[0.3em] mb-4">Preparación Motora</p>
            <p className="text-xl sm:text-2xl font-bold leading-relaxed text-white/90">
              Recuerda: Cara <span className="text-red-400 font-black">ROJA</span> a tu mano <span className="underline decoration-red-400/50 underline-offset-4">Izquierda</span>,<br/>
              Cara <span className="text-orange-400 font-black">NARANJA</span> a tu mano <span className="underline decoration-orange-400/50 underline-offset-4">Derecha</span>.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── ESTADO 1: CONFIGURACIÓN Y LANZAMIENTO DE PROTOCOLO ─────────────────────
function StepMenu({ 
  onStartLevel,
  onStartWarmup,
  onStartFreeExplore,
  onHistory, 
  activePatient, 
  setActivePatientId, 
  patients, 
  createPatient, 
  omissionTimeoutMs, 
  setOmissionTimeoutMs,
  gameMode = 'official'
}) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const {
    isConnected,
    latencyOffset,
    isKeyboardMode,
    toggleKeyboardMode
  } = useBluetoothCube();

  // Mapeo del protocolo seleccionado desde el Dashboard
  const activeProtocolMeta = {
    free: {
      code: 'PROTOCOLO 01 // EXPLORACIÓN HÁPTICA',
      title: 'Nivel 1: Exploración Libre y Calentamiento',
      desc: 'Verificación de conectividad BLE, reconocimiento háptico del hardware y familiarización sin presión temporal.',
      duration: 'LIBRE',
      color: 'emerald',
      metrics: ['Familiarización BLE', 'Rotaciones Hápticas', 'Sin Presión Temporal']
    },
    single_face: {
      code: 'PROTOCOLO 02 // CONTROL INHIBITORIO',
      title: 'Nivel 2: Go / No-Go Unilateral (1 Cara)',
      desc: 'Evaluación de latencia motriz primaria y control inhibitorio unilateral mediante discriminación Go (Naranja) / No-Go (Azul).',
      duration: '20 ENSAYOS',
      color: 'purple',
      metrics: ['Latencia Motriz (ms)', 'Freno Inhibitorio (Go/No-Go)', 'Error de Comisión']
    },
    bilateral_pure: {
      code: 'PROTOCOLO 03 // BIMANUALIDAD PURA',
      title: 'Nivel 3: Bilateralidad y Alternancia Motora',
      desc: 'Medición de coordinación interhemisférica bimanual pura y asimetría de tiempo de reacción (Mano Izquierda vs Derecha).',
      duration: '24 ENSAYOS',
      color: 'indigo',
      metrics: ['Asimetría Hemisférica', 'Velocidad Pura (ms)', 'Consistencia Ritmo']
    },
    official: {
      code: 'PROTOCOLO 04 // CLÍNICO OFICIAL',
      title: 'Nivel 4: Reaction Mirror (Batería Completa)',
      desc: 'Batería clínica estandarizada de funciones ejecutivas: atención sostenida, control mixto Go/No-Go y curva de fatiga atencional.',
      duration: '40 ENSAYOS (~3 MIN)',
      color: 'pink',
      metrics: ['Latencia Media (ms)', 'Desviación Estándar (SD)', 'Costo de Inhibición', 'Fatiga Atencional']
    }
  }[gameMode] || {
    code: 'PROTOCOLO 04 // CLÍNICO OFICIAL',
    title: 'Nivel 4: Reaction Mirror (Batería Completa)',
    desc: 'Batería clínica estandarizada de funciones ejecutivas: atención sostenida, control mixto Go/No-Go y curva de fatiga atencional.',
    duration: '40 ENSAYOS (~3 MIN)',
    color: 'pink',
    metrics: ['Latencia Media (ms)', 'Desviación Estándar (SD)', 'Costo de Inhibición', 'Fatiga Atencional']
  };

  const handleLaunch = () => {
    if (gameMode === 'free') {
      onStartFreeExplore();
    } else {
      onStartLevel(gameMode);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 py-12 px-6 text-center max-w-xl mx-auto">
      {/* Brillo ambiental decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-indigo-600/15 blur-[120px]" />
      </div>

      {/* Encabezado del Protocolo Activo */}
      <div className="relative flex flex-col items-center gap-2">
        <div className="px-3 py-1 rounded-md bg-indigo-950/70 border border-indigo-800/80 text-indigo-300 text-[11px] font-mono font-semibold uppercase tracking-wider">
          {activeProtocolMeta.code}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          {activeProtocolMeta.title}
        </h1>
        <p className="text-white/60 text-xs max-w-md leading-relaxed">
          {activeProtocolMeta.desc}
        </p>
      </div>

      {/* Latency Status Badge */}
      <div className="relative z-10 -mt-1">
        {latencyOffset > 0 ? (
          <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest font-mono">
              Offset Calibrado: −{latencyOffset}ms
            </span>
          </div>
        ) : (
          <div className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest font-mono">
              Hardware Precisión Estándar
            </span>
          </div>
        )}
      </div>

      <div className="relative z-10 w-full flex flex-col gap-4">
        {/* Selector de Estudiante (Obligatorio) */}
        <StudentSelector 
          patients={patients}
          activePatientId={activePatient?.id}
          onSelect={setActivePatientId}
          onCreate={async (patientData) => {
            const newP = await createPatient(patientData);
            if (newP && newP.id) setActivePatientId(newP.id);
          }}
        />

        {/* Configuración de Tiempo de Omisión (Evaluador) */}
        <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex flex-col items-start gap-1.5 text-left">
          <label className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
            Límite de Omisión por Ensayo (Evaluador)
          </label>
          <div className="grid grid-cols-4 gap-1.5 w-full">
            {[800, 1000, 1200, 1500].map((timeVal) => (
              <button
                key={timeVal}
                type="button"
                onClick={() => setOmissionTimeoutMs(timeVal)}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  omissionTimeoutMs === timeVal
                    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 shadow-[0_0_10px_rgba(99,102,241,0.3)]'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                {timeVal / 1000}s {timeVal === 1200 ? '(Std)' : ''}
              </button>
            ))}
          </div>
        </div>

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
                {gameMode === 'single_face'
                  ? '⌨️ Controles: BARRA ESPACIADORA o tecla A cuando sea ROJO. Si es Naranjo (No-Go), ¡inhibe y no presiones nada!'
                  : '⌨️ Controles: Tecla A para ROJO (Mano Izquierda) y tecla L para NARANJA (Mano Derecha). En No-Go, ¡no presiones nada!'}
              </p>
              <p className="text-[10px] text-amber-300/80 font-mono">
                ⚠️ Auditoría Clínica: Esta evaluación quedará guardada indicando explícitamente que se realizó sin cubo mediante teclado.
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-slate-400 leading-relaxed">
              ¿No tienes el cubo inteligente a mano o se quedó sin batería? Activa este modo para evaluar usando el teclado y controles en pantalla.
            </p>
          )}
        </div>

        {/* Disclaimer Legal Ley N° 19.628 */}
        <div className="flex flex-col items-center w-full gap-2 text-left bg-white/5 border border-white/5 p-3.5 rounded-xl">
          <label className="flex items-start gap-2.5 cursor-pointer group w-full">
            <input 
              type="checkbox" 
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border border-white/20 bg-white/5 appearance-none checked:bg-indigo-600 checked:border-indigo-500 relative flex-shrink-0 transition-colors after:content-['✓'] after:absolute after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:text-white after:font-black after:text-[10px] after:opacity-0 checked:after:opacity-100"
            />
            <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
              Comprendo y Acepto Términos de Evaluación Clínica
            </span>
          </label>
          <p className="text-[10px] text-slate-400 leading-relaxed text-justify">
            "Al iniciar esta evaluación, autorizo el procesamiento temporal de datos de telemetría neuromotriz bajo la Ley N° 19.628 de Protección de la Vida Privada."
          </p>
        </div>

        {/* Botón Principal de Lanzamiento de Prueba */}
        <button
          onClick={handleLaunch}
          disabled={!activePatient || !acceptedTerms}
          className={`w-full py-4 px-6 rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
            activePatient && acceptedTerms
              ? isKeyboardMode 
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/30' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
              : 'bg-white/5 text-white/30 border border-white/5 cursor-not-allowed'
          }`}
        >
          {isKeyboardMode ? <Keyboard className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          <span>{isKeyboardMode ? 'Iniciar Protocolo (Modo Teclado)' : 'Iniciar Protocolo de Evaluación'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Acciones Secundarias */}
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={onStartWarmup}
            disabled={!activePatient || !acceptedTerms}
            className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border ${
              activePatient && acceptedTerms
                ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400 cursor-pointer'
                : 'bg-white/5 border-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            Calentamiento (15s)
          </button>

          <button
            onClick={onHistory}
            className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/5 border border-white/10 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            <span>Ver Historial</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ESTADO: HISTORIAL ──────────────────────────────────────
function StepHistory({ onBack, onOpenReport, onOpenEvolution, patients, deletePatient, deleteSession }) {
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
                  {patient.sessions.length >= 2 && (
                    <button 
                      onClick={() => onOpenEvolution(patient)}
                      className="px-3 py-1 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/40 hover:text-white rounded-full text-xs font-bold transition-colors flex items-center gap-1 border border-indigo-500/30"
                    >
                      Ver Evolución Clínica
                    </button>
                  )}
                </div>
                <button 
                  onClick={() => confirmDeletePatient(patient.id, patient.name)}
                  className="text-red-400 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-colors"
                  title="Eliminar Estudiante"
                >
                  Eliminar
                </button>
              </div>
              
              {patient.sessions.length === 0 ? (
                 <p className="text-white/30 text-sm">Sin sesiones.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {patient.sessions.map(session => (
                    <div 
                      key={session.sessionId}
                      className="bg-black/20 p-3 rounded-xl flex items-center justify-between hover:bg-white/5 transition-all group"
                    >
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => onOpenReport({...session, playerName: patient.name, patient})}
                      >
                        <p className="text-white font-semibold text-sm">Intento {session.attemptNumber} <span className="text-purple-400 text-xs ml-2">({session.clinicalLabel})</span></p>
                        <p className="text-white/40 text-[10px] mt-1">{new Date(session.date).toLocaleDateString()} · Promedio: {Math.round((session.stats?.tiempo_promedio_por_mano?.L + session.stats?.tiempo_promedio_por_mano?.R) / 2) || session.stats?.averageReactionTime || 0} ms</p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); confirmDeleteSession(patient.id, session.sessionId); }}
                        className="text-red-400/50 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Eliminar Sesión"
                      >
                        Eliminar
                      </button>
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

// Mapeo de modo de juego a número de nivel para el PreTestModal
const LEVEL_NUMBER_MAP = { free: 1, single_face: 2, bilateral_pure: 3, official: 4 };

export default function ReactionGameView({ onExit, onGameReady, subjectId, etiquetaEstudio, isWarmupUrl = false, isDemoMode = false, initialLevel = null }) {
  const [step, setStep] = useState(initialLevel === 'free' ? 'free_explore' : 'menu');
  const [isWarmupMode, setIsWarmupMode] = useState(false);
  const [preTestLevel, setPreTestLevel] = useState(4); // Nivel para el PreTestModal
  const [gameMode, setGameMode] = useState(
    initialLevel === 'single_face' ? 'single_face' : 
    (initialLevel === 'bilateral_pure' ? 'bilateral_pure' : 'official')
  );
  
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
  const [selectedEvolutionPatient, setSelectedEvolutionPatient] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [omissionTimeoutMs, setOmissionTimeoutMs] = useState(1200); // 1.2s por defecto recomendados por evaluador

  const handleStartLevel = (mode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cognimirror_kiosco_active', 'true');
    }
    setGameMode(mode);
    setIsWarmupMode(false);
    setSessionStartTime(Date.now());
    setPreTestLevel(LEVEL_NUMBER_MAP[mode] || 4);
    // Todos los niveles pasan por PreTestModal primero
    setStep('pre_test');
  };

  const handleStartFreeExplore = () => {
    setStep('free_explore');
  };



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
        setStep('countdown');
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

  function handleOpenReport(sessionRecord) {
    setSelectedRecord(sessionRecord);
    setStep('view_report');
  }

  return (
    <div className="relative min-h-screen bg-[#07080f] overflow-hidden font-sans">
      {step !== 'free_explore' && (
        <button
          onClick={() => {
            triggerSecurity(() => {
              if (step === 'view_report' || step === 'patient_evolution' || step === 'history') {
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
      )}

      {step === 'menu' && (
        <StepMenu 
          omissionTimeoutMs={omissionTimeoutMs}
          setOmissionTimeoutMs={setOmissionTimeoutMs}
          onStartLevel={handleStartLevel}
          onStartFreeExplore={handleStartFreeExplore}
          onStartWarmup={() => {
            if (typeof window !== 'undefined') {
              localStorage.setItem('cognimirror_kiosco_active', 'true');
            }
            setGameMode('warmup');
            setIsWarmupMode(true);
            setSessionStartTime(Date.now());
            setStep('countdown');
          }}
          onHistory={() => setStep('history')}
          activePatient={activePatient}
          setActivePatientId={setActivePatientId}
          patients={patients}
          createPatient={createPatient}
          gameMode={gameMode}
        />
      )}

      {step === 'free_explore' && (
        <FreeCubeExplorer 
          onBack={onExit} 
          onSelectLevel={(lvl) => handleStartLevel(lvl)} 
        />
      )}

      {step === 'history' && (
        <StepHistory 
          onBack={() => setStep('menu')} 
          onOpenReport={handleOpenReport} 
          onOpenEvolution={(p) => {
            setSelectedEvolutionPatient(p);
            setStep('patient_evolution');
          }}
          patients={patients}
          deletePatient={deletePatient}
          deleteSession={deleteSession}
        />
      )}

      {step === 'patient_evolution' && selectedEvolutionPatient && (
        <StudentEvolutionDashboard 
          patient={selectedEvolutionPatient} 
          onBack={() => triggerSecurity(() => setStep('history'))} 
        />
      )}

      {step === 'view_report' && selectedRecord && (
        <ReactionDashboard
          playerName={selectedRecord.playerName}
          date={selectedRecord.date}
          rawTurnsData={selectedRecord.rawTurnsData}
          latencyOffset={selectedRecord.stats?.latencyOffset || 0}
          onRestart={() => triggerSecurity(() => setStep('menu'))}
          onExit={() => triggerSecurity(() => setStep('history'))}
          recordId={selectedRecord.sessionId}
          attemptNumber={selectedRecord.attemptNumber}
          clinicalLabel={selectedRecord.clinicalLabel}
          patient={selectedRecord.patient}
          metrics={selectedRecord.metrics || selectedRecord.stats}
          stats={selectedRecord.stats}
        />
      )}

      {/* PreTestModal: Instrucciones y Calibración antes de cada nivel */}
      {step === 'pre_test' && (
        <PreTestModal
          level={preTestLevel}
          onStart={() => {
            // Nivel 4 pasa por tutorial extra y onboarding
            if (preTestLevel === 4) {
              setStep('tutorial');
            } else {
              setStep('countdown');
            }
          }}
          onCancel={() => {
            localStorage.removeItem('cognimirror_kiosco_active');
            setStep('menu');
          }}
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
            setStep('countdown'); 
          }} 
        />
      )}
      {step === 'countdown' && (
        <CountdownPhase gameMode={gameMode} onComplete={() => setStep('playing')} />
      )}
      {step === 'quick_insights' && selectedRecord && (
        <QuickInsightsModal
          isOpen={true}
          onClose={() => triggerSecurity(() => setStep('menu'))}
          onOpenFullReport={() => setStep('view_report')}
          metrics={{
            averageReactionTime: selectedRecord.stats?.averageReactionTime || selectedRecord.stats?.tiempo_total || 395,
            sdReactionTime: selectedRecord.stats?.sdReactionTime || 34,
            inhibitoryControl: selectedRecord.stats?.inhibitoryControl !== undefined ? selectedRecord.stats.inhibitoryControl : 92,
            nogoFails: selectedRecord.stats?.nogoFails || 0,
            nogoTotal: selectedRecord.stats?.nogoTotal || 4,
            dominanceHand: selectedRecord.stats?.tiempo_promedio_por_mano?.L < selectedRecord.stats?.tiempo_promedio_por_mano?.R ? 'Mano Izquierda (Rojo)' : 'Mano Derecha (Naranja)',
            asymmetryDelta: selectedRecord.stats?.asymmetryDelta || 45,
            levelTitle: selectedRecord.clinicalLabel || 'Evaluación Oficial Reaction Mirror',
            patientName: selectedRecord.playerName || activePatient?.name || 'Estudiante'
          }}
        />
      )}

      {step === 'playing' && (
        <ReactionGame
          omissionTimeoutMs={omissionTimeoutMs}
          onExit={(savedSession, patientObj) => { 
            if (savedSession) {
              setSelectedRecord({ 
                ...savedSession, 
                playerName: activePatient?.name || patientObj?.name || 'Estudiante', 
                patient: patientObj || activePatient 
              });
              setStep('quick_insights');
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
          activePatientId={activePatientId}
          addSession={addSession}
          getPatient={getPatient}
          sessionMeta={sessionMeta}
          sessionStartTime={sessionStartTime}
          isWarmup={isWarmupMode}
          isDemoMode={isDemoMode}
          gameMode={gameMode}
          etiquetaEstudio={etiquetaEstudio}
          idSujeto={subjectId}
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
