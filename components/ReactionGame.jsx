'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { useJoicube } from '../contexts/JoicubeContext';
import Cube3DViewer from './Cube3DViewer';

// ── GENERADOR DE MAZO CLÍNICO Y NIVELES DE ENTRENAMIENTO ──
// Reglas psicométricas:
//   - Ratio Go/No-Go: 75-80% Go, 20-25% No-Go
//   - Regla Anticonsecutiva Estricta: mínimo 2 estímulos Go entre cada No-Go
//   - Jitter ISI: 1000-1800ms aleatorio entre ensayos (aplicado en el ciclo del juego)
//   - Primeros 3-4 ensayos siempre Go (prepotencia motora)
//   - Último ensayo siempre Go

function generateDeck(mode = 'official') {
  const NOGO_COLORS = [
    { id: 'NONE', label: 'VERDE', hex: '#22c55e', type: 'NOGO' },
    { id: 'NONE', label: 'AZUL', hex: '#3b82f6', type: 'NOGO' }
  ];

  // ── Nivel 2: Go/No-Go Unilateral (Cara Roja GO vs Cara Naranja NO-GO) ──────
  // 20 ensayos: 16 Go (80% Rojo) + 4 No-Go (20% Naranja - Cara contraria)
  if (mode === 'single_face') {
    const TOTAL = 20;
    const NOGO_COUNT = 4;
    const GO_COUNT = TOTAL - NOGO_COUNT;

    return buildConstrainedDeck(
      GO_COUNT,
      NOGO_COUNT,
      () => ({ id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO', expectedFace: 'L' }),
      () => ({ id: 'NONE', label: 'NARANJO', hex: '#FF8C00', type: 'NOGO', expectedFace: null }),
      3, // primeros 3 siempre Go
      2  // mínimo 2 Go entre cada No-Go
    );
  }

  // ── Nivel 3: Bilateralidad Pura (2 caras, SIN No-Go) ──────
  // 24 ensayos equilibrados: 12 L (Rojo) + 12 R (Naranja)
  if (mode === 'bilateral_pure') {
    const items = [];
    for (let i = 0; i < 12; i++) items.push('L');
    for (let i = 0; i < 12; i++) items.push('R');

    // Fisher-Yates con control de no más de 2 iguales consecutivos
    let deck;
    let valid = false;
    while (!valid) {
      deck = [...items];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      // Verificar que no haya 3 iguales consecutivos
      valid = true;
      for (let i = 2; i < deck.length; i++) {
        if (deck[i] === deck[i - 1] && deck[i] === deck[i - 2]) {
          valid = false;
          break;
        }
      }
    }

    return deck.map(t => {
      if (t === 'R') return { id: 'R', label: 'NARANJO', hex: '#FF8C00', type: 'GO' };
      return { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO' };
    });
  }

  // ── Nivel 4 / Modo Oficial: 40 ítems ───────────────────────
  // 30 Go (75%) + 10 No-Go (25%)
  // 15 L + 15 R equilibrados dentro de los 30 Go
  const TOTAL_ROUNDS = 40;
  const NOGO_TOTAL = 10;
  const GO_L = 15;
  const GO_R = 15;

  // Generar usando algoritmo de construcción con restricciones clínicas
  let validDeck = false;
  let attempt = [];

  while (!validDeck) {
    attempt = [];
    let counts = { R: GO_R, L: GO_L, NOGO: NOGO_TOTAL };
    let failed = false;

    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      let available = [];
      if (counts.R > 0) available.push('R');
      if (counts.L > 0) available.push('L');
      if (counts.NOGO > 0) available.push('NOGO');

      // Regla: Los primeros 4 deben ser SIEMPRE GO (construir prepotencia motora)
      if (i < 4) {
        available = available.filter(t => t !== 'NOGO');
      }

      // Regla: No terminar con No-Go
      if (i === TOTAL_ROUNDS - 1) {
        available = available.filter(t => t !== 'NOGO');
      }

      // Regla Anticonsecutiva Estricta: mínimo 2 estímulos Go entre cada No-Go
      // Verificar los 2 anteriores: si alguno de ellos fue No-Go, bloquear No-Go
      if (i > 0 && attempt[i - 1] === 'NOGO') {
        available = available.filter(t => t !== 'NOGO');
      }
      if (i > 1 && attempt[i - 2] === 'NOGO') {
        available = available.filter(t => t !== 'NOGO');
      }

      // Regla: No más de 2 Go del mismo tipo consecutivos (evitar L, L, L)
      if (i >= 2) {
        const prev1 = attempt[i - 1];
        const prev2 = attempt[i - 2];
        if (prev1 === prev2 && prev1 !== 'NOGO') {
          available = available.filter(t => t !== prev1);
        }
      }

      if (available.length === 0) {
        failed = true;
        break;
      }

      const pick = available[Math.floor(Math.random() * available.length)];
      counts[pick]--;
      attempt.push(pick);
    }

    if (!failed) validDeck = true;
  }

  return attempt.map(t => {
    if (t === 'R') return { id: 'R', label: 'NARANJO', hex: '#FF8C00', type: 'GO' };
    if (t === 'L') return { id: 'L', label: 'ROJO', hex: '#FF0000', type: 'GO' };
    return NOGO_COLORS[Math.floor(Math.random() * NOGO_COLORS.length)];
  });
}

/**
 * Construye un mazo con restricciones clínicas para Go/No-Go.
 * Garantiza que nunca haya No-Go consecutivos (mín. `minGoBetween` Go entre cada No-Go).
 */
function buildConstrainedDeck(goCount, nogoCount, goFactory, nogoFactory, initialGoRun = 3, minGoBetween = 2) {
  const total = goCount + nogoCount;
  let valid = false;
  let deck;

  while (!valid) {
    deck = [];
    let goRemaining = goCount;
    let nogoRemaining = nogoCount;
    let failed = false;

    for (let i = 0; i < total; i++) {
      let canGo = goRemaining > 0;
      let canNogo = nogoRemaining > 0;

      // Primeros N ensayos siempre Go
      if (i < initialGoRun) canNogo = false;
      // Último ensayo siempre Go
      if (i === total - 1) canNogo = false;

      // Regla anticonsecutiva: verificar los `minGoBetween` anteriores
      for (let k = 1; k <= minGoBetween && canNogo; k++) {
        if (i - k >= 0 && deck[i - k].type === 'NOGO') {
          canNogo = false;
        }
      }

      let options = [];
      if (canGo) options.push('GO');
      if (canNogo) options.push('NOGO');

      if (options.length === 0) { failed = true; break; }

      const pick = options[Math.floor(Math.random() * options.length)];
      if (pick === 'GO') {
        deck.push(goFactory());
        goRemaining--;
      } else {
        deck.push(nogoFactory());
        nogoRemaining--;
      }
    }

    if (!failed && goRemaining === 0 && nogoRemaining === 0) valid = true;
  }

  return deck;
}


export default function ReactionGame({ onExit, activePatientId, addSession, getPatient, sessionMeta, sessionStartTime, isWarmup = false, isDemoMode = false, gameMode = 'official', etiquetaEstudio = null, idSujeto = null, onTelemetryUpdate, omissionTimeoutMs = 1200 }) {
  const { subscribeToMoves, isConnected, openScanner, isKeyboardMode, setKeyboardMode } = useBluetoothCube();
  const { deactivate: deactivateJoicube } = useJoicube();

  const wasConnectedAtStartRef = useRef(isConnected);
  const requireBluetooth = !isKeyboardMode && wasConnectedAtStartRef.current;

  // --- WARMUP TIMER ---
  const [warmupTimeLeft, setWarmupTimeLeft] = useState(15);
  const [warmupFinished, setWarmupFinished] = useState(false);
  const [cubeSize, setCubeSize] = useState(300);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        const width = window.innerWidth;
        if (width < 640) {
          setCubeSize(240); // Móvil
        } else if (width < 1024) {
          setCubeSize(280); // Tablet
        } else {
          setCubeSize(350); // Desktop
        }
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  useEffect(() => {
    if (!isWarmup) return;
    const timer = setInterval(() => {
      setWarmupTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timer);
          setWarmupFinished(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isWarmup]);

  // Al montar: desactivar Joicube para que el cubo vuelva a BLE nativo
  useEffect(() => {
    deactivateJoicube();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mazo generado según el modo de juego
  const deck = useMemo(() => {
    const fullDeck = generateDeck(isWarmup ? 'warmup' : gameMode);
    if (isWarmup || isDemoMode) {
      return fullDeck.slice(0, 5);
    }
    return fullDeck;
  }, [isWarmup, isDemoMode, gameMode]);

  const [stage, setStage] = useState('waiting'); // waiting | stimulus | finished
  const [round, setRound] = useState(0); 
  const [flash, setFlash] = useState(null); // 'red', 'green', 'black', 'grey'
  const [shake, setShake] = useState(0);

  const [results, setResults] = useState([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [showRachaReset, setShowRachaReset] = useState(false); // Para efecto humo

  useEffect(() => {
    if (onTelemetryUpdate) {
      onTelemetryUpdate({ round, results, stage });
    }
  }, [round, results, stage, onTelemetryUpdate]);
  
  // Refs para métricas críticas y lógicas temporales
  const timerRef = useRef(0);
  const nogoTimeoutRef = useRef(null);
  const goTimeoutRef = useRef(null);
  const stageRef = useRef('waiting');
  const targetRef = useRef(null);

  // Curva de Dificultad
  const baseDelayRef = useRef(1500); // 1.5s inicial

  // Tiempos Maestros
  const gameStartTimeRef = useRef(null);

  // --- PAUSA POR DESCONEXIÓN BLE ---
  useEffect(() => {
    if (requireBluetooth && !isConnected && stage !== 'finished' && stage !== 'rules' && round < deck.length) {
      if (nogoTimeoutRef.current) clearTimeout(nogoTimeoutRef.current);
      if (goTimeoutRef.current) clearTimeout(goTimeoutRef.current);
      setStage('waiting');
      stageRef.current = 'waiting';
      setFlash(null);
    }
  }, [isConnected, stage, round, deck?.length, requireBluetooth]);

  // ── CICLO DEL JUEGO ──
  useEffect(() => {
    if (requireBluetooth && !isConnected) return; // Si no hay conexión, pausar programación de estímulos

    if (stage === 'waiting' && round < deck.length) {
      // Jitter Inter-Estímulo (ISI): Rápido y progresivo según avance del test
      // Primeras 5 rondas: 400ms - 600ms | Rondas avanzadas: 250ms - 400ms
      const baseDelay = round < 5 ? 400 : 250;
      const jitter = round < 5 ? Math.random() * 200 : Math.random() * 150;
      const waitTime = Math.max(200, baseDelay + jitter); 
      
      const tid = setTimeout(() => {
        const target = deck[round];
        targetRef.current = target;
        
        setStage('stimulus');
        stageRef.current = 'stimulus';
        timerRef.current = performance.now();

        // Si es NOGO, esperamos la ventana de inhibición seleccionada (1200ms por defecto)
        if (target.type === 'NOGO') {
          nogoTimeoutRef.current = setTimeout(() => {
            const now = new Date();
            // Inhibición Exitosa (No movió)
            setFlash('green');
            setResults(prev => [...prev, { 
              round: round + 1, 
              type: 'NOGO', 
              label: target.label, // Nombre del color distractor
              expected: 'NOGO',
              actualFace: null,
              fail: false, 
              time: null,
              status: 'Ok',
              timestampIso: now.toISOString(),
              timeString: now.toLocaleTimeString('es-CL', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0'),
              timestampUnix: now.getTime()
            }]);
            
            // Logica Rachas: Acierto NOGO
            setCurrentStreak(s => {
              const next = s + 1;
              if (next > maxStreak) setMaxStreak(next);
              return next;
            });

            setStage('waiting');
            stageRef.current = 'waiting';
            setRound(r => r + 1);
            setTimeout(() => setFlash(null), 150);
          }, omissionTimeoutMs); 
        } 
        // Si es GO, le damos el timeout configurable (1200ms por defecto) para responder
        else if (target.type === 'GO') {
          
          goTimeoutRef.current = setTimeout(() => {
            const now = new Date();
            // Límite final excedido (No respondió correctamente a tiempo)
            setFlash('black'); 
            setShake(s => s + 1);
            setCurrentStreak(0);
            setShowRachaReset(true);
            setTimeout(() => setShowRachaReset(false), 600);

            setResults(prev => {
               const existsIdx = prev.findIndex(r => r.round === round + 1);
               if (existsIdx > -1) {
                 const copy = [...prev];
                 copy[existsIdx].timeout = true;
                 copy[existsIdx].status = 'Omisión / Lento';
                 return copy;
               }
               return [...prev, { 
                 round: round + 1, 
                 type: 'GO', 
                 expected: target.id, 
                 actualFace: null, 
                 time: null, 
                 errors: 0, 
                 timeout: true, 
                 status: 'Omisión / Lento',
                 timestampIso: now.toISOString(),
                 timeString: now.toLocaleTimeString('es-CL', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0'),
                 timestampUnix: now.getTime()
               }];
            });

            setStage('waiting');
            stageRef.current = 'waiting';
            setRound(r => r + 1);
            setTimeout(() => setFlash(null), 300);
          }, omissionTimeoutMs);
        }

      }, waitTime);
      
      return () => clearTimeout(tid);
    } else if (stage === 'waiting' && round >= deck.length) {
      setStage('finished');
      stageRef.current = 'finished';
      if (!isWarmup) {
        persistData();
      } else {
        setWarmupFinished(true);
      }
    }
  }, [stage, round, deck, isConnected]);
  
  const persistData = async () => {
    try {
      const goResults = results.filter(r => r.type === 'GO' && !r.timeout);
      const timeTotal = goResults.reduce((acc, r) => acc + (r.time || 0), 0) || 0;
      const gameDuration = gameStartTimeRef.current ? Math.round(performance.now() - gameStartTimeRef.current) : 0;
      const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
      
      // Filtros por mano (Aciertos perfectos -> errors === 0)
      const aciertosRojo = goResults.filter(r => r.expected === 'L' && (r.errors === 0 || r.errors === undefined)).length;
      const aciertosNaranja = goResults.filter(r => r.expected === 'R' && (r.errors === 0 || r.errors === undefined)).length;
      
      // Tiempos por mano
      const goL = goResults.filter(r => r.expected === 'L');
      const goR = goResults.filter(r => r.expected === 'R');

      const avgL = goL.length ? Math.round(goL.reduce((a, r) => a + (r.time || 0), 0) / goL.length) : 0;
      const avgR = goR.length ? Math.round(goR.reduce((a, r) => a + (r.time || 0), 0) / goR.length) : 0;
      
      const nogoFails = results.filter(r => r.type === 'NOGO' && r.fail).length;
      const nogoTotal = results.filter(r => r.type === 'NOGO').length;
      const nogoSuccess = nogoTotal - nogoFails;

      // ── NUEVAS MÉTRICAS CLÍNICAS ──
      // SD: Desviación estándar de tiempos de reacción (consistencia atencional)
      const allGoRTs = goResults.map(r => r.time).filter(t => t && t > 0);
      const avgAllRT = allGoRTs.length > 0 ? allGoRTs.reduce((a, b) => a + b, 0) / allGoRTs.length : 0;
      const sdReactionTime = allGoRTs.length > 1
        ? Math.round(Math.sqrt(allGoRTs.reduce((sum, t) => sum + Math.pow(t - avgAllRT, 2), 0) / (allGoRTs.length - 1)))
        : 0;

      // Control Inhibitorio (% éxito No-Go)
      const inhibitoryControl = nogoTotal > 0 ? Math.round((nogoSuccess / nogoTotal) * 100) : null;

      // Costo de Inhibición: tiempo promedio en el Go inmediatamente después de un No-Go vs Go normal
      let postNoGoRTs = [];
      let normalGoRTs = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i].type === 'GO' && results[i].time > 0 && !results[i].timeout) {
          if (i > 0 && results[i - 1].type === 'NOGO') {
            postNoGoRTs.push(results[i].time);
          } else {
            normalGoRTs.push(results[i].time);
          }
        }
      }
      const avgPostNoGo = postNoGoRTs.length > 0 ? Math.round(postNoGoRTs.reduce((a, b) => a + b, 0) / postNoGoRTs.length) : null;
      const avgNormalGo = normalGoRTs.length > 0 ? Math.round(normalGoRTs.reduce((a, b) => a + b, 0) / normalGoRTs.length) : null;
      const inhibitionCost = (avgPostNoGo !== null && avgNormalGo !== null) ? avgPostNoGo - avgNormalGo : null;

      // Índice de Fatiga: ratio Mitad 2 / Mitad 1
      const halfIdx = Math.floor(allGoRTs.length / 2);
      const firstHalfRTs = allGoRTs.slice(0, halfIdx);
      const secondHalfRTs = allGoRTs.slice(halfIdx);
      const avgFirstHalf = firstHalfRTs.length > 0 ? firstHalfRTs.reduce((a, b) => a + b, 0) / firstHalfRTs.length : 0;
      const avgSecondHalf = secondHalfRTs.length > 0 ? secondHalfRTs.reduce((a, b) => a + b, 0) / secondHalfRTs.length : 0;
      const fatigueIndex = avgFirstHalf > 0 ? Math.round((avgSecondHalf / avgFirstHalf) * 100) / 100 : null;

      // Asimetría Delta (para Nivel 3 y 4)
      const asymmetryDelta = (avgL > 0 && avgR > 0) ? Math.abs(avgL - avgR) : null;

      // Mapeo de nivel
      const levelNumberMap = { single_face: 2, bilateral_pure: 3, official: 4, warmup: 0 };
      const levelNumber = levelNumberMap[gameMode] || 4;

      const sessionData = {
        id: crypto.randomUUID(),
        testType: 'reaction',
        levelMode: gameMode,
        levelNumber: levelNumber,
        date: new Date().toISOString(),
        sessionMeta,
        clinicalLabel: (isWarmup 
          ? 'Calentamiento (Práctica)' 
          : (gameMode === 'single_face' 
              ? 'Nivel 2: Go/No-Go Simple (1 Cara)' 
              : (gameMode === 'bilateral_pure' 
                  ? 'Nivel 3: Bilateralidad Pura (2 Caras)' 
                  : (etiquetaEstudio ? 'Evaluación Oficial' : (sessionMeta?.clinicalLabel || 'Nivel 4: Reaction Mirror (Clínico)')))))
          + (isKeyboardMode ? ' [Modo Teclado - Sin Cubo]' : ''),
        etiquetaEstudio: etiquetaEstudio,
        idSujeto: idSujeto || (getPatient && activePatientId ? getPatient(activePatientId)?.idSujeto : null) || null,
        metrics: { 
          tiempo_total: Math.round(timeTotal),
          aciertos_rojo: aciertosRojo,
          aciertos_naranja: aciertosNaranja,
          errores_falsos: nogoFails,
          tiempo_promedio_por_mano: {
            L: avgL,
            R: avgR
          },
          averageReactionTime: Math.round(((avgL || 0) + (avgR || 0)) / ((avgL && avgR) ? 2 : 1)) || 0,
          sdReactionTime,
          inhibitoryControl,
          inhibitionCost,
          fatigueIndex,
          asymmetryDelta,
          avgFirstHalf: Math.round(avgFirstHalf),
          avgSecondHalf: Math.round(avgSecondHalf),
          game_duration_ms: gameDuration,
          session_duration_ms: sessionDuration,
          max_streak: maxStreak,
          nogoTotal,
          nogoSuccess,
          nogoFails,
          totalTrials: results.length,
          goTrials: results.filter(r => r.type === 'GO').length,
          omissions: results.filter(r => r.type === 'GO' && r.timeout).length,
          commissions: results.filter(r => r.type === 'GO' && r.errors > 0).length,
          // Auditoría Clínica de Modo de Evaluación
          isKeyboardMode: Boolean(isKeyboardMode),
          modo_evaluacion: isKeyboardMode ? 'teclado_sin_cubo' : 'cubo_bluetooth',
          cubo_conectado: !isKeyboardMode,
          inputMode: isKeyboardMode ? 'teclado' : 'cubo_ble'
        },
        rawTurnsData: results
      };

      let savedSession = null;
      if (!isWarmup) {
        if (typeof addSession === 'function') {
          savedSession = await addSession(activePatientId, sessionData);
        } else {
          console.warn('[ReactionGame] addSession no disponible, estructurando sesión localmente');
          savedSession = {
            sessionId: 'local-' + Date.now(),
            ...sessionData,
            stats: sessionData.metrics
          };
        }
      } else {
        savedSession = {
          sessionId: 'warmup-' + Date.now(),
          testType: 'reaction',
          attemptNumber: 0,
          clinicalLabel: 'Calentamiento (Práctica)',
          date: new Date().toISOString(),
          stats: sessionData.metrics,
          rawTurnsData: sessionData.rawTurnsData
        };
      }
      const patientObj = getPatient ? getPatient(activePatientId) : null;

      if (onExit) onExit(savedSession, patientObj);
    } catch (err) {
      console.error('[ReactionGame] Error durante persistData:', err);
      // Fallback seguro para NUNCA quedarse bloqueado
      if (onExit) {
        onExit({
          sessionId: 'fallback-' + Date.now(),
          testType: 'reaction',
          date: new Date().toISOString(),
          stats: { max_streak: maxStreak, rawTurnsData: results },
          rawTurnsData: results
        }, getPatient ? getPatient(activePatientId) : null);
      }
    }
  };

  // ── BLUETOOTH LISTENER ──
  const handleMove = useCallback((movimiento) => {

    if (stageRef.current !== 'stimulus') return;

    const rt = performance.now() - timerRef.current;
    const target = targetRef.current;
    const currentMove = movimiento.replace("'", ""); // Limpiamos giros antihorarios
    const now = new Date();
    const timeInfo = {
      timestampIso: now.toISOString(),
      timeString: now.toLocaleTimeString('es-CL', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0'),
      timestampUnix: now.getTime(),
      rawMoveNotation: movimiento
    };

    if (target.type === 'NOGO') {
      // FALLLO DE INHIBICIÓN SI SE MUEVE
      clearTimeout(nogoTimeoutRef.current);
      setFlash('black'); // Flash obscuro para fallo grave
      setShake(s => s + 1);
      
      setResults(prev => [...prev, { 
        round: round + 1, 
        type: 'NOGO', 
        label: target.label, 
        expected: 'NOGO',
        actualFace: currentMove,
        fail: true, 
        time: Math.round(rt), // Velocidad de Impulso (Clínico)
        status: 'Fallo de Inhibición',
        ...timeInfo
      }]);
      
      // Reset Racha por fallo No-Go
      setCurrentStreak(0);
      setShowRachaReset(true);
      setTimeout(() => setShowRachaReset(false), 600);

      setStage('waiting');
      stageRef.current = 'waiting';
      setRound(r => r + 1);
      setTimeout(() => setFlash(null), 300);

    } else if (target.type === 'GO') {
      if (currentMove === target.id) {
        // ACIERTO
        clearTimeout(goTimeoutRef.current);
        setFlash('green');

        // Aumenta la velocidad para el siguiente Hit! (x0.9)
        baseDelayRef.current = Math.max(500, baseDelayRef.current * 0.9); 
        
        // Logica Rachas
        setCurrentStreak(s => {
          const next = s + 1;
          if (next > maxStreak) setMaxStreak(next);
          return next;
        });

        setResults(prev => {
          // Si ya hubo un error previo en esta ronda, lo marcamos como Corregido
          const hasError = prev.some(r => r.round === round + 1 && r.status === 'Error de Lado');
          return [...prev, { 
            round: round + 1, 
            type: 'GO', 
            expected: target.id, 
            actualFace: target.id,
            time: Math.round(rt), 
            errors: hasError ? 1 : 0, 
            status: hasError ? 'Corregido' : 'Ok',
            ...timeInfo
          }];
        });

        setStage('waiting');
        stageRef.current = 'waiting';
        setRound(r => r + 1);
        setTimeout(() => setFlash(null), 150); // REFINADO: Transición ultra-rápida (150ms)
      } else {
        // ERROR DE LADO EN GO PROSPECT (Se equivocó de mano)
        setFlash('red');
        setShake(s => s + 1);

        setResults(prev => [...prev, { 
          round: round + 1, 
          type: 'GO', 
          expected: target.id, 
          actualFace: currentMove,
          time: Math.round(rt), 
          errors: 1, 
          status: 'Error de Lado',
          ...timeInfo
        }]);

        // Reset racha por error de mano
        setCurrentStreak(0);
        setShowRachaReset(true);
        setTimeout(() => setShowRachaReset(false), 600);

        // -- NO CAMBIAMOS EL STAGE --
        // Mantenemos el estímulo activo para permitir Redención
        setTimeout(() => setFlash(null), 300);
      }
    }
  }, [round]);

  useEffect(() => {
    const unsub = subscribeToMoves(handleMove);
    return () => {
      unsub();
      clearTimeout(nogoTimeoutRef.current);
      clearTimeout(goTimeoutRef.current);
    };
  }, [subscribeToMoves, handleMove]);

  // Atajos teclado
  useEffect(() => {
    const onKey = (e) => {
      const keyUpper = e.key.toUpperCase();
      // En Nivel 2 (single_face): la barra espaciadora activa el GO (Rojo / 'L')
      if (gameMode === 'single_face' && (e.key === ' ' || e.key === 'Spacebar')) {
        e.preventDefault();
        handleMove('L');
        return;
      }

      if (e.key === 'ArrowRight' || keyUpper === 'L') handleMove('R');
      if (e.key === 'ArrowLeft' || keyUpper === 'A') handleMove('L');
      if (e.key === 'ArrowUp') handleMove('U');
      if (e.key === 'Enter') handleMove('L2');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove, gameMode]);

  // ── RENDER ──
  // --- PAUSA POR DESCONEXIÓN ---
  const isGameActive = stage !== 'finished' && stage !== 'rules' && round < deck.length;
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
            onClick={openScanner}
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

  if (isWarmup && warmupFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-[#07080f] text-white absolute inset-0 z-50 font-sans select-none">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-orange-600/10 blur-[130px]" />
        </div>
        
        <div className="relative z-10 flex flex-col items-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-3xl mb-6 shadow-lg shadow-orange-500/5 animate-bounce">
            
          </div>
          <h2 className="text-2xl font-black mb-3 text-white tracking-tight uppercase">Calentamiento Finalizado</h2>
          <p className="text-slate-400 text-xs font-semibold leading-relaxed mb-8">
            Has completado la práctica libre de 15 segundos. Ahora ya sabes cómo reaccionar a las caras del cubo Rubik según los colores de la pantalla.
          </p>
          <button
            onClick={() => onExit(null)}
            className="w-full py-4.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:shadow-[0_0_30px_rgba(249,115,22,0.3)] hover:scale-105 active:scale-95 transition-all text-white font-black uppercase text-[10px] tracking-widest rounded-2xl cursor-pointer"
          >
            Entendido, volver al menú
          </button>
        </div>
      </div>
    );
  }

  const activeColor = stage === 'stimulus' ? targetRef.current.hex : 'transparent';
  let bgColorClass = 'bg-[#07080f]';
  if (flash === 'red') bgColorClass = 'bg-[#4a0000]';
  else if (flash === 'green') bgColorClass = 'bg-[#003a00]';
  else if (flash === 'black') bgColorClass = 'bg-stone-900'; // Flash de error NOGO/TimeOut

  return (
    <div className={`relative w-full h-screen overflow-hidden flex items-center justify-center transition-colors duration-[0.1s] ${bgColorClass}`}>
      {isWarmup && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 bg-orange-500/10 border border-orange-500/25 rounded-full flex items-center gap-3 text-[10px] font-black text-orange-400 uppercase tracking-widest backdrop-blur-md shadow-lg shadow-orange-500/5 select-none">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping shrink-0" />
          Modo Calentamiento (Tiempo: {warmupTimeLeft}s)
        </div>
      )}
      
      {/* ── FASE: JUEGO ── */}
      {stage !== 'rules' && (
        <>
          {/* Estímulo de fondo destellante ultrarrápido */}
          {stage === 'stimulus' && (
            <div 
              className="absolute inset-0 z-0 transition-opacity duration-[0.05s]"
              style={{
                background: `radial-gradient(circle at center, ${activeColor}90 0%, transparent 80%)`
              }}
            />
          )}

          {/* CUBITO VIRTUAL Y TEXTO */}
          <div className="z-10 flex flex-col items-center justify-center w-full max-w-sm gap-8 relative">
            <motion.div 
              animate={{ x: shake ? [-25, 25, -20, 20, -10, 10, 0] : 0 }}
              transition={{ duration: 0.2 }}
              className={`rounded-3xl p-2 transition-all duration-[0.05s] ${stage === 'stimulus' ? 'border-[3px] bg-black/60 backdrop-blur-md' : 'border border-white/5 bg-white/[0.02]'}`}
              style={{ 
                borderColor: stage === 'stimulus' ? activeColor : 'rgba(255,255,255,0.05)',
                boxShadow: stage === 'stimulus' ? `0 0 120px ${activeColor}` : 'none'
              }}
            >
              <Cube3DViewer size={cubeSize} isLocked={true} />
              
              {/* FEEDBACK ON-FIRE */}
              <AnimatePresence>
                {currentStreak > 0 && (
                  <motion.div 
                    initial={{ opacity:0, x: 20 }} animate={{ opacity:1, x: 0 }} exit={{ opacity:0, scale:0.5 }}
                    className="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-20"
                  >
                    <div 
                      className="relative"
                      style={{ transform: `scale(${Math.min(1 + (currentStreak * 0.05), 2.5)})` }} // REFINADO: Escalamiento dinámico
                    >
                      {currentStreak > 5 && (
                        <motion.div 
                          animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0], filter: ['blur(10px)', 'blur(20px)', 'blur(10px)'] }}
                          transition={{ repeat: Infinity, duration: 0.5 }}
                          className="absolute inset-0 bg-orange-600 rounded-full opacity-60 z-0" 
                        />
                      )}
                      <div className="relative z-10 flex flex-col items-center">
                         <span className="text-orange-500 font-extrabold text-xs tracking-tighter uppercase">Streak</span>
                         <span className="text-white font-black text-4xl leading-none">{currentStreak}</span>
                         {currentStreak >= 3 && (
                           <motion.span 
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="bg-orange-500 text-black text-[10px] font-black px-2 py-0.5 rounded mt-1 shadow-[0_0_15px_#f97316]"
                           >
                             x{Math.floor(currentStreak/3) + 1}
                           </motion.span>
                         )}
                         {currentStreak > 5 && <span className="text-2xl mt-1"></span>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* EFECTO HUMO (RESET) */}
              <AnimatePresence>
                {showRachaReset && (
                  <motion.div 
                    initial={{ opacity: 1, scale: 0.5, y: 0 }}
                    animate={{ opacity: 0, scale: 2, y: -50 }}
                    className="absolute inset-0 bg-white/10 rounded-3xl z-40 backdrop-blur-sm pointer-events-none flex items-center justify-center font-black text-white/40 tracking-widest text-lg"
                  >
                    COMBO BREAKER
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Cajas de texto limpias Zero-Scroll */}
            <div className="h-24 flex items-center justify-center">
              <AnimatePresence mode="wait">
                {stage === 'waiting' && round < deck.length && (
                  <motion.p key="wait" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{ duration: 0.1 }} className="text-white/20 uppercase tracking-[0.5em] font-black cursor-default">
                    Atento...
                  </motion.p>
                )}
                {stage === 'stimulus' && (
                  <motion.h1 
                    key="stim" initial={{opacity:0, scale:0.7}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:1.2}}
                    transition={{ duration: 0.05 }}
                    className="text-6xl md:text-8xl font-black uppercase tracking-tighter"
                    style={{ color: activeColor, textShadow: `0 0 50px ${activeColor}` }}
                  >
                    {targetRef.current.label}
                  </motion.h1>
                )}
              </AnimatePresence>
            </div>
            
            <span className="absolute top-4 right-4 text-[10px] font-black tracking-widest text-white/30 uppercase bg-white/5 px-3 py-1 rounded-full border border-white/10">
              Ronda {Math.min(round + 1, deck.length)} / {deck.length}
            </span>
          </div>

          {/* ── MODO TECLADO (SIN CUBO): LEYENDA VISUAL EN ESQUINA Y CONTROLES EN PANTALLA ── */}
          {isKeyboardMode && (
            <>
              {/* Leyenda Visual Cromática en la esquina superior izquierda */}
              <div className="absolute top-4 left-4 z-40 bg-[#0d111d]/90 backdrop-blur-md border border-amber-500/30 rounded-2xl p-3 shadow-xl max-w-xs text-left animate-in fade-in duration-200">
                <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-white/10">
                  <span className="text-sm">⌨️</span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 font-mono">
                    Modo Teclado Activo
                  </span>
                </div>
                
                <div className="flex flex-col gap-1.5 text-[11px]">
                  {gameMode === 'single_face' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-red-600 flex items-center justify-center text-white font-black text-[10px] shadow-sm">
                          ESP
                        </span>
                        <span className="text-white/80 font-medium">ROJO: Barra Espaciadora o A</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-orange-500 flex items-center justify-center text-black font-black text-[10px]">
                          ✋
                        </span>
                        <span className="text-orange-300/80 font-medium">NARANJA: ¡No toques nada!</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-red-600 flex items-center justify-center text-white font-black text-[10px] shadow-sm">
                          A
                        </span>
                        <span className="text-white/80 font-medium">ROJO: Tecla A (Mano Izq)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-orange-500 flex items-center justify-center text-white font-black text-[10px] shadow-sm">
                          L
                        </span>
                        <span className="text-white/80 font-medium">NARANJA: Tecla L (Mano Der)</span>
                      </div>
                      {gameMode === 'official' && (
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-white font-black text-[10px]">
                            ✋
                          </span>
                          <span className="text-blue-300/80 font-medium">AZUL / VERDE: ¡Inhibe!</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Botones Táctiles / Clic en Pantalla (Abajo) */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4">
                {gameMode === 'single_face' ? (
                  <button
                    type="button"
                    onClick={() => handleMove('L')}
                    className="px-8 py-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 active:scale-95 text-white font-black rounded-2xl border border-red-400/40 shadow-[0_0_25px_rgba(220,38,38,0.5)] flex items-center gap-3 cursor-pointer transition-all"
                  >
                    <span className="text-xs font-mono bg-black/30 px-2.5 py-1 rounded-lg border border-white/20">
                      ESPACIO
                    </span>
                    <span className="text-sm uppercase tracking-wider">¡GIRAR CARA ROJA!</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-4 sm:gap-6 bg-black/40 backdrop-blur-md p-2.5 rounded-3xl border border-white/10 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => handleMove('L')}
                      className="px-6 sm:px-8 py-3.5 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 active:scale-95 text-white font-black rounded-2xl border border-red-400/40 shadow-[0_0_20px_rgba(220,38,38,0.4)] flex items-center gap-2.5 cursor-pointer transition-all"
                    >
                      <span className="text-xs font-mono bg-black/30 px-2 py-0.5 rounded-lg border border-white/20">
                        A
                      </span>
                      <span className="text-xs sm:text-sm uppercase tracking-wider">ROJO (IZQ)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMove('R')}
                      className="px-6 sm:px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 active:scale-95 text-white font-black rounded-2xl border border-orange-400/40 shadow-[0_0_20px_rgba(249,115,22,0.4)] flex items-center gap-2.5 cursor-pointer transition-all"
                    >
                      <span className="text-xs sm:text-sm uppercase tracking-wider">NARANJA (DER)</span>
                      <span className="text-xs font-mono bg-black/30 px-2 py-0.5 rounded-lg border border-white/20">
                        L
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

    </div>
  );
}
