/* Copyright (c) 2017-present Acrolinx GmbH */

import { Tunnel, SsoConfig } from "./secure-tunnel.def";
import * as http from "http";
import * as https from "https";
import * as proxy from "http-proxy";
import * as _ from "lodash";
import { URL, Url } from "url";
import { gunzip } from "zlib";

let fs = require("fs");
let crypto = require("crypto");
let ProxyAgent = require("proxy-agent");

let hash = (text: string) =>
  crypto
    .createHash("md5")
    .update(text)
    .digest("hex")
    .substring(0, 8);

export interface SecureTunnelConfig {
  silent: boolean;
  verbose: boolean;
  requests: boolean;
}

export interface SslConfig {
  passphrase?: string;
  key?: string;
  cert?: string;
  ca?: string[];
  secure: boolean;
}

export class SecureTunnel {
  private config: SecureTunnelConfig;
  private servers: (http.Server | https.Server)[] = [];

  constructor(config: SecureTunnelConfig) {
    this.config = config;
  }

  private fixBadCookies(proxyRes: http.IncomingMessage) {
    if (proxyRes.headers["set-cookie"]) {
      const replaceStrangeChars = (text: string) => text.replace(/[\u0000-\u0031\u0127]/, "_");
      proxyRes.headers["set-cookie"] = (proxyRes.headers["set-cookie"] as string[]).map(h => replaceStrangeChars(h));
    }
  }

  testUrl = (url: URL, sslConfig: SslConfig, proxyUri?: URL) => {
    return new Promise((resolve, reject) => {
      let label: string = hash(
        url.toString() + (proxyUri ? proxyUri.toString() : "")
      );
      let proxyAgent: any = proxyUri ? new ProxyAgent(proxyUri) : null;
      if (this.config.verbose) {
        console.log(label, "Connecting: " + url.toString());
      }

      let options: http.RequestOptions = {
        agent: proxyAgent,
        port: url.port,
        hostname: url.hostname,
        method: "GET",
        path: url.pathname,
        protocol: url.protocol,
        host: url.host
      };

      if (url.protocol.startsWith("https")) {
        https
          .request(
            _.assign(options, {
              rejectUnauthorized: sslConfig.secure,
              ca: sslConfig.ca
            }),
            res => {
              if (!this.config.silent) {
                console.log(
                  label,
                  url.toString(),
                  res.statusCode,
                  res.statusMessage
                );
              }
              resolve(true);
            }
          )
          .on("error", err => {
            if (!this.config.silent) {
              console.error(label, url.toString(), err);
            }
            reject();
          })
          .end();
        return;
      }
      http
        .request(options, res => {
          if (!this.config.silent) {
            console.log(label, url.toString(), res.statusCode, res.statusMessage);
          }
          resolve(true);
        })
        .on("error", err => {
          if (!this.config.silent) {
            console.error(label, url.toString(), err);
          }
          reject();
        })
        .end();
    });
  };

  close = () => {
    while (this.servers.length) {
      const s = this.servers.pop();
      if (s) {
        s.close();
      }
    }
  };

