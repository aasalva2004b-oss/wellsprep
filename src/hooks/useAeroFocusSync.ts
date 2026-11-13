import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseEmulator } from '../lib/firebase';
import { authenticatedFetch, subscribeAuthenticatedEvents } from '../lib/authenticatedApi';
import { allowedAeroFocusNotice } from '../lib/aeroFocusMessagePolicy';

export interface AeroFocusSyncState {
  isConnected: boolean;
  connectionMode: 'sse' | 'polling' | 'connecting';
  lastFlightTime: string | null;
  lastFlightId: string | null;
}

/** Notifications can only cause an authenticated reload. Raw browser messages
 * are never authorization to create records or confirmation of incorporation. */
export function useAeroFocusSync(onNewSession?: (session: any) => void) {
  const callback = useRef(onNewSession); callback.current = onNewSession;
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid || null);
  const [state,setState] = useState<AeroFocusSyncState>({isConnected:false,connectionMode:'connecting',lastFlightTime:null,lastFlightId:null});
  useEffect(()=>onAuthStateChanged(auth,user=>setUid(user?.uid||null)),[]);
  useEffect(()=>{
    setState({isConnected:false,connectionMode:'connecting',lastFlightTime:null,lastFlightId:null});
    if(!uid || isFirebaseEmulator)return;
    let stopped=false, running=false;
    const seen=new Set<string>();
    const reload=async()=>{
      if(stopped||running||auth.currentUser?.uid!==uid)return;
      running=true;
      try {
        const response=await authenticatedFetch('/api/webhook/events?status=pending&limit=200');
        if(!response.ok)throw new Error('Sync unavailable');
        const data=await response.json();
        if(stopped||auth.currentUser?.uid!==uid)return;
        setState(previous=>({...previous,isConnected:true}));
        for(const event of Array.isArray(data.events)?data.events:[]){
          if(event.userId!==uid||typeof event.id!=='string'||seen.has(event.id))continue;
          seen.add(event.id);setState(previous=>({...previous,lastFlightTime:new Date().toLocaleTimeString(),lastFlightId:event.flightId||event.id}));
          callback.current?.(event);
        }
      }catch{if(!stopped)setState(previous=>({...previous,isConnected:false,connectionMode:'polling'}));}
      finally{running=false;}
    };
    const closeStream=subscribeAuthenticatedEvents(event=>{
      if(event?.type==='connected')setState(previous=>({...previous,isConnected:true,connectionMode:'sse'}));
      if(event?.type==='quarantine_updated')void reload();
    },()=>{if(!stopped)setState(previous=>({...previous,isConnected:false,connectionMode:'polling'}));});
    const origins=String((import.meta as ImportMeta & {env?:Record<string,string>}).env?.VITE_AEROFOCUS_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
    const notice=(event:MessageEvent)=>{if(allowedAeroFocusNotice(event.origin,event.data,uid,window.location.origin,origins))void reload();};
    window.addEventListener('message',notice);
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(`wellsprep_sync_bus:${uid}`):undefined;
    if(channel)channel.onmessage=event=>{if(event.data?.userId===uid&&event.data?.type==='AEROFOCUS_TOUCHDOWN_SYNC')void reload();};
    const timer=setInterval(()=>{if(document.visibilityState!=='hidden')void reload();},8000);
    void reload();
    return()=>{stopped=true;closeStream();channel?.close();clearInterval(timer);window.removeEventListener('message',notice);};
  },[uid]);
  return state;
}

export async function simulateAeroFocusFlight(customTopicNumber: number = 1): Promise<{ success: boolean; message: string }> {
  if (!isFirebaseEmulator) return { success: false, message: 'Las simulaciones solo están disponibles en el entorno aislado.' };
  try {
    const res = await authenticatedFetch('/api/webhook/aerofocus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
