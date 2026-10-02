// Scores a review decision against the ground truth under the day's rules.

export function judge(truth, decision, seconds) {
  const lines = [];
  let score = 0;
  // Restart: 40
  const restartOk = decision.restart === truth.restart;
  if (restartOk) { score += 40; lines.push({ ok: true, text: `Restart: ${decision.restart}`, pts: 40 }); }
  else lines.push({ ok: false, text: `Restart: you chose ${decision.restart || 'nothing'} — correct was ${truth.restart}`, pts: 0 });

  // Infringements: 50 shared between the real ones (or awarded for logging none when none happened)
  const used = new Set();
  if (!truth.infringements.length) {
    if (!decision.entries.length) { score += 50; lines.push({ ok: true, text: 'No offence — correctly left alone', pts: 50 }); }
  } else {
    const share = 50 / truth.infringements.length;
    for (const t of truth.infringements) {
      let best = -1, bestPts = 0, bestText = '';
      decision.entries.forEach((e, i) => {
        if (used.has(i) || e.team !== t.team || +e.num !== t.num) return;
        let pts = e.type === t.type ? share * 0.7 : share * 0.25;
        if (e.type === t.type && e.card === t.card) pts += share * 0.3;
        if (pts > bestPts) { bestPts = pts; best = i; }
      });
      const who = `#${t.num} ${t.teamName || ''}`.trim();
      if (best < 0) lines.push({ ok: false, text: `Missed: ${t.type}${t.card !== 'None' ? ` (${t.card})` : ''} by ${who}${t.offBall ? ' — off the ball' : ''}`, pts: 0 });
      else {
        used.add(best);
        const e = decision.entries[best];
        const full = e.type === t.type && e.card === t.card;
        const txt = full ? `${t.type}${t.card !== 'None' ? ` + ${t.card}` : ''} by ${who}`
          : e.type === t.type ? `${t.type} by ${who} — card should be ${t.card}` : `Right player ${who}, but it was ${t.type}`;
        lines.push({ ok: full, partial: !full, text: txt, pts: Math.round(bestPts) });
        score += bestPts;
      }
    }
  }
  // False accusations
  decision.entries.forEach((e, i) => {
    if (used.has(i)) return;
    score -= 15;
    lines.push({ ok: false, text: `No ${e.type} by #${e.num}${e.teamName ? ' ' + e.teamName : ''} — false call`, pts: -15 });
  });
  // Speed: 10
  const speed = Math.round(Math.max(0, Math.min(10, (120 - seconds) / 8)));
  score += speed;
  lines.push({ ok: speed >= 5, text: `Decision time ${Math.round(seconds)} s`, pts: speed });
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, lines, restartOk };
}
