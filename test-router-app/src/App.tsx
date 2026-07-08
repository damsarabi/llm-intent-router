import { useState, useMemo } from 'react';
import { z } from 'zod';
import { IntentRouter } from 'llm-intent-router';

export default function App() {
  const [logs, setLogs] = useState<{ id: number; type: 'success' | 'error'; message: string }[]>([]);

  // Helper to push logs to our UI terminal
  const addLog = (type: 'success' | 'error', message: string) => {
    setLogs((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  };

  // Initialize the router inside useMemo so it has access to addLog without re-rendering
  const router = useMemo(() => {
    return new IntentRouter({
      schemas: {
        TOGGLE_THEME: z.object({
          theme: z.enum(['dark', 'light']),
        }),
        UPDATE_DASHBOARD: z.object({
          region: z.string(),
          metrics: z.array(z.string()),
        }),
      },
      onExecute: (intent, payload) => {
        addLog('success', `[EXECUTED] ${intent} \nPayload: ${JSON.stringify(payload, null, 2)}`);
      },
      onError: (error, rawData) => {
        addLog('error', `[BLOCKED] Hallucination Caught!\nError: ${error.message}\nRaw Data: ${JSON.stringify(rawData)}`);
      },
    });
  }, []);

  const handleGoodAIResponse = () => {
    setLogs([{ id: Date.now(), type: 'success', message: '--- Sending Prompt to AI ---' }]);
    const aiOutput = `\`\`\`json\n[\n  { "intent": "TOGGLE_THEME", "payload": { "theme": "dark" } },\n  { "intent": "UPDATE_DASHBOARD", "payload": { "region": "North America", "metrics": ["revenue", "churn"] } }\n]\n\`\`\``;
    router.process(aiOutput);
  };

  const handleBadAIResponse = () => {
    setLogs([{ id: Date.now(), type: 'success', message: '--- Sending Prompt to AI ---' }]);
    const aiOutput = `{"intent": "TOGGLE_THEME", "payload": { "theme": "neon" }}`;
    router.process(aiOutput);
  };

  const clearLogs = () => setLogs([]);

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'system-ui, sans-serif', color: '#333' }}>
      <header style={{ borderBottom: '2px solid #eaeaea', paddingBottom: '20px', marginBottom: '30px' }}>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '28px' }}>llm-intent-router</h1>
        <p style={{ margin: 0, color: '#666' }}>Deterministic state routing for unpredictable LLM outputs.</p>
      </header>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
        <button
          onClick={handleGoodAIResponse}
          style={{ padding: '12px 24px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          Simulate Valid AI Output
        </button>
        <button
          onClick={handleBadAIResponse}
          style={{ padding: '12px 24px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          Simulate Hallucination
        </button>
        <button
          onClick={clearLogs}
          style={{ padding: '12px 24px', background: '#f5f5f5', color: '#333', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}
        >
          Clear
        </button>
      </div>

      <div
        style={{
          background: '#0d1117',
          color: '#c9d1d9',
          padding: '20px',
          borderRadius: '8px',
          minHeight: '300px',
          maxHeight: '500px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '14px',
          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: '#8b949e' }}>Waiting for incoming AI intents...</span>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                marginBottom: '15px',
                borderLeft: `4px solid ${log.type === 'success' ? '#2ea043' : '#f85149'}`,
                paddingLeft: '15px',
                whiteSpace: 'pre-wrap'
              }}
            >
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}