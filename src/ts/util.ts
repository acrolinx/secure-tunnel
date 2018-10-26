/* Copyright (c) 2018-present Acrolinx GmbH */

import { Url } from "url";
let crypto = require("crypto");

export function hash(...urls: (Url | undefined)[]): string {
    const text = urls.map(u => u ? "" + u : "").join("");
    return crypto
        .createHash("md5")
        .update(text)
        .digest("hex")
        .substring(0, 8);
}
