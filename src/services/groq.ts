// Groq Cloud API service for AI-powered code narration
// In production (Vercel), requests go to /api/groq which is a serverless proxy
// that securely injects GROQ_API_KEY from server-side env vars.
// In local dev, Vite's proxy rewrites /api/groq → https://api.groq.com using VITE_GROQ_API_KEY.
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';
// Use the 8B instant model — same quality for these tasks, 10x fewer rate limit issues
const MODEL = 'llama-3.1-8b-instant';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// ─── Global request queue to prevent concurrent 429s ─────────────────────────
// Groq free tier allows ~30 RPM. Serializing requests with a small gap prevents
// bursting multiple requests simultaneously (which immediately 429s).
let _queue = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result: Promise<T> = _queue.then(() => fn());
  // After each request (success or fail), wait before allowing the next
  _queue = result.then(
    () => new Promise<void>((res) => setTimeout(res, 2000)),
    () => new Promise<void>((res) => setTimeout(res, 2000))
  );
  return result;
}

async function callGroq(messages: GroqMessage[], maxTokens = 1024, temperature = 0.3, retries = 4): Promise<string> {
  return enqueue(async () => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch('/api/groq', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(GROQ_API_KEY ? { 'Authorization': `Bearer ${GROQ_API_KEY}` } : {})
          },
          body: JSON.stringify({
            model: MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: false
          })
        });

        if (res.status === 429 && i < retries - 1) {
          // Parse retry-after header if present
          const retryAfter = res.headers.get('retry-after');
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000 + 500
            : Math.pow(2, i + 1) * 2000 + Math.random() * 1000;
          console.warn(`[Groq] Rate limited (429). Retrying in ${Math.round(delay / 1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (!res.ok) {
          const errorText = await res.text();
          console.error('[Groq API Error]', res.status, errorText);
          throw new Error(`Groq API error: ${res.status}`);
        }

        const data: GroqResponse = await res.json();
        return data.choices[0]?.message?.content || '';
      } catch (err) {
        if (i === retries - 1) {
          console.error('[Groq Service Error]', err);
          throw err;
        }
        const delay = Math.pow(2, i) * 1500 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return '';
  });
}

// ─── Code Summary & Concept Tags ─────────────────────────────────────────────

export interface CodeAnalysis {
  summary: string;
  concepts: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  whatToWatch: string;
}

export async function analyzeCode(code: string): Promise<CodeAnalysis> {
  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: `You are a friendly, encouraging programming tutor. Analyze the Java code and respond ONLY with valid JSON (no markdown, no code blocks).
      
CRITICAL GUIDELINE: Explain everything using extremely simple, plain English at a 5th-grade reading level (as if explaining to a 10-year-old child who has never coded before). 
- Banned terms: "instantiate", "mutation", "iteration", "postfix", "array initialization", "runtime", "binary", "conditional".
- Allowed simple terms: "create", "change", "loop repeat", "step", "setup a list", "running", "math", "check/test".

The JSON must have exactly these fields:
{
  "summary": "one short sentence in very simple 5th-grade English describing what this code does",
  "concepts": ["simple concept 1", "simple concept 2"],
  "difficulty": "beginner|intermediate|advanced",
  "whatToWatch": "one sentence in very simple 5th-grade English about what the student should watch closely during visualization"
}`
    },
    {
      role: 'user',
      content: `Analyze this Java code:\n\n${code}`
    }
  ];

  const raw = await callGroq(messages, 300, 0.2);
  try {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || 'Code analysis unavailable',
      concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
      difficulty: parsed.difficulty || 'beginner',
      whatToWatch: parsed.whatToWatch || ''
    };
  } catch {
    console.error('[Groq] Failed to parse code analysis:', raw);
    return {
      summary: 'Code analysis unavailable',
      concepts: [],
      difficulty: 'beginner',
      whatToWatch: ''
    };
  }
}

// ─── Step Narration ──────────────────────────────────────────────────────────

export async function narrateSteps(
  code: string,
  steps: Array<{ stepId: number; line: number; explanation: string }>,
  startIdx: number,
  count: number
): Promise<Map<number, string>> {
  const batch = steps.slice(startIdx, startIdx + count);
  if (batch.length === 0) return new Map();

  const stepsText = batch
    .map((s) => `Step ${s.stepId + 1} (Line ${s.line}): ${s.explanation}`)
    .join('\n');

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: `You are an educational programming tutor helping a beginner understand Java execution step-by-step.
      
For each step, write a short explanation in very simple, plain English (1-2 sentences max). 
CRITICAL: Explain the step at a 5th-grade reading level (as if explaining to a 10-year-old child). Do not use programming jargon. 
- Instead of "declaring/initializing a variable", say "setting up a new box named X to hold Y".
- Instead of "incrementing/postfix increment", say "adding 1 to X".
- Instead of "array index reference", say "looking at item number Y in the list".
- Instead of "evaluating condition", say "checking if X is true".
Do not repeat the mechanical description. Help the student understand what the computer does here in simple everyday language.

Respond ONLY with valid JSON: an array of objects with "stepId" (number) and "narration" (string). No markdown.`
    },
    {
      role: 'user',
      content: `Java code:\n\`\`\`java\n${code}\n\`\`\`\n\nExplain these execution steps:\n${stepsText}`
    }
  ];

  const raw = await callGroq(messages, 1500, 0.3);
  const result = new Map<number, string>();

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item.stepId === 'number' && typeof item.narration === 'string') {
          result.set(item.stepId, item.narration);
        }
      }
    }
  } catch {
    console.error('[Groq] Failed to parse step narrations:', raw);
  }

  return result;
}

// ─── Quick Explain (single step) ─────────────────────────────────────────────

export async function explainStep(
  code: string,
  step: { stepId: number; line: number; explanation: string },
  prevExplanation?: string
): Promise<string> {
  const contextStr = prevExplanation ? `\nPrevious step context: "${prevExplanation}"` : '';

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: `You are a friendly, encouraging programming tutor. Explain the current step to a complete beginner in 1-2 short sentences. 
      
CRITICAL: Use very simple 5th-grade English. Speak as if talking to a 10-year-old child. Avoid technical terminology. Use simple words like "box", "list", "check", "add", "change". Be conversational and encouraging.`
    },
    {
      role: 'user',
      content: `Java code:\n\`\`\`java\n${code}\n\`\`\`\n\nCurrent step (Step ${step.stepId + 1}, Line ${step.line}): ${step.explanation}${contextStr}\n\nExplain this step briefly:`
    }
  ];

  return await callGroq(messages, 150, 0.4);
}

// ─── Concept Explainer (AI search console) ───────────────────────────────────

export async function explainConcept(concept: string): Promise<string> {
  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: `You are a friendly, encouraging computer science tutor.
Explain the requested concept in 2-3 extremely simple sentences at a 5th-grade reading level (like explaining to a 10-year-old child).
CRITICAL: If the user explicitly asks for code (e.g., "give binary tree code", "write a loop", "show code"), or if writing a simple code snippet helps clarify the concept, you MUST provide a clean, short, and very easy-to-understand Java code example. Do not skip the code if they ask for it. Keep it brief, clear, and engaging.`
    },
    {
      role: 'user',
      content: `Explain the concept or write code for: "${concept}"`
    }
  ];

  return await callGroq(messages, 800, 0.4);
}
