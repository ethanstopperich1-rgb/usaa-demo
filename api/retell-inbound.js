export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch('https://api.retellai.com/v2/create-web-call', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer key_0ee2c7d7a267ad57b651666f50fe',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: 'agent_0bf4698527ae66e7ccaaad2b2e',
        retell_llm_dynamic_variables: {
          member_name: 'Demo User',
          member_id: 'USAA-DEMO-001',
          member_tier: 'Gold',
          certificates_held: '1 Free 7-Night Caribbean Cruise Certificate',
          last_booking: 'None'
        }
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
