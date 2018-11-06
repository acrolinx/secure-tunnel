/* Copyright (c) 2017-present Acrolinx GmbH */

import { Tunnel, SsoConfig, SecureTunnelConfig, SslConfig } from "./secure-tunnel.def";
import * as http from "http";
import * as https from "https";
import * as proxy from "http-proxy";
import { URL, Url } from "url";
import { hash } from "./util";
import { gunzip } from "zlib";
import * as urlTester from "./url-tester";
import * as infoServer from "./info-server";

let fs = require("fs");
let ProxyAgent = require("proxy-agent");

export { SecureTunnelConfig, SslConfig };

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
    let label: string = hash(url, proxyUri);
    return urlTester.testUrl(label, url, this.config, sslConfig, proxyUri);
  };

  close = () => {
    while (this.servers.length) {
      const s = this.servers.pop();
      if (s) {
        s.close();
      }
    }
  };

  startInfoServer = (url: URL, proxyUri: Url | undefined, tunnels: Tunnel[]) => {
    let label: string = hash(url);
    console.log(new Date().toISOString(), label, "Starting Info", url.toString());

    const server = infoServer.create(label, proxyUri, tunnels, this.config.silent);
    this.servers.push(server);
    server.listen({
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
    let label: string = hash(local, target, proxyUri);
    try {
      if (this.config.verbose) {
        console.log(new Date().toISOString(),
          label,
          "Starting Acrolinx Secure Tunnel",
          local.toString(),
          "->",
          target.toString()
        );
      }
      let p = proxy.createProxyServer();

      p.on("proxyRes", (proxyRes, req, res) => {
        this.fixBadCookies(proxyRes);

        if (this.config.verbose) {
          console.log(new Date().toISOString(),
            label,
            "-->",
            req.method,
            req.url,
            JSON.stringify(req.headers)
          );
          console.log(new Date().toISOString(),
            label,
            "<--",
            res.statusCode,
            res.statusMessage
          );
        }

        if (this.config.requests) {
          const buffer: Uint8Array[] = [];
          proxyRes.on("data", data => {
            buffer.push(data);
          });
          proxyRes.on("end", () => {
            if (this.config.verbose) {
              console.log(new Date().toISOString(),
                label,
                "<--",
                JSON.stringify(res.getHeaders())
              );
            }
            const body = Buffer.concat(buffer);
            if (body) {
              if (res.getHeader("content-encoding") === "gzip") {
                gunzip(body, (err, result) => {
                  if (err) {
                    console.log(new Date().toISOString(), label, "<--", "gunzip error", err);
                    console.log(new Date().toISOString(), label, "<--", "body (zipped?):", body.toString());
                    return;
                  }
                  console.log(new Date().toISOString(), label, "<--", "body unzipped:", result.toString());
                });
              }
              else {
                console.log(new Date().toISOString(), label, "<--", "body:", body.toString());
              }
            }
          });
        }
      });

      p.on("proxyReq", (proxyReq, req, res) => {
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
        if (this.config.requests) {
          const buffer: Uint8Array[] = [];
          req.on("data", data => {
            buffer.push(data);
          });
          req.on("end", () => {
            const body = Buffer.concat(buffer).toString();
            if (body) {
              console.log(new Date().toISOString(), label, "-->", "body:", body);
            }
          });
        }
      });

      let proxyAgent: any = proxyUri ? new ProxyAgent(proxyUri) : null;

      let proxyFunction = (
        req: http.IncomingMessage,
        res: http.ServerResponse
      ) => p.web(req, res, <any>{
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
            console.error(new Date().toISOString(),
              label,
              local.toString(),
              "<-",
              target.toString(),
              err
            );
          }
        }
      );


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
            console.error(new Date().toISOString(),
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
        }, () => {
          if (!this.config.silent) {
            console.log(new Date().toISOString(),
              label,
              "Started Acrolinx Secure Tunnel",
              local.toString(),
              "->",
              target.toString()
            );
          }
        });
    }
    catch (err) {
      if (!this.config.silent) {
        console.error(new Date().toISOString(),
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
  }
};