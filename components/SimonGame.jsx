'use client';
import { useVisuospatialTest } from '../hooks/useVisuospatialTest';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { useEffect, useRef, useState } from 'react';
import Cube3DViewer from './Cube3DViewer';
import { Eye, ShieldCheck, FileSpreadsheet } from 'lucide-react';

// Representando Blanco, Amarillo, Rojo, Naranjo, Azul. La cara 'B' / Verde está desactivada.
const FACE_FREQUENCIES = {
  U: 440, // La
  D: 554, // Do#
  R: 659, // Mi
  L: 880, // La (Octava)
  F: 330, // Mi (Grave)
  B: 523  // Do
};

const FACE_METADATA = {
  U: { name: 'BLANCO', position: 'Arriba (U)', color: 'bg-white text-black border-white', text: 'text-white', badge: 'BLANCO (Cara Arriba)' },
  D: { name: 'AMARILLO', position: 'Abajo (D)', color: 'bg-yellow-400 text-black border-yellow-500', text: 'text-yellow-400', badge: 'AMARILLO (Cara Abajo)' },
  R: { name: 'NARANJA', position: 'Derecha (R)', color: 'bg-orange-500 text-white border-orange-600', text: 'text-orange-500', badge: 'NARANJA (Mano Derecha)' },
  L: { name: 'ROJO', position: 'Izquierda (L)', color: 'bg-red-500 text-white border-red-600', text: 'text-red-500', badge: 'ROJO (Mano Izquierda)' },
  F: { name: 'AZUL', position: 'Frente (F)', color: 'bg-blue-600 text-white border-blue-700', text: 'text-blue-500', badge: 'AZUL (Cara Frente)' },
  B: { name: 'VERDE', position: 'Atrás (B - Giro 180°)', color: 'bg-emerald-600 text-white border-emerald-700', text: 'text-emerald-400', badge: 'VERDE (Cara de Atrás)' }
};

// Singleton para el motor de audio Web Audio API
let audioCtxInstance = null;
const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioCtxInstance) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtxInstance = new AudioContextClass();
    }
  }
  if (audioCtxInstance && audioCtxInstance.state === 'suspended') {
    audioCtxInstance.resume();
  }
  return audioCtxInstance;
};

const playTone = (frequency, type = 'triangle', duration = 0.4) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05); // volumen 0.25
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio Context failed to play:', e);
  }
};

