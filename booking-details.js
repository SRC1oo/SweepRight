/**
 * SweepRight — Booking Details Retriever
 * Cloudflare Pages Function: GET /api/booking-details?session_id=cs_...
 *
 * Retrieves booking details from KV or Stripe session metadata
 * for display on the success page.
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    return jsonResponse({ error: 'Missing session_id' }, 400);
  }

  try {
    // Try KV first
    if (env.BOOKINGS_KV) {
      const stored = await env.BOOKINGS_KV.get('booking_' + sessionId);
      if (stored) {
        return jsonResponse({ booking: JSON.parse(stored) });
      }
    }

    // Fallback: retrieve from Stripe
    const stripeKey = env.STRIPE_SECRET_KEY;
    if (stripeKey) {
      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId), {
        headers: { 'Authorization': 'Bearer ' + stripeKey },
      });
      const session = await resp.json();
      if (session && session.metadata) {
        return jsonResponse({ booking: session.metadata });
      }
    }

    return jsonResponse({ error: 'Booking not found' }, 404);
  } catch (err) {
    console.error('Booking details error:', err);
    return jsonResponse({ error: 'Failed to retrieve booking' }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
