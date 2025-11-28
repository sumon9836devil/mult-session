import { Sequelize, DataTypes } from "sequelize";
import config from '../../config.js';
import cache from '../cache.js';

const methods = ['get', 'set', 'add', 'delete'];
const types = [
  { bot: 'object' }, { delete: 'string' }, { fake: 'object' },
  { link: 'object' }, { word: 'object' }, { demote: 'string' },
  { promote: 'string' }, { filter: 'object' }, { warn: 'object' },
  { welcome: 'object' }, { exit: 'object' }, { pdm: 'string' }, { chatbot: 'object' }
];

function jsonConcat(o1, o2) {
  for (const key in o2) o1[key] = o2[key];
  return o1;
}

const groupDb = config.DATABASE.define("groupDB", {
  jid: {
    type: DataTypes.STRING,
    allowNull: false
  },
  bot: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'false'
  },
  delete: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'false'
  },
  fake: {
    type: DataTypes.STRING,
    allowNull: true
  },
  link: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'false'
  },
  word: {
    type: DataTypes.STRING,
    allowNull: true
  },
  demote: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'false'
  },
  promote: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'false'
  },
  filter: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '{}'
  },
  warn: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '{}'
  },
  welcome: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  chatbot: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '{}'
  },
  exit: {
    type: DataTypes.STRING,
    allowNull: true
  },
  pdm: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'false'
  }
});

async function groupDB(type, options, method) {
  if (!Array.isArray(type) || typeof options !== 'object' || !options.jid) return;

  let filter = type.map(t => types.find(a => a[t])).filter(Boolean);
  if (!filter.length || !methods.includes(method)) return;

  if (['set', 'add', 'delete'].includes(method)) {
    // Single type expected
    filter = filter[0];
    type = type[0];
  }

  // Try to use cache for GET operations
  const dbData = await groupDb.findOne({ where: { jid: options.jid } });

  // ---------- SET ----------
  if (method === 'set') {
    if (typeof options.content !== filter[type]) return;

    const contentValue = filter[type] === 'object' ? JSON.stringify(options.content) : options.content;

    if (!dbData) {
      await groupDb.create({ jid: options.jid, [type]: contentValue });
    } else {
      await dbData.update({ [type]: contentValue });
    }
    // update cache for this field
    try { await cache.set(`group:${options.jid}:${type}`, contentValue, 300); } catch(e){}
    return true;
  }

  // ---------- ADD ----------
  if (method === 'add') {
    let existing = dbData ? dbData.dataValues[type] : (filter[type] === 'object' ? '{}' : '');
    if (filter[type] === 'object') {
      const updated = JSON.stringify(jsonConcat(JSON.parse(existing || '{}'), options.content));
      if (dbData) {
        await dbData.update({ [type]: updated });
      } else {
        await groupDb.create({ jid: options.jid, [type]: updated });
      }
      try { await cache.set(`group:${options.jid}:${type}`, JSON.stringify(updated), 300); } catch(e){}
      return JSON.parse(updated);
    } else {
      if (dbData) {
        await dbData.update({ [type]: options.content });
      } else {
        await groupDb.create({ jid: options.jid, [type]: options.content });
      }
      try { await cache.set(`group:${options.jid}:${type}`, options.content, 300); } catch(e){}
      return options.content;
    }
  }

  // ---------- DELETE ----------
  if (method === 'delete') {
    if (!dbData || !options.content?.id || filter[type] !== 'object') return false;

    const json = JSON.parse(dbData.dataValues[type] || '{}');
    if (!json[options.content.id]) return false;
    delete json[options.content.id];
    await dbData.update({ [type]: JSON.stringify(json) });
    try { await cache.set(`group:${options.jid}:${type}`, JSON.stringify(json), 300); } catch(e){}
    return true;
  }

  // ---------- GET ----------
  if (method === 'get') {
    const result = {};

    for (const f of filter) {
      const k = Object.keys(f)[0];
      const isObj = f[k] === 'object';

      // Try cache first
      let cached = null;
      try {
        cached = await cache.get(`group:${options.jid}:${k}`);
      } catch (e) { cached = null; }

      if (cached != null) {
        try { result[k] = isObj ? JSON.parse(cached) : cached; continue; } catch(e) { result[k] = isObj ? {} : cached; continue; }
      }

      // fallback to DB
      if (!dbData) {
        result[k] = isObj ? {} : 'false';
      } else {
        const val = dbData.dataValues[k];
        result[k] = isObj ? JSON.parse(val || '{}') : val;
        try { await cache.set(`group:${options.jid}:${k}`, isObj ? JSON.stringify(result[k]) : (result[k] ?? ''), 300); } catch(e){}
      }
    }

    return result;
  }

  return;
}

export { groupDB };