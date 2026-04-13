/**
 * SweepRight — Stripe Webhook Handler
 * Cloudflare Pages Function: POST /api/stripe-webhook
 *
 * Handles checkout.session.completed events:
 *   1. Stores booking data
 *   2. Sends customer confirmation email
 *   3. Sends internal notification email
 *
 * Environment Variables Required:
 *   STRIPE_SECRET_KEY        — for session retrieval
 *   STRIPE_WEBHOOK_SECRET    — webhook signing secret (whsec_...)
 *   EMAIL_API_KEY            — Resend / SendGrid / Mailgun API key
 *   EMAIL_API_URL            — e.g. https://api.resend.com/emails
 *   EMAIL_FROM               — e.g. SweepRight <bookings@sweeprightcleaning.com>
 *   INTERNAL_EMAIL           — cleaners@sweeprightcleaning.com
 *   BOOKINGS_KV              — KV namespace binding for booking storage (optional)
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.text();
    const sig = request.headers.get('stripe-signature');

    // ── VERIFY WEBHOOK (simplified — for production, use full signature verification) ──
    // In production, implement proper Stripe signature verification with STRIPE_WEBHOOK_SECRET
    // For Cloudflare Workers, you'll need to use the crypto API to verify HMAC
    let event;
    try {
      event = JSON.parse(payload);
    } catch (e) {
      return new Response('Invalid payload', { status: 400 });
    }

    if (event.type !== 'checkout.session.completed') {
      return new Response('OK', { status: 200 });
    }

    const session = event.data.object;
    const meta = session.metadata || {};

    // ── BUILD BOOKING RECORD ──
    const booking = {
      stripeSessionId: session.id,
      paymentIntentId: session.payment_intent,
      amountPaid: (session.amount_total / 100).toFixed(2),
      currency: session.currency,
      customerEmail: session.customer_email || meta.email,
      customerName: meta.customerName,
      companyName: meta.companyName,
      phone: meta.phone,
      address: meta.address,
      postcode: meta.postcode,
      serviceCategory: meta.serviceCategory,
      propertyType: meta.propertyType,
      frequency: meta.frequency,
      baseHours: meta.baseHours,
      extraHours: meta.extraHours,
      totalHours: meta.totalHours,
      hourlyRate: meta.hourlyRate,
      discountPct: meta.discountPct,
      finalTotal: meta.finalTotal,
      bookingDate: meta.bookingDate,
      timeWindow: meta.timeWindow,
      recurringDays: meta.recurringDays,
      extras: meta.extras,
      accessInstructions: meta.accessInstructions,
      belowRecExplanation: meta.belowRecExplanation,
      recMinHrs: meta.recMinHrs,
      recMaxHrs: meta.recMaxHrs,
      createdAt: new Date().toISOString(),
    };

    // ── STORE BOOKING (KV) ──
    if (env.BOOKINGS_KV) {
      const key = 'booking_' + session.id;
      await env.BOOKINGS_KV.put(key, JSON.stringify(booking), {
        expirationTtl: 60 * 60 * 24 * 365, // 1 year
      });
    }

    // ── SEND EMAILS ──
    const emailApiKey = env.EMAIL_API_KEY;
    const emailApiUrl = env.EMAIL_API_URL || 'https://api.resend.com/emails';
    const emailFrom = env.EMAIL_FROM || 'SweepRight <bookings@sweeprightcleaning.com>';
    const internalEmail = env.INTERNAL_EMAIL || 'cleaners@sweeprightcleaning.com';

    if (emailApiKey) {
      // Send customer confirmation
      await sendEmail(emailApiUrl, emailApiKey, {
        from: emailFrom,
        to: booking.customerEmail,
        subject: 'Booking Confirmed — SweepRight Cleaning',
        html: buildCustomerEmailHtml(booking),
        text: buildCustomerEmailText(booking),
      });

      // Send internal notification
      await sendEmail(emailApiUrl, emailApiKey, {
        from: emailFrom,
        to: internalEmail,
        subject: 'New Booking Received — ' + booking.customerName + ' — £' + booking.amountPaid,
        html: buildInternalEmailHtml(booking),
        text: buildInternalEmailText(booking),
      });
    }

    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('Webhook processing failed', { status: 500 });
  }
}

// ── EMAIL SENDER ──
async function sendEmail(apiUrl, apiKey, emailData) {
  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });
  } catch (err) {
    console.error('Email send failed:', err);
  }
}

// ═══════════════════════════════════
// CUSTOMER CONFIRMATION EMAIL
// ═══════════════════════════════════
function buildCustomerEmailHtml(b) {
  const timeLabels = { morning: 'Morning (8am–12pm)', afternoon: 'Afternoon (12pm–5pm)', evening: 'Evening (5pm–8pm)' };
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4fbf9;font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<div style="max-width:600px;margin:0 auto;background:#ffffff">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1DB8A0,#0D5C50);padding:32px 40px;text-align:center">
    <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.02em">Sweep<span style="opacity:0.9">Right</span></div>
    <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:4px">Trusted Cleaning Across the UK</div>
  </div>

  <!-- Main Content -->
  <div style="padding:40px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <h1 style="font-size:24px;font-weight:700;color:#1A2332;margin:0 0 8px">Booking Confirmed</h1>
      <p style="font-size:15px;color:#4B5563;margin:0">Thank you, ${esc(b.customerName)}! Your cleaning has been booked and paid for.</p>
    </div>

    <!-- Booking Summary Card -->
    <div style="background:#f9fafb;border:1px solid #E5E7EB;border-radius:12px;padding:24px;margin-bottom:24px">
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#9CA3AF;margin:0 0 16px">Booking Details</h2>
      ${emailRow('Service', b.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning')}
      ${emailRow('Property', capitalize(b.propertyType))}
      ${emailRow('Date', b.bookingDate)}
      ${emailRow('Time', timeLabels[b.timeWindow] || b.timeWindow)}
      ${emailRow('Duration', b.totalHours + ' hours')}
      ${emailRow('Frequency', capitalize(b.frequency))}
      ${b.extras ? emailRow('Extras', b.extras) : ''}
      ${b.recurringDays ? emailRow('Recurring Days', b.recurringDays.split(',').map(capitalize).join(', ')) : ''}
    </div>

    <!-- Payment Summary -->
    <div style="background:#E6F9F6;border:1px solid rgba(29,184,160,0.2);border-radius:12px;padding:24px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:16px;font-weight:700;color:#0D5C50">Total Paid</span>
        <span style="font-size:24px;font-weight:800;color:#1DB8A0">£${b.amountPaid}</span>
      </div>
      ${parseFloat(b.discountPct) > 0 ? '<div style="font-size:13px;color:#0D5C50;margin-top:8px">Includes ' + b.discountPct + '% ' + capitalize(b.frequency) + ' discount</div>' : ''}
    </div>

    <!-- What Happens Next -->
    <div style="background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;margin-bottom:24px">
      <h3 style="font-size:16px;font-weight:700;color:#1A2332;margin:0 0 12px">What Happens Next</h3>
      <p style="font-size:14px;color:#4B5563;line-height:1.6;margin:0">We'll be in touch shortly to confirm your scheduling details and introduce you to your assigned cleaner. Your cleaner will contact you before they arrive so you know exactly when to expect them.</p>
    </div>

    <!-- Cancellation Policy -->
    <div style="font-size:13px;color:#9CA3AF;text-align:center;margin-bottom:24px">
      Free cancellation or rescheduling with at least 24 hours' notice.
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#1A2332;padding:32px 40px;text-align:center">
    <div style="font-size:18px;font-weight:800;color:#ffffff;margin-bottom:8px">Sweep<span style="color:#1DB8A0">Right</span></div>
    <div style="color:rgba(255,255,255,0.6);font-size:13px;margin-bottom:12px">
      <a href="tel:+447425583734" style="color:#1DB8A0;text-decoration:none">+44 7425 583734</a> ·
      <a href="mailto:cleaners@sweeprightcleaning.com" style="color:#1DB8A0;text-decoration:none">cleaners@sweeprightcleaning.com</a>
    </div>
    <div style="color:rgba(255,255,255,0.4);font-size:12px">&copy; 2026 SweepRight. All rights reserved.</div>
  </div>
</div>
</body>
</html>`;
}

function buildCustomerEmailText(b) {
  const timeLabels = { morning: 'Morning (8am-12pm)', afternoon: 'Afternoon (12pm-5pm)', evening: 'Evening (5pm-8pm)' };
  return `BOOKING CONFIRMED — SweepRight Cleaning

Thank you, ${b.customerName}! Your cleaning has been booked and paid for.

BOOKING DETAILS
Service: ${b.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning'}
Property: ${capitalize(b.propertyType)}
Date: ${b.bookingDate}
Time: ${timeLabels[b.timeWindow] || b.timeWindow}
Duration: ${b.totalHours} hours
Frequency: ${capitalize(b.frequency)}
${b.extras ? 'Extras: ' + b.extras : ''}

TOTAL PAID: £${b.amountPaid}
${parseFloat(b.discountPct) > 0 ? 'Includes ' + b.discountPct + '% ' + capitalize(b.frequency) + ' discount' : ''}

WHAT HAPPENS NEXT
We'll be in touch shortly to confirm your scheduling details and introduce you to your assigned cleaner.

Free cancellation or rescheduling with at least 24 hours' notice.

---
SweepRight
+44 7425 583734
cleaners@sweeprightcleaning.com`;
}

// ═══════════════════════════════════
// INTERNAL BOOKING NOTIFICATION EMAIL
// ═══════════════════════════════════
function buildInternalEmailHtml(b) {
  const timeLabels = { morning: 'Morning (8am–12pm)', afternoon: 'Afternoon (12pm–5pm)', evening: 'Evening (5pm–8pm)' };
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4fbf9;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#ffffff">
  <div style="background:linear-gradient(135deg,#1DB8A0,#0D5C50);padding:24px 40px;text-align:center">
    <div style="font-size:24px;font-weight:800;color:#ffffff">Sweep<span style="opacity:0.9">Right</span></div>
    <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:4px">New Booking Received</div>
  </div>
  <div style="padding:32px 40px">
    <div style="background:#E6F9F6;border-radius:10px;padding:16px 20px;margin-bottom:24px;text-align:center">
      <span style="font-size:24px;font-weight:800;color:#1DB8A0">£${b.amountPaid}</span>
      <span style="font-size:14px;color:#0D5C50;margin-left:8px">paid</span>
    </div>

    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#9CA3AF;margin:0 0 12px">Customer Details</h3>
    <div style="background:#f9fafb;border:1px solid #E5E7EB;border-radius:10px;padding:20px;margin-bottom:20px">
      ${emailRow('Name', b.customerName)}
      ${b.companyName ? emailRow('Company', b.companyName) : ''}
      ${emailRow('Phone', b.phone)}
      ${emailRow('Email', b.customerEmail)}
      ${emailRow('Address', b.address + ', ' + b.postcode)}
      ${b.accessInstructions ? emailRow('Access', b.accessInstructions) : ''}
    </div>

    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#9CA3AF;margin:0 0 12px">Booking Details</h3>
    <div style="background:#f9fafb;border:1px solid #E5E7EB;border-radius:10px;padding:20px;margin-bottom:20px">
      ${emailRow('Service', b.serviceCategory === 'home' ? 'Home Cleaning' : 'Commercial Cleaning')}
      ${emailRow('Property Type', capitalize(b.propertyType))}
      ${emailRow('Date', b.bookingDate)}
      ${emailRow('Time', timeLabels[b.timeWindow] || b.timeWindow)}
      ${emailRow('Base Hours', b.baseHours + ' hrs')}
      ${b.extraHours && parseFloat(b.extraHours) > 0 ? emailRow('Extra Hours (add-ons)', b.extraHours + ' hrs') : ''}
      ${emailRow('Total Hours', b.totalHours + ' hrs')}
      ${emailRow('Recommended', b.recMinHrs + '–' + b.recMaxHrs + ' hrs')}
      ${emailRow('Frequency', capitalize(b.frequency))}
      ${emailRow('Hourly Rate', '£' + b.hourlyRate)}
      ${parseFloat(b.discountPct) > 0 ? emailRow('Discount', b.discountPct + '%') : ''}
      ${b.extras ? emailRow('Extras', b.extras) : ''}
      ${b.recurringDays ? emailRow('Recurring Days', b.recurringDays.split(',').map(capitalize).join(', ')) : ''}
    </div>

    ${b.belowRecExplanation ? `
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#92400E;margin:0 0 12px">⚠️ Below Recommended Hours</h3>
    <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:20px;margin-bottom:20px">
      <p style="font-size:14px;color:#78350F;margin:0"><strong>Customer selected ${b.baseHours} hrs (recommended ${b.recMinHrs}–${b.recMaxHrs}).</strong></p>
      <p style="font-size:14px;color:#78350F;margin:8px 0 0">"${esc(b.belowRecExplanation)}"</p>
    </div>` : ''}

    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#9CA3AF;margin:0 0 12px">Payment</h3>
    <div style="background:#f9fafb;border:1px solid #E5E7EB;border-radius:10px;padding:20px">
      ${emailRow('Amount', '£' + b.amountPaid)}
      ${emailRow('Stripe Session', b.stripeSessionId ? b.stripeSessionId.slice(-12) : '—')}
      ${emailRow('Payment Intent', b.paymentIntentId || '—')}
    </div>
  </div>
  <div style="background:#1A2332;padding:20px 40px;text-align:center">
    <div style="color:rgba(255,255,255,0.5);font-size:12px">SweepRight Internal — Do not forward</div>
  </div>
</div>
</body>
</html>`;
}

function buildInternalEmailText(b) {
  return `NEW BOOKING RECEIVED — SweepRight

Amount: £${b.amountPaid}

CUSTOMER
Name: ${b.customerName}
${b.companyName ? 'Company: ' + b.companyName : ''}
Phone: ${b.phone}
Email: ${b.customerEmail}
Address: ${b.address}, ${b.postcode}
${b.accessInstructions ? 'Access: ' + b.accessInstructions : ''}

BOOKING
Service: ${b.serviceCategory === 'home' ? 'Home' : 'Commercial'} Cleaning
Property: ${capitalize(b.propertyType)}
Date: ${b.bookingDate}
Time: ${b.timeWindow}
Base Hours: ${b.baseHours}
Extra Hours: ${b.extraHours}
Total Hours: ${b.totalHours}
Recommended: ${b.recMinHrs}-${b.recMaxHrs} hrs
Frequency: ${capitalize(b.frequency)}
Rate: £${b.hourlyRate}/hr
Discount: ${b.discountPct}%
${b.extras ? 'Extras: ' + b.extras : ''}
${b.recurringDays ? 'Recurring Days: ' + b.recurringDays : ''}
${b.belowRecExplanation ? '\n⚠️ BELOW RECOMMENDED HOURS\nCustomer note: "' + b.belowRecExplanation + '"' : ''}

PAYMENT
Stripe: ${b.stripeSessionId || '—'}
PI: ${b.paymentIntentId || '—'}`;
}

// ── HELPERS ──
function emailRow(label, value) {
  if (!value) return '';
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;font-size:14px">
    <span style="color:#9CA3AF">${label}</span>
    <strong style="color:#1A2332;text-align:right;max-width:60%">${esc(String(value))}</strong>
  </div>`;
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
