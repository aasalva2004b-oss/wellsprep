import { GoogleGenAI, Type } from '@google/genai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    let base64Data = '';
    let mimeType = 'application/pdf';

    if (req.body && req.body.base64) {
      base64Data = req.body.base64;
      mimeType = req.body.mimeType || 'application/pdf';
    } else if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        base64Data = parsed.base64 || '';
        mimeType = parsed.mimeType || 'application/pdf';
      } catch {
        base64Data = req.body;
      }
    }

    if (!base64Data) {
      return res.status(400).json({ error: 'No PDF data provided' });
    }

    const prompt = `Extract the study plan table from this document. 
Notice the month/year (like "Sep-26") and the subject code (like "CONST").
Map "CONST" to "constitucional", "CIVIL" to "civil", "PENAL" to "penal", etc.
For each row that has tasks, extract:
- date: calculate the ISO date string based on the month/year and the day number in the first column (e.g., "V-4" -> day 4 of Sep 2026).
- newTopics: array of strings representing the topic numbers from the "Nuevo" column.
- reviewTopics: array of strings representing the topic numbers from the "Refresco" column.
- subjectId: the subject ID mapped from the document.

Return a JSON array of these objects. ONLY valid JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        prompt
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              newTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
              reviewTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
              subjectId: { type: Type.STRING }
            },
            required: ['date', 'newTopics', 'reviewTopics', 'subjectId']
          }
        }
      }
    });

    return res.status(200).json(JSON.parse(response.text || '[]'));
  } catch (error: any) {
    console.error('Gemini Parse Error in Serverless Function:', error);
    return res.status(500).json({ error: error.message || 'Error parsing PDF' });
  }
}
