if (!process.env.NODE_ENV) {
  require("dotenv").config({
    path: "./config/config.env",
  });
}

const { TELEGRAM_BOT_TOKEN, BOT_NAME } = process.env;

// const needle = require("needle");
const TelegramAPI = require("node-telegram-bot-api");
// const TikTokScraper = require("tiktok-scraper");
const ytdl = require("ytdl-core");
// const fs = require("fs")

const db = {
  downloaders: {
    471468236: new Date(),
  },
};

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
  getNoWatermarkUrl,
  // mainGetNoWatermarkUrl,
} = require("./handlers/tiktok");
// const handlers = require("./handlers")(bot);

// bot.onText(handlers.tiktok.regex, handlers.tiktok.callback);

const videoRegex =
  /(https?:\/\/www.tiktok.com\/@[\D\d]+\/video\/\d+)|(https?:\/\/vm.tiktok.com\/[\D\d]+)/;

let ttDownloadWaitMsg;

const ttCallback = async (msg, match) => {
  const chatId = msg.chat.id;

  const [videoUrl] = match;

  const VIDEO_DOWNLOAD_TIMEOUT = 60e3;

  if (
    db.downloaders[chatId] &&
    db.downloaders[chatId].getTime() + VIDEO_DOWNLOAD_TIMEOUT >
      new Date().getTime()
  ) {
    return bot.sendMessage(
      chatId,
      `Подождите <b>${Math.round(
        (db.downloaders[chatId].getTime() +
          VIDEO_DOWNLOAD_TIMEOUT -
          new Date().getTime()) /
          1e3
      )}</b> сек. — и сможете <b><em>дальше скачивать видео!</em></b>`,
      {
        parse_mode: "HTML",
      }
    );
  }

  // return console.log(msg.chat);
  // console.log(videoUrl);

  // return await mainGetNoWatermarkUrl();

  console.time("ttDownload");

  if (!ttDownloadWaitMsg) {
    ttDownloadWaitMsg = await bot.sendMessage(chatId, `Видео загружается...`);
  }

  let noWaterMarkUrl;

  try {
    noWaterMarkUrl = await getNoWatermarkUrl(videoUrl);
  } catch (err) {
    console.log(err);
  }

  if (!noWaterMarkUrl) {
    // Если ссылка с сайта не пришла - подождать секунду и повторить снова
    // bot.deleteMessage(chatId, waitMsg.message_id);
    return setTimeout(ttCallback.bind(null, msg, match), 500);
    // return ttCallback(msg, match);
  }

  // console.log(noWaterMarkUrl)
  console.timeEnd("ttDownload");

  db.downloaders[chatId] = new Date();

  setTimeout(() => {
    delete db.downloaders[chatId];
  }, VIDEO_DOWNLOAD_TIMEOUT);

  await bot.sendMediaGroup(chatId, [
    {
      type: "video",
      media: noWaterMarkUrl,
      caption: `${videoUrl}\n\nВидео скачано при поддержке ${BOT_NAME}`,
    },
  ]);

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

bot.onText(
  /https?:\/\/www.youtube.com\/watch\?v=[a-zA-Z-0-9_]+/gi,
  async (msg, match) => {
    const chatId = msg.chat.id;
    const videoUrl = match[0];

    // return console.log(videoUrl)

    const waitMessage = await bot.sendMessage(
      chatId,
      "Пожалуйста, подождите..."
    );

    const info = await ytdl.getInfo(videoUrl);
    const format = ytdl.chooseFormat(info.formats, {
      quality: ["137", "136", "135"],
      filter: format => format.container === "mp4",
    });

    // return console.log(format)

    const readableStream = await ytdl.downloadFromInfo(info, { format });

    const videoBuffer = await new fetch.Response(readableStream).buffer();

    // return console.log(videoBuffer)

    try {
      bot.sendVideo(chatId, videoBuffer);
      bot.deleteMessage(chatId, waitMessage.message_id);
    } catch (err) {
      console.error(err.message);
    }
  }
);

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

  // console.log(chatId);

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
  }

  return bot.sendMessage(
    chatId,
    `Я не совсем тебя понял...\n\nМожет отправишь ссылку на видео?`
  );
});
