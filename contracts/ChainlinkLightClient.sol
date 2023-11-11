// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./interfaces/ILightClient.sol";
import "./interfaces/IChainlinkLightClient.sol";
import "./interfaces/IExternalAdapter.sol";
import "./lib/TrieProofs.sol";
import "./lib/RLPReader.sol";
import "./lib/EthereumDecoder.sol";

import "./QueryType.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Chainlink LightClient
 * @notice Light Client Contract when using Chainlink Node Operator
 */

contract ChainlinkLightClient is ILightClient, IChainlinkLightClient, Ownable {
    using TrieProofs for bytes;
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    // Limit the number of queries
    uint256 constant MAX_QUERY_COUNT = 10;

    // chainId => height => account => storageRoot
    mapping(uint32 => mapping(uint256 => mapping(address => bytes32)))
        public approvedStorageRoots;

    // chainId => height => stateRoot
    mapping(uint32 => mapping(uint256 => bytes32)) public approvedStateRoots;

    // wallet => isWhitelisted
    mapping(address => bool) public whitelist;

    // Contract to execute request to chainlink
    address public oracle;

    /**
     * @notice Proof data
     * @param dstChainId Destination chain id
     * @param height Block height
     * @param root State root
     */
    struct Proof {
        uint32 dstChainId;
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

    /**
     * @notice The event that is emitted when state root is updated
     * @param chainId Destination chain id
     * @param height Block height
     * @param root State root
     */
    event UpdateStateRoot(
        uint32 indexed chainId,
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
     * @notice The event that is emit when added to whitelist
     * @param addresses Added addresses
     */
    event AddWhitelist(address[] addresses);

    /**
     * @notice The event that is emit when removed from whitelist
     * @param addresses Removed addresses
     */
    event RemoveWhitelist(address[] addresses);

    /**
     * @notice This function is intended to make Light Client do something when a query request is made (mock emit events to Oracle)
     * @param queries request query data
     */
    function requestQuery(QueryType.QueryRequest[] memory queries) external {
        require(isWhitelisted(tx.origin), "Futaba: Not whitelisted");
        uint256 querySize = queries.length;
        require(querySize <= MAX_QUERY_COUNT, "Futaba: Too many queries");

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
     * @param message response query data
     */
    function verify(
        bytes memory message
    ) public view returns (bool, bytes[] memory) {
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

            // Check if the state root corresponding to the query is stored in approvedStateRoots
            // If not saved, verify account proof
            // If stored, skip account proof verification and verify storage proof
            if (storageRoot != bytes32("")) {
                bytes memory result;
                // Storage proof verification
                for (uint j; j < storageProofSize; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    require(
                        storageRoot == storageProof.root,
                        "Futaba: verify - different trie roots"
                    );
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
                storageRoot = account.storageRoot;

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

    function updateHeader(
        QueryType.OracleResponse[] memory responses
    ) external override onlyOracle {
        for (uint i; i < responses.length; i++) {
            QueryType.OracleResponse memory response = responses[i];
            bytes32 root = approvedStateRoots[response.dstChainId][
                response.height
            ];
            if (root != bytes32("")) {
                require(
                    root == response.root,
                    "Futaba: updateHeader - different trie roots"
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
     */
    function estimateFee(
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256) {
        return 0;
    }

    /**
     * @notice Add to whitelist
     * @param addresses Addresses to add
     */
    function addToWhitelist(address[] calldata addresses) external onlyOwner {
        for (uint i = 0; i < addresses.length; i++) {
            whitelist[addresses[i]] = true;
        }

        emit AddWhitelist(addresses);
    }

    /**
     * @notice Remove from whitelist
     * @param toRemoveAddresses Addresses to remove
     */
    function removeFromWhitelist(
        address[] calldata toRemoveAddresses
    ) external onlyOwner {
        for (uint i = 0; i < toRemoveAddresses.length; i++) {
            delete whitelist[toRemoveAddresses[i]];
        }

        emit RemoveWhitelist(toRemoveAddresses);
    }

    /**
     * @notice Check if address is whitelisted
     * @param addr Address to check
     * @return bool True if whitelisted
     */
    function isWhitelisted(address addr) public view returns (bool) {
        return whitelist[addr];
    }

    function setOracle(address _oracle) public onlyOwner {
        oracle = _oracle;
    }

    function getOracle() public view returns (address) {
        return oracle;
    }

    /**
     * @notice Function to retrieve the state root stored in a specific chain and height
     * @param chainId Chain ID
     * @param height Block height
     */
    function getApprovedStateRoot(
        uint32 chainId,
        uint256 height
    ) external view returns (bytes32) {
        return approvedStateRoots[chainId][height];
    }

    /* internal function */

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
            require(
                approvedStateRoots[proof.dstChainId][proof.height] !=
                    bytes32(""),
                "Futaba: verify - not exsit root"
            );
        }
    }

    /* modifier */
    /**
     * @notice Modifier to check if the caller is the oracle
     */
    modifier onlyOracle() {
        require(msg.sender == oracle, "Futaba: onlyOracle - not oracle");
        _;
    }
}
