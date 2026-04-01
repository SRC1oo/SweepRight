// ── MOBILE NAV ──
function toggleMobile() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(e) {
  const menu = document.getElementById('mobileMenu');
  const burger = document.querySelector('.burger');
  if (menu && menu.classList.contains('open') && !menu.contains(e.target) && !burger.contains(e.target)) {
    menu.classList.remove('open');
  }
});

// ── BOOKING STATE ──
const booking = {
  size: '2 Bedroom', hrs: 4, baseRate: 25, type: 'Standard Clean',
  freq: 'Bi-Weekly', discount: 11, extras: [], extrasTotal: 0,
  currentStep: 1
};

function updateSummary() {
  const rate = booking.baseRate * (1 - booking.discount / 100);
  const base = Math.round(rate * booking.hrs);
  const total = base + booking.extrasTotal;
  const sizeEl   = document.getElementById('sum-size');
  const typeEl   = document.getElementById('sum-type');
  const hrsEl    = document.getElementById('sum-hrs');
  const freqEl   = document.getElementById('sum-freq');
  const totalEl  = document.getElementById('sum-total');
  const extrasRow = document.getElementById('sum-extras-row');
  const extrasEl  = document.getElementById('sum-extras');
  if (sizeEl)  sizeEl.textContent  = booking.size;
  if (typeEl)  typeEl.textContent  = booking.type;
  if (hrsEl)   hrsEl.textContent   = booking.hrs + ' hrs';
  if (freqEl)  freqEl.textContent  = booking.freq;
  if (totalEl) totalEl.textContent = '£' + total;
  if (extrasRow && extrasEl) {
    extrasRow.style.display = booking.extras.length > 0 ? 'flex' : 'none';
    extrasEl.textContent    = booking.extras.join(', ');
  }
}

function selectSize(el, name, hrs, price) {
  document.querySelectorAll('.size-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  booking.size = name;
  booking.hrs  = hrs;
  updateSummary();
}

function updateCleanType(val) {
  const types = {
    standard: ['Standard Clean', 25],
    deep:     ['Deep Clean', 32],
    moveout:  ['Move In/Out Clean', 32]
  };
  booking.type     = types[val][0];
  booking.baseRate = types[val][1];
  updateSummary();
}

function selectFreq(el, name, discount) {
  document.querySelectorAll('.freq-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  booking.freq     = name;
  booking.discount = discount;
  updateSummary();
}

function toggleExtra(el, price, name) {
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    booking.extras.push(name);
    booking.extrasTotal += price;
  } else {
    booking.extras      = booking.extras.filter(e => e !== name);
    booking.extrasTotal -= price;
  }
  updateSummary();
}

function goBookingStep(step) {
  for (let i = 1; i <= 6; i++) {
    const section = document.getElementById('bs-' + i);
    const btn     = document.getElementById('bsb-' + i);
    if (section) section.classList.toggle('active', i === step);
    if (btn) {
      btn.classList.remove('current', 'done');
      if (i === step)      btn.classList.add('current');
      else if (i < step)   btn.classList.add('done');
    }
  }
  booking.currentStep = step;
}

function confirmBooking() {
  const successEl  = document.getElementById('bookingSuccess');
  const navBtnsEl  = document.querySelector('#bs-6 .booking-nav-btns');
  if (successEl)  successEl.style.display = 'block';
  if (navBtnsEl)  navBtnsEl.style.display = 'none';
}

// ── PRICING TOGGLE ──
let pricingRecurring = false;
function togglePricing() {
  pricingRecurring = !pricingRecurring;
  const toggle = document.getElementById('pricingToggle');
  if (toggle) toggle.classList.toggle('on', pricingRecurring);
  const rates = pricingRecurring
    ? { std: '£20', stdNote: 'Weekly · save 15%',    deep: '£27', deepNote: 'Weekly · save 15%',    move: '£27', moveNote: 'Weekly · save 15%' }
    : { std: '£25', stdNote: 'One-off · min. 3 hrs', deep: '£32', deepNote: 'One-off · min. 4 hrs', move: '£32', moveNote: 'One-off · min. 4 hrs' };
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('std-price',  rates.std  + '<span>/hr</span>');
  setText('std-note',  rates.stdNote);
  set('deep-price', rates.deep + '<span>/hr</span>');
  setText('deep-note', rates.deepNote);
  set('move-price', rates.move + '<span>/hr</span>');
  setText('move-note', rates.moveNote);
}

// ── FAQ ──
function toggleFaq(el) {
  const item   = el.parentElement;
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

// ── CONTACT FORM ──
function submitContact() {
  const msg = document.getElementById('contactSuccess');
  if (msg) {
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 5000);
  }
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', function() {
  // Set default booking date to tomorrow
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    dateInput.value = d.toISOString().split('T')[0];
  }

  // Initialise booking summary if on booking page
  updateSummary();

  // Scroll-reveal animation
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity    = '1';
        e.target.style.transform  = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll(
    '.step-card, .service-card, .trust-card, .testi-card, .pricing-card, .value-card, .cleaner-card, .addon-card'
  ).forEach(el => {
    el.style.opacity    = '0';
    el.style.transform  = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
});
