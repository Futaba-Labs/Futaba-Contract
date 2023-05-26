# Futaba - Cross-chain query protocol

This repository contains Futaba endpoints and validation contracts.

Please refer to the [official documentation](https://futaba.gitbook.io/docs/introduction/futaba-introduction) for an overview of the protocol and how to develop it.

## Overview

Futaba is a protocol specialized for retrieving data from other chains.

Futaba will enable more secure and faster acquisition, collection, and computation of data from other chains, and in combination with messaging that sends data to other chains, will expand the possibilities for omni-chain Dapps, which still have few use cases.

## Development

### Setup

- copy the `.env.sample` to create the `.env` file
- fill in the required fields
  - `NETWORK_SCAN_KEY` is for validating the contract, so you don't need to enter it if you don't need it
- execute `yarn install`

### Testing

- execute `yarn test`

### Execute query

- If you want to run the query for now, you can use `yarn hardhat run --network <network_name> scripts/requestQuery.ts` to experience the query.
  - network currently supports `goerli`, `mumbai`, `optimism-goerli` and `arbiturm-goerli`
- If you want to run your own custom query, you can use `yarn hardhat TASK_QUERY --network <network_name> --params <params>`
  - `--params` sample
    - `'[{"dstChainId":5,"to":"0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43","height":8947355,"slot":"0x2cc437d98674a0b2b3c157dd747ad36fd3a3d188fad2a434e1300ef7ebabd265"}]'`
      - `dstChainId` is the id of the destination chain, `to` is the target contract address, `height` is the height of the block, and `slot` can be set to the slot of the target storage value
      - It is an array, so multiple pieces can be set

## Deployment

- There is code in `task/setup.ts` to deploy the contract together
- You can deploy them together by running `yarn hardhat TASK_SETUP_CONTRACT --network <network_name> --gateway true --client true --oracle true`
  - `--gateway`, `--client`, and `--oracle` can each be set to a bool value, and if deployment is not required, setting it to false will skip deployment
  - Deployed contract addresses are stored in `constants/deployments.json`
