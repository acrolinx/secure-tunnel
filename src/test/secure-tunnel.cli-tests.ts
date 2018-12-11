/* Copyright (c) 2018-present Acrolinx GmbH */

import {expect} from 'chai';
import chai = require('chai');
import 'chai-string';
import chaiString = require('chai-string');
import 'isomorphic-fetch';
import 'mocha';
import {URL} from 'url';
import {Cli} from '../ts/secure-tunnel.cli';
import {Tunnel} from '../ts/secure-tunnel.def';

chai.use(chaiString);

const parse = async (argsWithoutProcess: string[]) => {
  const args: string[] = ['/some/path/to/executible', '/some/path/to/executible'].concat(argsWithoutProcess);
  return await Cli.parse(args, process.env);
};

describe('command line arguments parsing of', () => {
  it('simple tunnel config', async () => {
    const config = await parse(['http://localhost:80->http://localhost:81']);

    const expectedTunnels: Tunnel[] = [{
      localUrl: new URL('http://localhost:80'),
      targetUrl: new URL('http://localhost:81')
    }];

    expect(config.tunnels).to.be.deep.equal(expectedTunnels);
    return true;
  });

  it('two tunnel config', async () => {
    const config = await parse(['http://localhost:80->http://localhost:81', 'https://localhost:443->https://localhost:8443']);

    const expectedTunnels: Tunnel[] = [{
      localUrl: new URL('http://localhost:80'),
      targetUrl: new URL('http://localhost:81')
    },
      {
        localUrl: new URL('https://localhost:443'),
        targetUrl: new URL('https://localhost:8443')
      }
    ];

    expect(config.tunnels).to.be.deep.equal(expectedTunnels);
    return true;
  });

  it('corrupt tunnel config is ignored 1', async () => {
    const config = await parse([
      'a->http://localhost:a',
      'http://localhost:80->http://localhost:81']);

    const expectedTunnels: Tunnel[] = [{
      localUrl: new URL('http://localhost:80'),
      targetUrl: new URL('http://localhost:81')
    }];

    expect(config.tunnels).to.be.deep.equal(expectedTunnels);
    return true;
  });
  it('corrupt tunnel config is ignored 2', async () => {
    const config = await parse(['http://localhost:800->http://localhost:810->http://localhost:811',
      'http://localhost:80->http://localhost:81',
    ]);

    const expectedTunnels: Tunnel[] = [{
      localUrl: new URL('http://localhost:80'),
      targetUrl: new URL('http://localhost:81')
    }];

    expect(config.tunnels).to.be.deep.equal(expectedTunnels);
    return true;
  });
  it('corrupt tunnel config is ignored 3', async () => {
    const config = await parse([
      'http://localhost:80->http://localhost:81',
      'http://localhost:80->']);

    const expectedTunnels: Tunnel[] = [{
      localUrl: new URL('http://localhost:80'),
      targetUrl: new URL('http://localhost:81')
    }];

    expect(config.tunnels).to.be.deep.equal(expectedTunnels);
    return true;
  });
  it('corrupt tunnel config is ignored 4', async () => {
    const config = await parse(['http://localhost:a->http://localhost:810',
      'http://localhost:80->http://localhost:81']);

    const expectedTunnels: Tunnel[] = [{
      localUrl: new URL('http://localhost:80'),
      targetUrl: new URL('http://localhost:81')
    }];

    expect(config.tunnels).to.be.deep.equal(expectedTunnels);
    return true;
  });

  it('-i sets info url', async () => {
    const config = await parse(['-i', 'http://localhost8000', 'http://localhost:1->http://localhost:2']);

    expect(config.infoUrl).to.be.deep.equal(new URL('http://localhost8000'));
    return true;
  });
  it('verbose default off', async () => {
    const config = await parse(['http://localhost:1->http://localhost:2']);

    expect(config.verbose).to.be.not.equal(true);
    return true;
  });

  it('-v sets turns verbose on', async () => {
    const config = await parse(['-v', 'http://localhost:1->http://localhost:2']);

    expect(config.verbose).to.be.equal(true);
    return true;
  });

  it('silent default off', async () => {
    const config = await parse(['http://localhost:1->http://localhost:2']);

    expect(config.silent).to.be.not.equal(true);
    return true;
  });
  it('-s turns silent mode on', async () => {
    const config = await parse(['-s', 'http://localhost:1->http://localhost:2']);

    expect(config.silent).to.be.equal(true);
    return true;
  });
});
