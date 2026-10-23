読み取った内容:
- 毎週火 7:30 燃えるゴミ
- 10/25 歯医者
- 毎日 8:00・20:00 薬（確実に）

```json
{
  "format": "rimain.reminders",
  "version": 1,
  "reminders": [
    { "title": "燃えるゴミを出す", "rule": { "freq": "weekly", "byDay": 2, "times": "7:30" } },
    { "title": "歯医者", "due": "2026-10-25" },
    { "title": "薬を飲む", "nag": { "every": "10" }, "rule": { "freq": "daily", "times": ["8:00", "20:00"] } }
  ]
}
```
