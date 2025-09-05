/**
 * Polkadot Pallet Documentation Service
 * Fetches and provides documentation for Polkadot/Substrate pallets
 */

import WebSocket from 'ws';

export interface PalletInfo {
  name: string;
  index: number;
  description?: string;
  storage?: StorageItem[];
  calls?: CallInfo[];
  events?: EventInfo[];
  errors?: ErrorInfo[];
  constants?: ConstantInfo[];
}

export interface StorageItem {
  name: string;
  modifier: string;
  type: any;
  documentation: string[];
}

export interface CallInfo {
  name: string;
  args: ArgumentInfo[];
  documentation: string[];
}

export interface EventInfo {
  name: string;
  arguments: string[];
  documentation: string[];
}

export interface ErrorInfo {
  name: string;
  documentation: string[];
}

export interface ConstantInfo {
  name: string;
  type: string;
  value: string;
  documentation: string[];
}

export interface ArgumentInfo {
  name: string;
  type: string;
}

export interface ChainInfo {
  name: string;
  version: string;
  pallets: PalletInfo[];
}

export interface PolkadotDocsConfig {
  timeout: number;
  retries: number;
  defaultEndpoints: {
    polkadot: string;
    kusama: string;
    westend: string;
  };
}

export class PolkadotDocsService {
  private config: PolkadotDocsConfig;
  private metadataCache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 300000; // 5 minutes

  constructor(config: Partial<PolkadotDocsConfig> = {}) {
    this.config = {
      timeout: config.timeout || 10000,
      retries: config.retries || 3,
      defaultEndpoints: {
        polkadot: 'wss://rpc.polkadot.io',
        kusama: 'wss://kusama-rpc.polkadot.io',
        westend: 'wss://westend-rpc.polkadot.io',
        ...config.defaultEndpoints,
      },
    };
  }

  /**
   * Get available Polkadot chains with their default endpoints
   */
  getAvailableChains(): {
    name: string;
    endpoint: string;
    description: string;
  }[] {
    return [
      {
        name: 'polkadot',
        endpoint: this.config.defaultEndpoints.polkadot,
        description: 'Polkadot Relay Chain - Main network',
      },
      {
        name: 'kusama',
        endpoint: this.config.defaultEndpoints.kusama,
        description: "Kusama Canary Network - Polkadot's canary network",
      },
      {
        name: 'westend',
        endpoint: this.config.defaultEndpoints.westend,
        description: 'Westend Testnet - Polkadot testnet',
      },
    ];
  }

  /**
   * Connect to a Polkadot/Substrate node and fetch metadata
   */
  async fetchRuntimeMetadata(endpoint: string): Promise<any> {
    const cacheKey = endpoint;

    // Check cache first
    if (
      this.metadataCache.has(cacheKey) &&
      this.cacheExpiry.has(cacheKey) &&
      Date.now() < this.cacheExpiry.get(cacheKey)!
    ) {
      return this.metadataCache.get(cacheKey);
    }

    let ws: WebSocket | null = null;
    let requestId = 1;

    try {
      // Create WebSocket connection
      ws = new WebSocket(endpoint);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (ws) ws.close();
          reject(new Error(`Connection timeout to ${endpoint}`));
        }, this.config.timeout);

        ws!.on('open', () => {
          // Request metadata
          const request = {
            id: requestId,
            jsonrpc: '2.0',
            method: 'state_getMetadata',
            params: [],
          };

          ws!.send(JSON.stringify(request));
        });

