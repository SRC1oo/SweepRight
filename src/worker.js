/**
 * SweepRight Cleaning — Cloudflare Worker
 * ════════════════════════════════════════════════════════════════
 * Entry point for the full Worker application.
 *
 * Routing:
 *   POST /api/create-checkout-session  → Stripe checkout creation
 *   POST /api/send-booking-email       → Send confirmation emails (legacy)
 *   POST /api/send-confirmation        → Success-page email trigger (dedup-safe)
 *   GET  /api/booking-details          → Retrieve stored booking
 *   OPTIONS *                          → CORS preflight
 *   *                                  → env.ASSETS (static site)
 *
 * Required secrets (set via Dashboard or `wrangler secret put`):
 *   STRIPE_SECRET_KEY      — sk_live_... or sk_test_...
 *   EMAIL_API_KEY          — Resend / SendGrid / Mailgun API key
 *
 * Optional secrets:
 *   STRIPE_WEBHOOK_SECRET  — whsec_... (for webhook verification)
 *
 * Non-secret vars (set in wrangler.jsonc → vars):
 *   SITE_URL               — https://sweeprightcleaning.com
 *   INTERNAL_EMAIL         — cleaners@sweeprightcleaning.com
 *   EMAIL_FROM             — SweepRight <bookings@sweeprightcleaning.com>
 *   EMAIL_API_URL          — https://api.resend.com/emails
 * ════════════════════════════════════════════════════════════════
 */

// ── BUSINESS RULES CONFIG ─────────────────────────────────────
// Must stay in sync with frontend CONFIG in script.js
const CONFIG = {
  rates:        { home: 26, commercial: 28 },
  displayRates: { home: 24, commercial: 26 },
  minHours:     3,
  minLeadHours: 48,
  discounts: {
    'one-off':    0,
    'daily':      12.5,
    'weekly':     10,
    'fortnightly': 7,
    'monthly':    5,
  },
  // Extra time catalogue: extra id → minutes added
  extrasCatalogue: {
    'oven':              40,
    'fridge':            20,
    'pet-hair':          25,
    'balcony':           25,
    'sofa':              30,
    'laundry':           25,
    'ironing':           25,
    'windows':           20,
    'deep-bath':         20,
    'kitchen-deep':      30,
    'washroom':          20,
    'internal-glass':    20,
    'carpet-spot':       30,
    'carpet':            45,
    'disinfection':      30,
    'kitchen-breakroom': 30,
    'deep-clean-addon':  60,
    'end-of-tenancy':    90,
    'pre-inspection':    45,
  },
  contact: {
    phone: '+44 7425 583734',
    email: 'cleaners@sweeprightcleaning.com',
  },
};

// ── CORS HEADERS ──────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ═════════════════════════════════════════════════════════════
// WORKER ENTRY POINT
// ═════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // ── CORS preflight ──
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── API ROUTING ──
    if (path.startsWith('/api/')) {
      try {
        if (path === '/api/create-checkout-session' && method === 'POST') {
          return await handleCreateCheckout(request, env);
        }
        if (path === '/api/send-booking-email' && method === 'POST') {
          return await handleSendBookingEmail(request, env);
        }
        if (path === '/api/send-confirmation' && method === 'POST') {
          return await handleSendConfirmation(request, env);
        }
        if (path === '/api/booking-details' && method === 'GET') {
          return await handleBookingDetails(request, env);
        }
        // Unknown API route
        return apiResponse({ error: 'Not found' }, 404);
      } catch (err) {
        console.error('API error on', path, err);
        return apiResponse({ error: 'Internal server error' }, 500);
      }
    }

    // ── STATIC ASSETS fallback ──
    return env.ASSETS.fetch(request);
  },
};


