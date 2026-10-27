import { NextRequest, NextResponse } from 'next/server';

const EXPECTED_TOKEN = 'wp_qLXi6WFkFY_live';

// Buffer en memoria persistente en el entorno serverless de Vercel
declare global {
  var __wellsprep_sessions: any[] | undefined;
}
if (!globalThis.__wellsprep_sessions) {
  globalThis.__wellsprep_sessions = [];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Event, X-Flight-Id, X-Transaction-Id, X-Test-Mode',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// Endpoint GET: Permite que el Dashboard o Frontend de WellsPrep consulte las sesiones pendientes
export async function GET() {
  const sessions = globalThis.__wellsprep_sessions || [];
  return NextResponse.json({
    ok: true,
    service: 'wellsprep_aerofocus_webhook',
    sessionsCount: sessions.length,
    latestSessions: sessions.slice(-15)
  }, { status: 200, headers: corsHeaders });
}

// Endpoint POST: Recibe el vuelo inmediatamente al aterrizar o en el cierre diario
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const customApiKey = req.headers.get('x-api-key');
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : customApiKey;

    if (token && token !== EXPECTED_TOKEN) {
      return NextResponse.json({ error: 'Token no autorizado' }, { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();

    // 1. Registro en buffer de memoria
    const buffer = globalThis.__wellsprep_sessions || [];
    buffer.unshift({
      id: payload.flightId || payload.transactionId || `wp_${Date.now()}`,
      receivedAt: new Date().toISOString(),
      payload
    });
    if (buffer.length > 50) buffer.pop();
    globalThis.__wellsprep_sessions = buffer;

    // 2. Procesamiento de Temas (Universal: cubre español e inglés con blindaje contra sesiones fantasma)
    const rawTopics = payload.topics || [];
    const filteredTopics = rawTopics.filter((t: any) => {
      const mod = String(t.modalidad || t.modality || t.type || '').toLowerCase();
      if (mod === 'distraction' || mod === 'distraccion' || mod === 'pausa' || mod === 'break' || mod === 'descanso') {
        return false;
      }
      return true;
    });

    const totalHours = Number(payload.horasEfectivas ?? payload.effectiveHours ?? payload.totalEffectiveHours ?? 0);
    const totalMinutes = Number(payload.minutosEfectivos ?? payload.totalEffectiveStudyMinutes ?? payload.effectiveMinutes ?? Math.round(totalHours * 60));
    const sessionDate = payload.date || payload.fecha || new Date().toISOString().slice(0, 10);

    const topicsCount = filteredTopics.length || 1;
    const distributedMins = totalMinutes > 0 ? Math.max(15, Math.round(totalMinutes / topicsCount)) : 45;

    for (const t of filteredTopics) {
      const materia = t.materia || t.subject || t.subjectName || t.category || payload.materia || 'Derecho Constitucional';
      const numeroTema = t.temaNumero ?? t.topicNumber ?? null;
      const titulo = t.tema || t.topic || t.topicTitle || (numeroTema ? `Tema ${numeroTema}` : 'Tema');
      const modalidad = t.modalidad || t.modality || 'estudio';

      // Extracción robusta de minutos individuales del tema
      const directMins = Number(
        t.minutosEfectivos ?? t.effectiveMinutes ?? t.effectiveStudyMinutes ??
        t.studyMinutes ?? t.durationMinutes ?? t.minutes ?? t.minutos ??
        (t.horasEfectivas ? t.horasEfectivas * 60 : undefined) ??
        (t.effectiveHours ? t.effectiveHours * 60 : undefined)
      );
      const minutos = directMins > 0 ? Math.round(directMins) : distributedMins;
      const horas = Math.round((minutos / 60) * 100) / 100;

      // Filtrar sesiones fantasmas de 1 minuto procedentes de pings o clics accidentales
      if (minutos <= 1 && !t.cantoGrade && !t.grade) {
        continue;
      }

      const startPage = t.startPage ?? t.pages?.pageStart ?? null;
      const endPage = t.endPage ?? t.pages?.pageEnd ?? null;
      const pagesCount = t.pagesCount ?? t.pages?.pagesCount ?? 0;
      const isCompleted = Boolean(t.completado || t.completed || t.isTopicCompleted);

      console.log(`[WellsPrep OK] ${materia} | ${titulo} | ${modalidad} | +${horas}h (${minutos}m) | Págs: ${startPage}-${endPage} (${pagesCount})`);
    }

    return NextResponse.json({
      status: 'ok',
      synced: true,
      date: sessionDate,
      processedTopics: filteredTopics.length,
      effectiveHours: totalHours || Math.round((totalMinutes / 60) * 100) / 100,
      message: `Registradas ${totalHours || Math.round((totalMinutes / 60) * 100) / 100}h netas en WellsPrep`
    }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error procesando webhook' }, { status: 500, headers: corsHeaders });
  }
}
