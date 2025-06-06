// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {IGateway} from "./interfaces/IGateway.sol";
import {ILightClient} from "./interfaces/ILightClient.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {QueryType} from "./QueryType.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title Gateway contract
 * @notice This contract sends and receives queries
 * @notice NOT AUDITED
 */

contract Gateway is
    IGateway,
    Initializable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable
{
    /* ----------------------------- Public Storages -------------------------------- */

    // Interface id of ILightClient
    bytes4 private constant _ILIGHT_CLIENT_ID = 0x4da71151;
    // Interface id of IReceiver
    bytes4 private constant _IRECEIVER_ID = 0xb1f586d1;

    uint256 public constant MAX_PROTOCOL_FEE = 1 ether; // 1 ETH

    uint256 private constant _MAX_QUERY_COUNT = 100;
    uint256 private constant _MAX_RELAYER_COUNT = 10;

    // nonce for query id
    uint256 private _nonce;

    // Protocol fee
    uint256 public protocolFee;

    // Amount of native tokens in this contract
    uint256 public protocolAmount;

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

    // relayer address => bool
    mapping(address => bool) public approvedRelayers;

    // query id => fee
    mapping(bytes32 => uint256) public queryFees;

    // relayer address => balance
    mapping(address => uint256) public relayerBalances;

    /* ----------------------------- Events -------------------------------- */

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

    /**
     * @notice This event is emitted when the protocol fee is updated
     * @param protocolFee The new protocol fee
     */
    event UpdateProtocolFee(uint256 protocolFee);

    /**
     * @notice This event is emitted when relayers are set
     * @param owner The owner of the contract
     * @param relayer The relayer address
     */
    event SetRelayer(address owner, address relayer);

    /**
     * @notice This event is emitted when relayers are removed
     * @param owner The owner of the contract
     * @param relayer The relayer address
     */
    event RemoveRelayer(address owner, address relayer);

    /* ----------------------------- Errors -------------------------------- */

    /**
     * @notice Error if input is invalid
     */
    error InvalidInputMessage();

    /**
     * @notice Error if input is zero
     */
    error InvalidInputZeroValue();

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

    /**
     * @notice Error if max protocol fee is exceeded
     */
    error MaxProtocolFeeExceeded();

    /**
     * @notice Error if too many queries
     */
    error TooManyQueries();

    /**
     * @notice Error if query size is zero
     */
    error ZeroQuery();

    /**
     * @notice Error if transfer failed
     */
    error InvalidTransfer();

    /**
     * @notice Error if too many relayers
     */
    error TooManyRelayers();

    /**
     * @notice Error if relayer is invalid
     */
    error InvalidRelayer();

    /* ----------------------------- Initializer -------------------------------- */

    /**
     * @notice Initialize the contract
     * @dev Initialize Ownable2Step and ReentrancyGuard and set nonce to 1.
     * @param nonce nonce for query id
     * @param protocolFee The protocol fee
     */

    function initialize(uint256 nonce, uint256 protocolFee) public initializer {
        __Ownable2Step_init();
        __ReentrancyGuard_init();

        _nonce = nonce;
        setProtocolFee(protocolFee);
    }

    ///@custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Override to support UUPS.
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /* ----------------------------- External Functions -------------------------------- */

    /**
     * @notice This contract is an endpoint for executing query
     * @dev This function stores query information and emit events to be communicated off-chain.
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
        uint256 querySize = queries.length;
        if (querySize == 0) revert ZeroQuery();

        if (callBack == address(0) || lightClient == address(0))
            revert ZeroAddress();

        if (!_checkSupportedInterface(callBack, lightClient)) {
            revert CallbackOrLightClientDontSupportInterface();
        }
        uint256 totalFee = estimateFee(lightClient, queries);
        if (msg.value < totalFee) {
            revert InvalidFee();
        }

        if (message.length == 0) {
            message = bytes("");
        }

        for (uint i; i < querySize; i++) {
            QueryType.QueryRequest memory q = queries[i];
            if (q.to == address(0)) revert ZeroAddress();
            if (q.dstChainId == 0) revert InvalidInputZeroValue();
            if (q.height == 0) revert InvalidInputZeroValue();
        }

        ILightClient lc = ILightClient(lightClient);
        lc.requestQuery(queries);

        bytes memory encodedPayload = abi.encode(
            callBack,
            queries,
            message,
            lightClient
        );
        bytes32 queryId = keccak256(abi.encodePacked(encodedPayload, _nonce));

        queryStore[queryId] = Query(encodedPayload, QueryStatus.Pending);
        ++_nonce;

        // Save query fee
        uint256 queryFee = ILightClient(lightClient).estimateQueryFee(queries);
        queryFees[queryId] = queryFee;

        protocolAmount = protocolAmount + (totalFee - queryFee);

        // Return overpayment
        uint256 overPayment = msg.value - totalFee;
        if (overPayment > 0) {
            (bool success, ) = payable(tx.origin).call{value: overPayment}("");
            if (!success) revert InvalidTransfer();
        }

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
     * @dev This function is executed from Relayer, validates the Proof against the result of the Query,
     * and returns it to the user's construct.
     * @param response query response data
     */
    function receiveQuery(
        QueryType.QueryResponse memory response
    ) external payable virtual onlyApprovedRelayer {
        if (!approvedRelayers[msg.sender]) revert InvalidRelayer();

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
        uint256 resultSize = results.length;
        for (uint i; i < resultSize; i++) {
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

        // pay relayer
        uint256 queryFee = queryFees[queryId];
        relayerBalances[msg.sender] = relayerBalances[msg.sender] + queryFee;
    }

    /**
     * @notice Accessing past query results
     * @dev This function returns the past query data stored in the queryStore.
     * @param queries Query request
     * @return bytes[] Query results
     */
    function getCache(
        QueryType.QueryRequest[] memory queries
    ) external view returns (bytes[] memory) {
        uint256 querySize = queries.length;
        if (querySize > _MAX_QUERY_COUNT) revert TooManyQueries();

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
                uint256 highestHeight;
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
     * @dev This function returns the status of the query.
     * @param queryId Unique id to access query state
     * @return QueryStatus The status of the query
     */
    function getQueryStatus(
        bytes32 queryId
    ) external view returns (QueryStatus) {
        return queryStore[queryId].status;
    }

    /**
     * @notice Withdraw native token from the contract
     * @dev This function withdraws native token from the contract.
     */
    function withdraw() external onlyOwner {
        uint256 withdrawAmount = protocolAmount;
        protocolAmount = 0;

        (bool success, ) = payable(msg.sender).call{value: withdrawAmount}("");
        if (!success) revert InvalidTransfer();

        emit Withdraw(msg.sender, withdrawAmount);
    }

    function withdrawRelayerBalance() external {
        uint256 withdrawAmount = relayerBalances[msg.sender];
        relayerBalances[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: withdrawAmount}("");
        if (!success) revert InvalidTransfer();

        emit Withdraw(msg.sender, withdrawAmount);
    }

    /**
     * @notice Get the current nonce
     * @return nonce
     */
    function getNonce() external view returns (uint256) {
        return _nonce;
    }

    /**
     * @notice Set the relayers
     * @param relayers The relayer addresses
     */
    function setRelayers(address[] memory relayers) external onlyOwner {
        uint256 relayerSize = relayers.length;
        if (relayerSize > _MAX_RELAYER_COUNT) revert TooManyRelayers();

        for (uint256 i; i < relayerSize; i++) {
            approvedRelayers[relayers[i]] = true;
            emit SetRelayer(msg.sender, relayers[i]);
        }
    }

    /**
     * @notice Remove the relayers
     * @param relayers The relayer addresses
     */
    function removeRelayers(address[] memory relayers) external onlyOwner {
        uint256 relayerSize = relayers.length;
        if (relayerSize > _MAX_RELAYER_COUNT) revert TooManyRelayers();

        for (uint256 i; i < relayerSize; i++) {
            approvedRelayers[relayers[i]] = false;
            emit RemoveRelayer(msg.sender, relayers[i]);
        }
    }

    /* ----------------------------- Public Functions -------------------------------- */

    /**
     * @notice This function is used to estimate the cost of gas (No transaction fees charged at this time)
     * @dev This function returns the estimated fee
     * (In the future, we will also access the LightClient contract to obtain unique fees).
     * @param lightClient The light client contract address
     * @param queries query data
     * @return uint256 The estimated fee
     */
    function estimateFee(
        address lightClient,
        QueryType.QueryRequest[] memory queries
    ) public view returns (uint256) {
        uint256 verificationFee = ILightClient(lightClient).estimateFee(
            queries
        );
        // Total fee is the sum of protocol fee and verification fee
        uint256 totalFee = protocolFee + verificationFee;
        return totalFee;
    }

    /**
     * @notice Get the current protocol fee
     * @param _protocolFee The new protocol fee
     */
    function setProtocolFee(uint256 _protocolFee) public onlyOwner {
        if (_protocolFee > MAX_PROTOCOL_FEE) revert MaxProtocolFeeExceeded();

        protocolFee = _protocolFee;

        emit UpdateProtocolFee(_protocolFee);
    }

    /* ----------------------------- Private Functions -------------------------------- */

    /**
     * @notice Check whether the target Callback and LightClient addresses support the respective Interfaces.
     * @param callBackAddress The callback contract address
     * @param lightClient The light client contract address
     * @return bool Whether the target Callback and LightClient addresses support the respective Interfaces
     */
    function _checkSupportedInterface(
        address callBackAddress,
        address lightClient
    ) private view returns (bool) {
        return
            IERC165(callBackAddress).supportsInterface(_IRECEIVER_ID) &&
            IERC165(lightClient).supportsInterface(_ILIGHT_CLIENT_ID);
    }

    /* ----------------------------- Modifiers -------------------------------- */

    modifier onlyApprovedRelayer() {
        if (!approvedRelayers[msg.sender]) revert InvalidRelayer();
        _;
    }
}
