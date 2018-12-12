/* Copyright (c) 2018-present Acrolinx GmbH */

import {fail} from 'assert';
import chai = require('chai');
import {expect} from 'chai';
import chaiString = require('chai-string');
import 'chai-string';
import * as fs from 'fs';
import * as https from 'https';
import 'isomorphic-fetch';
import 'mocha';
import {CertificateCreationResult, createCertificate} from 'pem';
import * as tmp from 'tmp';
import {URL} from 'url';
import {SecureTunnel, SecureTunnelConfig, SslConfig} from '../ts/secure-tunnel.net';
import {randomPort, startTunnelAndFetch} from './test-utils/test-utils';

chai.use(chaiString);
describe('test server', () => {
  it('is online at all', async () => {
    const result = await fetch('https://test-ssl.acrolinx.com/iq/services/rest/registry/knownServiceNames');
    expect(result.status).to.be.eq(200);
    const json = await result.json();
    expect(json).to.contain('core');
  });

  it('test http', async () => {
    await new SecureTunnel(config).testUrl(new URL('http://test.acrolinx.com:8031'), {secure: true});
  });

  it('test https', async () => {
    await new SecureTunnel(config).testUrl(new URL('https://test-ssl.acrolinx.com'), {secure: true});
  });

  it('test https without certificate fails', async () => {
    const tmpFile = tmp.fileSync({});
    try {
      await new SecureTunnel(config).testUrl(new URL('https://test-ssl.acrolinx.com'), {
        secure: true,
        ca: [tmpFile.name]
      });
      fail('the call should throw an exception');
    } catch (e) {
      console.log(new Date().toISOString(), 'Expected exception: ' + e + " everything's fine.");
    } finally {
      tmpFile.removeCallback();
    }

  });
});

const config: SecureTunnelConfig = {
  silent: false,
  verbose: true,
  requests: true,
  blockWithoutRequiredCookie: false
};


const startSslTunnelAndGet = async (tunnel: SecureTunnel, localUrl: string, remoteUrl: string, port: number, sslConfig: SslConfig, certificate?: string) => {
  tunnel!.startTunnel(new URL(localUrl), new URL(remoteUrl), sslConfig, undefined, undefined, undefined);
  const data = await new Promise((resolve, reject) => {
    try {
      https.get({
        hostname: 'localhost',
        port,
        path: '/iq/services/rest/registry/knownServiceNames',
        protocol: 'https:',
        ca: certificate
      }, (res) => {
        let content = '';
        res.on('data', (newData) => {
          content += newData;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(content));
          } catch (err) {
            console.error(new Date().toISOString(), 'rejecting (1) because of: ' + err);
            reject(err);
          }
        });
        res.on('error', (err) => {
          console.error(new Date().toISOString(), 'rejecting (2) because of: ' + err);
          reject(err);
        });
      }).on('error', (err) => {
        console.error(new Date().toISOString(), 'rejecting (3) because of: ' + err);
        reject(err);
      }).end();
    } catch (err) {
      console.error(new Date().toISOString(), 'rejecting (4) because of: ' + err);
      reject(err);
    }
  });

  return data;
};

