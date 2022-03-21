/*!
 * Copyright (c) 2021, Okta, Inc. and/or its affiliates. All rights reserved.
 * The Okta software accompanied by this notice is provided pursuant to the Apache License, Version 2.0 (the "License.")
 *
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { makeIdxState, validateVersionConfig } from './idxState';
import { OktaAuthInterface } from '../types';
import { IdxResponse, isRawIdxResponse } from './types/idx-js';
import { getOAuthDomain } from '../oidc';
import { IDX_API_VERSION } from '../constants';
import { httpRequest } from '../http';

export interface IntrospectOptions {
  withCredentials?: boolean;
  interactionHandle?: string;
  stateHandle?: string;
  version?: string;
}

export async function introspect (
  authClient: OktaAuthInterface, 
  options: IntrospectOptions = {}
): Promise<IdxResponse> {
  // try load from storage first
  let rawIdxResponse = authClient.transactionManager.loadIdxResponse();
  
  // call idx.introspect if no existing idx response available in storage
  if (!rawIdxResponse) {
    const version = options.version || IDX_API_VERSION;
    const domain = getOAuthDomain(authClient);
    const { withCredentials, interactionHandle, stateHandle } = options;
    try {
      validateVersionConfig(version);
      const url = `${domain}/idp/idx/introspect`;
      const body = stateHandle ? { stateToken: stateHandle } : { interactionHandle };
      const headers = {
        'content-type': `application/ion+json; okta-version=${version}`, // Server wants this version info
        accept: `application/ion+json; okta-version=${version}`,
      };
      rawIdxResponse = await httpRequest(authClient, {
        method: 'POST',
        url,
        headers,
        withCredentials,
        args: body
      });
    } catch (err) {
      if (isRawIdxResponse(err)) {
        rawIdxResponse = err;
      } else {
        throw err;
      }
    }
  }

  const { withCredentials } = options;
  return makeIdxState(authClient, rawIdxResponse!, { withCredentials });
}