// ═════════════════════════════════════════════════════════════
// POST /api/create-checkout-session
// Validates booking, calculates server-side price, creates
// a Stripe Checkout session, and returns the redirect URL.
// ═════════════════════════════════════════════════════════════
async function handleCreateCheckout(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return apiResponse({ error: 'Invalid JSON body' }, 400);
  }

  // ── Validate inputs ──
  const validationErrors = validateBooking(body);
  if (validationErrors.length > 0) {
    return apiResponse({ error: validationErrors.join('. ') }, 400);
  }

  // ── Server-side price calculation ──
  const pricing = calculatePrice(body);

  // ── Sanity check client total (allow ±£1 for rounding) ──
  if (body.finalTotal !== undefined && Math.abs(pricing.finalTotal - body.finalTotal) > 1.00) {
    return apiResponse({
      error: `Price mismatch detected. Server calculated £${pricing.finalTotal.toFixed(2)}. Please refresh and try again.`,
    }, 400);
  }

  // ── 48-hour lead time check ──
  const bookingDate = new Date(body.bookingDate + 'T00:00:00Z');
  const minDate     = new Date(Date.now() + CONFIG.minLeadHours * 60 * 60 * 1000);
  minDate.setUTCHours(0, 0, 0, 0);
  if (bookingDate < minDate) {
    return apiResponse({ error: 'We require at least 48 hours notice. Please choose a later date.' }, 400);
  }

  // ── Check Stripe key ──
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return apiResponse({ error: 'Payment system not configured. Please call us on +44 7425 583734 to book.' }, 503);
  }

  // ── Build Stripe metadata (all values must be strings, max 500 chars each) ──
  const meta = truncateMeta({
    customerName:        body.customerName  || '',
    companyName:         body.companyName   || '',
    email:               body.email         || '',
    phone:               body.phone         || '',
    address:             body.address       || '',
    postcode:            body.postcode      || '',
    serviceCategory:     body.serviceCategory,
    propertyType:        body.propertyType,
    frequency:           body.frequency,
    baseHours:           String(pricing.baseHours),
    extraHours:          pricing.extraHours.toFixed(2),
    totalHours:          pricing.totalHours.toFixed(2),
    hourlyRate:          String(pricing.hourlyRate),
    discountPct:         String(pricing.discountPct),
    finalTotal:          pricing.finalTotal.toFixed(2),
    bookingDate:         body.bookingDate   || '',
    timeWindow:          body.timeWindow    || '',
    recurringDays:       (body.recurringDays || []).join(','),
    extras:              pricing.extrasText,
    accessInstructions:  body.accessInstructions  || '',
    belowRecExplanation: body.belowRecExplanation || '',
    recMinHrs:           String(body.recMinHrs || ''),
    recMaxHrs:           String(body.recMaxHrs || ''),
  });

  // ── Create Stripe Checkout session ──
  const siteUrl     = env.SITE_URL || 'https://sweeprightcleaning.com';
  const serviceName = buildServiceName(body, pricing);
  const lineDesc    = buildLineDesc(body);
  const amountPence = Math.round(pricing.finalTotal * 100);

  const stripeParams = new URLSearchParams({
    'mode':                                                  'payment',
    'currency':                                              'gbp',
    'customer_email':                                        body.email,
    'success_url':                                           `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url':                                            `${siteUrl}/cancel.html`,
    'line_items[0][price_data][currency]':                   'gbp',
    'line_items[0][price_data][product_data][name]':         serviceName,
    'line_items[0][price_data][product_data][description]':  lineDesc,
    'line_items[0][price_data][unit_amount]':                String(amountPence),
    'line_items[0][quantity]':                               '1',
  });

  for (const [k, v] of Object.entries(meta)) {
    stripeParams.set(`metadata[${k}]`, v);
  }

  const stripeRes  = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${stripeKey}`,
      'Content-Type':   'application/x-www-form-urlencoded',
    },
    body: stripeParams.toString(),
  });

  const session = await stripeRes.json();
  if (session.error) {
    console.error('Stripe error:', JSON.stringify(session.error));
    return apiResponse({ error: 'Could not create payment session. Please try again.' }, 502);
  }

  return apiResponse({ url: session.url, sessionId: session.id });
}