  startInfoServer = (url: URL, proxyUri: Url | undefined, proxies: Tunnel[]) => {
    let label: string = hash(url.toString());
    console.log(label, "Starting Info", url.toString());
    const x = http
      .createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><head><title>Acrolinx Secure Tunnel</title></head><body><h1>Acrolinx Secure Tunnel</h1><h2>Proxy</h2>" +
          '<div><a href="' +
          proxyUri +
          '">' +
          proxyUri +
          "</a></div><h2>Tunnels</h2>" +
          proxies
            .map(
              p =>
                '<div><a href="' +
                p.localUrl.toString() +
                '">' +
                p.localUrl.toString() +
                '</a> -> <a href="' +
                p.targetUrl.toString() +
                '"</a>' +
                p.targetUrl.toString() +
                "</a></div>"
            )
            .join() +
          "</body></html>"
        );
      })
      .on("error", err => {
        if (!this.config.silent) {
          console.error(label, "info server", err);
        }
      });

    this.servers.push(x);

    x.listen({
      host: url.hostname,
      port: url.port,
      protocol: url.protocol
    });
  };

  startTunnel = (
    local: URL,
    target: URL,
    sslConfig: SslConfig,
    proxyUri?: URL,
    token?: string,
    sso?: SsoConfig
  ) => {
    let label: string = hash(
      local.toString() +
      target.toString() +
      (proxyUri ? proxyUri.toString() : "")
    );
    try {
      if (!this.config.silent) {
        console.log(
          label,
          "Starting Acrolinx Secure Tunnel",
          local.toString(),
          "->",
          target.toString()
        );
      }
      let p = proxy.createProxyServer();

      let proxyAgent: any = proxyUri ? new ProxyAgent(proxyUri) : null;

      let proxyFunction = (
        req: http.IncomingMessage,
        res: http.ServerResponse
      ) => {
        if (this.config.requests) {
          let w = res.write;
          res.write = function () {
            if (res.getHeader("content-encoding") === "gzip") {
              gunzip(arguments[0], (err, result) => {
                if (err) {
                  console.log(label, "<-", "gunzip error", err);
                  return;
                }
                console.log(label, "<-", "unzipped:", result.toString());
              });
            } else {
              console.log(label, "<-", arguments[0].toString());
            }
            return w.apply(this, arguments);
          };
          let r = req.read;
          req.read = function () {
            console.log(label, "->", arguments[0].toString());
            return r.apply(this, arguments);
          };
        }

        req.headers.host = target.host;
        if (!req.headers["x-acrolinx-base-url"]) {
          req.headers["X-Acrolinx-Base-URL"] = local.toString();
        }
        if (token) {
          req.headers["authorization"] = token;
          req.headers["authtoken"] = token;
          req.headers["X-Acrolinx-Auth"] = token;
        }
        if (sso) {
          req.headers["username"] = sso.username;
          req.headers["password"] = sso.token;
        }
        if (this.config.verbose) {
          let wh = res.writeHead;
          res.writeHead = function () {
            console.log(
              label,
              "<--",
              arguments[0],
              arguments[1],
              JSON.stringify(res.getHeaders())
            );
            return wh.apply(this, arguments);
          };
          console.log(
            label,
            "-->",
            req.method,
            req.url,
            JSON.stringify(req.headers)
          );
        }
        p.on("proxyRes", (proxyRes, req, res) => {
          this.fixBadCookies(proxyRes);
        });
        p.web(
          req,
          res,
          <any>{
            target: target.toString(),
            hostRewrite: local.host,
            ws: true,
            toProxy: true,
            autoRewrite: true,
            changeOrigin: true,
            secure: sslConfig.secure,
            protocolRewrite: local.protocol,
            agent: proxyAgent,
            ca: sslConfig.ca // not in interface, but passed in to ssl options
          },
          err => {
            if (!this.config.silent) {
              console.error(
                label,
                local.toString(),
                "<-",
                target.toString(),
                err
              );
            }
          }
        );
      };

      let server = local.protocol.startsWith("https")
        ? https.createServer(
          {
            key: sslConfig.key ? fs.readFileSync(sslConfig.key) : undefined,
            cert: sslConfig.cert
              ? fs.readFileSync(sslConfig.cert)
              : undefined,
            passphrase: sslConfig.passphrase,
            ca: sslConfig.ca,
            requestCert: false,
            rejectUnauthorized: false
          },
          proxyFunction
        )
        : http.createServer(proxyFunction);

      this.servers.push(server);

      server
        .on("error", err => {
          if (!this.config.silent) {
            console.error(
              label,
              local.toString(),
              "->",
              target.toString(),
              err
            );
          }
        })
        .listen({
          string: local.hostname,
          port: local.port
            ? local.port
            : local.protocol.startsWith("https") ? 443 : 80,
          protocol: local.protocol,
          path: local.pathname
        });
      if (!this.config.silent) {
        console.log(
          label,
          "Started Acrolinx Secure Tunnel",
          local.toString(),
          "->",
          target.toString()
        );
      }
    } catch (err) {
      if (!this.config.silent) {
        console.error(
          label,
          "Starting server",
          local.toString(),
          "->",
          target.toString(),
          "failed",
          err
        );
      }
    }
  };
}