const E=require('../app/engine.js');
const now=new Date(2026,9,18,15,3); // 2026-10-18 Sun 15:03
const cases=['10分後 洗濯物','明日10時 会議','10月25日 18時半 歯医者','25日に家賃振込','来週金曜 15時 提出','毎日7時 薬','毎朝 ストレッチ','毎週月曜9時 ゴミ出し','毎週月水金 20時 筋トレ','隔週火曜 7:30 燃えないゴミ','2週間ごと 土曜 シーツ交換','隔日 21時 筋トレ','1日おき ランニング','3日ごと 水やり','平日8時 出社 祝日除く','土日10時 掃除','偶数日 7時 水やり','奇数日の夜 日記','毎月25日 振込','毎月1日と15日 10時 請求','毎月末 家計簿','毎月第2火曜 10時 定例','毎月最終金曜 18時 飲み会','隔月 15日 美容院','毎年3月10日 誕生日','毎日8時と20時 薬 確実に','10分ごとに再通知 ゴミ出し 明日7時','完了から1ヶ月後 歯ブラシ交換','3時間ごと 水分補給','毎月曜 9時 朝会','偶数日の平日 20時 英語','毎週火曜 19時 ジム 12/31まで','毎日 21時 日記 5回まで','月曜 10時 打ち合わせ','8時 起きる','買い物リスト作る','今夜9時にゴミ出しを通知して','10/20から隔週 火曜 8時 資源ごみ'];
for(const c of cases){const p=E.parseInput(c,now);console.log(c.padEnd(28),'|',p.title,'|',E.describeRule(p.rule),'|',p.due?E.fmtDue(p.due,now):'-','|',p.nag?('nag'+p.nag.every):'',p.notes.join(';'),p.warn.join(';'))}
console.log([...E.holidays(2026)].join(' '));
const p=E.parseInput('隔週火曜 7:30 燃えないゴミ',now);const rem={due:E.fmtLocal(p.due),rule:p.rule};console.log(E.upcoming(rem,5,now).map(d=>E.fmtDue(d,now)));
const q=E.parseInput('平日8時 出社 祝日除く',now);console.log(E.upcoming({due:E.fmtLocal(q.due),rule:q.rule},8,now).map(d=>E.fmtDue(d,now)));
const r=E.parseInput('毎月31日 締め',now);console.log(E.upcoming({due:E.fmtLocal(r.due),rule:r.rule},5,now).map(d=>E.fmtDue(d,now)));
