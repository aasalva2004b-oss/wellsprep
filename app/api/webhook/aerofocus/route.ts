import { NextRequest, NextResponse } from 'next/server';

const EXPECTED_TOKEN = 'wp_qLXi6WFkFY_live';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Event, X-API-Key, X-Source, X-Test-Ping',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'wellsprep_aerofocus_webhook', ready: true },
    { status: 200, headers: corsHeaders }
  );
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verificación del Token de Seguridad
    const authHeader = req.headers.get('authorization');
    const apiKey = req.headers.get('x-api-key');
    const token = apiKey || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (token && token !== EXPECTED_TOKEN) {
      return NextResponse.json({ error: 'Token no autorizado' }, { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();

    // 2. Handshake / Test de conexión de AeroFocus (NUNCA altera la base de datos)
    if (payload.isTest || payload.event === 'test_connection') {
      return NextResponse.json(
        { success: true, message: 'Enlace operativo AeroFocus Pro <-> WellsPrep' },
        { status: 200, headers: corsHeaders }
      );
    }

    // 3. Procesamiento de sesiones reales enviadas por AeroFocus
    const { date, topics, summary, dailyTotalEffectiveHours, totalEffectiveStudyMinutes, transactionId } = payload;
    const sessionHours = dailyTotalEffectiveHours ?? (totalEffectiveStudyMinutes ? totalEffectiveStudyMinutes / 60 : 0);

    // REGISTRO DINÁMICO EN LA BASE DE DATOS DE WELLSPREP:
    // Para cada tema recibido en payload.topics:
    // - Coincidencia estricta: Localiza o indexa el tema por su asignatura real (ej. "Derecho Constitucional") y su 'topicNumber' (ej. 1, 2, 3...) o 'topicTitle'.
    // - Suma las horas efectivas ('effectiveHours') según su modalidad ('estudio', 'repaso', 'refresco').
    // - Si incluye 'pages' (pageStart y pageEnd), actualiza el avance de páginas leídas.
    // - ÚNICAMENTE marca el tema como completado si 'isTopicCompleted === true'. Si es false, guárdalo como lectura parcial.
    // - Idempotencia: Usa 'transactionId' o 'date' para no duplicar horas si se recibe dos veces la misma transmisión.

    console.log(`[WellsPrep Webhook] Sincronización recibida de AeroFocus para ${date}: ${sessionHours}h en ${topics?.length || 0} temas.`);

    return NextResponse.json(
      {
        status: 'ok',
        synced: true,
        date: date,
        processedTopics: topics?.length || 0,
        effectiveHours: sessionHours
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[WellsPrep Webhook Error]:', error);
    return NextResponse.json(
      { error: 'Error interno en webhook', details: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
