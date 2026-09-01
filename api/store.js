'use strict';

/* Durable Vercel datastore using Upstash Redis REST. */
const fs = require('fs');
const path = require('path');

const UP = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
const TOK = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
const REDIS = Boolean(UP && TOK);

async function rc(command) {
  if (!REDIS) throw new Error('Upstash Redis environment variables are missing.');
  const pipeline = Array.isArray(command) && Array.isArray(command[0]);
  const url = pipeline ? `${UP}/pipeline` : UP;
  const body = JSON.stringify(command);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
      body,
    });
  } catch (error) {
    throw new Error(`Unable to reach Upstash Redis: ${error.message}`);
  }
  const raw = await response.text();
  if (!response.ok) throw new Error(`Upstash Redis HTTP ${response.status}: ${raw.slice(0, 250)}`);
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error(`Invalid Upstash response: ${raw.slice(0, 250)}`); }
  if (json.error) throw new Error(`Upstash Redis: ${json.error}`);
  if (pipeline) {
    const failed = json.find?.(x => x?.error);
    if (failed) throw new Error(`Upstash Redis: ${failed.error}`);
    return json.map(x => x?.result);
  }
  return json.result;
}

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
let mem = { registrations: [], teams: [], messages: [], counters: { reg: 0, team: 0 }, shots: {} };
try { if (fs.existsSync(DB_PATH)) mem = { ...mem, ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) }; } catch {}
let persistTimer;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); fs.writeFileSync(DB_PATH, JSON.stringify(mem, null, 2)); } catch {}
  }, 50);
}
const parse = (v) => JSON.parse(v);
const stringify = (v) => JSON.stringify(v);
const batchGet = async (keys) => keys.length ? await rc(keys.map(k => ['get', k])) : [];

module.exports = {
  backend: REDIS ? 'upstash-redis' : 'file/memory',
  redisConfigured: REDIS,
  async ping() { return REDIS ? await rc(['ping']) : 'local'; },
  async counter(name) {
    if (REDIS) return Number(await rc(['incr', `ctr:${name}`]));
    mem.counters[name] = (mem.counters[name] || 0) + 1; persist(); return mem.counters[name];
  },
  async saveReg(r) {
    if (REDIS) return void await rc(['set', `reg:${r.id}`, stringify(r)]);
    const i = mem.registrations.findIndex(x => x.id === r.id); if (i >= 0) mem.registrations[i] = r; else mem.registrations.push(r); persist();
  },
  async getReg(id) {
    if (REDIS) { const v = await rc(['get', `reg:${id}`]); return v ? parse(v) : null; }
    return mem.registrations.find(x => String(x.id) === String(id)) || null;
  },
  async delReg(id) {
    if (REDIS) return Number(await rc(['del', `reg:${id}`])) > 0;
    const n = mem.registrations.length; mem.registrations = mem.registrations.filter(x => String(x.id) !== String(id)); persist(); return mem.registrations.length < n;
  },
  async listRegs() {
    if (!REDIS) return [...mem.registrations];
    let cursor = '0', keys = [];
    do {
      const result = await rc(['scan', cursor, 'match', 'reg:*', 'count', 500]);
      cursor = String(result?.[0] || '0');
      if (Array.isArray(result?.[1])) keys.push(...result[1]);
    } while (cursor !== '0');
    const regKeys = keys.filter(k => !String(k).startsWith('reg:shot:'));
    const values = await batchGet(regKeys);
    return values.filter(Boolean).map(parse);
  },
  async saveTeam(team) {
    if (REDIS) return void await rc(['set', `team:${team.team_id}`, stringify(team)]);
    const i = mem.teams.findIndex(x => x.team_id === team.team_id); if (i >= 0) mem.teams[i] = team; else mem.teams.push(team); persist();
  },
  async getTeam(id) {
    if (REDIS) { const v = await rc(['get', `team:${id}`]); return v ? parse(v) : null; }
    return mem.teams.find(x => String(x.team_id).toLowerCase() === String(id).toLowerCase()) || null;
  },
  async listTeams() {
    if (!REDIS) return [...mem.teams];
    let cursor = '0', keys = [];
    do {
      const result = await rc(['scan', cursor, 'match', 'team:*', 'count', 500]);
      cursor = String(result?.[0] || '0');
      if (Array.isArray(result?.[1])) keys.push(...result[1]);
    } while (cursor !== '0');
    const values = await batchGet(keys);
    return values.filter(Boolean).map(parse);
  },
  async delTeam(id) {
    if (REDIS) return Number(await rc(['del', `team:${id}`])) > 0;
    const n = mem.teams.length; mem.teams = mem.teams.filter(x => String(x.team_id) !== String(id)); persist(); return mem.teams.length < n;
  },
  async pushMessage(m) {
    if (REDIS) return void await rc(['rpush', 'msgs', stringify(m)]);
    mem.messages.push(m); persist();
  },
  async listMessages() {
    if (!REDIS) return [...mem.messages];
    const values = await rc(['lrange', 'msgs', '0', '-1']);
    return (values || []).map(parse);
  },
  async putShot(id, mime, b64) {
    if (REDIS) return void await rc(['set', `reg:shot:${id}`, stringify({ mime, b64 })]);
    mem.shots = mem.shots || {}; mem.shots[id] = { mime, b64 }; persist();
  },
  async getShot(id) {
    if (REDIS) { const v = await rc(['get', `reg:shot:${id}`]); return v ? parse(v) : null; }
    return (mem.shots || {})[id] || null;
  },
  async hit(key, windowSec) {
    if (REDIS) {
      const n = Number(await rc(['incr', key]));
      if (n === 1) await rc(['expire', key, String(windowSec)]);
      return n;
    }
    const now = Date.now(); mem.rl = mem.rl || {}; const r = mem.rl[key] || { n: 0, reset: 0 };
    if (now > r.reset) { r.n = 0; r.reset = now + windowSec * 1000; }
    r.n += 1; mem.rl[key] = r; return r.n;
  },
};
