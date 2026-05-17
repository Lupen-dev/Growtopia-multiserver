const ROLES = ['player', 'vip', 'helper', 'mod', 'admin', 'owner'];
const LEVELS = Object.fromEntries(ROLES.map((r, i) => [r, i]));

function rank(role) { return LEVELS[role] ?? 0; }
function atLeast(role, required) { return rank(role) >= rank(required); }

const COLORS = {
  player: '#ffffff', vip: '#ffaa00', helper: '#88ddff',
  mod: '#66ff66', admin: '#ff66ff', owner: '#ff4444'
};

const TAGS = {
  player: '', vip: '[VIP] ', helper: '[Helper] ',
  mod: '[Mod] ', admin: '[Admin] ', owner: '[Owner] '
};

module.exports = { ROLES, LEVELS, rank, atLeast, COLORS, TAGS };
