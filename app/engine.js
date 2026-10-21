// ===== RE:main engine: 日付ユーティリティ / 祝日 / 繰り返しルール / 自然文パーサー =====
// アプリ画面・Service Worker・Node のテストで共通に使う。ブラウザでは普通の <script> として読み込むため、
// ここで宣言した名前（WD, pad, fmtLocal など）はアプリ側のスクリプトからもそのまま使える
// 日時はすべて端末のローカル時刻で扱い、保存形式は 'YYYY-MM-DDTHH:mm'（秒・タイムゾーンなし）
const WD = '日月火水木金土'; // getDay() の番号（0=日曜）で引く曜日の1文字
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtLocal = d => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
// 'YYYY-MM-DDTHH:mm'（時刻は省略可）をローカル時刻の Date にする。読めなければ null
function parseLocal(s) {
  if (!s) return null;
  const [a, b = '00:00'] = String(s).split('T');
  const [y, m, dd] = a.split('-').map(Number);
  const [h, mi] = b.split(':').map(Number);
  const d = new Date(y, m - 1, dd, h || 0, mi || 0);
  return isNaN(d) ? null : d;
}
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()); // その日の 0:00
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((dayStart(b) - dayStart(a)) / 864e5); // 日付の差（時刻は無視。夏時間の 23/25 時間の日も丸めて吸収）
const mondayOf = d => addDays(dayStart(d), -((d.getDay() + 6) % 7)); // その週の月曜 0:00
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate(); // m は 0 始まりの月。その月の日数
// 日付 d の 'HH:MM' の時刻（秒は 0）
const atTime = (d, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m); };
// 次の正時（14:20 → 15:00）
const nextHour = (now = new Date()) => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; };
// 曜日を月曜始まりで並べるための比較関数（日曜を最後にする）
const monFirst = (a, b) => ((a + 6) % 7) - ((b + 6) % 7);
const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;
// d がその月の「第 n ○曜日」の週にあたるか（曜日は呼び出し側で確かめる）。n = -1 は最終週
const isNthWeek = (d, n) => (n > 0 ? Math.ceil(d.getDate() / 7) === n : d.getDate() + 7 > lastDay(d.getFullYear(), d.getMonth()));
// 単位つきで日時を進める。月を進めて日が無いとき（1/31 の1ヶ月後など）は月末に寄せる
function addUnit(d, unit, n) {
  const x = new Date(d);
  if (unit === 'minute') x.setMinutes(x.getMinutes() + n);
  else if (unit === 'hour') x.setHours(x.getHours() + n);
  else if (unit === 'day') x.setDate(x.getDate() + n);
  else if (unit === 'week') x.setDate(x.getDate() + 7 * n);
  else if (unit === 'month') { const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); x.setDate(Math.min(day, lastDay(x.getFullYear(), x.getMonth()))); }
  else if (unit === 'year') x.setFullYear(x.getFullYear() + n);
  return x;
}

// ---- 日本の祝日（内閣府の規則に基づく計算。特例年の移動は未対応） ----
const holCache = {};
const mdKey = d => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // 祝日表のキー 'MM-DD'
// y 年の祝日を Map('MM-DD' → 名前) で返す。年ごとに一度だけ計算して覚えておく
function holidays(y) {
  if (holCache[y]) return holCache[y];
  const S = new Map();
  const add = (m, d, n) => S.set(`${pad(m)}-${pad(d)}`, n);
  const nthMon = (m, n) => { const f = new Date(y, m - 1, 1).getDay(); return 1 + ((8 - f) % 7) + (n - 1) * 7; }; // m 月の第 n 月曜の日付
  add(1, 1, '元日'); add(1, nthMon(1, 2), '成人の日'); add(2, 11, '建国記念の日'); add(2, 23, '天皇誕生日');
  add(3, Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)), '春分の日');
  add(4, 29, '昭和の日'); add(5, 3, '憲法記念日'); add(5, 4, 'みどりの日'); add(5, 5, 'こどもの日');
  add(7, nthMon(7, 3), '海の日'); add(8, 11, '山の日'); add(9, nthMon(9, 3), '敬老の日');
  add(9, Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)), '秋分の日');
  add(10, nthMon(10, 2), 'スポーツの日'); add(11, 3, '文化の日'); add(11, 23, '勤労感謝の日');
  const key = mdKey;
  // 国民の休日（祝日に挟まれた平日）
  for (let d = new Date(y, 0, 2); d.getFullYear() === y; d = addDays(d, 1)) {
    if (!S.has(key(d)) && d.getDay() !== 0 && S.has(key(addDays(d, -1))) && S.has(key(addDays(d, 1)))) S.set(key(d), '国民の休日');
  }
  // 振替休日
  for (const k of [...S.keys()]) {
    const [m, dd] = k.split('-').map(Number);
    let d = new Date(y, m - 1, dd);
    if (d.getDay() !== 0) continue;
    do { d = addDays(d, 1); } while (S.has(key(d)));
    if (d.getFullYear() === y) S.set(key(d), '振替休日');
  }
  return (holCache[y] = S);
}
const holidayName = d => holidays(d.getFullYear()).get(mdKey(d)) || null;

