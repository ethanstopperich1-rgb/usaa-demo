export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, reason } = req.body || {};

  const visitorName = name || 'there';
  const visitorReason = reason || 'exploring travel options';
  const conversationalContext = `The visitor's name is ${visitorName}. They reached out because: ${visitorReason}. Greet them by name and acknowledge why they're reaching out.`;

  try {
    const response = await fetch('https://tavusapi.com/v2/conversations', {
      method: 'POST',
      headers: {
        'x-api-key': '7f3c93c88c4a44c79f5d969b56bdbd75',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        persona_id: 'p29a8c3a3ca6',
        conversation_name: 'USAA Demo - ' + (name || 'Guest') + ' - ' + new Date().toISOString(),
        conversational_context: conversationalContext
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
