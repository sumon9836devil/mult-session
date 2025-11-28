import { Sequelize, DataTypes } from "sequelize";
import config from "../../config.js";
import cache from "../cache.js";

const methods = ["get", "set", "add", "delete"];
const types = [
  { mention: "object" },
  { autoreact: "string" },
  { ban: "string" },
  { alive: "string" },
  { login: "string" },
  { shutoff: "string" },
  { owner_updt: "string" },
  { commit_key: "string" },
  { sticker_cmd: "object" },
  { plugins: "object" },
  { toggle: "object" },
  { autostatus: "string" },
  { autotyping: "string" },
  { autostatus_react: "string" },
  { autostatus_seen: "string" },
  { chatbot: "object" },
  { always_online: "string" },
  { status_view: "string" },
  { save_status: "string" },
  { anticall: "string" },
  { autoread: "string" },
  { autostatus_save: "string" },
  { autorecord: "string" },
  { lid_mapping: "string" }
];

function jsonConcat(o1, o2) {
  for (const key in o2) {
    o1[key] = o2[key];
  }
  return o1;
}

const personalDb = config.DATABASE.define("personalDB", {
  number: { type: DataTypes.STRING, primaryKey: true },
  mention: { type: DataTypes.TEXT, allowNull: true },
  ban: { type: DataTypes.TEXT, allowNull: true },
  alive: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "_hey iam alive now &sender_",
  },
  login: { type: DataTypes.TEXT, allowNull: true },
  shutoff: { type: DataTypes.TEXT, allowNull: true },
  owner_updt: { type: DataTypes.TEXT, allowNull: true },
  commit_key: { type: DataTypes.TEXT, allowNull: true },
  sticker_cmd: { type: DataTypes.TEXT, allowNull: true, defaultValue: "{}" },
  plugins: { type: DataTypes.TEXT, allowNull: true, defaultValue: "{}" },
  toggle: { type: DataTypes.TEXT, allowNull: true, defaultValue: "{}" },
  autoreact: { type: DataTypes.TEXT, allowNull: true, defaultValue: "" },
  autostatus: { type: DataTypes.TEXT, allowNull: true, defaultValue: "false" },
  autotyping: { type: DataTypes.TEXT, allowNull: true, defaultValue: "false" },
  chatbot: { type: DataTypes.TEXT, allowNull: true, defaultValue: "{}" },
  autostatus_react: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "false",
  },
  always_online: { type: DataTypes.TEXT, allowNull: true, defaultValue: "{}" },
  status_view: { type: DataTypes.TEXT, allowNull: true, defaultValue: "{}" },
  anticall: { type: DataTypes.TEXT, allowNull: true, defaultValue: "false" },
  save_status: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "{false}",
  },
  autostatus_save: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "{false}",
  },
  autoread: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "{false}",
  },
  autorecord: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: "{false}",
  },
});

