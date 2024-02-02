// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {ILightClient} from "./interfaces/ILightClient.sol";
import {IChainlinkLightClient} from "./interfaces/IChainlinkLightClient.sol";
import {IExternalAdapter} from "./interfaces/IExternalAdapter.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {TrieProofs} from "./lib/TrieProofs.sol";
import {RLPReader} from "./lib/RLPReader.sol";
import {EthereumDecoder} from "./lib/EthereumDecoder.sol";
import {QueryType} from "./QueryType.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title Chainlink LightClient
 * @notice Light Client Contract when using Chainlink Node Operator
 */

contract ChainlinkLightClient is
    ILightClient,
    IChainlinkLightClient,
    Ownable2Step
{
    /* ----------------------------- Libraries -------------------------------- */

    using TrieProofs for bytes;
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    /* ----------------------------- Public Storage -------------------------------- */

    // Limit the number of queries
    uint256 internal constant _MAX_QUERY_COUNT = 10;

    // Gateway contract address
    address public immutable GATEWAY;

    // chainId => height => account => storageRoot
    mapping(uint256 => mapping(uint256 => mapping(address => bytes32)))
        public approvedStorageRoots;

    // chainId => height => stateRoot
    mapping(uint256 => mapping(uint256 => bytes32)) public approvedStateRoots;

    // Contract to execute request to chainlink
    address public oracle;

    // Chainlink data feed contract address
    address public chainlinkDataFeed;

    // Gas data
    GasData public gasData;

    /* ----------------------------- Structure -------------------------------- */

    /**
     * @notice Proof data
     * @param dstChainId Destination chain id
     * @param height Block height
     * @param root State root
     */
    struct Proof {
        uint256 dstChainId;
        uint256 height;
        bytes proof;
    }

    /**
     * @notice Account proof data
     * @param root State root
     * @param account Target contract address
     * @param proof Account proof in byte format
     */
    struct AccountProof {
        bytes32 root;
        address account;
        bytes proof;
    }

    /**
     * @notice Storage proof data
     * @param root Storage root
     * @param path Storage slot
     * @param proof Storage proof in byte format
     */
    struct StorageProof {
        bytes32 root;
        bytes32 path;
        bytes proof;
    }

    struct GasData {
        uint256 gasLimit;
        uint256 gasPrice;
        uint256 gasPerQuery;
    }

    /* ----------------------------- Events -------------------------------- */

    /**
     * @notice The event that is emitted when state root is updated
     * @param chainId Destination chain id
     * @param height Block height
     * @param root State root
     */
    event UpdateStateRoot(
        uint256 indexed chainId,
        uint256 indexed height,
        bytes32 root
    );

    /**
     * @notice The event that is emitted when a request is made to Oracle
     * @param requestId Request id created Chainlink contract
     * @param oracle Chainlink contract address
     * @param queries Query data
     */
    event NotifyOracle(
        bytes32 indexed requestId,
        address indexed oracle,
        bytes queries
    );

    /**
     * @notice The event that is emitted when the oracle address is updated
     * @param oracle The new oracle address
     */
    event SetOracle(address oracle);

    /**
     * @notice The event that is emitted when the gateway address is updated
     * @param gateway The new gateway address
     */
    event SetGateway(address gateway);

    /**
     * @notice The event that is emitted when the state root is approved
     * @param chainId Destination chain id
     * @param height Block height
     * @param root State root
     */
    event ApprovedStateRoot(
        uint256 indexed chainId,
        uint256 indexed height,
        bytes32 root
    );

    /**
     * @notice The event that is emit when Chainlink data feed contract address is updated
     * @param chainlinkDataFeed Chainlink data feed contract address
     */
    event SetChainlinkDataFeed(address chainlinkDataFeed);

    /**
     * @notice The event that is emit when gas data is updated
     * @param gasLimit Gas limit
     * @param gasPrice Gas price
     * @param gasPerQuery Gas per query
     */
    event SetGasData(uint256 gasLimit, uint256 gasPrice, uint256 gasPerQuery);

    /* ----------------------------- Errors -------------------------------- */

    /**
     * @notice Error if not authorized in Gateway
     */
    error NotAuthorized();

    /**
     * @notice Error if address is 0
     */
    error ZeroAddressNotAllowed();

    /**
     * @notice Error if the number of queries exceeds the limit
     */
    error TooManyQueries();

    /**
     * @notice Error if input value is zero
     */
    error ZeroValueNotAllowed();

    /**
     * @notice Error if different trie roots
     */
    error DifferentTrieRoots(bytes32 root);

    /**
     * @notice Error if not exist root
     */
    error NotExistRoot();

    /* ----------------------------- Constructor -------------------------------- */

    /**
     * @notice Constructor that sets LightClient information
     * @param _gateway The address of the Gateway contract
     * @param _oracle The address of the Chainlink contract
     * @param _chainlinkDataFeed The address of the Chainlink data feed contract
     * @param _gasLimit Gas limit
     * @param _gasPrice Gas price
     * @param _gasPerQuery Gas per query
     */
    constructor(
        address _gateway,
        address _oracle,
        address _chainlinkDataFeed,
        uint256 _gasLimit,
        uint256 _gasPrice,
        uint256 _gasPerQuery
    ) {
        if (_gateway == address(0)) revert ZeroAddressNotAllowed();

        GATEWAY = _gateway;
        setOracle(_oracle);
        setChainlinkDataFeed(_chainlinkDataFeed);
        setGasData(_gasLimit, _gasPrice, _gasPerQuery);

        emit SetGateway(_gateway);
    }

    /* ----------------------------- External Functions -------------------------------- */

    /**
     * @notice This function can be requested from the Gateway contract to add arbitrary processing.
     * @dev Requesting External Adapter to get State root for ChainlinkOracle contract.
     * @param queries request query data
     */
    function requestQuery(
        QueryType.QueryRequest[] memory queries
    ) external virtual onlyGateway {
        uint256 querySize = queries.length;
        if (querySize > _MAX_QUERY_COUNT) revert TooManyQueries();

        QueryType.OracleQuery[] memory requests = new QueryType.OracleQuery[](
            querySize
        );

        // Format query data for requests to chainlink
        for (uint i; i < querySize; i++) {
            QueryType.QueryRequest memory q = queries[i];
            requests[i] = QueryType.OracleQuery(q.dstChainId, q.height);
        }

        bytes32 requestId = IExternalAdapter(oracle).notifyOracle(requests);

        emit NotifyOracle(requestId, oracle, abi.encode(requests));
    }

    /**
     * @notice This function is for validation upon receipt of query(mock verifies account proof and storage proof)
     * @dev Receive proof data from Gateway contract and verify account proof and storage proof.
     * Returns the results of the verification to the Gateway contract.
     * @param message response query data
     * @return bool Whether the verification was successful
     * @return bytes[] The result of the verification
     */
    function verify(
        bytes memory message
    ) external virtual onlyGateway returns (bool, bytes[] memory) {
        Proof[] memory proofs = abi.decode(message, (Proof[]));
        uint256 proofSize = proofs.length;
        bytes[] memory results = new bytes[](proofSize);

        // Check if there is a corresponding state root for each query
        _checkRoot(proofs);

        for (uint i; i < proofSize; i++) {
            Proof memory proof = proofs[i];
            // decode proof data
            (
                AccountProof memory accountProof,
                StorageProof[] memory storageProofs
            ) = abi.decode(proofs[i].proof, (AccountProof, StorageProof[]));

            bytes32 storageRoot = approvedStorageRoots[proof.dstChainId][
                proof.height
            ][accountProof.account];

            uint256 storageProofSize = storageProofs.length;

            // Check if there is a corresponding storage root for each query
            // If not saved, verify account proof
            // If stored, skip account proof verification and verify storage proof
            if (storageRoot != bytes32("")) {
                bytes memory result;
                // Storage proof verification
                for (uint j; j < storageProofSize; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    if (storageRoot != storageProof.root)
                        revert DifferentTrieRoots(storageProof.root);

                    bytes32 value = _getStorageValue(storageProof);
                    result = bytes.concat(result, value);
                }
                results[i] = result;
            } else {
                // Account proof verification
                EthereumDecoder.Account memory account = EthereumDecoder
                    .toAccount(
                        accountProof.proof.verify(
                            approvedStateRoots[proof.dstChainId][proof.height],
                            keccak256(abi.encodePacked(accountProof.account))
                        )
                    );

                // If the account proof is successfully verified, the storage root that can be obtained from it is stored in the mapping.
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] = account.storageRoot;

                // Storage proof verification
                bytes memory result;
                for (uint j; j < storageProofSize; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    bytes32 value = _getStorageValue(storageProof);
                    result = bytes.concat(result, value);
                }
                results[i] = result;
            }
        }
        return (true, results);
    }

    /**
     * @notice This function is for updating the state root
     * @dev Update the state root with the response from the ChainlinkOracle contract.
     * @param responses Data about state root returned from Chainlink's external adapter
     */
    function updateHeader(
        QueryType.OracleResponse[] memory responses
    ) external {
        if (oracle != msg.sender) revert NotAuthorized();

        uint256 responseSize = responses.length;
        for (uint i; i < responseSize; i++) {
            QueryType.OracleResponse memory response = responses[i];
            bytes32 root = approvedStateRoots[response.dstChainId][
                response.height
            ];
            if (root != bytes32("")) {
                if (root != response.root)
                    revert DifferentTrieRoots(response.root);

                emit ApprovedStateRoot(
                    response.dstChainId,
                    response.height,
                    response.root
                );
            } else {
                approvedStateRoots[response.dstChainId][
                    response.height
                ] = response.root;

                emit UpdateStateRoot(
                    response.dstChainId,
                    response.height,
                    response.root
                );
            }
        }
    }

    /**
     * @notice No transaction fees charged at this time
     * @param queries request query data
     * @return uint256 Transaction fee
     */
    function estimateFee(
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256) {
        uint256 queryFee = estimateQueryFee(queries);

        // Oracle fee calculation
        // Assuming Chainlink's data feed contract is already deployed and its address is stored in a state variable named `chainlinkDataFeed`
        // Also assuming that the `getLatestPrice` function of the Chainlink data feed contract returns the latest LINK/Native Token rate
        (, int answer, , , ) = AggregatorV3Interface(chainlinkDataFeed)
            .latestRoundData();
        uint256 oracleFee = uint256(answer);

        // Total verification fee is the sum of relayer fee and oracle fee
        uint256 totalFee = queryFee + oracleFee;

        return totalFee;
    }

    /**
     * @notice Function to retrieve the state root stored in a specific chain and height
     * @param chainId Chain ID
     * @param height Block height
     * @return bytes32 Approved state root
     */
    function getApprovedStateRoot(
        uint32 chainId,
        uint256 height
    ) external view returns (bytes32) {
        return approvedStateRoots[chainId][height];
    }

    /**
     * @notice Get the oracle address
     * @return address The address of the ChainlinkOracle contract
     */
    function getOracle() external view returns (address) {
        return oracle;
    }

    /**
     * @notice Check if the contract supports the interface
     * @param interfaceId Interface ID
     * @return bool Whether the contract supports the interface
     */
    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return interfaceId == type(ILightClient).interfaceId;
    }

    /* ----------------------------- Public Functions -------------------------------- */

    function estimateQueryFee(
        QueryType.QueryRequest[] memory queries
    ) public view returns (uint256) {
        if (queries.length > _MAX_QUERY_COUNT) revert TooManyQueries();

        uint256 queryFee = ((gasData.gasPerQuery * queries.length) +
            gasData.gasLimit) * gasData.gasPrice; // Gas fee

        return queryFee;
    }

    /**
     * @notice Set the oracle address
     * @param _oracle The address of the ChainlinkOracle contract
     */
    function setOracle(address _oracle) public onlyOwner {
        if (_oracle == address(0)) revert ZeroAddressNotAllowed();
        oracle = _oracle;

        emit SetOracle(_oracle);
    }

    function setChainlinkDataFeed(address _chainlinkDataFeed) public onlyOwner {
        if (_chainlinkDataFeed == address(0)) revert ZeroAddressNotAllowed();
        chainlinkDataFeed = _chainlinkDataFeed;

        emit SetChainlinkDataFeed(_chainlinkDataFeed);
    }

    function getChainlinkDataFeed() public view returns (address) {
        return chainlinkDataFeed;
    }

    function setGasData(
        uint256 _gasLimit,
        uint256 _gasPrice,
        uint256 _gasPerQuery
    ) public onlyOwner {
        if (_gasLimit == 0 || _gasPrice == 0 || _gasPerQuery == 0)
            revert ZeroValueNotAllowed();
        gasData = GasData(_gasLimit, _gasPrice, _gasPerQuery);

        emit SetGasData(_gasLimit, _gasPrice, _gasPerQuery);
    }

    /* ----------------------------- Internal Functions -------------------------------- */

    /**
     * @notice Validate storage proof and retrieve target data
     * @param storageProof Storage proof for verification
     * @return bytes32 Value of target storage
     */
    function _getStorageValue(
        StorageProof memory storageProof
    ) internal pure returns (bytes32) {
        bytes32 path = keccak256(abi.encodePacked(uint256(storageProof.path)));
        bytes memory value = storageProof.proof.verify(storageProof.root, path);
        if (value.length == 0) {
            return bytes32(0);
        } else {
            return bytes32(value.toRlpItem().toUint());
        }
    }

    /**
     * @notice Check if root exists
     * @param proofs Proofs to check
     */
    function _checkRoot(Proof[] memory proofs) internal view {
        uint256 proofSize = proofs.length;
        for (uint i; i < proofSize; i++) {
            Proof memory proof = proofs[i];
            if (
                approvedStateRoots[proof.dstChainId][proof.height] ==
                bytes32("")
            ) revert NotExistRoot();
        }
    }

    /* ----------------------------- Modifiers -------------------------------- */

    /**
     * @notice Modifier to check if the caller is the gateway
     */
    modifier onlyGateway() {
        if (GATEWAY != msg.sender) revert NotAuthorized();
        _;
    }
}
