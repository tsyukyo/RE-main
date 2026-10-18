const E=require('../app/engine.js');
const now=new Date(2026,9,18,15,3);
const cases=['18時半に明日の件を設定して','明日の朝9時に資料送るの忘れないで(笑)','えーと、あとで洗濯物取り込むのお願い','ちょっとしたら電話する','寝る前に歯ブラシ持ってく','3時くらいに銀行','週末に買い物','毎週末 10時 掃除','週明けに請求書出す','来月頭 家賃','明日10時に「会議の資料を印刷」ってリマインドして','明日9時 https://zoom.us/j/123 朝会','夜8時 www.example.com 確認','1時間半後 会議','そのうち 車検の予約','仕事終わりに牛乳買う','毎朝 薬飲むのよろしく！','隔週火曜 7:30 燃えないゴミ','明日の会議 10時','明日の準備 21時'];
for(const c of cases){const p=E.parseInput(c,now);console.log(c.padEnd(30),'|',p.title,'|',E.describeRule(p.rule),'|',p.due?E.fmtDue(p.due,now):'-','|',p.url||'',p.notes.join(';'),p.warn.join(';'))}
