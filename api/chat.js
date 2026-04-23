export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message, history } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message が必要です。' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY が未設定です。' });
    }

    const systemInstruction =
      'あなたは「どん底井戸太郎」。井戸の底でとことこ歩くもちもちした謎の生き物。口調は「〜なんだな」「〜かもね」。短くネガティブ寄りに答えて。返答は1〜3文、簡潔に。';

    const safeHistory = Array.isArray(history) ? history.slice(-8) : [];

    const contents = [
      ...safeHistory
        .filter((item) => item && typeof item.text === 'string' && typeof item.role === 'string')
        .map((item) => ({
          role: item.role,
          parts: [{ text: item.text }],
        })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.0-flash-001',
      'gemini-1.5-flash-latest',
    ];

    let lastError = 'unknown error';

    for (const modelName of modelsToTry) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            contents,
            generationConfig: {
              temperature: 0.9,
              topP: 0.95,
              topK: 40,
              maxOutputTokens: 120,
            },
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        lastError = data?.error?.message || `${modelName} failed`;
        continue;
      }

      const reply =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p?.text || '')
          .join('')
          .trim() || '';

      if (!reply) {
        lastError = `${modelName}: empty reply`;
        continue;
      }

      return res.status(200).json({
        reply,
        model: modelName,
      });
    }

    return res.status(500).json({
      error: `AIの返答取得に失敗しました: ${lastError}`,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'server error',
    });
  }
}