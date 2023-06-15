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

// #TODO: Add @notice & @param description for each: FUNCTION + EVENT + ERROR declaration
contract Gateway is
    IGateway,
    Ownable,
    ReentrancyGuard,
    GelatoRelayContextERC2771
{
    //#TODO: Remove SafeMath. Not necessary.
    using SafeMath for uint;
    using Address for address payable;

    // nonce for query id
    uint64 public nonce;

    // Amount of native tokens in this contract
    uint256 public nativeTokenAmount;

    // #TODO enum status
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
    //#TODO: Could convert string to bytes for gas saving
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
                q.to != address(0x0), //#TODO: Use readable standard address(0)
                "Futaba: Invalid target contract zero address"
            );
        }

        require(
            lightClient != address(0x0), //#TODO: Use readable standard address(0)
            "Futaba: Invalid light client contract"
        );

        require(callBack != address(0x0), "Futaba: Invalid callback contract"); //#TODO: Use readable standard address(0)

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
        nativeTokenAmount = nativeTokenAmount.add(msg.value); //#TODO: Do state change before external call
    }

    function receiveQuery(QueryType.QueryResponse memory response)
        external
        payable
        onlyGelatoRelayERC2771
    {
        bytes32 queryId = response.queryId;
        Query memory storedQuery = queryStore[queryId];

        if (keccak256(storedQuery.data) == keccak256(bytes(""))) {
            revert InvalidQueryId(queryId);
        }

        if (storedQuery.status != QueryStatus.Pending) {
            revert InvalidStatus(storedQuery.status);
        }

        //#TODO: Seems Redundant. why check both for same stage query?
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
                abi.encode(q.dstChainId, q.to, q.slot)
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
            emit ReceiverError(queryId, reason);
            queryStore[queryId].status = QueryStatus.Failed;
        }

        // refund relay fee
        nativeTokenAmount = nativeTokenAmount.sub(_getFee());

        //#TODO: Where is this defined?
        _transferRelayFee();
    }

    //#TODO: All public functions should come after external functions. Shift this and others in the code.
    /**
     * @notice No transaction fees charged at this time
     */
    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) public view returns (uint256) {
        return 0;
    }

    /**
     * @notice Accessing past query results
     * @param queries Query request
     * @return bytes[] Query results
     */
    function getCache(QueryType.QueryRequest[] memory queries)
        external
        view
        returns (bytes[] memory)
    {
        //#TODO: Gas Optimization, cache the queries.length in a local variable and use that throughout the function.
        //#TODO: Do not reinitialize i=0, uint i means it is initialized to zero
        //#TODO:Put all for-loops under unchecked, there's no reason to check overflow here.
        bytes[] memory cache = new bytes[](queries.length);
        for (uint i = 0; i < queries.length; i++) {
            QueryType.QueryRequest memory q = queries[i];

            // Calculate key stored
            bytes32 storeKey = keccak256(
                abi.encode(q.dstChainId, q.to, q.slot) //#TODO: Why not use encodepacked ?
            );

            // If height is 0, the latest block height data can be obtained
            if (q.height == 0) {
                uint256 highestHeight = 0;
                bytes memory result;
                // #TODO: Gas optimization cache the resultStore[storeKey].length
                //#TODO: Do not reinitialize j=0, uint j means it is initialized to zero
                for (uint j = 0; j < resultStore[storeKey].length; j++) {
                    if (resultStore[storeKey][j].height > highestHeight) {
                        highestHeight = resultStore[storeKey][j].height;
                        result = resultStore[storeKey][j].result;
                    }
                }
                cache[i] = result;
            } else {
                // #TODO: Gas optimization cache the resultStore[storeKey].length
                //#TODO: Do not reinitialize j=0, uint j means it is initialized to zero
                for (uint j = 0; j < resultStore[storeKey].length; j++) {
                    if (resultStore[storeKey][j].height == q.height) {
                        cache[i] = resultStore[storeKey][j].result;
                        break;
                    }
                }
            }
        }

        //#TODO: For large cache list might run out of gas, consider limiting the length of this.
        return cache;
    }

    /**
     * @notice Withdraw native token from the contract
     */
    function withdraw() external onlyOwner {
        address payable to = payable(msg.sender);
        to.transfer(nativeTokenAmount); //#TODO: Never use transfer. use "call".
        emit Withdraw(to, nativeTokenAmount); //#TODO:First do state changes of making nativeTokenAmount to zero than emit event.
        nativeTokenAmount = 0;
    }
}
