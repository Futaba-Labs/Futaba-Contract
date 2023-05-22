// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "../interfaces/ILightClient.sol";
import "../interfaces/ILightClientMock.sol";
import "../interfaces/IExternalAdapter.sol";
import "../lib/TrieProofs.sol";
import "../lib/RLPReader.sol";
import "../lib/EthereumDecoder.sol";

import "../QueryType.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

contract ChainlinkMock is ILightClient, ILightClientMock, Ownable {
    using TrieProofs for bytes;
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    mapping(uint32 => mapping(uint256 => mapping(address => bytes32)))
        public approvedStorageRoots;

    mapping(uint32 => mapping(uint256 => bytes32)) public approvedStateRoots;

    address public oracle;

    struct Proof {
        uint32 dstChainId;
        uint256 height;
        bytes proof;
    }
    struct AccountProof {
        bytes32 root;
        address account;
        bytes proof;
    }
    struct StorageProof {
        bytes32 root;
        bytes32 path;
        bytes proof;
    }

    event UpdateStateRoot(
        uint32 indexed chainId,
        uint256 indexed height,
        bytes32 root
    );

    event NotifyOracle(
        bytes32 indexed requestId,
        address indexed oracle,
        bytes queries
    );

    function requestQuery(QueryType.QueryRequest[] memory queries) external {
        QueryType.OracleQuery[] memory requests = new QueryType.OracleQuery[](
            queries.length
        );
        for (uint i = 0; i < queries.length; i++) {
            QueryType.QueryRequest memory q = queries[i];
            requests[i] = QueryType.OracleQuery(q.dstChainId, q.height);
        }

        bytes32 requestId = IExternalAdapter(oracle).notifyOracle(requests);

        emit NotifyOracle(requestId, oracle, abi.encode(requests));
    }

    function verify(
        bytes memory message
    ) public returns (bool, bytes[] memory) {
        Proof[] memory proofs = abi.decode(message, (Proof[]));
        bytes[] memory results = new bytes[](proofs.length);

        checkRoot(proofs);

        for (uint i = 0; i < proofs.length; i++) {
            Proof memory proof = proofs[i];
            (
                AccountProof memory accountProof,
                StorageProof[] memory storageProofs
            ) = abi.decode(proofs[i].proof, (AccountProof, StorageProof[]));
            if (
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] != bytes32("")
            ) {
                bytes memory result;
                for (uint j = 0; j < storageProofs.length; j++) {
                    StorageProof memory storageProof = storageProofs[j];
                    require(
                        approvedStorageRoots[proof.dstChainId][proof.height][
                            accountProof.account
                        ] == storageProof.root,
                        "Futaba: verify - different trie roots"
                    );
                    bytes32 value = getStorageValue(storageProof);
                    result = bytes.concat(result, value);
                }
                results[i] = result;
            } else {
                EthereumDecoder.Account memory account = EthereumDecoder
                    .toAccount(
                        accountProof.proof.verify(
                            approvedStateRoots[proof.dstChainId][proof.height],
                            keccak256(abi.encodePacked(accountProof.account))
                        )
                    );
                approvedStorageRoots[proof.dstChainId][proof.height][
                    accountProof.account
                ] = account.storageRoot;
                bytes memory result;
                for (uint j = 0; j < storageProofs.length; j++) {
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
        for (uint i = 0; i < responses.length; i++) {
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

    function estimateFee(
        QueryType.QueryRequest[] memory queries
    ) external view returns (uint256) {
        return 0;
    }

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

    function setOracle(address _oracle) public onlyOwner {
        oracle = _oracle;
    }

    function getOracle() public view returns (address) {
        return oracle;
    }

    function getApprovedStateRoot(
        uint32 chainId,
        uint256 height
    ) public view returns (bytes32) {
        return approvedStateRoots[chainId][height];
    }

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

    modifier onlyOracle() {
        require(msg.sender == oracle, "Futaba: onlyOracle - not oracle");
        _;
    }
}
