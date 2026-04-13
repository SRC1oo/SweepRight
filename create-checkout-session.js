/**
 * SweepRight — Stripe Checkout Session Creator
 * Cloudflare Pages Function: POST /api/create-checkout-session
 *
 * Environment Variables Required:
 *   STRIPE_SECRET_KEY        — Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_PUBLISHABLE_KEY   — Stripe publishable key (not used server-side but can be referenced)
 *   SITE_URL                 — e.g. https://sweeprightcleaning.com
 *   EMAIL_API_KEY            — API key for email service (SendGrid, Resend, Mailgun, etc.)
 *   EMAIL_FROM               — Sender address for transactional emails
 */

// ── CONFIG (must match frontend CONFIG exactly) ──
const RATES = { home: 26, commercial: 28 };
const MIN_HOURS = 3;
const MIN_LEAD_HOURS = 48;
const DISCOUNTS = {
  'one-off': 0,
  'daily': 12.5,
  'weekly': 10,
  'fortnightly': 7,
  'monthly': 5,
};

const HOME_TIME_BASE = 120;
const HOME_PER_BED = 45;
const HOME_PER_BATH = 30;

const EXTRAS_CATALOGUE = {
  'oven': 40, 'fridge': 20, 'pet-hair': 25, 'balcony': 25,
  'sofa': 30, 'laundry': 25, 'ironing': 25, 'windows': 20,
  'deep-bath': 20, 'kitchen-deep': 30,
  'washroom': 20, 'internal-glass': 20, 'carpet-spot': 30,
  'carpet': 45, 'disinfection': 30, 'kitchen-breakroom': 30,
  'deep-clean-addon': 60, 'end-of-tenancy': 90, 'pre-inspection': 45,
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();

    // ── VALIDATE ──
    const errors = validate(body);
    if (errors.length > 0) {
      return jsonResponse({ error: errors.join('; ') }, 400);
    }

    // ── SERVER-SIDE PRICE CALCULATION ──
    const isHome = body.serviceCategory === 'home' || body.propertyType === 'airbnb';
    const hourlyRate = isHome ? RATES.home : RATES.commercial;

    // Validate extras
    let extraMins = 0;
    const validatedExtras = [];
    if (body.selectedExtras && Array.isArray(body.selectedExtras)) {
      for (const ex of body.selectedExtras) {
        const catalogueMins = EXTRAS_CATALOGUE[ex.id];
        if (catalogueMins) {
          extraMins += catalogueMins;
          validatedExtras.push({ id: ex.id, name: ex.name, mins: catalogueMins });
        }
      }
    }

    const extraHours = extraMins / 60;
    const baseHours = Math.max(MIN_HOURS, parseFloat(body.hours) || MIN_HOURS);
    const totalHours = baseHours + extraHours;

    const subtotal = totalHours * hourlyRate;
    const discountPct = DISCOUNTS[body.frequency] || 0;
    const discountAmount = subtotal * discountPct / 100;
    const finalTotal = Math.round((subtotal - discountAmount) * 100) / 100;

    // Sanity check: client total shouldn't differ by more than £1
    if (Math.abs(finalTotal - body.finalTotal) > 1.00) {
      return jsonResponse({
        error: 'Price mismatch. Please refresh and try again. Server calculated £' + finalTotal.toFixed(2) + '.'
      }, 400);
    }

    // ── BOOKING DATE CHECK ──
    const bookingDate = new Date(body.bookingDate + 'T00:00:00Z');
    const now = new Date();
    const minDate = new Date(now.getTime() + MIN_LEAD_HOURS * 60 * 60 * 1000);
    minDate.setUTCHours(0, 0, 0, 0);
    if (bookingDate < minDate) {
      return jsonResponse({ error: 'We require at least 48 hours notice. Please choose a later date.' }, 400);
    }

    // ── BUILD METADATA ──
    const metadata = {
      customerName: body.customerName || '',
      companyName: body.companyName || '',
      email: body.email || '',
      phone: body.phone || '',
      address: body.address || '',
      postcode: body.postcode || '',
      serviceCategory: body.serviceCategory,
      propertyType: body.propertyType,
      frequency: body.frequency,
      baseHours: String(baseHours),
      extraHours: String(extraHours.toFixed(2)),
      totalHours: String(totalHours.toFixed(2)),
      hourlyRate: String(hourlyRate),
      discountPct: String(discountPct),
      finalTotal: String(finalTotal.toFixed(2)),
      bookingDate: body.bookingDate || '',
      timeWindow: body.timeWindow || '',
      recurringDays: (body.recurringDays || []).join(','),
      extras: validatedExtras.map(e => e.name).join(', '),
      accessInstructions: body.accessInstructions || '',
      belowRecExplanation: body.belowRecExplanation || '',
      recMinHrs: String(body.recMinHrs || ''),
      recMaxHrs: String(body.recMaxHrs || ''),
    };

    // Truncate metadata values to 500 chars (Stripe limit)
    for (const key of Object.keys(metadata)) {
      if (metadata[key] && metadata[key].length > 500) {
        metadata[key] = metadata[key].substring(0, 497) + '...';
      }
    }

    // ── CREATE STRIPE CHECKOUT SESSION ──
    const siteUrl = env.SITE_URL || 'https://sweeprightcleaning.com';
    const stripeKey = env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return jsonResponse({ error: 'Payment system not configured. Please contact us to book.' }, 500);
    }

    const serviceName = (isHome ? 'Home' : 'Commercial') + ' Cleaning — ' +
      (body.propertyType || 'Standard') + ' — ' +
      totalHours.toFixed(1) + 'hrs';

    const stripeBody = new URLSearchParams({
      'mode': 'payment',
      'currency': 'gbp',
      'customer_email': body.email,
      'success_url': siteUrl + '/success.html?session_id={CHECKOUT_SESSION_ID}',
      'cancel_url': siteUrl + '/cancel.html',
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][product_data][name]': serviceName,
      'line_items[0][price_data][product_data][description]':
        'SweepRight Cleaning — ' + (body.frequency !== 'one-off' ? capitalize(body.frequency) + ' service' : 'One-off clean') +
        ' on ' + body.bookingDate,
      'line_items[0][price_data][unit_amount]': String(Math.round(finalTotal * 100)),
      'line_items[0][quantity]': '1',
    });

    // Add metadata
    for (const [key, val] of Object.entries(metadata)) {
      stripeBody.set('metadata[' + key + ']', val);
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stripeKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeBody.toString(),
    });

    const session = await stripeResponse.json();
    if (session.error) {
      console.error('Stripe error:', session.error);
      return jsonResponse({ error: 'Payment session could not be created. Please try again.' }, 500);
    }

    return jsonResponse({ url: session.url, sessionId: session.id });

  } catch (err) {
    console.error('Checkout error:', err);
    return jsonResponse({ error: 'Something went wrong. Please try again or contact us.' }, 500);
  }
}

// ── VALIDATION ──
function validate(body) {
  const errors = [];
  if (!body.serviceCategory || !['home', 'commercial'].includes(body.serviceCategory)) {
    errors.push('Invalid service category');
  }
  if (!body.propertyType) errors.push('Property type is required');
  if (!body.hours || body.hours < MIN_HOURS) {
    errors.push('Minimum booking is ' + MIN_HOURS + ' hours');
  }
  if (!body.frequency || !(body.frequency in DISCOUNTS)) {
    errors.push('Invalid frequency');
  }
  if (!body.bookingDate) errors.push('Booking date is required');
  if (!body.customerName || !body.customerName.trim()) errors.push('Name is required');
  if (!body.email || !body.email.includes('@')) errors.push('Valid email is required');
  if (!body.phone || !body.phone.trim()) errors.push('Phone number is required');
  if (!body.address || !body.address.trim()) errors.push('Address is required');
  if (!body.postcode || !body.postcode.trim()) errors.push('Postcode is required');
  return errors;
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