export default function SimonGame({ onExit, playerName, sessionMeta, sessionStartTime, onTelemetryUpdate, isDemoMode = false }) {
  const { isConnected, subscribeToMoves, connectCube, isKeyboardMode, setKeyboardMode } = useBluetoothCube();

  const wasConnectedAtStartRef = useRef(isConnected);
  const requireBluetooth = !isKeyboardMode && wasConnectedAtStartRef.current;

  const {
    gameState,
    level,
    trial,
    sequence,
    activeFace,
    userIndex,
    showingIndex,
    errorsInLevel,
    telemetry,
    startGame,
    handleCubeInput
  } = useVisuospatialTest(isKeyboardMode ? true : isConnected, requireBluetooth);

  // Monitor de nivel para finalizar de forma asíncrona y comprimida de 15 segundos si es modo defensa (máx Nivel 3)
  useEffect(() => {
    if (isDemoMode && level > 3 && gameState !== 'finished') {
      console.log('[Demo] Test de Corsi completado rápido en Nivel 3. Finalizando demo.');
      const finalRecord = {
        metrics: {
          corsiSpan: 3,
          maxLevelReached: 3,
          isCompleted: true,
          totalDurationMs: Date.now() - (sessionStartTime || Date.now()),
          isKeyboardMode: Boolean(isKeyboardMode),
          modo_evaluacion: isKeyboardMode ? 'teclado_sin_cubo' : 'cubo_bluetooth',
          cubo_conectado: !isKeyboardMode
        },
        telemetry: telemetry
      };
      onExit(finalRecord);
    }
  }, [level, isDemoMode, gameState, telemetry, onExit, sessionStartTime, isKeyboardMode]);

  const [demoKey, setDemoKey] = useState(0);
  const [showErrorFlash, setShowErrorFlash] = useState(false);
  const [cubeSize, setCubeSize] = useState(300);
  const [userTurnFeedback, setUserTurnFeedback] = useState(null); // Feedback visual instantáneo de giro del usuario

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        const width = window.innerWidth;
        if (width < 640) {
          setCubeSize(260); // Móvil
        } else if (width < 1024) {
          setCubeSize(350); // Tablet
        } else {
          setCubeSize(450); // Desktop
        }
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  const prevErrorsRef = useRef(errorsInLevel);
  const [successFlash, setSuccessFlash] = useState(false);
  const [levelUpFlash, setLevelUpFlash] = useState(false);
  const prevUserIndexRef = useRef(userIndex);
  const prevLevelRef = useRef(level);

  useEffect(() => {
    if (onTelemetryUpdate) {
      onTelemetryUpdate({ level, trial, telemetry, gameState });
    }
  }, [level, trial, telemetry, gameState, onTelemetryUpdate]);

  // Fallas
  useEffect(() => {
    if (errorsInLevel > prevErrorsRef.current) {
      setShowErrorFlash(true);
      setTimeout(() => setShowErrorFlash(false), 400);
    }
    prevErrorsRef.current = errorsInLevel;
  }, [errorsInLevel]);

  // Aciertos
  useEffect(() => {
    if (userIndex > prevUserIndexRef.current) {
      setSuccessFlash(true);
      setTimeout(() => setSuccessFlash(false), 200);
    }
    prevUserIndexRef.current = userIndex;
  }, [userIndex]);

  // Nivel completado
  useEffect(() => {
    if (level > prevLevelRef.current) {
      setLevelUpFlash(true);
      setTimeout(() => setLevelUpFlash(false), 800);
    }
    prevLevelRef.current = level;
  }, [level]);

  // Incrementar demoKey cada vez que se enciende una cara nueva en la demo de secuencia
  useEffect(() => {
    if (activeFace && gameState === 'showing_sequence') {
      setDemoKey(k => k + 1);
    }
  }, [activeFace, gameState]);

  // Handler unificado de input del usuario con feedback visual y sonoro instantáneo
  const triggerUserInputFeedback = (face) => {
    handleCubeInput(face);

    if (FACE_METADATA[face]) {
      setUserTurnFeedback({ face, meta: FACE_METADATA[face], timestamp: Date.now() });
      setTimeout(() => setUserTurnFeedback(null), 400);
    }

    if (FACE_FREQUENCIES[face]) {
      playTone(FACE_FREQUENCIES[face], 'triangle', 0.25);
    }
  };

  // Detector de 2 giros de la cara ROJA (L / Left) para iniciar prueba manos libres
  const redTurnCountRef = useRef(0);
  const redTurnTimerRef = useRef(null);

  const checkRedGestureToStart = (face) => {
    if (gameState !== 'idle') return;
    const cleanFace = face.replace("'", "");
    if (cleanFace === 'L') { // Cara Roja (L / Left)
      redTurnCountRef.current += 1;
      if (redTurnTimerRef.current) clearTimeout(redTurnTimerRef.current);

      if (redTurnCountRef.current >= 2) {
        redTurnCountRef.current = 0;
        console.log('[SimonGame] Gesto detectado: 2 giros de cara Roja. Iniciando prueba...');
        playTone(523, 'triangle', 0.5);
        startGame();
        return;
      }

      redTurnTimerRef.current = setTimeout(() => {
        redTurnCountRef.current = 0;
      }, 2000);
    }
  };

  // Suscripción activa a giros BLE del hardware
  useEffect(() => {
    const unsub = subscribeToMoves((movimiento) => {
      const face = movimiento.replace("'", "");
      if (gameState === 'waiting_for_user') {
        triggerUserInputFeedback(face);
      } else if (gameState === 'idle') {
        checkRedGestureToStart(face);
      } else {
        handleCubeInput(face);
      }
    });
    return () => unsub();
  }, [subscribeToMoves, handleCubeInput, gameState]);

  // Atajos de teclado para simulación de giros en SimonGame (Memory Mirror)
  useEffect(() => {
    const onKey = (e) => {
      const keyUpper = e.key.toUpperCase();

      if (gameState === 'idle' && isKeyboardMode && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startGame();
        return;
      }

      let face = null;

      // Blanco (U)
      if (keyUpper === 'U' || keyUpper === 'W' || e.key === 'ArrowUp' || e.key === '1') face = 'U';
      // Amarillo (D)
      else if (keyUpper === 'D' || keyUpper === 'S' || e.key === 'ArrowDown' || e.key === '2') face = 'D';
      // Rojo (L)
      else if (keyUpper === 'A' || e.key === 'ArrowLeft' || e.key === '3') face = 'L';
      // Naranja (R)
      else if (keyUpper === 'R' || keyUpper === 'L' || e.key === 'ArrowRight' || e.key === '4') face = 'R';
      // Azul (F)
      else if (keyUpper === 'F' || e.key === ' ' || e.key === '5') face = 'F';
      // Verde (B)
      else if (keyUpper === 'B' || keyUpper === 'G' || e.key === '6') face = 'B';

      if (face) {
        if (gameState === 'waiting_for_user') {
          triggerUserInputFeedback(face);
        } else if (gameState === 'idle') {
          checkRedGestureToStart(face);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCubeInput, gameState, isKeyboardMode, startGame]);

  // Audio durante la reproducción de la secuencia del cubo virtual
  useEffect(() => {
    if (activeFace && FACE_FREQUENCIES[activeFace]) {
      playTone(FACE_FREQUENCIES[activeFace], 'triangle', 0.4);
    }
  }, [activeFace]);

  const handleFinishTest = () => {
    const correctMoves = telemetry.filter(t => t.isCorrect);
    const avgLatencyMs = correctMoves.length > 0
      ? Math.round(correctMoves.reduce((acc, curr) => acc + curr.latencyMs, 0) / correctMoves.length)
      : 0;

    const totalErrors = telemetry.filter(t => !t.isCorrect).length;
    const corsiSpan = level > 2 ? level - 1 : 0;
    const totalCorrectTrials = corsiSpan;

    // Resistencia Supra-Span (Tolerancia a la Sobrecarga)
    let supra_span_resistance_percentage = 0;
    if (telemetry.length > 0) {
      const lastMove = telemetry[telemetry.length - 1];
      const lastLevelTelemetry = telemetry.filter(t => t.level === lastMove.level && t.trial === lastMove.trial);
      const lastLevelCorrects = lastLevelTelemetry.filter(t => t.isCorrect).length;
      supra_span_resistance_percentage = Math.round((lastLevelCorrects / lastMove.level) * 100);
    }

    const record = {
      id: crypto.randomUUID(),
      playerName: playerName || 'Anónimo',
      date: new Date().toISOString(),
      sessionMeta,
      sessionDurationMs: Date.now() - (sessionStartTime || Date.now()),
      metrics: {
        maxLevelReached: level,
        corsiSpan,
        totalCorrectTrials,
        totalErrors,
        avgLatencyMs,
        supra_span_resistance_percentage,
        isKeyboardMode: Boolean(isKeyboardMode),
        modo_evaluacion: isKeyboardMode ? 'teclado_sin_cubo' : 'cubo_bluetooth',
        cubo_conectado: !isKeyboardMode,
        inputMode: isKeyboardMode ? 'teclado' : 'cubo_ble'
      },
      telemetry
    };

    // Salir y mostrar el reporte clínico
    onExit(record);
  };

  const activeMeta = FACE_METADATA[activeFace];

  const isGameActive = gameState !== 'idle' && gameState !== 'finished';
  const showDisconnectOverlay = requireBluetooth && !isConnected && isGameActive;

  if (showDisconnectOverlay) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-[#07080f]/95 text-white absolute inset-0 z-[100] font-sans select-none">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-red-600/10 blur-[130px]" />
        </div>

        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-3xl mb-6 shadow-lg shadow-red-500/5 animate-pulse">
            !
          </div>
          <h2 className="text-2xl font-black mb-3 text-white tracking-tight uppercase">Conexión Perdida</h2>
          <p className="text-slate-400 text-xs font-semibold leading-relaxed mb-6">
            Se ha interrumpido la conexión Bluetooth con el cubo inteligente. Hemos pausado la prueba para que no pierdas tu progreso.
          </p>

          <button
            onClick={connectCube}
            className="w-full py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:shadow-[0_0_30px_rgba(220,38,38,0.3)] hover:scale-105 active:scale-95 transition-all text-white font-black uppercase text-[10px] tracking-widest rounded-2xl cursor-pointer mb-3 animate-pulse"
          >
            Reconectar Cubo
          </button>

          <button
            onClick={() => setKeyboardMode(true)}
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-[10px] tracking-widest rounded-2xl cursor-pointer mb-4 shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          >
            <span>⌨️</span>
            <span>Continuar con Modo Teclado</span>
          </button>

          <button
            onClick={() => onExit(null)}
            className="w-full py-3.5 bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-slate-300 font-bold uppercase text-[10px] tracking-widest rounded-2xl cursor-pointer"
          >
            Abandonar Prueba
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes error-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-15px); }
          40%, 80% { transform: translateX(15px); }
        }
        .animate-error-shake {
          animation: error-shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes success-pulse {
          0% { box-shadow: inset 0 0 0 rgba(57,255,20,0); }
          50% { box-shadow: inset 0 0 50px rgba(57,255,20,0.5); }
          100% { box-shadow: inset 0 0 0 rgba(57,255,20,0); }
        }
        .animate-success-pulse {
          animation: success-pulse 0.3s ease-out;
        }
      `}</style>
      <div className={`h-screen overflow-hidden bg-[#07080f] text-white font-sans flex flex-col selection:bg-[#c084fc]/30 w-full relative ${showErrorFlash ? 'animate-error-shake' : ''} ${successFlash ? 'animate-success-pulse' : ''}`}>
        {showErrorFlash && (
          <div className="absolute inset-0 bg-red-600/30 z-[100] pointer-events-none transition-opacity duration-300" />
        )}

        {/* HEADER */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 bg-[#0a0c10] text-center sm:text-left flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <h1 className="text-lg sm:text-xl font-black italic uppercase tracking-widest flex items-center gap-2">
              <span className="text-[#a855f7]">MEMORY MIRROR</span>
              <span className="text-[9px] sm:text-xs text-white/30 border border-white/10 px-2 py-0.5 rounded-full font-black font-mono">CORSI TEST</span>
            </h1>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-bold tracking-widest uppercase">
            <div className="text-white/40">
              Nivel: <span className="text-[#a855f7] text-lg sm:text-xl font-black drop-shadow-[0_0_10px_rgba(168,85,247,0.4)]">{level}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border-2 text-[10px] sm:text-xs font-black tracking-widest uppercase transition-all ${trial === 'A'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse'
                }`}>
                {trial === 'A' ? 'Oportunidad 1 de 2' : 'ÚLTIMO INTENTO'}
              </div>
            </div>
          </div>
        </header>

        {/* MAIN LAYOUT */}
        <div className="flex flex-1 overflow-hidden relative min-h-0">
          {/* PANEL IZQUIERDO: GEMELO DIGITAL Y ESTADO */}
          <div className="flex-1 flex flex-col items-center justify-center relative p-4 sm:p-8 min-h-0">

            {/* HEADER TEXTS WHEN CUBE IS VISIBLE */}
            <div className="absolute top-4 sm:top-8 text-center w-full z-10 px-4">
              {gameState === 'idle' && (
                <p className="text-white/40 font-bold tracking-[0.25em] uppercase text-[10px] sm:text-sm">
                  MEMORIA VISOESPACIAL DE TRABAJO (TEST DE CORSI)
                </p>
              )}
              {gameState === 'showing_sequence' && showingIndex >= 0 && (
                <div className="flex flex-col items-center gap-1 sm:gap-2 animate-in fade-in zoom-in-95 duration-300">
                  <p className="text-[#00FFFF] font-black tracking-[0.3em] uppercase text-sm sm:text-lg drop-shadow-[0_0_12px_rgba(0,255,255,0.6)]">
                    SECUENCIA EN EJECUCIÓN
                  </p>
                  <span className="text-[10px] text-cyan-300/80 uppercase font-bold tracking-widest bg-cyan-950/80 px-3 py-0.5 rounded-full border border-cyan-500/30">
                    Paso {showingIndex + 1} de {sequence.length} (Cubo Armado)
                  </span>
                  <div className="flex gap-1.5 mt-1">
                    {sequence.map((_, i) => (
                      <div key={i} className={`w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full transition-all duration-300 ${i <= showingIndex ? 'bg-[#00FFFF] shadow-[0_0_10px_rgba(0,255,255,0.8)] scale-110' : 'border-2 border-[#00FFFF]/30 bg-transparent'}`} />
                    ))}
                  </div>
                </div>
              )}
              {gameState === 'waiting_for_user' && (
                <div className="flex flex-col items-center gap-2 sm:gap-3 animate-in fade-in zoom-in-95 duration-200">
                  <p className="text-[#39FF14] font-black tracking-[0.3em] uppercase text-sm sm:text-xl drop-shadow-[0_0_10px_rgba(57,255,20,0.5)]">
                    TU TURNO (REPLICA)
                  </p>
                  <span className="text-[10px] text-emerald-300/80 uppercase font-bold tracking-widest bg-emerald-950/80 px-3 py-0.5 rounded-full border border-emerald-500/30">
                    Gemelo Digital en Tiempo Real
                  </span>
                  <div className="flex gap-1.5 mt-1">
                    {sequence.map((_, i) => (
                      <div key={i} className={`w-2.5 h-2.5 sm:w-4 sm:h-4 rounded-full transition-all duration-200 ${i < userIndex ? 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.8)]' : i === userIndex ? 'bg-[#39FF14]/50 animate-pulse border-2 border-[#39FF14]' : 'border-2 border-[#39FF14]/30 bg-transparent'}`} />
                    ))}
                  </div>
                </div>
              )}
              {gameState === 'error_delay' && (
                <div className="flex flex-col items-center justify-center h-full animate-pulse">
                  <p className="text-[#FF5F1F] font-black tracking-[0.3em] uppercase text-lg sm:text-2xl drop-shadow-[0_0_20px_rgba(255,95,31,0.8)]">
                    ¡ERROR DE SECUENCIA!
                  </p>
                  <p className="text-white/60 font-bold tracking-widest mt-1 sm:mt-2 text-xs sm:text-sm">PREPARANDO NUEVO INTENTO...</p>
                </div>
              )}
              {gameState === 'level_up_delay' && (
                <div className="flex flex-col items-center justify-center h-full animate-pulse">
                  <p className="text-[#39FF14] font-black tracking-[0.3em] uppercase text-xl sm:text-3xl drop-shadow-[0_0_30px_rgba(57,255,20,0.8)]">
                    ¡NIVEL COMPLETADO!
                  </p>
                  <p className="text-white/80 font-bold tracking-widest mt-1 sm:mt-2 text-xs sm:text-sm">PREPARANDO NIVEL {level + 1}...</p>
                </div>
              )}
              {gameState === 'finished' && (
                <p className="text-[#FF5F1F] font-black tracking-[0.3em] uppercase text-sm sm:text-xl drop-shadow-[0_0_10px_rgba(255,95,31,0.5)]">
                  EVALUACIÓN COMPLETADA
                </p>
              )}
            </div>

            {/* HUD PANEL: POSICIONADO ABAJO A LA DERECHA PARA EVITAR SUPERPOSICIÓN */}
            {(activeMeta || userTurnFeedback) && showingIndex >= 0 && (
              <div className="absolute bottom-6 right-6 bg-[#13161e]/90 backdrop-blur-md border border-white/15 rounded-2xl p-4 flex items-center gap-3 w-64 shadow-2xl z-20 transition-all duration-200 animate-in fade-in zoom-in-95">
                <div className={`w-12 h-12 rounded-xl ${(userTurnFeedback?.meta || activeMeta)?.color} shadow-lg flex items-center justify-center font-black text-xl border shrink-0 animate-pulse`}>
                  {(userTurnFeedback?.face || activeFace)}
                </div>
                <div className="text-left">
                  <span className="text-[9px] font-black tracking-widest text-white/50 uppercase block">
                    {userTurnFeedback ? 'Giro Detectado' : 'Cara Activa'}
                  </span>
                  <p className={`font-black uppercase tracking-wider text-xs ${(userTurnFeedback?.meta || activeMeta)?.text}`}>
                    {(userTurnFeedback?.meta || activeMeta)?.name}
                  </p>
                  <p className="text-[10px] text-white/70 font-mono font-bold">
                    {(userTurnFeedback?.meta || activeMeta)?.position}
                  </p>
                </div>
              </div>
            )}

            {/* ÁREA DEL CUBO 3D */}
            <div className="relative transition-all duration-200 flex items-center justify-center opacity-100">
              <Cube3DViewer
                status={gameState === 'finished' ? 'eval_celebration' : 'gyro_active'}
                size={cubeSize}
                highlightFace={activeFace || userTurnFeedback?.face}
                demoMoves={gameState === 'showing_sequence' && activeFace ? [activeFace] : null}
                demoKey={demoKey}
                moveHistory={gameState === 'showing_sequence' ? [] : undefined}
                ignoreSensor={gameState !== 'waiting_for_user' && gameState !== 'idle'}
                orbitCamera={gameState === 'showing_sequence'}
              />
            </div>

            {/* LEYENDA CROMÁTICA EN LA ESQUINA (SOLO MODO TECLADO) */}
            {isKeyboardMode && (
              <div className="absolute top-16 left-4 z-30 bg-[#0d111d]/90 backdrop-blur-md border border-amber-500/30 rounded-2xl p-3 shadow-xl max-w-[210px] text-left animate-in fade-in">
                <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-white/10">
                  <span className="text-xs">⌨️</span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 font-mono">
                    Atajos de Color
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono">
                  <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-white text-black font-black text-[9px] flex items-center justify-center">U</span><span className="text-white/80">Blanco (1)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-yellow-400 text-black font-black text-[9px] flex items-center justify-center">D</span><span className="text-white/80">Amarillo (2)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-600 text-white font-black text-[9px] flex items-center justify-center">A</span><span className="text-white/80">Rojo (3)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-orange-500 text-white font-black text-[9px] flex items-center justify-center">R</span><span className="text-white/80">Naranja (4)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-600 text-white font-black text-[9px] flex items-center justify-center">F</span><span className="text-white/80">Azul (5)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-600 text-white font-black text-[9px] flex items-center justify-center">B</span><span className="text-white/80">Verde (6)</span></div>
                </div>
              </div>
            )}

            {/* PANEL DE 6 COLORES INTERACTIVOS MODO TECLADO */}
            {isKeyboardMode && (gameState === 'waiting_for_user' || gameState === 'showing_sequence') && (
              <div className="absolute bottom-6 sm:bottom-8 text-center w-full z-30 px-4 flex flex-col items-center gap-2">
                <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 bg-black/70 backdrop-blur-xl p-3 sm:p-4 rounded-3xl border border-white/15 shadow-2xl transition-all ${
                  gameState === 'showing_sequence' ? 'opacity-40 pointer-events-none' : 'opacity-100'
                }`}>
                  {[
                    { face: 'U', label: 'BLANCO', keyLabel: 'U', style: 'bg-white text-black border-white hover:bg-slate-100 shadow-[0_0_15px_rgba(255,255,255,0.3)]' },
                    { face: 'D', label: 'AMARILLO', keyLabel: 'D', style: 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.3)]' },
                    { face: 'L', label: 'ROJO', keyLabel: 'A', style: 'bg-red-600 text-white border-red-500 hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.4)]' },
                    { face: 'R', label: 'NARANJA', keyLabel: 'R', style: 'bg-orange-500 text-white border-orange-400 hover:bg-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)]' },
                    { face: 'F', label: 'AZUL', keyLabel: 'F', style: 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]' },
                    { face: 'B', label: 'VERDE', keyLabel: 'B', style: 'bg-emerald-600 text-white border-emerald-400 hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' }
                  ].map((btn) => (
                    <button
                      key={btn.face}
                      type="button"
                      disabled={gameState !== 'waiting_for_user'}
                      onClick={() => triggerUserInputFeedback(btn.face)}
                      className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl border font-bold text-xs sm:text-sm transition-all duration-150 active:scale-90 hover:scale-105 shadow-lg cursor-pointer ${btn.style}`}
                    >
                      <span className="w-5 h-5 rounded-lg flex items-center justify-center font-mono text-[10px] font-black bg-black/30 border border-white/20">
                        {btn.keyLabel}
                      </span>
                      <span className="uppercase tracking-wider">{btn.label}</span>
                    </button>
                  ))}
                </div>
                {gameState === 'waiting_for_user' && (
                  <span className="text-[11px] text-emerald-400 font-mono font-bold tracking-wider animate-pulse bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-500/20">
                    Haz clic en el color o presiona su tecla correspondiente
                  </span>
                )}
              </div>
            )}

            {/* CONTROLES / BOTONES INFERIORES */}
            <div className="absolute bottom-6 sm:bottom-8 text-center w-full z-10 px-4 flex flex-col items-center gap-2">
              {gameState === 'idle' && (
                <>
                  {isKeyboardMode ? (
                    <>
                      <button
                        onClick={startGame}
                        className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:scale-105 active:scale-95 text-black font-black uppercase text-xs sm:text-sm tracking-[0.25em] rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.4)] transition-all cursor-pointer"
                      >
                        INICIAR PRUEBA (MODO TECLADO)
                      </button>
                      <span className="text-[11px] text-amber-300/80 font-mono font-bold tracking-wider bg-amber-950/40 px-3 py-1 rounded-full border border-amber-500/20">
                        Haz clic en el botón o presiona ENTER para iniciar sin cubo
                      </span>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={isConnected ? startGame : connectCube}
                        className={`px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase text-xs sm:text-sm tracking-[0.25em] transition-all max-w-[280px] sm:max-w-none cursor-pointer
                            ${isConnected
                            ? 'bg-gradient-to-r from-[#a855f7] to-[#c084fc] hover:scale-105 shadow-[0_0_30px_rgba(168,85,247,0.4)] text-white'
                            : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:scale-105 shadow-[0_0_30px_rgba(6,182,212,0.4)] text-white animate-pulse'
                          }`}
                      >
                        {isConnected ? 'INICIAR PRUEBA' : 'CONECTAR CUBO SMART BLE'}
                      </button>
                      {isConnected ? (
                        <span className="text-[11px] text-purple-300/70 font-mono font-bold tracking-wider animate-pulse bg-purple-950/40 px-3 py-1 rounded-full border border-purple-500/20">
                          Gira 2 veces la cara ROJA (L) del cubo para iniciar
                        </span>
                      ) : (
                        <span className="text-[11px] text-cyan-300/70 font-mono font-bold tracking-wider bg-cyan-950/40 px-3 py-1 rounded-full border border-cyan-500/20">
                          Haz clic en el botón para vincular el cubo GAN por Bluetooth
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
              {gameState === 'finished' && (
                <button
                  onClick={handleFinishTest}
                  className="px-8 py-4 bg-white text-black font-black uppercase text-sm tracking-[0.3em] rounded-2xl hover:bg-[#a855f7] hover:text-white hover:scale-105 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] cursor-pointer"
                >
                  FINALIZAR PRUEBA
                </button>
              )}
            </div>
          </div>

          {/* PANEL DERECHO: TELEMETRÍA */}
          <div className="hidden lg:flex w-96 bg-[#13161e] border-l border-white/5 p-6 flex-col min-h-0">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40 mb-4 pb-4 border-b border-white/5 shrink-0">
              Telemetría en Vivo
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2 font-mono text-xs custom-scrollbar min-h-0">
              {telemetry.length === 0 ? (
                <div className="text-white/20 italic">Esperando movimientos del cubo inteligente...</div>
              ) : (
                telemetry.map((t, i) => (
                  <div key={i} className={`p-3 rounded-lg border flex flex-col gap-1.5 ${t.isCorrect
                    ? 'bg-[#39FF14]/5 border-[#39FF14]/20'
                    : 'bg-[#FF5F1F]/5 border-[#FF5F1F]/20'
                    }`}>
                    <div className="flex justify-between items-center text-white/60">
                      <span className="font-black">Lvl {t.level} (Intento {t.trial})</span>
                      <span className="font-bold">{t.latencyMs}ms</span>
                    </div>
                    <div className="flex justify-between items-center font-bold">
                      <span>Esperado: {t.expectedFace}</span>
                      <span className={t.isCorrect ? 'text-[#39FF14]' : 'text-[#FF5F1F]'}>
                        Girado: {t.userFace}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
