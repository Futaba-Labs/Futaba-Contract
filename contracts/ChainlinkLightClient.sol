// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.19;

import {ILightClient} from "./interfaces/ILightClient.sol";
import {IChainlinkLightClient} from "./interfaces/IChainlinkLightClient.sol";
import {IExternalAdapter} from "./interfaces/IExternalAdapter.sol";
import {TrieProofs} from "./lib/TrieProofs.sol";
import {RLPReader} from "./lib/RLPReader.sol";
import {EthereumDecoder} from "./lib/EthereumDecoder.sol";
import {QueryType} from "./QueryType.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Chainlink LightClient
 * @notice Light Client Contract when using Chainlink Node Operator
 */

contract ChainlinkLightClient is ILightClient, IChainlinkLightClient, Ownable {
    /* ----------------------------- Libraries -------------------------------- */

    using TrieProofs for bytes;
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    /* ----------------------------- Public Storage -------------------------------- */

    // Limit the number of queries
    uint256 constant MAX_QUERY_COUNT = 10;

    // Gateway contract address
    address public immutable GATEWAY;

    // chainId => height => account => storageRoot
    mapping(uint256 => mapping(uint256 => mapping(address => bytes32)))
        public approvedStorageRoots;

    // chainId => height => stateRoot
    mapping(uint256 => mapping(uint256 => bytes32)) public approvedStateRoots;

    // Contract to execute request to chainlink
    address public oracle;

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
     * @notice Error if too many queries
     */
    error TooManyQueries();

    /**
     * @notice Error if different trie roots
     */
    error DifferentTrieRoots(bytes32 root);

    /**
     * @notice Error if not exist root
     */
    error NotExsitRoot();

    /* ----------------------------- Constructor -------------------------------- */

    /**
     * @notice Constructor that sets LightClient information
     * @param _gateway The address of the Gateway contract
     * @param _oracle The address of the Chainlink contract
     */
    constructor(address _gateway, address _oracle) {
        if (_gateway == address(0)) revert ZeroAddressNotAllowed();

        GATEWAY = _gateway;
        setOracle(_oracle);

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
        if (querySize > MAX_QUERY_COUNT) revert TooManyQueries();

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
        checkRoot(proofs);

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

                    bytes32 value = getStorageValue(storageProof);
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
                    bytes32 value = getStorageValue(storageProof);
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

        for (uint i; i < responses.length; i++) {
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
        return 0;
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

    /**
     * @notice Set the oracle address
     * @param _oracle The address of the ChainlinkOracle contract
     */
    function setOracle(address _oracle) public onlyOwner {
        if (_oracle == address(0)) revert ZeroAddressNotAllowed();
        oracle = _oracle;

        emit SetOracle(_oracle);
    }

    /* ----------------------------- Internal Functions -------------------------------- */

    /**
     * @notice Validate storage proof and retrieve target data
     * @param storageProof Storage proof for verification
     * @return bytes32 Value of target storage
     */
    function getStorageValue(
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
    function checkRoot(Proof[] memory proofs) internal view {
        for (uint i = 0; i < proofs.length; i++) {
            Proof memory proof = proofs[i];
            if (
                approvedStateRoots[proof.dstChainId][proof.height] ==
                bytes32("")
            ) revert NotExsitRoot();
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
