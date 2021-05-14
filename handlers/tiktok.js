const fetch = require("node-fetch");
// const needle = require("needle");
// const puppeteer = require("puppeteer");

// const mainEndpoint = "https://ssstik.io/";

const altEndpoint =
  "https://freevideosdowloader.tk/services/downloader_api.php";

const getNoWatermarkUrl = async url => {
  const response = await fetch(altEndpoint, {
    method: "POST",
    body: `url=${url}`,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const data = await response.json();

  const { VideoUrl } = data.VideoResult[0];

  return VideoUrl;
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
  getNoWatermarkUrl,
  // mainGetNoWatermarkUrl,
};
