// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "./interfaces/IGateway.sol";
import "./interfaces/ILightClient.sol";
import "./interfaces/IReceiver.sol";
import "./QueryType.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {GelatoRelayContextERC2771} from "@gelatonetwork/relay-context/contracts/GelatoRelayContextERC2771.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "hardhat/console.sol";

/**
 * @title Gateway contract
 * @notice This contract sends and receives queries
 * @notice NOT AUDITED
 */

// #TODO: Add @notice & @param description for each: FUNCTION + EVENT + ERROR declaration
contract Gateway is
    IGateway,
    GelatoRelayContextERC2771,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using Address for address payable;

    /* ----------------------------- Public Storage -------------------------------- */

    bytes4 private constant _ILight_Client_Id = 0xaba23c56;
    bytes4 private constant _IReceiver_Id = 0xb1f586d1;

    // nonce for query id
    uint64 private nonce;

    // Amount of native tokens in this contract
    uint256 public nativeTokenAmount;

    enum QueryStatus {
        Pending, // Waiting for query results
        Success, // Query succeeded
        Failed // Query failed
    }
    struct Query {
        bytes data; // `encode(callBack, queries, message, lightClient)`
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

    /* ----------------------------- EVENTS -------------------------------- */

    /**
     * @notice This event is emitted when a query is sent
     * @param sender The sender of the query
     * @param queryId Unique id to access query state
     * @param packet The encoded payload
     * @param message Data to be returned, in addition to the query
     * @param lightClient The light client contract address
     * @param callBack The callback contract address
     */
    event Packet(
        address indexed sender,
        bytes32 indexed queryId,
        bytes packet,
        bytes message,
        address lightClient,
        address callBack
    );

    /**
     * @notice This event is emitted when a query data is stored
     * @param key The key of the query data
     * @param height The block height of the query data
     * @param result The result of the query data
     */
    event SaveQueryData(
        bytes32 indexed key,
        uint256 indexed height,
        bytes result
    );

    /**
     * @notice This event is emitted when a query is received
     * @param queryId Unique id to access query state
     * @param message Data to be returned, in addition to the query
     * @param lightClient The light client contract address
     * @param callBack The callback contract address
     * @param results The results of the query
     */
    event ReceiveQuery(
        bytes32 indexed queryId,
        bytes message,
        address lightClient,
        address callBack,
        bytes[] results
    );

    /**
     * @notice This event is emitted when an error occurs in receiver
     * @param queryId Unique id to access query state
     * @param reason The reason for the error
     */
    event ReceiverError(bytes32 indexed queryId, bytes reason);

    /**
     * @notice This event is emitted when a query is executed
     * @param to Unique id to access query state
     * @param amount The amount of native tokens
     */
    event Withdraw(address indexed to, uint256 amount);

    /* ----------------------------- ERRORS -------------------------------- */

    /**
     * @notice Error if input is invalid
     */
    error InvalidInputMessage();

    /**
     * @notice Error if input is zero
     */
    error InvalidInputZeroValue();

    /**
     * @notice Error if input is not bytes32
     */
    error InvalidInputEmptyBytes32();
    /**
     * @notice Error if address is zero
     */
    error ZeroAddress();

    /**
     * @notice Error if fee is insufficient
     */
    error InvalidFee();

    /**
     * @notice Error if query id does not exist
     * @param queryId Unique id to access query state
     */
    error InvalidQueryId(bytes32 queryId);

    /**
     * @notice Error if query status is invalid
     * @param status The status of the query
     */
    error InvalidStatus(QueryStatus status);

    /**
     * @notice Error if query proof is invalid
     * @param queryId Unique id to access query state
     */
    error InvalidProof(bytes32 queryId);

    /**
     * @notice Error if callback or light client does not support interface
     */
    error CallbackOrLightClientDontSupportInterface();

    /* ----------------------------- INITIALIZER -------------------------------- */

    function initialize(uint64 _nonce) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
        nonce = _nonce;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /* ----------------------------- EXTERNAL FUNCTION -------------------------------- */

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
        bytes memory message
    ) external payable nonReentrant {
        if (callBack == address(0) || lightClient == address(0))
            revert ZeroAddress();

        if (!_checkSupportedInterface(callBack, lightClient)) {
            revert CallbackOrLightClientDontSupportInterface();
        }

        if (msg.value < estimateFee(lightClient, queries)) {
            revert InvalidFee();
        }

        if (message.length == 0) {
            message = bytes("");
        }

        for (uint i = 0; i < queries.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            if (q.to == address(0)) revert ZeroAddress();
            if (q.dstChainId == 0) revert InvalidInputZeroValue();
            if (q.height == 0) revert InvalidInputZeroValue();
            if (q.slot == bytes32(0)) revert InvalidInputEmptyBytes32();
        }

        ILightClient lc = ILightClient(lightClient);
        lc.requestQuery(queries);

        bytes memory encodedPayload = abi.encode(
            callBack,
            queries,
            message,
            lightClient
        );
        bytes32 queryId = keccak256(abi.encodePacked(encodedPayload, nonce));

        queryStore[queryId] = Query(encodedPayload, QueryStatus.Pending);
        nonce++;

        nativeTokenAmount = nativeTokenAmount + msg.value;

        emit Packet(
            tx.origin,
            queryId,
            encodedPayload,
            message,
            lightClient,
            callBack
        );
    }

    /**
     * @notice This function is an endpoint for receiving query
     * @param response query response data
     */
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

        // refund relay fee
        nativeTokenAmount = nativeTokenAmount - _getFee();

        _transferRelayFee();
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
        require(querySize <= 100, "Futaba: Too many queries");
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

    /**
     * @notice Get the status of the query
     * @param queryId Unique id to access query state
     */
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
        require(success, "Futaba: Failed to withdraw native token");

        emit Withdraw(msg.sender, withdrawAmount);
    }

    /**
     * @notice Get the current nonce
     * @return nonce
     */
    function getNonce() external view returns (uint64) {
        return nonce;
    }

    /* ----------------------------- PUBLIC FUNCTION -------------------------------- */

    /**
     * @notice This function is used to estimate the cost of gas (No transaction fees charged at this time)
     * @param lightClient The light client contract address
     * @param queries query data
     */
    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) public view returns (uint256) {
        return 0;
    }

    /* ----------------------------- INTERNAL FUNCTION -------------------------------- */

    /**
     * @notice Get the status of the query
     * @param queryId Unique id to access query state
     */
    function _getQueryStatus(
        bytes32 queryId
    ) internal view returns (QueryStatus) {
        return queryStore[queryId].status;
    }

    function _checkSupportedInterface(
        address callBackAddress,
        address lightClient
    ) internal view returns (bool) {
        return
            IERC165(callBackAddress).supportsInterface(_IReceiver_Id) &&
            IERC165(lightClient).supportsInterface(_ILight_Client_Id);
    }
}
