if (!process.env.NODE_ENV) {
  require("dotenv").config({
    path: "./config/config.env",
  });
}

const { TELEGRAM_BOT_TOKEN, BOT_USERNAME, BOT_NAME } = process.env;

const ADMINS = [471468236];

// const needle = require("needle");
const TelegramAPI = require("node-telegram-bot-api");
// const TikTokScraper = require("tiktok-scraper");
// const ytdl = require("ytdl-core");
// const fs = require("fs")
const redis = require("./helpers/redis");

// const db = {
//   downloaders: {
//     // 471468236: new Date(),
//   },
// };

const bot = new TelegramAPI(TELEGRAM_BOT_TOKEN, {
  polling: true,
});

bot.setMyCommands([
  { command: "/start", description: "Запустить бота / Launch the Bot" },
  { command: "/help", description: "Помощь с ботом / Bot info" },
]);

bot.onText(/\/say (.+)/, (msg, match) => {
  const chatId = msg.chat.id;

  const [, phrase] = match;
  // console.log(phrase)

  bot.sendMessage(chatId, phrase);
});

const {
  // getNoWatermarkUrl,
  getVideoByUrl,
} = require("./handlers/tiktok");
const needle = require("needle");
// const handlers = require("./handlers")(bot);

// bot.onText(handlers.tiktok.regex, handlers.tiktok.callback);

const videoRegex =
  /https?:\/\/www.tiktok.com\/@([\D\d]+)\/video\/(\d+)|https?:\/\/vm.tiktok.com\/([A-Z]+)/i;

let ttDownloadWaitMsg;

const ttCallback = async (msg, match) => {
  const chatId = msg.chat.id;
  const redisChatKey = `{chats.paused}${chatId}`;

  const [, username, videoId, mobileId] = match;
  // return console.log(match);

  const videoUrl =
    "https://" +
    (mobileId
      ? `vm.tiktok.com/${mobileId}`
      : `www.tiktok.com/@${username}/video/${videoId}`);

  // return console.log(await getVideo(videoUrl));

  const VIDEO_DOWNLOAD_TIMEOUT = 60; // 1 мин
  const ONE_THOUSAND = 1e3; // Число 1000

  const isDownloadAvailable = await (async () => {
    const reply = await redis.get(redisChatKey);

    if (reply) {
      return {
        ok: false,
        claimed: new Date(reply),
      };
    } else {
      return {
        ok: true,
        claimed: null,
      };
    }
  })();

  const nowTimestamp = new Date().getTime();
  const claimDelay =
    !isDownloadAvailable.ok && isDownloadAvailable.claimed.getTime();

  if (
    !ADMINS.includes(chatId) &&
    !isDownloadAvailable.ok &&
    nowTimestamp < claimDelay + VIDEO_DOWNLOAD_TIMEOUT * ONE_THOUSAND
  ) {
    return bot.sendMessage(
      chatId,
      `Подождите <b>${parseFloat(
        (claimDelay + VIDEO_DOWNLOAD_TIMEOUT * ONE_THOUSAND - nowTimestamp) /
          ONE_THOUSAND
      ).toFixed(
        1
      )}</b> сек. — и сможете <b><em>дальше скачивать видео!</em></b>`,
      {
        parse_mode: "HTML",
      }
    );
  }

  console.time("ttDownload");

  // return console.log(msg.chat);
  // console.log(videoUrl);

  // return await mainGetNoWatermarkUrl();

  if (!ttDownloadWaitMsg) {
    ttDownloadWaitMsg = await bot.sendMessage(chatId, `Видео загружается...`);
  }

  let noWaterMarkUrl;

  try {
    noWaterMarkUrl = await getVideoByUrl(videoUrl);
  } catch (err) {
    console.error(err.message);
  }

  if (!noWaterMarkUrl) {
    // Если ссылка с сайта не пришла - подождать секунду и повторить снова
    // bot.deleteMessage(chatId, waitMsg.message_id);
    // return setTimeout(ttCallback.bind(null, msg, match), 500);
    return bot.sendMessage(chatId, `Не удалось скачать указанный Вами ресурс`);
    // return ttCallback(msg, match);
  }

  // console.log(noWaterMarkUrl)
  // console.timeEnd("ttDownload");

  await redis.setex(redisChatKey, VIDEO_DOWNLOAD_TIMEOUT, new Date());

  try {
    console.log(noWaterMarkUrl);

    await bot.sendMediaGroup(chatId, [
      {
        type: "video",
        media: noWaterMarkUrl,
        caption: `${videoUrl}\n\nВидео скачано при поддержке ${BOT_USERNAME}`,
      },
    ]);
    // await bot.sendVideo(chatId, noWaterMarkUrl);
  } catch (err) {
    const noWaterMarkBuffer = await needle("get", noWaterMarkUrl);
    // console.log(noWaterMarkBuffer.body);

    console.error(
      "Error while sending media: ",
      err.message,
      "Sending buffer instead"
    );
    await bot.sendVideo(chatId, noWaterMarkBuffer.body);
  }

  console.timeEnd("ttDownload");

  if (ttDownloadWaitMsg) {
    bot.deleteMessage(chatId, ttDownloadWaitMsg.message_id);
    ttDownloadWaitMsg = null;
  }

  // const videoMeta = await TikTokScraper.getVideoMeta(videoUrl, {
  // 	noWaterMark: true,
  // 	hdVideo: true,
  // 	headers
  // });
  // console.log(videoMeta)

  // try {

  // } catch (error) {
  //   console.log(error.message);
  //   return bot.sendMessage(
  //     chatId,
  //     `При загрузке видео произошла ошибка\nПожалуйста, повторите попытку ещё раз!`
  //   );
  // }

  // bot.sendMessage(chatId, phrase)
};

