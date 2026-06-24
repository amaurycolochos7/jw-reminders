'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface WAStatus {
  status: string;
  qr: string | null;
  connectedNumber: string | null;
  deviceName: string | null;
  lastConnected: string | null;
  lastDisconnected: string | null;
  error: string | null;
}

export default function WhatsAppPage() {
  const [data, setData] = useState<WAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Mensaje de prueba desde JW Reminders');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api('/api/whatsapp/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchStatus();
    const i = setInterval(fetchStatus, 5000);
    return () => clearInterval(i);
  }, [fetchStatus]);

  const handleRefresh = async () => {
    setActionLoading('refresh');
    await fetchStatus();
    setActionLoading('');
  };

  const handleRestart = async () => {
    setActionLoading('restart');
    try {
      const res = await api('/api/whatsapp/restart', { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        showNotification('success', 'Sesion reiniciada. Esperando reconexion...');
        setTimeout(fetchStatus, 3000);
      } else {
        showNotification('error', d.error || 'Error al reiniciar');
      }
    } catch {
      showNotification('error', 'Error de conexion');
    }
    setActionLoading('');
  };

  const handleDisconnect = async () => {
    setActionLoading('disconnect');
    try {
      const res = await api('/api/whatsapp/disconnect', { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        showNotification('success', 'Sesion desconectada correctamente');
        setTimeout(fetchStatus, 2000);
      } else {
        showNotification('error', d.error || 'Error al desconectar');
      }
    } catch {
      showNotification('error', 'Error de conexion');
    }
    setActionLoading('');
  };

  const handleGenerateQR = async () => {
    setActionLoading('qr');
    try {
      const res = await api('/api/whatsapp/generate-qr', { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        showNotification('success', 'QR generado. Escanea con tu telefono.');
        setTimeout(fetchStatus, 2000);
      } else {
        showNotification('error', d.error || 'Error al generar QR');
      }
    } catch {
      showNotification('error', 'Error de conexion');
    }
    setActionLoading('');
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      showNotification('error', 'Ingresa un numero de telefono');
      return;
    }
    setActionLoading('test');
    try {
      const res = await api('/api/whatsapp/send-test', {
        method: 'POST',
        body: JSON.stringify({ phone: testPhone.trim(), message: testMessage }),
      });
      const d = await res.json();
      if (d.success || res.ok) {
        showNotification('success', 'Mensaje enviado correctamente');
      } else {
        showNotification('error', d.error || 'Error al enviar mensaje');
      }
    } catch {
      showNotification('error', 'Error de conexion');
    }
    setActionLoading('');
  };

  const statusColor: Record<string, string> = {
    READY: 'bg-emerald-500',
    QR_REQUIRED: 'bg-amber-500',
    AUTHENTICATED: 'bg-blue-500',
    STARTING: 'bg-blue-300',
    DISCONNECTED: 'bg-red-400',
    FAILED: 'bg-red-600',
  };
  const statusLabel: Record<string, string> = {
    READY: 'Conectado',
    QR_REQUIRED: 'Esperando escaneo QR',
    AUTHENTICATED: 'Autenticado, cargando...',
    STARTING: 'Iniciando...',
    DISCONNECTED: 'Desconectado',
    FAILED: 'Error',
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-7 bg-silver-mist rounded-xl w-40" />
        <div className="h-48 bg-white rounded-card" />
        <div className="h-32 bg-white rounded-card" />
      </div>
    );
  }

  const st = data?.status || 'DISCONNECTED';

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">WhatsApp</h1>

      {/* Notification */}
      {notification && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
          notification.type === 'success'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {notification.text}
        </div>
      )}

      {/* Status card */}
      <div className="bg-white rounded-card p-5 sm:p-7">
        <div className="flex items-center gap-3 mb-5">
          <span className={`w-3 h-3 rounded-full ${statusColor[st] || 'bg-gray-400'} animate-pulse`} />
          <span className="text-lg font-semibold text-ink">{statusLabel[st] || st}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-graphite text-xs">Estado</span>
            <p className="font-medium text-ink mt-0.5">{st}</p>
          </div>
          <div>
            <span className="text-graphite text-xs">Numero conectado</span>
            <p className="font-medium text-ink mt-0.5">{data?.connectedNumber || '—'}</p>
          </div>
          <div>
            <span className="text-graphite text-xs">Dispositivo</span>
            <p className="font-medium text-ink mt-0.5">{data?.deviceName || '—'}</p>
          </div>
        </div>

        {data?.lastConnected && (
          <p className="text-xs text-graphite mt-4">
            Ultima conexion: {new Date(data.lastConnected).toLocaleString('es-MX')}
          </p>
        )}
        {data?.lastDisconnected && st === 'DISCONNECTED' && (
          <p className="text-xs text-graphite mt-1">
            Desconectado desde: {new Date(data.lastDisconnected).toLocaleString('es-MX')}
          </p>
        )}

        {/* Error message for FAILED state */}
        {st === 'FAILED' && data?.error && (
          <div className="mt-4 p-3 bg-red-50 rounded-xl">
            <p className="text-xs font-medium text-red-700">Error: {data.error}</p>
          </div>
        )}
      </div>

      {/* QR Code — visible when QR_REQUIRED */}
      {(st === 'QR_REQUIRED' || data?.qr) && (
        <div className="bg-white rounded-card p-5 sm:p-7">
          <h2 className="text-base font-semibold text-ink mb-2">Escanear codigo QR</h2>
          <p className="text-sm text-graphite mb-4">
            Abre WhatsApp en tu telefono &rarr; Dispositivos vinculados &rarr; Vincular un dispositivo
          </p>
          {data?.qr ? (
            <div className="flex justify-center p-4 bg-fog border border-silver-mist rounded-2xl max-w-[280px] mx-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(data.qr)}`}
                alt="WhatsApp QR Code"
                className="w-full max-w-[240px]"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center py-8">
              <p className="text-sm text-graphite mb-3">No hay QR disponible</p>
              <button
                onClick={handleGenerateQR}
                disabled={actionLoading === 'qr'}
                className="px-5 py-2.5 bg-azure text-white text-sm font-medium rounded-full hover:bg-azure/90 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'qr' ? 'Generando...' : 'Generar QR'}
              </button>
            </div>
          )}
          <p className="text-xs text-graphite text-center mt-3">
            El estado se actualiza automaticamente cada 5 segundos
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white rounded-card p-5 sm:p-7">
        <h2 className="text-base font-semibold text-ink mb-4">Acciones</h2>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={actionLoading === 'refresh'}
            className="px-4 py-2 bg-fog text-ink text-sm font-medium rounded-full hover:bg-silver-mist transition-colors disabled:opacity-50"
          >
            {actionLoading === 'refresh' ? 'Actualizando...' : 'Refrescar estado'}
          </button>
          <button
            onClick={handleRestart}
            disabled={actionLoading === 'restart'}
            className="px-4 py-2 bg-fog text-ink text-sm font-medium rounded-full hover:bg-silver-mist transition-colors disabled:opacity-50"
          >
            {actionLoading === 'restart' ? 'Reiniciando...' : 'Reiniciar sesion'}
          </button>
          <button
            onClick={handleGenerateQR}
            disabled={actionLoading === 'qr'}
            className="px-4 py-2 bg-fog text-ink text-sm font-medium rounded-full hover:bg-silver-mist transition-colors disabled:opacity-50"
          >
            {actionLoading === 'qr' ? 'Generando...' : 'Generar QR'}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={actionLoading === 'disconnect' || st === 'DISCONNECTED'}
            className="px-4 py-2 bg-fog text-ink text-sm font-medium rounded-full hover:bg-silver-mist transition-colors disabled:opacity-50"
          >
            {actionLoading === 'disconnect' ? 'Desconectando...' : 'Desconectar sesion'}
          </button>
        </div>
      </div>

      {/* Test message — only when READY */}
      {st === 'READY' && (
        <div className="bg-white rounded-card p-5 sm:p-7">
          <h2 className="text-base font-semibold text-ink mb-4">Enviar mensaje de prueba</h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="test-phone" className="text-xs font-medium text-graphite mb-1 block">
                Numero de telefono (con codigo de pais)
              </label>
              <input
                id="test-phone"
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="5219611234567"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="test-message" className="text-xs font-medium text-graphite mb-1 block">
                Mensaje
              </label>
              <textarea
                id="test-message"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
                className="w-full resize-none"
              />
            </div>
            <button
              onClick={handleSendTest}
              disabled={actionLoading === 'test'}
              className="px-5 py-2.5 bg-azure text-white text-sm font-medium rounded-full hover:bg-azure/90 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'test' ? 'Enviando...' : 'Enviar mensaje de prueba'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
