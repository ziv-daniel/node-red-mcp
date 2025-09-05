/**
 * Test script for Polkadot Pallet Documentation functionality
 * Run this with Node.js to test the MCP server tools
 */

import { readFileSync } from 'fs';

// Example MCP tool calls for testing
const testCalls = [
  {
    name: 'get_polkadot_chains',
    description: 'Get available Polkadot chains',
    params: {},
  },
  {
    name: 'get_pallets_list',
    description: 'Get pallets from Polkadot mainnet',
    params: {
      chainName: 'polkadot',
    },
  },
  {
    name: 'get_pallet_details',
    description: 'Get details for Balances pallet',
    params: {
      palletName: 'Balances',
      chainName: 'polkadot',
    },
  },
  {
    name: 'search_pallets',
    description: 'Search for staking-related pallets',
    params: {
      query: 'staking',
      chainName: 'polkadot',
    },
  },
];

console.log('🔗 Polkadot Pallet Documentation Test Cases');
console.log('='.repeat(50));

testCalls.forEach((testCall, index) => {
  console.log(`\n${index + 1}. ${testCall.description}`);
  console.log(`Tool: ${testCall.name}`);
  console.log(`Parameters:`, JSON.stringify(testCall.params, null, 2));
});

console.log('\n📋 Usage Instructions:');
console.log('1. Start the MCP server: npm run dev');
console.log('2. Use an MCP client to call these tools');
console.log('3. Or test via the HTTP API endpoints');

console.log('\n🌐 Available Endpoints:');
console.log('- wss://rpc.polkadot.io (Polkadot mainnet)');
console.log('- wss://kusama-rpc.polkadot.io (Kusama canary network)');
console.log('- wss://westend-rpc.polkadot.io (Westend testnet)');

console.log('\n📚 Documentation Sources:');
console.log('- Runtime Metadata: Live from blockchain RPC');
console.log('- Pallet Docs: https://docs.rs/pallet-{name}/latest/');
console.log('- Official Guide: https://docs.polkadot.com/develop/parachains/');

console.log('\n✨ Features:');
console.log('- ✓ Real-time metadata from any Substrate chain');
console.log('- ✓ Cached responses for better performance');
console.log('- ✓ Support for multiple networks');
console.log('- ✓ Detailed pallet information');
console.log('- ✓ Search functionality');
console.log('- ✓ External documentation links');