// bot.onText(videoRegex, ttCallback);

// bot.onText(
//   /https?:\/\/www.youtube.com\/watch\?v=[a-zA-Z-0-9_]+/gi,
//   async (msg, match) => {
//     const chatId = msg.chat.id;
//     const videoUrl = match[0];

//     // return console.log(videoUrl)

//     const waitMessage = await bot.sendMessage(
//       chatId,
//       "Пожалуйста, подождите..."
//     );

//     const info = await ytdl.getInfo(videoUrl);
//     const format = ytdl.chooseFormat(info.formats, {
//       quality: ["137", "136", "135"],
//       filter: format => format.container === "mp4",
//     });

//     // return console.log(format)

//     const readableStream = await ytdl.downloadFromInfo(info, { format });

//     const videoBuffer = await new fetch.Response(readableStream).buffer();

//     // return console.log(videoBuffer)

//     try {
//       bot.sendVideo(chatId, videoBuffer);
//       bot.deleteMessage(chatId, waitMessage.message_id);
//     } catch (err) {
//       console.error(err.message);
//     }
//   }
// );

bot.on("callback_query", async msg => {
  const chatId = msg.message.chat.id;
  const { data } = msg;

  if (data === "/tt") {
    bot.sendMessage(
      chatId,
      "Вставьте ссылку любого видео из TikTok и я пришлю тебе оригинал *без водяного знака!*",
      {
        parse_mode: "Markdown",
      }
    );
  }
});

bot.on("message", msg => {
  const { id: chatId, first_name, last_name } = msg.chat;

  // console.log(msg);

  const match = msg.text.match(videoRegex);

  // console.log(match);
  if (match) {
    return ttCallback(msg, match);
  }

  if (msg.text.match(/\/start/)) {
    return bot.sendMessage(
      chatId,
      `Добро пожаловать, ${first_name} ${last_name}!`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎬 Скачать видео из TikTok без водяного знака",
                callback_data: "/tt",
              },
            ],
          ],
        },
      }
    );
  } else if (msg.text.match(/\/help/)) {
    return bot.sendMessage(
      chatId,
      `Привет. Тебе нужна помощь?\n\nМеня зовут *${BOT_NAME}.*\n\nЯ умею скачивать видео из TikTok.
      `,
      {
        parse_mode: "Markdown",
      }
    );
  }

  return bot.sendMessage(
    chatId,
    `Я не совсем тебя понял...\n\nМожет отправишь ссылку на видео?`
  );
});

bot.on("polling_error", err => {
  console.error(err);
});
