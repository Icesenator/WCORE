// Contrat des pulses manuels Root : texte local Europe/Paris, jamais ISO UTC.
function formatLedgerPulse(instant) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Instant pulse invalide');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
module.exports = { formatLedgerPulse };
