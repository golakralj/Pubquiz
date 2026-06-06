
// ===================== STORAGE =====================
function getKey(user, key) { return 'iq_' + user + '_' + key; }
function saveUser(u) { try { localStorage.setItem('iq_current_user', u); } catch(e){} }
function loadUser() { try { return localStorage.getItem('iq_current_user') || ''; } catch(e){ return ''; } }
function saveAnswers(user, roundIdx, answers) {
  try { localStorage.setItem(getKey(user, 'r' + roundIdx), JSON.stringify(answers)); } catch(e){}
}
function loadAnswers(user, roundIdx) {
  try { var d = localStorage.getItem(getKey(user, 'r' + roundIdx)); return d ? JSON.parse(d) : null; } catch(e){ return null; }
}

// ===================== ROUNDS =====================
var ROUND_SIZE = 42;
function getRounds() {
  var rounds = [];
  for (var i = 0; i < ALL_Q.length; i += ROUND_SIZE) {
    rounds.push(ALL_Q.slice(i, i + ROUND_SIZE));
  }
  return rounds;
}
function getRoundStats(user, roundIdx, size) {
  var ans = loadAnswers(user, roundIdx);
  if (!ans) return null;
  var answered = 0, correct = 0, partial = 0, wrong = 0;
  for (var i = 0; i < size; i++) {
    if (ans[i]) {
      answered++;
      if (ans[i].r === 'correct') correct++;
      else if (ans[i].r === 'partial') partial++;
      else wrong++;
    }
  }
  return { answered: answered, correct: correct, partial: partial, wrong: wrong, total: size };
}

// ===================== MATCHING =====================
function norm(s) {
  return String(s).toLowerCase()
    .replace(/sh/g,'s').replace(/kh/g,'k').replace(/zh/g,'z').replace(/ch/g,'c').replace(/ck/g,'k')
    .replace(/sch/g,'s').replace(/tch/g,'c').replace(/ough/g,'o').replace(/ph/g,'f')
    .replace(/[\u010D\u0107c]/g,'c').replace(/[\u0161]/g,'s').replace(/[\u017E]/g,'z').replace(/[\u0111dj]/g,'d')
    .replace(/[\u00e9\u00e8\u00ea]/g,'e').replace(/[\u00fc]/g,'u').replace(/[\u00f6]/g,'o')
    .replace(/[\u00e4]/g,'a').replace(/ij/g,'i').replace(/ae/g,'e')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}

function levenshtein(a, b) {
  var m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  var d = [];
  for (var i = 0; i <= m; i++) { d[i] = [i]; }
  for (var j = 0; j <= n; j++) { d[0][j] = j; }
  for (var i2 = 1; i2 <= m; i2++) {
    for (var j2 = 1; j2 <= n; j2++) {
      d[i2][j2] = a[i2-1] === b[j2-1] ? d[i2-1][j2-1] :
        1 + Math.min(d[i2-1][j2], d[i2][j2-1], d[i2-1][j2-1]);
    }
  }
  return d[m][n];
}

function fuzzyMatch(u, a) {
  if (u === a) return true;
  if (u.indexOf(a) !== -1 || a.indexOf(u) !== -1) return true;
  // Allow 1 edit per 5 chars, min 1
  var maxErr = Math.max(1, Math.floor(Math.min(u.length, a.length) / 5));
  if (levenshtein(u, a) <= maxErr) return true;
  // Word-level: all words in answer appear in user input
  var aw = a.split(' ').filter(function(x){return x.length>1;});
  var uw = u.split(' ');
  if (aw.length > 0) {
    var matched = 0;
    for (var i=0; i<aw.length; i++) {
      for (var j=0; j<uw.length; j++) {
        if (uw[j] === aw[i] || uw[j].indexOf(aw[i]) !== -1 || aw[i].indexOf(uw[j]) !== -1 ||
            (aw[i].length > 3 && levenshtein(uw[j], aw[i]) <= 1)) {
          matched++; break;
        }
      }
    }
    if (matched === aw.length) return true;
  }
  return false;
}

