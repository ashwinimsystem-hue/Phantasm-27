'use strict';

/* Authoritative event pricing. Gender is NEVER a pricing input. */
const norm = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const RULES = [
  /* Technical events */
  { key: 'glider competition', aliases: ['glider', 'glider competition'], solo: 200, team: 250 },
  { key: 'cad modeling', aliases: ['cad modeling', 'cad modelling'], solo: 200 },
  { key: 'water rocketry', aliases: ['water rocketry', 'water rocket', 'water rocketory'], solo: 200, team: 250 },
  { key: 'technical quiz', aliases: ['technical quiz'], solo: 100, team: 100 },
  { key: 'paper presentation', aliases: ['paper presentation'], solo: 200, team: 400 },
  { key: 'ansys simulation challenge', aliases: ['ansys simulation challenge', 'ansys simulation'], solo: 200 },
  { key: 'line follower', aliases: ['line follower', 'line follower robot'], solo: 300, team: 300 },

  /* Non-technical events */
  { key: 'free fire', aliases: ['free fire', 'freefire'], solo: 100, team: 100 },
  { key: 'carrom', aliases: ['carrom', 'carrom tournament'], solo: 100, team: 100 },
  { key: 'chess', aliases: ['chess', 'chess tournament'], solo: 50, team: 50, perPerson: true },
  { key: 'ipl auction', aliases: ['ipl auction', 'college ipl auction', 'ipl auction rules'], solo: 100, team: 100 },
  { key: 'treasure hunt', aliases: ['treasure hunt', 'treasure-hunt'], solo: 100, team: 100 },
];

function findRule(title) {
  const n = norm(title);
  return RULES.find((rule) => rule.aliases.some((alias) => {
    const a = norm(alias);
    return n === a || n.includes(a) || a.includes(n);
  })) || null;
}

function parseDetails(eventsDetail) {
  if (!Array.isArray(eventsDetail)) return [];
  return eventsDetail.map((item) => {
    if (typeof item === 'string') return { title: item, raw: item };
    return { title: item?.title || item?.eventName || item?.eventId || '', raw: item };
  }).filter((item) => String(item.title || '').trim());
}

function detailFor(title, details) {
  const target = norm(title);
  return details.find((detail) => {
    const value = norm(detail.title);
    return value === target || value.includes(target) || target.includes(value);
  })?.raw || null;
}

function explicitTeamSize(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const values = [detail.teamSize, detail.team_size, detail.members, detail.memberCount, detail.participants, detail.participantCount];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1) return n;
    if (Array.isArray(value) && value.length) return value.length;
  }
  const text = norm([detail.participationType, detail.mode, detail.type, detail.category, detail.team].filter(Boolean).join(' '));
  if (/double|doubles/.test(text)) return 2;
  if (/solo|single|individual/.test(text)) return 1;
  return null;
}

function inferTeam(detail, fallbackTeam) {
  const size = explicitTeamSize(detail);
  if (size != null) return size > 1;
  return Boolean(fallbackTeam);
}

function inferParticipantCount(detail) {
  const size = explicitTeamSize(detail);
  return size != null ? Math.max(1, size) : 1;
}

function calculateCanonicalAmount({ eventList = [], eventsDetail = [], teamName = '', teamId = '', fallbackAmount = 0 } = {}) {
  const details = parseDetails(eventsDetail);
  const titles = [...new Set(eventList.map((e) => String(e || '').trim()).filter(Boolean))];
  let amount = 0;
  const unknownEvents = [];

  for (const title of titles) {
    const rule = findRule(title);
    if (!rule) {
      unknownEvents.push(title);
      continue;
    }
    const detail = detailFor(title, details);
    if (rule.perPerson) {
      amount += rule.solo * inferParticipantCount(detail);
    } else {
      const team = inferTeam(detail, Boolean(teamName || teamId));
      amount += team && rule.team != null ? rule.team : rule.solo;
    }
  }

  const fullyKnown = titles.length > 0 && unknownEvents.length === 0;
  return {
    amount: fullyKnown ? amount : Number.isFinite(Number(fallbackAmount)) ? Number(fallbackAmount) : 0,
    technicalAmount: amount,
    fullyKnown,
    unknownEvents,
  };
}

module.exports = { calculateCanonicalAmount, RULES };
