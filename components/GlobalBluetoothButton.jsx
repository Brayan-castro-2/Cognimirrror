'use client';

import React, { useState } from 'react';
import { useBluetoothCube } from '../contexts/BluetoothContext';
import { Bluetooth, Battery, BatteryCharging, RotateCcw, X, Check, Activity, Keyboard } from 'lucide-react';

export default function GlobalBluetoothButton() {
  const { 
    isConnected, 
    device, 
    batteryLevel, 
    connectBLE, 
    disconnectBLE, 
    calibrateGyro, 
    latencyOffset,
    isKeyboardMode,
    toggleKeyboardMode
  } = useBluetoothCube();

  const [isOpenMenu, setIsOpenMenu] = useState(false);

  return (
    <>
      {/* Botón Flotante Global (Presente en toda la plataforma) */}
      <div className="fixed bottom-5 right-5 z-50 no-print flex flex-col items-end gap-2">
        
        {/* Popover / Menú de Estado */}
        {isOpenMenu && (
          <div className="mb-2 bg-[#0c101a]/95 border border-white/10 backdrop-blur-xl rounded-2xl p-4 shadow-2xl w-72 text-left animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <span className="text-xs font-black uppercase tracking-wider text-white">
                      Cubo Vinculado
                    </span>
                  </>
                ) : (
                  <>
                    <div className={`w-2 h-2 rounded-full ${isKeyboardMode ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-slate-500'}`} />
                    <span className="text-xs font-black uppercase tracking-wider text-white">
                      {isKeyboardMode ? 'Modo Teclado Activo' : 'Cubo Desconectado'}
                    </span>
                  </>
                )}
              </div>
              <button 
                onClick={() => setIsOpenMenu(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {isConnected ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500 font-medium">Dispositivo:</span>
                  <span className="font-bold text-white truncate max-w-[120px]">{device || 'Smart Cube'}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500 font-medium">Batería:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {batteryLevel !== null ? `${batteryLevel}%` : 'Normal'}
                  </span>
                </div>
                {latencyOffset > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500 font-medium">Offset Latencia:</span>
                    <span className="font-bold text-indigo-400 font-mono">−{latencyOffset}ms</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                {isKeyboardMode 
                  ? 'Estás evaluando sin el cubo físico. Se registrará en los reportes que se usó el teclado.' 
                  : 'Vincula tu cubo inteligente por Bluetooth o activa el modo teclado para evaluar sin el cubo.'}
              </p>
            )}

            {/* Toggle Modo Teclado (Sin Cubo) */}
            <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
              <button
                onClick={() => {
                  toggleKeyboardMode();
                }}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                  isKeyboardMode 
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-amber-400" />
                  <span>Modo Teclado (Sin Cubo)</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                  isKeyboardMode ? 'bg-amber-500/30 text-amber-200' : 'bg-white/10 text-white/40'
                }`}>
                  {isKeyboardMode ? 'ON' : 'OFF'}
                </span>
              </button>

              {isConnected ? (
                <>
                  <button
                    onClick={() => {
                      if (calibrateGyro) calibrateGyro();
                      setIsOpenMenu(false);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                    <span>Calibrar Giroscopio</span>
                  </button>

                  <button
                    onClick={() => {
                      if (disconnectBLE) disconnectBLE();
                      setIsOpenMenu(false);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-red-500/20 cursor-pointer"
                  >
                    <span>Desconectar Cubo</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setIsOpenMenu(false);
                    connectBLE();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 border border-blue-400/30 shadow-lg cursor-pointer"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>Vincular Cubo Bluetooth</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Botón Principal */}
        {isConnected ? (
          <button
            onClick={() => setIsOpenMenu(!isOpenMenu)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0d121f]/90 hover:bg-[#131b2e] border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-[0_4px_25px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_30px_rgba(16,185,129,0.4)] backdrop-blur-md transition-all active:scale-95 cursor-pointer group"
            title="Cubo Conectado - Click para ver opciones"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Bluetooth className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate max-w-[100px]">{device || 'Cubo'}</span>
            {batteryLevel !== null && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold">
                {batteryLevel}%
              </span>
            )}
          </button>
        ) : isKeyboardMode ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsOpenMenu(!isOpenMenu)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#18120a]/95 hover:bg-[#231a0e] border border-amber-500/50 text-amber-300 text-xs font-bold shadow-[0_4px_25px_rgba(245,158,11,0.25)] hover:shadow-[0_4px_30px_rgba(245,158,11,0.4)] backdrop-blur-md transition-all active:scale-95 cursor-pointer group animate-pulse"
              title="Modo Teclado (Sin Cubo) Activo - Click para opciones"
            >
              <Keyboard className="w-4 h-4 text-amber-400" />
              <span className="tracking-wide">Modo Teclado (Sin Cubo)</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOpenMenu(!isOpenMenu)}
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white backdrop-blur-md transition-all active:scale-95 cursor-pointer"
              title="Opciones de Conexión / Modo Teclado"
            >
              <Keyboard className="w-4 h-4 text-amber-400/80" />
            </button>
            <button
              onClick={connectBLE}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-blue-600/90 to-indigo-600/90 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-[0_4px_20px_rgba(59,130,246,0.35)] hover:shadow-[0_4px_25px_rgba(59,130,246,0.5)] backdrop-blur-md transition-all active:scale-95 cursor-pointer border border-blue-400/30 group"
              title="Conectar Cubo Inteligente vía Bluetooth"
            >
              <Bluetooth className="w-4 h-4 text-blue-200 group-hover:rotate-12 transition-transform" />
              <span className="tracking-wide">Conectar Cubo</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
