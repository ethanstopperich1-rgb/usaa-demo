// ── Tavus Tool Call Executor ──
// Receives tool calls from Tavus Raven-1 and returns results.
// Handles booking tools with mock inventory (same as booking.js).
//
// POST: Tavus sends { conversation_id, tool_call_id, tool_name, tool_input }
//       Returns: { tool_call_id, result: { ... } }
//
// GET:  Browser polls ?conversation_id=xxx for UI actions (PURL, search results, etc.)
//       Returns: { actions: [...] } and clears the queue

const sessions = new Map();
const actionQueue = new Map(); // conversation_id → [{ type, data, timestamp }]

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

// Push an action to the queue for the browser to pick up
function pushAction(conversationId, type, data) {
  if (!conversationId) return;
  if (!actionQueue.has(conversationId)) actionQueue.set(conversationId, []);
  actionQueue.get(conversationId).push({ type, data, timestamp: Date.now() });
  console.log(`[execute] Queued action: ${type} for conversation ${conversationId}`);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: Browser polls for UI actions ──
  if (req.method === 'GET') {
    const conversationId = req.query.conversation_id;
    if (!conversationId) {
      return res.status(400).json({ error: 'Missing conversation_id query parameter' });
    }
    const actions = actionQueue.get(conversationId) || [];
    // Clear the queue after reading
    if (actions.length > 0) actionQueue.delete(conversationId);
    return res.json({ actions });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── POST: Tavus tool call execution ──
  const { conversation_id, tool_call_id, tool_name, tool_input } = req.body || {};

  if (!tool_name) {
    return res.status(400).json({ error: 'Missing tool_name' });
  }

  const input = tool_input || {};
  console.log(`[execute] Tool call: ${tool_name} | call_id: ${tool_call_id} | conversation: ${conversation_id}`);

  let result;

  try {
    switch (tool_name) {

      // ── Booking Tools ──

      case 'initiate_booking': {
        const memberName = input.memberName || 'Member';
        const travelType = input.travelType || 'cruise';
        const sessionId = uuid();

        const session = {
          id: sessionId,
          conversationId: conversation_id,
          memberName,
          memberId: input.memberId || null,
          travelType,
          destination: input.destination || null,
          departureWindow: input.departureWindow || null,
          travelers: input.travelers || 2,
          budgetRange: input.budgetRange || null,
          specialRequests: input.specialRequests || null,
          status: 'initiated',
          createdAt: new Date().toISOString()
        };
        sessions.set(sessionId, session);

        // Push status update to browser
        pushAction(conversation_id, 'booking_started', {
          sessionId,
          memberName,
          travelType,
          destination: input.destination || null,
          travelers: input.travelers || 2
        });

        result = {
          success: true,
          sessionId,
          message: `Booking session created for ${memberName}. Searching for ${travelType} options${input.destination ? ` to ${input.destination}` : ''} for ${input.travelers || 2} travelers.`,
          instruction: `Booking session started. Session ID: ${sessionId}. Now call search_inventory with this sessionId to find available packages.`
        };
        break;
      }

      case 'search_inventory': {
        const session = input.sessionId ? sessions.get(input.sessionId) : null;
        if (session) session.status = 'results_presented';

        let filtered = MOCK_PACKAGES;
        const filters = input.filters || {};

        if (filters.travelType) {
          filtered = filtered.filter(p => p.travelType === filters.travelType);
        }
        if (filters.destination) {
          const dst = filters.destination.toLowerCase();
          filtered = filtered.filter(p =>
            p.destination.toLowerCase().includes(dst) ||
            p.name.toLowerCase().includes(dst)
          );
        }
        if (filters.maxPrice) {
          filtered = filtered.filter(p => p.pricePerPerson <= filters.maxPrice);
        }
        if (filters.cabinClass && filters.cabinClass !== 'any') {
          filtered = filtered.filter(p => p.cabinClass === filters.cabinClass);
        }
        // If nothing matches, return all
        if (filtered.length === 0) filtered = MOCK_PACKAGES;

        const formattedResults = filtered.map((p, i) => ({
          option: i + 1,
          packageId: p.packageId,
          name: p.name,
          destination: p.destination,
          dates: `${p.departureDate} to ${p.returnDate}`,
          pricePerPerson: `$${p.pricePerPerson.toLocaleString()}`,
          totalPrice: `$${p.totalPrice.toLocaleString()}`,
          cabinClass: p.cabinClass,
          highlights: p.highlights.join(', '),
          availableSlots: p.availableSlots,
          provider: p.provider
        }));

        // Push search results to browser
        pushAction(conversation_id, 'search_results', {
          resultCount: formattedResults.length,
          results: formattedResults
        });

        result = {
          success: true,
          resultCount: formattedResults.length,
          results: formattedResults,
          instruction: `Found ${formattedResults.length} options. Present the top results conversationally — describe the destination, price, and a standout highlight for each. Ask which the member prefers.`
        };
        break;
      }

      case 'select_package': {
        const session = input.sessionId ? sessions.get(input.sessionId) : null;

        if (!input.memberConfirmed) {
          result = {
            success: false,
            message: 'Member must verbally confirm their selection. Repeat the package details and ask for a clear yes before calling this tool.',
            instruction: 'Do NOT proceed until the member explicitly says yes.'
          };
          break;
        }

        const pkg = MOCK_PACKAGES.find(p => p.packageId === input.packageId);
        if (session) {
          session.status = 'package_selected';
          session.selectedPackageId = input.packageId;
          session.selectedPackageSummary = input.packageSummary || (pkg ? pkg.name : input.packageId);
        }

        // Push selection to browser
        pushAction(conversation_id, 'package_selected', {
          packageId: input.packageId,
          name: pkg ? pkg.name : input.packageId,
          destination: pkg?.destination,
          pricePerPerson: pkg ? `$${pkg.pricePerPerson}` : null,
          cabinClass: pkg?.cabinClass,
          provider: pkg?.provider
        });

        result = {
          success: true,
          message: `Package locked in: ${pkg ? pkg.name : input.packageId}. Ready to generate a personalized booking link.`,
          selectedPackage: pkg ? {
            name: pkg.name,
            destination: pkg.destination,
            pricePerPerson: `$${pkg.pricePerPerson}`,
            cabinClass: pkg.cabinClass,
            provider: pkg.provider
          } : { packageId: input.packageId },
          instruction: 'Package selected. Ask the member how they would like to receive their booking link — text message, email, or displayed on screen.'
        };
        break;
      }

      case 'generate_purl': {
        const session = input.sessionId ? sessions.get(input.sessionId) : null;
        if (session && !session.selectedPackageId) {
          result = { success: false, error: 'No package selected — call select_package first.' };
          break;
        }
        if (session) session.status = 'purl_generated';

        // Build mock PURL
        const payload = {
          sid: input.sessionId || uuid(),
          mn: session?.memberName || 'Member',
          mid: session?.memberId,
          pkg: session?.selectedPackageId || 'unknown',
          tt: session?.travelType || 'cruise',
          dst: session?.destination,
          pax: session?.travelers || 2,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7200
        };
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const mockSig = Buffer.from(`demo_${Date.now()}`).toString('base64url');
        const purl = `https://book.voxaris.io/b/${encoded}.${mockSig}`;

        const deliveryMethod = input.deliveryMethod || 'display';
        let deliveryMessage;
        if (deliveryMethod === 'sms' && input.memberPhone) {
          deliveryMessage = `Text message sent to ***${input.memberPhone.slice(-4)}. The link is valid for 2 hours.`;
        } else if (deliveryMethod === 'email' && input.memberEmail) {
          deliveryMessage = `Email sent to ${input.memberEmail.split('@')[0]?.[0]}***@${input.memberEmail.split('@')[1]}. The link is valid for 2 hours.`;
        } else {
          deliveryMessage = "Here's your personalized booking link. It's valid for 2 hours.";
        }

        // Get selected package details for the UI
        const selectedPkg = session?.selectedPackageId
          ? MOCK_PACKAGES.find(p => p.packageId === session.selectedPackageId)
          : null;

        // Push PURL to browser — this triggers the booking overlay
        pushAction(conversation_id, 'purl_ready', {
          purl,
          deliveryMethod,
          message: deliveryMessage,
          expiresAt: new Date(Date.now() + 7200000).toISOString(),
          memberName: session?.memberName || 'Member',
          package: selectedPkg ? {
            name: selectedPkg.name,
            destination: selectedPkg.destination,
            dates: `${selectedPkg.departureDate} to ${selectedPkg.returnDate}`,
            pricePerPerson: `$${selectedPkg.pricePerPerson.toLocaleString()}`,
            totalPrice: `$${selectedPkg.totalPrice.toLocaleString()}`,
            cabinClass: selectedPkg.cabinClass,
            provider: selectedPkg.provider,
            highlights: selectedPkg.highlights
          } : null
        });

        result = {
          success: true,
          purl,
          deliveryMethod,
          message: deliveryMessage,
          expiresAt: new Date(Date.now() + 7200000).toISOString(),
          instruction: 'The booking link has been displayed on the member\'s screen. Let them know they can click it to complete their booking. The link is personalized and pre-fills their cruise details. Wish them an amazing trip!'
        };
        break;
      }

      case 'booking_status': {
        const session = input.sessionId ? sessions.get(input.sessionId) : null;
        if (!session) {
          result = { success: true, status: 'not_found', message: 'No active booking session found. Would you like to start a new booking?' };
          break;
        }
        const statusMessages = {
          initiated: 'Booking session is active. Ready to search for packages.',
          results_presented: 'Search results are available for review.',
          package_selected: 'Package is selected. Ready to generate a booking link.',
          purl_generated: 'Personalized booking link has been created and sent.',
        };
        result = {
          success: true,
          status: session.status,
          sessionId: session.id,
          message: statusMessages[session.status] || `Current status: ${session.status}`,
          instruction: 'Relay the booking status to the member.'
        };
        break;
      }

      // ── Fallback ──
      default: {
        result = { success: false, error: `Unknown tool: ${tool_name}` };
      }
    }

    console.log(`[execute] ${tool_name} completed | success: ${result.success}`);

    // Return in Tavus expected format
    res.json({
      tool_call_id: tool_call_id || 'unknown',
      result
    });
  } catch (err) {
    console.error(`[execute] ${tool_name} error:`, err);
    res.status(500).json({
      tool_call_id: tool_call_id || 'unknown',
      result: {
        success: false,
        error: err.message,
        fallback: 'I had a small technical issue. Let me try again.'
      }
    });
  }
}