// ═════════════════════════════════════════════════════════════
// POST /api/send-booking-email
// Standalone endpoint to trigger booking confirmation emails.
// Call this from your success webhook or success page.
// Body: { booking: { ...all booking fields... } }
// ═════════════════════════════════════════════════════════════
async function handleSendBookingEmail(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return apiResponse({ error: 'Invalid JSON body' }, 400);
  }

  const booking = body.booking || body;
  if (!booking.email && !booking.customerEmail) {
    return apiResponse({ error: 'Missing customer email' }, 400);
  }

  const customerEmail = booking.customerEmail || booking.email;
  const results = await sendBothEmails(env, booking, customerEmail);
  return apiResponse({ sent: results });
}


// ═════════════════════════════════════════════════════════════
// GET /api/booking-details?session_id=cs_...
// Retrieves booking data stored in KV, or falls back to
// fetching it from the Stripe session metadata.
// ═════════════════════════════════════════════════════════════
async function handleBookingDetails(request, env) {
  const url       = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    return apiResponse({ error: 'Missing session_id parameter' }, 400);
  }

  // Try KV first (populated by webhook)
  if (env.BOOKINGS_KV) {
    const stored = await env.BOOKINGS_KV.get('booking_' + sessionId);
    if (stored) {
      return apiResponse({ booking: JSON.parse(stored) });
    }
  }

  // Fallback: retrieve directly from Stripe
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    const res     = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    });
    const session = await res.json();
    if (session && session.metadata) {
      return apiResponse({ booking: { ...session.metadata, amountPaid: (session.amount_total / 100).toFixed(2) } });
    }
  }

  return apiResponse({ error: 'Booking not found' }, 404);
}


