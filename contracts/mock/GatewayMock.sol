// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {IGateway} from "../interfaces/IGateway.sol";
import {ILightClient} from "../interfaces/ILightClient.sol";
import {IReceiver} from "../interfaces/IReceiver.sol";
import {QueryType} from "../QueryType.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {GelatoRelayContextERC2771} from "@gelatonetwork/relay-context/contracts/GelatoRelayContextERC2771.sol";

/**
 * @title Gateway Mock contract
 * @notice Contracts used when testing Gateway contracts (skipping Gelato processing)
 * @notice NOT AUDITED
 */
contract GatewayMock is IGateway, Ownable, ReentrancyGuard {
    // nonce for query id
    uint64 public nonce;

    // Amount of native tokens in this contract
    uint256 public nativeTokenAmount;

    enum QueryStatus {
        Pending,
        Success,
        Failed
    }
    struct Query {
        bytes data;
        QueryStatus status;
    }

    struct QueryData {
        uint256 height;
        bytes result;
    }

    // store key(not query id) => QueryData
    mapping(bytes32 => QueryData[]) public resultStore;

    // query id => Query
    mapping(bytes32 => Query) public queryStore;

    event Packet(
        address indexed sender,
        bytes32 indexed queryId,
        bytes packet,
        bytes message,
        address lightClient,
        address callBack
    );

    event SaveQueryData(
        bytes32 indexed key,
        uint256 indexed height,
        bytes result
    );
    event ReceiveQuery(
        bytes32 indexed queryId,
        bytes message,
        address lightClient,
        address callBack,
        bytes[] results
    );
    event ReceiverError(bytes32 indexed queryId, bytes reason);

    event Withdraw(address indexed to, uint256 indexed amount);

    error ZeroAddress();
    error InvalidQueryId(bytes32 queryId);
    error InvalidStatus(QueryStatus status);
    error InvalidProof(bytes32 queryId);
    error InvalidFee();
    error TooManyQueries();
    error ZeroQuery();
    error InvalidWithdraw();

    constructor() {
        nonce = 1;
    }

    /**
     * @notice This contract is an endpoint for executing query
     * @param queries query data
     * @param lightClient The light client contract address
     * @param callBack The callback contract address
     * @param message Data used when executing callback
     */
    function query(
        QueryType.QueryRequest[] memory queries,
        address lightClient,
        address callBack,
        bytes calldata message
    ) external payable nonReentrant {
        if (queries.length == 0) revert ZeroQuery();

        if (callBack == address(0) || lightClient == address(0)) {
            revert ZeroAddress();
        }
        for (uint i = 0; i < queries.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            if (q.to == address(0)) {
                revert ZeroAddress();
            }
        }

        if (msg.value < estimateFee(lightClient, queries)) {
            revert InvalidFee();
        }

        bytes memory encodedPayload = abi.encode(
            callBack,
            queries,
            message,
            lightClient
        );
        bytes32 queryId = keccak256(abi.encodePacked(encodedPayload, nonce));
        emit Packet(
            tx.origin,
            queryId,
            encodedPayload,
            message,
            lightClient,
            callBack
        );
        queryStore[queryId] = Query(encodedPayload, QueryStatus.Pending);
        nonce++;

        nativeTokenAmount = nativeTokenAmount + msg.value;
        ILightClient lc = ILightClient(lightClient);
        lc.requestQuery(queries);
    }

    /**
     * @notice This function is an endpoint for receiving query
     * @param response query response data
     */
    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable {
        bytes32 queryId = response.queryId;
        Query memory storedQuery = queryStore[queryId];

        if (keccak256(storedQuery.data) == keccak256(bytes(""))) {
            revert InvalidQueryId(queryId);
        }

        if (storedQuery.status != QueryStatus.Pending) {
            revert InvalidStatus(storedQuery.status);
        }

        (
            address callBack,
            QueryType.QueryRequest[] memory queries,
            bytes memory message,
            address lc
        ) = abi.decode(
                storedQuery.data,
                (address, QueryType.QueryRequest[], bytes, address)
            );

        ILightClient lightClient = ILightClient(lc);

        // verify proof and get results
        (bool success, bytes[] memory results) = lightClient.verify(
            response.proof
        );
        if (!success) {
            queryStore[queryId].status = QueryStatus.Failed;
            revert InvalidProof(queryId);
        }

        // save results
        for (uint i = 0; i < results.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            bytes memory result = results[i];
            bytes32 storeKey = keccak256(
                abi.encodePacked(q.dstChainId, q.to, q.slot)
            );

            resultStore[storeKey].push(QueryData(q.height, result));
            emit SaveQueryData(storeKey, q.height, result);
        }

        // call back to receiver contract
        try
            IReceiver(callBack).receiveQuery(queryId, results, queries, message)
        {
            queryStore[queryId].status = QueryStatus.Success;
            emit ReceiveQuery(queryId, message, lc, callBack, results);
        } catch Error(string memory reason) {
            emit ReceiverError(queryId, bytes(reason));
            queryStore[queryId].status = QueryStatus.Failed;
        }
    }

    /**
     * @notice This function is used to estimate the cost of gas (No transaction fees charged at this time)
     * @param lightClient The light client contract address
     * @param queries query data
     */
    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) public view returns (uint256) {
        return 10000;
    }

    /**
     * @notice Accessing past query results
     * @param queries Query request
     * @return bytes[] Query results
     */
    function getCache(
        QueryType.QueryRequest[] memory queries
    ) external view returns (bytes[] memory) {
        uint256 querySize = queries.length;
        if (querySize > 100) revert TooManyQueries();
        bytes[] memory cache = new bytes[](querySize);
        for (uint i; i < querySize; i++) {
            QueryType.QueryRequest memory q = queries[i];

            // Calculate key stored
            bytes32 storeKey = keccak256(
                abi.encodePacked(q.dstChainId, q.to, q.slot)
            );

            uint256 resultStoreSize = resultStore[storeKey].length;

            // If height is 0, the latest block height data can be obtained
            if (q.height == 0) {
                uint256 highestHeight = 0;
                bytes memory result;
                for (uint j; j < resultStoreSize; j++) {
                    if (resultStore[storeKey][j].height > highestHeight) {
                        highestHeight = resultStore[storeKey][j].height;
                        result = resultStore[storeKey][j].result;
                    }
                }
                cache[i] = result;
            } else {
                for (uint j; j < resultStoreSize; j++) {
                    if (resultStore[storeKey][j].height == q.height) {
                        cache[i] = resultStore[storeKey][j].result;
                        break;
                    }
                }
            }
        }

        return cache;
    }

    function getQueryStatus(
        bytes32 queryId
    ) external view returns (QueryStatus) {
        return _getQueryStatus(queryId);
    }

    /**
     * @notice Withdraw native token from the contract
     */
    function withdraw() external onlyOwner {
        uint256 withdrawAmount = nativeTokenAmount;
        nativeTokenAmount = 0;

        (bool success, ) = payable(msg.sender).call{value: withdrawAmount}("");
        if (!success) revert InvalidWithdraw();

        emit Withdraw(msg.sender, withdrawAmount);
    }

    function _getQueryStatus(
        bytes32 queryId
    ) private view returns (QueryStatus) {
        return queryStore[queryId].status;
    }
}