async function personalDB(type, options = {}, method = "get", number = null) {
  // Fixed: Check if type is array and has valid elements
  if (!Array.isArray(type) || type.length === 0) {
    console.error("personalDB: type must be a non-empty array");
    return null;
  }

  if (typeof options !== "object") {
    console.error("personalDB: options must be an object");
    return null;
  }

  if (!methods.includes(method)) {
    console.error("personalDB: invalid method", method);
    return null;
  }

  if (!number) {
    console.error("personalDB: number is required");
    return null;
  }

  // Fixed: Better type filtering and validation
  let filteredTypes = [];
  for (const t of type) {
    const foundType = types.find((a) => Object.keys(a)[0] === t);
    if (foundType) {
      filteredTypes.push(foundType);
    }
  }

  if (filteredTypes.length === 0) {
    console.error("personalDB: no valid types found", type);
    return null;
  }

  try {
    // Attempt to use cache for GET operations to reduce DB load and memory
    // For SET/ADD/DELETE we'll update DB and invalidate cache accordingly.
    let data = await personalDb.findByPk(number);

    // Helper to build cache keys
    const buildKey = (num, key) => `personal:${num}:${key}`;

    // If no existing DB row
    if (!data) {
      if (["set", "add"].includes(method)) {
        const field = Object.keys(filteredTypes[0])[0];
        let content = options.content;

        // Handle object serialization properly
        if (filteredTypes[0][field] === "object") {
          content = typeof content === "object" ? JSON.stringify(content) : content;
        }

        const createData = { number, [field]: content };
        try {
          data = await personalDb.create(createData);
        } catch (err) {
          // If another process created the same record concurrently, fall back to fetching it
          if (err.name === 'SequelizeUniqueConstraintError') {
            data = await personalDb.findByPk(number);
          } else {
            throw err;
          }
        }

        // Set cache for the newly created field
        try {
          const cacheKey = buildKey(number, field);
          await cache.set(cacheKey, content, 300);
        } catch (e) {
          // ignore cache errors
        }

        return method === "add"
          ? filteredTypes[0][field] === "object"
            ? JSON.parse(content || "{}")
            : content
          : true;
      } else if (method === "get") {
        const msg = {};
        type.forEach((k) => {
          const typeInfo = types.find((t) => Object.keys(t)[0] === k);
          if (typeInfo) {
            const isObject = typeInfo[k] === "object";
            // Return default values based on type
            msg[k] = isObject
              ? {}
              : k === "autostatus" ||
                k === "autotyping" ||
                k === "autostatus_react"
              ? "false"
              : "";
          } else {
            msg[k] = false;
          }
        });
        return msg;
      } else {
        return false;
      }
    }

    // --- GET ---
    if (method === "get") {
      const msg = {};

      // Try cache first: build keys and perform mget
      const keys = filteredTypes.map((t) => Object.keys(t)[0]);
      const cacheKeys = keys.map((k) => buildKey(number, k));

      let cached = null;
      try {
        cached = await cache.mget(cacheKeys);
      } catch (e) {
        cached = null;
      }

      // cached is array of string|null
      const misses = [];
      const missKeys = [];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const isObject = filteredTypes[i][key] === "object";
        const rawCache = cached && Array.isArray(cached) ? cached[i] : null;
        if (rawCache != null) {
          try {
            msg[key] = isObject ? JSON.parse(rawCache) : rawCache;
            continue;
          } catch (e) {
            // fallthrough to DB read
          }
        }
        // mark miss
        misses.push({ key, isObject });
        missKeys.push(key);
      }

      if (misses.length > 0) {
        // fetch the DB row if not already
        if (!data) {
          data = await personalDb.findByPk(number);
        }
        for (const miss of misses) {
          const rawValue = data?.dataValues[miss.key] ?? (miss.isObject ? "{}" : "");
          try {
            msg[miss.key] = miss.isObject ? JSON.parse(rawValue || "{}") : rawValue || "";
          } catch (e) {
            msg[miss.key] = miss.isObject ? {} : "";
          }
          // set cache for this key
          try {
            await cache.set(buildKey(number, miss.key), rawValue ?? "", 300);
          } catch (e) {
            // ignore cache errors
          }
        }
      }

      return msg;
    }

    // --- SET ---
    if (method === "set") {
      const field = Object.keys(filteredTypes[0])[0];
      let content = options.content;

      // Fixed: Handle object serialization
      if (filteredTypes[0][field] === "object") {
        content =
          typeof content === "object" ? JSON.stringify(content) : content;
      }

      await data.update({ [field]: content });
      // Update cache
      try {
        await cache.set(buildKey(number, field), content ?? "", 300);
      } catch (e) {
        // ignore
      }
      return true;
    }

    // --- ADD ---
    if (method === "add") {
      const field = Object.keys(filteredTypes[0])[0];
      if (filteredTypes[0][field] !== "object") {
        console.error("personalDB: ADD method only works with object types");
        return false;
      }

      try {
        const old = JSON.parse(data.dataValues[field] || "{}");
        const merged = jsonConcat(old, options.content || {});
        await data.update({ [field]: JSON.stringify(merged) });
        // Update cache
        try {
          await cache.set(buildKey(number, field), JSON.stringify(merged), 300);
        } catch (e) {
          // ignore
        }
        return merged;
      } catch (e) {
        console.error("Error in ADD method:", e);
        return false;
      }
    }

    // --- DELETE ---
    if (method === "delete") {
      const field = Object.keys(filteredTypes[0])[0];
      if (filteredTypes[0][field] !== "object") {
        console.error("personalDB: DELETE method only works with object types");
        return false;
      }

      try {
        const json = JSON.parse(data.dataValues[field] || "{}");
        if (!options.content?.id || !json[options.content.id]) {
          return false;
        }
        delete json[options.content.id];
        await data.update({ [field]: JSON.stringify(json) });
        // Update cache
        try {
          await cache.set(buildKey(number, field), JSON.stringify(json), 300);
        } catch (e) {
          // ignore
        }
        return true;
      } catch (e) {
        console.error("Error in DELETE method:", e);
        return false;
      }
    }
  } catch (error) {
    console.error("personalDB Error:", error);
    return null;
  }
}

export { personalDB };