// ═════════════════════════════════════════════════════════════
// POST /api/send-confirmation
// Called by the success page immediately after payment.
// Fetches the booking via KV or Stripe, sends both emails,
// and stores a dedup flag so refreshes never re-send.
//
// Body:   { session_id: "cs_..." }
// Return: { success: true, alreadySent: false }
//       | { success: true, alreadySent: true  }
//       | { success: false, error: "..."       }
// ═════════════════════════════════════════════════════════════
async function handleSendConfirmation(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return apiResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const sessionId = body.session_id;
  if (!sessionId || typeof sessionId !== 'string') {
    return apiResponse({ success: false, error: 'Missing session_id' }, 400);
  }

  const dedupKey = 'confirmation_sent_' + sessionId;

  // ── Duplicate-send guard ──
  // Check KV for a flag set on the previous successful send.
  if (env.BOOKINGS_KV) {
    const alreadySent = await env.BOOKINGS_KV.get(dedupKey);
    if (alreadySent) {
      return apiResponse({ success: true, alreadySent: true });
    }
  }

  // ── Retrieve booking: KV first, then Stripe metadata fallback ──
  let booking = null;

  if (env.BOOKINGS_KV) {
    const stored = await env.BOOKINGS_KV.get('booking_' + sessionId);
    if (stored) {
      try { booking = JSON.parse(stored); } catch { /* fall through to Stripe */ }
    }
  }

  if (!booking && env.STRIPE_SECRET_KEY) {
    const res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` } }
    );
    const session = await res.json();
    if (session && session.metadata) {
      booking = {
        ...session.metadata,
        stripeSessionId: session.id,
        paymentIntentId: session.payment_intent || '',
        amountPaid:      ((session.amount_total || 0) / 100).toFixed(2),
      };
    }
  }

  if (!booking) {
    return apiResponse({ success: false, error: 'Booking not found for this session' }, 404);
  }

  const customerEmail = booking.email || booking.customerEmail;
  if (!customerEmail) {
    return apiResponse({ success: false, error: 'No customer email on booking' }, 400);
  }

  // ── Send both emails ──
  const results = await sendBothEmails(env, booking, customerEmail);

  // ── Set dedup flag (90-day TTL) ──
  // Only written after a successful send attempt, so a failed send
  // can be retried on the next page load rather than being silently skipped.
  if (env.BOOKINGS_KV) {
    await env.BOOKINGS_KV.put(dedupKey, '1', { expirationTtl: 60 * 60 * 24 * 90 });
  }

  return apiResponse({ success: true, alreadySent: false, results });
}


// ═════════════════════════════════════════════════════════════
// PRICE CALCULATION (server-side, mirrors frontend logic)
// ═════════════════════════════════════════════════════════════
function calculatePrice(body) {
  const isHome    = body.serviceCategory === 'home' || body.propertyType === 'airbnb';
  const hourlyRate = isHome ? CONFIG.rates.home : CONFIG.rates.commercial;

  // Validate and total extras
  let extraMins = 0;
  const validatedExtras = [];
  const extrasList = body.selectedExtras || [];
  for (const ex of extrasList) {
    const mins = CONFIG.extrasCatalogue[ex.id];
    if (mins) {
      extraMins += mins;
      validatedExtras.push({ id: ex.id, name: ex.name || ex.id, mins });
    }
  }

  const extraHours  = extraMins / 60;
  const baseHours   = Math.max(CONFIG.minHours, parseFloat(body.hours) || CONFIG.minHours);
  const totalHours  = baseHours + extraHours;
  const subtotal    = totalHours * hourlyRate;
  const discountPct = CONFIG.discounts[body.frequency] ?? 0;
  const discountAmt = subtotal * discountPct / 100;
  const finalTotal  = Math.round((subtotal - discountAmt) * 100) / 100;

  return {
    isHome,
    hourlyRate,
    baseHours,
    extraHours,
    totalHours,
    subtotal,
    discountPct,
    discountAmt,
    finalTotal,
    validatedExtras,
    extrasText: validatedExtras.map(e => e.name).join(', '),
  };
}


// ═════════════════════════════════════════════════════════════
// VALIDATION
// ═════════════════════════════════════════════════════════════
function validateBooking(body) {
  const errs = [];
  if (!body.serviceCategory || !['home', 'commercial'].includes(body.serviceCategory)) {
    errs.push('Invalid service category');
  }
  if (!body.propertyType) {
    errs.push('Property type is required');
  }
  if (!body.hours || parseFloat(body.hours) < CONFIG.minHours) {
    errs.push(`Minimum booking is ${CONFIG.minHours} hours`);
  }
  if (!body.frequency || !(body.frequency in CONFIG.discounts)) {
    errs.push('Invalid frequency');
  }
  if (!body.bookingDate) {
    errs.push('Booking date is required');
  }
  if (!body.customerName?.trim()) {
    errs.push('Customer name is required');
  }
  if (!body.email?.includes('@')) {
    errs.push('Valid email is required');
  }
  if (!body.phone?.trim()) {
    errs.push('Phone number is required');
  }
  if (!body.address?.trim()) {
    errs.push('Address is required');
  }
  if (!body.postcode?.trim()) {
    errs.push('Postcode is required');
  }
  return errs;
}


// ═════════════════════════════════════════════════════════════
// EMAIL SENDING
// ═════════════════════════════════════════════════════════════

async function sendBothEmails(env, booking, customerEmail) {
  const emailApiKey = env.EMAIL_API_KEY;
  const emailApiUrl = env.EMAIL_API_URL || 'https://api.resend.com/emails';
  const emailFrom   = env.EMAIL_FROM   || 'SweepRight <bookings@sweeprightcleaning.com>';
  const internalTo  = env.INTERNAL_EMAIL || CONFIG.contact.email;

  if (!emailApiKey) {
    console.warn('EMAIL_API_KEY not set — skipping email send');
    return { customerEmail: 'skipped', internalEmail: 'skipped' };
  }

  const [custResult, intResult] = await Promise.allSettled([
    // Customer confirmation
    dispatchEmail(emailApiUrl, emailApiKey, {
      from:    emailFrom,
      to:      customerEmail,
      subject: 'Booking Confirmed — SweepRight Cleaning',
      html:    buildCustomerEmailHtml(booking),
      text:    buildCustomerEmailText(booking),
    }),
    // Internal notification
    dispatchEmail(emailApiUrl, emailApiKey, {
      from:    emailFrom,
      to:      internalTo,
      subject: `New Booking — ${booking.customerName} — £${booking.amountPaid || booking.finalTotal}`,
      html:    buildInternalEmailHtml(booking),
      text:    buildInternalEmailText(booking),
    }),
  ]);

  return {
    customerEmail: custResult.status === 'fulfilled' ? 'sent' : 'failed',
    internalEmail: intResult.status  === 'fulfilled' ? 'sent' : 'failed',
  };
}

async function dispatchEmail(apiUrl, apiKey, payload) {
  const res = await fetch(apiUrl, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Email API ${res.status}: ${err}`);
  }
  return res.json();
}


