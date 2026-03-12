function normalizePhone(phone) {
  let p = phone.replace(/[^0-9]/g, '');
  if (p.startsWith('972')) p = '0' + p.slice(3);
  if (p.startsWith('00972')) p = '0' + p.slice(5);
  return p;
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return normalized;
  return normalized.slice(0, 3) + '-xxx-' + normalized.slice(-3);
}

module.exports = { normalizePhone, maskPhone };
