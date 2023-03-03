// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./interfaces/IGateway.sol";
import "./interfaces/ILightClient.sol";
import "./interfaces/IReceiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Gateway is IGateway, Ownable {
    uint64 public nonce;

    mapping(bytes32 => bytes) public resultStore;

    mapping(bytes32 => QueryRequest[]) public queryStore;

    constructor() {
        nonce = 1;
    }

    function query(
        QueryRequest[] memory queries,
        address ligthClient,
        address callBack,
        bytes calldata message
    ) external payable {
        for (uint i = 0; i < queries.length; i++) {
            QueryRequest memory q = queries[i];
            require(
                q.to != address(0x0),
                "Futaba: Invalid target contract zero address"
            );
        }

        require(
            ligthClient != address(0x0),
            "Futaba: Invalid light client contract"
        );

        require(callBack != address(0x0), "Futaba: Invalid callback contract");

        bytes memory encodedPayload = abi.encode(
            callBack,
            queries,
            message,
            ligthClient
        );
        bytes32 queryId = keccak256(abi.encode(encodedPayload, nonce));
        emit Packet(
            _msgSender(),
            queryId,
            encodedPayload,
            message,
            ligthClient
        );
        queryStore[queryId] = queries;
        nonce++;
    }

    function receiveQuery(QueryResponse memory response) external payable {
        require(
            response.lightClient != address(0x0),
            "Futaba: Invalid light client contract"
        );

        bytes32 queryId = response.queryId;
        QueryRequest[] memory queries = queryStore[queryId];
        require(queries.length > 0, "Futaba: Invalid query id");

        ILightClient lightClient = ILightClient(response.lightClient);
        (success, results) = lightClient.verify(response.proof);
        require(success, "Futaba: Invalid proof");

        bytes[] memory results = new bytes[](queries.length);
        for (uint i = 0; i < queries.length; i++) {
            QueryRequest memory q = queries[i];
            results[i] = abi.decode(response.packet, (bytes));
        }

        IReceiver callBack = IReceiver(response.callBack);
        callBack.receiveQuery(results, queries, response.message);
    }
}
