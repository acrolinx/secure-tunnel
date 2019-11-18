/* Copyright (c) 2018-present Acrolinx GmbH */

import {URL} from 'url';

// tslint:disable-next-line no-var-requires
const crypto = require('crypto');

export function hash(...urls: Array<URL | undefined>): string {
  const text = urls.map(u => u ? '' + u : '').join('');
  return hashString(text);
}

export function hashJson(obj: any): string {
  return hashString(JSON.stringify(obj));
}

function hashString(text: string): string {
  return crypto
    .createHash('md5')
    .update(text)
    .digest('hex')
    .substring(0, 8);
}