function judge(userText, q) {
  var u = norm(userText);
  var i, a;
  // Check all accepted answers
  for (i = 0; i < q.a.length; i++) {
    a = norm(q.a[i]);
    if (fuzzyMatch(u, a)) return 'correct';
  }
  // Check partial hints
  for (i = 0; i < q.p.length; i++) {
    var p = norm(q.p[i]);
    if (u.indexOf(p) !== -1 || p.indexOf(u) !== -1) return 'partial';
  }
  // Fuzzy word overlap against primary answer
  var pw = norm(q.a[0]).split(' ').filter(function(x){return x.length>2;});
  var uw = u.split(' ');
  var hit = 0;
  for (i = 0; i < pw.length; i++) {
    for (var j=0; j < uw.length; j++) {
      if (uw[j].indexOf(pw[i]) !== -1 || pw[i].indexOf(uw[j]) !== -1 ||
          (pw[i].length > 3 && levenshtein(uw[j], pw[i]) <= 1)) {
        hit++; break;
      }
    }
  }
  if (pw.length > 0 && hit / pw.length >= 0.6) return 'correct';
  if (pw.length > 0 && hit / pw.length >= 0.3) return 'partial';
  return 'wrong';
}

// ===================== STATE =====================
var currentUser = '';
var currentRoundIdx = -1;
var currentRoundQ = [];
var currentAnswers = [];
var cur = 0;

// ===================== SCREENS =====================
function showScreen(id) {
  var ids = ['name-screen','start-screen','quiz-screen','results-screen'];
  for (var i = 0; i < ids.length; i++) {
    document.getElementById(ids[i]).style.display = (ids[i] === id) ? 'block' : 'none';
  }
}

function initNameScreen() {
  var saved = loadUser();
  if (saved) { currentUser = saved; showStartScreen(); }
  else { showScreen('name-screen'); }
}

// ===================== START SCREEN =====================
function showStartScreen() {
  showScreen('start-screen');
  document.getElementById('welcome-name').textContent = currentUser.toUpperCase();
  var rounds = getRounds();
  var totalQ = ALL_Q.length;
  var totalAnswered = 0;
  for (var r = 0; r < rounds.length; r++) {
    var st = getRoundStats(currentUser, r, rounds[r].length);
    if (st) totalAnswered += st.answered;
  }
  document.getElementById('welcome-stats').innerHTML =
    'Ukupno pitanja: <b>' + totalQ + '</b> &nbsp;|&nbsp; Odgovoreno: <b>' + totalAnswered + '</b>';
  document.getElementById('header-sub').textContent = 'Pub Kviz - Vol. 1 - ' + totalQ + ' pit.';

  var list = document.getElementById('rounds-list');
  list.innerHTML = '';
  for (var i = 0; i < rounds.length; i++) {
    var rSize = rounds[i].length;
    var st2 = getRoundStats(currentUser, i, rSize);
    var start = i * ROUND_SIZE + 1;
    var end = Math.min((i + 1) * ROUND_SIZE, totalQ);
    var label = 'Runda ' + (i+1) + '  (pit. ' + start + '-' + end + ')';
    var tag = 'NOVA'; var tagClass = 'fresh';
    if (st2) {
      if (st2.answered === st2.total) { tag = 'GOTOVA'; tagClass = 'done'; }
      else { tag = st2.answered + '/' + st2.total; tagClass = 'partial'; }
    }
    var btn = document.createElement('button');
    btn.className = 'round-btn' + (tagClass === 'done' ? ' done' : '');
    btn.innerHTML = '<span>' + label + '</span><span class="round-tag ' + tagClass + '">' + tag + '</span>';
    btn.setAttribute('data-round', i);
    (function(idx){ btn.onclick = function(){ startRound(idx); }; })(i);
    list.appendChild(btn);
  }
}

// ===================== ROUND =====================
function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

function startRound(idx) {
  currentRoundIdx = idx;
  var rounds = getRounds();
  currentRoundQ = rounds[idx].slice();
  shuffle(currentRoundQ);
  var size = currentRoundQ.length;
  var saved = loadAnswers(currentUser, idx);
  currentAnswers = saved ? saved.slice() : [];
  while (currentAnswers.length < size) currentAnswers.push(null);
  cur = 0;
  for (var i = 0; i < size; i++) {
    if (!currentAnswers[i]) { cur = i; break; }
  }
  showScreen('quiz-screen');
  render();
}

// ===================== QUIZ =====================
function calcScore() {
  var s = 0;
  for (var i = 0; i < currentAnswers.length; i++) {
    if (!currentAnswers[i]) continue;
    if (currentAnswers[i].r === 'correct') s += 1;
    else if (currentAnswers[i].r === 'partial') s += 0.5;
  }
  return s;
}
function fmtScore(s) { return s % 1 === 0 ? String(s) : s.toFixed(1); }

