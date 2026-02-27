export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name } = req.body || {};

  try {
    const response = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer key_0ee2c7d7a267ad57b651666f50fe',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: 'agent_a34129591f0e7e19abeadd264f',
        retell_llm_dynamic_variables: {
          member_name: name || 'Demo User',
          member_id: 'USAA-DEMO-001',
          member_tier: 'Gold',
          certificate_type: 'Free 7-Night Caribbean Cruise',
          certificate_expiry: 'April 30th, 2026',
          certificate_value: '$2,400',
          certificate_description: '7-night Caribbean cruise for two'
        }
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
