import assert from 'assert';
import TestApp from '../pageobjects/TestApp';
import OktaHome from '../pageobjects/OktaHome';
import OktaLogin from '../pageobjects/OktaLogin';
import { flows, openImplicit, openPKCE } from '../util/appUtils';
import { loginPopup } from '../util/loginUtils';
import { openOktaHome, switchToMainWindow } from '../util/browserUtils';

const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

// Refresh tokens are tested in a separate file
const scopes = ['openid', 'email']; // do not include "offline_access"

describe('token revoke', () => {
  it('can revoke the access token', async () => {
    await openPKCE({ scopes });
    await loginPopup();
    
    // We should be able to request and display user info with no errors
    await TestApp.getUserInfo();
    await TestApp.assertUserInfo();

    // Revoke the token
    await TestApp.revokeToken();
    await browser.waitUntil(async () => {
      const txt = await TestApp.tokenMsg.then(el => el.getText());
      return txt !== '';
    }, 10000, 'wait for token message');
    const txt = await TestApp.tokenMsg.then(el => el.getText());
    assert(txt === 'access token revoked');

    // Now if we try to get user info, we should receive an error
    await TestApp.getUserInfo();
    await TestApp.error.then(el => el.waitForExist(15000, false, 'wait for error'));
    const error = await TestApp.error.then(el => el.getText());
    assert(error === 'Error: Missing tokens');

    await TestApp.logoutRedirect();
  });
});

describe('PKCE flow', () => {
  it('encounters an error when authorization code is expired', async () => {
    await openPKCE({ scopes });
    await TestApp.loginRedirect();
    await OktaLogin.signin(USERNAME, PASSWORD);
    await browser.waitUntil(async () => {
      return new Promise(resolve => setTimeout(() => resolve('ok'), 65000));
    }, {timeout: 70000});
    await TestApp.handleCallbackBtn.then(el => el.click());
    await (await (TestApp.xhrError).getText()).then(msg => {
      assert(msg.trim() === 'Authorization code is invalid or expired.');
    });
  });
});

describe('E2E token flows', () => {

  flows.forEach(flow => {
    describe(flow + ' flow', () => {

      async function login(options) {
        options = Object.assign({
          scopes
        }, options);
        (flow === 'pkce') ? await openPKCE(options) : await openImplicit(options);
        await loginPopup(flow);
      }

      it('can renew the access token', async () => {
        await login();
        const prevToken = await TestApp.accessToken.then(el => el.getText());
        await TestApp.renewToken();
        await browser.waitUntil(async () => {
          const txt = await TestApp.accessToken.then(el => el.getText());
          return txt !== prevToken;
        }, 10000);
        await TestApp.assertLoggedIn();
        await TestApp.logoutRedirect();
      });

      it('can refresh all tokens', async () => {
        await login();
        const prev = {
          idToken: await TestApp.idToken.then(el => el.getText()),
          accessToken: await TestApp.accessToken.then(el => el.getText())
        };
        await TestApp.getToken();
        await browser.waitUntil(async () => {
          const idToken = await TestApp.idToken.then(el => el.getText());
          const accessToken = await TestApp.accessToken.then(el => el.getText());
          return (
            idToken !== prev.idToken &&
            accessToken !== prev.accessToken
          );
        }, 10000);
        await TestApp.assertLoggedIn();
        await TestApp.logoutRedirect();
      });

      it('Can receive an error on token renew if user has signed out from Okta page', async () => {
        await login();
        await TestApp.subscribeToTokenEvents();
        let tokenError = await TestApp.tokenError.then(el => el.getText());
        assert(tokenError.trim() === '');
        await openOktaHome();
        await OktaHome.signOut();
        await browser.closeWindow();
        await switchToMainWindow();
        await TestApp.renewToken();
        await browser.waitUntil(async () => {
          const txt = await TestApp.tokenError.then(el => el.getText());
          return txt !== tokenError;
        }, 10000, 'wait for token error');
        await TestApp.tokenError.then(el => el.getText()).then(msg => {
          assert(msg.trim() === 'OAuthError: The client specified not to prompt, but the user is not logged in.');
        });
        await TestApp.clearTokens();
        await browser.refresh();
        await TestApp.waitForLoginBtn(); // assert we are logged out
      });
    });
  });
});