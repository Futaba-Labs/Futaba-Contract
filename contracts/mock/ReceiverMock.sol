// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {IReceiver} from "../interfaces/IReceiver.sol";
import {IGateway} from "../interfaces/IGateway.sol";
import {QueryType} from "../QueryType.sol";

/**
 * @title ReceiverMock contract
 * @notice This contract receives queries
 * @notice NOT AUDITED
 */
contract ReceiverMock is IReceiver {
    event QueryReceived(
        bytes32 queryId,
        bytes[] results,
        QueryType.QueryRequest[] queries,
        bytes message
    );

    address public gateway;

    constructor(address _gateway) {
        gateway = _gateway;
    }

    function sendQuery(
        QueryType.QueryRequest[] memory queries,
        address lightClient,
        bytes memory message
    ) external payable {
        IGateway(gateway).query{value: msg.value}(
            queries,
            lightClient,
            address(this), // callback address
            message
        );
    }

    function receiveQuery(
        bytes32 queryId,
        bytes[] memory results,
        QueryType.QueryRequest[] memory queries,
        bytes memory message
    ) external {
        emit QueryReceived(queryId, results, queries, message);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId;
    }
}