// ---- 繰り返しルール ----
// rule = { freq, interval, start:'YYYY-MM-DD', times:['HH:MM'], byDay:[0-6], onlyDays:[0-6], byMonthDay:[1..31|-1],
//          byNth:{n:1..5|-1, wd:0-6}, byMonth, parity:'even'|'odd', unit, skipHolidays, until:'YYYY-MM-DD', count,
//          bizBefore（毎月の日付指定で、土日祝なら前の平日にずらす）,
//          cond: 詳細条件 { op:'and'|'or', items:[条件 | { op, items }] }（満たす日だけ通知）,
//          ifs: [{ cond: 条件, act:'skip'|'prev'|'next'|'time', time:'HH:MM' }]（上から順に最初に当てはまったものを使う） }
// 条件 = { t, not } t: day(v: weekday|weekend|holiday|offday|bizday) / wd(v:[0-6]) / mday(from,to) / last(n) /
//          month(v:[1-12]) / nth(n, wd) / parity(v) / period(from,to)
// freq: daily | weekly | monthly | yearly | parity | hourly | minutely | afterDone
const DATE_FREQS = ['daily', 'weekly', 'monthly', 'yearly', 'parity']; // 「日付 × 時刻」で決まるルール
// 時間・分ごとのルールか。そうなら進める単位（'hour' / 'minute'）を返す
const subDailyUnit = r => (r.freq === 'hourly' ? 'hour' : r.freq === 'minutely' ? 'minute' : null);
// 繰り返しの基本設定（freq・間隔・曜日など）だけで見て、日 d が通知日にあたるか。詳細条件は condMatch で別に見る
function baseDayMatches(r, d) {
  const st = parseLocal((r.start || ymd(d)) + 'T00:00');
  if (d < dayStart(st)) return false;
  if (r.until && ymd(d) > r.until) return false;
  if (r.skipHolidays && holidayName(d)) return false;
  if (r.onlyDays && r.onlyDays.length && !r.onlyDays.includes(d.getDay())) return false;
  const iv = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case 'daily': return daysBetween(st, d) % iv === 0;
    case 'weekly': {
      const days = r.byDay && r.byDay.length ? r.byDay : [st.getDay()];
      if (!days.includes(d.getDay())) return false;
      return (daysBetween(mondayOf(st), mondayOf(d)) / 7) % iv === 0;
    }
    case 'monthly': {
      if (r.bizBefore && !r.byNth) return bizMonthMatch(r, st, d, r.byMonthDay && r.byMonthDay.length ? r.byMonthDay : [st.getDate()], iv);
      if (monthsBetween(st, d) % iv !== 0) return false;
      const L = lastDay(d.getFullYear(), d.getMonth());
      if (r.byNth) return d.getDay() === r.byNth.wd && isNthWeek(d, r.byNth.n);
      const md = r.byMonthDay && r.byMonthDay.length ? r.byMonthDay : [st.getDate()];
      return md.some(x => (x === -1 ? L : Math.min(x, L)) === d.getDate()); // 31日指定は短い月では月末に寄せる
    }
    case 'yearly': {
      if ((d.getFullYear() - st.getFullYear()) % iv) return false;
      const m = r.byMonth || st.getMonth() + 1;
      const md = (r.byMonthDay && r.byMonthDay[0]) || st.getDate();
      return d.getMonth() + 1 === m && d.getDate() === Math.min(md, lastDay(d.getFullYear(), m - 1));
    }
    case 'parity': return d.getDate() % 2 === (r.parity === 'even' ? 0 : 1);
  }
  return false;
}
const isOffDay = d => isWeekend(d) || !!holidayName(d); // 土日祝
// 指定日が土日祝なら前の平日へ。ずらした結果が前の月に入ることもあるので、翌月分も確かめる
function bizMonthMatch(r, st, d, md, iv) {
  for (const off of [0, 1]) {
    const base = new Date(d.getFullYear(), d.getMonth() + off, 1);
    if (((monthsBetween(st, base) % iv) + iv) % iv !== 0) continue;
    const L = lastDay(base.getFullYear(), base.getMonth());
    for (const x of md) {
      let t = new Date(base.getFullYear(), base.getMonth(), x === -1 ? L : Math.min(x, L));
      for (let i = 0; i < 10 && isOffDay(t); i++) t = addDays(t, -1);
      if (+t === +dayStart(d)) return true;
    }
  }
  return false;
}
// ---- 詳細条件（AND / OR / もし〜なら） ----
// 条件 c（入れ子の AND / OR を含む）を日 d が満たすか。条件が空なら常に true
function condMatch(c, d) {
  if (!c) return true;
  if (c.items) {
    const xs = c.items.filter(Boolean); if (!xs.length) return true;
    return c.op === 'or' ? xs.some(x => condMatch(x, d)) : xs.every(x => condMatch(x, d));
  }
  const dt = d.getDate(), L = lastDay(d.getFullYear(), d.getMonth()), wd = d.getDay(), hol = !!holidayName(d);
  let ok;
  switch (c.t) {
    case 'day': ok = { weekday: wd >= 1 && wd <= 5, weekend: wd === 0 || wd === 6, holiday: hol, offday: wd === 0 || wd === 6 || hol, bizday: wd >= 1 && wd <= 5 && !hol }[c.v]; break;
    case 'wd': ok = (c.v || []).includes(wd); break;
    case 'mday': { const a = Math.min(+c.from || 1, L), b = Math.min(+c.to || +c.from || 31, L); ok = dt >= Math.min(a, b) && dt <= Math.max(a, b); break; }
    case 'last': ok = dt > L - Math.max(1, +c.n || 1); break;
    case 'month': ok = (c.v || []).includes(d.getMonth() + 1); break;
    case 'nth': ok = wd === +c.wd && isNthWeek(d, +c.n); break;
    case 'parity': ok = dt % 2 === (c.v === 'even' ? 0 : 1); break;
    case 'period': { const k = ymd(d); ok = (!c.from || k >= c.from) && (!c.to || k <= c.to); break; }
    default: ok = true;
  }
  return c.not ? !ok : !!ok;
}
const baseOk = (r, d) => baseDayMatches(r, d) && condMatch(r.cond, d);
// 「もし〜なら」のうち、日 d に最初に当てはまるもの
const ifAct = (r, d) => (r.ifs || []).find(x => x && x.cond && condMatch(x.cond, d)) || null;
// ずらし先: 前（次）の、元の条件に関係なく「平日かつ祝日でない」日
function shiftDay(d, dir) { let t = addDays(d, dir); for (let i = 0; i < 14 && isOffDay(t); i++) t = addDays(t, dir); return t; }
// その日に通知するか（ずらされて来た日も含む）。時刻の上書きがあれば times を返す
function dayPlan(r, d) {
  if (!r.ifs || !r.ifs.length) return baseOk(r, d) ? { times: null } : null;
  if (baseOk(r, d)) {
    const a = ifAct(r, d);
    if (!a) return { times: null };
    if (a.act === 'time' && /^\d{1,2}:\d{2}$/.test(a.time || '')) return { times: [a.time.padStart(5, '0')] };
  }
  for (let k = 1; k <= 14; k++) for (const dir of [-1, 1]) {
    const c = addDays(d, -dir * k); // dir=-1(前へずらす)なら後ろの日 c から来る
    const a = (dir === -1 ? 'prev' : 'next');
    if (!baseOk(r, c)) continue;
    const x = ifAct(r, c); if (!x || x.act !== a) continue;
    if (+shiftDay(c, dir) === +dayStart(d)) return { times: null };
  }
  return null;
}
const dayMatches = (r, d) => !!dayPlan(r, d);
// 条件を「平日 かつ (月末 または 金曜)」のような文にする。top 以外の入れ子は括弧でくくる
function describeCond(c, top = true) {
  if (!c) return '';
  if (c.items) {
    const xs = c.items.filter(Boolean).map(x => describeCond(x, false));
    const j = xs.join(c.op === 'or' ? ' または ' : ' かつ ');
    return top || xs.length < 2 ? j : `(${j})`;
  }
  let t;
  switch (c.t) {
    case 'day': t = { weekday: '平日', weekend: '土日', holiday: '祝日', offday: '土日祝', bizday: '平日(祝日以外)' }[c.v]; break;
    case 'wd': t = (c.v || []).slice().sort(monFirst).map(i => WD[i]).join('・') + '曜'; break;
    case 'mday': t = +c.from === +c.to || !c.to ? `${c.from}日` : `${c.from}〜${c.to}日`; break;
    case 'last': t = +c.n > 1 ? `月末${c.n}日間` : '月末'; break;
    case 'month': t = (c.v || []).slice().sort((a, b) => a - b).join('・') + '月'; break;
    case 'nth': t = `${+c.n > 0 ? '第' + c.n : '最終'}${WD[+c.wd]}曜`; break;
    case 'parity': t = c.v === 'even' ? '偶数日' : '奇数日'; break;
    case 'period': t = `${c.from ? c.from.slice(5).replace('-', '/') : ''}〜${c.to ? c.to.slice(5).replace('-', '/') : ''}`; break;
    default: t = '?';
  }
  return c.not ? `${t}以外` : t;
}
const ruleTimes = r => (r.times && r.times.length ? r.times : ['09:00']).slice().sort(); // 時刻の指定がなければ 9:00
// after より後の最初の発生日時（日付系ルール）
function nextAfter(r, after) {
  const ts = ruleTimes(r);
  let d = dayStart(after);
  for (let i = 0; i < 2000; i++, d = addDays(d, 1)) {
    const plan = dayPlan(r, d); if (!plan) continue;
    for (const t of plan.times || ts) {
      const dt = atTime(d, t);
      if (dt > after) return dt;
    }
  }
  return null;
}
// ルールの最初の発生日時を決め、start を確定させる（r を書き換える）
function firstOccurrence(r, now) {
  if (DATE_FREQS.includes(r.freq)) {
    // 間隔（隔週など）の数え始めは最初の通知日にしたいので、まず間隔 1 で最初に当てはまる日を探す
    const probe = { ...r, interval: 1, start: ymd(now) };
    const first = nextAfter(probe, now);
    if (!first) return null;
    r.start = ymd(first);
    return first;
  }
  const unit = subDailyUnit(r);
  if (unit) {
    // 時刻の指定があれば今日のその時刻から、なければ今から（「毎時」は正時から）数えて、最初の未来の回
    const t = r.times && r.times[0];
    let base;
    if (t) base = atTime(now, t);
    else { base = new Date(now); base.setSeconds(0, 0); if (r.freq === 'hourly' && r.interval === 1) { base.setMinutes(0); } }
    while (base <= now) base = addUnit(base, unit, r.interval || 1);
    r.start = ymd(base);
    return base;
  }
  if (r.freq === 'afterDone') return afterDoneNext(r, now);
  return null;
}
// 「完了から N 後」の次回。日単位以上なら時刻はルールの時刻にそろえる
function afterDoneNext(r, now) {
  const d = addUnit(now, r.unit || 'day', r.interval || 1);
  return ['minute', 'hour'].includes(r.unit) ? d : atTime(d, ruleTimes(r)[0]);
}
// 完了時に次回日時を計算（null なら終了）
function nextOnComplete(rem, now) {
  const r = rem.rule;
  if (!r) return null;
  if (r.count && (rem.count || 0) >= r.count) return null;
  const cur = parseLocal(rem.due) || now;
  const after = cur > now ? cur : now;
  let next = null;
  const unit = subDailyUnit(r);
  if (r.freq === 'afterDone') next = afterDoneNext(r, now);
  else if (unit) {
    // 時間・分ごとは予定の時刻から刻みを保ったまま進める（遅れて完了しても刻みがずれない）
    next = new Date(cur);
    do { next = addUnit(next, unit, r.interval || 1); } while (next <= after);
  } else next = nextAfter(r, after);
  if (next && r.until && ymd(next) > r.until) return null;
  return next;
}
// 今後の予定を n 件まで並べる（詳細画面の「今後の予定」用）。「完了から N 後」は次回だけ
function upcoming(rem, n, now) {
  const out = [];
  const r = rem.rule;
  let d = parseLocal(rem.due);
  if (!d) return out;
  out.push(d);
  if (!r || r.freq === 'afterDone') return out;
  let cnt = rem.count || 0;
  while (out.length < n) {
    cnt++;
    if (r.count && cnt >= r.count) break;
    const unit = subDailyUnit(r);
    const next = unit ? addUnit(d, unit, r.interval || 1) : nextAfter(r, d);
    if (!next || (r.until && ymd(next) > r.until)) break;
    out.push(next); d = next;
  }
  return out;
}

