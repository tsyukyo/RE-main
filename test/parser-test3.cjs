const E=require('../app/engine.js'); const now=new Date(2026,9,18,15,3);
for (const t of ['9時から 千葉、東京、神奈川、長野 を30分おき','明日9時から30分おきに 千葉、東京、神奈川、長野','千葉、東京、神奈川','明日10時 千葉・東京・神奈川を15分ずつずらして通知','牛乳を買う']) {
 const g=E.parseGroup(t,now); console.log(t,'=>',g&&JSON.stringify({due:g.due&&E.fmtDue(g.due,now),items:g.items,every:g.every}));
}
console.log(E.groupTimes('2026-10-19T09:00',[{title:'千葉'},{title:'東京',after:{value:30,unit:'minute'}},{title:'神奈川',after:{value:25,unit:'minute'}},{title:'長野',after:{value:1,unit:'day'}}]).map(d=>E.fmtDue(d,now)));
