// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import {IChainlinkLightClient} from "../interfaces/IChainlinkLightClient.sol";
import {ChainlinkOracle} from "../ChainlinkOracle.sol";
import {QueryType} from "../QueryType.sol";

/**
 * @title Chainlink Oracle Mock contract
 * @notice This is ChainlinkOracle contract when using Chainlink Node Operator
 */
contract OracleTestMock is ChainlinkOracle {
    constructor(
        address _tokenAddress,
        bytes32 _jobid,
        address _operator,
        uint256 _fee,
        address _lightClient
    ) ChainlinkOracle(_tokenAddress, _jobid, _operator, _fee, _lightClient) {}

    function fulfill(bytes32 _requestId, bytes memory payload) public override {
        QueryType.OracleResponse[] memory responses = abi.decode(
            payload,
            (QueryType.OracleResponse[])
        );
        if (lightClient == address(0)) revert InvalidLightClient();
        IChainlinkLightClient(lightClient).updateHeader(responses);
    }
}
