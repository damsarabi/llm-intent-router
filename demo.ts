import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { IntentRouter, Orchestrator, ClassifierAgent, LLMProvider, GenerationOptions } from './src';

// 1. Create a lightweight adapter for Google Gemini (since you already use it)
class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: options?.systemInstruction,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
      }
    });

    // Formatting history for Gemini
    const history = options?.history?.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    })) || [];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(prompt);
    return result.response.text();
  }

  async generateStructured<T>(prompt: string, schema?: z.ZodType<T>, options?: GenerationOptions): Promise<T> {
    const raw = await this.generateText(prompt, options);
    return JSON.parse(raw);
  }
}

async function runDemo() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ Please set GEMINI_API_KEY environment variable");
    process.exit(1);
  }

  console.log("🚀 Initializing Gemini Provider...");
  const provider = new GeminiProvider(apiKey);

  // 2. Define our App's State/Intents
  const schemas = {
    UPDATE_THEME: z.object({
      theme: z.enum(['dark', 'light', 'system']),
      accentColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Must be a valid hex code")
    }),
    PLAY_SONG: z.object({
      title: z.string(),
      bpm: z.number().min(40).max(250)
    })
  };

  const router = new IntentRouter({
    schemas,
    onExecute: (intent, payload) => {
      console.log(`\n✅ [EXECUTE SUCCESS] State Updated!`);
      console.log(`Intent: ${intent}`);
      console.log(`Payload:`, payload);
    },
    onError: (error) => {
      console.log(`\n⚠️ [ROUTER CAUGHT ERROR] ${error.message}`);
    }
  });

  // 3. Setup our Orchestrator
  const orchestrator = new Orchestrator({
    provider,
    router,
    maxRetries: 2,
    systemPrompt: `You are a UI controller. Output a JSON object with 'intent' and 'payload'. Available intents: UPDATE_THEME, PLAY_SONG.`
  });

  // 4. Test 1: A normal prompt
  console.log("\n-----------------------------------------");
  console.log("📝 TEST 1: 'Play Hotel California at 120 bpm'");
  await orchestrator.execute("Play Hotel California at 120 bpm");

  // 5. Test 2: Forcing an Auto-Repair loop!
  console.log("\n-----------------------------------------");
  console.log("📝 TEST 2: 'Change theme to dark with accent color red'");
  console.log("(Note: The LLM will likely output 'red' for accentColor, but our schema strictly requires a Hex Code. Watch the Orchestrator catch it and force the LLM to fix it!)");
  
  await orchestrator.execute("Change theme to dark with accent color red");
}

runDemo().catch(console.error);
