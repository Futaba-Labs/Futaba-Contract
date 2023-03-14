// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./interfaces/IGateway.sol";
import "./interfaces/ILightClient.sol";
import "./interfaces/IReceiver.sol";
import "./QueryType.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Gateway is IGateway, Ownable {
    uint64 public nonce;

    mapping(bytes32 => bytes) public resultStore;

    mapping(bytes32 => QueryType.QueryRequest[]) public queryStore;

    constructor() {
        nonce = 1;
    }

    function query(
        QueryType.QueryRequest[] memory queries,
        address lightClient,
        address callBack,
        bytes calldata message
    ) external payable {
        for (uint i = 0; i < queries.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            require(
                q.to != address(0x0),
                "Futaba: Invalid target contract zero address"
            );
        }

        require(
            lightClient != address(0x0),
            "Futaba: Invalid light client contract"
        );

        require(callBack != address(0x0), "Futaba: Invalid callback contract");

        bytes memory encodedPayload = abi.encode(
            callBack,
            queries,
            message,
            lightClient
        );
        bytes32 queryId = keccak256(abi.encode(encodedPayload, nonce));
        emit Packet(
            _msgSender(),
            queryId,
            encodedPayload,
            message,
            lightClient,
            callBack
        );
        QueryType.QueryRequest[] storage requests = queryStore[queryId];
        for (uint i = 0; i < queries.length; i++) {
            requests.push(queries[i]);
        }
        nonce++;

        ILightClient lc = ILightClient(lightClient);
        lc.requestQuery(queries);
    }

    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable {
        require(
            response.lightClient != address(0x0),
            "Futaba: Invalid light client contract"
        );

        bytes32 queryId = response.queryId;
        QueryType.QueryRequest[] memory queries = queryStore[queryId];
        require(queries.length > 0, "Futaba: Invalid query id");

        ILightClient lightClient = ILightClient(response.lightClient);
        (bool success, bytes[] memory results) = lightClient.verify(
            response.proof
        );
        require(success, "Futaba: Invalid proof");

        IReceiver callBack = IReceiver(response.callBack);
        callBack.receiveQuery(results, queries, response.packet);
    }
}
