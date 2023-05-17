// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../interfaces/IGateway.sol";
import "../interfaces/ILightClient.sol";
import "../interfaces/IReceiver.sol";
import "../QueryType.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import "hardhat/console.sol";

/**
 * @title Gateway Mock contract
 * @notice This contract sends and receives queries
 * @notice NOT AUDITED
 */
contract GatewayMock is IGateway, Ownable, ReentrancyGuard {
    using SafeMath for uint;
    uint64 public nonce;

    enum QueryStatus {
        Pending,
        Success,
        Failed
    }
    struct Query {
        address lightClient;
        address callBack;
        bytes message;
        QueryType.QueryRequest[] queries;
        QueryStatus status;
    }

    mapping(bytes32 => bytes[]) public resultStore;

    mapping(bytes32 => Query) public queryStore;

    event SaveResult(bytes32 indexed queryId, bytes[] results);
    event ReceiveQuery(
        bytes32 indexed queryId,
        bytes message,
        address lightClient,
        address callBack,
        bytes[] results
    );

    error InvalidQueryId(bytes32 queryId);
    error InvalidProof(bytes32 queryId);

    constructor() {
        nonce = 1;
    }

    function query(
        QueryType.QueryRequest[] memory queries,
        address lightClient,
        address callBack,
        bytes calldata message
    ) external payable nonReentrant {
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
        queryStore[queryId].lightClient = lightClient;
        queryStore[queryId].callBack = callBack;
        queryStore[queryId].message = message;
        for (uint i = 0; i < queries.length; i++) {
            queryStore[queryId].queries.push(queries[i]);
        }
        queryStore[queryId].status = QueryStatus.Pending;
        nonce++;

        ILightClient lc = ILightClient(lightClient);
        lc.requestQuery(queries);
    }

    //@dev gelato modifiers are removed in this mock
    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable {
        bytes32 queryId = response.queryId;
        address lc = queryStore[queryId].lightClient;
        address callBack = queryStore[queryId].callBack;
        bytes memory message = queryStore[queryId].message;
        QueryType.QueryRequest[] memory queries = queryStore[queryId].queries;
        if (queries.length == 0) {
            queryStore[queryId].status = QueryStatus.Failed;
            revert InvalidQueryId(queryId);
        }

        ILightClient lightClient = ILightClient(lc);
        (bool success, bytes[] memory results) = lightClient.verify(
            response.proof
        );
        if (!success) {
            queryStore[queryId].status = QueryStatus.Failed;
            revert InvalidProof(queryId);
        }

        resultStore[queryId] = results;
        emit SaveResult(queryId, results);

        IReceiver receiver = IReceiver(callBack);
        receiver.receiveQuery(queryId, results, queries, message);
        queryStore[queryId].status = QueryStatus.Success;
        emit ReceiveQuery(queryId, message, lc, callBack, results);
    }

    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) public view returns (uint256) {
        require(
            lightClient != address(0x0),
            "Futaba: Invalid light client contract"
        );
        ILightClient lc = ILightClient(lightClient);
        uint256 lcFee = lc.estimateFee(queries);
        return lcFee;
    }
}
