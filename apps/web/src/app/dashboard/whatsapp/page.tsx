'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface WAStatus {
  status: string;
  qr: string | null;
  connectedNumber: string | null;
  lastConnected: string | null;
  lastDisconnected: string | null;
}

export default function WhatsAppPage() {
  const [data, setData] = useState<WAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api('/api/whatsapp/status');
      if (res.ok) setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); const i = setInterval(fetchStatus, 5000); return () => clearInterval(i); }, [fetchStatus]);

  const handleRestart = async () => {
    setActionLoading('restart');
    await api('/api/whatsapp/restart', { method: 'POST' });
    setTimeout(fetchStatus, 3000);
    setActionLoading('');
  };

  const handleSendTest = async () => {
    setActionLoading('test');
    const res = await api('/api/whatsapp/send-test', { method: 'POST', body: JSON.stringify({ phone: '5219611234567', message: 'Mensaje de prueba desde JW Reminders' }) });
    const d = await res.json();
    alert(d.success ? 'Mensaje enviado correctamente' : `Error: ${d.error}`);
    setActionLoading('');
  };

  const statusColor: Record<string, string> = { READY: 'bg-emerald-500', QR_REQUIRED: 'bg-amber-500', AUTHENTICATED: 'bg-blue-500', STARTING: 'bg-blue-300', DISCONNECTED: 'bg-red-500', FAILED: 'bg-red-600' };
  const statusLabel: Record<string, string> = { READY: 'Conectado', QR_REQUIRED: 'Esperando escaneo QR', AUTHENTICATED: 'Autenticado, cargando...', STARTING: 'Iniciando...', DISCONNECTED: 'Desconectado', FAILED: 'Error' };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-silver-mist rounded-xl w-48" /><div className="h-64 bg-silver-mist rounded-card" /></div>;

  const st = data?.status || 'DISCONNECTED';

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-semibold tracking-tight">WhatsApp</h1>

      {/* Status card */}
      <div className="bg-snow rounded-card p-7">
        <div className="flex items-center gap-3 mb-6">
          <span className={`w-3 h-3 rounded-full ${statusColor[st] || 'bg-gray-400'}`} />
          <span className="text-[17px] font-medium">{statusLabel[st] || st}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div><span className="text-graphite">Estado</span><p className="font-medium mt-0.5">{st}</p></div>
          <div><span className="text-graphite">Número</span><p className="font-medium mt-0.5">{data?.connectedNumber || '—'}</p></div>
          <div><span className="text-graphite">Última conexión</span><p className="font-medium mt-0.5">{data?.lastConnected ? new Date(data.lastConnected).toLocaleString('es-MX') : '—'}</p></div>
        </div>
        {data?.lastDisconnected && (
          <p className="text-xs text-graphite mt-3">Última desconexión: {new Date(data.lastDisconnected).toLocaleString('es-MX')}</p>
        )}
      </div>

      {/* QR Code */}
      {data?.qr && (
        <div className="bg-snow rounded-card p-7">
          <h2 className="text-[20px] font-semibold mb-2">Escanear código QR</h2>
          <p className="text-sm text-graphite mb-4">Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular un dispositivo</p>
          <div className="flex justify-center p-6 bg-white border border-silver-mist rounded-2xl max-w-xs mx-auto">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(data.qr)}`} alt="WhatsApp QR Code" className="w-full max-w-[256px]" />
          </div>
          <p className="text-xs text-graphite text-center mt-3">El QR se actualiza automáticamente cada 5 segundos</p>
        </div>
      )}

      {/* Actions */}
      <div className="bg-snow rounded-card p-7">
        <h2 className="text-[17px] font-semibold mb-4">Acciones</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={fetchStatus} className="px-5 py-2.5 bg-fog text-ink text-sm font-medium rounded-full hover:bg-silver-mist transition-colors">
            Refrescar estado
          </button>
          <button onClick={handleRestart} disabled={actionLoading === 'restart'} className="px-5 py-2.5 bg-fog text-ink text-sm font-medium rounded-full hover:bg-silver-mist transition-colors disabled:opacity-50">
            {actionLoading === 'restart' ? 'Reiniciando...' : 'Reiniciar sesión'}
          </button>
          {st === 'READY' && (
            <button onClick={handleSendTest} disabled={actionLoading === 'test'} className="px-5 py-2.5 bg-azure text-white text-sm font-medium rounded-full hover:bg-azure/90 transition-colors disabled:opacity-50">
              {actionLoading === 'test' ? 'Enviando...' : 'Enviar mensaje de prueba'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
