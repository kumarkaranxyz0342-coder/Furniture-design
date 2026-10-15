// Customer reviews: loads from the server database when available (server.py),
// and falls back to this browser's storage on static hosting (Netlify, Live Server).
(function () {
  var KEY = 'woodcraft_reviews_v1';
  var API = '/api/reviews';
  var grid = document.getElementById('reviewGrid');
  var form = document.getElementById('reviewForm');
  if (!grid || !form) return;

  var SEED = [
    { name: 'Ahmed Raza', city: 'Lahore', rating: 5, text: 'Ordered a walnut dining table through the sketch tool. The workshop matched my drawing exactly — beautiful finish.', date: 'Sep 2026' },
    { name: 'Fatima Khan', city: 'Karachi', rating: 5, text: 'The 3D preview helped me explain what I wanted. Pine bookshelf arrived sturdy and well made.', date: 'Aug 2026' },
    { name: 'Bilal Hussain', city: 'Islamabad', rating: 4, text: 'Got a set of four oak chairs. Solid joinery and fair price. Delivery took a few extra days but worth it.', date: 'Aug 2026' },
    { name: 'Ayesha Malik', city: 'Lahore', rating: 5, text: 'Designed a kids bed with my daughter — she loved drawing it herself! Great experience and quality.', date: 'Jul 2026' }
  ];

  function loadLocal() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(d) && d.length) return d;
    } catch (e) {}
    return SEED.slice();
  }
  function storeLocal(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }

  var list = [];
  var online = false;
  var rating = 0;

  function starStr(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return s;
  }
  function esc(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : t;
    return d.innerHTML;
  }

  function render() {
    grid.innerHTML = '';
    var sum = 0;
    list.forEach(function (r) { sum += r.rating; });
    var avg = list.length ? (Math.round(sum / list.length * 10) / 10) : 0;
    var avgEl = document.getElementById('revAvg');
    if (avgEl) avgEl.innerHTML = '<b class="bigstars">' + starStr(Math.round(avg)) + '</b> ' + avg + ' / 5 · ' + list.length + ' reviews';
    list.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'revcard';
      card.innerHTML =
        '<div class="revstars">' + starStr(r.rating) + '</div>' +
        '<p class="revtext">"' + esc(r.text) + '"</p>' +
        '<div class="revwho"><b>' + esc(r.name) + '</b>' +
        (r.city ? ' · <span>' + esc(r.city) + '</span>' : '') +
        '<span class="revdate">' + esc(r.date || '') + '</span></div>';
      grid.appendChild(card);
    });
  }

  // star picker
  var starRow = document.getElementById('starRow');
  var btns = [];
  function paintStars() {
    btns.forEach(function (b, i) {
      b.textContent = i < rating ? '★' : '☆';
      b.classList.toggle('on', i < rating);
    });
  }
  for (var i = 1; i <= 5; i++) {
    (function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'starbtn';
      b.title = n + ' star' + (n > 1 ? 's' : '');
      b.onclick = function () { rating = n; paintStars(); };
      btns.push(b);
      starRow.appendChild(b);
    })(i);
  }
  paintStars();

  var msg = document.getElementById('revMsg');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('rname').value.trim();
    var city = document.getElementById('rcity').value.trim();
    var text = document.getElementById('rtext').value.trim();
    if (!name || !text) return;
    if (!rating) { msg.textContent = 'Please select a star rating first.'; return; }
    var review = {
      name: name, city: city, rating: rating, text: text,
      date: new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    };
    function done(savedMsg) {
      render();
      form.reset();
      rating = 0; paintStars();
      msg.textContent = savedMsg;
    }
    if (online) {
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review)
      }).then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (data) {
          list.unshift((data && data.review) || review);
          done('Thank you! Your review is posted. Shukriya! 🙏');
        })
        .catch(function () {
          list.unshift(review);
          storeLocal(list);
          done('Saved on this device (server was unreachable).');
        });
    } else {
      list.unshift(review);
      storeLocal(list);
      done('Thank you! Your review is saved. Shukriya! 🙏');
    }
  });

  // try the server database first, fall back to local storage
  fetch(API)
    .then(function (r) {
      if (!r.ok) return Promise.reject();
      return r.json();
    })
    .then(function (data) {
      if (Array.isArray(data)) {
        online = true;
        list = data;
        render();
      } else {
        throw new Error('bad data');
      }
    })
    .catch(function () {
      online = false;
      list = loadLocal();
      render();
    });
})();
