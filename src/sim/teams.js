// The (fictional) Coastal Premier League.
export const TEAMS = [
  { id: 'HAR', name: 'Harbourside FC', short: 'HAR', pattern: 'stripes', alt: 0x14286a, shirt: 0x1d3a8a, shorts: 0xffffff, socks: 0x1d3a8a, num: 0xffffff, gk: 0x22c55e },
  { id: 'RED', name: 'Redmill Rovers', short: 'RED', pattern: 'plain', alt: 0xf4f4f4, sleeve: 0xf4f4f4, shirt: 0xd8262f, shorts: 0x111111, socks: 0xd8262f, num: 0xffffff, gk: 0xf2c94c },
  { id: 'KIN', name: 'Kingsgate Athletic', short: 'KIN', pattern: 'hoops', alt: 0x161616, shirt: 0xf4c430, shorts: 0x161616, socks: 0x161616, num: 0x161616, gk: 0x7b3fe4 },
  { id: 'ASH', name: 'Ashvale United', short: 'ASH', pattern: 'stripes', alt: 0xf4f4f4, shirt: 0x2e8b57, shorts: 0xf4f4f4, socks: 0x2e8b57, num: 0xffffff, gk: 0xff7a00 },
  { id: 'SER', name: 'Seren City', short: 'SER', pattern: 'plain', alt: 0x0f2a44, shirt: 0x5ad1e6, shorts: 0x0f2a44, socks: 0x5ad1e6, num: 0x0f2a44, gk: 0xff3d7f },
  { id: 'NOR', name: 'Northbrook Wanderers', short: 'NOR', pattern: 'stripes', alt: 0x7a1f2b, shirt: 0xf7f3e8, shorts: 0x7a1f2b, socks: 0x7a1f2b, num: 0x7a1f2b, gk: 0x1f2937 },
];
export const team = (id) => TEAMS.find((t) => t.id === id);
