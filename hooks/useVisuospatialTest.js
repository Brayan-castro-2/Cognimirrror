import { useState, useEffect, useCallback, useRef } from 'react';

// Caras activas de input: Blanco (U), Amarillo (D), Naranja (R), Rojo (L), Azul (F), Verde (B)
const VALID_FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const GENERATE_FACES = ['U', 'D', 'R', 'L', 'F'];

/**
 * Hook clínico para el Test de Bloques de Corsi 3D (Memory Mirror - Nivel 5)
 * 
 * Evalúa:
 * - Amplitud de memoria de trabajo visoespacial (Corsi Span)
 * - Retención secuencial y latencia intra-movimiento
 * - Clasificación granular de errores: Omisión, Inversión de orden, Giro erróneo
 * 
 * Regla de Discontinuación: Si falla 2 intentos consecutivos (A y B)
 * en la misma longitud de secuencia, el test termina.
 */
export function useVisuospatialTest(isConnected = true, requireBluetooth = true) {
  const [gameState, setGameState] = useState('idle'); // idle | showing_sequence | waiting_for_user | level_up_delay | error_delay | finished
  const [level, setLevel] = useState(2); // Comienza en nivel 2 (span de longitud 2)
  const [trial, setTrial] = useState('A'); // 'A' o 'B' para el doble intento clínico
  const [sequence, setSequence] = useState([]);
  const [activeFace, setActiveFace] = useState(null); // Cara encendida en el Gemelo Digital
  const [userIndex, setUserIndex] = useState(0); // Posición actual que el usuario debe replicar
  const [showingIndex, setShowingIndex] = useState(-1); // Índice de secuencia mostrando
  const [errorsInLevel, setErrorsInLevel] = useState(0); // Cantidad de fallas en el nivel actual
  const [telemetry, setTelemetry] = useState([]);
  const [currentLatencies, setCurrentLatencies] = useState([]); // Array de latencias del intento actual
  const [corsiSpan, setCorsiSpan] = useState(0); // Último nivel completado exitosamente
  const [maxLevelReached, setMaxLevelReached] = useState(2); // Nivel más alto intentado

  // Refs para métricas de tiempo y descarte de re-alineación
  const lastEventTimeRef = useRef(null);
  const playbackTimeoutRef = useRef(null);
  const sequenceStartTimeRef = useRef(null); // Cuando empezó la fase de reproducción del usuario
  
  // Filtro de re-alineación de capas (cooldown de 1200ms para caras consecutivas idénticas)
  const lastInputFaceRef = useRef(null);
  const lastInputTimeRef = useRef(0);

  // Tracking de inputs del usuario para clasificación de errores
  const userInputsRef = useRef([]);

  /**
   * Generador de Secuencia Corsi Mejorado
   * Ninguna cara puede repetirse en los últimos 2 movimientos (evita U, L, U).
   */
  const generateSequence = useCallback((span) => {
    const newSeq = [];
    for (let i = 0; i < span; i++) {
      let nextFace;
      do {
        nextFace = GENERATE_FACES[Math.floor(Math.random() * GENERATE_FACES.length)];
      } while (
        (newSeq.length > 0 && nextFace === newSeq[newSeq.length - 1]) ||
        (newSeq.length > 1 && nextFace === newSeq[newSeq.length - 2])
      );
      newSeq.push(nextFace);
    }
    return newSeq;
  }, []);

  const startGame = useCallback(() => {
    setLevel(2);
    setTrial('A');
    setErrorsInLevel(0);
    setTelemetry([]);
    setCorsiSpan(0);
    setMaxLevelReached(2);
    setCurrentLatencies([]);
    const seq = generateSequence(2);
    setSequence(seq);
    setGameState('showing_sequence');
    lastInputFaceRef.current = null;
    lastInputTimeRef.current = 0;
    userInputsRef.current = [];
  }, [generateSequence]);

  // --- PAUSA POR DESCONEXIÓN BLE ---
  useEffect(() => {
    if (requireBluetooth && !isConnected && gameState !== 'idle' && gameState !== 'finished') {
      if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
      setActiveFace(null);
      setShowingIndex(-1);
      setGameState('showing_sequence');
      setUserIndex(0);
    }
  }, [isConnected, gameState, requireBluetooth]);

  /**
   * Reproducción de Secuencia (Gemelo Digital)
   * Recorre la secuencia actual encendiendo/apagando caras con ritmo ágil y fluido.
   */
  useEffect(() => {
    if (requireBluetooth && !isConnected) return;

    if (gameState === 'showing_sequence' && sequence.length > 0) {
      let index = 0;
      let isMounted = true;
      setActiveFace(null);
      setShowingIndex(-1);
      userInputsRef.current = [];

      // Breve pausa inicial de 400ms antes de iniciar los estímulos
      const initialDelayTimeout = setTimeout(() => {
        if (!isMounted) return;

        const playNext = () => {
          if (!isMounted) return;
          
          if (index < sequence.length) {
            // Encender cara
            setActiveFace(sequence[index]);
            setShowingIndex(index);
            playbackTimeoutRef.current = setTimeout(() => {
              if (!isMounted) return;
              // Apagar cara
              setActiveFace(null);
              playbackTimeoutRef.current = setTimeout(() => {
                index++;
                playNext();
              }, 200); // 200ms apagada entre estímulos
            }, 650); // 650ms encendida (ágil y nítida)
          } else {
            // Terminó la reproducción de la secuencia
            setActiveFace(null);
            setShowingIndex(-1);
            setGameState('waiting_for_user');
            setUserIndex(0);
            
            // Limpiar caché de input para nueva respuesta del usuario
            lastInputFaceRef.current = null;
            lastInputTimeRef.current = 0;
            userInputsRef.current = [];
            
            // Timestamp: Comienza el reloj para la latencia del primer input del usuario
            lastEventTimeRef.current = performance.now();
            sequenceStartTimeRef.current = performance.now();
          }
        };

        playNext();
      }, 400);

      return () => {
        isMounted = false;
        clearTimeout(initialDelayTimeout);
        if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
      };
    }
  }, [gameState, sequence, isConnected, requireBluetooth]);

  /**
   * Clasificación Granular de Error Corsi
   * Analiza los inputs del usuario contra la secuencia esperada para determinar el tipo de error.
   */
  const classifyError = useCallback((userInputs, expectedSequence, failedAtIndex) => {
    // 1. Giro Erróneo: el usuario giró una cara incorrecta en esta posición
    const expected = expectedSequence[failedAtIndex];
    const actual = userInputs[failedAtIndex];
    
    if (!actual) return 'omission'; // No hubo input (timeout o vacío)

    // 2. Inversión de Orden: ¿el usuario produjo las caras correctas pero en orden invertido?
    const expectedFutureIdx = expectedSequence.indexOf(actual, failedAtIndex + 1);
    const wasExpectedBefore = failedAtIndex > 0 && expectedSequence.slice(0, failedAtIndex).includes(actual);
    
    if (expectedFutureIdx !== -1 || wasExpectedBefore) {
      return 'inversion'; // La cara existe en la secuencia pero en posición equivocada
    }

    // 3. Giro Erróneo: cara completamente incorrecta
    if (!expectedSequence.includes(actual)) {
      return 'wrong_face';
    }

    return 'wrong_position';
  }, []);

  /**
   * Manejador de Input del Usuario
   * Se dispara instantáneamente vía giros del cubo o teclado.
   */
  const handleCubeInput = useCallback((face) => {
    const normalizedFace = face.replace("'", "");

    // Solo registrar si estamos esperando input y es una cara válida.
    if (gameState !== 'waiting_for_user' || !VALID_FACES.includes(normalizedFace)) {
      return;
    }

    const now = performance.now();

    // ── FILTRO ANTI-REBOTE LIGERO (180ms COOLDOWN) ──
    if (normalizedFace === lastInputFaceRef.current && (now - lastInputTimeRef.current) < 180) {
      return;
    }

    lastInputFaceRef.current = normalizedFace;
    lastInputTimeRef.current = now;

    const latency = now - lastEventTimeRef.current;
    lastEventTimeRef.current = now; 

    const expectedFace = sequence[userIndex];
    const isCorrect = normalizedFace === expectedFace;

    // Registrar input del usuario para clasificación de errores
    userInputsRef.current.push(normalizedFace);

    const currentLatencyMs = Math.round(latency);
    const isFirstMove = userIndex === 0;
    const latencyFromSequenceEnd = isFirstMove && sequenceStartTimeRef.current
      ? Math.round(now - sequenceStartTimeRef.current)
      : null;

    let errorType = null;
    if (!isCorrect) {
      errorType = classifyError(userInputsRef.current, sequence, userIndex);
    }

    // Guardar telemetría del turno individual
    setTelemetry(prev => [...prev, {
      level,
      trial,
      positionInSequence: userIndex,
      sequenceLength: sequence.length,
      expectedFace,
      userFace: normalizedFace,
      isCorrect,
      latencyMs: currentLatencyMs,
      latencyFromSequenceEnd,
      isFirstMove,
      errorType,
      errorClassification: errorType,
      moveLatencies: isCorrect ? [...currentLatencies, currentLatencyMs] : currentLatencies,
      timestamp: Date.now()
    }]);

    if (isCorrect) {
      setCurrentLatencies(prev => [...prev, currentLatencyMs]);

      // Si completó la secuencia actual con éxito
      if (userIndex + 1 === sequence.length) {
        // ¡NIVEL COMPLETADO!
        const newSpan = level;
        if (newSpan > corsiSpan) {
          setCorsiSpan(newSpan);
        }

        setGameState('level_up_delay');
        setTimeout(() => {
          const nextLevel = level + 1;
          setLevel(nextLevel);
          setMaxLevelReached(Math.max(maxLevelReached, nextLevel));
          setTrial('A');
          setErrorsInLevel(0);
          setCurrentLatencies([]);
          userInputsRef.current = [];
          setSequence(generateSequence(nextLevel));
          setGameState('showing_sequence');
        }, 900); // 900ms para transición fluida
      } else {
        // Avanza al siguiente paso de la secuencia
        setUserIndex(userIndex + 1);
      }
    } else {
      // ── FALLA EN LA SECUENCIA ──
      const newErrorsCount = errorsInLevel + 1;
      setErrorsInLevel(newErrorsCount);
      
      setGameState('error_delay');
      
      setTimeout(() => {
        setCurrentLatencies([]);
        userInputsRef.current = [];
        if (trial === 'A') {
          setTrial('B');
          setSequence(generateSequence(level));
          setGameState('showing_sequence');
        } else {
          setGameState('finished');
        }
      }, 900); // 900ms para transición fluida
    }
  }, [gameState, sequence, userIndex, level, trial, errorsInLevel, generateSequence, classifyError, corsiSpan, currentLatencies, maxLevelReached]);

  // Calcular estadísticas finales
  const finalStats = gameState === 'finished' ? {
    corsiSpan,
    maxLevelReached: Math.max(maxLevelReached, level),
    totalTrials: telemetry.length,
    correctTrials: telemetry.filter(t => t.isCorrect).length,
    // Latencia promedio del primer movimiento por nivel
    avgFirstMoveLatency: Math.round(
      telemetry.filter(t => t.isFirstMove && t.isCorrect)
        .reduce((sum, t) => sum + t.latencyMs, 0) /
      Math.max(1, telemetry.filter(t => t.isFirstMove && t.isCorrect).length)
    ),
    // Latencia promedio entre movimientos consecutivos (intra-secuencia)
    avgIntraMoveLatency: Math.round(
      telemetry.filter(t => !t.isFirstMove && t.isCorrect)
        .reduce((sum, t) => sum + t.latencyMs, 0) /
      Math.max(1, telemetry.filter(t => !t.isFirstMove && t.isCorrect).length)
    ),
    // Clasificación de errores
    errorsByType: {
      omission: telemetry.filter(t => t.errorType === 'omission').length,
      inversion: telemetry.filter(t => t.errorType === 'inversion').length,
      wrongFace: telemetry.filter(t => t.errorType === 'wrong_face').length,
      wrongPosition: telemetry.filter(t => t.errorType === 'wrong_position').length
    },
    totalErrors: telemetry.filter(t => !t.isCorrect).length
  } : null;

  return {
    gameState,
    level,
    trial,
    sequence,
    activeFace, // Cara encendida para Gemelo Digital
    userIndex,
    showingIndex,
    errorsInLevel,
    telemetry,
    corsiSpan,
    maxLevelReached,
    finalStats,
    startGame,
    handleCubeInput
  };
}
