import * as http from 'http';

export const BLOCK_WITHOUT_REQUIRED_COOKIE_CLI_OPTION = 'block_without_required_cookie';
export const BLOCK_WITHOUT_REQUIRED_COOKIE_CLI_OPTION_DESCRIPTION =
  'helps to test clients that use CORS with credentials';

export const REQUIRED_COOKIE = 'acrolinxSecureTunnelRequiredCookie=yes';
export const REQUIRED_COOKIE_WITH_PATH = REQUIRED_COOKIE + '; Path=/';
export const SET_REQUIRED_COOKIE_PATH = '/set-required-cookie';

/**
 * @return returns true if the request is blocked (handled) and should not be proxied.
 */
export function blockWithoutRequiredCookie(proxyReq: http.ClientRequest,
                                           req: http.IncomingMessage,
                                           res: http.ServerResponse): boolean {
  const cookies = req.headers.cookie;
  const isRequiredCookieSet = !!cookies && cookies.includes(REQUIRED_COOKIE);

  if (req.url === SET_REQUIRED_COOKIE_PATH) {
    renderSetCookiePage(res, isRequiredCookieSet);
    proxyReq.abort();
    return true;
  }

  if (!isRequiredCookieSet && req.method !== 'OPTIONS') {
    renderMissingCookiePage(res);
    proxyReq.abort();
    return true;
  }

  return false;
}


function renderSetCookiePage(res: http.ServerResponse, isRequiredCookieSet: boolean) {
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'set-cookie': REQUIRED_COOKIE_WITH_PATH
  });

  res.end(`
      <html>
        <head><title>Set required cookie</title></head>
        <p>Required cookie = <q>${REQUIRED_COOKIE}</q></p>
        <p>
        ${isRequiredCookieSet ? 'Required cookie is set.' : 'Required cookie should be set now. (Reload to verify)'}
        </p>
      </html>
    `);
}

function renderMissingCookiePage(res: http.ServerResponse) {
  res.writeHead(401, {'Content-Type': 'text/html'});

  res.end(`
    <html>
      <head><title>Missing required cookie</title></head>
      Required cookie (<q>${REQUIRED_COOKIE}</q>) is missing,
      please visit <a href="${SET_REQUIRED_COOKIE_PATH}">${SET_REQUIRED_COOKIE_PATH}</a> first.
    </html>
    `);
}
