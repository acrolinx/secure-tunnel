/* Copyright (c) 2018-present Acrolinx GmbH */

import {assert} from 'chai';
import chai = require('chai');
import 'chai-string';
import chaiString = require('chai-string');
import 'isomorphic-fetch';
import 'mocha';
import {
  REQUIRED_COOKIE,
  REQUIRED_COOKIE_WITH_PATH,
  SET_REQUIRED_COOKIE_PATH
} from '../ts/block-without-required-cookie';
import {SecureTunnel} from '../ts/secure-tunnel.net';
import {SERVICE_NAMES_PATH, startSimpleTunnelAndFetch} from './test-utils/test-utils';

chai.use(chaiString);

describe('block-without-required-cookie', () => {
  let tunnel: SecureTunnel;

  beforeEach(() => {
    tunnel = new SecureTunnel({
      silent: false,
      verbose: true,
      requests: true,
      blockWithoutRequiredCookie: true
    });
  });

  it('blocks if required cookie is not set', async () => {
    const result = await startSimpleTunnelAndFetch(tunnel, SERVICE_NAMES_PATH);

    assert.equal(result.status, 401);
    const resultText = await result.text();
    assert.containIgnoreCase(resultText, SET_REQUIRED_COOKIE_PATH);
  });

  it('get required cookie', async () => {
    const result = await startSimpleTunnelAndFetch(tunnel, SET_REQUIRED_COOKIE_PATH);

    assert.equal(result.status, 200);
    const cookie = result.headers.get('set-cookie');
    assert.equal(cookie, REQUIRED_COOKIE_WITH_PATH);
  });

  it('does not block if required cookie is set', async () => {
    const result = await startSimpleTunnelAndFetch(tunnel, SERVICE_NAMES_PATH, {
      headers: {Cookie: REQUIRED_COOKIE}
    });

    assert.equal(result.status, 200);
  });

  afterEach(() => {
    if (tunnel) {
      tunnel.close();
    }
  });
});
