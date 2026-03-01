// ── Booking Orchestration Playground API ──
// Vercel serverless function — handles all 5 booking tools
// with in-memory mock data (no database required).

// In-memory session store (lives as long as the function is warm)
const sessions = new Map();

const MOCK_PACKAGES = [
  {
    packageId: 'pkg_cruise_carib_001',
    name: '7-Night Western Caribbean Cruise',
    description: 'Depart from Miami with stops in Cozumel, Grand Cayman, and Jamaica. All meals included.',
    travelType: 'cruise',
    destination: 'Western Caribbean',
    departureDate: '2026-04-15',
    returnDate: '2026-04-22',
    pricePerPerson: 1299,
    totalPrice: 2598,
    currency: 'USD',
    cabinClass: 'ocean_view',
    highlights: ['Ocean view cabin', 'All meals included', '2 shore excursions', 'Complimentary spa credit'],
    availableSlots: 12,
    provider: 'Royal Caribbean'
  },
  {
    packageId: 'pkg_cruise_carib_002',
    name: '10-Night Eastern Caribbean Cruise',
    description: 'Roundtrip from Fort Lauderdale visiting St. Thomas, St. Maarten, and the Bahamas.',
    travelType: 'cruise',
    destination: 'Eastern Caribbean',
    departureDate: '2026-04-20',
    returnDate: '2026-04-30',
    pricePerPerson: 1899,
    totalPrice: 3798,
    currency: 'USD',
    cabinClass: 'balcony',
    highlights: ['Private balcony cabin', 'Beverage package included', '3 shore excursions', 'Priority boarding'],
    availableSlots: 5,
    provider: 'Celebrity Cruises'
  },
  {
    packageId: 'pkg_cruise_alaska_001',
    name: '7-Night Alaska Inside Passage',
    description: 'Sail from Seattle through Juneau, Skagway, and Ketchikan with glacier viewing.',
    travelType: 'cruise',
    destination: 'Alaska',
    departureDate: '2026-06-10',
    returnDate: '2026-06-17',
    pricePerPerson: 1599,
    totalPrice: 3198,
    currency: 'USD',
    cabinClass: 'balcony',
    highlights: ['Glacier viewing', 'Balcony cabin', 'Wildlife excursion', 'All meals included'],
    availableSlots: 8,
    provider: 'Holland America'
  }
];

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tool, input } = req.body;
  if (!tool || !input) return res.status(400).json({ error: 'Missing tool or input' });

  const startTime = Date.now();

  try {
    let result;

    switch (tool) {
      case 'initiate_booking': {
        if (!input.memberName || !input.travelType) {
          return res.status(400).json({ error: 'memberName and travelType are required' });
        }
        const sessionId = uuid();
        const session = {
          id: sessionId,
          memberName: input.memberName,
          memberId: input.memberId || null,
          travelType: input.travelType,
          destination: input.destination || null,
          departureWindow: input.departureWindow || null,
          travelers: input.travelers || 2,
          budgetRange: input.budgetRange || null,
          specialRequests: input.specialRequests || null,
          status: 'initiated',
          createdAt: new Date().toISOString()
        };
        sessions.set(sessionId, session);

        result = {
          success: true,
          sessionId,
          message: `Booking session created. Searching for ${input.travelType} options${input.destination ? ` to ${input.destination}` : ''} for ${input.travelers || 2} travelers.`,
          session
        };
        break;
      }

      case 'search_inventory': {
        if (!input.sessionId) return res.status(400).json({ error: 'sessionId is required' });
        const session = sessions.get(input.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        session.status = 'results_presented';

        let filtered = MOCK_PACKAGES;
        if (input.filters?.destination) {
          const dst = input.filters.destination.toLowerCase();
          filtered = MOCK_PACKAGES.filter(p =>
            p.destination.toLowerCase().includes(dst) ||
            p.name.toLowerCase().includes(dst)
          );
        }
        if (input.filters?.maxPrice) {
          filtered = filtered.filter(p => p.pricePerPerson <= input.filters.maxPrice);
        }
        if (input.filters?.cabinClass && input.filters.cabinClass !== 'any') {
          filtered = filtered.filter(p => p.cabinClass === input.filters.cabinClass);
        }

        // If nothing matches filters, return all
        if (filtered.length === 0) filtered = MOCK_PACKAGES;

        result = {
          success: true,
          resultCount: filtered.length,
          searchId: `search_${Date.now().toString(36)}`,
          results: filtered.map((p, i) => ({
            option: i + 1,
            packageId: p.packageId,
            name: p.name,
            description: p.description,
            destination: p.destination,
            dates: `${p.departureDate} → ${p.returnDate}`,
            pricePerPerson: `$${p.pricePerPerson.toLocaleString()}`,
            totalPrice: `$${p.totalPrice.toLocaleString()}`,
            cabinClass: p.cabinClass,
            highlights: p.highlights,
            availableSlots: p.availableSlots,
            provider: p.provider
          })),
          instruction: `Found ${filtered.length} options. Present the results to the member.`
        };
        break;
      }

      case 'select_package': {
        if (!input.sessionId || !input.packageId) {
          return res.status(400).json({ error: 'sessionId and packageId are required' });
        }
        const session = sessions.get(input.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        if (!input.memberConfirmed) {
          result = { success: false, message: 'Member must verbally confirm selection before proceeding.' };
          break;
        }

        const pkg = MOCK_PACKAGES.find(p => p.packageId === input.packageId);
        session.status = 'package_selected';
        session.selectedPackageId = input.packageId;
        session.selectedPackageSummary = input.packageSummary || pkg?.name || input.packageId;

        result = {
          success: true,
          message: 'Package locked in. Ready to generate your personalized booking link.',
          selectedPackage: pkg ? {
            name: pkg.name,
            destination: pkg.destination,
            pricePerPerson: `$${pkg.pricePerPerson}`,
            cabinClass: pkg.cabinClass,
            provider: pkg.provider
          } : { packageId: input.packageId }
        };
        break;
      }

      case 'generate_purl': {
        if (!input.sessionId) return res.status(400).json({ error: 'sessionId is required' });
        const session = sessions.get(input.sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (!session.selectedPackageId) {
          return res.status(400).json({ error: 'No package selected — call select_package first' });
        }

        session.status = 'purl_generated';

        // Build a mock PURL (base64url payload, no real signing in playground)
        const payload = {
          sid: session.id,
          mn: session.memberName,
          mid: session.memberId,
          pkg: session.selectedPackageId,
          tt: session.travelType,
          dst: session.destination,
          pax: session.travelers,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7200
        };
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const mockSig = Buffer.from(`demo_${Date.now()}`).toString('base64url');
        const purl = `https://book.voxaris.io/b/${encoded}.${mockSig}`;

        const deliveryMethod = input.deliveryMethod || 'display';
        let deliveryMessage;
        switch (deliveryMethod) {
          case 'sms':
            deliveryMessage = input.memberPhone
              ? `Text sent to ***${(input.memberPhone || '').slice(-4)}. Valid for 2 hours.`
              : 'Phone number needed for SMS. Displaying link instead.';
            break;
          case 'email':
            deliveryMessage = input.memberEmail
              ? `Email sent to ${(input.memberEmail || '').split('@')[0]?.[0]}***@${(input.memberEmail || '').split('@')[1]}. Valid for 2 hours.`
              : 'Email needed. Displaying link instead.';
            break;
          default:
            deliveryMessage = "Here's your personalized booking link. Valid for 2 hours.";
        }

        result = {
          success: true,
          purl,
          deliveryMethod,
          message: deliveryMessage,
          expiresAt: new Date(Date.now() + 7200000).toISOString(),
          payload // Show the decoded payload for the playground
        };
        break;
      }

      case 'booking_status': {
        if (!input.sessionId) return res.status(400).json({ error: 'sessionId is required' });
        const session = sessions.get(input.sessionId);
        if (!session) {
          result = { status: 'expired', sessionId: input.sessionId, summary: 'Session not found or expired.' };
          break;
        }

        const statusMessages = {
          initiated: 'Booking session active. Ready to search.',
          results_presented: 'Search results available.',
          package_selected: 'Package selected. Ready for PURL generation.',
          purl_generated: 'Personalized booking link created.',
          purl_clicked: 'Member opened the booking link.',
          booking_completed: 'Booking confirmed.',
          expired: 'Session expired.',
          cancelled: 'Session cancelled.'
        };

        result = {
          success: true,
          status: session.status,
          sessionId: session.id,
          summary: statusMessages[session.status] || 'Unknown status.',
          session
        };
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown tool: ${tool}` });
    }

    res.json({
      tool,
      result,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message, tool });
  }
}
