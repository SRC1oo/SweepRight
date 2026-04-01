// ── PAGE NAVIGATION ──
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-links a[id^="nav-"]').forEach(a => a.classList.remove('active'));
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobile() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

// ── BOOKING STATE ──
const booking = {
  size: '2 Bedroom', hrs: 4, baseRate: 45, type: 'Standard Clean',
  freq: 'Bi-Weekly', discount: 11, extras: [], extrasTotal: 0,
  currentStep: 1
};

function updateSummary() {
  const rate = booking.baseRate * (1 - booking.discount / 100);
  const base = Math.round(rate * booking.hrs);
  const total = base + booking.extrasTotal;
  document.getElementById('sum-size').textContent = booking.size;
  document.getElementById('sum-type').textContent = booking.type;
  document.getElementById('sum-hrs').textContent = booking.hrs + ' hrs';
  document.getElementById('sum-freq').textContent = booking.freq;
  document.getElementById('sum-total').textContent = '£' + total;
  if (booking.extras.length > 0) {
    document.getElementById('sum-extras-row').style.display = 'flex';
    document.getElementById('sum-extras').textContent = booking.extras.join(', ');
  } else {
    document.getElementById('sum-extras-row').style.display = 'none';
  }
}

function selectSize(el, name, hrs, price) {
  document.querySelectorAll('.size-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  booking.size = name;
  booking.hrs = hrs;
  updateSummary();
}

function updateCleanType(val) {
  const types = { standard: ['Standard Clean', 45], deep: ['Deep Clean', 65], moveout: ['Move In/Out Clean', 65] };
  booking.type = types[val][0];
  booking.baseRate = types[val][1];
  updateSummary();
}

function selectFreq(el, name, discount) {
  document.querySelectorAll('.freq-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  booking.freq = name;
  booking.discount = discount;
  updateSummary();
}

function toggleExtra(el, price, name) {
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    booking.extras.push(name);
    booking.extrasTotal += price;
  } else {
    booking.extras = booking.extras.filter(e => e !== name);
    booking.extrasTotal -= price;
  }
  updateSummary();
}

function goBookingStep(step) {
  for (let i = 1; i <= 6; i++) {
    const section = document.getElementById('bs-' + i);
    const btn = document.getElementById('bsb-' + i);
    section.classList.toggle('active', i === step);
    btn.classList.remove('current', 'done');
    if (i === step) btn.classList.add('current');
    else if (i < step) btn.classList.add('done');
  }
  booking.currentStep = step;
}

function confirmBooking() {
  document.getElementById('bookingSuccess').style.display = 'block';
  document.querySelector('#bs-6 .booking-nav-btns').style.display = 'none';
}

// ── PRICING TOGGLE ──
let pricingRecurring = false;
function togglePricing() {
  pricingRecurring = !pricingRecurring;
  const toggle = document.getElementById('pricingToggle');
  toggle.classList.toggle('on', pricingRecurring);
  const rates = pricingRecurring
    ? { std: '£20', stdNote: 'Weekly · save 15%', deep: '£27', deepNote: 'Weekly · save 15%', move: '£27', moveNote: 'Weekly · save 15%' }
    : { std: '£25', stdNote: 'One-off booking · min. 3 hrs', deep: '£32', deepNote: 'One-off booking · min. 4 hrs', move: '£32', moveNote: 'One-off booking · min. 4 hrs' };
  document.getElementById('std-price').innerHTML = rates.std + '<span>/hr</span>';
  document.getElementById('std-note').textContent = rates.stdNote;
  document.getElementById('deep-price').innerHTML = rates.deep + '<span>/hr</span>';
  document.getElementById('deep-note').textContent = rates.deepNote;
  document.getElementById('move-price').innerHTML = rates.move + '<span>/hr</span>';
  document.getElementById('move-note').textContent = rates.moveNote;
}

// ── FAQ ──
function toggleFaq(el) {
  const item = el.parentElement;
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

function filterFaq(cat, btn) {
  document.querySelectorAll('.faq-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.faq-item').forEach(item => {
    item.style.display = (cat === 'all' || item.dataset.cat === cat) ? 'block' : 'none';
  });
}

// ── CONTACT ──
function submitContact() {
  const msg = document.getElementById('contactSuccess');
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', 5000);
}

// ── SET DEFAULT BOOKING DATE ──
window.addEventListener('DOMContentLoaded', () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) dateInput.value = d.toISOString().split('T')[0];
  updateSummary();
});

// ── INTERSECTION OBSERVER FOR ANIMATIONS ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; } });
}, { threshold: 0.1 });

document.querySelectorAll('.step-card, .service-card, .trust-card, .testi-card, .pricing-card, .value-card, .cleaner-card, .addon-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});