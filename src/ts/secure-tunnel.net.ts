/* Copyright (c) 2017-present Acrolinx GmbH */

import * as fs from 'fs';
import * as http from 'http';
import * as proxy from 'http-proxy';
import * as https from 'https';
import { URL } from 'url';
import { gunzip } from 'zlib';
import { blockWithoutRequiredCookie } from './block-without-required-cookie';
import * as infoServer from './info-server';
import { SecureTunnelConfig, SslConfig, SsoConfig, Tunnel } from './secure-tunnel.def';
import * as urlTester from './url-tester';
import { hash } from './util';

const ProxyAgent = require('proxy-agent');

export { SecureTunnelConfig, SslConfig };

export class SecureTunnel {
  private config: SecureTunnelConfig;
  private servers: (http.Server | https.Server)[] = [];

  constructor(config: SecureTunnelConfig) {
    this.config = config;
  }

  public testUrl = (url: URL, sslConfig: SslConfig, proxyUri?: URL) => {
    const label: string = hash(url, proxyUri);
    return urlTester.testUrl(label, url, this.config, sslConfig, proxyUri);
  }

  public close = () => {
    while (this.servers.length) {
      const s = this.servers.pop();
      if (s) {
        s.close();
      }
    }
  }

  public startInfoServer = (url: URL, proxyUri: URL | undefined, tunnels: Tunnel[]) => {
    const label: string = hash(url);
    console.log(new Date().toISOString(), label, 'Starting Info', url.toString());

    const server = infoServer.create(label, proxyUri, tunnels, this.config.silent);
    this.servers.push(server);
    server.listen({
      host: url.hostname,
      port: url.port,
      protocol: url.protocol
    });
  }

  public startTunnel = (
    local: URL,
    target: URL,
    sslConfig: SslConfig,
    proxyUri?: URL,
    token?: string,
    sso?: SsoConfig
  ) => {
    const label: string = hash(local, target, proxyUri);
    try {
      if (this.config.verbose) {
        console.log(new Date().toISOString(),
          label,
          'Starting Acrolinx Secure Tunnel',
          local.toString(),
          '->',
          target.toString()
        );
      }
      const p = proxy.createProxyServer();

      p.on('proxyRes', (proxyRes, req, res) => {
        this.fixBadCookies(proxyRes);

        if (this.config.verbose) {
          console.log(new Date().toISOString(),
            label,
            '-->',
            '' + req.url,
            req.method,
            'headers:',
            JSON.stringify(req.headers)
          );
          console.log(new Date().toISOString(),
            label,
            '<--',
            '' + req.url,
            res.statusCode
          );
        }

        if (this.config.requests) {
          const buffer: Buffer[] = [];
          proxyRes.on('data', data => {
            if (Buffer.isBuffer(data)) {
              buffer.push(data);
            }
          });
          proxyRes.on('end', () => {
            if (this.config.verbose) {
              console.log(new Date().toISOString(),
                label,
                '<--',
                '' + req.url,
                'headers:',
                JSON.stringify(res.getHeaders())
              );
            }
            const body = Buffer.concat(buffer);
            if (body) {
              if (res.getHeader('content-encoding') === 'gzip') {
                gunzip(body, (err, result) => {
                  if (err) {
                    console.log(new Date().toISOString(), label, '<--', '' + req.url, 'gunzip error', err);
                    console.log(new Date().toISOString(), label, '<--', '' + req.url, 'body (zipped?):', body.toString());
                    return;
                  }
                  console.log(new Date().toISOString(), label, '<--', '' + req.url, 'body unzipped:', result.toString());
                });
              } else {
                console.log(new Date().toISOString(), label, '<--', '' + req.url, 'body:', body.toString());
              }
            }
          });
        }
      });

      p.on('proxyReq', (proxyReq, req, res) => {
        if (this.config.blockWithoutRequiredCookie) {
          const blockedBecauseOfMissingCookie = blockWithoutRequiredCookie(proxyReq, req, res);
          if (blockedBecauseOfMissingCookie) {
            return;
          }
        }

        req.headers.host = target.host;
        if (!req.headers['x-acrolinx-base-url']) {
          req.headers['X-Acrolinx-Base-URL'] = local.toString();
        }
        if (token) {
          console.log(new Date().toISOString(), label, '-->', '' + req.url, 'adding token to header');
          req.headers.authorization = token;
          req.headers.authtoken = token;
          req.headers['X-Acrolinx-Auth'] = token;
        }
        if (sso) {
          console.log(new Date().toISOString(), label, '-->', '' + req.url, 'adding sso to header');
          req.headers.username = sso.username;
          req.headers.password = sso.token;
        }
        if (this.config.requests) {
          const buffer: Buffer[] = [];
          req.on('data', data => {
            if (Buffer.isBuffer(data)) {
              buffer.push(data);
            }
          });
          req.on('end', () => {
            const body = Buffer.concat(buffer).toString();
            if (body) {
              console.log(new Date().toISOString(), label, '-->', '' + req.url, 'body:', body);
            }
          });
        }
      });

      const proxyAgent: any = proxyUri ? new ProxyAgent(proxyUri) : null;

      const proxyFunction = (
        req: http.IncomingMessage,
        res: http.ServerResponse
      ) => p.web(req, res, {
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
      } as any,
        err => {
          if (!this.config.silent) {
            console.error(new Date().toISOString(),
              label,
              local.toString(),
              '<-',
              target.toString(), '' +
              '' + err
            );
          }
        }
      );


      const server = local.protocol.startsWith('https')
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
        .on('error', err => {
          if (!this.config.silent) {
            console.error(new Date().toISOString(),
              label,
              local.toString(),
              '->',
              target.toString(), '' +
              '' + err
            );
          }
        })
        .listen({
          string: local.hostname,
          port: local.port
            ? local.port
            : local.protocol.startsWith('https') ? 443 : 80,
          protocol: local.protocol,
          path: local.pathname
        }, () => {
          if (!this.config.silent) {
            console.log(new Date().toISOString(),
              label,
              'Started Acrolinx Secure Tunnel',
              local.toString(),
              '->',
              target.toString()
            );
          }
        });
    } catch (err) {
      if (!this.config.silent) {
        console.error(new Date().toISOString(),
          label,
          'Starting server',
          local.toString(),
          '->',
          target.toString(),
          'failed ',
          '' +
          err
        );
      }
    }
  }

  private fixBadCookies(proxyRes: http.IncomingMessage) {
    if (proxyRes.headers['set-cookie']) {
      const replaceStrangeChars = (text: string) => text.replace(/[\u0000-\u0031\u0127]/, '_');
      proxyRes.headers['set-cookie'] = (proxyRes.headers['set-cookie']).map(h => replaceStrangeChars(h));
    }
  }
}
