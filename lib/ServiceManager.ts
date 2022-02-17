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


/* global window */
import {
  TokenManagerOptions,
  ServiceManagerInterface
} from './types';
import { TokenManager } from './TokenManager';
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector
} from 'broadcast-channel';
import { TokenService, AutoRenewService, SyncStorageService } from './services';

export class ServiceManager implements ServiceManagerInterface {
  protected tokenManager: TokenManager;
  protected options: TokenManagerOptions;
  private services: Map<string, TokenService>;
  private channel: BroadcastChannel;
  private elector: LeaderElector;
  private started: boolean;

  private static knownServices = ['autoRenew', 'syncStorage'];

  constructor(tokenManager: TokenManager, options: TokenManagerOptions = {}) {
    this.started = false;
    this.tokenManager = tokenManager;
    this.options = options;
    this.services = new Map();

    // Start elector
    this.channel = new BroadcastChannel(options.broadcastChannelName as string);
    this.elector = createLeaderElection(this.channel);
    this.elector.onduplicate = this.onLeaderDuplicate.bind(this);
    this.elector.awaitLeadership().then(this.onLeader.bind(this));
  }

  private onLeader() {
    if (this.started) {
      // Start services that requires leadership
      this.startServices();
    }
  }

  private onLeaderDuplicate() {
  }

  isLeader() {
    return this.elector.isLeader;
  }

  hasLeader() {
    return this.elector.hasLeader;
  }

  start() {
    if (this.started) {
      this.stop();
    }
    this.startServices();
    this.started = true;
  }
  
  stop() {
    this.stopServices();
    this.started = false;
  }

  getService(name: string): TokenService | undefined {
    return this.services.get(name);
  }

  private stopServices() {
    for (const srv of this.services.values()) {
      srv.stop();
    }
    this.services = new Map();
  }

  private startServices() {
    for (const name of ServiceManager.knownServices) {
      const srv = this.createService(name);
      if (srv) {
        const canStart = srv.canStart() && !srv.isStarted() && (srv.requiresLeadership() ? this.isLeader() : true);
        if (canStart) {
          srv.start();
          this.services.set(name, srv);
        }
      }
    }
  }

  private createService(name: string): TokenService | undefined {
    let service: TokenService | undefined;
    switch (name) {
      case 'autoRenew':
        service = new AutoRenewService(this.tokenManager, this.options);
        break;
      case 'syncStorage':
        service = new SyncStorageService(this.tokenManager, this.options);
        break;
      default:
        throw new Error(`Unknown service ${name}`);
    }
    return service;
  }

}