// ═════════════════════════════════════════════════════════════
// HTML EMAIL — CUSTOMER CONFIRMATION
// ═════════════════════════════════════════════════════════════
function buildCustomerEmailHtml(b) {
  const timeLabels = {
    morning:   'Morning (8am–12pm)',
    afternoon: 'Afternoon (12pm–5pm)',
    evening:   'Evening (5pm–8pm)',
  };
  const serviceLine = b.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning';
  const discountNote = parseFloat(b.discountPct) > 0
    ? `<p style="font-size:13px;color:#065F46;margin:8px 0 0">Includes ${b.discountPct}% ${cap(b.frequency)} discount</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Booking Confirmed — SweepRight</title>
</head>
<body style="margin:0;padding:0;background:#F4FBF9;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4FBF9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#1DB8A0 0%,#0D5C50 100%);padding:36px 40px;text-align:center">
      <p style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.03em">
        Sweep<span style="color:rgba(255,255,255,0.75)">Right</span>
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.7)">Trusted Cleaning Across the UK</p>
    </td>
  </tr>

  <!-- HERO -->
  <tr>
    <td style="padding:36px 40px 0;text-align:center">
      <p style="font-size:48px;margin:0 0 12px">✅</p>
      <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#1A2332;letter-spacing:-0.02em">Booking Confirmed</h1>
      <p style="margin:0;font-size:15px;color:#4B5563;line-height:1.6">
        Thank you, <strong>${esc(b.customerName)}</strong>! Your cleaning is booked and your payment has been received.
      </p>
    </td>
  </tr>

  <!-- BOOKING DETAILS CARD -->
  <tr>
    <td style="padding:28px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9CA3AF">Booking Details</p>
          </td>
        </tr>
        ${eRow('Service',       serviceLine)}
        ${eRow('Property',      cap(b.propertyType || '—'))}
        ${eRow('Date',          b.bookingDate || '—')}
        ${eRow('Time',          timeLabels[b.timeWindow] || b.timeWindow || '—')}
        ${eRow('Duration',      (b.totalHours || b.baseHours || '—') + ' hours')}
        ${eRow('Frequency',     cap(b.frequency || 'One-off'))}
        ${b.extras ? eRow('Extras', b.extras) : ''}
        ${b.recurringDays ? eRow('Recurring Days', b.recurringDays.split(',').map(cap).join(', ')) : ''}
        ${b.address ? eRow('Address', `${b.address}, ${b.postcode || ''}`) : ''}
      </table>
    </td>
  </tr>

  <!-- PAYMENT SUMMARY -->
  <tr>
    <td style="padding:20px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#E6F9F6;border:1px solid rgba(29,184,160,0.2);border-radius:12px">
        <tr>
          <td style="padding:20px 24px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:15px;font-weight:700;color:#0D5C50">Total Paid</td>
                <td align="right" style="font-size:26px;font-weight:800;color:#1DB8A0">£${b.amountPaid || b.finalTotal || '—'}</td>
              </tr>
            </table>
            ${discountNote}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- WHAT HAPPENS NEXT -->
  <tr>
    <td style="padding:20px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:12px">
        <tr>
          <td style="padding:20px 24px">
            <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1A2332">What happens next?</p>
            <p style="margin:0;font-size:14px;color:#4B5563;line-height:1.65">
              We'll be in touch shortly to confirm your scheduling details and introduce you to your assigned cleaner.
              Your cleaner will contact you before they arrive so you know exactly when to expect them.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CANCELLATION POLICY -->
  <tr>
    <td style="padding:16px 40px 0;text-align:center">
      <p style="margin:0;font-size:12px;color:#9CA3AF">
        Free cancellation or rescheduling with at least 24 hours' notice.
      </p>
    </td>
  </tr>

  <!-- CONTACT -->
  <tr>
    <td style="padding:20px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px">
        <tr>
          <td style="padding:16px 24px;text-align:center">
            <p style="margin:0 0 8px;font-size:13px;color:#6B7280">Need to get in touch?</p>
            <p style="margin:0;font-size:14px;font-weight:600">
              <a href="tel:+447425583734" style="color:#1DB8A0;text-decoration:none">📞 +44 7425 583734</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="mailto:cleaners@sweeprightcleaning.com" style="color:#1DB8A0;text-decoration:none">✉️ cleaners@sweeprightcleaning.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:32px 40px;text-align:center;background:#1A2332;margin-top:28px">
      <p style="margin:0 0 4px;font-size:18px;font-weight:800;color:#ffffff">
        Sweep<span style="color:#1DB8A0">Right</span>
      </p>
      <p style="margin:0 0 4px;font-size:12px;color:rgba(255,255,255,0.5)">
        Trusted Cleaning Across the UK
      </p>
      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3)">&copy; 2026 SweepRight. All rights reserved.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildCustomerEmailText(b) {
  const timeLabels = { morning: 'Morning (8am-12pm)', afternoon: 'Afternoon (12pm-5pm)', evening: 'Evening (5pm-8pm)' };
  return [
    'BOOKING CONFIRMED — SweepRight Cleaning',
    '═'.repeat(48),
    '',
    `Thank you, ${b.customerName}! Your payment has been received and your booking is confirmed.`,
    '',
    'BOOKING DETAILS',
    '─'.repeat(32),
    `Service:    ${b.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning'}`,
    `Property:   ${cap(b.propertyType || '—')}`,
    `Date:       ${b.bookingDate || '—'}`,
    `Time:       ${timeLabels[b.timeWindow] || b.timeWindow || '—'}`,
    `Duration:   ${b.totalHours || b.baseHours || '—'} hours`,
    `Frequency:  ${cap(b.frequency || 'One-off')}`,
    b.extras ? `Extras:     ${b.extras}` : '',
    b.recurringDays ? `Recurring:  ${b.recurringDays.split(',').map(cap).join(', ')}` : '',
    b.address ? `Address:    ${b.address}, ${b.postcode || ''}` : '',
    '',
    'PAYMENT',
    '─'.repeat(32),
    `Total Paid: £${b.amountPaid || b.finalTotal || '—'}`,
    parseFloat(b.discountPct) > 0 ? `Discount:   ${b.discountPct}% ${cap(b.frequency)} saving` : '',
    '',
    'WHAT HAPPENS NEXT',
    '─'.repeat(32),
    "We'll be in touch shortly to confirm scheduling details and introduce your assigned cleaner.",
    'Your cleaner will contact you before arrival.',
    '',
    'Free cancellation or rescheduling with at least 24 hours notice.',
    '',
    '─'.repeat(48),
    'SweepRight',
    '+44 7425 583734',
    'cleaners@sweeprightcleaning.com',
  ].filter(l => l !== undefined && l !== null).join('\n');
}


