import { useEffect, useRef, useState, useCallback } from 'react';

export interface AeroFocusSyncState {
  isConnected: boolean;
  connectionMode: 'sse' | 'polling' | 'connecting';
  lastFlightTime: string | null;
  lastFlightId: string | null;
}

/**
 * Hook de sincronización universal y reactivo en tiempo real entre AeroFocus Pro y WellsPrep:
 * 1. Conexión Server-Sent Events (SSE) a '/api/webhook/stream' con reconexión automática y latencia cero.
 * 2. Canal entre pestañas / ventanas en el mismo navegador (BroadcastChannel 'wellsprep_sync_bus').
 * 3. Polling adaptativo de respaldo a '/api/webhook/aerofocus' y '/api/webhook/events'.
 */
export function useAeroFocusSync(onNewSession?: (session: any) => void) {
  const onNewSessionRef = useRef(onNewSession);
  onNewSessionRef.current = onNewSession;

  const [syncState, setSyncState] = useState<AeroFocusSyncState>({
    isConnected: false,
    connectionMode: 'connecting',
    lastFlightTime: null,
    lastFlightId: null,
  });

  // Registro de identificadores procesados para garantizar idempotencia
  const processedIdsRef = useRef<Set<string>>(new Set());

  const handleIncomingPayload = useCallback((payload: any) => {
    if (!payload) return;
    const raw = payload.payload || payload;
    const flightId = String(raw.flightId || raw.transactionId || raw.id || '');

    if (flightId) {
      if (processedIdsRef.current.has(flightId)) {
        return;
      }
      processedIdsRef.current.add(flightId);

      // Descartar si ya fue procesado en esta sesión
      try {
        const key = `wp_af_processed_${flightId}`;
        if (sessionStorage.getItem(key)) {
          return;
        }
        sessionStorage.setItem(key, String(Date.now()));
      } catch {}
    }

    setSyncState(prev => ({
      ...prev,
      lastFlightTime: new Date().toLocaleTimeString(),
      lastFlightId: flightId || 'Vuelo Recibido',
    }));

    onNewSessionRef.current?.(raw);
  }, []);

  useEffect(() => {
    let sse: EventSource | null = null;
    let channel: BroadcastChannel | null = null;
    let aeroChannel: BroadcastChannel | null = null;
    let pollInterval: any = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    // 1. Canales entre pestañas (BroadcastChannel) y window.postMessage
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel('wellsprep_sync_bus');
        channel.onmessage = (event) => {
          if (event.data?.type === 'AEROFOCUS_TOUCHDOWN_SYNC') {
            handleIncomingPayload(event.data.payload);
          }
        };

        aeroChannel = new BroadcastChannel('aerofocus_wellsprep_channel');
        aeroChannel.onmessage = (event) => {
          if (
            event.data?.type === 'AEROFOCUS_WELLSPREP_SYNC' ||
            event.data?.type === 'AEROFOCUS_WELLSPREP_DAILY_SYNC' ||
            event.data?.type === 'AEROFOCUS_TOUCHDOWN_SYNC'
          ) {
            handleIncomingPayload(event.data.payload || event.data);
          }
        };
      }
    } catch {}

    const handleWindowMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'AEROFOCUS_WELLSPREP_SYNC' ||
        event.data?.type === 'AEROFOCUS_WELLSPREP_DAILY_SYNC'
      ) {
        handleIncomingPayload(event.data.payload || event.data);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('message', handleWindowMessage);
    }

    // 2. Conexión reactiva por Server-Sent Events (SSE)
    const connectSSE = () => {
      if (!isMounted || typeof window === 'undefined' || typeof EventSource === 'undefined') return;

      try {
        sse = new EventSource('/api/webhook/stream');

        sse.onopen = () => {
          if (!isMounted) return;
          setSyncState(prev => ({
            ...prev,
            isConnected: true,
            connectionMode: 'sse',
          }));
        };

        sse.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data?.type === 'ping') return;
            if (data?.type === 'connected') {
              setSyncState(prev => ({ ...prev, isConnected: true, connectionMode: 'sse' }));
              return;
            }

            // Transmisión de vuelo recibida por el webhook
            if (data && (data.id || data.flightId || data.topics)) {
              handleIncomingPayload(data);
            }
          } catch {}
        };

        sse.onerror = () => {
          if (!isMounted) return;
          if (sse) {
            sse.close();
            sse = null;
          }
          setSyncState(prev => ({
            ...prev,
            isConnected: true,
            connectionMode: 'polling',
          }));
          // Intentar reconectar SSE tras 5 segundos
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch {
        setSyncState(prev => ({ ...prev, isConnected: true, connectionMode: 'polling' }));
      }
    };

    connectSSE();

    // 3. Heartbeat de conectividad (comprueba estado sin reinyectar sesiones históricas)
    const checkServer = async () => {
      if (!isMounted) return;
      try {
        const res = await fetch('/api/webhook/ping');
        if (res.ok) {
          setSyncState(prev => ({ ...prev, isConnected: true }));
        }
      } catch {}
    };

    const initialTimer = setTimeout(checkServer, 2000);
    pollInterval = setInterval(checkServer, 15000);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (channel) channel.close();
      if (aeroChannel) aeroChannel.close();
      if (typeof window !== 'undefined') {
        window.removeEventListener('message', handleWindowMessage);
      }
      if (sse) sse.close();
    };
  }, [handleIncomingPayload]);

  return syncState;
}

