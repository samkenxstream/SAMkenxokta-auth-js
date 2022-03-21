/*!
 * Copyright (c) 2015-present, Okta, Inc. and/or its affiliates. All rights reserved.
 * The Okta software accompanied by this notice is provided pursuant to the Apache License, Version 2.0 (the "License.")
 *
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * 
 * See the License for the specific language governing permissions and limitations under the License.
 */


import { RawIdxResponseFactory } from '@okta/test.support/idx';
import { introspect } from '../../../lib/idx/introspect';

jest.mock('../../../lib/http', () => {
  const actual = jest.requireActual('../../../lib/http');
  return {
    ...actual,
    httpRequest: () => {}
  };
});

jest.mock('../../../lib/idx/idxState', () => {
  return jest.requireActual('../../../lib/idx/idxState');
});

jest.mock('../../../lib/oidc', () => {
  return {
    getOAuthDomain: () => {}
  };
});

const mocked = {
  idxState: require('../../../lib/idx/idxState'),
  http: require('../../../lib/http'),
  oidc: require('../../../lib/oidc')
};

describe('idx/introspect', () => {
  let testContext;
  beforeEach(() => {
    const authClient = {
      transactionManager: {
        loadIdxResponse: () => {}
      }
    };

    const introspectOptions = {
      interactionHandle: 'interaction-handle'
    };

    jest.spyOn(mocked.oidc, 'getOAuthDomain').mockReturnValue('mock-domain');

    testContext = {
      authClient,
      introspectOptions
    };
  });

  it('returns idxResponse from storage if it exists', async () => {
    const { authClient, introspectOptions } = testContext;
    jest.spyOn(mocked.http, 'httpRequest');
    const rawIdxResponse = RawIdxResponseFactory.build();
    authClient.transactionManager.loadIdxResponse = jest.fn().mockReturnValue(rawIdxResponse);
    const res = await introspect(authClient, introspectOptions);
    expect(authClient.transactionManager.loadIdxResponse).toHaveBeenCalled();
    expect(mocked.http.httpRequest).not.toHaveBeenCalled();
    expect(res.rawIdxState).toEqual(rawIdxResponse);
  });

  it('calls idx.introspect when idx states not in storage', async () => {
    const { authClient, introspectOptions } = testContext;
    const rawIdxResponse = RawIdxResponseFactory.build();
    jest.spyOn(mocked.http, 'httpRequest').mockResolvedValue(rawIdxResponse);
    authClient.transactionManager.loadIdxResponse = jest.fn().mockReturnValue(null);
    const res = await introspect(authClient, introspectOptions);
    expect(authClient.transactionManager.loadIdxResponse).toHaveBeenCalled();
    expect(mocked.http.httpRequest).toHaveBeenCalledWith(authClient, {
      url: 'mock-domain/idp/idx/introspect',
      method: 'POST',
      headers: {
        'accept': 'application/ion+json; okta-version=1.0.0',
        'content-type': 'application/ion+json; okta-version=1.0.0'
      },
      args: {
        interactionHandle: 'interaction-handle',
      }
    });
    expect(res.rawIdxState).toEqual(rawIdxResponse);
  });

  it('on IDX error, calls makeIdxState to return a wrapped idxResponse', async () => {
    const { authClient, introspectOptions } = testContext;
    const rawIdxResponse = RawIdxResponseFactory.build();
    jest.spyOn(mocked.http, 'httpRequest').mockRejectedValueOnce(rawIdxResponse);
    jest.spyOn(mocked.idxState, 'makeIdxState');
    authClient.transactionManager.loadIdxResponse = jest.fn().mockReturnValue(null);
    const res = await introspect(authClient, introspectOptions);
    expect(authClient.transactionManager.loadIdxResponse).toHaveBeenCalled();
    expect(mocked.http.httpRequest).toHaveBeenCalledWith(authClient, {
      url: 'mock-domain/idp/idx/introspect',
      method: 'POST',
      headers: {
        'accept': 'application/ion+json; okta-version=1.0.0',
        'content-type': 'application/ion+json; okta-version=1.0.0'
      },
      args: {
        interactionHandle: 'interaction-handle',
      }
    });
    expect(mocked.idxState.makeIdxState).toHaveBeenCalled();
    expect(res.rawIdxState).toEqual(rawIdxResponse);
  });

  it('on non-IDX error, the error is thrown', async () => {
    const { authClient, introspectOptions } = testContext;
    const error = new Error('test error');
    jest.spyOn(mocked.http, 'httpRequest').mockRejectedValueOnce(error);
    jest.spyOn(mocked.idxState, 'makeIdxState');
    authClient.transactionManager.loadIdxResponse = jest.fn().mockReturnValue(null);
    await expect(introspect(authClient, introspectOptions)).rejects.toEqual(error);
    expect(authClient.transactionManager.loadIdxResponse).toHaveBeenCalled();
    expect(mocked.http.httpRequest).toHaveBeenCalledWith(authClient, {
      url: 'mock-domain/idp/idx/introspect',
      method: 'POST',
      headers: {
        'accept': 'application/ion+json; okta-version=1.0.0',
        'content-type': 'application/ion+json; okta-version=1.0.0'
      },
      args: {
        interactionHandle: 'interaction-handle',
      }
    });
    expect(mocked.idxState.makeIdxState).not.toHaveBeenCalled();
  });
});