// ═════════════════════════════════════════════════════════════
// HTML EMAIL — INTERNAL BOOKING NOTIFICATION
// ═════════════════════════════════════════════════════════════
function buildInternalEmailHtml(b) {
  const timeLabels = { morning: 'Morning (8am–12pm)', afternoon: 'Afternoon (12pm–5pm)', evening: 'Evening (5pm–8pm)' };
  const belowRecBlock = b.belowRecExplanation ? `
        <tr>
          <td style="padding:20px 40px 0">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px">
              <tr>
                <td style="padding:16px 20px">
                  <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400E">⚠️ Below Recommended Hours</p>
                  <p style="margin:0 0 6px;font-size:13px;color:#78350F">
                    Customer selected <strong>${b.baseHours} hrs</strong> (recommended ${b.recMinHrs}–${b.recMaxHrs} hrs).
                  </p>
                  <p style="margin:0;font-size:13px;color:#78350F;font-style:italic">"${esc(b.belowRecExplanation)}"</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>New Booking — SweepRight</title>
</head>
<body style="margin:0;padding:0;background:#F4FBF9;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4FBF9;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- HEADER -->
  <tr>
    <td style="background:linear-gradient(135deg,#1DB8A0 0%,#0D5C50 100%);padding:28px 40px;text-align:center">
      <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff">Sweep<span style="color:rgba(255,255,255,0.75)">Right</span></p>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.7)">New Booking Received</p>
    </td>
  </tr>

  <!-- AMOUNT HERO -->
  <tr>
    <td style="padding:28px 40px 0;text-align:center">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#E6F9F6;border:1px solid rgba(29,184,160,0.2);border-radius:12px">
        <tr>
          <td style="padding:20px;text-align:center">
            <p style="margin:0 0 4px;font-size:12px;color:#065F46;text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Amount Received</p>
            <p style="margin:0;font-size:36px;font-weight:800;color:#1DB8A0">£${b.amountPaid || b.finalTotal || '—'}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CUSTOMER DETAILS -->
  <tr>
    <td style="padding:24px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:12px 20px;border-bottom:1px solid #E5E7EB">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9CA3AF">Customer</p>
          </td>
        </tr>
        ${eRow('Name',    b.customerName || '—')}
        ${b.companyName ? eRow('Company', b.companyName) : ''}
        ${eRow('Phone',   b.phone || '—')}
        ${eRow('Email',   b.customerEmail || b.email || '—')}
        ${eRow('Address', `${b.address || '—'}, ${b.postcode || ''}`)}
        ${b.accessInstructions ? eRow('Access', b.accessInstructions) : ''}
      </table>
    </td>
  </tr>

  <!-- BOOKING DETAILS -->
  <tr>
    <td style="padding:16px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:12px 20px;border-bottom:1px solid #E5E7EB">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9CA3AF">Booking</p>
          </td>
        </tr>
        ${eRow('Service',     b.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning')}
        ${eRow('Property',    cap(b.propertyType || '—'))}
        ${eRow('Date',        b.bookingDate || '—')}
        ${eRow('Time',        timeLabels[b.timeWindow] || b.timeWindow || '—')}
        ${eRow('Base Hours',  (b.baseHours || '—') + ' hrs')}
        ${parseFloat(b.extraHours) > 0 ? eRow('Extra Hours (add-ons)', b.extraHours + ' hrs') : ''}
        ${eRow('Total Hours', (b.totalHours || b.baseHours || '—') + ' hrs')}
        ${eRow('Recommended', (b.recMinHrs || '—') + '–' + (b.recMaxHrs || '—') + ' hrs')}
        ${eRow('Frequency',   cap(b.frequency || '—'))}
        ${eRow('Rate',        '£' + (b.hourlyRate || '—') + '/hr')}
        ${parseFloat(b.discountPct) > 0 ? eRow('Discount', b.discountPct + '%') : ''}
        ${b.extras ? eRow('Extras', b.extras) : ''}
        ${b.recurringDays ? eRow('Recurring Days', b.recurringDays.split(',').map(cap).join(', ')) : ''}
      </table>
    </td>
  </tr>

  ${belowRecBlock}

  <!-- PAYMENT REF -->
  <tr>
    <td style="padding:16px 40px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:12px 20px;border-bottom:1px solid #E5E7EB">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9CA3AF">Payment</p>
          </td>
        </tr>
        ${eRow('Amount',         '£' + (b.amountPaid || b.finalTotal || '—'))}
        ${eRow('Stripe Session', b.stripeSessionId ? b.stripeSessionId.slice(-16) : '—')}
        ${eRow('Payment Intent', b.paymentIntentId || '—')}
      </table>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="padding:24px 40px;text-align:center;background:#1A2332;margin-top:24px">
      <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4)">SweepRight Internal Notification — Do Not Forward</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildInternalEmailText(b) {
  const timeLabels = { morning: 'Morning (8am-12pm)', afternoon: 'Afternoon (12pm-5pm)', evening: 'Evening (5pm-8pm)' };
  return [
    'NEW BOOKING RECEIVED — SweepRight (INTERNAL)',
    '═'.repeat(48),
    '',
    `Amount: £${b.amountPaid || b.finalTotal || '—'}`,
    '',
    'CUSTOMER',
    '─'.repeat(32),
    `Name:    ${b.customerName || '—'}`,
    b.companyName ? `Company: ${b.companyName}` : '',
    `Phone:   ${b.phone || '—'}`,
    `Email:   ${b.customerEmail || b.email || '—'}`,
    `Address: ${b.address || '—'}, ${b.postcode || ''}`,
    b.accessInstructions ? `Access:  ${b.accessInstructions}` : '',
    '',
    'BOOKING',
    '─'.repeat(32),
    `Service:    ${b.serviceCategory === 'home' ? 'Home' : 'Commercial'} Cleaning`,
    `Property:   ${cap(b.propertyType || '—')}`,
    `Date:       ${b.bookingDate || '—'}`,
    `Time:       ${timeLabels[b.timeWindow] || b.timeWindow || '—'}`,
    `Base Hours: ${b.baseHours || '—'} hrs`,
    parseFloat(b.extraHours) > 0 ? `Extra Hrs:  ${b.extraHours} hrs (add-ons)` : '',
    `Total Hrs:  ${b.totalHours || b.baseHours || '—'} hrs`,
    `Recommend:  ${b.recMinHrs || '—'}–${b.recMaxHrs || '—'} hrs`,
    `Frequency:  ${cap(b.frequency || '—')}`,
    `Rate:       £${b.hourlyRate || '—'}/hr`,
    parseFloat(b.discountPct) > 0 ? `Discount:   ${b.discountPct}%` : '',
    b.extras ? `Extras:     ${b.extras}` : '',
    b.recurringDays ? `Recurring:  ${b.recurringDays}` : '',
    b.belowRecExplanation
      ? `\n⚠️  BELOW RECOMMENDED HOURS\nCustomer note: "${b.belowRecExplanation}"`
      : '',
    '',
    'PAYMENT',
    '─'.repeat(32),
    `Amount:  £${b.amountPaid || b.finalTotal || '—'}`,
    `Session: ${b.stripeSessionId || '—'}`,
    `PI:      ${b.paymentIntentId || '—'}`,
    '',
    '─'.repeat(48),
    'SweepRight Internal — Do not forward',
  ].filter(l => l !== undefined && l !== null).join('\n');
}


// ═════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════

function apiResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function cap(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Email table row helper
function eRow(label, value) {
  if (!value || value === '—, ') return '';
  return `
    <tr>
      <td style="padding:10px 20px;border-bottom:1px solid #F3F4F6">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#9CA3AF;width:40%">${esc(label)}</td>
            <td style="font-size:13px;color:#1A2332;font-weight:600;text-align:right">${esc(String(value))}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// Truncate all metadata values to 500 chars (Stripe limit)
function truncateMeta(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const s = String(v || '');
    result[k] = s.length > 500 ? s.slice(0, 497) + '...' : s;
  }
  return result;
}

function buildServiceName(body, pricing) {
  const type   = pricing.isHome ? 'Home' : 'Commercial';
  const prop   = cap(body.propertyType || 'property');
  const hours  = pricing.totalHours.toFixed(1);
  return `${type} Cleaning — ${prop} — ${hours}hrs`;
}

function buildLineDesc(body) {
  const freq = body.frequency !== 'one-off'
    ? `${cap(body.frequency)} service`
    : 'One-off clean';
  return `SweepRight — ${freq} on ${body.bookingDate}`;
}
