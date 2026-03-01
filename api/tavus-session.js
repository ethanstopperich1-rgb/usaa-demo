export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = '7f3c93c88c4a44c79f5d969b56bdbd75';
  const PERSONA_ID = 'p29a8c3a3ca6';
  const { name, reason } = req.body || {};

  const visitorName = name || 'there';
  const visitorReason = reason || 'exploring travel options';
  const conversationalContext = `The visitor's name is ${visitorName}. They reached out because: ${visitorReason}. Greet them by name and acknowledge why they're reaching out.`;

  try {
    // End any active conversations first to avoid hitting concurrent limit
    try {
      const listResp = await fetch('https://tavusapi.com/v2/conversations?status=active', {
        headers: { 'x-api-key': API_KEY }
      });
      const activeConvos = await listResp.json();
      const convos = Array.isArray(activeConvos) ? activeConvos : (activeConvos.data || []);
      for (const c of convos) {
        if (c.persona_id === PERSONA_ID) {
          await fetch(`https://tavusapi.com/v2/conversations/${c.conversation_id}/end`, {
            method: 'POST',
            headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
          });
        }
      }
    } catch (e) {
      // Don't block on cleanup errors
    }

    const response = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        persona_id: PERSONA_ID,
        conversation_name: 'USAA Demo - ' + (name || 'Guest') + ' - ' + new Date().toISOString(),
        conversational_context: conversationalContext,
        // Tool call callback — Raven-1 sends tool calls here
        callback_url: 'https://usaa-demo.vercel.app/api/execute',
        properties: {
          max_call_duration: 1200,
          enable_recording: true,
          enable_transcription: true,
          language: 'english'
        }
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
