if (!process.env.NODE_ENV) {
  require("dotenv").config({
    path: "./config/config.env",
  });
}

const {
  TELEGRAM_BOT_TOKEN,
  BOT_USERNAME,
  BOT_NAME,
  INSTA_USERNAME,
  INSTA_PASSWORD,
  ME_USER_ID,
} = process.env;

const ADMINS = [471468236];

// const needle = require("needle");
const TelegramAPI = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const InstagramWeb = require("instagram-web-api");
const FileCookieStore = require("tough-cookie-filestore2");
const cookieStore = new FileCookieStore("./cookies.json");
const Instagram = new InstagramWeb({
  username: INSTA_USERNAME,
  password: INSTA_PASSWORD,
  cookieStore,
});
const { getStories } = require("instagram-stories");
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
  filepath: false,
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
const { client } = require("./helpers/redis");
// const handlers = require("./handlers")(bot);

// bot.onText(handlers.tiktok.regex, handlers.tiktok.callback);

const videoRegex =
  /https?:\/\/www.tiktok.com\/@([\D\d]+)\/video\/(\d+)|https?:\/\/vm.tiktok.com\/([A-Z]+)/i;

// const instaRegex = /instagram.com\/p\/([A-Z0-9]+)/i;
const instaRegex =
  /(instagram.com\/p\/[a-z0-9_]+)|(instagram.com\/stories\/[\D\d.]+\/[\d\/]+)|(instagram.com\/tv\/[a-z0-9_]+)/i;

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
  let instaUrl = match[1] || match[2] || match[3];

  instaUrl = `https://www.${instaUrl}`;
  console.log(instaUrl);

  try {
    await Instagram.login();

    // return console.log(match);

    const testForCode = instaUrl.match(/[p|tv]\/([a-z0-9_]+)/i);
    let shortcode,
      results = [],
      files = [];

    if (testForCode) {
      shortcode = testForCode[1];
      // return console.log("hey yo");
      // console.log(shortcode);
    } else {
      const usernameMatches = /stories\/([a-z0-9_]+)\/\d+/i;

      if (usernameMatches.test(instaUrl)) {
        // return console.log("Yahoo!");

        const [, username] = instaUrl.match(usernameMatches);
        // return console.log(username);
        const user = await Instagram.getUserByUsername({ username });
        const userId = user.id;
        // return console.log(userId);
        const stories = await getStories({
          id: parseInt(userId),
          userid: 1509886866,
          sessionid: "1509886866%3AJ6vevyBtF5FsCI%3A27",
        });

        // console.log(stories);

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

        const videoResults = results.filter(r => r.type === "video");

        // sendResponse(await downloadVideoFiles(results));

        files = await Promise.all(videoResults.map(r => downloadVideoFiles(r)));

        sendResponse(files);
      }
    }

    async function downloadVideoFiles(result) {
      const pathToSave = whereShouldSave();
      const [, filename] = result.url.match(/(\d+_\d+_\d+_n.mp4)/i);
      // return console.log(filename);

      const downloader = new Downloader({
        url: result.url,
        directory: pathToSave,
        cloneFiles: false,
        maxAttempts: 3,
        timeout: 60000,
        onResponse: response => {
          const bytes = +response.headers["content-length"];

          // Если размер файла больше 50mb
          if (bytes > 52428800) {
            setTimeout(() => {
              downloader.cancel();
            }, 0);
          }

          return true;
        },
      });

      try {
        await downloader.download();
        return fs.createReadStream(path.resolve(pathToSave, filename));
        // return await readDirectory(pathToSave);
      } catch (err) {
        // console.log(err);

        if (err.code === `ERR_REQUEST_CANCELLED`) {
          // console.log(result.url);
          const { headers } = await needle("head", result.url);

          const size = Math.round(+headers["content-length"] / 1048576);

          // console.log(size);

          bot.sendMessage(
            chatId,
            `Размер вашего видеофайла: *${size}* Мегабайт\n\nПо техническим причинам скачивать видео больше 50МБ на данный момент не представляется возможным`,
            { parse_mode: "Markdown" }
          );

          return size;
        } else {
          console.error("Download failed", err);
        }
      }
    }

    // return console.log(shortcode);

    const shortcode_media = await Instagram.getMediaByShortcode({ shortcode });

    // return console.log(shortcode_media);
    // console.log(data);

    // return console.log(results);
    // return;

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

    // console.log(results);

    const videoResults = results.filter(res => res.type === "video");

    // files = await downloadVideoFiles(videoResults);

    files = await Promise.all(videoResults.map(r => downloadVideoFiles(r)));
    // return console.log(files);

    if (files.some(f => !f || Number.isInteger(f))) {
      return;
    }

    // console.log(mediaID);

    // if (videoResults.length) {
    //   files = await readDirectory(pathToSave);
    // }

    // return console.log(path.resolve(pathToSave, files[0]));

    // console.log(results);

    sendResponse(files);

    function sendResponse(files) {
      // return console.log(whereShouldSave());

      const media = results.map((r, index) => {
        if (r.type === "video" && files) {
          return {
            type: r.type,
            media: files[index],
          };
        } else {
          // console.log(r);
          return { type: r.type, media: r.url };
        }
      });

      // return console.log(media);

      bot.sendMediaGroup(chatId, media);
    }

    function whereShouldSave() {
      // const mediaMatches = instaUrl.match(/\/p\/([\d\D]+)/);
      const storyMatches = instaUrl.match(/stories\/([a-z0-9_]+\/\d+)/i);
      let pathToSave;

      if (testForCode) {
        pathToSave = path.join(__dirname, "temp_videos", `${testForCode[1]}`);
      } else if (storyMatches) {
        // return console.log(storyMatches);

        pathToSave = path.join(__dirname, "temp_videos", `${storyMatches[1]}`);
      }

      return pathToSave;
    }

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
    if (!err.statusCode && err.statusCode !== 404) {
      console.error(err);
    }
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
