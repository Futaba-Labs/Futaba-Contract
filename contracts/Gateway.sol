// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./interfaces/IGateway.sol";
import "./interfaces/ILightClient.sol";
import "./interfaces/IReceiver.sol";
import "./QueryType.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {GelatoRelayContextERC2771} from "@gelatonetwork/relay-context/contracts/GelatoRelayContextERC2771.sol";
import "hardhat/console.sol";

/**
 * @title Gateway contract
 * @notice This contract sends and receives queries
 * @notice NOT AUDITED
 */
contract Gateway is
    IGateway,
    Ownable,
    ReentrancyGuard,
    GelatoRelayContextERC2771
{
    using SafeMath for uint;
    using Address for address payable;
    uint64 public nonce;
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

    mapping(bytes32 => QueryData[]) public resultStore;

    mapping(bytes32 => Query) public queryStore;

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

    event ReceiverError(bytes32 indexed queryId, string reason);

    event Withdraw(address indexed to, uint256 indexed amount);

    error InvalidQueryId(bytes32 queryId);
    error InvalidStatus(QueryStatus status);
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
            tx.origin,
            queryId,
            encodedPayload,
            message,
            lightClient,
            callBack
        );
        queryStore[queryId] = Query(encodedPayload, QueryStatus.Pending);
        nonce++;

        ILightClient lc = ILightClient(lightClient);
        lc.requestQuery(queries);
        nativeTokenAmount = nativeTokenAmount.add(msg.value);
    }

    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable onlyGelatoRelayERC2771 {
        bytes32 queryId = response.queryId;
        Query memory storedQuery = queryStore[queryId];

        if (keccak256(storedQuery.data) == keccak256(bytes(""))) {
            revert InvalidQueryId(queryId);
        }

        if (storedQuery.status != QueryStatus.Pending) {
            revert InvalidStatus(storedQuery.status);
        }

        require(
            storedQuery.status == QueryStatus.Pending,
            "Futaba: Invalid query status"
        );
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
        (bool success, bytes[] memory results) = lightClient.verify(
            response.proof
        );
        if (!success) {
            queryStore[queryId].status = QueryStatus.Failed;
            revert InvalidProof(queryId);
        }

        for (uint i = 0; i < results.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            bytes memory result = results[i];
            bytes32 storeKey = keccak256(
                abi.encode(q.dstChainId, q.to, q.slot)
            );

            resultStore[storeKey].push(QueryData(q.height, result));
            emit SaveQueryData(storeKey, q.height, result);
        }

        try
            IReceiver(callBack).receiveQuery(queryId, results, queries, message)
        {
            queryStore[queryId].status = QueryStatus.Success;
            emit ReceiveQuery(queryId, message, lc, callBack, results);
        } catch Error(string memory reason) {
            emit ReceiverError(queryId, reason);
            queryStore[queryId].status = QueryStatus.Failed;
        }
        _transferRelayFee();
    }

    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) public view returns (uint256) {
        return 0;
    }

    function getCache(
        QueryType.QueryRequest[] memory queries
    ) external view returns (bytes[] memory) {
        bytes[] memory cache = new bytes[](queries.length);
        for (uint i = 0; i < queries.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            bytes32 storeKey = keccak256(
                abi.encode(q.dstChainId, q.to, q.slot)
            );
            if (q.height == 0) {
                uint256 highestHeight = 0;
                bytes memory result;
                for (uint j = 0; j < resultStore[storeKey].length; j++) {
                    if (resultStore[storeKey][j].height > highestHeight) {
                        highestHeight = resultStore[storeKey][j].height;
                        result = resultStore[storeKey][j].result;
                    }
                }
                cache[i] = result;
            } else {
                for (uint j = 0; j < resultStore[storeKey].length; j++) {
                    if (resultStore[storeKey][j].height == q.height) {
                        cache[i] = resultStore[storeKey][j].result;
                        break;
                    }
                }
            }
        }
        return cache;
    }

    function withdraw() external onlyOwner {
        address payable to = payable(msg.sender);
        to.transfer(nativeTokenAmount);
        emit Withdraw(to, nativeTokenAmount);
        nativeTokenAmount = 0;
    }
}