// ---- 表示用 ----
const UNIT_LABEL = { minute: '分', hour: '時間', day: '日', week: '週間', month: 'ヶ月', year: '年' };
// 曜日の組を「平日」「土日」「月・水・金曜」のように書く
function daysLabel(days) {
  const s = [...days].sort().join(',');
  if (s === '1,2,3,4,5') return '平日';
  if (s === '0,6') return '土日';
  return [...days].sort(monFirst).map(x => WD[x]).join('・') + '曜';
}
// ルールを「隔週 火曜 7:30・祝日除く」のような一行の説明にする
function describeRule(r) {
  if (!r) return '';
  const iv = r.interval || 1;
  let s = '';
  switch (r.freq) {
    case 'daily': s = iv === 1 ? '毎日' : iv === 2 ? '隔日（1日おき）' : `${iv - 1}日おき（${iv}日ごと）`; break;
    case 'weekly': {
      const p = iv === 1 ? '毎週' : iv === 2 ? '隔週' : `${iv}週ごと`;
      const dl = daysLabel(r.byDay && r.byDay.length ? r.byDay : [parseLocal(r.start + 'T00:00').getDay()]);
      s = iv === 1 && (dl === '平日' || dl === '土日') ? dl : `${p} ${dl}`; break;
    }
    case 'monthly': {
      const p = iv === 1 ? '毎月' : iv === 2 ? '隔月' : `${iv}ヶ月ごと`;
      if (r.byNth) s = `${p} ${r.byNth.n === -1 ? '最終' : '第' + r.byNth.n}${WD[r.byNth.wd]}曜`;
      else { const md = r.byMonthDay && r.byMonthDay.length ? r.byMonthDay : [parseLocal(r.start + 'T00:00').getDate()]; s = `${p} ${md.map(x => (x === -1 ? '月末' : x + '日')).join('・')}`; }
      break;
    }
    case 'yearly': { const st = parseLocal(r.start + 'T00:00'); s = `毎年 ${r.byMonth || st.getMonth() + 1}月${(r.byMonthDay && r.byMonthDay[0]) || st.getDate()}日`; break; }
    case 'parity': s = r.parity === 'even' ? '偶数日' : '奇数日'; break;
    case 'hourly': s = iv === 1 ? '毎時' : `${iv}時間ごと`; break;
    case 'minutely': s = `${iv}分ごと`; break;
    case 'afterDone': s = `完了から${iv}${UNIT_LABEL[r.unit || 'day']}後`; break;
  }
  if (r.onlyDays && r.onlyDays.length && r.freq !== 'weekly') s += `（${daysLabel(r.onlyDays)}のみ）`;
  if (DATE_FREQS.includes(r.freq)) s += ' ' + ruleTimes(r).map(t => t.replace(/^0/, '')).join('・');
  if (r.skipHolidays) s += '・祝日除く';
  if (r.bizBefore) s += '（土日祝なら前の平日）';
  if (r.cond && r.cond.items && r.cond.items.length) s += `（${describeCond(r.cond)}）`;
  if (r.ifs && r.ifs.length) s += r.ifs.map(x => `・もし${describeCond(x.cond)}なら${{ skip: '通知しない', prev: '前の平日', next: '次の平日', time: (x.time || '').replace(/^0/, '') + 'に' }[x.act] || ''}`).join('');
  if (r.until) { const u = parseLocal(r.until + 'T00:00'); s += `・${u.getMonth() + 1}/${u.getDate()}まで`; }
  if (r.count) s += `・${r.count}回まで`;
  return s;
}
// 通知日時を「今日 9:00」「明日 9:00」「10/25(土) 18:30」のように短く書く
function fmtDue(d, now = new Date()) {
  if (!d) return '';
  const t = `${d.getHours()}:${pad(d.getMinutes())}`;
  const diff = daysBetween(now, d);
  if (diff === 0) return `今日 ${t}`;
  if (diff === 1) return `明日 ${t}`;
  if (diff === -1) return `昨日 ${t}`;
  if (diff === 2) return `明後日 ${t}`;
  const base = `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${t}`;
  return d.getFullYear() === now.getFullYear() ? base : `${d.getFullYear()}/${base}`;
}

// ---- 自然文パーサー ----
// 全角英数・全角記号を半角に、漢数字（「十五日」「三ヶ月」など）を算用数字にそろえる
function normalize(raw) {
  let s = String(raw);
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ':').replace(/／/g, '/').replace(/　/g, ' ').replace(/[，､]/g, '、');
  const kn = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  s = s.replace(/([一二三四五六七八九十]{1,3})(?=(日|週|ヶ月|か月|カ月|ケ月|箇月|時|分|回|年|月|曜))/g, m => {
    if (m.includes('十')) { const [a, b] = m.split('十'); return String((a ? kn[a] : 1) * 10 + (b ? kn[b] : 0)); }
    return m.length === 1 ? String(kn[m]) : m;
  });
  // 「第一」「第二」の後ろに曜が来ない形
  s = s.replace(/第([一二三四五])/g, (_, k) => '第' + kn[k]);
  s = s.replace(/(\d+)\s*[かヵカケヶ箇]月/g, '$1ヶ月');
  return s;
}
const WDRE = '[日月火水木金土]';
// 文字列に出てくる曜日の文字を、重複なしの曜日番号の配列にする（「月水金」→ [1, 3, 5]）
function parseDays(str) { return [...new Set((str.match(new RegExp(WDRE, 'g')) || []).map(c => WD.indexOf(c)))]; }