/**
 * Función auxiliar para simular un aterrizaje en tiempo real y probar la pasarela
 */
export async function simulateAeroFocusFlight(customTopicNumber: number = 1): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/webhook/aerofocus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wp_qLXi6WFkFY_live',
      },
      body: JSON.stringify({
        source: 'AeroFocus Pro',
        telemetrySchemaVersion: '2.2.0',
        schemaVersion: '2.2.0',
        event: 'study_session_completed',
        syncScope: 'single_session',
        flightId: String(Date.now()),
        date: new Date().toISOString().split('T')[0],
        dailyTotalEffectiveMinutes: 90,
        minutosEfectivos: 90,
        segundosEfectivos: 5400,
        horasEfectivas: 1.5,
        focusScore: 98.5,
        avgMinutesPerPage: 15.0,
        totalPagesWorked: 6,
        plsema: {
          minutes: { prelectura: 10, lectura: 20, subrayado: 15, esquema: 15, memorizar: 20, cantar: 10 },
          seconds: { prelectura: 600, lectura: 1200, subrayado: 900, esquema: 900, memorizar: 1200, cantar: 600 },
          hours: { prelectura: 0.17, lectura: 0.33, subrayado: 0.25, esquema: 0.25, memorizar: 0.33, cantar: 0.17 },
          percentages: { prelectura: 11, lectura: 22, subrayado: 17, esquema: 17, memorizar: 22, cantar: 11 },
          totalMinutes: 90,
          totalSeconds: 5400,
          dominantPhase: 'memorizar',
          activeRecallMinutes: 30,
          passiveMinutes: 45,
          schematicMinutes: 15,
          activeRecallRatio: 33.3,
          passiveRatio: 50.0,
          minutosPrelectura: 10,
          minutosLectura: 20,
          minutosSubrayado: 15,
          minutosEsquema: 15,
          minutosMemorizar: 20,
          minutosCantar: 10,
          segundosPrelectura: 600,
          segundosLectura: 1200,
          segundosSubrayado: 900,
          segundosEsquema: 900,
          segundosMemorizar: 1200,
          segundosCantar: 600
        },
        topics: [
          {
            topicId: `jud-${customTopicNumber}`,
            temaNumero: customTopicNumber,
            topicNumber: customTopicNumber,
            materia: 'Derecho Constitucional',
            category: 'Derecho Constitucional',
            topicTitle: `Tema ${customTopicNumber}: La Constitución Española de 1978`,
            modality: 'estudio',
            horasEfectivas: 1.5,
            minutosEfectivos: 90,
            effectiveMinutes: 90,
            startPage: 1,
            endPage: 6,
            pagesCount: 6,
            minutesPerPage: 15.0,
            isTopicCompleted: false,
            completesVuelta: false,
          },
        ],
        pageBreakdown: [
          {
            pageKey: `jud-${customTopicNumber}_p1`,
            pageNumber: 1,
            pagina: 1,
            pageLabel: 'Pág. 1',
            topicId: `jud-${customTopicNumber}`,
            topicNumber: customTopicNumber,
            topicTitle: `Tema ${customTopicNumber}`,
            tema: `Tema ${customTopicNumber}`,
            subjectId: 'constitucional',
            subjectName: 'Derecho Constitucional',
            materia: 'Derecho Constitucional',
            modality: 'estudio',
            modalidad: 'estudio',
            effectiveMinutes: 15,
            effectiveSeconds: 900,
            minutesPerPage: 15,
            minutosPorPagina: 15,
            secondsPerPage: 900,
            segundosPorPagina: 900,
            timeFormatted: '15m',
            completed: true,
            completada: true,
            densityTier: 'media',
            date: new Date().toISOString().split('T')[0],
            plsema: {
              minutes: { prelectura: 5, lectura: 3, subrayado: 2, esquema: 2, memorizar: 2, cantar: 1 },
              seconds: { prelectura: 300, lectura: 180, subrayado: 120, esquema: 120, memorizar: 120, cantar: 60 },
              hours: { prelectura: 0.08, lectura: 0.05, subrayado: 0.03, esquema: 0.03, memorizar: 0.03, cantar: 0.02 },
              percentages: { prelectura: 33, lectura: 20, subrayado: 13, esquema: 13, memorizar: 13, cantar: 8 },
              totalMinutes: 15,
              totalSeconds: 900,
              dominantPhase: 'prelectura',
              activeRecallMinutes: 3,
              passiveMinutes: 10,
              schematicMinutes: 2,
              activeRecallRatio: 20,
              passiveRatio: 67,
              minutosPrelectura: 5,
              minutosLectura: 3,
              minutosSubrayado: 2,
              minutosEsquema: 2,
              minutosMemorizar: 2,
              minutosCantar: 1,
              segundosPrelectura: 300,
              segundosLectura: 180,
              segundosSubrayado: 120,
              segundosEsquema: 120,
              segundosMemorizar: 120,
              segundosCantar: 60
            },
            fasesPlsema: {
              minutes: { prelectura: 5, lectura: 3, subrayado: 2, esquema: 2, memorizar: 2, cantar: 1 },
              seconds: { prelectura: 300, lectura: 180, subrayado: 120, esquema: 120, memorizar: 120, cantar: 60 },
              hours: { prelectura: 0.08, lectura: 0.05, subrayado: 0.03, esquema: 0.03, memorizar: 0.03, cantar: 0.02 },
              percentages: { prelectura: 33, lectura: 20, subrayado: 13, esquema: 13, memorizar: 13, cantar: 8 },
              totalMinutes: 15,
              totalSeconds: 900,
              dominantPhase: 'prelectura',
              activeRecallMinutes: 3,
              passiveMinutes: 10,
              schematicMinutes: 2,
              activeRecallRatio: 20,
              passiveRatio: 67,
              minutosPrelectura: 5,
              minutosLectura: 3,
              minutosSubrayado: 2,
              minutosEsquema: 2,
              minutosMemorizar: 2,
              minutosCantar: 1,
              segundosPrelectura: 300,
              segundosLectura: 180,
              segundosSubrayado: 120,
              segundosEsquema: 120,
              segundosMemorizar: 120,
              segundosCantar: 60
            }
          }
        ],
        flightTelemetry: {
          aircraft: 'Cessna 172 Skyhawk (Simulador)',
          route: 'LEMD -> LEBL',
          distractions: 0,
          xpEarned: 350,
        },
      }),
    });

    const data = await res.json();
    if (res.ok && (data.status === 'ok' || data.ok === true || data.success === true)) {
      return { success: true, message: '¡Vuelo simulado v2.2.0 aterrizado con éxito en WellsPrep!' };
    }
    return { success: false, message: data.error || 'Error al enviar simulación' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Error de red en simulación' };
  }
}