        ws!.on('message', (data: Buffer) => {
          clearTimeout(timeout);

          try {
            const response = JSON.parse(data.toString());

            if (response.error) {
              reject(new Error(`RPC error: ${response.error.message}`));
              return;
            }

            if (response.id === requestId && response.result) {
              const metadata = this.parseMetadata(response.result);

              // Cache the result
              this.metadataCache.set(cacheKey, metadata);
              this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);

              resolve(metadata);
            }
          } catch (error) {
            reject(new Error(`Failed to parse metadata response: ${error}`));
          }
        });

        ws!.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`WebSocket error: ${error.message}`));
        });

        ws!.on('close', (code, reason) => {
          clearTimeout(timeout);
          if (code !== 1000) {
            reject(new Error(`Connection closed with code ${code}: ${reason}`));
          }
        });
      });
    } catch (error) {
      throw new Error(`Failed to connect to ${endpoint}: ${error}`);
    } finally {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
  }

  /**
   * Parse raw metadata hex string into structured data
   */
  private parseMetadata(metadataHex: string): ChainInfo {
    try {
      // Remove '0x' prefix if present
      const cleanHex = metadataHex.startsWith('0x')
        ? metadataHex.slice(2)
        : metadataHex;

      // For now, return a basic structure - in a real implementation,
      // you'd use a proper SCALE decoder like @polkadot/types
      return {
        name: 'Unknown Chain',
        version: 'Unknown',
        pallets: this.extractBasicPalletInfo(cleanHex),
      };
    } catch (error) {
      throw new Error(`Failed to parse metadata: ${error}`);
    }
  }

  /**
   * Extract basic pallet information from metadata
   * Note: This is a simplified implementation. For production use,
   * you should use @polkadot/types or similar library for proper SCALE decoding
   */
  private extractBasicPalletInfo(metadataHex: string): PalletInfo[] {
    // This is a placeholder implementation
    // In a real implementation, you would decode the SCALE-encoded metadata
    const commonPallets = [
      'System',
      'Scheduler',
      'Preimage',
      'Babe',
      'Timestamp',
      'Indices',
      'Balances',
      'TransactionPayment',
      'Authorship',
      'Staking',
      'Session',
      'Democracy',
      'Council',
      'TechnicalCommittee',
      'PhragmenElection',
      'TechnicalMembership',
      'Grandpa',
      'Treasury',
      'Sudo',
      'ImOnline',
      'AuthorityDiscovery',
      'Offences',
      'Historical',
      'RandomnessCollectiveFlip',
      'Identity',
      'Society',
      'Recovery',
      'Vesting',
      'Scheduler',
      'Proxy',
      'Multisig',
      'Bounties',
      'Tips',
      'Assets',
      'Mmr',
      'Lottery',
      'Nfts',
      'Uniques',
      'Utility',
      'Conviction Voting',
      'Referenda',
      'Origins',
      'Whitelist',
    ];

    return commonPallets.map((name, index) => ({
      name,
      index,
      description: `${name} pallet - Core blockchain functionality`,
      storage: [],
      calls: [],
      events: [],
      errors: [],
      constants: [],
    }));
  }

  /**
   * Get list of pallets for a specific chain
   */
  async getPalletsList(endpoint: string): Promise<PalletInfo[]> {
    const metadata = await this.fetchRuntimeMetadata(endpoint);
    return metadata.pallets || [];
  }

  /**
   * Get detailed information about a specific pallet
   */
  async getPalletDetails(
    endpoint: string,
    palletName: string,
  ): Promise<PalletInfo | null> {
    const pallets = await this.getPalletsList(endpoint);
    const pallet = pallets.find(
      (p) => p.name.toLowerCase() === palletName.toLowerCase(),
    );

    if (!pallet) {
      return null;
    }

    // Enhance with external documentation if available
    const externalDocs = await this.fetchExternalDocs(palletName);
    if (externalDocs) {
      pallet.description = externalDocs.description || pallet.description;
    }

    return pallet;
  }

  /**
   * Search for pallets by name or functionality
   */
  async searchPallets(endpoint: string, query: string): Promise<PalletInfo[]> {
    const pallets = await this.getPalletsList(endpoint);
    const searchTerm = query.toLowerCase();

    return pallets.filter(
      (pallet) =>
        pallet.name.toLowerCase().includes(searchTerm) ||
        (pallet.description &&
          pallet.description.toLowerCase().includes(searchTerm)),
    );
  }

  /**
   * Get pallet documentation from external sources (crates.io, etc.)
   */
  private async fetchExternalDocs(palletName: string): Promise<any> {
    try {
      // This would fetch from crates.io API or docs.polkadot.com
      // For now, return some example documentation
      const knownPallets: { [key: string]: any } = {
        Balances: {
          description:
            'The Balances pallet provides functionality for handling accounts and balances, including getting and setting free balances, retrieving total, reserved and unreserved balances, transferring balances between accounts, and managing locks.',
          crateUrl: 'https://docs.rs/pallet-balances/latest/pallet_balances/',
        },
        System: {
          description:
            'The System pallet provides low-level access to core types and cross-cutting utilities. It acts as the base layer for other pallets to interact with the Substrate framework components.',
          crateUrl: 'https://docs.rs/frame-system/latest/frame_system/',
        },
        Timestamp: {
          description:
            'The Timestamp pallet provides functionality to get and set the on-chain time. It is used by other pallets that need to query the current time.',
          crateUrl: 'https://docs.rs/pallet-timestamp/latest/pallet_timestamp/',
        },
        Scheduler: {
          description:
            'The Scheduler pallet exposes capabilities for scheduling dispatches to occur at a specified block number or at a specified period. These scheduled dispatches may be named or anonymous and may be canceled.',
          crateUrl: 'https://docs.rs/pallet-scheduler/latest/pallet_scheduler/',
        },
      };

      return knownPallets[palletName] || null;
    } catch (error) {
      console.warn(`Failed to fetch external docs for ${palletName}:`, error);
      return null;
    }
  }

  /**
   * Get documentation for common pallet functions
   */
  getPalletExamples(palletName: string): { [key: string]: string } | null {
    const examples: { [key: string]: { [key: string]: string } } = {
      Balances: {
        transfer: 'Transfer tokens from one account to another',
        transfer_keep_alive:
          'Transfer tokens but keep the sender account alive (above existential deposit)',
        set_balance: 'Set the balance of an account (sudo only)',
        force_transfer: 'Transfer tokens between any two accounts (sudo only)',
      },
      System: {
        remark: 'Make an on-chain remark (store arbitrary data)',
        set_heap_pages:
          "Set the number of pages in the WebAssembly environment's heap",
        set_code: 'Set the new runtime code (for runtime upgrades)',
        kill_storage: 'Kill some items from storage',
      },
      Staking: {
        bond: 'Take the origin account as a stash and lock up value of its balance',
        bond_extra:
          'Add some extra amount that have appeared in the stash free balance',
        unbond:
          'Schedule a portion of the stash to be unlocked ready for transfer',
        nominate:
          'Declare the desire to nominate targets for the origin controller',
      },
    };

    return examples[palletName] || null;
  }
}
