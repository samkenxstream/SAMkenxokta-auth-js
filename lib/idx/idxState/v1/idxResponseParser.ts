/*!
 * Copyright (c) 2021-Present, Okta, Inc. and/or its affiliates. All rights reserved.
 * The Okta software accompanied by this notice is provided pursuant to the Apache License, Version 2.0 (the "License.")
 *
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * See the License for the specific language governing permissions and limitations under the License.
 */

/* eslint-disable max-len */
// @ts-nocheck
import { OktaAuthInterface } from '../../../types';    // auth-js/types
import { generateRemediationFunctions } from './remediationParser';
import generateIdxAction from './generateIdxAction';
import { JSONPath } from 'jsonpath-plus';

const SKIP_FIELDS = Object.fromEntries([
  'remediation', // remediations are put into proceed/neededToProceed
  'context', // the API response of 'context' isn't externally useful.  We ignore it and put all non-action (contextual) info into idxState.context
].map( (field) => [ field, !!'skip this field' ] ));

export const parseNonRemediations = function parseNonRemediations( authClient: OktaAuthInterface, idxResponse, toPersist = {} ) {
  const actions = {};
  const context = {};

  Object.keys(idxResponse)
    .filter( field => !SKIP_FIELDS[field])
    .forEach( field => {
      const fieldIsObject = typeof idxResponse[field] === 'object' && !!idxResponse[field];

      if ( !fieldIsObject ) {
        // simple fields are contextual info
        context[field] = idxResponse[field];
        return;
      }

      if ( idxResponse[field].rel ) {
        // top level actions
        actions[idxResponse[field].name] = generateIdxAction(authClient, idxResponse[field], toPersist);
        return;
      }

      const { value: fieldValue, type, ...info} = idxResponse[field];
      context[field] = { type, ...info}; // add the non-action parts as context

      if ( type !== 'object' ) {
        // only object values hold actions
        context[field].value = fieldValue;
        return;
      }

      // We are an object field containing an object value
      context[field].value = {};
      Object.entries(fieldValue)
        .forEach( ([subField, value]) => {
          if (value.rel) { // is [field].value[subField] an action?
            // add any "action" value subfields to actions
            actions[`${field}-${subField.name || subField}`] = generateIdxAction(authClient, value, toPersist);
          } else {
            // add non-action value subfields to context
            context[field].value[subField] = value;
          }
        });
    });

  return { context, actions };
};

const expandRelatesTo = (idxResponse, value) => {
  Object.keys(value).forEach(k => {
    if (k === 'relatesTo') {
      const query = Array.isArray(value[k]) ? value[k][0] : value[k];
      if (typeof query === 'string') {
        // eslint-disable-next-line new-cap
        const result = JSONPath({ path: query, json: idxResponse })[0];
        if (result) {
          value[k] = result;
          return;
        }
      }
    }
    if (Array.isArray(value[k])) {
      value[k].forEach(innerValue => expandRelatesTo(idxResponse, innerValue));
    }
  });
};

const convertRemediationAction = (remediation, toPersist) => {
  const remediationActions = generateRemediationFunctions( [remediation], toPersist );
  const actionFn = remediationActions[remediation.name];
  return {
    ...remediation,
    action: actionFn,
  };
};

export const parseIdxResponse = function parseIdxResponse( authClient: OktaAuthInterface, idxResponse, toPersist = {} ): {
  remediations: IdxRemediation[];
  context: IdxContext;
  actions: IdxActions;
} {
  const remediationData = idxResponse.remediation?.value || [];

  remediationData.forEach(
    remediation => expandRelatesTo(idxResponse, remediation)
  );

  const remediations = remediationData.map(remediation => convertRemediationAction( remediation, toPersist ));

  const { context, actions } = parseNonRemediations( authClient, idxResponse, toPersist );

  return {
    remediations,
    context,
    actions,
  };
};
