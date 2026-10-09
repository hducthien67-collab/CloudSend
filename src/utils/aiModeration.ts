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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: clean,
        userEmail,
        userId
      })
    });

    if (res.ok) {
      const data = await res.json();
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
    }
  } catch (err) {
    console.warn('AI moderation check network notice:', err);
  }

  // Fallback safe return
  return { isFlagged: false, severity: 'clean' };
}
