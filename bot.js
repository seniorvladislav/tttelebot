if (!process.env.NODE_ENV) {
  require("dotenv").config({
    path: "./config/config.env",
  });
}

const { TELEGRAM_BOT_TOKEN, BOT_USERNAME, BOT_NAME } = process.env;

const ADMINS = [хуйня];

// const needle = require("needle");
const TelegramAPI = require("node-telegram-bot-api");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { promisify } = require("util");
const instagram_download = require("@juliendu11/instagram-downloader");
const Instagram = require("instagram-downloader");
const {
  getStories,
  getStoriesFeed,
  getMediaByCode,
  getUserByUsername,
} = require("instagram-stories");
const Downloader = require("nodejs-file-downloader");
// const TikTokScraper = require("tiktok-scraper");
// const ytdl = require("ytdl-core");
// const fs = require("fs")
const redis = require("./helpers/redis");

const readDirectory = promisify(fs.readdir);

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
const cheerio = require("cheerio");
// const handlers = require("./handlers")(bot);

// bot.onText(handlers.tiktok.regex, handlers.tiktok.callback);

const videoRegex =
  /https?:\/\/www.tiktok.com\/@([\D\d]+)\/video\/(\d+)|https?:\/\/vm.tiktok.com\/([A-Z]+)/i;

// const instaRegex = /instagram.com\/p\/([A-Z0-9]+)/i;
const instaRegex =
  /(instagram.com\/p\/[\D\d]+)|(instagram.com\/stories\/[\D\d.]+\/[\d\/]+)/i;

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

  // return console.log(await getVideoByUrl(videoUrl));

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

  // console.time("ttDownload");
  const start = new Date();

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

  // console.timeEnd("ttDownload");
  const end = new Date();

  try {
    // console.log(noWaterMarkUrl);

    await bot.sendMediaGroup(chatId, [
      {
        type: "video",
        media: noWaterMarkUrl,
        caption: `${videoUrl}\n\nВидео скачано за ${(
          (end.getTime() - start.getTime()) /
          ONE_THOUSAND
        ).toLocaleString("ru")} сек.`,
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

const instaCallback = async (msg, match) => {
  const chatId = msg.chat.id;
  let instaUrl = match[2] || match[1];

  instaUrl = `https://www.${instaUrl}`;
  console.log(instaUrl);

  try {
    // const reply = await instagram_download.downloadMedia(
    //   instaUrl,
    //   __dirname + "/photos"
    // );
    // return console.log(reply);

    const data = await Instagram(instaUrl);
    // console.log(data);
    const userId =
      data.entry_data.StoriesPage && data.entry_data.StoriesPage[0].user.id;

    let results = [];

    if (userId) {
      const stories = await getStories({
        id: userId,
        userid: 1284161654,
        sessionid: "1509886866%3AcYWwo6HEDPifg4%3A12",
      });

      // const mediaCodes = stories.items.map(item => item.code);
      // console.log(
      //   stories.items
      //     .filter(s => s.video_versions)
      //     .map(v => v.video_versions[0].url)
      // );

      stories.items.forEach(s => {
        if (s.video_versions) {
          results.push({
            url: s.video_versions[0].url,
            type: "video",
          });
        } else if (s.image_versions2) {
          const storyPhoto = s.image_versions2.candidates[0];
          // console.log(storyPhoto.url);
          results.push({
            url: storyPhoto.url,
            type: "photo",
          });
        }
      });

      // const media = await getMediaByCode({
      //   code: mediaCodes[0],
      //   userid: 1284161654,
      //   sessionid: "1509886866%3AcYWwo6HEDPifg4%3A12",
      // });

      // console.log(media);
    } else {
      const { shortcode_media } = data.entry_data.PostPage[0].graphql;

      results = shortcode_media.edge_sidecar_to_children
        ? shortcode_media.edge_sidecar_to_children.edges.map(edge => {
            let type = edge.node.__typename.replace("Graph", "").toLowerCase();

            if (type === "image") {
              type = "photo";
            }

            return {
              url: edge.node.video_url || edge.node.display_url,
              type,
            };
          })
        : [
            {
              url:
                shortcode_media.video_url ||
                shortcode_media.display_resources.pop().src,
              type: shortcode_media.__typename.endsWith("Image")
                ? "photo"
                : shortcode_media.__typename.replace("Graph", "").toLowerCase(),
            },
          ];
    }

    // return console.log(results);
    // return;

    const [, mediaID] = instaUrl.match(/\/p\/([\d\D]+)/);

    console.log(mediaID);

    const pathToSave = path.join(
      __dirname,
      "temp_videos",
      `${userId || mediaID}`
    );

    const videoResults = results.filter(res => res.type === "video");

    let files;

    results.forEach(async r => {
      if (r.type === "video") {
        const downloader = new Downloader({
          url: r.url,
          directory: pathToSave,
          cloneFiles: false,
          maxAttempts: 3,
        });

        try {
          await downloader.download();
        } catch (err) {
          console.error("Download failed", err);
        }
      }
    });

    if (videoResults.length) {
      files = await readDirectory(pathToSave);
    }

    // return console.log(path.resolve(pathToSave, files[0]));

    const media = results.map((r, index) => {
      if (r.type === "video") {
        return { type: r.type, media: path.resolve(pathToSave, files[index]) };
      } else {
        // console.log(r);
        return { type: r.type, media: r.url };
      }
    });

    // return console.log(media);

    bot.sendMediaGroup(chatId, media);

    // results.forEach(async r => {
    //   try {
    //     if (r.type === "video") {
    //       const { body } = await needle("get", r.url);
    //       // console.log(response.body);
    //       bot.sendVideo(chatId, body);
    //     } else if (r.type === "image") {
    //       bot.sendPhoto(chatId, r.url);
    //     }
    //   } catch (err) {
    //     console.error(err);
    //   }
    // });

    // await bot.sendMediaGroup(chatId, {
    //   type: "photo",
    //   media: results,
    //   caption: `${instaUrl}\n\nПост скачан!`,
    // });

    // await deleteFile(reply.file);
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();
    // await page.goto(instaUrl);

    // const imageSource = await page.$eval("body", el => el.innerHTML);

    // console.log(imageSource);

    // await browser.close();
    // const { body, statusMessage } = await needle("get", instaUrl);
    // console.log(body);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, `Не удалось скачать фотогорафию по ссылке`);
  }
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

  const ttMatch = msg.text.match(videoRegex);
  const instaMatch = msg.text.match(instaRegex);

  // console.log(match);
  if (ttMatch) {
    return ttCallback(msg, ttMatch);
  } else if (instaMatch) {
    return instaCallback(msg, instaMatch);
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
  console.error(err.code, err.response);
});
