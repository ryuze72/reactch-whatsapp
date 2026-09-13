const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE = "https://react.zfile.web.id";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

class KeyyssReactBot {
  constructor() {
    this.cookies = {};
  }

  genSessionId() {
    const chars =
      "abcdefghijklmnopqrstuvwxyz0123456789";

    let id = "zx_";

    for (let i = 0; i < 16; i++) {
      id += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }

    return id;
  }

  parseCookies(headers) {
    const setCookie = headers["set-cookie"];

    if (!setCookie) return;

    const cookies = Array.isArray(setCookie)
      ? setCookie
      : [setCookie];

    for (const cookie of cookies) {
      const match = cookie.match(/^([^=]+)=([^;]+)/);

      if (match) {
        this.cookies[match[1]] = match[2];
      }
    }
  }

  cookieHeader() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  req(method, urlString, body = null, extra = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);

      const headers = {
        "User-Agent": UA,
        "Accept": "application/json",
        "Accept-Language":
          "id-ID,id;q=0.9,en-US;q=0.8",
        "Origin": BASE,
        "Referer": BASE + "/",
        ...extra
      };

      const cookie = this.cookieHeader();

      if (cookie) {
        headers.Cookie = cookie;
      }

      const request = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method,
          headers
        },
        response => {
          this.parseCookies(response.headers);

          let data = "";

          response.on("data", chunk => {
            data += chunk;
          });

          response.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          });
        }
      );

      request.on("error", reject);

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error("Request timeout"));
      });

      if (body) {
        request.write(
          typeof body === "string"
            ? body
            : JSON.stringify(body)
        );
      }

      request.end();
    });
  }

  async getTicket(sessionId) {
    const result = await this.req(
      "GET",
      BASE + "/api/challenge",
      null,
      {
        "X-Session-Id": sessionId
      }
    );

    if (!result || !result.ok) {
      throw new Error(
        "Gagal mendapatkan challenge."
      );
    }

    return result;
  }

  async sendReaction(
    url,
    reactions,
    ticket,
    sessionId
  ) {
    if (
      !url ||
      !url.includes("whatsapp.com/channel")
    ) {
      throw new Error(
        "URL WhatsApp Channel tidak valid."
      );
    }

    if (
      !Array.isArray(reactions) ||
      reactions.length === 0
    ) {
      throw new Error(
        "Pilih minimal satu emoji."
      );
    }

    const result = await this.req(
      "POST",
      BASE + "/api/react",
      {
        url,
        reactions,
        ticket
      },
      {
        "Content-Type": "application/json",
        "X-ZX-Request": "zx-reactch",
        "X-Session-Id": sessionId
      }
    );

    return {
      success: result?.success === true,
      message:
        result?.message ||
        "Gagal mengirim reaksi.",
      data: result
    };
  }
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;

      if (data.length > 1024 * 1024) {
        reject(
          new Error("Request terlalu besar.")
        );

        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(
          new Error("JSON tidak valid.")
        );
      }
    });

    req.on("error", reject);
  });
}

const index = fs.readFileSync(
  path.join(
    __dirname,
    "public",
    "index.html"
  ),
  "utf8"
);

const server = http.createServer(
  async (req, res) => {

    try {

      if (
        req.method === "GET" &&
        req.url === "/"
      ) {
        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8"
        });

        return res.end(index);
      }

      if (
        req.method === "GET" &&
        req.url === "/api/challenge"
      ) {

        const bot =
          new KeyyssReactBot();

        const sessionId =
          bot.genSessionId();

        const challenge =
          await bot.getTicket(
            sessionId
          );

        return json(res, 200, {
          success: true,
          sessionId,
          challenge
        });
      }

      if (
        req.method === "POST" &&
        req.url === "/api/react"
      ) {

        const data =
          await body(req);

        const {
          url,
          reactions,
          ticket,
          sessionId
        } = data;

        if (!ticket || !sessionId) {
          return json(res, 400, {
            success: false,
            message:
              "Ticket/session tidak tersedia."
          });
        }

        const bot =
          new KeyyssReactBot();

        const result =
          await bot.sendReaction(
            url,
            reactions,
            ticket,
            sessionId
          );

        return json(
          res,
          result.success ? 200 : 400,
          result
        );
      }

      return json(res, 404, {
        success: false,
        message: "Not found"
      });

    } catch (error) {

      return json(res, 500, {
        success: false,
        message:
          error.message ||
          "Server error"
      });

    }

  }
);

server.listen(PORT, () => {
  console.log(
    `ReactCh: http://localhost:${PORT}`
  );
});
