import { z } from 'zod';
import { IntentRouter } from 'llm-intent-router';

// 1. Initialize the Router outside the component so it doesn't recreate on render
const router = new IntentRouter({
  schemas: {
    TOGGLE_THEME: z.object({
      theme: z.enum(['dark', 'light'])
    }),
    UPDATE_DASHBOARD: z.object({
      region: z.string(),
      metrics: z.array(z.string())
    })
  },
  onExecute: (intent, payload) => {
    // In a real app, this dispatches to Zustand/Redux
    console.log(`✅ EXECUTED [${intent}]:`, payload);
    alert(`Success: ${intent} processed. Check console.`);
  },
  onError: (error, rawData) => {
    console.error(`❌ VALIDATION FAILED:`, error);
    console.log(`Raw Data that failed:`, rawData);
    alert(`Caught Hallucination! Check console for Zod error.`);
  }
});

export default function App() {
  const handleGoodAIResponse = () => {
    // Simulating a messy LLM response wrapped in Markdown code blocks
    const aiOutput = `\`\`\`json
    [
      {
        "intent": "TOGGLE_THEME",
        "payload": { "theme": "dark" }
      },
      {
        "intent": "UPDATE_DASHBOARD",
        "payload": { "region": "North America", "metrics": ["revenue", "churn"] }
      }
    ]
    \`\`\``;

    console.log("Processing Good Response...");
    router.process(aiOutput);
  };

  const handleBadAIResponse = () => {
    // Simulating the LLM hallucinating an invalid theme ("neon" is not in the Zod enum)
    const aiOutput = `
      {
        "intent": "TOGGLE_THEME",
        "payload": { "theme": "neon" }
      }
    `;

    console.log("Processing Bad Response...");
    router.process(aiOutput);
  };

  return (
    <div style={{ padding: '50px', fontFamily: 'sans-serif' }}>
      <h1>llm-intent-router Test Sandbox</h1>
      <p>Open your browser console, then click the buttons.</p>

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <button
          onClick={handleGoodAIResponse}
          style={{ padding: '10px 20px', background: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Test 1: Good AI Response (with Markdown)
        </button>

        <button
          onClick={handleBadAIResponse}
          style={{ padding: '10px 20px', background: '#f44336', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Test 2: Bad AI Response (Hallucination)
        </button>
      </div>
    </div>
  );
}