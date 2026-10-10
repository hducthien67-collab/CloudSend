/**
 * AI Content Moderation Client Utility
 * Integrates OpenAI Free Moderation API + Gemini AI Context Analysis
 */

export interface AIModerationResult {
  isFlagged: boolean;
  source?: 'openai_moderation' | 'gemini_moderation' | 'local_filter';
  severity?: 'clean' | 'light' | 'medium' | 'high' | 'critical';
  recommendedTier?: 'level_1' | 'level_2' | 'level_3' | 'level_4' | 'level_perm' | null;
  matchedRule?: string;
  remindText?: string;
  message?: string;
  categories?: string[];
}

/**
 * Checks text or message content with real-time AI moderation API
 */
export async function checkContentWithAI(
  text: string, 
  userEmail?: string, 
  userId?: string
): Promise<AIModerationResult> {
  const clean = (text || '').trim();
  if (!clean || clean.length < 2) {
    return { isFlagged: false, severity: 'clean' };
  }

  try {
    const res = await fetch('/api/moderation/check-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        text: clean,
        userEmail,
        userId
      })
    });

    if (res && res.ok && res.status !== 204) {
      const contentType = res.headers.get('content-type') || '';
      const rawText = await res.text();
      if (!rawText || !rawText.trim() || !contentType.includes('application/json')) {
        return { isFlagged: false, severity: 'clean' };
      }
      try {
        const data = JSON.parse(rawText);
        return {
          isFlagged: Boolean(data.isFlagged),
          source: data.source,
          severity: data.severity || (data.isFlagged ? 'medium' : 'clean'),
          recommendedTier: data.recommendedTier,
          matchedRule: data.matchedRule,
          remindText: data.remindText,
          message: data.message,
          categories: data.categories || []
        };
      } catch {
        return { isFlagged: false, severity: 'clean' };
      }
    }
  } catch {
    // Non-blocking network fallback
  }

  // Fallback safe return
  return { isFlagged: false, severity: 'clean' };
}
