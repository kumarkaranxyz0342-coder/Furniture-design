// ====== EDIT ONLY THIS BLOCK: your business details ======
const SITE = {
  name: "Your Business Name",
  creator: "Karan Kumar",
  phone: "+92 300 1234567",
  whatsapp: "923001234567",          // country code, no + or spaces
  email: "hello@yourbusiness.com",
  address: "Your street address, City, Pakistan",
  hours: "Mon – Sat: 9:00 AM – 6:00 PM",
  closed: "Sunday: Closed",
  adminKey: "workshop123"        // CHANGE THIS: it protects /admin and the designs API
};
// =========================================================

(function () {
  document.title = (document.body.dataset.title || '') + ' | ' + SITE.name;

  document.querySelectorAll('[data-site]').forEach(function (el) {
    el.textContent = SITE[el.dataset.site];
  });
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
  document.querySelectorAll('[data-link]').forEach(function (el) {
    var t = el.dataset.link;
    if (t === 'tel') el.href = 'tel:' + SITE.phone.replace(/[^+\d]/g, '');
    if (t === 'wa') {
      el.href = 'https://wa.me/' + SITE.whatsapp + '?text=' +
        encodeURIComponent('Hello, I would like to order custom furniture');
      el.target = '_blank'; el.rel = 'noopener';
    }
    if (t === 'mail') el.href = 'mailto:' + SITE.email + '?subject=' + encodeURIComponent('Furniture enquiry');
  });

  // Enquiry form (home page): opens WhatsApp with the message filled in
  var form = document.getElementById('enquiry');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var n = document.getElementById('cname').value.trim();
      var m = document.getElementById('cmsg').value.trim();
      var text = 'Hello ' + SITE.name + ',\nMy name is ' + n + '.\n' + m;
      window.open('https://wa.me/' + SITE.whatsapp + '?text=' + encodeURIComponent(text), '_blank');
    });
  }
})();
