const redis = require("redis");
const { promisify } = require("util");

const client = redis.createClient();

// const hget = promisify(client.hget).bind(client);
// const hsetnx = promisify(client.hsetnx).bind(client);
// const expire = promisify(client.expire).bind(client);
const setex = promisify(client.setex).bind(client);
const get = promisify(client.get).bind(client);
const exists = promisify(client.exists).bind(client);

module.exports = {
  ...client,
  setex,
  get,
  exists,
};
return;

(async () => {
  // const result = await hsetnx("chats.paused", "471468236", new Date());
  // console.log(result);

  // await hsetnx("chats.paused", "123456789", new Date());

  const chatId = 555555555;

  const reply = await setex(`{chats.paused}${chatId}`, 60, new Date());
  console.log(reply);

  // const reply = await hget("chats.paused", "471468236");
  // console.log(new Date(reply).getTime());

  // const reply = await hget("chats.paused", "123456789");
  setTimeout(async () => {
    const reply = await get(`{chats.paused}${chatId}`);
    console.log(new Date(reply).getTime());
  }, 0);

  // client.expireat("123456789", new Date(reply).getTime() + 30000);
})();
