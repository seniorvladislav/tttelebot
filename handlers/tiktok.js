// const fetch = require("node-fetch");
const needle = require("needle");
const cheerio = require("cheerio");
const request = require("request");
const HttpsProxyAgent = require("https-proxy-agent");
const { promisify } = require("util");

const post = promisify(request.post).bind(request);

// const mainEndpoint = "https://ssstik.io/";

// const altEndpoint =
//   "https://freevideosdowloader.tk/services/downloader_api.php";

// const getNoWatermarkUrl = async url => {
//   try {
//     const response = await fetch(altEndpoint, {
//       method: "POST",
//       body: `url=${url}`,
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//     });

//     const data = await response.json();

//     const { VideoUrl } = data.VideoResult[0];

//     return VideoUrl;
//   } catch (err) {
//     return err;
//   }
// };

// const getVideo = async url => {
//   try {
//     const endpoint = `https://ttdownloader.com/?url=https://www.tiktok.com/@american_times/video/6944351015525174533?is_copy_url=1&is_from_webapp=v1`;
//     const { body } = await needle("get", endpoint);

//     console.log(body);

//     const $ = await cheerio.load(body);

//     const noWaterMarkUrl = $("#results-container");

//     return noWaterMarkUrl.html();
//   } catch (err) {
//     return err;
//   }
// };

const getVideo = async url => {
  const endpoint = "https://snaptik.app/action.php?lang=en";

  // const browser = await puppeteer.launch();
  // const page = await browser.newPage();

  // await page.goto(baseUrl);

  try {
    // const html = await page.$eval("body", root => root.innerHTML);
    const proxy = new URL(process.env.QUOTAGUARD_URL);
    const target = new URL(endpoint);

    const options = process.env.NODE_ENV
      ? {
          hostname: proxy.hostname,
          port: proxy.port || 80,
          uri: target.href,
          headers: {
            "Proxy-Authorization":
              "Basic " +
              Buffer.from(`${proxy.username}:${proxy.password}`).toString(
                "base64"
              ),
            Host: target.hostname,
          },
          // agent: proxy ? new HttpsProxyAgent(proxy) : null,
          form: {
            url,
          },
        }
      : {
          uri: target.href,
          form: {
            url,
          },
        };

    const { body, statusCode } = await post(options);

    if (process.env.NODE_ENV) {
      console.log(statusCode, body);
    }

    if (statusCode === 200) {
      // return console.log(resp.body);

      const $ = cheerio.load(body);

      let links = $('a[title^="Download Server"]');

      links = [...links.slice(4)].map(l => $(l).attr("href"));

      // console.log(links.pop());

      return Promise.resolve(links.pop());
    }
  } catch (err) {
    console.log(err);
    // console.log(response.headers, response.body);
  }
};

// const mainGetNoWatermarkUrl = async url => {
//   const browser = await puppeteer.launch();

//   const page = await browser.newPage();
//   await page.goto(mainEndpoint);

//   try {
//     const html = await page.$eval("body", el => {
//       // const postParam = el["data-hx-post"];
//       // console.log(postParam);
//       return el.innerHTML;
//     });
//     console.log(html);
//   } catch (err) {
//     console.error(err);
//   }

//   await browser.close();

//   // const response = await needle("GET", mainEndpoint);

//   // const html = await response.text();

//   // console.log(response.body);

//   // console.log("Found hx post param: " + html.includes("data-hx-post"));
// };

module.exports = {
  // getNoWatermarkUrl,
  getVideoByUrl: getVideo,
  // mainGetNoWatermarkUrl,
};
