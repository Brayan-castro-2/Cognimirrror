'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import BluetoothScanner from '../components/BluetoothScanner';

const SERVICE_UUID    = '12345678-1234-5678-1234-56789abcdef0';
// const CHAR_LED_UUID   = '12345678-1234-5678-1234-56789abcdef1';
const CHAR_GYRO_UUID  = 'beb5483e-36e1-4688-b7f5-ea07361b26a9';

// Creamos el contexto
const BluetoothContext = createContext(null);

export function BluetoothProvider({ children }) {
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [latencyOffset, setLatencyOffset] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState(null); // { ble, render, total }
  
  // --- MODO TECLADO (SIN CUBO) ---
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);

  useEffect(() => {
    try {
      const savedKb = localStorage.getItem('COGNIMIRROR_KEYBOARD_MODE') === 'true';
      if (savedKb) setIsKeyboardMode(true);
    } catch (_) {}
  }, []);

  const toggleKeyboardMode = useCallback(() => {
    setIsKeyboardMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('COGNIMIRROR_KEYBOARD_MODE', String(next));
      } catch (_) {}
      return next;
    });
  }, []);

  const setKeyboardMode = useCallback((val) => {
    setIsKeyboardMode(Boolean(val));
    try {
      localStorage.setItem('COGNIMIRROR_KEYBOARD_MODE', String(Boolean(val)));
    } catch (_) {}
  }, []);

  // Simulación de movimiento manual (para botones en pantalla y teclado)
  const simulateMove = useCallback((notation) => {
    if (!notation) return;
    broadcastMove(notation);
  }, []);
  
  // --- EXPERT GYRO STATES ---
  const [gyroOffset, setGyroOffset] = useState({ x: 0, y: 0, z: 0 });
  const [gyroConfig, setGyroConfig] = useState({
    invertX: true, 
    invertY: true, 
    invertZ: false,
    swapXY: true,
    swapYZ: true,
    swapXZ: false
  });
  const currentRawGyro = useRef({ x: 0, y: 0, z: 0 });
  
  // Refs para evitar el problema de 'stale closure' en el listener de Bluetooth
  const gyroConfigRef = useRef(gyroConfig);
  const gyroOffsetRef = useRef(gyroOffset);
  const gyroLastUpdateRef = useRef(0);

  useEffect(() => { gyroConfigRef.current = gyroConfig; }, [gyroConfig]);
  useEffect(() => { gyroOffsetRef.current = gyroOffset; }, [gyroOffset]);

  // Cargar offset guardado al montar
  useEffect(() => {
    const saved = parseInt(localStorage.getItem('SYSTEM_LATENCY_OFFSET') || '0', 10);
    if (saved > 0) setLatencyOffset(saved);
  }, []);
  
  // Guardamos las referencias al servidor BLE internamente
  const serverRef = useRef(null);
  const batIntervalRef = useRef(null);

  // Almacena callbacks de los componentes hijos que quieren enterarse de los movimientos
  const moveListenersRef = useRef(new Set());
  // Deduplicación temporal: descarta el mismo paquete si llega en < 40ms (evita retransmisiones BLE)
  // Pero permite paquetes idénticos separados por > 40ms (ráfagas U+U legítimas)
  const lastPacketFingerprint = useRef("");
  const lastPacketTimeRef = useRef(0);
  const gyroListenersRef = useRef(new Set());
  const moveCompleteListenersRef = useRef(new Set());
  // Feed de movimientos en tiempo real: emite { notation, timestamp, source } para la pantalla de config
  const moveFeedListenersRef = useRef(new Set());

  const subscribeToMoves = useCallback((callback) => {
    moveListenersRef.current.add(callback);
    return () => moveListenersRef.current.delete(callback);
  }, []);

  // subscribeToMoveComplete: recibe { notation, motorExecutionMs } cuando la cara termina de girar
  const subscribeToMoveComplete = useCallback((callback) => {
    moveCompleteListenersRef.current.add(callback);
    return () => moveCompleteListenersRef.current.delete(callback);
  }, []);

  // subscribeToMoveFeed: recibe { notation, timestamp, source } para el panel de diagnóstico BLE
  const subscribeToMoveFeed = useCallback((callback) => {
    moveFeedListenersRef.current.add(callback);
    return () => moveFeedListenersRef.current.delete(callback);
  }, []);

  const subscribeToGyro = useCallback((callback) => {
    gyroListenersRef.current.add(callback);
    return () => gyroListenersRef.current.delete(callback);
  }, []);

  // Emisores internos
  const broadcastMove = (notation) => {
    moveListenersRef.current.forEach(cb => cb(notation));
  };
  const broadcastMoveComplete = (notation, motorExecutionMs) => {
    moveCompleteListenersRef.current.forEach(cb => cb({ notation, motorExecutionMs }));
  };
  const broadcastGyro = (data) => {
    gyroListenersRef.current.forEach(cb => cb(data));
  };
  const broadcastMoveFeed = (notation, source) => {
    const entry = { notation, timestamp: Date.now(), source };
    moveFeedListenersRef.current.forEach(cb => cb(entry));
  };

  // Handler para giroscopio (ESP32 / CogniMirror Custom HW)
  const handleGyroData = (event) => {
    try {
      const now = performance.now();
      if (now - gyroLastUpdateRef.current < 16) return; // Throttle a ~60fps
      gyroLastUpdateRef.current = now;

      const b = event.target.value;
      const str = new TextDecoder().decode(b);
      // El sensor envía JSON: {"x": 0.0, "y": 0.0, "z": 0.0}
      const rawData = JSON.parse(str);
      
      if (rawData && typeof rawData.x === 'number') {
        // 1. Guardar en Ref para calibración instantánea
        currentRawGyro.current = rawData;

        // 2. Aplicar Offset para 'Punto Cero' (Usando ref para tiempo real)
        const xWithOffset = rawData.x - gyroOffsetRef.current.x;
        const yWithOffset = rawData.y - gyroOffsetRef.current.y;
        const zWithOffset = rawData.z - gyroOffsetRef.current.z;

        // 3. --- ZONA DE MAPEO DINÁMICA (CONTROLADA DESDE UI) ---
        let rx = xWithOffset;
        let ry = yWithOffset;
        let rz = zWithOffset;

        const config = gyroConfigRef.current;

        // Swapping (Permutaciones)
        if (config.swapXY) [rx, ry] = [ry, rx];
        if (config.swapYZ) [ry, rz] = [rz, ry];
        if (config.swapXZ) [rx, rz] = [rz, rx];
        
        // Inversiones
        const finalX = rx * (config.invertX ? -1 : 1);
        const finalY = ry * (config.invertY ? -1 : 1);
        const finalZ = rz * (config.invertZ ? -1 : 1);
        // -----------------------------------------------------

        broadcastGyro({ x: finalX, y: finalY, z: finalZ });
      }
    } catch(e) {
      // Ignorar basura serial/BLE parcial
    }
  };

  const calibrateGyro = useCallback(() => {
    console.log("Calibrando punto cero con:", currentRawGyro.current);
    setGyroOffset({ ...currentRawGyro.current });
  }, []);

  const processValidatedMove = (moveId, subBuffer) => {
    // 1. Filtrado de retransmisiones de red pura (mismo sequence ID)
    const fingerprint = Array.from(subBuffer).join(',');
    if (lastPacketFingerprint.current === fingerprint) return;
    lastPacketFingerprint.current = fingerprint;

    const faceTable = ["F", "F'", "B", "B'", "U", "U'", "D", "D'", "L", "L'", "R", "R'"];
    
    if (moveId >= 0 && moveId < faceTable.length) {
      const finalMove = faceTable[moveId];

      const now = performance.now();
      window.lastFaceCache = finalMove;
      lastPacketTimeRef.current = now;

      console.log(`[SPEEDCUBE MOVE]: ${finalMove} (ID: ${moveId})`);
      broadcastMove(finalMove);
      // Mantenemos el feed opcional agregado para los Joysticks
      if (typeof broadcastMoveFeed === 'function') broadcastMoveFeed(finalMove, 'native');
    }
  };

  const handleRubiksData = (event) => {
    const dv = event.target.value;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x2a) { // Start '*' (42)
        const type = bytes[i + 1];
        
        if (type === 6) {
          const sub = bytes.slice(i, i + 8);
          if (sub.length >= 4) {
            processValidatedMove(sub[3], sub);
          }
          i += 7;
        } else if (type === 8) {
          if (bytes[i + 2] === 1) { // Multi-move pulse
            const sub = bytes.slice(i, i + 10);
            processValidatedMove(sub[3], sub); // Primer giro de la ráfaga
            if (sub[5] >= 0 && sub[5] <= 11 && sub[5] !== sub[3]) {
              processValidatedMove(sub[5], sub); // Segundo giro (si existe)
            }
          }
          i += 9;
        }
      }
    }
  };

  const onDisconnected = useCallback(() => {
    setIsConnected(false);
    setDevice(null);
    setBatteryLevel(null);
    serverRef.current = null;
    if (batIntervalRef.current) clearInterval(batIntervalRef.current);
    console.log("Cubo desconectado.");
  }, []);

  // ── Abre el modal de escaneo (reemplaza al viejo connectBLE) ──
  const openScanner = () => setScannerOpen(true);

  // Alias legacy para compatibilidad con componentes que llaman connectBLE
  const connectBLE = () => {
    if (isConnected) return;
    setScannerOpen(true);
  };

  // Callback que recibe el resultado exitoso del BluetoothScanner modal
  const handleScannerConnected = useCallback(({ server, device: bleDevice, type }) => {
    serverRef.current = server;

    // Registrar listener de movimientos según tipo
    if (type === 'cognimirror') {
      // El listener de gyro ya fue registrado por el Scanner;
      // aquí sólo ponemos el event relay al contexto:
      server.device.addEventListener('gattserverdisconnected', onDisconnected);
    } else {
      server.device.addEventListener('gattserverdisconnected', onDisconnected);
    }

    // Actualizar batería periódicamente
    const tryBattery = async () => {
      try {
        const batSvc  = await server.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
        const batChar = await batSvc.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
        const read = async () => { try { const v = await batChar.readValue(); setBatteryLevel(v.getUint8(0)); } catch(_){} };
        await read();
        if (batIntervalRef.current) clearInterval(batIntervalRef.current);
        batIntervalRef.current = setInterval(read, 30000);
      } catch(_) {}
    };
    tryBattery();

    // Suscribir movimientos (Rubiks/GoCube) desde el evento nativo
    if (type === 'rubiks') {
      // El scanner ya registró el listener; re-registramos broadcastMove aquí
      const onMove = (event) => handleRubiksData(event);
      try {
        server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e')
          .then(svc => svc.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e'))
          .then(char => char.addEventListener('characteristicvaluechanged', onMove))
          .catch(() => {});
      } catch(_) {}
    } else if (type === 'cognimirror') {
      const onGyro = (event) => handleGyroData(event);
      try {
        server.getPrimaryService(SERVICE_UUID)
          .then(svc => svc.getCharacteristic(CHAR_GYRO_UUID))
          .then(char => char.addEventListener('characteristicvaluechanged', onGyro))
          .catch(() => {});
      } catch(_) {}
    }

    setDevice(bleDevice.name);
    setIsConnected(true);
    setScannerOpen(false);
  }, [onDisconnected, handleGyroData, handleRubiksData]);


  const disconnectBLE = () => {
    if (serverRef.current) {
      serverRef.current.device.gatt.disconnect();
    }
  };

  // ── Calibración de Latencia de Hardware ─────────────────────
  const measureHardwareLatency = useCallback(async () => {
    setIsCalibrating(true);
    setCalibrationResult(null);

    // 1) BLE Ping: leer batería como operación de referencia
    let bleRtt = 60; // fallback si no hay servicio de batería
    if (serverRef.current) {
      try {
        const t0 = performance.now();
        const batSvc = await serverRef.current.getPrimaryService('0000180f-0000-1000-8000-00805f9b34fb');
        const batChar = await batSvc.getCharacteristic('00002a19-0000-1000-8000-00805f9b34fb');
        await batChar.readValue();
        bleRtt = performance.now() - t0;
      } catch (e) {
        console.warn('BLE ping sin servicio batería, usando fallback de 60ms RTT');
      }
    }
    const bleLatency = Math.round(bleRtt / 2);

    // 2) Render Lag: doble RAF = tiempo de un ciclo de pintado completo
    const renderLatency = await new Promise((resolve) => {
      const t0 = performance.now();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(Math.round(performance.now() - t0));
        });
      });
    });

    const total = bleLatency + renderLatency;
    localStorage.setItem('SYSTEM_LATENCY_OFFSET', String(total));
    setLatencyOffset(total);
    const result = { ble: bleLatency, render: renderLatency, total };
    setCalibrationResult(result);
    setIsCalibrating(false);
    console.log('Calibración completada:', result);
    return result;
  }, []);

  const value = {
    connectBLE,   // alias legacy → abre el scanner
    openScanner,  // nueva API preferida
    disconnectBLE,
    isConnected,
    isConnecting,
    device,
    batteryLevel,
    subscribeToMoves,
    subscribeToMoveComplete, // Nueva API: TEM (Tiempo de Ejecución Motora)
    subscribeToMoveFeed,     // Feed de diagnóstico en tiempo real
    subscribeToGyro,
    broadcastMove,
    // Calibración de latencia
    measureHardwareLatency,
    latencyOffset,
    isCalibrating,
    calibrationResult,
    // Calibración de Hardware (Giroscopio)
    calibrateGyro,
    gyroOffset,
    gyroConfig,
    setGyroConfig,
    // Modo Teclado (Sin Cubo)
    isKeyboardMode,
    toggleKeyboardMode,
    setKeyboardMode,
    simulateMove,
    // Compatibilidad
    isSosMode: isKeyboardMode,
    toggleSosMode: toggleKeyboardMode,
    setSosMode: setKeyboardMode,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
      <BluetoothScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onConnected={handleScannerConnected}
      />
    </BluetoothContext.Provider>
  );
}

// Hook personalizado para consumir la API fácilmente
export function useBluetoothCube() {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetoothCube debe ser usado dentro de un BluetoothProvider');
  }
  return context;
}
