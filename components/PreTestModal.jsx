'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import Cube3DViewer from './Cube3DViewer';
import {
  Bluetooth,
  BluetoothOff,
  Battery,
  Compass,
  Hand,
  Activity,
  Zap,
  Brain,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ShieldCheck,
  Volume2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

// ─── Configuración por Nivel ────────────────────────────────────────
const LEVEL_CONFIG = {
  1: {
    title: 'Exploración Libre y Calentamiento',
    icon: Compass,
    color: 'emerald',
    objective: 'Familiarización háptica con el cubo inteligente, verificación de conexión Bluetooth y motricidad sin presión temporal.',
    instructions: 'Toma el cubo, gira las caras que quieras y observa cómo se mueve el gemelo digital en pantalla. No hay tiempo ni errores.',
    practiceTrials: 0, // Sin ensayos de práctica
    buttonText: 'Comenzar Exploración',
    rules: []
  },
  2: {
    title: 'Entrenamiento Go / No-Go Unilateral',
    icon: Hand,
    color: 'purple',
    objective: 'Evaluación de control inhibitorio unilateral y discriminación motriz ante la cara contraria.',
    instructions: 'Cuando aparezca el color ROJO, gira la cara ROJA (Mano Izquierda) lo más rápido posible. Cuando aparezca el color NARANJO (cara contraria), ¡NO MUEVAS NADA! Inhibe la respuesta.',
    practiceTrials: 3,
    buttonText: 'Estoy Listo, Comenzar',
    rules: [
      { color: '#FF0000', label: 'ROJO (GO)', action: 'GIRAR', description: 'Gira la cara ROJA (Mano Izquierda) lo más rápido posible', actionIcon: 'go' },
      { color: '#FF8C00', label: 'NARANJA (NO-GO)', action: 'FRENAR', description: 'Cara contraria. NO muevas el cubo. Frena tu impulso.', actionIcon: 'nogo' }
    ]
  },
  3: {
    title: 'Velocidad y Coordinación Bimanual',
    icon: Activity,
    color: 'indigo',
    objective: 'Medición de coordinación interhemisférica, velocidad motora pura y asimetría de tiempo de reacción entre mano izquierda y derecha.',
    instructions: 'Usa tu mano izquierda para el ROJO y tu mano derecha para el NARANJA. Responde lo más rápido que puedas apenas cambie el color.',
    practiceTrials: 3,
    buttonText: 'Estoy Listo, Comenzar',
    rules: [
      { color: '#FF0000', label: 'ROJO', action: 'IZQUIERDA', description: 'Gira la cara Roja con tu Mano Izquierda', actionIcon: 'go' },
      { color: '#FF8C00', label: 'NARANJA', action: 'DERECHA', description: 'Gira la cara Naranja con tu Mano Derecha', actionIcon: 'go' }
    ]
  },
  4: {
    title: 'Evaluación Clínica Oficial de Reacción',
    icon: Zap,
    color: 'pink',
    objective: 'Test estandarizado de funciones ejecutivas motoras: atención sostenida, latencia visomotora, control de impulsos Go/No-Go mixto, costo de inhibición y curva de fatiga atencional.',
    instructions: 'Prueba estandarizada de 40 rondas. Mantén la concentración. Gira el color correspondiente y no gires ante el estímulo restrictivo.',
    practiceTrials: 3,
    buttonText: 'Iniciar Evaluación Oficial',
    rules: [
      { color: '#FF0000', label: 'ROJO', action: 'IZQUIERDA', description: 'Gira la cara Roja con tu Mano Izquierda', actionIcon: 'go' },
      { color: '#FF8C00', label: 'NARANJA', action: 'DERECHA', description: 'Gira la cara Naranja con tu Mano Derecha', actionIcon: 'go' },
      { color: '#3b82f6', label: 'AZUL / VERDE', action: 'FRENAR', description: 'NO muevas el cubo. Inhibe tu reacción.', actionIcon: 'nogo' }
    ]
  },
  5: {
    title: 'Memory Mirror - Memoria Visoespacial',
    icon: Brain,
    color: 'cyan',
    objective: 'Evaluación de amplitud de memoria de trabajo visoespacial (Corsi Span), retención secuencial y latencia intra-movimiento.',
    instructions: 'Observa la secuencia de colores que se iluminará en la pantalla. Cuando termine, repite exactamente los mismos giros en tu cubo.',
    practiceTrials: 2,
    buttonText: 'Estoy Listo, Comenzar',
    rules: [
      { color: '#a855f7', label: 'OBSERVA', action: 'MEMORIZA', description: 'Mira y memoriza el orden exacto de las caras iluminadas', actionIcon: 'watch' },
      { color: '#22c55e', label: 'REPITE', action: 'REPRODUCE', description: 'Gira las mismas caras en el mismo orden en tu cubo', actionIcon: 'go' }
    ]
  }
};

const COLOR_MAP = {
  emerald: { bg: 'from-emerald-950/30 to-teal-950/20', border: 'border-emerald-500/30', accent: 'text-emerald-400', btnBg: 'bg-emerald-600 hover:bg-emerald-700', glow: 'shadow-emerald-600/20' },
  purple: { bg: 'from-purple-950/30 to-indigo-950/20', border: 'border-purple-500/30', accent: 'text-purple-400', btnBg: 'bg-purple-600 hover:bg-purple-700', glow: 'shadow-purple-600/20' },
  indigo: { bg: 'from-indigo-950/30 to-blue-950/20', border: 'border-indigo-500/30', accent: 'text-indigo-400', btnBg: 'bg-indigo-600 hover:bg-indigo-700', glow: 'shadow-indigo-600/20' },
  pink: { bg: 'from-pink-950/30 to-purple-950/20', border: 'border-pink-500/30', accent: 'text-pink-400', btnBg: 'bg-pink-600 hover:bg-pink-700', glow: 'shadow-pink-600/20' },
  cyan: { bg: 'from-cyan-950/30 to-blue-950/20', border: 'border-cyan-500/30', accent: 'text-cyan-400', btnBg: 'bg-cyan-600 hover:bg-cyan-700', glow: 'shadow-cyan-600/20' }
};

// ─── Componente Indicador de Estado BLE ──────────────────────────────
function BleStatusIndicator({ isConnected, deviceName, batteryLevel, onReconnect }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-xs font-bold transition-all ${
      isConnected
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : 'bg-red-500/10 border-red-500/30 text-red-400'
    }`}>
      {isConnected ? (
        <>
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </div>
          <Bluetooth className="w-4 h-4" />
          <span className="truncate max-w-[120px]">{deviceName || 'Smart Cube'}</span>
          {batteryLevel !== null && (
            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
              <Battery className="w-3 h-3" /> {batteryLevel}%
            </span>
          )}
        </>
      ) : (
        <>
          <BluetoothOff className="w-4 h-4" />
          <span>Cubo Desconectado</span>
          <button
            onClick={onReconnect}
            className="ml-2 px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            Reconectar
          </button>
        </>
      )}
    </div>
  );
}

const FACE_NAME_MAP = {
  L: { color: 'ROJA', side: 'Mano Izquierda (Lado Izquierdo)' },
  R: { color: 'NARANJA', side: 'Mano Derecha (Lado Derecho)' },
  U: { color: 'BLANCA', side: 'Cara Superior (Arriba)' },
  D: { color: 'AMARILLA', side: 'Cara Inferior (Abajo)' },
  F: { color: 'AZUL', side: 'Cara Frontal (Frente)' },
  B: { color: 'VERDE', side: 'Cara Posterior (Atrás)' }
};

// ─── Componente de Ensayos de Calibración / Práctica ────────────────
function CalibrationTrials({ level, totalTrials, onComplete }) {
  const { subscribeToMoves } = useBluetoothCube();
  const [completedTrials, setCompletedTrials] = useState(0);
  const [currentTarget, setCurrentTarget] = useState(null);
  const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isShowingTarget, setIsShowingTarget] = useState(false);
  const trialTimeoutRef = useRef(null);

  // Generar estímulo de práctica según el nivel
  const generatePracticeStimulus = useCallback(() => {
    if (level === 2) {
      // Nivel 2: 2 Go (Rojo) + 1 No-Go (Naranjo - Cara contraria)
      const isNoGo = completedTrials === 1;
      return isNoGo
        ? { id: 'NONE', label: 'NARANJO', hex: '#FF8C00', type: 'NOGO', expectedFace: null }
        : { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO', expectedFace: 'L' };
    }
    if (level === 3) {
      // Nivel 3: Alternar Izquierda / Derecha
      return completedTrials % 2 === 0
        ? { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO', expectedFace: 'L' }
        : { id: 'R', label: 'NARANJA', hex: '#FF8C00', type: 'GO', expectedFace: 'R' };
    }
    if (level === 4) {
      // Nivel 4: 2 Go + 1 No-Go
      const isNoGo = completedTrials === 2;
      if (isNoGo) return { id: 'NONE', label: 'AZUL', hex: '#3b82f6', type: 'NOGO', expectedFace: null };
      return completedTrials === 0
        ? { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO', expectedFace: 'L' }
        : { id: 'R', label: 'NARANJA', hex: '#FF8C00', type: 'GO', expectedFace: 'R' };
    }
    if (level === 5) {
      return completedTrials === 0
        ? { id: 'R', label: 'NARANJA', hex: '#FF8C00', type: 'GO', expectedFace: 'R' }
        : { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO', expectedFace: 'L' };
    }
    return { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO', expectedFace: 'L' };
  }, [level, completedTrials]);

  // Mostrar siguiente estímulo de práctica
  useEffect(() => {
    if (completedTrials >= totalTrials) {
      const timer = setTimeout(() => onComplete(), 600);
      return () => clearTimeout(timer);
    }

    if (errorMessage) return; // Esperar a que el usuario lea el error y reintente

    const delayMs = completedTrials === 0 ? 400 : 900;
    const timer = setTimeout(() => {
      const stim = generatePracticeStimulus();
      setCurrentTarget(stim);
      setIsShowingTarget(true);
      setFeedback(null);

      // Para No-Go: si no mueve en 1500ms, es correcto
      if (stim?.type === 'NOGO') {
        trialTimeoutRef.current = setTimeout(() => {
          setFeedback('correct');
          setIsShowingTarget(false);
          setTimeout(() => setCompletedTrials(c => c + 1), 500);
        }, 1500);
      }
    }, delayMs);

    return () => {
      clearTimeout(timer);
      clearTimeout(trialTimeoutRef.current);
    };
  }, [completedTrials, totalTrials, onComplete, generatePracticeStimulus, errorMessage]);

  const handleCalibrationError = (movedFace) => {
    clearTimeout(trialTimeoutRef.current);
    setFeedback('incorrect');
    setIsShowingTarget(false);

    const actual = FACE_NAME_MAP[movedFace] || { color: movedFace, side: 'Cara Desconocida' };
    let msg = '';

    if (currentTarget.type === 'NOGO') {
      msg = `¡Atención! Moviste la cara ${actual.color} (${actual.side}), pero el color era ${currentTarget.label} (No-Go). Ante el color ${currentTarget.label} NO debías mover el cubo.`;
    } else {
      const expected = FACE_NAME_MAP[currentTarget.expectedFace] || { color: currentTarget.label, side: 'Lado Correspondiente' };
      msg = `¡Atención! Moviste la cara ${actual.color} (${actual.side}), pero para el color ${currentTarget.label} debías mover la cara ${expected.color}. Esta cara se encuentra en la ${expected.side}.`;
    }

    setErrorMessage(msg);
  };

  const handleRetryTrial = () => {
    setErrorMessage(null);
    setFeedback(null);
    setIsShowingTarget(false);
  };

  // Escuchar movimientos BLE
  useEffect(() => {
    if (!isShowingTarget || !currentTarget || errorMessage) return;

    const unsub = subscribeToMoves((notation) => {
      const baseFace = notation.replace("'", "").charAt(0);

      if (currentTarget.type === 'NOGO') {
        handleCalibrationError(baseFace);
      } else if (currentTarget.type === 'GO') {
        const isCorrect = baseFace === currentTarget.expectedFace;
        if (isCorrect) {
          setFeedback('correct');
          setIsShowingTarget(false);
          setTimeout(() => setCompletedTrials(c => c + 1), 500);
        } else {
          handleCalibrationError(baseFace);
        }
      }
    });

    return () => unsub();
  }, [isShowingTarget, currentTarget, subscribeToMoves, errorMessage]);

  // Manejar teclado para pruebas sin cubo
  useEffect(() => {
    if (!isShowingTarget || !currentTarget || errorMessage) return;

    const handleKey = (e) => {
      const keyMap = { ArrowLeft: 'L', ArrowRight: 'R', l: 'L', r: 'R' };
      const face = keyMap[e.key];
      if (!face) return;

      if (currentTarget.type === 'NOGO') {
        handleCalibrationError(face);
      } else if (currentTarget.type === 'GO') {
        const isCorrect = face === currentTarget.expectedFace;
        if (isCorrect) {
          setFeedback('correct');
          setIsShowingTarget(false);
          setTimeout(() => setCompletedTrials(c => c + 1), 500);
        } else {
          handleCalibrationError(face);
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isShowingTarget, currentTarget, errorMessage]);

  if (completedTrials >= totalTrials) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-3 py-6"
      >
        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        <p className="text-sm font-bold text-emerald-400">Calibración exitosa. ¡Todo listo!</p>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <p className="text-xs font-bold text-white/50 uppercase tracking-widest">
        Ensayo de Práctica {completedTrials + 1} / {totalTrials}
      </p>

      {/* Cartel de Error Clínico Explicativo */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full bg-red-950/80 border border-red-500/60 p-4 rounded-2xl flex flex-col gap-3 text-left shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-red-300 uppercase tracking-wider">
                  Error de Calibración
                </span>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRetryTrial}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-lg"
            >
              🔄 Repetir Ensayo de Práctica
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!errorMessage && (
        <>
          {/* Indicador visual del estímulo */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {isShowingTarget && currentTarget && (
                <motion.div
                  key={`stim-${completedTrials}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  className="w-28 h-28 rounded-3xl flex items-center justify-center shadow-2xl"
                  style={{ backgroundColor: currentTarget.hex }}
                >
                  {currentTarget.type === 'NOGO' ? (
                    <Hand className="w-12 h-12 text-white" />
                  ) : (
                    <ArrowRight className="w-12 h-12 text-white" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Feedback overlay */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className={`absolute inset-0 flex items-center justify-center rounded-3xl ${
                    feedback === 'correct' ? 'bg-emerald-500/20 border-2 border-emerald-500' : 'bg-red-500/20 border-2 border-red-500'
                  }`}
                >
                  {feedback === 'correct' ? (
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  ) : (
                    <XCircle className="w-10 h-10 text-red-400" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isShowingTarget && currentTarget && (
            <p className="text-xs text-white/80 font-bold animate-pulse">
              {currentTarget.type === 'NOGO'
                ? 'NO muevas el cubo'
                : `Gira la cara ${currentTarget.label}`
              }
            </p>
          )}

          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalTrials }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < completedTrials ? 'bg-emerald-500' : i === completedTrials ? 'bg-white/60 animate-pulse' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente Principal: PreTestModal ──────────────────────────────
export default function PreTestModal({ level, onStart, onCancel }) {
  const { isConnected, device, batteryLevel, connectBLE, isKeyboardMode } = useBluetoothCube();
  const [calibrationDone, setCalibrationDone] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);

  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
  const colors = COLOR_MAP[config.color] || COLOR_MAP.purple;
  const LevelIcon = config.icon;
  const hasPractice = config.practiceTrials > 0;

  const handleStartCalibration = () => {
    if (hasPractice && isConnected) {
      setShowCalibration(true);
    } else if (!hasPractice) {
      onStart();
    }
  };

  const handleCalibrationComplete = () => {
    setCalibrationDone(true);
    setShowCalibration(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 30 }}
        className={`relative w-full max-w-2xl mx-4 rounded-3xl bg-gradient-to-br ${colors.bg} border ${colors.border} shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`}
        style={{ background: 'linear-gradient(135deg, rgba(12,16,26,0.98), rgba(7,8,15,0.99))' }}
      >
        {/* Header */}
        <div className="p-6 pb-0 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colors.btnBg} flex items-center justify-center shadow-lg ${colors.glow}`}>
              <LevelIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest ${colors.accent}`}>
                Nivel {level}
              </span>
              <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                {config.title}
              </h2>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-white/30 hover:text-white/80 text-sm transition-colors cursor-pointer p-2"
          >
            Cancelar
          </button>
        </div>

        {/* Objetivo Clínico */}
        <div className="px-6 pt-5">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">
              Objetivo Clínico
            </p>
            <p className="text-sm text-white/70 leading-relaxed">
              {config.objective}
            </p>
          </div>
        </div>

        {/* Instrucciones de Respuesta */}
        <div className="px-6 pt-5">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">
            Instrucciones para el Estudiante
          </p>
          <p className="text-sm text-white/90 leading-relaxed mb-4 font-medium">
            {config.instructions}
          </p>

          {/* Reglas Visuales */}
          {config.rules.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {config.rules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                  <div
                    className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: rule.color }}
                  >
                    {rule.actionIcon === 'go' && <ArrowRight className="w-7 h-7 text-white" />}
                    {rule.actionIcon === 'nogo' && <Hand className="w-7 h-7 text-white" />}
                    {rule.actionIcon === 'watch' && <Brain className="w-7 h-7 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-black uppercase tracking-wider" style={{ color: rule.color }}>
                        {rule.label}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        rule.actionIcon === 'nogo'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {rule.action}
                      </span>
                    </div>
                    <p className="text-xs text-white/50">{rule.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado de Conexión BLE o Modo Teclado */}
        <div className="px-6 pt-5">
          {isKeyboardMode ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⌨️</span>
                <div className="text-left">
                  <p className="text-xs font-black text-amber-300 uppercase tracking-wider">
                    Modo Teclado (Sin Cubo) Activo
                  </p>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    {level === 2 && 'Usa la BARRA ESPACIADORA o tecla A para ROJO. En No-Go, ¡no presiones nada!'}
                    {level === 3 && 'Usa tecla A para ROJO (Mano Izq) y tecla L para NARANJA (Mano Der).'}
                    {level === 4 && 'Usa tecla A para ROJO y tecla L para NARANJA. En Azul/Verde, ¡frena!'}
                    {level === 5 && 'Usa las teclas de colores o haz clic en los 6 botones cromáticos.'}
                    {level === 1 && 'Prueba teclas y controles libremente sin límite de tiempo.'}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-black bg-amber-500/30 text-amber-200 px-2 py-1 rounded-lg">
                ACTIVO
              </span>
            </div>
          ) : (
            <BleStatusIndicator
              isConnected={isConnected}
              deviceName={device}
              batteryLevel={batteryLevel}
              onReconnect={connectBLE}
            />
          )}
        </div>

        {/* Zona de Calibración (Solo si NO es modo teclado) */}
        {!isKeyboardMode && showCalibration && (
          <div className="px-6 pt-5">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <p className="text-xs font-black text-amber-400 uppercase tracking-widest">
                  Calibración Rápida
                </p>
              </div>
              <CalibrationTrials
                level={level}
                totalTrials={config.practiceTrials}
                onComplete={handleCalibrationComplete}
              />
            </div>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="p-6 pt-5 flex flex-col gap-3">
          {isKeyboardMode ? (
            <button
              onClick={onStart}
              className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-amber-500/20 cursor-pointer uppercase tracking-wider hover:scale-105 active:scale-95"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>Iniciar Evaluación (Modo Teclado)</span>
            </button>
          ) : calibrationDone || !hasPractice ? (
            <button
              onClick={onStart}
              className={`w-full py-4 ${colors.btnBg} text-white font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2.5 shadow-lg ${colors.glow} cursor-pointer uppercase tracking-wider`}
            >
              <ShieldCheck className="w-5 h-5" />
              <span>{config.buttonText}</span>
            </button>
          ) : (
            <>
              {!showCalibration && (
                <button
                  onClick={handleStartCalibration}
                  disabled={!isConnected && hasPractice}
                  className={`w-full py-4 ${
                    isConnected || !hasPractice
                      ? `${colors.btnBg} cursor-pointer shadow-lg ${colors.glow}`
                      : 'bg-white/10 cursor-not-allowed opacity-50'
                  } text-white font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2.5 uppercase tracking-wider`}
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>{hasPractice ? 'Iniciar Calibración Rápida' : config.buttonText}</span>
                </button>
              )}
              {!isConnected && hasPractice && (
                <div className="flex items-center gap-2 justify-center text-xs text-amber-400/80">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Conecta el cubo para calibrar antes de iniciar</span>
                </div>
              )}
              {/* Skip calibration for testing without cube */}
              {!showCalibration && (
                <button
                  onClick={onStart}
                  className="text-[10px] text-white/20 hover:text-white/50 transition-colors uppercase tracking-widest cursor-pointer py-2"
                >
                  Omitir calibración (modo sin cubo)
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