// 話し言葉の1文を解析して { title, due, rule, nag, notes, warn, url } を返す。
// 見つけた表現は take() で文から取り除いていき、最後に残った部分をタイトルにする。
// notes はユーザーに見せる「こう解釈しました」、warn は注意（過去の日時など）
function parseInput(raw, now = new Date()) {
  let s = ' ' + normalize(raw) + ' ';
  const notes = [], warn = [];
  let rule = null, nag = null, date = null, relDue = null, period = null;
  // re に当たった部分を文から取り除いて fn に渡す。当たらなければ false（|| でつないで最初に当たったものだけ使う）
  const take = (re, fn) => { const m = s.match(re); if (!m) return false; s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); fn(m); return true; };

  // 0) URL・「」のメッセージ・話し言葉のノイズ
  let url = null, quoted = null, casualRel = null;
  take(/(?:https?:\/\/|www\.)[^\s「」『』"'<>、。]+/i, m => { url = /^www\./i.test(m[0]) ? 'https://' + m[0] : m[0]; });
  take(/[「『"“]([^」』"”]+)[」』"”]/, m => { quoted = m[1].trim(); });
  take(/(?:ちょっと|少し|すこし)\s*(?:したら|後で|あとで|経ったら|たったら)/, () => { casualRel = 30; })
    || take(/後で|あとで|のちほど|後ほど/, () => { casualRel = 60; });
  s = s.replace(/[(（]\s*(?:笑|汗|泣|苦笑)\s*[)）]|[wｗ]{2,}/g, ' ')
    .replace(/(?:えーと|えっと|ええと|あのー?|うーん|とりあえず|なんか|ちょっと|一応)[、,]?/g, ' ')
    .replace(/よろしく(?:お願い)?(?:します|ね)?|お願い(?:します|ね)?|おねがい(?:します)?|頼む|たのむ|頼んだ/g, ' ')
    .replace(/[!！?？〜~♪]+/g, ' ')
    .replace(/(?:くらい|ぐらい|位|ごろ|頃|あたり|辺り)(?=に|で|の|\s|$)/g, ' ');

  // 1) 確実に通知（完了するまで再通知）
  take(/(\d+)\s*分(?:ごと|毎|おき)に?\s*(?:再通知|しつこく|通知し続け\S*|鳴らし\S*|催促\S*)/, m => { nag = { every: +m[1] }; });
  take(/(?:確実に|しつこく|完了するまで|終わるまで|済むまで|やるまで|忘れないように|絶対に?)\s*(?:通知|知らせて|リマインド|教えて)?(?:して)?/, () => { if (!nag) nag = { every: 5 }; });
  // 2) 土日祝を避ける（月末なら最後の平日）
  let biz = null;
  take(/(?:土日祝(?:日)?|土日[・と]?祝(?:日)?|休日)(?:は|なら|の場合は?|だったら|の時は?|のときは?)?\s*前の平日(?:に|へ)?(?:ずらす|ずらして)?|(?:土日祝(?:日)?|土日[・と]?祝(?:日)?|休日)(?:は|を|と|が|なら|の場合は?)?\s*(?:NG|ＮＧ|除く|除いて|のぞく|避ける|避けて|以外|ダメ|だめ|休み|なし)(?:の場合は?|なら)?(?:[、,]?\s*前の平日(?:に|へ)?(?:ずらす|ずらして)?)?|前の平日(?:に|へ)?(?:ずらす|ずらして)?|最終営業日|最後の平日|月末の平日/i, m => { biz = m[0]; });
  // 祝日を除く
  let skipHolidays = false;
  take(/祝(?:祭)?日(?:は|を|と)?(?:除く|除いて|のぞく|休み|お休み|スキップ|飛ばす|飛ばして|なし|以外)|祝日以外/, () => { skipHolidays = true; });
  // 3) 終了条件
  let until = null, count = null;
  take(/(\d+)\s*回(?:まで|だけ|限り|で終わり)/, m => { count = +m[1]; });
  take(/(?:(\d{4})[年\/-])?(\d{1,2})[月\/-](\d{1,2})日?\s*まで/, m => {
    let y = m[1] ? +m[1] : now.getFullYear(); const d = new Date(y, +m[2] - 1, +m[3]);
    if (!m[1] && d < dayStart(now)) d.setFullYear(y + 1);
    until = ymd(d);
  }) || take(/(\d{1,2})月末\s*まで/, m => { let y = now.getFullYear(); if (+m[1] - 1 < now.getMonth()) y++; until = ymd(new Date(y, +m[1], 0)); })
    || take(/年末\s*まで/, () => { until = `${now.getFullYear()}-12-31`; })
    || take(/今月(?:末)?\s*まで/, () => { until = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)); });

  // 4) 完了から N 後
  const unitOf = u => (u === '分' ? 'minute' : u === '時間' ? 'hour' : u === '日' ? 'day' : u.startsWith('週') ? 'week' : u === 'ヶ月' ? 'month' : 'year');
  take(/(?:完了|終わって|終わった|終えて|やって|済んで|実施して|交換して)(?:して)?(?:から|後)\s*(\d+)\s*(分|時間|日|週間?|ヶ月|年)\s*(?:後|ごと|毎)?/, m => {
    rule = { freq: 'afterDone', interval: +m[1], unit: unitOf(m[2]) };
  });
  // 5) 相対日時（単発）
  if (!rule) {
    take(/(\d+)\s*(分|時間)(半)?\s*(?:後|ご(?!と))/, m => { relDue = addUnit(now, m[2] === '分' ? 'minute' : 'hour', +m[1]); if (m[3]) relDue = addUnit(relDue, 'minute', 30); relDue.setSeconds(0, 0); })
      || take(/(\d+)\s*(日|週間)\s*後/, m => { date = addDays(dayStart(now), m[2] === '日' ? +m[1] : 7 * +m[1]); });
  }
  // 6) 繰り返し
  const R = o => { rule = { interval: 1, ...o }; };
  const okiPlus = (m, n) => (m && /おき|置き/.test(m) ? n + 1 : n); // 「1日おき」=隔日
  if (!rule && !relDue) {
    take(/(\d+)\s*時間\s*(?:ごと|毎|おき|置き)|毎時(?!間)/, m => R({ freq: 'hourly', interval: m[1] ? +m[1] : 1 }))
      || take(/(\d+)\s*分\s*(?:ごと|毎|おき|置き)/, m => R({ freq: 'minutely', interval: +m[1] }))
      || take(new RegExp(`(毎月|隔月|(\\d+)ヶ月(?:ごと|毎|おき))?\\s*の?\\s*第\\s*(\\d)\\s*(${WDRE})曜日?`), m => R({ freq: 'monthly', interval: m[1] === '隔月' ? 2 : m[2] ? okiPlus(m[1], +m[2]) : 1, byNth: { n: +m[3], wd: WD.indexOf(m[4]) } }))
      || take(new RegExp(`(毎月|隔月)?\\s*の?\\s*(?:最終|最後の|月末の)\\s*(${WDRE})曜日?`), m => R({ freq: 'monthly', interval: m[1] === '隔月' ? 2 : 1, byNth: { n: -1, wd: WD.indexOf(m[2]) } }))
      || take(/(毎月|隔月)\s*の?\s*(?:月末|末日|末|最終日)/, m => R({ freq: 'monthly', interval: m[1] === '隔月' ? 2 : 1, byMonthDay: [-1] }))
      || take(/(毎月|隔月|(\d+)ヶ月\s*(?:ごと|毎|おき|置き))\s*の?\s*((?:\d{1,2}\s*日\s*(?:[、,・と]\s*)?)+)/, m => R({ freq: 'monthly', interval: m[1] === '隔月' ? 2 : m[2] ? okiPlus(m[1], +m[2]) : 1, byMonthDay: m[3].match(/\d+/g).map(Number) }))
      || take(/毎年\s*(?:(\d{1,2})\s*[月\/]\s*(\d{1,2})日?)?/, m => R({ freq: 'yearly', byMonth: m[1] ? +m[1] : null, byMonthDay: m[2] ? [+m[2]] : null }))
      || take(new RegExp(`毎((?:${WDRE}曜日?(?:[・、,と]\\s*)?)+)`), m => R({ freq: 'weekly', byDay: parseDays(m[1]) }))
      || take(new RegExp(`(毎週|隔週|(\\d+)\\s*週間?\\s*(?:ごと|毎|おき|置き))\\s*の?\\s*((?:${WDRE}(?:曜日|曜)?(?:[・、,と]\\s*)?)*)(?=曜|\\s|\\d|に|の|は|$)`), m => {
        let days = m[3] ? parseDays(m[3]) : [];
        if (!days.length) { const w = s.match(new RegExp(`(${WDRE})曜日?`)); if (w) { days = [WD.indexOf(w[1])]; s = s.replace(w[0], ' '); } }
        R({ freq: 'weekly', interval: m[1] === '隔週' ? 2 : m[2] ? okiPlus(m[0], +m[2]) : 1, byDay: days.length ? days : [now.getDay()] });
      })
      || take(/(\d+)\s*ヶ月\s*(ごと|毎|おき|置き)/, m => R({ freq: 'monthly', interval: okiPlus(m[2], +m[1]) }))
      || take(/(毎月|隔月)/, m => R({ freq: 'monthly', interval: m[1] === '隔月' ? 2 : 1 }))
      || take(/偶数(?:の)?日/, () => R({ freq: 'parity', parity: 'even' }))
      || take(/奇数(?:の)?日/, () => R({ freq: 'parity', parity: 'odd' }))
      || take(/隔日|(\d+)\s*日\s*(ごと|毎|おき|置き)/, m => R({ freq: 'daily', interval: m[1] ? okiPlus(m[2], +m[1]) : 2 }))
      || take(/毎(朝|晩|夜|夕方?|昼)/, m => { R({ freq: 'daily' }); period = m[1].startsWith('夕') ? '夕方' : m[1]; })
      || take(/毎日/, () => R({ freq: 'daily' }));
    // 曜日フィルター（平日・土日）。単独なら毎週、ほかのルールと併用なら絞り込み
    const dayFilter = days => { if (!rule) R({ freq: 'weekly', byDay: days }); else if (rule.freq === 'weekly') rule.byDay = days; else rule.onlyDays = days; };
    take(/平日|ウィークデー/, () => dayFilter([1, 2, 3, 4, 5]))
      || take(/毎週末|土日/, () => dayFilter([0, 6]));
    if (rule && ['daily', 'parity'].includes(rule.freq)) {
      take(new RegExp(`((?:${WDRE}曜日?(?:[・、,と]\\s*)?)+)(?:の|だけ|のみ)`), m => { rule.onlyDays = parseDays(m[1]); });
    }
  }
  // 7) 日付（単発、または毎年・毎月の基準日）
  if (!relDue) {
    const setD = d => { date = d; };
    // 「明日の件」「明日の準備」のように内容の一部になっている場合は日付として扱わない
    const NOT = '(?!の(?:件|こと|話|分|資料|準備|予定|持ち物|支度|用意|ため))';
    take(new RegExp('(?:明々後日|しあさって)' + NOT), () => setD(addDays(dayStart(now), 3)))
      || take(new RegExp('(?:明後日|あさって)' + NOT), () => setD(addDays(dayStart(now), 2)))
      || take(new RegExp('(?:明日|あした|あす)' + NOT), () => setD(addDays(dayStart(now), 1)))
      || take(new RegExp('(?:今日|きょう|本日|今夜|今晩)' + NOT), m => { setD(dayStart(now)); if (/夜|晩/.test(m[0])) period = '夜'; })
      || take(/(?:今週末|週末)/, () => { const w = now.getDay(); setD(w === 6 || w === 0 ? dayStart(now) : addDays(dayStart(now), 6 - w)); })
      || take(/週明け/, () => setD(addDays(dayStart(now), ((8 - now.getDay()) % 7) || 7)))
      || take(/来月(?:の)?(?:頭|初め|始め|はじめ)|月初め?/, () => setD(new Date(now.getFullYear(), now.getMonth() + 1, 1)))
      || take(/そのうち|近いうち/, () => { setD(addDays(dayStart(now), 3)); notes.push('「そのうち」は3日後にしました'); })
      || take(new RegExp(`(再来週|来週|今週)\\s*の?\\s*(${WDRE})曜日?`), m => { const base = addDays(mondayOf(now), m[1] === '来週' ? 7 : m[1] === '再来週' ? 14 : 0); setD(addDays(base, (WD.indexOf(m[2]) + 6) % 7)); })
      || take(/(来月|今月)\s*の?\s*(\d{1,2})\s*日/, m => setD(new Date(now.getFullYear(), now.getMonth() + (m[1] === '来月' ? 1 : 0), +m[2])))
      || take(/(?:(\d{4})[年\/-])?(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*日?/, m => { const d = new Date(m[1] ? +m[1] : now.getFullYear(), +m[2] - 1, +m[3]); if (!m[1] && !rule && d < dayStart(now)) d.setFullYear(d.getFullYear() + 1); setD(d); })
      || take(/(\d{1,2})\s*日(?!間|後|ごと|おき)/, m => { let d = new Date(now.getFullYear(), now.getMonth(), +m[1]); if (d < dayStart(now)) d = new Date(now.getFullYear(), now.getMonth() + 1, +m[1]); setD(d); })
      || take(/(?:今月の?)?月末/, () => setD(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
      || (!rule && take(new RegExp(`(${WDRE})曜日?`), m => { const wd = WD.indexOf(m[1]); setD(addDays(dayStart(now), (wd - now.getDay() + 7) % 7)); }));
  }
  // 8) 時刻（複数可）
  const times = [];
  let vague = false; // 「今夜」「朝」「寝る前」など、時刻をこちらで補ったとき
  const tre = /(午前|午後|朝|昼|夕方|夕|夜|晩|深夜|AM|PM|am|pm)?\s*(\d{1,2})\s*(?::\s*(\d{2})|時\s*(?:(\d{1,2})\s*分|(半))?)/;
  if (!relDue) {
    let m;
    while ((m = s.match(tre))) {
      let h = +m[2], mi = m[3] ? +m[3] : m[4] ? +m[4] : m[5] ? 30 : 0;
      const p = m[1] || '';
      if ((/午後|夕|夜|晩|PM|pm/.test(p) || (!p && /夕方|夜|晩/.test(period || ''))) && h < 12) h += 12;
      if (/深夜/.test(p) && h === 12) h = 0;
      if (/午前|AM|am/.test(p) && h === 12) h = 0;
      if (!p && !period && h >= 1 && h <= 6) { h += 12; notes.push(`「${m[2]}時」は午後${m[2]}時と解釈しました（朝なら「朝${m[2]}時」）`); }
      if (h <= 24 && mi < 60) times.push(`${pad(h % 24)}:${pad(mi)}`);
      s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    }
    take(/正午/, () => times.push('12:00'));
    const CASUAL = [[/寝る前/, '22:00'], [/起きたら|起床後?/, '07:00'], [/朝イチ|朝一/, '09:00'], [/昼過ぎ/, '13:00'], [/お昼|昼休み/, '12:00'], [/おやつ/, '15:00'], [/仕事終わり|仕事後|定時後?|退勤後?|帰り/, '18:00']];
    if (!times.length) for (const [re, t] of CASUAL) if (take(new RegExp('(?:' + re.source + ')(?=に|の時間|で|\\s|$)'), () => { times.push(t); vague = true; })) break;
    if (!times.length) take(/(朝|昼|夕方|夜|晩)(?=に|の|\s|$)/, m => { period = m[1]; });
    if (!times.length && period) { times.push({ 朝: '08:00', 昼: '12:00', 夕方: '17:00', 夜: '20:00', 晩: '20:00' }[period]); vague = true; }
  }
  if (biz && /最終|最後|月末/.test(biz) && (!rule || (rule.freq === 'monthly' && !rule.byNth)) && !relDue) { if (!rule) R({ freq: 'monthly' }); rule.byMonthDay = [-1]; }
  const uniqTimes = [...new Set(times)].sort();

  // 9) 組み立て
  let due = null;
  if (casualRel && !relDue && !rule && !date && !uniqTimes.length) {
    relDue = addUnit(now, 'minute', casualRel); relDue.setSeconds(0, 0);
    notes.push(casualRel === 30 ? '「ちょっとしたら」は30分後にしました' : '「あとで」は1時間後にしました');
  }
  if (relDue) { due = relDue; notes.push('相対時刻'); }
  else if (rule) {
    if (skipHolidays) rule.skipHolidays = true;
    if (biz) {
      if (rule.freq === 'monthly' && !rule.byNth) { rule.bizBefore = true; if (/最終|最後|月末/.test(biz)) rule.byMonthDay = [-1]; }
      else if (rule.freq === 'weekly') { rule.byDay = (rule.byDay || [1, 2, 3, 4, 5]).filter(x => x >= 1 && x <= 5); if (!rule.byDay.length) rule.byDay = [1, 2, 3, 4, 5]; rule.skipHolidays = true; }
      else if (DATE_FREQS.includes(rule.freq)) { rule.onlyDays = [1, 2, 3, 4, 5]; rule.skipHolidays = true; }
    }
    if (until) rule.until = until;
    if (count) rule.count = count;
    if (DATE_FREQS.includes(rule.freq)) {
      if (!uniqTimes.length) notes.push('時刻の指定がないので 9:00 にしました');
      rule.times = uniqTimes.length ? uniqTimes : ['09:00'];
      if (rule.freq === 'yearly') {
        if (!rule.byMonth && date) { rule.byMonth = date.getMonth() + 1; rule.byMonthDay = [date.getDate()]; }
        if (!rule.byMonth) { rule.byMonth = now.getMonth() + 1; rule.byMonthDay = [now.getDate()]; }
      }
      if (rule.freq === 'monthly' && !rule.byNth && !rule.byMonthDay && date) rule.byMonthDay = [date.getDate()];
      if (date && rule.freq !== 'yearly' && rule.freq !== 'monthly') {
        // 開始日の指定（例: 「10/20から隔週」）
        const probe = { ...rule, interval: 1, start: ymd(date) };
        due = nextAfter(probe, new Date(Math.max(date - 1, now)));
        if (due) rule.start = ymd(due);
      }
      if (!due) due = firstOccurrence(rule, now);
    } else {
      if (uniqTimes.length) rule.times = [uniqTimes[0]];
      if (rule.freq === 'afterDone' && (date || uniqTimes.length)) {
        // 「完了から1ヶ月後 明日9時」のように初回の日時があれば、それを最初の通知にする
        due = atTime(date || dayStart(now), uniqTimes[0] || '09:00');
        if (due <= now && !date) due = addDays(due, 1);
      } else due = firstOccurrence(rule, now);
    }
    if (!due) warn.push('条件に合う日が見つかりませんでした');
  } else if (date || uniqTimes.length) {
    // 単発。日付だけなら 9:00、時刻だけなら今日（過ぎていれば明日）
    due = atTime(date || dayStart(now), uniqTimes[0] || '09:00');
    // 「今夜」「今日の夕方」のように時刻を補った場合、その時刻が過ぎていれば、過去にせず次の正時にする
    // （夕方以降に「夜」「寝る前」のように日付なしで書いたときも、今夜のこととみなす）
    if (vague && due <= now && ((date && +date === +dayStart(now)) || (!date && +uniqTimes[0].slice(0, 2) >= 17 && now.getHours() >= 17))) {
      const was = uniqTimes[0].replace(/^0/, ''); due = nextHour(now); notes.push(`${was} は過ぎているので ${due.getHours()}:00 にしました`);
    } else if (!date && due <= now) { due = addDays(due, 1); notes.push('この時刻は過ぎているので明日にしました'); }
    else if (date && !uniqTimes.length) {
      if (due <= now) { due = nextHour(now); notes.push(`9:00 は過ぎているので ${due.getHours()}:00 にしました`); }
      else notes.push('時刻の指定がないので 9:00 にしました');
    }
    if (uniqTimes.length > 1) {
      // 単発で時刻が複数 → 毎日ではなく「その日だけ複数回」は未対応なので先頭の時刻を使う
      warn.push(`時刻が複数あります。${uniqTimes[0].replace(/^0/, '')} を使いました`);
    }
    if (due < now) warn.push('過去の日時です');
  }
  if (skipHolidays && !rule) warn.push('「祝日除く」は繰り返しのときだけ使えます');

  // 10) タイトル
  let title = s
    .replace(/(?:を|に|で|って|と|の)?\s*(?:リマインド|リマインダー|通知|お知らせ|知らせて|教えて|連絡|設定|セット|登録|送って|言って|メッセージ|入れて|追加|覚えておいて|覚えといて)\s*(?:して|する|しといて|しておいて|を|で)*\s*(?:ください|下さい|ね|ほしい|欲しい|くれ|くれる|ちょうだい|もらえる)?/g, ' ')
    .replace(/(?:の|を)?\s*(?:忘れないで(?:ね)?|忘れずに)/g, ' ')
    .replace(/\sから(?=\s)/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(?:[にをではのとへ、。・,]\s*)+/, '').replace(/(?:\s*[にをではのとへ、。・,])+$/, '').trim();
  if (quoted) title = quoted;
  if (!title) title = 'リマインダー';
  return { title, due, rule, nag, notes, warn, url };
}

// ---- グループ（時間差で順に通知するリスト） ----
// group = { start:'YYYY-MM-DDTHH:mm', steps:[{ title, url, after:{ value, unit } }] }
// 2件目以降は「ひとつ前の通知から after 後」。1件目の after は使わない
// 各項目の予定時刻を配列で返す。開始日時が読めなければすべて null
function groupTimes(start, steps) {
  const out = [];
  let t = parseLocal(start);
  if (!t) return steps.map(() => null);
  steps.forEach((st, i) => {
    if (i > 0) { const a = st.after || { value: 0, unit: 'minute' }; t = addUnit(t, a.unit || 'minute', Math.max(0, +a.value || 0)); }
    out.push(new Date(t));
  });
  return out;
}
// 保存しているグループのリマインダー（kind:'group'）用。spacing が 'equal' なら全項目 every、'each' なら項目ごとの after
const stepAfter = (r, i) => (r.spacing === 'equal' ? r.every : r.steps[i].after) || { value: 0, unit: 'minute' };
const stepTimes = r => groupTimes(r.due, r.steps.map((st, i) => ({ after: i ? stepAfter(r, i) : null })));
// 項目の通知時刻。スヌーズ中ならスヌーズ先、そうでなければ予定時刻 t
const stepAt = (st, t) => (st.snoozeUntil ? parseLocal(st.snoozeUntil) : t);
// 「9時から 千葉、東京、神奈川、長野 を30分おき」→ { due, items, every, url }。2件未満なら null
function parseGroup(raw, now = new Date()) {
  let s = normalize(raw);
  let every = null;
  const um = { 分: 'minute', 時間: 'hour', 日: 'day' };
  s = s.replace(/(\d+)\s*(分|時間|日)\s*(?:おき|置き|ごと|毎|間隔|ずつ)+\s*(?:ずらし(?:て|で)?)?\s*(?:に|で)?/, (_, n, u) => { every = { value: +n, unit: um[u] }; return ' '; });
  const parts = s.split(/[、,，・\n]+/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const head = parseInput(parts[0], now);
  const clean = t => t.replace(/^(?:から|を|に|と)\s*/, '').replace(/\s*(?:を|って|と|に|の順(?:番)?で?|の順に?|で)?\s*(?:通知\S*|リマインド\S*|お願い\S*|登録\S*|設定\S*)?\s*$/, '').replace(/\s*(?:を|って|と|に|で)$/, '').trim();
  const items = [clean(head.title === 'リマインダー' ? '' : head.title), ...parts.slice(1).map(clean)].filter(Boolean);
  if (items.length < 2) return null;
  return { due: head.due, items, every, url: head.url };
}

// ===== 文章（貼り付けた文や写真から読み取った文字）から、期日の候補を探す =====
// 「11月8日(日) 9:00」「2026/11/1 10:00」「11/4(水)23:59まで」「令和8年12月13日」などの、はっきりした日付だけを拾う。
// 「明日」「3日後」のような相対表現は拾わない（チラシやページの文面では誤検出になりやすいため）
// タイトルにしない飾りや決まり文句を落とす（「【重要】保護者会のお知らせ」→「保護者会」）
function cleanTitle(s) {
  // 【抽選販売】のような短い飾りの括弧は外す。「」『』は商品名などが入るので中身を残す
  return String(s || '').replace(/[【\[(（<＜《][^】\]）)>＞》]{0,8}[】\]）)>＞》]/g, ' ')
    .replace(/[■□●○◆◇▲△▼▽★☆※♪→⇒▶►・*＊#＃|｜_]+/g, ' ')
    .replace(/^(Re|RE|Fw|FW|Fwd):\s*/, '')
    .replace(/(についての|に関する)?(お知らせ|ご案内|ご連絡|のご確認|ご注文の確認|ご予約の確認|確認メール)$/, '')
    .replace(/(ご予約|ご注文|ご購入|ご登録|お申し込み|お申込み)?(いただき)?(誠に)?ありがとう(ござい)?(ます|ました)。?/g, ' ')
    .replace(/(の|は|が|を|に|と|で)$/, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/(?<=[\u3040-\u30ff\u4e00-\u9fff]) (?=[\u3040-\u30ff\u4e00-\u9fff])/g, '');
}
// 名前として使える文字列か（文字が2つ以上あり、数字ばかりではない）
const wordy = s => (s.match(/[\p{L}]/gu) || []).length >= 2 && (s.match(/\d/g) || []).length <= s.length / 2;
// 抽選・予約サイトでよく出る期日の種類。prio が小さいほど大事（候補の並びと最初の選択に使う）
const DATE_KINDS = [
  { kind: 'result', tag: '抽選発表', prio: 0, re: /当選発表|当落発表|当選者発表|当選者の?発表|抽選結果|結果発表|結果の?(ご)?(連絡|通知|案内|お知らせ)|当選(の)?(ご)?(連絡|通知|メール|案内)|当落|発表|\b(results?|winners?|draw(ing)?|announce(ment|d)?)\b/i },
  { kind: 'buy', tag: '購入期限', prio: 1, re: /購入期限|購入手続|購入期間|お支払|支払(い)?期限|支払(い)?期間|決済|入金|払込|払い込み|引換|引き換え|引取|受け取り期限|\b(payment|purchase|pay by)\b/i },
  { kind: 'close', tag: '応募締切', prio: 1, re: /応募締切|応募期限|受付終了|受付締切|応募終了|エントリー(締切|終了|期限)|締切|締め切り|〆切|終了|\b(deadline|closes?|ends?|until)\b/i },
  { kind: 'open', tag: '応募開始', prio: 2, re: /受付開始|応募開始|エントリー開始|抽選開始|販売開始|発売開始|一般発売|先行受付|受付期間|応募期間|エントリー期間|抽選期間|申込期間|\b(opens?|starts?|entry period|sale begins)\b/i },
];
// いろいろな日付・時刻の書き方を、findDates が読める形にそろえる
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONRE = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
function normDateText(t) {
  const md = (m, d, y) => `${y ? y + '年' : ''}${MON[m.toLowerCase().slice(0, 4) === 'sept' ? 'sept' : m.toLowerCase().slice(0, 3)]}月${+d}日`;
  return t
    // 英語の日付: Oct 30, 2026 / October 30 / 30 Oct 2026（曜日の Fri, なども外す）
    .replace(/\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(?=[a-z]|\d)/gi, '')
    .replace(new RegExp(`\\b${MONRE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, 'gi'), (_, m, d, y) => md(m, d, y))
    .replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONRE}(?:,?\\s+(20\\d{2}))?\\b`, 'gi'), (_, d, m, y) => md(m, d, y))
    // 3:00 PM / 3pm / 3 p.m. → 午後3:00
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?(?![a-z])/gi, (_, h, mm, ap) => `${ap.toLowerCase() === 'p' ? '午後' : '午前'}${h}:${mm || '00'}`)
    // 正午・お昼12時 → 12:00
    .replace(/正午/g, ' 12:00 ')
    // R8.11.5 のような令和の略記
    .replace(/(?<![A-Za-z])R(\d{1,2})[.\/](\d{1,2})[.\/](\d{1,2})(?!\d)/g, '令和$1年$2月$3日')
    // 夜8時・夕方6時 → 午後8時
    .replace(/(夜|晩|夕方|夕)(\d{1,2})(?=[:時])/g, (_, w, h) => (+h < 12 ? '午後' : '') + h)
    // ISO 形式（2026-11-05T18:00:00+09:00）は秒とタイムゾーンを外す
    .replace(/(20\d{2}-\d{1,2}-\d{1,2})T(\d{1,2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+\-]\d{2}:?\d{2})?/g, '$1 $2')
    // 「10.30(金)」「10-30(金)」のように曜日が続くものは月/日として読む
    .replace(/(?<![\d.\/\-])(\d{1,2})[.\-](\d{1,2})(?=\s*[(（][日月火水木金土])/g, '$1/$2')
    // 「10月30日(金)〜31日(土)」「10/30〜31」の終わりの日に月を補う
    .replace(/((\d{4})年)?(\d{1,2})月(\d{1,2})日([^\n\d]{0,12}?(?:\d{1,2}[:時]\d{0,2}分?)?[^\n\d]{0,4}?[〜~\-–ー－]\s*)(\d{1,2})日/g, (m0, y0, y, mo, d, mid, d2) => `${y0 || ''}${mo}月${d}日${mid}${y ? y + '年' : ''}${mo}月${d2}日`)
    // 「2026年10月30日」を「2026/10/30」と書く代わりに「2026年10/30」と書くもの
    .replace(/(20\d{2})年\s*(\d{1,2})\/(\d{1,2})/g, '$1/$2/$3');
}
// 文章から期日の候補を探し、日時順に最大20件返す。
// 各候補は { due, title, src（元の行）, hasTime, deadline, past, kind, tag, prio }。opt.title は写真から推定した見出し
function findDates(raw, now = new Date(), opt = {}) {
  let text = String(raw || '').normalize('NFKC').replace(/\r/g, '');
  // 写真の文字読み取りは字の間に空白が入りやすいので詰める
  const J = /[\d年月日時分:\/()曜〜~\-぀-ヿ一-鿿]/;
  text = text.replace(/(?<!\d)(\d)[ \t]+(?=\d(?!\d))/g, '$1') // 「1 1 月」→「11月」（1桁ずつ離れた数字だけ）
    .replace(/(\S)[ \t]+(?=(\S))/g, (m, a, b) => J.test(a) && J.test(b) && !(/\d/.test(a) && /\d/.test(b)) ? a : m);
  text = normDateText(text);
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const DATE = /(?:(\d{4})年|令和(\d{1,2}|元)年)?(\d{1,2})月(\d{1,2})日|(?<![\d\-.\/])(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?![\d.])|(?<![\d\/.])(\d{1,2})\/(\d{1,2})(?![\d\/])/g;
  const TIME = /(午前|午後|AM|PM)?(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分|半)?)/gi;
  const hasDate = l => { DATE.lastIndex = 0; const r = DATE.test(l); DATE.lastIndex = 0; return r; };
  // 文書の見出し: 写真なら一番大きい文字の行（opt.title）、なければ日付のない最初の行
  // 番号・連絡先の行は見出しにしない。見出しは最初の日付より上にあるものだけ
  const firstDate = lines.findIndex(hasDate);
  const docTitle = cleanTitle(opt.title) || lines.slice(0, firstDate < 0 ? lines.length : firstDate)
    .filter(l => l.length <= 40 && !/番号|No\.|ID|TEL|Tel|電話|〒|住所|https?:|@/.test(l)).map(cleanTitle).find(l => wordy(l) && l.length <= 30) || '';
  const today = dayStart(now), out = [], seen = new Set();
  for (const [li, line] of lines.entries()) {
    const ms = [...line.matchAll(DATE)];
    ms.forEach((m, mi) => {
      let y = m[1] ? +m[1] : m[2] ? 2018 + (m[2] === '元' ? 1 : +m[2]) : m[5] ? +m[5] : null;
      const mo = +(m[3] || m[6] || m[8]), d = +(m[4] || m[7] || m[9]);
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return;
      const yearless = y == null;
      if (yearless) { y = now.getFullYear(); if (new Date(y, mo - 1, d) < addDays(today, -1)) y++; }
      const day = new Date(y, mo - 1, d);
      if (day.getMonth() !== mo - 1) return;
      // この日付の後ろ（次の日付まで）にある時刻
      const end = mi + 1 < ms.length ? ms[mi + 1].index : line.length;
      const tail = line.slice(m.index + m[0].length, end).replace(/[(（][日月火水木金土](曜日?)?[)）]/g, ' ');
      const times = []; let lastEnd = 0;
      for (const t of tail.matchAll(TIME)) {
        let h = +t[2]; const mm = t[3] ? +t[3] : t[4] ? +t[4] : /半/.test(t[0]) ? 30 : 0;
        if (/午後|PM/i.test(t[1] || '') && h < 12) h += 12;
        if (h > 24 || mm > 59 || (!t[3] && !/時/.test(t[0]))) continue;
        // 「9:00〜11:00」の終わりの時刻は拾わない（写真の読み取りで「〜」が消えて「9:0011:00」になる場合も）
        const gap = tail.slice(lastEnd, t.index);
        lastEnd = t.index + t[0].length;
        if (times.length && /^[\s〜~\-–ー－へ]{0,2}$/.test(gap)) continue;
        const before = tail.slice(0, t.index).replace(/[\s:：\/／、,・()〜~\-]+$/g, '').match(/([぀-ヿ一-鿿]{1,4})$/);
        times.push({ h: h % 24, mm, word: before ? before[1] : '' });
        if (times.length >= 3) break;
      }
      // 「10月1日 10:00〜10月7日 23:59」のように1行に期間が書かれているときは、始まりと終わりを分ける
      const gapIs = (a, b) => /^(〜|~|-|–|ー|－|から)$/.test(line.slice(a, b).replace(/[(（][日月火水木金土](曜日?)?[)）]|(午前|午後)?\d{1,2}(:\d{2}|時(\d{1,2}分)?)|[\s　]/g, ''));
      const sepBefore = mi > 0 && gapIs(ms[mi - 1].index + ms[mi - 1][0].length, m.index);
      const sepAfter = mi + 1 < ms.length && gapIs(m.index + m[0].length, ms[mi + 1].index);
      const role = sepBefore ? 'end' : sepAfter ? 'start' : '';
      const deadline = role === 'end' || (!role && /締切|締め切り|〆切|期限|まで|迄/.test(line));
      let label = line.replace(/[（(][^）)]{3,}[）)]/g, ' ').replace(/以降|順次|頃|ごろ/g, ' ').replace(DATE, ' ').replace(TIME, ' ').replace(/[(（][日月火水木金土](曜日?)?[)）]/g, ' ')
        .replace(/[〜~\-–—:：\/／、,。・|｜()（）【】\[\]]+/g, ' ').replace(/\s+/g, ' ').trim()
        // 文の形なら言い切りの部分を落とす（「出欠票は11月7日までに担任へ提出してください」→「出欠票は担任へ提出」）
        .replace(/(を|して|し)?(ください|下さい|お願いします|お願いいたします|お願い致します)。?$/, '').replace(/\s*(までに|までは|まで|迄に|迄)\s*/g, ' ');
      times.forEach(t => { if (t.word) label = label.replace(t.word, ' '); });
      label = cleanTitle(label).replace(/^(日時|日程|日付|開催日時|開催日|期間|時間|とき|日|時)\s*/, '').replace(/(日時|日程)$/, '').replace(/\s*(から|より|頃|ごろ)$/, '').replace(/(は|が|を|に)$/, '').replace(/\s+(at|on|by|from|until|is|are|:)$/i, '').trim();
      if (!wordy(label)) label = '';
      // 日付だけの行は、すぐ上の見出し行（「■説明会」など）を名前にする
      let head = '';
      if (!label && li > 0 && !hasDate(lines[li - 1]) && !/\d{1,2}(:\d{2}|時)/.test(lines[li - 1])) { const h = cleanTitle(lines[li - 1]); if (wordy(h) && h.length <= 24 && h !== docTitle) head = h; }
      // 「開催日時」「日程」だけの見出しは名前にしない（文書の見出しを使う）
      if (/^(開催|公演|イベント)?(日時|日程|日付|開催日|公演日|日)$/.test(head)) head = '';
      if (head && !label && DATE_KINDS.some(x => x.re.test(head))) { label = head.replace(/(の)?(ご)?(連絡|案内|お知らせ)$/, ''); head = ''; }
      label = label.replace(/(発表|開始|終了|締切)予定$/, '$1');
      if (role && label) label = /期間$/.test(label) ? label.replace(/期間$/, role === 'start' ? '開始' : '終了') : label + (role === 'start' ? '開始' : '終了');
      if (label.length > 24) label = label.slice(0, 24);
      // 期日の種類（抽選発表・購入期限・応募締切・応募開始）。見出し行の言葉も手がかりにする
      const ctx = line + ' ' + (head || (li > 0 && !hasDate(lines[li - 1]) ? lines[li - 1] : ''));
      let kd = DATE_KINDS.find(x => x.kind === 'result' && x.re.test(ctx));
      if (!kd) kd = DATE_KINDS.find(x => x.kind === 'buy' && x.re.test(ctx));
      if (!kd && role) kd = DATE_KINDS.find(x => x.kind === (role === 'start' ? 'open' : 'close'));
      if (!kd) kd = DATE_KINDS.find(x => x.re.test(ctx));
      if (kd && kd.kind === 'buy' && role === 'start') kd = { ...kd, tag: '購入開始', prio: 2 };
      // 抽選ではない先着の販売期間は「販売開始・販売終了」とし、締切より後ろに並べる
      if (kd && (kd.kind === 'open' || kd.kind === 'close') && /販売|発売/.test(ctx) && !/抽選|応募|エントリー|申込/.test(ctx)) kd = { ...kd, tag: kd.kind === 'open' ? '販売開始' : '販売終了', prio: 2 };
      const base = head || (!label ? docTitle : docTitle && label.length <= 8 && !label.includes(docTitle) && !docTitle.includes(label) ? `${docTitle}の${label}` : label);
      (times.length ? times : [null]).forEach(t => {
        const due = new Date(y, mo - 1, d, t ? t.h : 9, t ? t.mm : 0);
        const title = (t && t.word && times.length > 1 ? `${base || 'リマインダー'} ${t.word}` : base) || 'リマインダー';
        const k = fmtLocal(due) + title;
        if (seen.has(k)) return; seen.add(k);
        out.push({ due, title, src: line.length > 60 ? line.slice(0, 59) + '…' : line, hasTime: !!t, deadline, past: due < now, kind: kd ? kd.kind : '', tag: kd ? kd.tag : '', prio: kd ? kd.prio : 3 });
      });
    });
  }
  return out.sort((a, b) => a.due - b.due).slice(0, 20);
}
if (typeof module !== 'undefined') module.exports = { findDates, parseGroup, groupTimes, parseInput, describeRule, nextAfter, nextOnComplete, upcoming, fmtDue, holidayName, holidays, fmtLocal, parseLocal, ymd, firstOccurrence, dayMatches, condMatch, describeCond };