function render() {
  var q = currentRoundQ[cur];
  var size = currentRoundQ.length;
  var n = q.n < 10 ? '0' + q.n : String(q.n);
  document.getElementById('q-num').textContent = 'PITANJE ' + n;
  document.getElementById('q-text').innerHTML = q.q;
  document.getElementById('prog-fill').style.width = ((cur+1)/size*100) + '%';
  document.getElementById('prog-label').textContent = (cur+1) + ' / ' + size;
  document.getElementById('score-val').textContent = fmtScore(calcScore());

  var inp = document.getElementById('ans-input');
  var badge = document.getElementById('result-badge');
  var btn = document.getElementById('btn-check');
  var sv = currentAnswers[cur];
  badge.className = 'result-badge';
  if (sv) {
    inp.value = sv.text;
    inp.disabled = true;
    btn.disabled = true;
    btn.textContent = 'ODGOVORENO';
    showBadge(sv.r, q.a[0], cur);
  } else {
    inp.value = '';
    inp.disabled = false;
    btn.disabled = false;
    btn.textContent = 'PROVJERI';
  }
  document.getElementById('btn-prev').disabled = (cur === 0);
  document.getElementById('btn-next').disabled = (cur === size-1);
  if (!sv) { inp.focus(); }
}

function showBadge(r, correct, idx) {
  var badge = document.getElementById('result-badge');
  badge.className = 'result-badge ' + r;
  var v = {correct:'TOCNO', wrong:'NETOCNO', partial:'DJELOMICNO'};
  document.getElementById('r-verdict').textContent = v[r] || r;
  var expl = (currentRoundQ[idx] && currentRoundQ[idx].e) ? currentRoundQ[idx].e : '';
  document.getElementById('r-expl').textContent = expl;
  document.getElementById('r-correct').textContent = r !== 'correct' ? 'Tocno: ' + correct : '';
}

function doCheck() {
  var inp = document.getElementById('ans-input');
  var text = inp.value.replace(/^\s+|\s+$/g,'');
  if (!text) return;
  var q = currentRoundQ[cur];
  var r = judge(text, q);
  currentAnswers[cur] = {text: text, r: r};
  saveAnswers(currentUser, currentRoundIdx, currentAnswers);
  inp.disabled = true;
  var btn = document.getElementById('btn-check');
  btn.disabled = true;
  btn.textContent = 'ODGOVORENO';
  showBadge(r, q.a[0], cur);
  document.getElementById('score-val').textContent = fmtScore(calcScore());
  if (currentAnswers.every(function(a){return a !== null;})) {
    setTimeout(showResults, 1500);
  }
}

function go(d) {
  var size = currentRoundQ.length;
  cur += d;
  if (cur < 0) cur = 0;
  if (cur >= size) cur = size - 1;
  render();
  window.scrollTo(0,0);
}

function showResults() {
  showScreen('results-screen');
  var c=0, p=0, w=0;
  for (var i=0; i<currentAnswers.length; i++) {
    if (!currentAnswers[i]) continue;
    if (currentAnswers[i].r==='correct') c++;
    else if (currentAnswers[i].r==='partial') p++;
    else w++;
  }
  var tot = c + p*0.5;
  document.getElementById('res-total').textContent = fmtScore(tot);
  document.getElementById('res-max').textContent = currentRoundQ.length;
  document.getElementById('res-c').textContent = c;
  document.getElementById('res-p').textContent = p;
  document.getElementById('res-w').textContent = w;
}

// ===================== INIT =====================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

window.onload = function() {
  document.getElementById('btn-enter-name').onclick = function() {
    var name = document.getElementById('name-input').value.replace(/^\s+|\s+$/g,'');
    if (!name) return;
    currentUser = name;
    saveUser(name);
    showStartScreen();
  };
  document.getElementById('name-input').onkeydown = function(e) {
    if (e.keyCode === 13) document.getElementById('btn-enter-name').onclick();
  };
  document.getElementById('name-input').oninput = function() {
    var v = document.getElementById('name-input').value.replace(/^\s+|\s+$/g,'');
    document.getElementById('btn-enter-name').disabled = !v;
  };
  document.getElementById('btn-enter-name').disabled = true;
  document.getElementById('btn-switch').onclick = function() {
    localStorage.removeItem('iq_current_user');
    currentUser = '';
    document.getElementById('name-input').value = '';
    document.getElementById('btn-enter-name').disabled = true;
    showScreen('name-screen');
  };
  document.getElementById('btn-check').onclick = doCheck;
  document.getElementById('btn-prev').onclick = function(){ go(-1); };
  document.getElementById('btn-next').onclick = function(){ go(1); };
  document.getElementById('ans-input').onkeydown = function(e) {
    if (e.keyCode === 13 && !e.shiftKey) { e.preventDefault(); doCheck(); }
  };
  document.getElementById('btn-back').onclick = function() { showStartScreen(); };
  document.getElementById('btn-back-results').onclick = function() { showStartScreen(); };
  initNameScreen();
};
