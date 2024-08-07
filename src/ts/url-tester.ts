/* Copyright (c) 2018-present Acrolinx GmbH */

import * as http from 'http';
import * as https from 'https';
import * as _ from 'lodash';
import {URL} from 'url';
import {SecureTunnelConfig, SslConfig} from './secure-tunnel.net';

const ProxyAgent = require('proxy-agent');

export function testUrl(label: string, url: URL, config: SecureTunnelConfig, sslConfig: SslConfig, proxyUri?: URL) {
  return new Promise((resolve, reject) => {
    const proxyAgent: any = proxyUri ? new ProxyAgent(proxyUri) : null;
    if (config.verbose) {
      console.log(new Date().toISOString(), label, 'Connecting', '' + url);
    }

    const options: http.RequestOptions = {
      agent: proxyAgent,
      port: url.port,
      hostname: url.hostname,
      method: 'GET',
      path: url.pathname,
      protocol: url.protocol,
      host: url.host
    };

    if (url.protocol.startsWith('https')) {
      https
        .request(
          _.assign(options, {
            rejectUnauthorized: sslConfig.secure,
            ca: sslConfig.ca
          }),
          res => {
            if (!config.silent) {
              console.log(new Date().toISOString(),
                label,
                'Connected',
                '' + url,
                res.statusCode,
                res.statusMessage
              );
            }
            resolve(true);
          }
        )
        .on('error', err => {
          if (!config.silent) {
            console.error(new Date().toISOString(), label, '' + url, '' + err);
          }
          reject();
        })
        .end();
      return;
    }
    http
      .request(options, res => {
        if (!config.silent) {
          console.log(new Date().toISOString(), label, 'Connected', '' + url, res.statusCode, res.statusMessage);
        }
        resolve(true);
      })
      .on('error', err => {
        if (!config.silent) {
          console.error(new Date().toISOString(), label, '' + url, '' + err);
        }
        reject();
      })
      .end();
  });
}
