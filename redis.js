const { createClient } = require("redis");

require("dotenv").config();

module.exports = {
  connectToRedis: async () => {
    const client = createClient({
      url: process.env.REDIS_URL,
    });

    client.on("error", (err) => console.log("Redis Client Error", err));

    await client.connect();

    return client;
  },
};