describe('http tunnel', () => {
  const t: { tunnel?: SecureTunnel } = {tunnel: undefined};

  beforeEach(() => {
    t.tunnel = new SecureTunnel(config);
  });

  it('to http', async () => {
    const result = await startTunnelAndFetch(t.tunnel!, 'http://localhost:' + randomPort(), 'http://test.acrolinx.com:8031', {secure: true});
    expect(result.status).to.be.eq(200);
    const json = await result.json();
    expect(json).to.contain('core');
    return true;
  });

  it('to https', async () => {
    const result = await startTunnelAndFetch(t.tunnel!, 'http://localhost:' + randomPort(), 'https://test-ssl.acrolinx.com', {secure: true});
    expect(result.status).to.be.eq(200);
    const json = await result.json();
    expect(json).to.contain('core');
    return true;
  });

  it('to https post', async () => {
    const localUrl = 'http://localhost:' + randomPort();
    t.tunnel!.startTunnel(new URL(localUrl), new URL('https://test-ssl.acrolinx.com'), {secure: true}, undefined, undefined, undefined);
    const result = await fetch(localUrl + '/iq/services/v4/rest/core/requestSession', {
      method: 'post',
      headers: {'Content-Type': 'application/json', 'authToken': 'foo'},
      body: JSON.stringify({
        sessionType: 'CHECKING',
        clientSignature: 'adb',
        clientInfo: {
          name: 'Acrolinx SAMPLE',
          version: '0.1',
          buildNumber: '1',
          clientLoginName: 'AUser',
          clientHostname: 'myHostName',
          clientHostApplication: 'MyHostApp'
        }
      })
    });
    expect(result.status).to.be.eq(403);
    const json = await result.json();
    expect(json).to.haveOwnProperty('message');
    expect(json).to.haveOwnProperty('errors');
    expect(json.errors).to.haveOwnProperty('exception_type');
    expect(json.errors).to.haveOwnProperty('exception_message');

    return true;
  });

  afterEach(() => {
    if (t.tunnel) {
      t.tunnel.close();
      t.tunnel = undefined;
    }
  });
});

describe('https tunnel', function() {
  const t: {
    tunnel?: SecureTunnel,
    keys?: SslConfig,
    files: tmp.SynchrounousResult[],
    certificates: CertificateCreationResult | undefined
  } = {
    tunnel: undefined,
    keys: undefined,
    files: [],
    certificates: undefined
  };

  this.timeout(60000);

  const createTmpFile = () => {
    const tmpFile = tmp.fileSync({});
    t.files.push(tmpFile);
    return tmpFile.name;
  };
  beforeEach(async () => {
    t.tunnel = new SecureTunnel(config);

    const certificates = await new Promise<CertificateCreationResult>((resolve, reject) => {
      createCertificate({days: 1, selfSigned: true}, (error, keys) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(keys);
      });
    });
    if (certificates) {
      t.certificates = certificates;
      t.keys = {
        key: createTmpFile(),
        cert: createTmpFile(),
        secure: true
      };
      fs.writeFileSync(t.keys!.key!, certificates.clientKey);
      fs.writeFileSync(t.keys!.cert!, certificates.certificate);
    }
  });
  afterEach(() => {
    if (t.tunnel) {
      t.tunnel.close();
      t.tunnel = undefined;
    }
    while (t.files.length > 0) {
      t.files.pop()!.removeCallback();
    }
  });

  it('to http', async () => {
    const port = randomPort();
    const data = await startSslTunnelAndGet(t.tunnel!, 'https://localhost:' + port,
      'http://test.acrolinx.com:8031', port, t.keys!, t.certificates!.certificate);
    expect(data).to.contain('core');
    return true;
  });

  it('to http fails if no certificate', async () => {
    const port = randomPort();
    try {
      console.log(new Date().toISOString(), 'waiting...');
      await startSslTunnelAndGet(t.tunnel!, 'https://localhost:' + port, 'http://test.acrolinx.com:8031', port, t.keys!, undefined);
      console.log(new Date().toISOString(), 'waiting finished');
    } catch (error) {
      console.log(new Date().toISOString(), 'error?');
      if ('DEPTH_ZERO_SELF_SIGNED_CERT' === error.code) {
        return true;
      }
      fail('Unexpected error: ' + error);
    }
    fail('expected self signed certificate error');
    return false;
  });

  it('to https', async () => {
    const port = randomPort();
    const data = await startSslTunnelAndGet(t.tunnel!, 'https://localhost:' + port,
      'https://test-ssl.acrolinx.com', port, t.keys!, t.certificates!.certificate);
    expect(data).to.contain('core');
    return true;
  });

  it('to https fails if no certificate', async () => {
    const port = randomPort();
    try {
      await startSslTunnelAndGet(t.tunnel!, 'https://localhost:' + port, 'https://test-ssl.acrolinx.com', port, t.keys!, undefined);
    } catch (error) {
      if ('DEPTH_ZERO_SELF_SIGNED_CERT' === error.code) {
        return true;
      }
      fail('Unexpected error: ' + error);
    }
    fail('expected self signed certificate error');
    return false;
  });
});
