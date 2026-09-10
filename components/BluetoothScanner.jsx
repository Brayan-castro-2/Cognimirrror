'use client';

import { useState, useEffect } from 'react';

const scannerCSS = `
.ble-modal-overlay {
  position:fixed;inset:0;z-index:9000;
  background:rgba(15,23,42,.7);
  backdrop-filter:blur(8px);
  display:flex;align-items:center;justify-content:center;
}
.ble-modal {
  width:min(400px,90vw);
  background:#ffffff;
  border-radius:24px;
  box-shadow:0 25px 50px -12px rgba(0,0,0,.25);
  overflow:hidden;
  font-family:inherit;
  position:relative;
  color:#1e293b;
}
.ble-header {
  padding:24px 24px 0;
  text-align:center;
}
.ble-icon-container {
  width:64px;height:64px;border-radius:20px;
  background:#eff6ff;color:#3b82f6;
  display:flex;align-items:center;justify-content:center;
  font-size:32px;margin:0 auto 16px;
}
.ble-title {
  font-size:1.25rem;font-weight:800;color:#0f172a;
}
.ble-subtitle {
  font-size:.875rem;color:#64748b;margin-top:8px;
}
.ble-body {
  padding:24px;
}
.ble-btn-primary {
  width:100%;padding:14px;border-radius:12px;
  background:#3b82f6;color:white;font-weight:700;
  border:none;cursor:pointer;transition:all .2s;
  font-size:1rem;
}
.ble-btn-primary:hover:not(:disabled) { background:#2563eb; }
.ble-btn-primary:disabled { background:#94a3b8; cursor:wait; }
.ble-btn-secondary {
  width:100%;padding:12px;border-radius:12px;
  background:transparent;color:#64748b;font-weight:600;
  border:none;cursor:pointer;transition:all .2s;
  font-size:.875rem;margin-top:8px;
}
.ble-btn-secondary:hover { background:#f1f5f9; color:#475569; }
.ble-error {
  padding:12px;border-radius:8px;background:#fef2f2;
  color:#ef4444;font-size:.875rem;text-align:center;
  margin-bottom:16px;
}
`;

const COMPATIBLE_PREFIXES = ['CogniMirror', 'Rubiks', 'GoCube'];
const SERVICE_UUID   = '12345678-1234-5678-1234-56789abcdef0';
const RUBIKS_SVC     = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RUBIKS_NOTIFY  = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const CHAR_GYRO_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a9';
const BAT_SVC        = '0000180f-0000-1000-8000-00805f9b34fb';

export default function BluetoothScanner({ isOpen, onClose, onConnected }) {
  const [status, setStatus] = useState('idle'); // idle | scanning | connecting | success
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setErrorMsg('');
    }
  }, [isOpen]);

  const connectDevice = async () => {
    setErrorMsg('');
    if (!navigator.bluetooth) {
      setErrorMsg('Tu navegador no soporta Bluetooth Web. Usa Chrome.');
      return;
    }

    setStatus('scanning');

    try {
      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: COMPATIBLE_PREFIXES.map(p => ({ namePrefix: p })),
        optionalServices: [SERVICE_UUID, RUBIKS_SVC, BAT_SVC]
      });

      setStatus('connecting');

      const bleServer = await bleDevice.gatt.connect();
      
      let handleData, char;
      let type = 'rubiks';

      if (bleDevice.name.includes('CogniMirror')) {
        type = 'cognimirror';
        const svc = await bleServer.getPrimaryService(SERVICE_UUID);
        char = await svc.getCharacteristic(CHAR_GYRO_UUID);
      } else {
        const svc = await bleServer.getPrimaryService(RUBIKS_SVC);
        char = await svc.getCharacteristic(RUBIKS_NOTIFY);
      }

      await char.startNotifications();
      handleData = (e) => onConnected?.({ server: bleServer, device: bleDevice, type, event: e });
      char.addEventListener('characteristicvaluechanged', handleData);

      setStatus('success');
      setTimeout(() => {
        onConnected?.({ server: bleServer, device: bleDevice, type });
        onClose();
      }, 800);

    } catch (e) {
      console.error(e);
      setStatus('idle');
      if (e.name !== 'NotFoundError') {
        setErrorMsg('Error al conectar: ' + e.message);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: scannerCSS }} />
      <div className="ble-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && status !== 'connecting') onClose(); }}>
        <div className="ble-modal">
          
          <div className="ble-header">
            <div className="ble-icon-container">
              {status === 'success' ? 'OK' : 'BLE'}
            </div>
            <h2 className="ble-title">
              {status === 'success' ? '¡Conectado!' : 'Conectar Cubo Mágico'}
            </h2>
            <p className="ble-subtitle">
              {status === 'success' ? 'Sincronización establecida' : 'Enciende tu cubo y asegúrate de que tenga batería.'}
            </p>
          </div>

          <div className="ble-body">
            {errorMsg && <div className="ble-error">{errorMsg}</div>}
            
            <button 
              className="ble-btn-primary" 
              onClick={connectDevice}
              disabled={status === 'scanning' || status === 'connecting' || status === 'success'}
            >
              {status === 'scanning' ? 'Buscando...' : 
               status === 'connecting' ? 'Vinculando...' : 
               status === 'success' ? '¡Listo!' : 
               'Conectar por Bluetooth'}
            </button>
            
            {status !== 'connecting' && status !== 'success' && (
              <>
                <button className="ble-btn-secondary" onClick={onClose}>
                  Cancelar
                </button>

                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '8px' }}>
                    ¿No tienes el cubo físico o se quedó sin batería?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem('COGNIMIRROR_KEYBOARD_MODE', 'true');
                        window.dispatchEvent(new Event('storage'));
                      } catch(_) {}
                      if (typeof window !== 'undefined') {
                        // Disparar recarga suave o actualizar si tiene el contexto
                      }
                      onClose();
                      window.location.reload();
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: '#fffbeb',
                      color: '#b45309',
                      border: '1px solid #fde68a',
                      fontWeight: '700',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <span>⌨️</span>
                    <span>Activar Modo Teclado (Sin Cubo)</span>
                  </button>
                </div>
              </>
            )}
          </div>
          
        </div>
      </div>
    </>
  );
}
